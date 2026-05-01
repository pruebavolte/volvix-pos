// Playwright config — root del repo, lee tests de tests-e2e/
const { defineConfig, devices } = require('@playwright/test');

const isCI = !!process.env.CI;
const defaultBase = process.env.NODE_ENV === 'production'
  ? 'https://volvix-pos.vercel.app'
  : 'http://localhost:3000';

module.exports = defineConfig({
  testDir: './tests-e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 2,
  workers: 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    headless: true,
    viewport: { width: 1366, height: 800 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    baseURL: process.env.BASE_URL || process.env.PREVIEW_URL || defaultBase,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
