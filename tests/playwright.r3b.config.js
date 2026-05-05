// tests/playwright.r3b.config.js
// Dedicated config for R3B INVENTORY E2E
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /r3b-inventory-e2e\.spec\.js$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // sequential — tests depend on shared state (TARGET_PRODUCT)
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'r3b-results.json' }]],
  use: {
    headless: true,
    viewport: { width: 1366, height: 800 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'off',
    baseURL: BASE_URL,
  },
  projects: [
    { name: 'r3b-prod', use: { ...devices['Desktop Chrome'] } },
  ],
});
