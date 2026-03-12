const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickOutputDir: () => ipcRenderer.invoke("pick-output-dir"),
  runNewman: (payload) => ipcRenderer.invoke("run-newman", payload),
  getHistory: () => ipcRenderer.invoke("get-history"),
  onRunLog: (cb) => ipcRenderer.on("run-log", (_event, msg) => cb(msg)),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (cb) => ipcRenderer.on("update-status", (_event, msg) => cb(msg)),
  onUpdateProgress: (cb) => ipcRenderer.on("update-progress", (_event, pct) => cb(pct))
});
