const el = (id) => document.getElementById(id);

const collectionInput = el("collectionFile");
const openapiFileInput = el("openapiFile");
const openapiUrlInput = el("openapiUrl");
const loadOpenapiBtn = el("loadOpenapiBtn");
const openapiIgnoreTls = el("openapiIgnoreTls");
const environmentInput = el("environmentFile");
const ipInput = el("ip");
const tokenInput = el("token");
const clearSavedBtn = el("clearSavedBtn");
const extraVarsInput = el("extraVars");
const invalidVarsInput = el("invalidVars");
const collectionSearch = el("collectionSearch");
const collectionTree = el("collectionTree");
const selectAllBtn = el("selectAllBtn");
const selectNoneBtn = el("selectNoneBtn");
const useSelectedRequests = el("useSelectedRequests");
const showReqRes = el("showReqRes");
const outputDirInput = el("outputDir");
const runInvalidAlso = el("runInvalidAlso");
const iterationInput = el("iterationCount");
const timeoutInput = el("timeoutRequest");
const delayInput = el("delayRequest");
const bailInput = el("bail");
const exploreEnabled = el("exploreEnabled");
const variantsPerRequest = el("variantsPerRequest");
const exploreDelayMs = el("exploreDelayMs");
const exploreRuleMode = el("exploreRuleMode");
const exploreCustomJson = el("exploreCustomJson");
const exploreFailedOnly = el("exploreFailedOnly");
const exploreTemplate = el("exploreTemplate");
const exploreMethodVariants = el("exploreMethodVariants");
const exploreIgnoreTls = el("exploreIgnoreTls");
const exploreInclude = el("exploreInclude");
const exploreExclude = el("exploreExclude");
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
const tabExplore = el("tabExplore");
const tabHelp = el("tabHelp");
const tabSplit = el("tabSplit");
const htmlPreview = el("htmlPreview");
const jsonPreview = el("jsonPreview");
const htmlSoloPreview = el("htmlSoloPreview");
const jsonSoloPreview = el("jsonSoloPreview");
const splitPreview = el("splitPreview");
const previewSummary = el("previewSummary");
const previewCards = document.querySelector(".cards");
const previewPanel = document.querySelector(".preview");
const failuresPanel = document.querySelector(".failures");
const helpModal = el("helpModal");
const helpClose = el("helpClose");
const historySearch = el("historySearch");
const filterAll = el("filterAll");
const filterOk = el("filterOk");
const filterFail = el("filterFail");
const filterExplore = el("filterExplore");
const splitResizer = el("splitResizer");
const summaryTotal = el("summaryTotal");
const summaryFailed = el("summaryFailed");
const summaryAvg = el("summaryAvg");
const summaryGroups = el("summaryGroups");
const failureList = el("failureList");
let collectionCache = null;
let selection = new Set();

const AUTH_KEYS = {
  ip: "saved_ip",
  token: "saved_token"
};

function loadSavedAuth() {
  try {
    const savedIp = localStorage.getItem(AUTH_KEYS.ip);
    const savedToken = localStorage.getItem(AUTH_KEYS.token);
    if (savedIp && ipInput) ipInput.value = savedIp;
    if (savedToken && tokenInput) tokenInput.value = savedToken;
  } catch {
    // ignore localStorage errors
  }
}

function saveAuth() {
  try {
    if (ipInput) localStorage.setItem(AUTH_KEYS.ip, ipInput.value || "");
    if (tokenInput) localStorage.setItem(AUTH_KEYS.token, tokenInput.value || "");
  } catch {
    // ignore localStorage errors
  }
}

function selectedRequestNames() {
  return Array.from(selection);
}

function buildTree(items, filter) {
  const ul = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");
    if (Array.isArray(item.item)) {
      const row = document.createElement("div");
      row.className = "row folder";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = areAllChildrenSelected(item.item);
      cb.addEventListener("change", () => {
        setChildrenSelected(item.item, cb.checked);
        renderCollectionTree();
      });
      const label = document.createElement("span");
      label.textContent = item.name || "Folder";
      row.appendChild(cb);
      row.appendChild(label);
      li.appendChild(row);
      li.appendChild(buildTree(item.item, filter));
    } else {
      const row = document.createElement("div");
      row.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selection.has(item.name || "");
      cb.addEventListener("change", () => {
        const name = item.name || "";
        if (cb.checked) selection.add(name);
        else selection.delete(name);
      });
      const label = document.createElement("span");
      label.textContent = item.name || "Request";
      row.appendChild(cb);
      row.appendChild(label);
      li.appendChild(row);
    }
    if (filter) {
      const text = (item.name || "").toLowerCase();
      if (!text.includes(filter)) return;
    }
    ul.appendChild(li);
  });
  return ul;
}

