﻿const el = (id) => document.getElementById(id);

const collectionInput = el("collectionFile");
const openapiFileInput = el("openapiFile");
const openapiUrlInput = el("openapiUrl");
const loadOpenapiBtn = el("loadOpenapiBtn");
const openapiIgnoreTls = el("openapiIgnoreTls");
const openapiServerSelect = el("openapiServer");
const openapiServerCustom = el("openapiServerCustom");
const environmentInput = el("environmentFile");
const ipInput = el("ip");
const tokenInput = el("token");
const clearSavedBtn = el("clearSavedBtn");
const extraVarsInput = el("extraVars");
const collectionSearch = el("collectionSearch");
const collectionTree = el("collectionTree");
const selectAllBtn = el("selectAllBtn");
const selectNoneBtn = el("selectNoneBtn");
const useSelectedRequests = el("useSelectedRequests");
const showReqRes = el("showReqRes");
const outputDirInput = el("outputDir");
const exploreEnabled = el("exploreEnabled");
const variantsPerRequest = el("variantsPerRequest");
const exploreDelayMs = el("exploreDelayMs");
const exploreRuleMode = el("exploreRuleMode");
const exploreCustomJson = el("exploreCustomJson");
const exploreFailedOnly = el("exploreFailedOnly");
const exploreMethodVariants = el("exploreMethodVariants");
const exploreIgnoreTls = el("exploreIgnoreTls");
const exploreInclude = el("exploreInclude");
const exploreExclude = el("exploreExclude");
const useOpenapiExamples = el("useOpenapiExamples");
const repCli = el("repCli");
const repHtml = el("repHtml");
const repJson = el("repJson");
const runBtn = el("runBtn");
const stopBtn = el("stopBtn");
const pickDirBtn = el("pickDirBtn");
const logBox = el("logBox");
const historyList = el("historyList");
const statusLine = el("statusLine");
let isRunning = false;
const setRunning = (running) => {
  isRunning = running;
  if (runBtn) runBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
};
const tabHtml = el("tabHtml");
const tabJson = el("tabJson");
const tabExplore = el("tabExplore");
const tabHelp = el("tabHelp");
const tabSplit = el("tabSplit");
const tabCompare = el("tabCompare");
const htmlPreview = el("htmlPreview");
const jsonPreview = el("jsonPreview");
const htmlSoloPreview = el("htmlSoloPreview");
const jsonSoloPreview = el("jsonSoloPreview");
const splitPreview = el("splitPreview");
const comparePanel = el("comparePanel");
const compareRunSelect = el("compareRunSelect");
const compareTable = el("compareTable");
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
    const savedServer = localStorage.getItem("openapi_server");
    if (savedServer && openapiServerCustom) openapiServerCustom.value = savedServer;
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

function setError(elm, on) {
  if (!elm) return;
  if (on) elm.classList.add("input-error");
  else elm.classList.remove("input-error");
}

function setErrorText(elm, message) {
  if (!elm) return;
  const container = elm.closest("label") || elm.parentElement;
  if (!container) return;
  let msg = container.querySelector(".error-text");
  if (!message) {
    if (msg) msg.remove();
    return;
  }
  if (!msg) {
    msg = document.createElement("div");
    msg.className = "error-text";
    container.appendChild(msg);
  }
  msg.textContent = message;
}

