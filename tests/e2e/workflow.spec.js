const { test, expect } = require("./fixtures");

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

async function setupNewmanRun(appPage, mockResult) {
  await appPage.exploreEnabled.uncheck();          // explore는 기본 on이므로 해제
  await appPage.injectCollectionPath("/fake/collection.json");
  await appPage.repJsonCheckbox.check();
  await appPage.outputDirInput.fill("/fake/output");
  if (mockResult) await appPage.setMockRunResult(mockResult);
}

async function setupExploreRun(appPage, mockResult) {
  // exploreEnabled는 기본 on
  await appPage.injectCollectionPath("/fake/collection.json");
  await appPage.outputDirInput.fill("/fake/output");
  await appPage.useSelectedReqs.check();           // 요청 선택 없이 통과
  if (mockResult) await appPage.setMockExploreResult(mockResult);
}

// ─── Newman 실행 워크플로우 ────────────────────────────────────────────────────

test.describe("Newman 실행 워크플로우", () => {
  test("컬렉션 없이 실행 시 입력 오류가 표시된다", async ({ appPage }) => {
    await appPage.exploreEnabled.uncheck();
    await appPage.repJsonCheckbox.check();
    await appPage.outputDirInput.fill("/fake/output");

    await appPage.runButton.click();

    await expect(appPage.page.locator(".input-error").first()).toBeVisible();
  });

  test("출력 폴더 없이 실행 시 입력 오류가 표시된다", async ({ appPage }) => {
    await appPage.exploreEnabled.uncheck();
    await appPage.injectCollectionPath("/fake/collection.json");
    await appPage.repJsonCheckbox.check();
    // outputDir 미입력

    await appPage.runButton.click();

    await expect(appPage.page.locator(".input-error").first()).toBeVisible();
  });

  test("리포터 미선택 시 입력 오류가 표시된다", async ({ appPage }) => {
    await appPage.exploreEnabled.uncheck();
    await appPage.injectCollectionPath("/fake/collection.json");
    await appPage.outputDirInput.fill("/fake/output");
    // CLI/HTML/JSON 모두 기본 checked — 전부 해제
    await appPage.page.locator("#repCli").uncheck();
    await appPage.page.locator("#repHtml").uncheck();
    await appPage.page.locator("#repJson").uncheck();

    await appPage.runButton.click();

    await expect(appPage.page.locator(".input-error").first()).toBeVisible();
  });

  test("실행 성공 시 statusLine에 '완료'가 표시된다", async ({ appPage }) => {
    await setupNewmanRun(appPage, {
      ok: true,
      reportJson: "/fake/report.json",
      reportHtml: null,
    });

    await appPage.runButton.click();

    await expect(appPage.statusLine).toContainText("완료", { timeout: 10000 });
  });

  test("실행 실패 시 statusLine에 '실패'가 표시된다", async ({ appPage }) => {
    await setupNewmanRun(appPage, { ok: false, error: "newman crashed" });

    await appPage.runButton.click();

    await expect(appPage.statusLine).toContainText("실패", { timeout: 10000 });
  });

  test("실행 중 runButton이 비활성화된다", async ({ appPage }) => {
    // runNewman이 resolve될 때까지 잠시 지연되는 mock
    await appPage.exploreEnabled.uncheck();
    await appPage.injectCollectionPath("/fake/collection.json");
    await appPage.repJsonCheckbox.check();
    await appPage.outputDirInput.fill("/fake/output");
    await appPage.page.evaluate(() => {
      window.__mockRunResult = new Promise((res) =>
        setTimeout(() => res({ ok: true, reportJson: null, reportHtml: null }), 500)
      );
    });

    await appPage.runButton.click();
    await expect(appPage.runButton).toBeDisabled();
    await expect(appPage.stopButton).toBeEnabled();

    // 완료 대기
    await expect(appPage.statusLine).toContainText("완료", { timeout: 5000 });
  });

  test("IPC 로그 이벤트가 logBox에 출력된다", async ({ appPage }) => {
    await appPage.triggerLogMessage("컬렉션 실행 시작");

    await expect(appPage.logBox).toContainText("컬렉션 실행 시작");
  });

  test("진행률 이벤트가 statusLine에 반영된다", async ({ appPage }) => {
    await appPage.triggerProgress({ current: 4, total: 10, label: "GET /users", type: "run" });

    await expect(appPage.statusLine).toContainText("4/10");
  });

  test("폴더 선택 버튼 클릭 시 outputDir가 채워진다", async ({ appPage }) => {
    await appPage.page.locator("#pickDirBtn").click();

    await expect(appPage.outputDirInput).toHaveValue("/fake/output");
  });
});

// ─── 탐색적 API 테스트 워크플로우 ─────────────────────────────────────────────

test.describe("탐색적 API 테스트 워크플로우", () => {
  test("요청 미선택 상태에서 탐색 실행 시 입력 오류가 표시된다", async ({ appPage }) => {
    // exploreEnabled 기본 on, useSelectedRequests 미체크, selection 비어있음
    await appPage.injectCollectionPath("/fake/collection.json");
    await appPage.outputDirInput.fill("/fake/output");

    await appPage.runButton.click();

    await expect(appPage.page.locator(".input-error").first()).toBeVisible();
  });

  test("탐색 실행 성공 시 statusLine에 '탐색 완료'가 표시된다", async ({ appPage }) => {
    await setupExploreRun(appPage, { ok: true, reportJson: "/fake/explore.json" });

    await appPage.runButton.click();

    await expect(appPage.statusLine).toContainText("탐색 완료", { timeout: 10000 });
  });

  test("탐색 실행 실패 시 statusLine에 '실패'가 표시된다", async ({ appPage }) => {
    await setupExploreRun(appPage, { ok: false, error: "explore error" });

    await appPage.runButton.click();

    await expect(appPage.statusLine).toContainText("실패", { timeout: 10000 });
  });

  test("탐색 진행률 이벤트에 '탐색' 레이블이 표시된다", async ({ appPage }) => {
    await appPage.triggerProgress({ current: 2, total: 5, label: "POST /items", type: "explore" });

    await expect(appPage.statusLine).toContainText("탐색");
    await expect(appPage.statusLine).toContainText("2/5");
  });

  test("규칙 모드 드롭다운에서 '확장'을 선택할 수 있다", async ({ appPage }) => {
    await appPage.ruleModeSelect.selectOption("extended");

    await expect(appPage.ruleModeSelect).toHaveValue("extended");
  });
});
