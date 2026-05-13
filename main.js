const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const newman = require("newman");
const { request: pwRequest } = require("playwright");
const openapiToPostman = require("openapi-to-postmanv2");
const yaml = require("js-yaml");

let activeRun = null;

function makeRunId(label) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `run_${date}_${time}_${label}`;
}
const {
  parseVarsJson,
  normalizeCollection,
  filterItemsByName
} = require("./lib/newmanHelpers");
const {
  sleep,
  truncateBody,
  buildVarsMap,
  substituteVars,
  ensureAuthHeader,
  normalizeHeaderArray,
  getRequestUrl,
  getQueryParams,
  getJsonBody,
  buildVariants,
  buildSchemaVariants,
  buildSecurityVariants,
  buildAuthVariants,
  validateSchema,
  buildUrlWithQuery
} = require("./lib/exploreHelpers");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile("index.html");

  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [ { role: "about" }, { type: "separator" }, { role: "quit" } ]
          }
        ]
      : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Open Help",
          click: () => {
            if (mainWindow?.webContents) {
              mainWindow.webContents.send("open-help");
            }
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("pick-output-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

const historyPath = () => path.join(app.getPath("userData"), "history.json");

function readHistory() {
  try {
    const raw = fs.readFileSync(historyPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  fs.writeFileSync(historyPath(), JSON.stringify(entries, null, 2), "utf-8");
}

ipcMain.handle("get-history", () => readHistory());

ipcMain.handle("read-file", async (_event, filePath) => {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("open-path", async (_event, filePath) => {
  try {
    if (!filePath) return { ok: false, error: "경로가 없습니다." };
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "파일을 찾을 수 없습니다." };
    }
    await shell.openPath(filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("cancel-run", async () => {
  try {
    if (!activeRun) return { ok: false, error: "실행 중이 아닙니다." };
    activeRun.cancelled = true;
    if (activeRun.type === "newman" && activeRun.runner && typeof activeRun.runner.abort === "function") {
      activeRun.runner.abort();
    }
    if (activeRun.type === "explore" && activeRun.ctx && typeof activeRun.ctx.dispose === "function") {
      await activeRun.ctx.dispose();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("load-openapi", async (_event, payload) => {
  try {
    const res = await loadOpenApiCollection(payload || {});
    return { ok: true, collection: res.collection, servers: res.servers };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});



function countRequests(collectionObj) {
  const walk = (items = []) => {
    let total = 0;
    items.forEach((it) => {
      if (Array.isArray(it.item)) total += walk(it.item);
      else total += 1;
    });
    return total;
  };
  return walk(collectionObj?.item || []);
}

function fetchUrl(url, ignoreTls, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https://");
    const client = isHttps ? https : http;
    const options = isHttps && ignoreTls ? { rejectUnauthorized: false } : undefined;
    const req = client.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, ignoreTls, timeoutMs).then(resolve).catch(reject);
        }
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.setEncoding("utf8");
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("OpenAPI request timeout"));
    });
    req.on("error", reject);
  });
}

function parseOpenApi(raw, sourceName = "openapi") {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return yaml.load(raw);
    } catch (e) {
      throw new Error(`${sourceName} 파싱 실패: ${e.message}`);
    }
  }
}
function extractOpenApiServers(openapiObj) {
  const servers = [];
  if (Array.isArray(openapiObj?.servers)) {
    openapiObj.servers.forEach((s) => {
      if (s?.url) servers.push(String(s.url));
    });
  }
  if (!servers.length && openapiObj?.host) {
    const schemes = Array.isArray(openapiObj.schemes) && openapiObj.schemes.length ? openapiObj.schemes : [ "https", "http" ];
    const basePath = openapiObj.basePath || "";
    schemes.forEach((scheme) => {
      servers.push(`${scheme}://${openapiObj.host}${basePath}`);
    });
  }
  return Array.from(new Set(servers));
}

function normalizeOpenapiVersion(obj) {
  if (!obj || typeof obj !== "object") return obj;
  // swagger 2.0 은 버전 형식이 다름 — 건드리지 않음
  if (obj.swagger !== undefined) return obj;
  if (obj.openapi !== undefined) {
    // 숫자(3.0) 또는 짧은 문자열("3.0") → "3.0.0"
    const parts = String(obj.openapi).trim().split(".");
    while (parts.length < 3) parts.push("0");
    return { ...obj, openapi: parts.join(".") };
  }
  return obj;
}

function convertOpenApiToCollection(openapiObj) {
  const normalized = normalizeOpenapiVersion(openapiObj);
  if (!normalized || (normalized.openapi === undefined && normalized.swagger === undefined)) {
    return Promise.reject(
      new Error("유효한 OpenAPI/Swagger 스펙이 아닙니다. openapi 또는 swagger 버전 필드가 없습니다.")
    );
  }
  return new Promise((resolve, reject) => {
    openapiToPostman.convertV2(
      { type: "json", data: normalized },
      { folderStrategy: "Tags" },
      (err, result) => {
        if (err) return reject(err);
        if (!result || !result.result || !result.output || !result.output.length) {
          return reject(new Error("OpenAPI 변환 실패"));
        }
        resolve(result.output[0].data);
      }
    );
  });
}

async function loadOpenApiCollection({ openapiPath, openapiUrl, ignoreTls }) {
  let raw;
  if (openapiUrl) {
    raw = await fetchUrl(openapiUrl, ignoreTls);
  } else if (openapiPath) {
    raw = fs.readFileSync(openapiPath, "utf-8");
  } else {
    throw new Error("OpenAPI 파일 또는 URL이 필요합니다.");
  }
  const openapiObj = parseOpenApi(raw, "OpenAPI");
  const servers = extractOpenApiServers(openapiObj);
  const collectionObj = await convertOpenApiToCollection(openapiObj);
  const normalized = normalizeCollection(collectionObj);
  if (!normalized) throw new Error("OpenAPI 변환 결과가 유효하지 않습니다.");
  return { collection: normalized, servers, openapiObj };
}

async function loadCollectionObject({
  collectionPath,
  openapiPath,
  openapiUrl,
  openapiIgnoreTls,
  useSelectedRequests,
  selectedRequestNames,
  failedOnly,
  failedRequestNames
}) {
  let collectionObj;
  if (openapiPath || openapiUrl) {
    const res = await loadOpenApiCollection({ openapiPath, openapiUrl, ignoreTls: openapiIgnoreTls });
    collectionObj = res.collection;
    collectionObj.__openapi = res.openapiObj;
  } else if (collectionPath) {
    const raw = fs.readFileSync(collectionPath, "utf-8");
    const obj = normalizeCollection(JSON.parse(raw));
    if (!obj) throw new Error("컬렉션 JSON이 유효하지 않습니다.");
    collectionObj = obj;
  } else {
    throw new Error("컬렉션 또는 OpenAPI가 필요합니다.");
  }

  if (failedOnly && Array.isArray(failedRequestNames) && failedRequestNames.length) {
    const nameSet = new Set(failedRequestNames);
    const filtered = filterItemsByName(collectionObj.item || [], nameSet);
    if (!filtered.length) throw new Error("컬렉션에서 실패 요청을 찾지 못했습니다.");
    return { ...collectionObj, item: filtered };
  }

  if (useSelectedRequests && Array.isArray(selectedRequestNames)) {
    const nameSet = new Set(selectedRequestNames);
    if (nameSet.size === 0) throw new Error("선택된 요청이 없습니다.");
    const filtered = filterItemsByName(collectionObj.item || [], nameSet);
    if (!filtered.length) throw new Error("선택된 요청을 찾지 못했습니다.");
    return { ...collectionObj, item: filtered };
  }

  return collectionObj;
}

function normalizePathForMatch(urlPath, serverUrl) {
  if (!serverUrl) return urlPath;
  try {
    const server = new URL(serverUrl);
    const basePath = server.pathname.endsWith("/") ? server.pathname.slice(0, -1) : server.pathname;
    if (basePath && urlPath.startsWith(basePath)) {
      const next = urlPath.slice(basePath.length);
      return next.startsWith("/") ? next : "/" + next;
    }
  } catch {
    return urlPath;
  }
  return urlPath;
}

function buildPathRegex(pathTemplate) {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\{[^/]+\\}/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
}

function buildSchemaIndex(openapiObj) {
  if (!openapiObj || !openapiObj.paths) return [];
  const entries = [];
  const basePath = openapiObj.basePath || "";
  Object.entries(openapiObj.paths).forEach(([pathKey, pathItem]) => {
    if (!pathItem) return;
    const mergedPath = basePath && !pathKey.startsWith(basePath) ? basePath + pathKey : pathKey;
    Object.entries(pathItem).forEach(([method, op]) => {
      const m = method.toUpperCase();
      if (!op || [ "PARAMETERS", "SUMMARY" ].includes(m)) return;
      let requestSchema = null;
      if (op.requestBody?.content) {
        const jsonContent = op.requestBody.content["application/json"] || op.requestBody.content["application/*+json"];
        requestSchema = jsonContent?.schema || null;
      }
      if (!requestSchema && Array.isArray(op.parameters)) {
        const bodyParam = op.parameters.find((p) => p.in === "body" && p.schema);
        requestSchema = bodyParam?.schema || null;
      }
      const responses = op.responses || {};
      const responseSchemas = {};
      Object.entries(responses).forEach(([code, info]) => {
        if (!info) return;
        if (info.content) {
          const jsonContent = info.content["application/json"] || info.content["application/*+json"];
          if (jsonContent?.schema) responseSchemas[code] = jsonContent.schema;
        } else if (info.schema) {
          responseSchemas[code] = info.schema;
        }
      });
      const staticScore = (mergedPath.match(/\{[^/]+\}/g) || []).length * -1 + mergedPath.length;
      entries.push({
        method: m,
        pathTemplate: mergedPath,
        regex: buildPathRegex(mergedPath),
        staticScore,
        requestSchema,
        responseSchemas
      });
    });
  });
  return entries;
}

function findSchemaEntry(schemaIndex, method, urlPath) {
  const matches = schemaIndex.filter((e) => e.method === method && e.regex.test(urlPath));
  if (!matches.length) return null;
  matches.sort((a, b) => b.staticScore - a.staticScore);
  return matches[0];
}

function resolveResponseSchema(entry, status) {
  if (!entry || !entry.responseSchemas) return null;
  const code = String(status || "");
  if (entry.responseSchemas[code]) return entry.responseSchemas[code];
  if (/^2\d\d$/.test(code)) {
    const any2xx = Object.keys(entry.responseSchemas).find((k) => /^2\d\d$/.test(k));
    if (any2xx) return entry.responseSchemas[any2xx];
  }
  if (entry.responseSchemas.default) return entry.responseSchemas.default;
  return null;
}

function computeVariantCap(method, maxVariants) {
  if ([ "POST", "PUT", "PATCH", "DELETE" ].includes(method)) return Math.min(maxVariants, 2);
  if ([ "GET", "HEAD" ].includes(method)) return Math.min(maxVariants, 3);
  return Math.min(maxVariants, 2);
}

ipcMain.handle("run-newman", async (_event, payload) => {
  const {
    collectionPath,
    openapiPath,
    openapiUrl,
    openapiIgnoreTls,
    openapiServerUrl,
    environmentPath,
    ip,
    token,
    extraVarsJson,
    selectedRequestNames,
    useSelectedRequests,
    outputDir,
    reporters,
    iterationCount,
    timeoutRequest,
    delayRequest,
    bail,
    newmanIgnoreTls
  } = payload;

  if (!collectionPath && !openapiPath && !openapiUrl) {
    return { ok: false, error: "컬렉션 또는 OpenAPI가 필요합니다." };
  }
  if (!reporters || !reporters.length) {
    return { ok: false, error: "리포터를 최소 1개 선택하세요." };
  }
  mainWindow?.webContents?.send("run-log", "[newman] loading collection...");

  const envVars = [];
  if (ip) envVars.push({ key: "ip", value: ip, enabled: true });
  if (token) envVars.push({ key: "token", value: token, enabled: true });
  if (openapiServerUrl) envVars.push({ key: "baseUrl", value: openapiServerUrl, enabled: true });

  if (extraVarsJson) {
    try {
      const parsed = JSON.parse(extraVarsJson);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (!item) return;
          const key = item.key || item["key"];
          const value = item.value || item["value"];
          if (key) envVars.push({ key: String(key), value: String(value), enabled: true });
        });
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([key, value]) => {
          envVars.push({ key: String(key), value: String(value), enabled: true });
        });
      }
    } catch (e) {
      return { ok: false, error: `extra vars JSON parse error: ${e.message}` };
    }
  }

  const effectiveOpenapiIgnoreTls = !!openapiIgnoreTls || !!newmanIgnoreTls;

  let baseCollection;
  try {
    baseCollection = await loadCollectionObject({
      collectionPath,
      openapiPath,
      openapiUrl,
      openapiIgnoreTls: effectiveOpenapiIgnoreTls,
      useSelectedRequests,
      selectedRequestNames
    });
    if (openapiServerUrl) {
      mainWindow?.webContents?.send("run-log", `[newman] baseUrl=${openapiServerUrl}`);
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  const totalRequests = countRequests(baseCollection) * (iterationCount || 1);
  let currentRequests = 0;
  const emitProgress = (label) => {
    mainWindow.webContents.send('run-progress', { type: 'newman', label, current: currentRequests, total: totalRequests });
  };

  const runOnce = (label, overrides) => {
    activeRun = { type: "newman", cancelled: false, runner: null };
    currentRequests = 0;
    emitProgress(label);
    const runId = makeRunId(label);
    const reportJson = path.join(outputDir, `${runId}.json`);
    const reportHtml = path.join(outputDir, `${runId}.html`);
    const logPath = path.join(outputDir, `${runId}.log.txt`);
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const startedAt = new Date().toISOString();
    const emitLog = (line) => {
      logStream.write(line + "\n");
      mainWindow.webContents.send("run-log", line);
    };
    emitLog(`[start][${label}] preparing...`);

    const mergedVars = [ ...envVars ];
    overrides.forEach((item) => {
      const idx = mergedVars.findIndex((v) => v.key === item.key);
      if (idx >= 0) mergedVars[idx] = item;
      else mergedVars.push(item);
    });

    const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    if (newmanIgnoreTls) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    return new Promise((resolve) => {
      const runner = newman.run(
        {
          collection: baseCollection,
          environment: environmentPath || undefined,
          reporters,
          reporter: {
            json: reporters.includes("json") ? { export: reportJson } : undefined,
            html: reporters.includes("html") ? { export: reportHtml } : undefined
          },
          envVar: mergedVars,
          iterationCount: iterationCount || 1,
          timeoutRequest: timeoutRequest || 300000,
          delayRequest: delayRequest || 0,
          bail: bail === true,
          insecure: !!newmanIgnoreTls
        },
        (err, summary) => {
          if (newmanIgnoreTls) {
            if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
          }
          logStream.end();
          const wasCancelled = activeRun?.cancelled === true;
          activeRun = null;
          const jsonExists = fs.existsSync(reportJson);
          const htmlExists = fs.existsSync(reportHtml);
          const endedAt = new Date().toISOString();
          const history = readHistory();
          history.unshift({
            id: runId,
            collectionPath,
            environmentPath,
            outputDir,
            reportJson: jsonExists ? reportJson : null,
            reportHtml: htmlExists ? reportHtml : null,
            logPath,
            startedAt,
            endedAt,
            ok: !err && !wasCancelled,
            error: wasCancelled ? "cancelled" : (err ? String(err.message || err) : null),
            label
          });
          writeHistory(history.slice(0, 200));

          if (err || wasCancelled) {
            return resolve({
              ok: false,
              error: wasCancelled ? "cancelled" : (err.message || String(err)),
              reportJson: jsonExists ? reportJson : null,
              reportHtml: htmlExists ? reportHtml : null,
              logPath
            });
          }

          return resolve({
            ok: true,
            stats: summary.run.stats,
            reportJson: jsonExists ? reportJson : null,
            reportHtml: htmlExists ? reportHtml : null,
            logPath
          });
        }
      );
      activeRun.runner = runner;
      const startTimer = setTimeout(() => {
        emitLog(`[start][${label}] still waiting for start...`);
      }, 5000);
      runner
        .on("start", () => {
          clearTimeout(startTimer);
          emitLog(`[start][${label}] running newman...`);
        })
         .on("request", (_err, args) => {
          if (!args) return;
          currentRequests += 1;
          emitProgress(label);
          const method = args.item?.request?.method || "-";
          const url = args.request?.url?.toString?.() || args.item?.request?.url?.raw || "-";
          emitLog(`[${label}] ${method} ${url}`);
        })
        .on("response", (_err, args) => {
          if (!args) return;
          const code = args.response?.code;
          const name = args.item?.name || "";
          emitLog(`[${label}] response ${code} ${name}`);
        })
        .on("assertion", (_err, args) => {
          if (!args) return;
          if (args.error) {
            emitLog(`[${label}] assertion failed: ${args.error.message}`);
          }
        });
    });
  };

  return runOnce("valid", []);
});

function readEnvVars(environmentPath) {
  if (!environmentPath) return [];
  try {
    const raw = fs.readFileSync(environmentPath, "utf-8");
    const env = JSON.parse(raw);
    const values = Array.isArray(env.values) ? env.values : (Array.isArray(env.variable) ? env.variable : []);
    return values
      .filter((v) => v && v.enabled !== false)
      .map((v) => ({ key: String(v.key || ""), value: String(v.value || ""), enabled: true }));
  } catch {
    return [];
  }
}

function injectOpenapiExamples(req, schemaEntry) {
  if (!schemaEntry || !req || !req.body || req.body.mode !== "raw") return req;
  const reqBodySchema = schemaEntry.requestBody?.content?.["application/json"]?.schema;
  if (!reqBodySchema || !reqBodySchema.properties) return req;

  let existing = {};
  try { existing = JSON.parse(req.body.raw || "{}") || {}; } catch { return req; }
  if (typeof existing !== "object" || Array.isArray(existing)) return req;

  const merged = { ...existing };
  for (const [key, prop] of Object.entries(reqBodySchema.properties)) {
    if (Object.prototype.hasOwnProperty.call(merged, key) && merged[key] !== null && merged[key] !== "") continue;
    if (prop.example !== undefined) merged[key] = prop.example;
    else if (prop.default !== undefined) merged[key] = prop.default;
  }

  return { ...req, body: { ...req.body, raw: JSON.stringify(merged) } };
}

function generateExploreHtml(report) {
  const { summary, results, startedAt, endedAt } = report;
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // status code distribution
  const groups = { "2xx": 0, "4xx": 0, "5xx": 0, other: 0 };
  results.forEach((r) => {
    const c = r.status || 0;
    if (c >= 200 && c < 300) groups["2xx"]++;
    else if (c >= 400 && c < 500) groups["4xx"]++;
    else if (c >= 500 && c < 600) groups["5xx"]++;
    else groups.other++;
  });
  const maxGroup = Math.max(...Object.values(groups), 1);

  const statusColors = { "2xx": "#2dce89", "4xx": "#fb6340", "5xx": "#f5365c", other: "#adb5bd" };
  const statusBarSvg = Object.entries(groups).map(([label, count]) => {
    const pct = Math.round((count / maxGroup) * 160);
    return `<g><rect x="0" y="0" width="${pct}" height="22" rx="4" fill="${statusColors[label]}"/><text x="${pct + 6}" y="16" font-size="13" fill="#e2e8f0">${count}</text><text x="-38" y="16" font-size="12" fill="#94a3b8" text-anchor="end">${label}</text></g>`;
  }).map((el, i) => `<g transform="translate(44,${i * 32})">${el}</g>`).join("");

  // variant type distribution
  const vTypes = summary.variantCountByType || {};
  const vEntries = Object.entries(vTypes).filter(([, v]) => v > 0);
  const maxV = Math.max(...vEntries.map(([, v]) => v), 1);
  const vColors = { body: "#5e72e4", query: "#11cdef", method: "#fb6340", schema: "#f4f172", security: "#f5365c", auth: "#fd7e14", custom: "#adb5bd" };
  const variantBarSvg = vEntries.map(([label, count]) => {
    const pct = Math.round((count / maxV) * 160);
    return `<g><rect x="0" y="0" width="${pct}" height="22" rx="4" fill="${vColors[label] || "#adb5bd"}"/><text x="${pct + 6}" y="16" font-size="13" fill="#e2e8f0">${count}</text><text x="-46" y="16" font-size="12" fill="#94a3b8" text-anchor="end">${label}</text></g>`;
  }).map((el, i) => `<g transform="translate(56,${i * 32})">${el}</g>`).join("");

  // base responses indexed by request name for diff
  const baseByName = {};
  results.filter((r) => r.variant === "base").forEach((r) => { baseByName[r.name] = r; });

  const rows = results.map((r) => {
    const isSec = r.variantType === "security" || (r.securityWarnings && r.securityWarnings.length);
    const isAuth = r.variantType === "auth" || (r.authWarnings && r.authWarnings.length);
    const isFail = r.error || (r.status >= 400);
    const isBase = r.variant === "base";
    const rowClass = isSec ? "row-sec" : isAuth ? "row-auth" : isFail && !isBase ? "row-fail" : isBase ? "row-base" : "";

    const tags = [];
    if (r.isMethodVariant || r.variantType === "method") tags.push("Method");
    if (r.schemaErrors && r.schemaErrors.length) tags.push("Schema");
    if (r.semanticErrors && r.semanticErrors.length) tags.push("Semantic");
    if (isSec) tags.push("⚠ Security");
    if (isAuth) tags.push("Auth");
    const tagHtml = tags.map((t) => `<span class="tag ${t.startsWith("⚠") ? "tag-sec" : ""}">${esc(t)}</span>`).join(" ");

    // diff: show base vs variant body
    let diffHtml = "";
    if (!isBase && isFail && baseByName[r.name]) {
      const base = baseByName[r.name];
      const baseBody = esc(base.response?.body || "").slice(0, 400);
      const varBody = esc(r.response?.body || "").slice(0, 400);
      const reqBody = esc(r.request?.body || "").slice(0, 400);
      diffHtml = `<tr class="diff-row"><td colspan="7"><details><summary>diff 보기 (base ${base.status} → ${r.status || "ERR"})</summary><div class="diff-grid"><div><div class="diff-label">base 응답</div><pre>${baseBody || "(empty)"}</pre></div><div><div class="diff-label">variant 요청 body</div><pre>${reqBody || "(empty)"}</pre><div class="diff-label" style="margin-top:8px">variant 응답</div><pre>${varBody || "(empty)"}</pre></div></div></details></td></tr>`;
    }

    return `<tr class="${rowClass}">
      <td>${esc(r.name)}</td>
      <td>${esc(r.variant)} ${tagHtml}</td>
      <td>${esc(r.method)}</td>
      <td class="status-cell ${r.status >= 500 ? "s5" : r.status >= 400 ? "s4" : r.status >= 200 ? "s2" : ""}">${esc(r.status)}</td>
      <td>${esc(r.durationMs)}</td>
      <td>${esc(r.error || "")}</td>
      <td>${r.schemaErrors?.length ? `<span class="schema-err">${r.schemaErrors.map(esc).join("<br>")}</span>` : ""}</td>
    </tr>${diffHtml}`;
  }).join("");

  const svgH1 = Math.max(Object.keys(groups).length * 32 + 8, 40);
  const svgH2 = Math.max(vEntries.length * 32 + 8, 40);

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Exploratory Report — ${esc(startedAt)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;min-height:100vh}
h2{font-size:20px;font-weight:700;margin-bottom:4px;color:#f1f5f9}
.subtitle{font-size:12px;color:#64748b;margin-bottom:20px}
.cards{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 20px;min-width:110px;text-align:center}
.card .val{font-size:26px;font-weight:700;color:#f1f5f9}
.card .lbl{font-size:11px;color:#64748b;margin-top:2px}
.card.warn .val{color:#fb6340}
.card.danger .val{color:#f5365c}
.card.ok .val{color:#2dce89}
.charts{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:28px}
.chart-box{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px 20px}
.chart-box h3{font-size:13px;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em}
svg text{font-family:'Segoe UI',Arial,sans-serif}
table{width:100%;border-collapse:collapse;font-size:12px;background:#1e293b;border-radius:10px;overflow:hidden}
th{background:#273549;color:#94a3b8;padding:8px 10px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td{padding:7px 10px;border-bottom:1px solid #1e293b;vertical-align:top;color:#cbd5e1}
tr:last-child td{border-bottom:none}
.row-base td{background:#162032}
.row-fail td{background:#1f1520}
.row-sec td{background:#200d0d}
.row-auth td{background:#1a1a0e}
.tag{display:inline-block;padding:1px 7px;border-radius:999px;background:#1e3a5f;color:#7dd3fc;font-size:10px;font-weight:600;margin-left:3px}
.tag-sec{background:#3b0a0a;color:#fca5a5}
.status-cell{font-weight:700}
.s2{color:#2dce89}
.s4{color:#fb6340}
.s5{color:#f5365c}
.schema-err{color:#fde68a;font-size:11px}
details summary{cursor:pointer;color:#7dd3fc;font-size:11px;padding:4px 0;user-select:none}
details[open] summary{margin-bottom:8px}
.diff-row td{background:#0f172a;padding:10px 14px}
.diff-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.diff-label{font-size:11px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
pre{background:#162032;border:1px solid #334155;border-radius:6px;padding:8px;font-size:11px;color:#94a3b8;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
</style>
</head>
<body>
<h2>Exploratory Report</h2>
<div class="subtitle">${esc(startedAt)} → ${esc(endedAt)} &nbsp;·&nbsp; mode: ${esc(summary.ruleMode)} &nbsp;·&nbsp; maxVariants: ${esc(summary.maxVariants)} &nbsp;·&nbsp; delay: ${esc(summary.delayMs)}ms</div>
<div class="cards">
  <div class="card ok"><div class="val">${summary.total}</div><div class="lbl">Total</div></div>
  <div class="card ${summary.failed > 0 ? "danger" : "ok"}"><div class="val">${summary.failed}</div><div class="lbl">Failed</div></div>
  <div class="card"><div class="val">${summary.total - summary.failed}</div><div class="lbl">Passed</div></div>
  <div class="card ${summary.schemaFailCount > 0 ? "warn" : ""}"><div class="val">${summary.schemaFailCount}</div><div class="lbl">Schema Fail</div></div>
  <div class="card ${summary.semanticFailCount > 0 ? "warn" : ""}"><div class="val">${summary.semanticFailCount}</div><div class="lbl">Semantic Fail</div></div>
  <div class="card ${summary.securityWarnCount > 0 ? "danger" : ""}"><div class="val">${summary.securityWarnCount}</div><div class="lbl">Security Warn</div></div>
  <div class="card ${summary.authWarnCount > 0 ? "warn" : ""}"><div class="val">${summary.authWarnCount}</div><div class="lbl">Auth Warn</div></div>
</div>
<div class="charts">
  <div class="chart-box">
    <h3>Status Code 분포</h3>
    <svg width="220" height="${svgH1}" overflow="visible">${statusBarSvg}</svg>
  </div>
  ${vEntries.length ? `<div class="chart-box">
    <h3>Variant 타입 분포</h3>
    <svg width="240" height="${svgH2}" overflow="visible">${variantBarSvg}</svg>
  </div>` : ""}
</div>
<table>
<thead><tr><th>Name</th><th>Variant</th><th>Method</th><th>Status</th><th>ms</th><th>Error</th><th>Schema</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

ipcMain.handle("run-exploratory", async (_event, payload) => {
  const {
    collectionPath,
    openapiPath,
    openapiUrl,
    openapiIgnoreTls,
    openapiServerUrl,
    environmentPath,
    ip,
    token,
    extraVarsJson,
    selectedRequestNames,
    useSelectedRequests,
    outputDir,
    variantsPerRequest,
    exploreDelayMs,
    exploreRuleMode,
    exploreCustomJson,
    ignoreTls,
    failedOnly,
    failedRequestNames,
    exploreInclude,
    exploreExclude,
    methodVariants,
    hardMode,
    semanticMode,
    useOpenapiExamples
  } = payload;

  if (!collectionPath && !openapiPath && !openapiUrl) {
    return { ok: false, error: "컬렉션 또는 OpenAPI가 필요합니다." };
  }
  if (!outputDir) return { ok: false, error: "출력 폴더가 필요합니다." };

  const envVars = readEnvVars(environmentPath);
  const extraVars = extraVarsJson ? parseVarsJson(extraVarsJson) : [];
  if (openapiServerUrl) extraVars.push({ key: "baseUrl", value: openapiServerUrl, enabled: true });
  const varsMap = buildVarsMap({ envVars, extraVars, ip, token });

  const effectiveOpenapiIgnoreTls = !!openapiIgnoreTls || !!ignoreTls;

  let collectionObj;
  try {
    mainWindow?.webContents?.send("run-log", "[explore] loading collection...");
    collectionObj = await loadCollectionObject({
      collectionPath,
      openapiPath,
      openapiUrl,
      openapiIgnoreTls: effectiveOpenapiIgnoreTls,
      useSelectedRequests,
      selectedRequestNames,
      failedOnly,
      failedRequestNames
    });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  let items = collectionObj.item || [];
  const schemaIndex = buildSchemaIndex(collectionObj.__openapi);

  const flattenItems = (arr, out = [], prefix = "") => {
    arr.forEach((it) => {
      if (Array.isArray(it.item)) {
        const nextPrefix = it.name ? `${prefix}${it.name}/` : prefix;
        flattenItems(it.item, out, nextPrefix);
      } else {
        const name = it?.name || "Request";
        const fullName = prefix ? `${prefix}${name}` : name;
        out.push({ ...it, _fullName: fullName });
      }
    });
    return out;
  };

  const requests = flattenItems(items);
  const parseFilter = (value) =>
    String(value || "")
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  const includeFilters = parseFilter(exploreInclude);
  const excludeFilters = parseFilter(exploreExclude);
  const allowMethodVariants = methodVariants !== false;
  const buildMethodVariants = (methodName) => {
    const list = [];
    if (methodName === "GET" || methodName === "HEAD") {
      list.push({ method: "POST", label: `method:${methodName}->POST`, dropBody: true });
    } else if ([ "POST", "PUT", "PATCH" ].includes(methodName)) {
      list.push({ method: "GET", label: `method:${methodName}->GET`, dropBody: true });
      list.push({ method: "DELETE", label: `method:${methodName}->DELETE`, dropBody: true });
    } else if (methodName === "DELETE") {
      list.push({ method: "GET", label: `method:${methodName}->GET`, dropBody: true });
    }
    return list;
  };
  const matchAny = (name, filters) =>
    filters.some((f) => name.toLowerCase().includes(f.toLowerCase()));
  const filteredRequests = requests.filter((req) => {
    const name = req._fullName || req.name || "";
    if (includeFilters.length && !matchAny(name, includeFilters)) return false;
    if (excludeFilters.length && matchAny(name, excludeFilters)) return false;
    return true;
  });
  const runId = makeRunId("explore");
  const reportJson = path.join(outputDir, `${runId}.json`);
  const logPath = path.join(outputDir, `${runId}.log.txt`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const startedAt = new Date().toISOString();
  const emitLog = (line) => {
    logStream.write(line + "\n");
    mainWindow.webContents.send("run-log", line);
  };
  if (!filteredRequests.length) {
    emitLog("[explore] no requests matched filters");
    return { ok: false, error: "No requests match explore filters." };
  }
  emitLog(`[explore] targets: ${filteredRequests.length}`);

  let progressTotal = 0;
  let progressCurrent = 0;
  const emitProgress = () => {
    mainWindow.webContents.send("run-progress", { type: "explore", current: progressCurrent, total: progressTotal });
  };
  emitProgress();

  const maxVariants = Math.max(1, Math.min(5, Number(variantsPerRequest || 3)));
  const delayMs = Number.isFinite(Number(exploreDelayMs)) ? Number(exploreDelayMs) : 300;
  const ruleMode = [ "basic", "extended", "custom" ].includes(exploreRuleMode) ? exploreRuleMode : "basic";
  let customVariants = [];
  if (ruleMode === "custom" && exploreCustomJson) {
    try {
      const parsed = JSON.parse(exploreCustomJson);
      if (Array.isArray(parsed)) customVariants = parsed;
    } catch (e) {
      return { ok: false, error: `Custom variants JSON parse error: ${e.message}` };
    }
  }

  const results = [];
  let failed = 0;
  let schemaCheckedCount = 0;
  let schemaFailCount = 0;
  let semanticFailCount = 0;
  let securityWarnCount = 0;
  let authWarnCount = 0;
  const variantCountByType = { body: 0, query: 0, method: 0, schema: 0, custom: 0, security: 0, auth: 0 };

  const ctx = await pwRequest.newContext({ ignoreHTTPSErrors: !!ignoreTls });
  activeRun = { type: "explore", cancelled: false, ctx };
  emitLog("[explore] starting exploratory api test...");
  const prevExploreTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (ignoreTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  for (const item of filteredRequests) {
    if (activeRun?.cancelled) break;
    emitLog(`[explore] running ${item._fullName || item.name || "Request"}...`);
    const method = (item?.request?.method || "GET").toUpperCase();
    const headers = normalizeHeaderArray(item?.request?.header, varsMap);
    const headersWithAuth = ensureAuthHeader(headers, token);
    const urlRaw = getRequestUrl(item?.request, varsMap, ip);
    const queryParams = getQueryParams(item?.request, varsMap);

    // resolve schemaEntry first so example injection can use it
    const baseUrl = buildUrlWithQuery(urlRaw, queryParams);
    let urlPath = "";
    try {
      urlPath = new URL(baseUrl).pathname || "";
    } catch {
      urlPath = "";
    }
    const normalizedPath = normalizePathForMatch(urlPath, openapiServerUrl);
    const schemaEntry = schemaIndex.length ? findSchemaEntry(schemaIndex, method, normalizedPath || urlPath) : null;

    const effectiveReq = useOpenapiExamples && schemaEntry
      ? injectOpenapiExamples(item?.request, schemaEntry)
      : item?.request;
    const bodyInfo = getJsonBody(effectiveReq, varsMap);

    const baseBody = bodyInfo?.raw || "";
    const variantCap = computeVariantCap(method, maxVariants);
    const baseVariants = buildVariants(
      { queryParams, bodyJson: bodyInfo, mode: ruleMode, customVariants },
      maxVariants
    );
    const schemaVariants =
      schemaEntry?.requestSchema && bodyInfo?.json
        ? buildSchemaVariants(schemaEntry.requestSchema, bodyInfo.json, maxVariants)
        : [];
    const securityVariants = buildSecurityVariants(
      { queryParams, bodyJson: bodyInfo, schema: schemaEntry?.requestSchema, mode: hardMode ? "hard" : "basic" },
      hardMode ? 4 : 2
    );
    const variants = [ ...baseVariants, ...schemaVariants, ...securityVariants ].slice(0, variantCap);

    const methodVariants = allowMethodVariants ? buildMethodVariants(method) : [];
    const authVariantList = buildAuthVariants(token, 2);
    progressTotal += 1 + variants.length + methodVariants.length + authVariantList.length;
    emitProgress();

    const runOnce = async (
      variantLabel,
      url,
      bodyJson,
      methodOverride,
      dropBody = false,
      variantType = "base",
      schemaContext = schemaEntry,
      headersOverride = null
    ) => {
      if (activeRun?.cancelled) return;
      const methodToUse = methodOverride || method;
      const requestBody = dropBody
        ? ""
        : bodyJson
          ? JSON.stringify(bodyJson)
          : bodyInfo?.json
            ? JSON.stringify(bodyInfo.json)
            : baseBody;
      const effectiveHeaders = headersOverride !== null ? headersOverride : headersWithAuth;
      const headersFinal = requestBody
        ? { "Content-Type": "application/json", ...effectiveHeaders }
        : effectiveHeaders;
      const started = Date.now();
      let status = 0;
      let responseText = "";
      let error = null;
      let schemaErrors = [];
      let semanticErrors = [];
      let securityWarnings = [];
      let authWarnings = [];
      let attempt = 0;
      while (attempt < 2) {
        try {
          const res = await ctx.fetch(url, {
            method: methodToUse,
            headers: headersFinal,
            data: requestBody || undefined
          });
          status = res.status();
          const rawText = await res.text();
          responseText = truncateBody(rawText);
          if (schemaContext) {
            const responseSchema = resolveResponseSchema(schemaContext, status);
            if (responseSchema) {
              schemaCheckedCount += 1;
              try {
                const parsed = JSON.parse(rawText);
                const errors = validateSchema(responseSchema, parsed);
                if (errors.length) {
                  schemaFailCount += 1;
                  schemaErrors = errors;
                }
              } catch (e) {
                schemaFailCount += 1;
                schemaErrors = [ "invalid json" ];
              }
            }
          }
          if (semanticMode && semanticMode !== "openapi") {
            if (semanticMode === "expect_401" && status !== 401) {
              semanticFailCount += 1;
              semanticErrors = [ `status:${status}` ];
            } else if (semanticMode === "expect_404" && status !== 404) {
              semanticFailCount += 1;
              semanticErrors = [ `status:${status}` ];
            } else if (semanticMode === "allow_5xx") {
              // allow 5xx without semantic failure
            }
          } else if (schemaContext && schemaContext.responseSchemas) {
            const allowed = Object.keys(schemaContext.responseSchemas || {});
            const isAllowed =
              allowed.includes(String(status)) ||
              (allowed.some((k) => /^2\d\d$/.test(k)) && status >= 200 && status < 300) ||
              allowed.includes("default");
            if (!isAllowed && !(semanticMode === "allow_5xx" && status >= 500)) {
              semanticFailCount += 1;
              semanticErrors = [ `status:${status}` ];
            }
          }
          if (variantType === "security" && status >= 200 && status < 300) {
            securityWarnCount += 1;
            securityWarnings = [ "security:2xx" ];
          }
          if (variantType === "auth" && status >= 200 && status < 300) {
            authWarnCount += 1;
            authWarnings = [ "auth:2xx" ];
          }
          if (status >= 500 && attempt === 0) {
            attempt += 1;
            await sleep(200);
            continue;
          }
          break;
        } catch (e) {
          error = e.message || String(e);
          if (attempt === 0) {
            attempt += 1;
            await sleep(200);
            continue;
          }
          break;
        }
      }
      const durationMs = Date.now() - started;
      if (variantType === "auth") {
        if (error || status >= 500) failed += 1;
      } else {
        if (error || status >= 400) failed += 1;
      }
      const isMethodVariant = String(variantLabel || "").startsWith("method:");
      if (variantCountByType[variantType] !== undefined) {
        variantCountByType[variantType] += 1;
      }
      results.push({
        name: item.name || "Request",
        variant: variantLabel,
        isMethodVariant,
        variantType,
        method: methodToUse,
        url,
        status,
        durationMs,
        error,
        schemaErrors,
        semanticErrors,
        securityWarnings,
        authWarnings,
        request: {
          headers: effectiveHeaders,
          body: truncateBody(requestBody)
        },
        response: {
          status,
          body: responseText
        }
      });
      emitLog(`[explore] ${methodToUse} ${url} => ${status || "ERR"} ${variantLabel}`);
      progressCurrent += 1;
      emitProgress();
    };

    if (activeRun?.cancelled) break;
    await runOnce("base", baseUrl, null, null, false, "base");
    for (const variant of variants) {
      if (activeRun?.cancelled) break;
      if (variant.query) {
        const vUrl = buildUrlWithQuery(urlRaw, variant.query);
        await runOnce(variant.label, vUrl, null, null, false, variant.type || "query");
      } else if (variant.body) {
        await runOnce(variant.label, baseUrl, variant.body, null, false, variant.type || "body");
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    if (methodVariants.length) {
      if (activeRun?.cancelled) break;
      for (const mv of methodVariants) {
        await runOnce(mv.label, baseUrl, null, mv.method, mv.dropBody, "method");
        if (delayMs > 0) await sleep(delayMs);
      }
    }

    if (authVariantList.length) {
      if (activeRun?.cancelled) break;
      for (const av of authVariantList) {
        if (activeRun?.cancelled) break;
        const authHeaders = { ...headersWithAuth };
        if (av.authOverride === "none") {
          delete authHeaders.Authorization;
          delete authHeaders.authorization;
        } else {
          authHeaders.Authorization = av.authOverride;
        }
        await runOnce(av.label, baseUrl, null, null, false, "auth", schemaEntry, authHeaders);
        if (delayMs > 0) await sleep(delayMs);
      }
    }
  }

  await ctx.dispose();
  const wasCancelled = activeRun?.cancelled === true;
  activeRun = null;
  if (ignoreTls) {
    if (prevExploreTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevExploreTls;
  }
  logStream.end();


  const endedAt = new Date().toISOString();
  const summary = {
    total: results.length,
    failed,
    ok: results.length - failed,
    schemaCheckedCount,
    schemaFailCount,
    semanticFailCount,
    securityWarnCount,
    authWarnCount,
    variantCountByType
  };

  const report = {
    type: "explore",
    startedAt,
    endedAt,
    summary: { ...summary, ruleMode, maxVariants, delayMs },
    results
  };

  fs.writeFileSync(reportJson, JSON.stringify(report, null, 2), "utf-8");
  const reportHtml = path.join(outputDir, `${runId}.html`);
  const html = generateExploreHtml(report);
  fs.writeFileSync(reportHtml, html, "utf-8");

  const history = readHistory();
  history.unshift({
    id: runId,
    collectionPath,
    environmentPath,
    outputDir,
    reportJson,
    reportHtml,
    logPath,
    startedAt,
    endedAt,
    ok: failed === 0 && !wasCancelled,
    error: wasCancelled ? "cancelled" : null,
    label: "explore"
  });
  writeHistory(history.slice(0, 200));

  return {
    ok: failed === 0 && !wasCancelled,
    error: wasCancelled ? "cancelled" : null,
    reportJson,
    logPath,
    summary
  };
});



