function areAllChildrenSelected(items) {
  return flattenRequests(items).every((name) => selection.has(name));
}

function setChildrenSelected(items, checked) {
  flattenRequests(items).forEach((name) => {
    if (checked) selection.add(name);
    else selection.delete(name);
  });
}

function flattenRequests(items) {
  const names = [];
  items.forEach((it) => {
    if (Array.isArray(it.item)) {
      names.push(...flattenRequests(it.item));
    } else if (it.name) {
      names.push(it.name);
    }
  });
  return names;
}

function renderCollectionTree() {
  if (!collectionCache) return;
  const filter = collectionSearch.value.trim().toLowerCase();
  collectionTree.innerHTML = "";
  collectionTree.appendChild(buildTree(collectionCache.item || [], filter));
}

let openapiActive = false;
const setOpenApiActive = (active) => {
  openapiActive = active;
  if (collectionInput) collectionInput.disabled = active;
};

collectionInput.addEventListener("change", () => {
  const file = collectionInput.files[0];
  if (!file) return;
  if (openapiActive) {
    if (openapiFileInput) openapiFileInput.value = "";
    if (openapiUrlInput) openapiUrlInput.value = "";
    setOpenApiActive(false);
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      collectionCache = JSON.parse(String(reader.result || ""));
      selection = new Set(flattenRequests(collectionCache.item || []));
      renderCollectionTree();
    } catch {
      collectionTree.innerHTML = "컬렉션 JSON 파싱 실패";
    }
  };
  reader.readAsText(file);
});

if (loadOpenapiBtn) {
  loadOpenapiBtn.addEventListener("click", async () => {
    const file = openapiFileInput?.files?.[0];
    const openapiUrl = openapiUrlInput?.value?.trim();
    if (!file && !openapiUrl) {
      statusLine.textContent = "OpenAPI 파일 또는 URL을 입력하세요.";
      return;
    }
    statusLine.textContent = "OpenAPI 불러오는 중...";
    const res = await window.api.loadOpenApi({
      openapiPath: file?.path,
      openapiUrl,
      ignoreTls: !!openapiIgnoreTls?.checked
    });
    if (res?.ok && res.collection) {
      if (collectionInput) collectionInput.value = "";
      setOpenApiActive(true);
      collectionCache = res.collection;
      selection = new Set(flattenRequests(collectionCache.item || []));
      renderCollectionTree();
      statusLine.textContent = "OpenAPI 로드 완료";
    } else {
      statusLine.textContent = `OpenAPI 로드 실패: ${res?.error || "알 수 없음"}`;
    }
  });
}

collectionSearch.addEventListener("input", renderCollectionTree);

selectAllBtn.addEventListener("click", () => {
  if (!collectionCache) return;
  selection = new Set(flattenRequests(collectionCache.item || []));
  renderCollectionTree();
});

selectNoneBtn.addEventListener("click", () => {
  selection = new Set();
  renderCollectionTree();
});
if (ipInput) ipInput.addEventListener("input", saveAuth);
if (tokenInput) tokenInput.addEventListener("input", saveAuth);
if (clearSavedBtn) {
  clearSavedBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(AUTH_KEYS.ip);
      localStorage.removeItem(AUTH_KEYS.token);
    } catch {
      // ignore localStorage errors
    }
    if (ipInput) ipInput.value = "";
    if (tokenInput) tokenInput.value = "";
    statusLine.textContent = "저장값을 지웠습니다.";
  });
}
let historyCache = [];
let historyFilter = "all";
let lastPreviewJsonPath = "";
const templateMap = {
  auth_missing: [
    { label: "auth:missing", body: { token: "" } }
  ],
  boundary_values: [
    { label: "boundary:zero", body: { value: 0 } },
    { label: "boundary:negative", body: { value: -1 } },
    { label: "boundary:large", body: { value: 999999999 } }
  ],
  sql_injection: [
    { label: "sql:basic", body: { query: "' OR 1=1 --" } },
    { label: "sql:union", body: { query: "' UNION SELECT 1,2 --" } }
  ],
  xss_payloads: [
    { label: "xss:script", body: { input: "<script>alert(1)</script>" } },
    { label: "xss:img", body: { input: "<img src=x onerror=alert(1)>" } }
  ]
};

if (exploreTemplate) {
  exploreTemplate.addEventListener("change", () => {
    const key = exploreTemplate.value;
    if (!key) return;
    exploreRuleMode.value = "custom";
    exploreCustomJson.value = JSON.stringify(templateMap[key] || [], null, 2);
  });
}