function validateInputs(payload, isExplore) {
  let ok = true;
  const hasCollection = !!payload.collectionPath;
  const hasOpenApi = !!payload.openapiPath || !!payload.openapiUrl;

  const missingSource = !hasCollection && !hasOpenApi;
  setError(collectionInput, missingSource);
  setError(openapiFileInput, missingSource);
  setError(openapiUrlInput, missingSource);
  setErrorText(collectionInput, missingSource ? "컬렉션 파일 또는 OpenAPI URL이 필요합니다." : "");
  setErrorText(openapiUrlInput, missingSource ? "OpenAPI URL 또는 파일을 입력하세요." : "");

  const serverValue =
    (openapiServerCustom?.value || "").trim() || (openapiServerSelect?.value || "").trim();
  const requireServer = hasOpenApi && openapiActive && openapiServers.length > 0;
  if (requireServer && !serverValue) {
    setError(openapiServerSelect, true);
    setError(openapiServerCustom, true);
    setErrorText(openapiServerSelect, "OpenAPI 서버 URL을 선택/입력하세요.");
    ok = false;
  } else {
    setError(openapiServerSelect, false);
    setError(openapiServerCustom, false);
    setErrorText(openapiServerSelect, "");
  }

  if (!payload.outputDir) {
    setError(outputDirInput, true);
    setErrorText(outputDirInput, "출력 폴더를 선택하세요.");
    ok = false;
  } else {
    setError(outputDirInput, false);
    setErrorText(outputDirInput, "");
  }

  if (isExplore) {
    if (!payload.useSelectedRequests && !payload.selectedRequestNames.length) {
      setError(collectionSearch, true);
      setErrorText(collectionSearch, "탐색할 요청을 선택하세요.");
      ok = false;
    } else {
      setError(collectionSearch, false);
      setErrorText(collectionSearch, "");
    }
  } else {
    if (!payload.reporters.length) {
      setError(repHtml, true);
      setError(repJson, true);
      setError(repCli, true);
      setErrorText(repHtml, "리포터를 최소 1개 선택하세요.");
      ok = false;
    } else {
      setError(repHtml, false);
      setError(repJson, false);
      setError(repCli, false);
      setErrorText(repHtml, "");
    }
  }
  return ok;
}

let openapiActive = false;
let openapiServers = [];
const setOpenApiActive = (active) => {
  openapiActive = active;
  if (!active) openapiServers = [];
  if (collectionInput) collectionInput.disabled = active;
  if (!active && openapiServerSelect) {
    openapiServerSelect.innerHTML = `<option value="">OpenAPI를 먼저 불러오세요</option>`;
    openapiServerSelect.disabled = true;
  }
  if (!active && openapiServerCustom) {
    openapiServerCustom.value = "";
    try {
      localStorage.removeItem("openapi_server");
    } catch {
      // ignore
    }
  }
};

