const path = require("path");

const FILE_URL = "file:///" + path.resolve(__dirname, "../../../index.html").replace(/\\/g, "/");

// Injected before page scripts run — provides window.api stub so renderer.js doesn't throw.
// Tests can override __mockRunResult / __mockExploreResult via page.evaluate() before clicking Run.
const API_MOCK_SCRIPT = `
  window.__apiCallbacks = {};
  window.__mockRunResult = null;
  window.__mockExploreResult = null;
  window.api = {
    onRunLog:      (cb) => { window.__apiCallbacks.log = cb; },
    onRunProgress: (cb) => { window.__apiCallbacks.progress = cb; },
    onOpenHelp:    (cb) => { window.__apiCallbacks.openHelp = cb; },
    getHistory:    async () => [],
    runNewman:     async (payload) => {
      window.__lastPayload = payload;
      return window.__mockRunResult || { ok: true, reportJson: null, reportHtml: null };
    },
    runExploratory: async (payload) => {
      window.__lastPayload = payload;
      return window.__mockExploreResult || { ok: true, reportJson: null };
    },
    openPath:     async () => ({ ok: true }),
    readFile:     async () => ({ ok: false, error: "not found" }),
    pickOutputDir: async () => {
      document.getElementById("outputDir").value = "/fake/output";
      return "/fake/output";
    },
    cancelRun:  async () => ({ ok: true }),
    loadOpenApi: async () => ({ ok: false, error: "test mode" }),
  };
`;

class AppPage {
  constructor(page) {
    this.page = page;

    // Buttons
    this.runButton  = page.getByRole("button", { name: "실행" });
    this.stopButton = page.getByRole("button", { name: "중지" });
    this.helpButton = page.getByRole("button", { name: "도움말" });

    // Headings / sections
    this.historyHeading = page.getByRole("heading", { name: "실행 이력" });

    // Explore section
    this.exploreToggle    = page.getByText("탐색적 API 테스트 (Playwright)");
    this.ruleModeSelect   = page.getByLabel("규칙 모드");
    this.failedOnlyText   = page.getByText("실패만 재탐색 (마지막 JSON 기준)");

    // Form inputs
    this.outputDirInput   = page.locator("#outputDir");
    this.exploreEnabled   = page.locator("#exploreEnabled");
    this.useSelectedReqs  = page.locator("#useSelectedRequests");
    this.repJsonCheckbox  = page.locator("#repJson");

    // Status / log
    this.statusLine = page.locator("#statusLine");
    this.logBox     = page.locator("#logBox");
    this.helpModal  = page.locator("#helpModal");

    // History filters
    this.filterAll     = page.locator("#filterAll");
    this.filterOk      = page.locator("#filterOk");
    this.filterFail    = page.locator("#filterFail");
    this.filterExplore = page.locator("#filterExplore");
  }

  async goto() {
    await this.page.addInitScript(API_MOCK_SCRIPT);
    await this.page.goto(FILE_URL);
  }

  /** Mock collectionInput.files[0].path without an actual file picker */
  async injectCollectionPath(collectionPath) {
    await this.page.evaluate((p) => {
      const input = document.getElementById("collectionFile");
      Object.defineProperty(input, "files", {
        get: () => [{ path: p, name: "collection.json" }],
        configurable: true,
      });
    }, collectionPath);
  }

  async setMockRunResult(result) {
    await this.page.evaluate((r) => { window.__mockRunResult = r; }, result);
  }

  async setMockExploreResult(result) {
    await this.page.evaluate((r) => { window.__mockExploreResult = r; }, result);
  }

  /** Simulate an IPC log event arriving from the main process */
  async triggerLogMessage(msg) {
    await this.page.evaluate((m) => window.__apiCallbacks?.log?.(m), msg);
  }

  /** Simulate a progress event from the main process */
  async triggerProgress(data) {
    await this.page.evaluate((d) => window.__apiCallbacks?.progress?.(d), data);
  }

  async getStatusText() {
    return this.statusLine.textContent();
  }
}

module.exports = { AppPage, FILE_URL };
