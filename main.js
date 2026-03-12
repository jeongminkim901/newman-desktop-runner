const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const newman = require("newman");
const { request: pwRequest } = require("playwright");
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

ipcMain.handle("run-newman", async (_event, payload) => {
  const {
    collectionPath,
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

  if (!collectionPath) {
    return { ok: false, error: "Collection file is required." };
  }
  if (!reporters || !reporters.length) {
    return { ok: false, error: "Select at least one reporter." };
  }

  const envVars = [];
  if (ip) envVars.push({ key: "ip", value: ip, enabled: true });
  if (token) envVars.push({ key: "token", value: token, enabled: true });

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

  const resolveCollection = () => {
    if (useSelectedRequests && Array.isArray(selectedRequestNames)) {
      const raw = fs.readFileSync(collectionPath, "utf-8");
      const obj = normalizeCollection(JSON.parse(raw));
      if (!obj) throw new Error("Collection file JSON is invalid.");
      const nameSet = new Set(selectedRequestNames);
      if (nameSet.size === 0) throw new Error("No requests selected.");
      const filtered = filterItemsByName(obj.item || [], nameSet);
      if (!filtered.length) throw new Error("No selected requests found.");
      return { ...obj, item: filtered };
    }

    return collectionPath;
  };

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
      const collectionSource = resolveCollection();

      newman.run(
        {
          collection: collectionSource,
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
    failedOnly,
    failedRequestNames
  } = payload;

  if (!collectionPath) return { ok: false, error: "Collection file is required." };
  if (!outputDir) return { ok: false, error: "Output directory is required." };

  const envVars = readEnvVars(environmentPath);
  const extraVars = extraVarsJson ? parseVarsJson(extraVarsJson) : [];
  const varsMap = buildVarsMap({ envVars, extraVars, ip, token });

  let collectionObj;
  try {
    const raw = fs.readFileSync(collectionPath, "utf-8");
    collectionObj = normalizeCollection(JSON.parse(raw));
    if (!collectionObj) throw new Error("Collection file JSON is invalid.");
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  let items = collectionObj.item || [];
  if (failedOnly && Array.isArray(failedRequestNames) && failedRequestNames.length) {
    const nameSet = new Set(failedRequestNames);
    items = filterItemsByName(items, nameSet);
    if (!items.length) return { ok: false, error: "No failed requests found in collection." };
  } else if (useSelectedRequests && Array.isArray(selectedRequestNames)) {
    const nameSet = new Set(selectedRequestNames);
    if (!nameSet.size) return { ok: false, error: "No requests selected." };
    items = filterItemsByName(items, nameSet);
    if (!items.length) return { ok: false, error: "No selected requests found." };
  }

  const flattenItems = (arr, out = []) => {
    arr.forEach((it) => {
      if (Array.isArray(it.item)) flattenItems(it.item, out);
      else out.push(it);
    });
    return out;
  };

  const requests = flattenItems(items);
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

  const ctx = await pwRequest.newContext();
  emitLog("[explore] starting exploratory api test...");

  for (const item of requests) {
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

    const runOnce = async (variantLabel, url, bodyJson) => {
      const requestBody = bodyJson ? JSON.stringify(bodyJson) : bodyInfo?.json ? JSON.stringify(bodyInfo.json) : baseBody;
      const headersFinal = requestBody
        ? { "Content-Type": "application/json", ...headersWithAuth }
        : headersWithAuth;
      const started = Date.now();
      let status = 0;
      let responseText = "";
      let error = null;
      try {
        const res = await ctx.fetch(url, {
          method,
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
      results.push({
        name: item.name || "Request",
        variant: variantLabel,
        method,
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
      emitLog(`[explore] ${method} ${url} => ${status || "ERR"} ${variantLabel}`);
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
    .map((r) => `<tr><td>${r.name}</td><td>${r.variant}</td><td>${r.method}</td><td>${r.status || ""}</td><td>${r.durationMs}</td><td>${r.error || ""}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Exploratory Report</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;font-size:12px}th{background:#f3f4f6;text-align:left}</style></head><body><h2>Exploratory Report</h2><p>Total: ${summary.total} · Failed: ${summary.failed}</p><table><thead><tr><th>Name</th><th>Variant</th><th>Method</th><th>Status</th><th>Ms</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
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