collectionInput.addEventListener("change", () => {
  const file = collectionInput.files[0];
  if (!file) return;
    if (openapiActive) {
      if (openapiFileInput) openapiFileInput.value = "";
      if (openapiUrlInput) openapiUrlInput.value = "";
      if (openapiIgnoreTls) openapiIgnoreTls.checked = false;
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
      if (openapiServerSelect) {
        const servers = Array.isArray(res.servers) ? res.servers : [];
        openapiServers = servers;
        const options = servers.length
          ? servers.map((url) => `<option value="${url}">${url}</option>`).join("")
          : `<option value="">(서버 목록 없음)</option>`;
        openapiServerSelect.innerHTML = options;
        openapiServerSelect.disabled = servers.length === 0;
        try {
          const saved = localStorage.getItem("openapi_server");
          if (saved && servers.includes(saved)) {
            openapiServerSelect.value = saved;
          } else if (servers.length) {
            openapiServerSelect.value = servers[0];
            localStorage.setItem("openapi_server", servers[0]);
          } else if (openapiUrl && openapiServerCustom) {
            const origin = new URL(openapiUrl).origin;
            openapiServerCustom.value = origin;
            localStorage.setItem("openapi_server", origin);
          }
        } catch {
          // ignore
        }
      }
      setError(openapiServerSelect, false);
      setError(openapiServerCustom, false);
      setErrorText(openapiServerSelect, "");
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
      localStorage.removeItem("openapi_server");
    } catch {
      // ignore localStorage errors
    }
    if (ipInput) ipInput.value = "";
    if (tokenInput) tokenInput.value = "";
    if (openapiServerSelect) openapiServerSelect.value = "";
    if (openapiServerCustom) openapiServerCustom.value = "";
    statusLine.textContent = "저장값을 지웠습니다.";
  });
}
if (openapiServerSelect) {
  openapiServerSelect.addEventListener("change", () => {
    const value = openapiServerSelect.value;
    try {
      if (value) localStorage.setItem("openapi_server", value);
      else localStorage.removeItem("openapi_server");
    } catch {
      // ignore
    }
  });
}
if (openapiServerCustom) {
  openapiServerCustom.addEventListener("input", () => {
    const value = openapiServerCustom.value.trim();
    try {
      if (value) localStorage.setItem("openapi_server", value);
      else localStorage.removeItem("openapi_server");
    } catch {
      // ignore
    }
  });
}
let historyCache = [];
let historyFilter = "all";
let lastPreviewJsonPath = "";
function appendLog(line) {
  const div = document.createElement("div");
  div.textContent = line;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

window.api.onRunLog((msg) => appendLog(msg));

window.api.onRunProgress((data) => {
  if (!data || !data.total) return;
  const pct = Math.min(100, Math.max(0, Math.floor((data.current / data.total) * 100)));
  const label = data.label ? `${data.label} ` : "";
  const typeLabel = data.type === "explore" ? "탐색" : "실행";
  statusLine.textContent = `${typeLabel} ${label}${data.current}/${data.total} (${pct}%)`;
});
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
      btn.addEventListener("click", async () => {
        const p = btn.getAttribute("data-path");
        const htmlPath = btn.getAttribute("data-preview-html");
        const jsonPath = btn.getAttribute("data-preview-json");
        if (p) {
          const res = await window.api.openPath(p);
          if (!res?.ok) statusLine.textContent = `열기 실패: ${res?.error || "알 수 없음"}`;
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

if (stopBtn) {
  stopBtn.addEventListener("click", async () => {
    if (!isRunning) return;
    statusLine.textContent = "중지 요청 중...";
    stopBtn.disabled = true;
    const res = await window.api.cancelRun();
    if (!res?.ok) statusLine.textContent = `중지 실패: ${res?.error || "알 수 없음"}`;
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
  const isCompare = mode === "compare";

  tabHtml.classList.toggle("active", isHtml);
  tabJson.classList.toggle("active", isJson);
  tabExplore.classList.toggle("active", isExplore);
  tabHelp.classList.remove("active");
  tabSplit.classList.toggle("active", isSplit);
  if (tabCompare) tabCompare.classList.toggle("active", isCompare);

  splitPreview.classList.toggle("hidden", !isSplit);
  htmlSoloPreview.classList.toggle("hidden", !isHtml);
  jsonSoloPreview.classList.toggle("hidden", !(isJson || isExplore));
  if (comparePanel) comparePanel.classList.toggle("hidden", !isCompare);

  if (isSplit) {
    htmlPreview.classList.remove("hidden");
    jsonPreview.classList.remove("hidden");
  }

  previewSummary.classList.toggle("hidden", false);
  if (previewCards) previewCards.classList.toggle("hidden", false);
  if (previewPanel) previewPanel.classList.toggle("hidden", false);
  if (failuresPanel) failuresPanel.classList.toggle("hidden", isCompare);
}

async function loadHtmlPreview(htmlPath) {
  const res = await window.api.readFile(htmlPath);
  if (res?.ok) {
    htmlPreview.srcdoc = res.text;
    htmlSoloPreview.srcdoc = res.text;
    return;
  }
  htmlPreview.srcdoc = `<pre>HTML 로드 실패: ${res?.error || "알 수 없음"}</pre>`;
  htmlSoloPreview.srcdoc = `<pre>HTML 로드 실패: ${res?.error || "알 수 없음"}</pre>`;
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
  lastPreviewJsonPath = jsonPath;
  const res = await window.api.readFile(jsonPath);
  if (res?.ok) {
    jsonPreview.textContent = res.text;
    jsonSoloPreview.textContent = res.text;
    loadJsonSummary(jsonPath, res.text);
  } else {
    jsonPreview.textContent = `JSON 로드 실패: ${res?.error || "알 수 없음"}`;
    jsonSoloPreview.textContent = `JSON 로드 실패: ${res?.error || "알 수 없음"}`;
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
      const schemaFailCount = data.summary?.schemaFailCount ?? 0;
      const semanticFailCount = data.summary?.semanticFailCount ?? 0;
      const securityWarnCount = data.summary?.securityWarnCount ?? 0;
      const authWarnCount = data.summary?.authWarnCount ?? 0;
      const variantCountByType = data.summary?.variantCountByType || {};
      const variantLine = Object.keys(variantCountByType).length
        ? ` · 변형(${Object.entries(variantCountByType).map(([k, v]) => `${k}:${v}`).join(", ")})`
        : "";

      previewSummary.textContent = `탐색 실행: ${results.length} · 실패: ${failed.length} · 스키마 실패: ${schemaFailCount} · 시맨틱 실패: ${semanticFailCount} · 보안 경고: ${securityWarnCount} · 인증 경고: ${authWarnCount}${variantLine}`;
      summaryTotal.textContent = String(results.length);
      summaryFailed.textContent = String(failed.length);
      summaryAvg.textContent = String(avg);
      summaryGroups.textContent = `${groups["2"]} / ${groups["4"]} / ${groups["5"]}`;
      const baseByName = {};
      results.filter((r) => r.variant === "base").forEach((r) => { baseByName[r.name] = r; });
      renderExploreFailureList(failed, showReqRes.checked, baseByName);
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

function buildDiffHtml(item, base) {
  if (!base) return "";
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const label = item.variant || "";
  const isBody = /^(body:|schema:|sec:body:)/.test(label);
  const isQuery = /^(query:|sec:query:)/.test(label);
  const isAuth = label.startsWith("auth:");
  const isMethod = label.startsWith("method:");

  const makeTable = (header, rows) =>
    `<table class="diff-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;

  if (isBody) {
    let baseObj = {}, varObj = {};
    try { baseObj = JSON.parse(base.request?.body || "{}") || {}; } catch { baseObj = {}; }
    try { varObj  = JSON.parse(item.request?.body  || "{}") || {}; } catch { varObj  = {}; }
    const keys = [...new Set([...Object.keys(baseObj), ...Object.keys(varObj)])];
    const rows = keys.map((k) => {
      const inBase = k in baseObj, inVar = k in varObj;
      const bv = inBase ? esc(JSON.stringify(baseObj[k])) : null;
      const vv = inVar  ? esc(JSON.stringify(varObj[k]))  : null;
      if (!inVar)        return `<tr class="dr"><td><code>${esc(k)}</code></td><td>${bv}</td><td class="dt">✕ 제거됨</td></tr>`;
      if (!inBase)       return `<tr class="da"><td><code>${esc(k)}</code></td><td>—</td><td>${vv}</td></tr>`;
      if (bv !== vv)     return `<tr class="dc"><td><code>${esc(k)}</code></td><td class="ov">${bv}</td><td class="nv">${vv}</td></tr>`;
      return `<tr class="ds"><td><code>${esc(k)}</code></td><td>${bv}</td><td>${vv}</td></tr>`;
    }).join("");
    return makeTable("<th>필드</th><th>원본</th><th>변형</th>", rows);
  }

  if (isQuery) {
    const parseQ = (url) => { const p = {}; try { new URL(url).searchParams.forEach((v, k) => { p[k] = v; }); } catch {} return p; };
    const baseQ = parseQ(base.url || ""), varQ = parseQ(item.url || "");
    const keys = [...new Set([...Object.keys(baseQ), ...Object.keys(varQ)])];
    const rows = keys.map((k) => {
      const inBase = k in baseQ, inVar = k in varQ;
      const bv = inBase ? esc(JSON.stringify(baseQ[k])) : null;
      const vv = inVar  ? esc(JSON.stringify(varQ[k]))  : null;
      if (!inVar)    return `<tr class="dr"><td><code>${esc(k)}</code></td><td>${bv}</td><td class="dt">✕ 제거됨</td></tr>`;
      if (!inBase)   return `<tr class="da"><td><code>${esc(k)}</code></td><td>—</td><td>${vv}</td></tr>`;
      if (bv !== vv) return `<tr class="dc"><td><code>${esc(k)}</code></td><td class="ov">${bv}</td><td class="nv">${vv}</td></tr>`;
      return `<tr class="ds"><td><code>${esc(k)}</code></td><td>${bv}</td><td>${vv}</td></tr>`;
    }).join("");
    return makeTable("<th>파라미터</th><th>원본</th><th>변형</th>", rows);
  }

  if (isAuth) {
    const getAuth = (r) => r?.request?.headers?.Authorization || r?.request?.headers?.authorization || "(없음)";
    return makeTable(
      "<th>헤더</th><th>원본</th><th>변형</th>",
      `<tr class="dc"><td><code>Authorization</code></td><td class="ov">${esc(getAuth(base))}</td><td class="nv">${esc(getAuth(item))}</td></tr>`
    );
  }

  if (isMethod) {
    return makeTable(
      "<th>항목</th><th>원본</th><th>변형</th>",
      `<tr class="dc"><td><code>Method</code></td><td class="ov">${esc(base.method)}</td><td class="nv">${esc(item.method)}</td></tr>`
    );
  }

  return "";
}

function renderExploreFailureList(failed, showDetails, baseByName = {}) {
  failureList.innerHTML = "";
  if (!failed.length) {
    const li = document.createElement("li");
    li.textContent = "실패 없음.";
    failureList.appendChild(li);
    return;
  }

  const methodVariants = failed.filter((item) => item.variantType === "method" || item.isMethodVariant);
  const otherVariants = failed.filter((item) => !(item.variantType === "method" || item.isMethodVariant));
  const sections = [
    { title: "Method 변형", list: methodVariants },
    { title: "기타 변형", list: otherVariants }
  ];

  sections.forEach((section) => {
    if (!section.list.length) return;
    const header = document.createElement("li");
    header.className = "section-title";
    header.textContent = section.title;
    failureList.appendChild(header);
    section.list.slice(0, 50).forEach((item) => {
      const li = document.createElement("li");
      const status = item.status || "-";
      const err = item.error || "";
      const tags = [];
      if (item.variantType === "method" || item.isMethodVariant) tags.push("Method");
      if (item.schemaErrors && item.schemaErrors.length) tags.push("Schema");
      if (item.semanticErrors && item.semanticErrors.length) tags.push("Semantic");
      if (item.securityWarnings && item.securityWarnings.length) tags.push("Security");
      if (item.authWarnings && item.authWarnings.length) tags.push("Auth");
      const tagHtml = tags.length ? ` ${tags.map((t) => `<span class="tag">${t}</span>`).join(" ")}` : "";
      const diffHtml = buildDiffHtml(item, baseByName[item.name]);
      li.innerHTML = `
        <div class="row">
          <div><strong>${item.method}</strong> <span class="status">${status}</span>${tagHtml}</div>
          <div>${item.name || ""}</div>
        </div>
        <div class="row">
          <div class="url">${item.url || ""}</div>
          <div>${item.variant || ""} ${err ? "· " + err : ""}</div>
        </div>
        ${diffHtml ? `<details class="diff-details"><summary>▶ 변형 내용 보기</summary>${diffHtml}</details>` : ""}
        ${showDetails ? `<pre class="reqres">요청\n${item.request?.body || ""}</pre><pre class="reqres">응답\n${item.response?.body || ""}</pre>` : ""}
      `;
      failureList.appendChild(li);
    });
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

if (tabCompare) {
  tabCompare.addEventListener("click", () => {
    populateCompareSelect();
    setPreviewMode("compare");
  });
}

function populateCompareSelect() {
  if (!compareRunSelect) return;
  const current = compareRunSelect.value;
  compareRunSelect.innerHTML = '<option value="">— 비교할 실행 선택 —</option>';
  historyCache.filter((item) => item.label === "explore" && item.reportJson).forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.reportJson;
    opt.textContent = `${item.id} · ${item.ok ? "OK" : "FAIL"} · ${item.startedAt || ""}`;
    compareRunSelect.appendChild(opt);
  });
  if (current) compareRunSelect.value = current;
}

async function loadJsonData(jsonPath) {
  try {
    const res = await window.api.readFile(jsonPath);
    if (res?.ok) return JSON.parse(res.text);
  } catch { /* empty */ }
  return null;
}

async function renderCompareView() {
  if (!compareTable) return;
  const path2 = compareRunSelect?.value;
  if (!path2 || !lastPreviewJsonPath) {
    compareTable.innerHTML = '<div class="compare-hint">현재 JSON 미리보기를 먼저 열고, 비교할 실행을 선택하세요.</div>';
    return;
  }
  compareTable.innerHTML = '<div class="compare-hint">로딩 중...</div>';
  const [data1, data2] = await Promise.all([loadJsonData(lastPreviewJsonPath), loadJsonData(path2)]);
  if (!data1 || !data2) {
    compareTable.innerHTML = '<div class="compare-hint">JSON 로드 실패</div>';
    return;
  }
  if (data1.type !== "explore" || data2.type !== "explore") {
    compareTable.innerHTML = '<div class="compare-hint">탐색 실행 결과(explore)만 비교할 수 있습니다.</div>';
    return;
  }

  // Index by name+variant
  const idx2 = {};
  (data2.results || []).forEach((r) => { idx2[`${r.name}|${r.variant}`] = r; });

  const allKeys = [...new Set([
    ...(data1.results || []).map((r) => `${r.name}|${r.variant}`),
    ...(data2.results || []).map((r) => `${r.name}|${r.variant}`)
  ])];

  const s1 = data1.summary || {};
  const s2 = data2.summary || {};
  const run1Label = data1.startedAt || "실행 1";
  const run2Label = data2.startedAt || "실행 2";

  const summaryHtml = `<div class="compare-summary">
    <span>실행 1: <strong>${s1.total ?? "-"}</strong> 총 / <strong class="${s1.failed > 0 ? "c-fail" : "c-ok"}">${s1.failed ?? "-"}</strong> 실패</span>
    <span>실행 2: <strong>${s2.total ?? "-"}</strong> 총 / <strong class="${s2.failed > 0 ? "c-fail" : "c-ok"}">${s2.failed ?? "-"}</strong> 실패</span>
  </div>`;

  const rowsHtml = allKeys.map((key) => {
    const r1 = (data1.results || []).find((r) => `${r.name}|${r.variant}` === key);
    const r2 = idx2[key];
    const s1v = r1?.status ?? "—";
    const s2v = r2?.status ?? "—";
    const changed = r1 && r2 && s1v !== s2v;
    const [name, variant] = key.split("|");
    const rowClass = changed ? "cmp-changed" : !r1 ? "cmp-new" : !r2 ? "cmp-removed" : "";
    const badge = changed ? '<span class="cmp-badge changed">변경</span>' : !r1 ? '<span class="cmp-badge new">추가</span>' : !r2 ? '<span class="cmp-badge removed">제거</span>' : "";
    const cls1 = r1?.status >= 500 ? "s5" : r1?.status >= 400 ? "s4" : r1?.status >= 200 ? "s2" : "";
    const cls2 = r2?.status >= 500 ? "s5" : r2?.status >= 400 ? "s4" : r2?.status >= 200 ? "s2" : "";
    return `<tr class="${rowClass}">
      <td>${name}</td><td>${variant} ${badge}</td>
      <td class="${cls1}">${s1v}</td><td>${r1?.durationMs ?? "—"}ms</td>
      <td class="${cls2}">${s2v}</td><td>${r2?.durationMs ?? "—"}ms</td>
    </tr>`;
  }).join("");

  compareTable.innerHTML = `${summaryHtml}
  <table class="cmp-table">
    <thead><tr>
      <th>요청</th><th>Variant</th>
      <th colspan="2">실행 1 — ${run1Label}</th>
      <th colspan="2">실행 2 — ${run2Label}</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

if (compareRunSelect) compareRunSelect.addEventListener("change", renderCompareView);

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
  const fail = (msg) => {
    statusLine.textContent = msg;
    appendLog(`[ui] 실행 중단: ${msg}`);
    setRunning(false);
  };

  const reporters = [];

  if (repCli.checked) reporters.push("cli");
  if (repHtml.checked) reporters.push("html");
  if (repJson.checked) reporters.push("json");

  let failedRequestNames = [];
  if (exploreEnabled?.checked && exploreFailedOnly?.checked) {
    if (!lastPreviewJsonPath) {
      return fail("이전 결과 JSON 경로가 없습니다.");
    }
    try {
      const res = await fetch(`file:///${lastPreviewJsonPath.replace(/\\\\/g, "/")}`);
      const text = await res.text();
      failedRequestNames = extractFailedNamesFromJson(text);
      if (!failedRequestNames.length) {
        return fail("JSON에서 실패한 요청이 없습니다.");
      }
    } catch (e) {
      return fail(`JSON 읽기 실패: ${e.message}`);
    }
  }

  const payload = {
    collectionPath: collectionInput.files[0]?.path,
    openapiPath: openapiFileInput?.files?.[0]?.path,
    openapiUrl: openapiUrlInput?.value?.trim(),
    openapiIgnoreTls: !!openapiIgnoreTls?.checked || !!exploreIgnoreTls?.checked,
    openapiServerUrl: openapiServerCustom?.value?.trim() || openapiServerSelect?.value?.trim(),
    environmentPath: environmentInput.files[0]?.path,
    ip: ipInput.value.trim(),
    token: tokenInput.value.trim(),
    extraVarsJson: extraVarsInput.value.trim(),
    selectedRequestNames: selectedRequestNames(),
    useSelectedRequests: useSelectedRequests.checked,
    outputDir: outputDirInput.value.trim(),
    variantsPerRequest: Number(variantsPerRequest?.value || 3),
    exploreDelayMs: Number(exploreDelayMs?.value || 300),
    exploreRuleMode: exploreFailedOnly?.checked ? "extended" : (exploreRuleMode?.value || "basic"),
    exploreCustomJson: exploreCustomJson?.value?.trim(),
    ignoreTls: !!exploreIgnoreTls?.checked,
    failedOnly: !!exploreFailedOnly?.checked,
    methodVariants: !!exploreMethodVariants?.checked,
    hardMode: false,
    semanticMode: "openapi",
    useOpenapiExamples: !!useOpenapiExamples?.checked,
    failedRequestNames,
    exploreInclude: exploreInclude?.value?.trim(),
    exploreExclude: exploreExclude?.value?.trim(),
    reporters,
    iterationCount: 1,
    timeoutRequest: 300000,
    delayRequest: 0,
    bail: false,
    newmanIgnoreTls: !!exploreIgnoreTls?.checked
  };

  const isExplore = !!exploreEnabled?.checked;
  if (!validateInputs(payload, isExplore)) {
    return fail("입력값을 확인하세요. 필수 항목을 채워주세요.");
  }

  if (!payload.collectionPath && !payload.openapiPath && !payload.openapiUrl) {
    return fail("컬렉션 또는 OpenAPI가 필요합니다.");
  }
  if (!payload.outputDir) {
    return fail("출력 폴더가 필요합니다.");
  }
  if (!payload.reporters.length && !exploreEnabled?.checked) {
    return fail("리포터를 최소 1개 선택하세요.");
  }

  appendLog("[ui] 실행 시작");

  setRunning(true);

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
    statusLine.textContent = res.error === "cancelled" ? "중지됨" : `실패: ${res.error}`;
    appendLog(res.error === "cancelled" ? "[ui] 중지됨" : `[ui] 실패: ${res.error}`);
  }

  appendLog(res.error === "cancelled" ? "[ui] 중지됨" : "[ui] 실행 종료");
  setRunning(false);
  await refreshHistory();
});

historySearch.addEventListener("input", renderHistory);
filterAll.addEventListener("click", () => setFilter("all"));
filterOk.addEventListener("click", () => setFilter("ok"));
filterFail.addEventListener("click", () => setFilter("fail"));
filterExplore.addEventListener("click", () => setFilter("explore"));

refreshHistory();








































