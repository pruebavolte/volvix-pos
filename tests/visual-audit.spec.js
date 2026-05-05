// tests/visual-audit.spec.js
// B40 — TRUE click-by-click visual audit.
//
// For each (role, screen):
//   1. (Login if role !== public)
//   2. Navigate to URL
//   3. Screenshot full page
//   4. Find every visible interactive element
//   5. Click each one, observe what happens (modal? toast? nav? DOM change? nothing?)
//   6. Capture modal screenshots
//   7. Append JSON line to tests/visual-audit-results.jsonl
//
// Run:
//   TEST_TARGET=prod npx playwright test --config=tests/playwright.visual.config.js
//
// Then:
//   node tests/visual-audit-report-generator.js

const { test, expect } = require('@playwright/test');
const { loginAs, USERS } = require('./fixtures/auth');
const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, 'visual-audit-results.jsonl');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Ensure screenshots dir exists, and reset results file at suite start.
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
// We DON'T blow away the JSONL on every test (each test appends), but we DO
// reset it on the very first test of a fresh run via a global setup-ish guard.
const RUN_MARKER = path.join(SCREENSHOTS_DIR, '.run-id');
const CURRENT_RUN = String(process.env.PW_TEST_RUN_ID || Date.now());
try {
  const previous = fs.existsSync(RUN_MARKER) ? fs.readFileSync(RUN_MARKER, 'utf8') : '';
  if (previous !== CURRENT_RUN) {
    fs.writeFileSync(RUN_MARKER, CURRENT_RUN);
    if (fs.existsSync(RESULTS_FILE)) fs.unlinkSync(RESULTS_FILE);
  }
} catch (_) { /* best effort */ }

const SCREENS_TO_AUDIT = {
  cajero: [
    '/salvadorex_web_v25.html',
    '/volvix-kds.html',
    '/volvix-launcher.html',
  ],
  owner: [
    '/volvix_owner_panel_v7.html',
    '/multipos_suite_v3.html',
    '/volvix-vendor-portal.html',
    '/etiqueta_designer.html',
  ],
  admin: [
    '/volvix-admin-saas.html',
    '/volvix-mega-dashboard.html',
    '/volvix-audit-viewer.html',
  ],
};

const PUBLIC_SCREENS = [
  '/login.html',
  '/landing-restaurant.html',
  '/landing-cafe.html',
  '/landing-fitness.html',
  '/landing_dynamic.html?giro=taqueria',
  '/volvix-customer-portal.html',
  '/marketplace.html',
];

// Buttons that we should NOT click because they cause irreversible state
// changes mid-test (logout, delete-all, factory-reset, etc.). Best-effort
// pattern match against label/onclick.
const SKIP_PATTERNS = [
  /^logout$/i,
  /cerrar sesión/i,
  /sign\s*out/i,
  /eliminar todo/i,
  /borrar todo/i,
  /factory\s*reset/i,
  /restablecer\s*fábrica/i,
];

function shouldSkip(label, onclickAttr) {
  const probes = [label || '', onclickAttr || ''];
  return probes.some(p => SKIP_PATTERNS.some(rx => rx.test(p)));
}

function safeFilename(s) {
  return s.replace(/[^a-z0-9]/gi, '_').slice(0, 80);
}

function appendResult(result) {
  fs.appendFileSync(RESULTS_FILE, JSON.stringify(result) + '\n');
}

/**
 * Audit a single screen. Returns the result object (also appends to JSONL).
 */
