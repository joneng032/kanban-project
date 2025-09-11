// Playwright test runner configuration - CI friendly
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  timeout: 30_000,
  expect: { timeout: 5000 },
  testDir: 'tests',
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['dot'], ['github']] : 'list',
  use: {
    headless: true,
    actionTimeout: 0,
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    video: process.env.CI ? 'on-first-retry' : 'off'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
