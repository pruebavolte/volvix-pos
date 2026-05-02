/**
 * volvix-playwright-tests.js
 * Alternative Playwright test suite for Volvix POS
 * - Page Object Model
 * - Fixtures
 * - Multi-browser (Chromium, Firefox, WebKit)
 * - 15+ tests
 *
 * Exposes window.PlaywrightTests with run/list/registry helpers.
 * Designed to run inside Playwright (require('@playwright/test')) AND
 * to be loaded in a browser to inspect available tests via window.PlaywrightTests.
 */
'use strict';

/* ============================================================
 * 1. Safe imports (works both in Node/Playwright and in browser)
 * ============================================================ */
let test, expect, devices;
try {
  // eslint-disable-next-line global-require
  const pw = require('@playwright/test');
  test = pw.test;
  expect = pw.expect;
  devices = pw.devices;
} catch (_) {
  // Browser context — provide stubs so file can still be loaded.
  test = function stubTest(name, fn) { stubTest._tests.push({ name, fn }); };
  test._tests = [];
  test.describe = (name, fn) => { fn && fn(); };
  test.beforeEach = () => {};
  test.afterEach = () => {};
  test.use = () => {};
  test.extend = (fixtures) => Object.assign(stubTest, { _fixtures: fixtures });
  expect = (v) => ({
    toBe: (x) => v === x,
    toEqual: (x) => JSON.stringify(v) === JSON.stringify(x),
    toContain: (x) => String(v).includes(x),
    toBeTruthy: () => !!v,
    toBeVisible: () => true,
    toHaveURL: () => true,
    toHaveText: () => true,
    toHaveCount: () => true,
    not: { toBe: (x) => v !== x, toBeVisible: () => true }
  });
  devices = {
    'Desktop Chrome': { viewport: { width: 1280, height: 720 } },
    'Desktop Firefox': { viewport: { width: 1280, height: 720 } },
    'Desktop Safari':  { viewport: { width: 1280, height: 720 } },
    'iPhone 13':       { viewport: { width: 390,  height: 844 } }
  };
}

/* ============================================================
 * 2. Configuration
 * ============================================================ */
const CONFIG = Object.freeze({
  baseURL: process?.env?.VOLVIX_URL || 'http://localhost:3000',
  user:    { email: 'admin@volvix.test', password: 'Admin123!' },
  timeout: 30_000,
  retries: 2,
  browsers: ['chromium', 'firefox', 'webkit']
});

/* ============================================================
 * 3. Page Objects
 * ============================================================ */
class BasePage {
  constructor(page) { this.page = page; }
  async goto(path = '/') { await this.page.goto(CONFIG.baseURL + path); }
  async title() { return this.page.title(); }
  async screenshot(name) { return this.page.screenshot({ path: `./screenshots/${name}.png` }); }
}

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.email    = page.locator('[data-test="login-email"]');
    this.password = page.locator('[data-test="login-password"]');
    this.submit   = page.locator('[data-test="login-submit"]');
    this.error    = page.locator('[data-test="login-error"]');
  }
  async open() { await this.goto('/login'); }
  async login(email, password) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}

class DashboardPage extends BasePage {
  constructor(page) {
    super(page);
    this.welcome   = page.locator('[data-test="dashboard-welcome"]');
    this.salesCard = page.locator('[data-test="card-sales"]');
    this.menuPOS   = page.locator('[data-test="menu-pos"]');
    this.menuLogout= page.locator('[data-test="menu-logout"]');
  }
  async open() { await this.goto('/dashboard'); }
  async goToPOS() { await this.menuPOS.click(); }
  async logout() { await this.menuLogout.click(); }
}

class POSPage extends BasePage {
  constructor(page) {
    super(page);
    this.search   = page.locator('[data-test="pos-search"]');
    this.products = page.locator('[data-test="pos-product"]');
    this.cart     = page.locator('[data-test="pos-cart-item"]');
    this.total    = page.locator('[data-test="pos-total"]');
    this.checkout = page.locator('[data-test="pos-checkout"]');
    this.confirm  = page.locator('[data-test="pos-confirm"]');
    this.receipt  = page.locator('[data-test="pos-receipt"]');
  }
  async open() { await this.goto('/pos'); }
  async addProduct(sku) {
    await this.search.fill(sku);
    await this.products.first().click();
  }
  async pay() {
    await this.checkout.click();
    await this.confirm.click();
  }
}

