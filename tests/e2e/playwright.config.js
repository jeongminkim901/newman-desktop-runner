const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  timeout: 60000,
  testDir: __dirname,
  use: {
    trace: "retain-on-failure"
  }
});
