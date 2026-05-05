// Playwright config — R5D / B42 Owner Panel E2E
// Test file: tests/r5d-owner-panel-e2e.spec.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['r5d-owner-panel-e2e.spec.js'],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'r5d-owner-panel-playwright-results.json' }],
  ],
  use: {
    baseURL: process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    headless: true,
  },
});
