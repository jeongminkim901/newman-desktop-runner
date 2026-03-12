const path = require("path");
const { test, expect } = require("@playwright/test");

test("app UI renders from index.html", async ({ page }) => {
  const filePath = path.resolve(__dirname, "../../index.html");
  const fileUrl = "file:///" + filePath.replace(/\\/g, "/");

  await page.goto(fileUrl);
  await expect(page.getByRole("button", { name: "Run Newman" })).toBeVisible();
  await expect(page.getByText("History")).toBeVisible();
});