class InventoryPage extends BasePage {
  constructor(page) {
    super(page);
    this.addBtn = page.locator('[data-test="inv-add"]');
    this.name   = page.locator('[data-test="inv-name"]');
    this.sku    = page.locator('[data-test="inv-sku"]');
    this.price  = page.locator('[data-test="inv-price"]');
    this.save   = page.locator('[data-test="inv-save"]');
    this.rows   = page.locator('[data-test="inv-row"]');
  }
  async open() { await this.goto('/inventory'); }
  async addItem(item) {
    await this.addBtn.click();
    await this.name.fill(item.name);
    await this.sku.fill(item.sku);
    await this.price.fill(String(item.price));
    await this.save.click();
  }
}

class ReportsPage extends BasePage {
  constructor(page) {
    super(page);
    this.dateFrom = page.locator('[data-test="rep-from"]');
    this.dateTo   = page.locator('[data-test="rep-to"]');
    this.run      = page.locator('[data-test="rep-run"]');
    this.chart    = page.locator('[data-test="rep-chart"]');
    this.export   = page.locator('[data-test="rep-export"]');
  }
  async open() { await this.goto('/reports'); }
  async runRange(from, to) {
    await this.dateFrom.fill(from);
    await this.dateTo.fill(to);
    await this.run.click();
  }
}

/* ============================================================
 * 4. Fixtures
 * ============================================================ */
const volvixTest = test.extend({
  loginPage:     async ({ page }, use) => { await use(new LoginPage(page)); },
  dashboardPage: async ({ page }, use) => { await use(new DashboardPage(page)); },
  posPage:       async ({ page }, use) => { await use(new POSPage(page)); },
  inventoryPage: async ({ page }, use) => { await use(new InventoryPage(page)); },
  reportsPage:   async ({ page }, use) => { await use(new ReportsPage(page)); },

  authedPage: async ({ page }, use) => {
    const lp = new LoginPage(page);
    await lp.open();
    await lp.login(CONFIG.user.email, CONFIG.user.password);
    await page.waitForURL(/dashboard/);
    await use(page);
  },

  apiContext: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: CONFIG.baseURL });
    await use(ctx);
    await ctx.dispose();
  }
});

/* ============================================================
 * 5. Test Registry (also exposed on window.PlaywrightTests)
 * ============================================================ */
const REGISTRY = [];
function register(name, group, browsers = CONFIG.browsers) {
  REGISTRY.push({ name, group, browsers });
}

/* ============================================================
 * 6. Tests (15+)
 * ============================================================ */

volvixTest.describe('Auth', () => {
  volvixTest('T01 login page loads', async ({ loginPage }) => {
    await loginPage.open();
    await expect(loginPage.email).toBeVisible();
    await expect(loginPage.submit).toBeVisible();
  });
  register('T01 login page loads', 'Auth');

  volvixTest('T02 login with valid credentials', async ({ loginPage, page }) => {
    await loginPage.open();
    await loginPage.login(CONFIG.user.email, CONFIG.user.password);
    await expect(page).toHaveURL(/dashboard/);
  });
  register('T02 login with valid credentials', 'Auth');

  volvixTest('T03 login with invalid credentials shows error', async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.login('bad@volvix.test', 'wrong');
    await expect(loginPage.error).toBeVisible();
  });
  register('T03 login with invalid credentials shows error', 'Auth');

  volvixTest('T04 logout returns to login', async ({ authedPage, dashboardPage, page }) => {
    await dashboardPage.logout();
    await expect(page).toHaveURL(/login/);
  });
  register('T04 logout returns to login', 'Auth');
});

volvixTest.describe('Dashboard', () => {
  volvixTest('T05 dashboard shows welcome', async ({ authedPage, dashboardPage }) => {
    await dashboardPage.open();
    await expect(dashboardPage.welcome).toBeVisible();
  });
  register('T05 dashboard shows welcome', 'Dashboard');

  volvixTest('T06 dashboard sales card visible', async ({ authedPage, dashboardPage }) => {
    await dashboardPage.open();
    await expect(dashboardPage.salesCard).toBeVisible();
  });
  register('T06 dashboard sales card visible', 'Dashboard');
});