async function auditScreen(page, url, roleLabel) {
  const result = {
    role: roleLabel,
    url,
    loaded: false,
    final_url: null,
    console_errors: [],
    page_errors: [],
    buttons: [],
    screenshots: [],
    started_at: new Date().toISOString(),
    finished_at: null,
  };

  // Console + uncaught errors collector
  const onConsole = (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // Filter out known-noisy lines (favicon 404 etc.)
      if (!/favicon|Failed to load resource: the server responded with a status of 404/i.test(t)) {
        result.console_errors.push(t.slice(0, 300));
      }
    }
  };
  const onPageError = (err) => {
    result.page_errors.push(String(err.message || err).slice(0, 300));
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // small wait for SPA-style hydration
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    result.loaded = true;
    result.final_url = page.url();
  } catch (e) {
    result.load_error = String(e.message || e).slice(0, 300);
    result.finished_at = new Date().toISOString();
    appendResult(result);
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    return result;
  }

  // Full-page screenshot
  const safeFn = safeFilename(`${roleLabel}_${url}`);
  const fullPath = path.join(SCREENSHOTS_DIR, `${safeFn}_full.png`);
  try {
    await page.screenshot({ path: fullPath, fullPage: true, timeout: 15_000 });
    result.screenshots.push(path.relative(path.dirname(__dirname), fullPath).replace(/\\/g, '/'));
  } catch (e) {
    result.screenshot_error = String(e.message || e).slice(0, 200);
  }

  // Find candidate buttons: enumerate via JS (visibility + bounding-box check)
  // and return their selectors via index. We use locator + nth() so we get
  // a fresh handle per click (avoid stale-element after DOM mutations).
  const buttonSelector = 'button, a.btn, a[role="button"], [role="button"], [data-action], input[type="button"], input[type="submit"]';
  const visibleIndexes = await page.$$eval(buttonSelector, (els) => {
    return els.map((el, i) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible = rect.width > 4 && rect.height > 4 &&
        style.visibility !== 'hidden' && style.display !== 'none' &&
        parseFloat(style.opacity || '1') > 0.05;
      const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 60);
      const onclick = el.getAttribute('onclick');
      const dataAction = el.getAttribute('data-action');
      const type = el.tagName.toLowerCase();
      const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
      return { i, visible, label, onclick, dataAction, type, disabled };
    }).filter(b => b.visible);
  }).catch(() => []);

  // Hard cap to keep the test bounded
  const MAX_BUTTONS = 40;
  const candidates = visibleIndexes.slice(0, MAX_BUTTONS);
  result.buttons_total_visible = visibleIndexes.length;
  result.buttons_audited = candidates.length;

  for (const cand of candidates) {
    const buttonResult = {
      idx: cand.i,
      label: cand.label,
      type: cand.type,
      onclick: !!cand.onclick,
      dataAction: cand.dataAction || null,
      disabled: cand.disabled,
      clickable: false,
      action_observed: 'none',
      error: null,
    };

    if (cand.disabled) {
      buttonResult.action_observed = 'DISABLED';
      result.buttons.push(buttonResult);
      continue;
    }

    if (shouldSkip(cand.label, cand.onclick)) {
      buttonResult.action_observed = 'SKIPPED_DESTRUCTIVE';
      result.buttons.push(buttonResult);
      continue;
    }

    const beforeURL = page.url();
    let beforeBodyLen = 0;
    try {
      beforeBodyLen = await page.evaluate(() => document.body.innerHTML.length);
    } catch (_) {}

    // Try to grab the nth element fresh
    const btnLoc = page.locator(buttonSelector).nth(cand.i);
    try {
      // Force-click avoids "actionability" timeouts that block our audit.
      await btnLoc.click({ timeout: 3000, force: true });
      buttonResult.clickable = true;
    } catch (e) {
      buttonResult.error = String(e.message || e).slice(0, 150);
      buttonResult.action_observed = 'CLICK_ERROR';
      result.buttons.push(buttonResult);
      continue;
    }

    // Wait briefly for any reaction
    await page.waitForTimeout(900);

    let afterURL = page.url();
    let afterBodyLen = beforeBodyLen;
    try {
      afterBodyLen = await page.evaluate(() => document.body.innerHTML.length);
    } catch (_) {}

    let modalVisible = null;
    let toastVisible = null;
    try {
      modalVisible = await page.locator(
        '.modal:visible, [role="dialog"]:visible, .vlx-modal:visible, [class*="modal"][class*="open"]:visible, .swal2-popup:visible'
      ).first().isVisible({ timeout: 500 }).catch(() => false);
    } catch (_) {}
    try {
      const toastLoc = page.locator(
        '.toast:visible, [role="alert"]:visible, .vlx-toast:visible, .swal2-toast:visible, .Toastify__toast:visible'
      ).first();
      toastVisible = await toastLoc.isVisible({ timeout: 500 }).catch(() => false);
      if (toastVisible) {
        buttonResult.toast_text = (await toastLoc.textContent().catch(() => '') || '').trim().slice(0, 120);
      }
    } catch (_) {}

    if (afterURL !== beforeURL) {
      buttonResult.action_observed = `navigation:${afterURL.slice(0, 100)}`;
    } else if (modalVisible) {
      buttonResult.action_observed = 'modal_opened';
      const modalShot = path.join(SCREENSHOTS_DIR, `${safeFn}_btn${cand.i}_modal.png`);
      try {
        await page.screenshot({ path: modalShot, timeout: 8000 });
        result.screenshots.push(path.relative(path.dirname(__dirname), modalShot).replace(/\\/g, '/'));
      } catch (_) {}
      // Try to close the modal so the next click is clean
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
      // Best-effort close button click
      const closeBtn = page.locator(
        '.modal:visible button[aria-label="Close" i], .modal:visible .close, .modal:visible [data-dismiss="modal"], .vlx-modal:visible .close, .swal2-popup .swal2-close'
      ).first();
      if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await closeBtn.click({ timeout: 1500, force: true }).catch(() => {});
        await page.waitForTimeout(200);
      }
    } else if (toastVisible) {
      buttonResult.action_observed = 'toast';
    } else if (Math.abs(afterBodyLen - beforeBodyLen) > 500) {
      buttonResult.action_observed = 'dom_changed';
    } else {
      buttonResult.action_observed = 'NOTHING_HAPPENED';
    }

    result.buttons.push(buttonResult);

    // If the click navigated us away, navigate back so subsequent clicks
    // continue against the same baseline URL.
    const cur = page.url();
    if (cur !== beforeURL) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(400);
      } catch (_) {}
    }
  }

  result.finished_at = new Date().toISOString();
  appendResult(result);

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC SCREENS — no auth
// ────────────────────────────────────────────────────────────────────────────
test.describe('B40 Visual Audit — public screens', () => {
  for (const url of PUBLIC_SCREENS) {
    test(`public: ${url}`, async ({ page }) => {
      const result = await auditScreen(page, url, 'public');
      expect(result.loaded, `page should load: ${url}`).toBe(true);
      // Loose: don't fail the test on console errors, just log them
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// CAJERO SCREENS
// ────────────────────────────────────────────────────────────────────────────
test.describe('B40 Visual Audit — cajero screens', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.cajero.email, USERS.cajero.password).catch(() => null);
  });
  for (const url of SCREENS_TO_AUDIT.cajero) {
    test(`cajero: ${url}`, async ({ page }) => {
      const result = await auditScreen(page, url, 'cajero');
      expect(result.loaded, `page should load: ${url}`).toBe(true);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// OWNER SCREENS
// ────────────────────────────────────────────────────────────────────────────
test.describe('B40 Visual Audit — owner screens', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.owner.email, USERS.owner.password).catch(() => null);
  });
  for (const url of SCREENS_TO_AUDIT.owner) {
    test(`owner: ${url}`, async ({ page }) => {
      const result = await auditScreen(page, url, 'owner');
      expect(result.loaded, `page should load: ${url}`).toBe(true);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// ADMIN SCREENS
// ────────────────────────────────────────────────────────────────────────────
test.describe('B40 Visual Audit — admin screens', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.admin.email, USERS.admin.password).catch(() => null);
  });
  for (const url of SCREENS_TO_AUDIT.admin) {
    test(`admin: ${url}`, async ({ page }) => {
      const result = await auditScreen(page, url, 'admin');
      expect(result.loaded, `page should load: ${url}`).toBe(true);
    });
  }
});