function appendLog(line) {
  const div = document.createElement("div");
  div.textContent = line;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

window.api.onRunLog((msg) => appendLog(msg));
window.api.onOpenHelp(() => openHelpModal());

loadSavedAuth();

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
  filterExplore.classList.toggle("active", next === "explore");
  renderHistory();
}

function renderHistory() {
  const q = historySearch.value.trim().toLowerCase();
  const filtered = historyCache.filter((item) => {
    if (historyFilter === "ok" && !item.ok) return false;
    if (historyFilter === "fail" && item.ok) return false;
    if (historyFilter === "explore" && item.label !== "explore") return false;
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
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.label ? item.label.toUpperCase() : "RUN";
    title.appendChild(badge);
    const statusText = document.createElement("span");
    statusText.textContent = `${item.id} · ${item.ok ? "OK" : "FAIL"}`;
    title.appendChild(statusText);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.startedAt} → ${item.endedAt}`;

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
    if (item.reportHtml) {
      links.innerHTML += `<button data-path="${item.reportHtml}">HTML 열기</button>`;
      links.innerHTML += `<button data-preview-html="${item.reportHtml}">HTML 미리보기</button>`;
    }
    if (item.reportJson) {
      links.innerHTML += `<button data-path="${item.reportJson}">JSON 열기</button>`;
      links.innerHTML += `<button data-preview-json="${item.reportJson}">JSON 미리보기</button>`;
    }
    if (item.logPath) {
      links.innerHTML += `<button data-path="${item.logPath}">로그 열기</button>`;
    }

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

function openHelpModal() {
  if (helpModal) helpModal.classList.remove("hidden");
}

function closeHelpModal() {
  if (helpModal) helpModal.classList.add("hidden");
}

function setPreviewMode(mode) {
  const isHtml = mode === "html";
  const isJson = mode === "json";
  const isExplore = mode === "explore";
  const isSplit = mode === "split";

  tabHtml.classList.toggle("active", isHtml);
  tabJson.classList.toggle("active", isJson);
  tabExplore.classList.toggle("active", isExplore);
  tabHelp.classList.remove("active");
  tabSplit.classList.toggle("active", isSplit);

  splitPreview.classList.toggle("hidden", !isSplit);
  htmlSoloPreview.classList.toggle("hidden", !isHtml);
  jsonSoloPreview.classList.toggle("hidden", !(isJson || isExplore));

  if (isSplit) {
    htmlPreview.classList.remove("hidden");
    jsonPreview.classList.remove("hidden");
  }

  previewSummary.classList.toggle("hidden", false);
  if (previewCards) previewCards.classList.toggle("hidden", false);
  if (previewPanel) previewPanel.classList.toggle("hidden", false);
  if (failuresPanel) failuresPanel.classList.toggle("hidden", false);
}

async function loadHtmlPreview(htmlPath) {
  try {
    const res = await fetch(`file:///${htmlPath.replace(/\\/g, "/")}`);
    const text = await res.text();
    htmlPreview.srcdoc = text;
    htmlSoloPreview.srcdoc = text;
  } catch (e) {
    htmlPreview.srcdoc = `<pre>HTML 로드 실패: ${e.message}</pre>`;
    htmlSoloPreview.srcdoc = `<pre>HTML 로드 실패: ${e.message}</pre>`;
  }
}

function showHtmlPreview(htmlPath, jsonPath) {
  htmlPreview.src = "about:blank";
  htmlSoloPreview.src = "about:blank";
  loadHtmlPreview(htmlPath);
  if (jsonPath) {
    loadJsonSummary(jsonPath);
  }
  setPreviewMode("html");
}

async function showJsonPreview(jsonPath, htmlPath) {
  try {
    lastPreviewJsonPath = jsonPath;
    const res = await fetch(`file:///${jsonPath.replace(/\\/g, "/")}`);
    const text = await res.text();
    jsonPreview.textContent = text;
    jsonSoloPreview.textContent = text;
    loadJsonSummary(jsonPath, text);
  } catch (e) {
    jsonPreview.textContent = `JSON 로드 실패: ${e.message}`;
    jsonSoloPreview.textContent = `JSON 로드 실패: ${e.message}`;
  }
  if (htmlPath) {
    await loadHtmlPreview(htmlPath);
  }
  setPreviewMode("json");
}