volvixTest.describe('POS', () => {
  volvixTest('T07 add product to cart', async ({ authedPage, posPage }) => {
    await posPage.open();
    await posPage.addProduct('SKU-001');
    await expect(posPage.cart).toHaveCount(1);
  });
  register('T07 add product to cart', 'POS');

  volvixTest('T08 cart total updates', async ({ authedPage, posPage }) => {
    await posPage.open();
    await posPage.addProduct('SKU-001');
    await posPage.addProduct('SKU-002');
    await expect(posPage.total).not.toHaveText('0.00');
  });
  register('T08 cart total updates', 'POS');

  volvixTest('T09 checkout flow', async ({ authedPage, posPage }) => {
    await posPage.open();
    await posPage.addProduct('SKU-001');
    await posPage.pay();
    await expect(posPage.receipt).toBeVisible();
  });
  register('T09 checkout flow', 'POS');

  volvixTest('T10 search filters product list', async ({ authedPage, posPage }) => {
    await posPage.open();
    await posPage.search.fill('NONEXISTENT');
    await expect(posPage.products).toHaveCount(0);
  });
  register('T10 search filters product list', 'POS');
});

volvixTest.describe('Inventory', () => {
  volvixTest('T11 add inventory item', async ({ authedPage, inventoryPage }) => {
    await inventoryPage.open();
    const item = { name: 'Test Product', sku: 'SKU-TEST-' + Date.now(), price: 9.99 };
    await inventoryPage.addItem(item);
    await expect(inventoryPage.rows.filter({ hasText: item.sku })).toHaveCount(1);
  });
  register('T11 add inventory item', 'Inventory');

  volvixTest('T12 inventory list non-empty', async ({ authedPage, inventoryPage }) => {
    await inventoryPage.open();
    const count = await inventoryPage.rows.count();
    expect(count > 0).toBeTruthy();
  });
  register('T12 inventory list non-empty', 'Inventory');
});

volvixTest.describe('Reports', () => {
  volvixTest('T13 reports run for current month', async ({ authedPage, reportsPage }) => {
    await reportsPage.open();
    const today = new Date().toISOString().slice(0, 10);
    await reportsPage.runRange('2026-01-01', today);
    await expect(reportsPage.chart).toBeVisible();
  });
  register('T13 reports run for current month', 'Reports');

  volvixTest('T14 reports export button enabled after run', async ({ authedPage, reportsPage }) => {
    await reportsPage.open();
    await reportsPage.runRange('2026-01-01', '2026-04-26');
    await expect(reportsPage.export).toBeVisible();
  });
  register('T14 reports export button enabled after run', 'Reports');
});

volvixTest.describe('API', () => {
  volvixTest('T15 GET /api/health 200', async ({ apiContext }) => {
    const r = await apiContext.get('/api/health');
    expect(r.status()).toBe(200);
  });
  register('T15 GET /api/health 200', 'API');

  volvixTest('T16 POST /api/auth returns token', async ({ apiContext }) => {
    const r = await apiContext.post('/api/auth', { data: CONFIG.user });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(typeof body.token === 'string').toBeTruthy();
  });
  register('T16 POST /api/auth returns token', 'API');
});

volvixTest.describe('Mobile', () => {
  volvixTest.use({ ...devices['iPhone 13'] });
  volvixTest('T17 mobile login renders', async ({ loginPage }) => {
    await loginPage.open();
    await expect(loginPage.submit).toBeVisible();
  });
  register('T17 mobile login renders', 'Mobile', ['chromium']);
});

/* ============================================================
 * 7. window.PlaywrightTests (browser-side introspection)
 * ============================================================ */
(function exposeOnWindow() {
  if (typeof window === 'undefined') return;
  const api = {
    config: CONFIG,
    registry: REGISTRY.slice(),
    list() { return this.registry.map(t => t.name); },
    byGroup(g) { return this.registry.filter(t => t.group === g); },
    groups() { return [...new Set(this.registry.map(t => t.group))]; },
    count() { return this.registry.length; },
    pages: { LoginPage, DashboardPage, POSPage, InventoryPage, ReportsPage, BasePage },
    run(name) {
      console.warn('[PlaywrightTests] run() is a stub in browser; execute via `npx playwright test` instead.');
      return this.registry.find(t => t.name === name) || null;
    }
  };
  window.PlaywrightTests = api;
  console.log(`[PlaywrightTests] ${api.count()} tests registered across ${api.groups().length} groups.`);
})();

/* ============================================================
 * 8. Module exports (for Node consumers)
 * ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG,
    BasePage, LoginPage, DashboardPage, POSPage, InventoryPage, ReportsPage,
    volvixTest,
    REGISTRY
  };
}
