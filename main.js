const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const newman = require("newman");
const { request: pwRequest } = require("playwright");
const openapiToPostman = require("openapi-to-postmanv2");
const yaml = require("js-yaml");
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
    await shell.openPath(filePath);
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

function readEnvVars(environmentPath) {
  if (!environmentPath) return [];
  try {
    const raw = fs.readFileSync(environmentPath, "utf-8");
    const obj = JSON.parse(raw);
    const values = Array.isArray(obj?.values) ? obj.values : Array.isArray(obj?.variables) ? obj.variables : [];
    return values
      .filter((v) => v && v.enabled !== false)
      .map((v) => ({ key: String(v.key), value: String(v.value ?? "") }));
  } catch {
    return [];
  }
}

function fetchUrl(url, ignoreTls) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https://");
    const client = isHttps ? https : http;
    const options = isHttps && ignoreTls ? { rejectUnauthorized: false } : undefined;
    client
      .get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, ignoreTls).then(resolve).catch(reject);
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
      })
      .on("error", reject);
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

function convertOpenApiToCollection(openapiObj) {
  return new Promise((resolve, reject) => {
    openapiToPostman.convertV2(
      { type: "json", data: openapiObj },
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
  return { collection: normalized, servers };
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
    invalidVarsJson,
    runInvalidAlso,
    selectedRequestNames,
    useSelectedRequests,
    outputDir,
    reporters,
    iterationCount,
    timeoutRequest,
    delayRequest,
    bail
  } = payload;

  if (!collectionPath && !openapiPath && !openapiUrl) {
    return { ok: false, error: "컬렉션 또는 OpenAPI가 필요합니다." };
  }
  if (!reporters || !reporters.length) {
    return { ok: false, error: "리포터를 최소 1개 선택하세요." };
  }

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

  const invalidOverrides = invalidVarsJson ? parseVarsJson(invalidVarsJson) : [];

  let baseCollection;
  try {
    baseCollection = await loadCollectionObject({
      collectionPath,
      openapiPath,
      openapiUrl,
      useSelectedRequests,
      selectedRequestNames
    });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  const runOnce = (label, overrides) => {
    const runId = `run_${Date.now()}_${label}`;
    const reportJson = path.join(outputDir, `${runId}.json`);
    const reportHtml = path.join(outputDir, `${runId}.html`);
    const logPath = path.join(outputDir, `${runId}.log.txt`);
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const startedAt = new Date().toISOString();
    const emitLog = (line) => {
      logStream.write(line + "\n");
      mainWindow.webContents.send("run-log", line);
    };

    const mergedVars = [ ...envVars ];
    overrides.forEach((item) => {
      const idx = mergedVars.findIndex((v) => v.key === item.key);
      if (idx >= 0) mergedVars[idx] = item;
      else mergedVars.push(item);
    });

    return new Promise((resolve) => {
      newman.run(
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
          bail: bail === true
        },
        (err, summary) => {
          logStream.end();
          const endedAt = new Date().toISOString();
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
            ok: !err,
            error: err ? String(err.message || err) : null,
            label
          });
          writeHistory(history.slice(0, 200));

          if (err) {
            return resolve({
              ok: false,
              error: err.message || String(err),
              reportJson,
              reportHtml,
              logPath
            });
          }

          return resolve({
            ok: true,
            stats: summary.run.stats,
            reportJson,
            reportHtml,
            logPath
          });
        }
      )
        .on("start", () => {
          emitLog(`[start][${label}] running newman...`);
        })
        .on("request", (_err, args) => {
          if (!args) return;
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

  return new Promise(async (resolve) => {
    const primary = await runOnce("valid", []);
    if (!primary.ok || !runInvalidAlso) return resolve(primary);
    if (invalidOverrides.length === 0) {
      return resolve(primary);
    }
    const secondary = await runOnce("invalid", invalidOverrides);
    return resolve(secondary);
  });
});

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
    methodVariants
  } = payload;

  if (!collectionPath && !openapiPath && !openapiUrl) {
    return { ok: false, error: "컬렉션 또는 OpenAPI가 필요합니다." };
  }
  if (!outputDir) return { ok: false, error: "출력 폴더가 필요합니다." };

  const envVars = readEnvVars(environmentPath);
  const extraVars = extraVarsJson ? parseVarsJson(extraVarsJson) : [];
  if (openapiServerUrl) extraVars.push({ key: "baseUrl", value: openapiServerUrl, enabled: true });
  const varsMap = buildVarsMap({ envVars, extraVars, ip, token });

  let collectionObj;
  try {
    collectionObj = await loadCollectionObject({
      collectionPath,
      openapiPath,
      openapiUrl,
      useSelectedRequests,
      selectedRequestNames,
      failedOnly,
      failedRequestNames
    });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  let items = collectionObj.item || [];

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
  const matchAny = (name, filters) =>
    filters.some((f) => name.toLowerCase().includes(f.toLowerCase()));
  const filteredRequests = requests.filter((req) => {
    const name = req._fullName || req.name || "";
    if (includeFilters.length && !matchAny(name, includeFilters)) return false;
    if (excludeFilters.length && matchAny(name, excludeFilters)) return false;
    return true;
  });
  if (!filteredRequests.length) return { ok: false, error: "No requests match explore filters." };
  const runId = `run_${Date.now()}_explore`;
  const reportJson = path.join(outputDir, `${runId}.json`);
  const logPath = path.join(outputDir, `${runId}.log.txt`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const startedAt = new Date().toISOString();
  const emitLog = (line) => {
    logStream.write(line + "\n");
    mainWindow.webContents.send("run-log", line);
  };

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

  const ctx = await pwRequest.newContext({ ignoreHTTPSErrors: !!ignoreTls });
  emitLog("[explore] starting exploratory api test...");

  for (const item of filteredRequests) {
    const method = (item?.request?.method || "GET").toUpperCase();
    const headers = normalizeHeaderArray(item?.request?.header, varsMap);
    const headersWithAuth = ensureAuthHeader(headers, token);
    const urlRaw = getRequestUrl(item?.request, varsMap, ip);
    const queryParams = getQueryParams(item?.request, varsMap);
    const bodyInfo = getJsonBody(item?.request, varsMap);
    const variants = buildVariants(
      { queryParams, bodyJson: bodyInfo, mode: ruleMode, customVariants },
      maxVariants
    );

    const baseUrl = buildUrlWithQuery(urlRaw, queryParams);
    const baseBody = bodyInfo?.raw || "";

    const runOnce = async (variantLabel, url, bodyJson, methodOverride, dropBody = false) => {
      const methodToUse = methodOverride || method;
      const requestBody = dropBody
        ? ""
        : bodyJson
          ? JSON.stringify(bodyJson)
          : bodyInfo?.json
            ? JSON.stringify(bodyInfo.json)
            : baseBody;
      const headersFinal = requestBody
        ? { "Content-Type": "application/json", ...headersWithAuth }
        : headersWithAuth;
      const started = Date.now();
      let status = 0;
      let responseText = "";
      let error = null;
      try {
        const res = await ctx.fetch(url, {
          method: methodToUse,
          headers: headersFinal,
          data: requestBody || undefined
        });
        status = res.status();
        responseText = truncateBody(await res.text());
      } catch (e) {
        error = e.message || String(e);
      }
      const durationMs = Date.now() - started;
      if (error || status >= 400) failed += 1;
      const isMethodVariant = String(variantLabel || "").startsWith("method:");
      results.push({
        name: item.name || "Request",
        variant: variantLabel,
        isMethodVariant,
        method: methodToUse,
        url,
        status,
        durationMs,
        error,
        request: {
          headers: headersWithAuth,
          body: truncateBody(requestBody)
        },
        response: {
          status,
          body: responseText
        }
      });
      emitLog(`[explore] ${methodToUse} ${url} => ${status || "ERR"} ${variantLabel}`);
    };

    await runOnce("base", baseUrl, null);
    for (const variant of variants) {
      if (variant.query) {
        const vUrl = buildUrlWithQuery(urlRaw, variant.query);
        await runOnce(variant.label, vUrl, null);
      } else if (variant.body) {
        await runOnce(variant.label, baseUrl, variant.body);
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    if (allowMethodVariants) {
      const methodVariants = [];
      if (method === "GET" || method === "HEAD") {
        methodVariants.push({ method: "POST", label: `method:${method}->POST`, dropBody: true });
      } else if ([ "POST", "PUT", "PATCH" ].includes(method)) {
        methodVariants.push({ method: "GET", label: `method:${method}->GET`, dropBody: true });
        methodVariants.push({ method: "DELETE", label: `method:${method}->DELETE`, dropBody: true });
      } else if (method === "DELETE") {
        methodVariants.push({ method: "GET", label: `method:${method}->GET`, dropBody: true });
      }

      for (const mv of methodVariants) {
        await runOnce(mv.label, baseUrl, null, mv.method, mv.dropBody);
        if (delayMs > 0) await sleep(delayMs);
      }
    }
  }

  await ctx.dispose();
  logStream.end();

  const endedAt = new Date().toISOString();
  const summary = {
    total: results.length,
    failed,
    ok: results.length - failed
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
  const rows = results
    .map((r) => {
      const tag = r.isMethodVariant ? ' <span class="tag">Method</span>' : "";
      return `<tr><td>${r.name}</td><td>${r.variant}${tag}</td><td>${r.method}</td><td>${r.status || ""}</td><td>${r.durationMs}</td><td>${r.error || ""}</td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Exploratory Report</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;font-size:12px}th{background:#f3f4f6;text-align:left}.tag{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:10px;font-weight:600}</style></head><body><h2>Exploratory Report</h2><p>Total: ${summary.total} ? Failed: ${summary.failed}</p><table><thead><tr><th>Name</th><th>Variant</th><th>Method</th><th>Status</th><th>Ms</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
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
    ok: failed === 0,
    error: null,
    label: "explore"
  });
  writeHistory(history.slice(0, 200));

  return {
    ok: failed === 0,
    reportJson,
    logPath,
    summary
  };
});