function extractFailedNamesFromJson(text) {
  try {
    const data = JSON.parse(text);
    if (data && data.type === "explore") {
      const results = Array.isArray(data.results) ? data.results : [];
      return results.filter((r) => r.error || (r.status >= 400)).map((r) => r.name).filter(Boolean);
    }
    const executions = data?.run?.executions || [];
    const failed = executions.filter((ex) => {
      const assertions = ex.assertions || [];
      const hasAssertionError = assertions.some((a) => a.error);
      return hasAssertionError || ex.error;
    });
    return failed.map((ex) => ex?.item?.name).filter(Boolean);
  } catch {
    return [];
  }
}
async function loadJsonSummary(jsonPath, cachedText) {
  try {
    let resolved = cachedText;
    if (!resolved) {
      const res = await fetch(`file:///${jsonPath.replace(/\\\\/g, "/")}`);
      resolved = await res.text();
    }
    const data = JSON.parse(resolved);
    if (data && data.type === "explore") {
      const results = Array.isArray(data.results) ? data.results : [];
      const failed = results.filter((r) => r.error || (r.status >= 400));
      const times = results.map((r) => r.durationMs || 0);
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      const groups = { "2": 0, "4": 0, "5": 0 };
      results.forEach((r) => {
        const code = r.status || 0;
        if (code >= 200 && code < 300) groups["2"] += 1;
        else if (code >= 400 && code < 500) groups["4"] += 1;
        else if (code >= 500 && code < 600) groups["5"] += 1;
      });

      previewSummary.textContent = `탐색 실행: ${results.length} · 실패: ${failed.length}`;
      summaryTotal.textContent = String(results.length);
      summaryFailed.textContent = String(failed.length);
      summaryAvg.textContent = String(avg);
      summaryGroups.textContent = `${groups["2"]} / ${groups["4"]} / ${groups["5"]}`;
      renderExploreFailureList(failed, showReqRes.checked);
      return;
    }

    const executions = data?.run?.executions || [];
    const failed = executions.filter((ex) => {
      const assertions = ex.assertions || [];
      const hasAssertionError = assertions.some((a) => a.error);
      return hasAssertionError || ex.error;
    });
    previewSummary.textContent = `실행: ${executions.length} · 실패: ${failed.length}`;

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

    renderFailureList(failed, showReqRes.checked);
  } catch (e) {
    previewSummary.textContent = `JSON 파싱 실패: ${e.message}`;
  }
}

function renderFailureList(failed, showDetails) {
  failureList.innerHTML = "";
  if (!failed.length) {
    const li = document.createElement("li");
    li.textContent = "실패 없음.";
    failureList.appendChild(li);
    return;
  }

  failed.slice(0, 50).forEach((ex) => {
    const li = document.createElement("li");
    const method = ex?.item?.request?.method || "-";
    const url = ex?.item?.request?.url?.raw || ex?.item?.request?.url || "-";
    const status = ex?.response?.code || "-";
    const err = ex?.error?.message || (ex?.assertions || []).find((a) => a.error)?.error?.message || "검증 실패";
    const req = ex?.request || ex?.item?.request;
    const res = ex?.response;
    const reqJson = req ? JSON.stringify(req, null, 2) : "";
    let resBody = "";
    if (res?.body) resBody = res.body;
    else if (Array.isArray(res?.stream)) {
      try {
        const bytes = new Uint8Array(res.stream);
        resBody = new TextDecoder().decode(bytes);
      } catch { resBody = ""; }
    }
    const resJson = res ? JSON.stringify({ code: res.code, headers: res.headers, body: resBody }, null, 2) : "";

    li.innerHTML = `
      <div class="row">
        <div><strong>${method}</strong> <span class="status">${status}</span></div>
        <div>${ex?.item?.name || ""}</div>
      </div>
      <div class="row">
        <div class="url">${url}</div>
        <div>${err}</div>
      </div>
      ${showDetails ? `<pre class="reqres">요청\n${reqJson}</pre><pre class="reqres">응답\n${resJson}</pre>` : ""}
    `;
    failureList.appendChild(li);
  });
}

