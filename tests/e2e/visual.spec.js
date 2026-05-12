/**
 * 시각적 회귀 테스트 (Visual Regression).
 *
 * 첫 실행 시 스냅샷이 없으면 기준 이미지가 생성되고 테스트는 실패합니다.
 * 기준 이미지를 수락하려면:
 *   npx playwright test visual.spec.js --update-snapshots
 * 이후 실행부터 UI 변경이 기준과 다를 경우 테스트가 실패합니다.
 */

const { test, expect } = require("./fixtures");

test.describe("시각적 회귀", () => {
  test("초기 앱 화면", async ({ appPage }) => {
    // 히스토리 API가 완전히 렌더링될 때까지 대기
    await expect(appPage.runButton).toBeVisible();

    await expect(appPage.page).toHaveScreenshot("app-initial.png", {
      fullPage: true,
      // 동적으로 바뀔 수 있는 statusLine 영역은 마스킹
      mask: [appPage.statusLine],
    });
  });

  test("탐색 모드 활성화 화면 (기본 상태)", async ({ appPage }) => {
    // exploreEnabled는 기본 on — 탐색 옵션 패널이 표시됨
    await expect(appPage.ruleModeSelect).toBeVisible();

    await expect(appPage.page).toHaveScreenshot("app-explore-on.png", {
      fullPage: true,
      mask: [appPage.statusLine],
    });
  });

  test("입력 오류 상태 화면", async ({ appPage }) => {
    // 필수 입력 없이 실행 → 오류 하이라이트
    await appPage.exploreEnabled.uncheck();
    await appPage.runButton.click();

    await expect(appPage.page.locator(".input-error").first()).toBeVisible();

    await expect(appPage.page).toHaveScreenshot("app-validation-error.png", {
      fullPage: true,
      mask: [appPage.statusLine],
    });
  });

  test("도움말 모달 오픈 화면", async ({ appPage }) => {
    await appPage.helpButton.click();
    await expect(appPage.helpModal).not.toHaveClass(/hidden/);

    await expect(appPage.page).toHaveScreenshot("app-help-modal.png", {
      fullPage: true,
    });
  });
});
