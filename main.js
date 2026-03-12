const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const newman = require("newman");
const {
  parseVarsJson,
  normalizeCollection,
  filterItemsByName
} = require("./lib/newmanHelpers");

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
