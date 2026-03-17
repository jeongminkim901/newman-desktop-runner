const path = require("path");
const { chromium } = require("playwright");

async function run() {
  const filePath = path.resolve(__dirname, "../../index.html");
  const fileUrl = "file:///" + filePath.replace(/\\/g, "/");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl);

  const runBtn = page.getByRole("button", { name: "실행" });
  const historyTitle = page.getByRole("heading", { name: "실행 이력" });
  const exploreToggle = page.getByText("탐색적 API 테스트 (Playwright)");
  const ruleMode = page.getByLabel("규칙 모드");
  const failedOnly = page.getByText("실패만 재탐색 (마지막 JSON 기준)");
  const helpTab = page.getByRole("button", { name: "도움말" });

  await runBtn.waitFor({ state: "visible", timeout: 5000 });
  await historyTitle.waitFor({ state: "visible", timeout: 5000 });
  await exploreToggle.waitFor({ state: "visible", timeout: 5000 });
  await ruleMode.waitFor({ state: "visible", timeout: 5000 });
  await failedOnly.waitFor({ state: "visible", timeout: 5000 });
  await helpTab.waitFor({ state: "visible", timeout: 5000 });

  await browser.close();
  console.log("E2E OK");
}

run().catch((err) => {
  console.error("E2E FAILED:", err);
  process.exit(1);
});
