// Playwright config — R6F Recargas E2E
// Test file: tests/r6f-recargas-e2e.spec.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['r6f-recargas-e2e.spec.js'],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'r6f-results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
