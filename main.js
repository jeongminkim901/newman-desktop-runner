const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const newman = require("newman");

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

  autoUpdater.autoDownload = false;
  autoUpdater.on("checking-for-update", () => {
    mainWindow.webContents.send("update-status", "Checking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    mainWindow.webContents.send("update-status", `Update available: ${info.version}`);
  });
  autoUpdater.on("update-not-available", () => {
    mainWindow.webContents.send("update-status", "No updates available.");
  });
  autoUpdater.on("error", (err) => {
    mainWindow.webContents.send("update-status", `Update error: ${err.message}`);
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow.webContents.send(
      "update-status",
      `Downloading update... ${Math.round(progress.percent)}%`
    );
  });
  autoUpdater.on("update-downloaded", () => {
    mainWindow.webContents.send("update-status", "Update downloaded. Restart to install.");
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  } else {
    mainWindow.webContents.send("update-status", "Updates disabled in dev mode.");
  }

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

ipcMain.handle("check-updates", async () => {
  if (!app.isPackaged) return { ok: false, error: "Updates disabled in dev mode." };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("run-newman", async (_event, payload) => {
  const {
    collectionPath,
    environmentPath,
    ip,
    token,
    extraVarsJson,
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

  const runId = `run_${Date.now()}`;
  const reportJson = path.join(outputDir, `${runId}.json`);
  const reportHtml = path.join(outputDir, `${runId}.html`);
  const logPath = path.join(outputDir, `${runId}.log.txt`);

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

  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();

    newman.run(
      {
        collection: collectionPath,
        environment: environmentPath || undefined,
        reporters,
        reporter: {
          json: reporters.includes("json") ? { export: reportJson } : undefined,
          html: reporters.includes("html") ? { export: reportHtml } : undefined
        },
        envVar: envVars,
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
          error: err ? String(err.message || err) : null
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
        mainWindow.webContents.send("run-log", "[start] running newman...");
      })
      .on("console", (err, args) => {
        if (err) return;
        const line = args && args.length ? args.join(" ") : "";
        if (line) {
          logStream.write(line + "\n");
          mainWindow.webContents.send("run-log", line);
        }
      });
  });
});
