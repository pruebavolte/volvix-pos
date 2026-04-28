// Playwright config — B42 multi-tenant users e2e
// Test file: tests/users-multitenant-e2e.spec.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['users-multitenant-e2e.spec.js'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'b42-playwright-results.json' }]],
  use: {
    baseURL: process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
