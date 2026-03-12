const el = (id) => document.getElementById(id);

const collectionInput = el("collectionFile");
const environmentInput = el("environmentFile");
const ipInput = el("ip");
const tokenInput = el("token");
const extraVarsInput = el("extraVars");
const outputDirInput = el("outputDir");
const iterationInput = el("iterationCount");
const timeoutInput = el("timeoutRequest");
const delayInput = el("delayRequest");
const bailInput = el("bail");
const repCli = el("repCli");
const repHtml = el("repHtml");
const repJson = el("repJson");
const runBtn = el("runBtn");
const pickDirBtn = el("pickDirBtn");
const logBox = el("logBox");
const historyList = el("historyList");
const statusLine = el("statusLine");
const tabHtml = el("tabHtml");
const tabJson = el("tabJson");
const tabSplit = el("tabSplit");
const htmlPreview = el("htmlPreview");
const jsonPreview = el("jsonPreview");
const htmlSoloPreview = el("htmlSoloPreview");
const jsonSoloPreview = el("jsonSoloPreview");
const splitPreview = el("splitPreview");
const previewSummary = el("previewSummary");
const historySearch = el("historySearch");
const filterAll = el("filterAll");
const filterOk = el("filterOk");
const filterFail = el("filterFail");
const splitResizer = el("splitResizer");
const summaryTotal = el("summaryTotal");
const summaryFailed = el("summaryFailed");
const summaryAvg = el("summaryAvg");
const summaryGroups = el("summaryGroups");
const failureList = el("failureList");
const updateStatus = el("updateStatus");
const checkUpdateBtn = el("checkUpdateBtn");
const downloadUpdateBtn = el("downloadUpdateBtn");
const installUpdateBtn = el("installUpdateBtn");

let historyCache = [];
let historyFilter = "all";

function appendLog(line) {
  const div = document.createElement("div");
  div.textContent = line;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

window.api.onRunLog((msg) => appendLog(msg));
window.api.onUpdateStatus((msg) => {
  updateStatus.textContent = msg;
});

async function refreshHistory() {
  const history = await window.api.getHistory();
  historyCache = history;
  renderHistory();
}

function setFilter(next) {
  historyFilter = next;
  filterAll.classList.toggle("active", next === "all");
  filterOk.classList.toggle("active", next === "ok");
  filterFail.classList.toggle("active", next === "fail");
  renderHistory();
}

function renderHistory() {
  const q = historySearch.value.trim().toLowerCase();
  const filtered = historyCache.filter((item) => {
    if (historyFilter === "ok" && !item.ok) return false;
    if (historyFilter === "fail" && item.ok) return false;
    if (!q) return true;
    const hay = `${item.id} ${item.collectionPath} ${item.environmentPath || ""} ${item.outputDir}`;
    return hay.toLowerCase().includes(q);
  });

  historyList.innerHTML = "";
  filtered.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.ok ? "ok" : "fail";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${item.id} ¡¤ ${item.ok ? "OK" : "FAIL"}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.startedAt} ¡æ ${item.endedAt}`;

    const badges = document.createElement("div");
    badges.className = "badges";
    if (!item.ok) {
      const b = document.createElement("span");
      b.className = "badge fail";
      b.textContent = item.error ? `Error: ${item.error}` : "Error";
      badges.appendChild(b);
    }

    const links = document.createElement("div");
    links.className = "links";
    links.innerHTML = `
      <button data-path="${item.reportHtml}">Open HTML</button>
      <button data-path="${item.reportJson}">Open JSON</button>
      <button data-path="${item.logPath}">Open Log</button>
      <button data-preview-html="${item.reportHtml}">Preview HTML</button>
      <button data-preview-json="${item.reportJson}">Preview JSON</button>
    `;

    links.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-path");
        const htmlPath = btn.getAttribute("data-preview-html");
        const jsonPath = btn.getAttribute("data-preview-json");
        if (p) {
          window.open(`file:///${p.replace(/\\\\/g, "/")}`);
          return;
        }
        if (htmlPath) {
          showHtmlPreview(htmlPath, item.reportJson);
          return;
        }
        if (jsonPath) {
          showJsonPreview(jsonPath, item.reportHtml);
        }
      });
    });

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(badges);
    li.appendChild(links);
    historyList.appendChild(li);
  });
}