function renderExploreFailureList(failed, showDetails) {
  failureList.innerHTML = "";
  if (!failed.length) {
    const li = document.createElement("li");
    li.textContent = "실패 없음.";
    failureList.appendChild(li);
    return;
  }

  failed.slice(0, 50).forEach((item) => {
    const li = document.createElement("li");
    const status = item.status || "-";
    const err = item.error || "";
    li.innerHTML = `
      <div class="row">
        <div><strong>${item.method}</strong> <span class="status">${status}</span></div>
        <div>${item.name || ""}</div>
      </div>
      <div class="row">
        <div class="url">${item.url || ""}</div>
        <div>${item.variant || ""} ${err ? "· " + err : ""}</div>
      </div>
      ${showDetails ? `<pre class="reqres">요청\n${item.request?.body || ""}</pre><pre class="reqres">응답\n${item.response?.body || ""}</pre>` : ""}
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

tabExplore.addEventListener("click", () => {
  setPreviewMode("explore");
});

tabHelp.addEventListener("click", () => {
  openHelpModal();
});

if (helpClose) helpClose.addEventListener("click", closeHelpModal);
if (helpModal) {
  helpModal.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.getAttribute && target.getAttribute("data-close") === "1") {
      closeHelpModal();
    }
  });
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeHelpModal();
  }
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
  statusLine.textContent = "실행 중...";

  const reporters = [];
  if (repCli.checked) reporters.push("cli");
  if (repHtml.checked) reporters.push("html");
  if (repJson.checked) reporters.push("json");

  let failedRequestNames = [];
  if (exploreEnabled?.checked && exploreFailedOnly?.checked) {
    if (!lastPreviewJsonPath) {
      statusLine.textContent = "실패만 재탐색하려면 먼저 JSON 미리보기를 열어주세요.";
      return;
    }
    try {
      const res = await fetch(`file:///${lastPreviewJsonPath.replace(/\\/g, "/")}`);
      const text = await res.text();
      failedRequestNames = extractFailedNamesFromJson(text);
      if (!failedRequestNames.length) {
        statusLine.textContent = "마지막 JSON 미리보기에 실패 요청이 없습니다.";
        return;
      }
    } catch (e) {
    statusLine.textContent = `JSON 미리보기 읽기 실패: ${e.message}`;
      return;
    }
  }

  const payload = {
    collectionPath: collectionInput.files[0]?.path,
    openapiPath: openapiFileInput?.files?.[0]?.path,
    openapiUrl: openapiUrlInput?.value?.trim(),
    openapiIgnoreTls: !!openapiIgnoreTls?.checked,
    environmentPath: environmentInput.files[0]?.path,
    ip: ipInput.value.trim(),
    token: tokenInput.value.trim(),
    extraVarsJson: extraVarsInput.value.trim(),
    selectedRequestNames: selectedRequestNames(),
    runInvalidAlso: runInvalidAlso.checked,
    useSelectedRequests: useSelectedRequests.checked,
    invalidVarsJson: invalidVarsInput.value.trim(),
    outputDir: outputDirInput.value.trim(),
    variantsPerRequest: Number(variantsPerRequest?.value || 3),
    exploreDelayMs: Number(exploreDelayMs?.value || 300),
    exploreRuleMode: exploreFailedOnly?.checked ? "extended" : (exploreRuleMode?.value || "basic"),
    exploreCustomJson: exploreCustomJson?.value?.trim(),
    ignoreTls: !!exploreIgnoreTls?.checked,
    failedOnly: !!exploreFailedOnly?.checked,
    methodVariants: !!exploreMethodVariants?.checked,
    failedRequestNames,
    exploreInclude: exploreInclude?.value?.trim(),
    exploreExclude: exploreExclude?.value?.trim(),
    reporters,
    iterationCount: Number(iterationInput.value || 1),
    timeoutRequest: Number(timeoutInput.value || 300000),
    delayRequest: Number(delayInput.value || 0),
    bail: bailInput.checked
  };

  if (!payload.collectionPath && !payload.openapiPath && !payload.openapiUrl) {
    statusLine.textContent = "컬렉션 또는 OpenAPI가 필요합니다.";
    return;
  }
  if (!payload.outputDir) {
    statusLine.textContent = "출력 폴더가 필요합니다.";
    return;
  }
  if (!payload.reporters.length && !exploreEnabled?.checked) {
    statusLine.textContent = "리포터를 최소 1개 선택하세요.";
    return;
  }

  const res = exploreEnabled?.checked
    ? await window.api.runExploratory(payload)
    : await window.api.runNewman(payload);
  if (res.ok) {
    if (exploreEnabled?.checked) {
    statusLine.textContent = `탐색 완료. JSON: ${res.reportJson}`;
    } else {
      statusLine.textContent = `완료. JSON: ${res.reportJson} · HTML: ${res.reportHtml}`;
    }
    if (res.reportJson) {
      showJsonPreview(res.reportJson, res.reportHtml);
    }
  } else {
    statusLine.textContent = `실패: ${res.error}`;
  }

  await refreshHistory();
});

historySearch.addEventListener("input", renderHistory);
filterAll.addEventListener("click", () => setFilter("all"));
filterOk.addEventListener("click", () => setFilter("ok"));
filterFail.addEventListener("click", () => setFilter("fail"));
filterExplore.addEventListener("click", () => setFilter("explore"));

refreshHistory();




























