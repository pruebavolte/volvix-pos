// tests/playwright.r3a-cartseeded.config.js
// B43 — Dedicated config for cart-seeded re-audit
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'https://volvix-pos.vercel.app';

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /r3a-pos-ui-cart-seeded\.spec\.js$/,
  timeout: 600_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1366, height: 800 },
    ignoreHTTPSErrors: true,
    actionTimeout: 8_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: 'r3a-cartseeded-prod',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
