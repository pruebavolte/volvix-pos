// Playwright config — R5B Devoluciones E2E
// Test file: tests/r5b-devoluciones-e2e.spec.js
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /r5b-devoluciones-e2e\.spec\.js/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'r5b-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'r5b-report') }],
  ],
  use: {
    baseURL: process.env.BASE_URL || process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
