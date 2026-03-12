const path = require("path");
const { chromium } = require("playwright");

async function run() {
  const filePath = path.resolve(__dirname, "../../index.html");
  const fileUrl = "file:///" + filePath.replace(/\\/g, "/");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fileUrl);

  const runBtn = page.getByRole("button", { name: "Run Newman" });
  const historyTitle = page.getByText("History");
  const exploreToggle = page.getByText("Exploratory API test (Playwright)");
  const ruleMode = page.getByText("Rule mode");
  const failedOnly = page.getByText("Re-explore failed only");

  await runBtn.waitFor({ state: "visible", timeout: 5000 });
  await historyTitle.waitFor({ state: "visible", timeout: 5000 });
  await exploreToggle.waitFor({ state: "visible", timeout: 5000 });
  await ruleMode.waitFor({ state: "visible", timeout: 5000 });
  await failedOnly.waitFor({ state: "visible", timeout: 5000 });

  await browser.close();
  console.log("E2E OK");
}

run().catch((err) => {
  console.error("E2E FAILED:", err);
  process.exit(1);
});
