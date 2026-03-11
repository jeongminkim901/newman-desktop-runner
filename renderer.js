const el = (id) => document.getElementById(id);

const collectionInput = el("collectionFile");
const environmentInput = el("environmentFile");
const ipInput = el("ip");
const tokenInput = el("token");
const extraVarsInput = el("extraVars");
const outputDirInput = el("outputDir");
const runBtn = el("runBtn");
const pickDirBtn = el("pickDirBtn");
const logBox = el("logBox");
const historyList = el("historyList");
const statusLine = el("statusLine");

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
    `;

    links.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-path");
        if (p) window.open(`file:///${p.replace(/\\\\/g, "/")}`);
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

runBtn.addEventListener("click", async () => {
  logBox.innerHTML = "";
  statusLine.textContent = "Running...";

  const payload = {
    collectionPath: collectionInput.files[0]?.path,
    environmentPath: environmentInput.files[0]?.path,
    ip: ipInput.value.trim(),
    token: tokenInput.value.trim(),
    extraVarsJson: extraVarsInput.value.trim(),
    outputDir: outputDirInput.value.trim()
  };

  if (!payload.outputDir) {
    statusLine.textContent = "Output directory is required.";
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
