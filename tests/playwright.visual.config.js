// tests/playwright.visual.config.js
// Dedicated config for the B40 Visual Audit suite.
//
// TEST_TARGET=local (default) → http://localhost:3000
// TEST_TARGET=prod  → https://volvix-pos.vercel.app
//
// Run:
//   npx playwright test --config=tests/playwright.visual.config.js
//   TEST_TARGET=prod npx playwright test --config=tests/playwright.visual.config.js
//
// Notes:
// - Single worker (avoid screenshot file races + JSONL append races)
// - 60s timeout per test (we click many buttons per screen)
// - slowMo: 200ms so animations/modals can complete before screenshot
// - headless: true so it can run in CI; set HEADED=1 to watch locally
const { defineConfig, devices } = require('@playwright/test');

const TARGET = process.env.TEST_TARGET || 'local';
const BASE_URL = process.env.BASE_URL
  || (TARGET === 'prod' ? 'https://volvix-pos.vercel.app' : 'http://localhost:3000');

const HEADED = process.env.HEADED === '1' || process.env.HEADED === 'true';

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /visual-audit\.spec\.js$/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-visual' }],
  ],
  use: {
    headless: !HEADED,
    launchOptions: {
      slowMo: 200,
    },
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: TARGET === 'prod' ? 'visual-prod' : 'visual-local',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
