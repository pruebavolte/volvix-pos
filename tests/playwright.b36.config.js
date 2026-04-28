// tests/playwright.b36.config.js
// Dedicated config for B36 regression suite.
// TEST_TARGET=local (default) → http://localhost:3000
// TEST_TARGET=prod  → https://volvix-pos.vercel.app
//
// Run:
//   npx playwright test --config=tests/playwright.b36.config.js
//   TEST_TARGET=prod npx playwright test --config=tests/playwright.b36.config.js
const { defineConfig, devices } = require('@playwright/test');

const TARGET = process.env.TEST_TARGET || 'local';
const BASE_URL = process.env.BASE_URL
  || (TARGET === 'prod' ? 'https://volvix-pos.vercel.app' : 'http://localhost:3000');

module.exports = defineConfig({
  testDir: __dirname,
  // B41 perf audit: allow both b36-regression and performance specs.
  testMatch: /(b36-regression|performance)\.spec\.js$/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: 4,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-b36' }],
  ],
  use: {
    headless: true,
    viewport: { width: 1366, height: 800 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: TARGET === 'prod' ? 'prod' : 'local',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
