// Playwright config for B42 — MVP Core E2E
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /mvp-core-e2e\.spec\.js/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'b42-mvp-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'b42-mvp-report') }],
  ],
  use: {
    baseURL: process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
