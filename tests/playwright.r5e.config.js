// Playwright config for R5E / B42 — Promociones / Cupones / Descuentos E2E
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /r5e-promociones-e2e\.spec\.js/,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'r5e-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'r5e-report') }],
  ],
  use: {
    baseURL: process.env.BASE_URL || process.env.VOLVIX_BASE_URL || 'https://volvix-pos.vercel.app',
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
