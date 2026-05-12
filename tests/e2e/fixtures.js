const { test: base, expect } = require("@playwright/test");
const { AppPage } = require("./pages/AppPage");

/**
 * Extends the base Playwright test with an `appPage` fixture.
 * Each test gets a fresh AppPage with window.api already mocked.
 */
const test = base.extend({
  appPage: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.goto();
    await use(app);
  },
});

module.exports = { test, expect };
