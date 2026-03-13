const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickOutputDir: () => ipcRenderer.invoke("pick-output-dir"),
  runNewman: (payload) => ipcRenderer.invoke("run-newman", payload),
  runExploratory: (payload) => ipcRenderer.invoke("run-exploratory", payload),
  getHistory: () => ipcRenderer.invoke("get-history"),
  onRunLog: (cb) => ipcRenderer.on("run-log", (_event, msg) => cb(msg)),
  onOpenHelp: (cb) => ipcRenderer.on("open-help", () => cb())
});
