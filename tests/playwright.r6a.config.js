// Playwright config — R6A / B42 MULTIPOS Suite E2E
// Test file: tests/r6a-multipos-e2e.spec.js
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['r6a-multipos-e2e.spec.js'],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'r6a-playwright-results.json') }],
  ],
  use: {
    baseURL: process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
