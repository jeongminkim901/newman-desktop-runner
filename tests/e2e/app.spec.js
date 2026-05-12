const { test, expect } = require("./fixtures");

test.describe("앱 UI 렌더링", () => {
  test("핵심 UI 요소가 모두 표시된다", async ({ appPage }) => {
    await expect(appPage.runButton).toBeVisible();
    await expect(appPage.historyHeading).toBeVisible();
    await expect(appPage.exploreToggle).toBeVisible();
    await expect(appPage.ruleModeSelect).toBeVisible();
    await expect(appPage.failedOnlyText).toBeVisible();
    await expect(appPage.helpButton).toBeVisible();
  });

  test("실행 버튼이 초기에 활성화되어 있다", async ({ appPage }) => {
    await expect(appPage.runButton).toBeEnabled();
  });

  test("중지 버튼이 초기에 비활성화되어 있다", async ({ appPage }) => {
    await expect(appPage.stopButton).toBeDisabled();
  });

  test("히스토리 필터 버튼이 모두 표시된다", async ({ appPage }) => {
    await expect(appPage.filterAll).toBeVisible();
    await expect(appPage.filterOk).toBeVisible();
    await expect(appPage.filterFail).toBeVisible();
    await expect(appPage.filterExplore).toBeVisible();
  });

  test("도움말 모달이 버튼 클릭으로 열린다", async ({ appPage }) => {
    await appPage.helpButton.click();
    await expect(appPage.helpModal).not.toHaveClass(/hidden/);
  });

  test("도움말 모달이 ESC 키로 닫힌다", async ({ appPage }) => {
    await appPage.helpButton.click();
    await appPage.page.keyboard.press("Escape");
    await expect(appPage.helpModal).toHaveClass(/hidden/);
  });

  test("탐색 모드가 기본으로 활성화되어 있다", async ({ appPage }) => {
    await expect(appPage.exploreEnabled).toBeChecked();
  });
});