pickDirBtn.addEventListener("click", async () => {
  const dir = await window.api.pickOutputDir();
  if (dir) outputDirInput.value = dir;
});

function setPreviewMode(mode) {
  const isHtml = mode === "html";
  const isJson = mode === "json";
  const isSplit = mode === "split";

  tabHtml.classList.toggle("active", isHtml);
  tabJson.classList.toggle("active", isJson);
  tabSplit.classList.toggle("active", isSplit);

  splitPreview.classList.toggle("hidden", !isSplit);
  htmlSoloPreview.classList.toggle("hidden", !isHtml);
  jsonSoloPreview.classList.toggle("hidden", !isJson);

  if (isSplit) {
    htmlPreview.classList.remove("hidden");
    jsonPreview.classList.remove("hidden");
  }
}

function showHtmlPreview(htmlPath, jsonPath) {
  htmlPreview.src = `file:///${htmlPath.replace(/\\\\/g, "/")}`;
  htmlSoloPreview.src = `file:///${htmlPath.replace(/\\\\/g, "/")}`;
  if (jsonPath) {
    loadJsonSummary(jsonPath);
  }
  setPreviewMode("html");
}

async function showJsonPreview(jsonPath, htmlPath) {
  try {
    const res = await fetch(`file:///${jsonPath.replace(/\\\\/g, "/")}`);
    const text = await res.text();
    jsonPreview.textContent = text;
    jsonSoloPreview.textContent = text;
    loadJsonSummary(jsonPath, text);
  } catch (e) {
    jsonPreview.textContent = `Failed to load JSON: ${e.message}`;
    jsonSoloPreview.textContent = `Failed to load JSON: ${e.message}`;
  }
  if (htmlPath) {
    htmlPreview.src = `file:///${htmlPath.replace(/\\\\/g, "/")}`;
    htmlSoloPreview.src = `file:///${htmlPath.replace(/\\\\/g, "/")}`;
  }
  setPreviewMode("json");
}

async function loadJsonSummary(jsonPath, cachedText) {
  try {
    let resolved = cachedText;
    if (!resolved) {
      const res = await fetch(`file:///${jsonPath.replace(/\\\\/g, "/")}`);
      resolved = await res.text();
    }
    const data = JSON.parse(resolved);
    const executions = data?.run?.executions || [];
    const failed = executions.filter((ex) => {
      const assertions = ex.assertions || [];
      const hasAssertionError = assertions.some((a) => a.error);
      return hasAssertionError || ex.error;
    });
    previewSummary.textContent = `Executions: ${executions.length} ¡¤ Failed: ${failed.length}`;

    const times = executions.map((ex) => ex.response?.responseTime || 0);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    const groups = { "2": 0, "4": 0, "5": 0 };
    executions.forEach((ex) => {
      const code = ex.response?.code;
      if (!code) return;
      const g = String(Math.floor(code / 100));
      if (groups[g] !== undefined) groups[g] += 1;
    });

    summaryTotal.textContent = String(executions.length);
    summaryFailed.textContent = String(failed.length);
    summaryAvg.textContent = String(avg);
    summaryGroups.textContent = `${groups["2"]} / ${groups["4"]} / ${groups["5"]}`;

    renderFailureList(failed);
  } catch (e) {
    previewSummary.textContent = `Failed to parse JSON: ${e.message}`;
  }
}

