const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 60000,

  use: {
    trace:      "retain-on-failure",
    screenshot: "only-on-failure",
    video:      "retain-on-failure",
  },

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  projects: [
    {
      name: "ui",
      testMatch: ["app.spec.js", "workflow.spec.js", "visual.spec.js"],
    },
    {
      name: "api",
      testMatch: ["api.spec.js"],
      use: {
        // api.spec.js 는 브라우저가 필요 없음 — timeout만 넉넉하게
        extraHTTPHeaders: { Accept: "application/json" },
      },
    },
  ],
});
