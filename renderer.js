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
const htmlPreview = el("htmlPreview");
const jsonPreview = el("jsonPreview");

function appendLog(line) {
  const div = document.createElement("div");
  div.textContent = line;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

window.api.onRunLog((msg) => appendLog(msg));

async function refreshHistory() {
  const history = await window.api.getHistory();
  historyList.innerHTML = "";
  history.forEach((item) => {
    const li = document.createElement("li");
    li.className = item.ok ? "ok" : "fail";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${item.id} · ${item.ok ? "OK" : "FAIL"}`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.startedAt} → ${item.endedAt}`;

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
          showHtmlPreview(htmlPath);
          return;
        }
        if (jsonPath) {
          showJsonPreview(jsonPath);
        }
      });
    });

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(links);
    historyList.appendChild(li);
  });
}

pickDirBtn.addEventListener("click", async () => {
  const dir = await window.api.pickOutputDir();
  if (dir) outputDirInput.value = dir;
});

function showHtmlPreview(filePath) {
  htmlPreview.src = `file:///${filePath.replace(/\\\\/g, "/")}`;
  htmlPreview.classList.remove("hidden");
  jsonPreview.classList.add("hidden");
  tabHtml.classList.add("active");
  tabJson.classList.remove("active");
}

async function showJsonPreview(filePath) {
  try {
    const res = await fetch(`file:///${filePath.replace(/\\\\/g, "/")}`);
    const text = await res.text();
    jsonPreview.textContent = text;
  } catch (e) {
    jsonPreview.textContent = `Failed to load JSON: ${e.message}`;
  }
  jsonPreview.classList.remove("hidden");
  htmlPreview.classList.add("hidden");
  tabJson.classList.add("active");
  tabHtml.classList.remove("active");
}

tabHtml.addEventListener("click", () => {
  tabHtml.classList.add("active");
  tabJson.classList.remove("active");
  htmlPreview.classList.remove("hidden");
  jsonPreview.classList.add("hidden");
});

tabJson.addEventListener("click", () => {
  tabJson.classList.add("active");
  tabHtml.classList.remove("active");
  jsonPreview.classList.remove("hidden");
  htmlPreview.classList.add("hidden");
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
    statusLine.textContent = `Done. JSON: ${res.reportJson} · HTML: ${res.reportHtml}`;
  } else {
    statusLine.textContent = `Failed: ${res.error}`;
  }

  await refreshHistory();
});

refreshHistory();