function renderFailureList(failed) {
  failureList.innerHTML = "";
  if (!failed.length) {
    const li = document.createElement("li");
    li.textContent = "No failures.";
    failureList.appendChild(li);
    return;
  }

  failed.slice(0, 50).forEach((ex) => {
    const li = document.createElement("li");
    const method = ex?.item?.request?.method || "-";
    const url = ex?.item?.request?.url?.raw || ex?.item?.request?.url || "-";
    const status = ex?.response?.code || "-";
    const err = ex?.error?.message || (ex?.assertions || []).find((a) => a.error)?.error?.message || "Assertion failed";

    li.innerHTML = `
      <div class="row">
        <div><strong>${method}</strong> <span class="status">${status}</span></div>
        <div>${ex?.item?.name || ""}</div>
      </div>
      <div class="row">
        <div class="url">${url}</div>
        <div>${err}</div>
      </div>
    `;
    failureList.appendChild(li);
  });
}

tabHtml.addEventListener("click", () => {
  setPreviewMode("html");
});

tabJson.addEventListener("click", () => {
  setPreviewMode("json");
});

tabSplit.addEventListener("click", () => {
  setPreviewMode("split");
});

let isDragging = false;
splitResizer.addEventListener("mousedown", () => {
  isDragging = true;
});
window.addEventListener("mouseup", () => {
  isDragging = false;
});
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const rect = splitPreview.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const leftPct = Math.max(20, Math.min(80, (x / rect.width) * 100));
  splitPreview.style.setProperty("--split-left", `${leftPct}%`);
  splitPreview.style.setProperty("--split-right", `${100 - leftPct}%`);
});

runBtn.addEventListener("click", async () => {
  logBox.innerHTML = "";
  statusLine.textContent = "Running...";

  const reporters = [];
  if (repCli.checked) reporters.push("cli");
  if (repHtml.checked) reporters.push("html");
  if (repJson.checked) reporters.push("json");

  const payload = {
    collectionPath: collectionInput.files[0]?.path,
    environmentPath: environmentInput.files[0]?.path,
    ip: ipInput.value.trim(),
    token: tokenInput.value.trim(),
    extraVarsJson: extraVarsInput.value.trim(),
    outputDir: outputDirInput.value.trim(),
    reporters,
    iterationCount: Number(iterationInput.value || 1),
    timeoutRequest: Number(timeoutInput.value || 300000),
    delayRequest: Number(delayInput.value || 0),
    bail: bailInput.checked
  };

  if (!payload.outputDir) {
    statusLine.textContent = "Output directory is required.";
    return;
  }
  if (!payload.reporters.length) {
    statusLine.textContent = "Select at least one reporter.";
    return;
  }

  const res = await window.api.runNewman(payload);
  if (res.ok) {
    statusLine.textContent = `Done. JSON: ${res.reportJson} ¡¤ HTML: ${res.reportHtml}`;
    if (res.reportJson) {
      showJsonPreview(res.reportJson, res.reportHtml);
    }
  } else {
    statusLine.textContent = `Failed: ${res.error}`;
  }

  await refreshHistory();
});

historySearch.addEventListener("input", renderHistory);
filterAll.addEventListener("click", () => setFilter("all"));
filterOk.addEventListener("click", () => setFilter("ok"));
filterFail.addEventListener("click", () => setFilter("fail"));

checkUpdateBtn.addEventListener("click", async () => {
  updateStatus.textContent = "Checking for updates...";
  const res = await window.api.checkUpdates();
downloadUpdateBtn.addEventListener("click", async () => {
  updateStatus.textContent = "Downloading update...";
  const res = await window.api.downloadUpdate();
  if (!res.ok) updateStatus.textContent = res.error;
});

installUpdateBtn.addEventListener("click", async () => {
  updateStatus.textContent = "Installing update...";
  const res = await window.api.installUpdate();
  if (!res.ok) updateStatus.textContent = res.error;
});
  if (!res.ok) updateStatus.textContent = res.error;
});

refreshHistory();





