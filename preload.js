const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickOutputDir: () => ipcRenderer.invoke("pick-output-dir"),
  runNewman: (payload) => ipcRenderer.invoke("run-newman", payload),
  runExploratory: (payload) => ipcRenderer.invoke("run-exploratory", payload),
  loadOpenApi: (payload) => ipcRenderer.invoke("load-openapi", payload),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  openPath: (filePath) => ipcRenderer.invoke("open-path", filePath),
  getHistory: () => ipcRenderer.invoke("get-history"),
  onRunLog: (cb) => ipcRenderer.on("run-log", (_event, msg) => cb(msg)),
  onRunProgress: (cb) => ipcRenderer.on("run-progress", (_event, data) => cb(data)),
  onOpenHelp: (cb) => ipcRenderer.on("open-help", () => cb())
});


