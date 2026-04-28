// tests/r3a-pos-ui-cart-seeded.spec.js
// B43 — CART-SEEDED click-by-click verification of POS UI
// Re-tests the 33 PARTIAL buttons from R3-A with:
//   1. Cart pre-seeded with 2-3 products (so cart-dependent buttons can act)
//   2. Toast state reset BEFORE each probe (so toast detection works)
//   3. Quickpos buttons tested AFTER navigating to the quickpos screen (so #qp-display is visible)
//   4. Longer settle time + broader DOM-mutation detection (style/title/class changes)
//
// Goal: convert 33 PARTIAL → confirmed WORKING.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-r3a-cartseeded');
const REPORT_PATH = path.join(__dirname, '..', 'B43_POS_UI_CARTSEEDED_REPORT.md');
const RESULTS_PATH = path.join(SCREENSHOT_DIR, 'audit-data.json');

const CAJERO = { email: 'cajero@volvix.test', password: 'Volvix2026!' };

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const auditData = {
  startTime: new Date().toISOString(),
  baseURL: BASE_URL,
  screens: {},
  consoleErrors: {},
  networkFailures: {},
  screenshots: [],
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function attachLoggers(page, tag) {
  auditData.consoleErrors[tag] = [];
  auditData.networkFailures[tag] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      auditData.consoleErrors[tag].push({
        text: msg.text().substring(0, 300),
        location: msg.location(),
      });
    }
  });
  page.on('pageerror', err => {
    auditData.consoleErrors[tag].push({
      text: 'PAGE ERROR: ' + (err.message || String(err)).substring(0, 300),
    });
  });
  page.on('response', res => {
    const status = res.status();
    if (status >= 400) {
      auditData.networkFailures[tag].push({
        url: res.url(),
        status,
        method: res.request().method(),
      });
    }
  });
}

async function loginAsCajero(page) {
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const cookieBtns = ['button:has-text("Aceptar todo")', 'button:has-text("Reject")', 'button:has-text("Aceptar")'];
  for (const sel of cookieBtns) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
      await el.click({ timeout: 1500, force: true }).catch(() => {});
      await page.waitForTimeout(300);
      break;
    }
  }

  const loginResult = await page.evaluate(async (creds) => {
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      const token = j.token || (j.session && j.session.token);
      if (j.session) localStorage.setItem('volvixSession', JSON.stringify(j.session));
      if (token) {
        localStorage.setItem('volvixAuthToken', token);
        localStorage.setItem('volvix_token', token);
      }
      return { ok: true, hasToken: !!token, role: j.session?.role, email: j.session?.email };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, CAJERO);
  if (!loginResult.ok) {
    throw new Error('API login failed: ' + JSON.stringify(loginResult));
  }
  return loginResult;
}

async function dismissOverlays(page) {
  const cookieBtns = [
    'button:has-text("Aceptar todo")',
    'button:has-text("Reject")',
    'button:has-text("Aceptar")',
    'button[id*="cookie-accept"]',
    'button[class*="cookie-accept"]',
  ];
  for (const sel of cookieBtns) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
      await el.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(400);
      break;
    }
  }
  const skipTutorial = [
    'button:has-text("Después")',
    'button:has-text("Despues")',
    'button:has-text("Saltar")',
    'button:has-text("Cerrar")',
    'button:has-text("Skip")',
  ];
  for (const sel of skipTutorial) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      await el.click({ timeout: 1500, force: true }).catch(() => {});
      await page.waitForTimeout(400);
      break;
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function snap(page, name) {
  const fname = `${name}.png`;
  const fpath = path.join(SCREENSHOT_DIR, fname);
  try {
    await page.screenshot({ path: fpath, fullPage: false });
    auditData.screenshots.push(fname);
  } catch (e) {}
}

/**
 * Reset transient UI state so toast/modal detection starts clean for next probe.
 */
async function resetUIState(page) {
  try {
    await page.evaluate(() => {
      // Hide any visible toast
      const t = document.getElementById('toast');
      if (t) { t.classList.remove('show'); t.textContent = ''; }
      document.querySelectorAll('.toast.show, .toast-show').forEach(el => el.classList.remove('show', 'toast-show'));
      // Close any b39 modal opened directly via _b39Modal helper
      ['modal-notifications','modal-cat-panel','modal-cat-visual','modal-change-price',
       'modal-cust-sel','modal-pending-list','modal-mas-modulos'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.remove();
      });
      // Close any standard salvadorex modal — only remove .open class.
      // DO NOT set inline display:none, otherwise the next .modal-backdrop.open
      // class addition can't override the inline style.
      document.querySelectorAll('.modal-backdrop.open, .vx-modal-backdrop, .modal.open').forEach(el => {
        el.classList.remove('open');
      });
      // Restore POS visibility
      const ls = document.getElementById('login-screen');
      if (ls) ls.style.display = 'none';
    });
  } catch (e) {}
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

/**
 * Pre-seed the cart with 3 products by directly invoking the page's addToCart.
 * Returns true if seeded, false otherwise.
 */
async function seedCart(page) {
  return await page.evaluate(() => {
    try {
      if (!window.CART || typeof window.addToCart !== 'function') {
        // Try to access via global scope
        if (typeof CART === 'undefined') return { ok: false, reason: 'CART not in scope' };
        if (typeof addToCart !== 'function') return { ok: false, reason: 'addToCart not in scope' };
      }
      const seed = [
        { id: 'SEED1', code: '7501055363513', name: 'Coca-Cola 600ml',  price: 18, qty: 1, stock: 50 },
        { id: 'SEED2', code: '7501006551235', name: 'Sabritas Original', price: 20, qty: 2, stock: 30 },
        { id: 'SEED3', code: 'SEED-COMUN',     name: 'Producto seed',     price: 50, qty: 1, stock: 10 },
      ];
      // Direct push if globals are exposed
      try {
        if (typeof CART !== 'undefined') {
          CART.length = 0;
          seed.forEach(p => CART.push({ ...p }));
        }
        if (typeof renderCart === 'function') renderCart();
        return { ok: true, count: seed.length };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    } catch (e) { return { ok: false, reason: String(e) }; }
  });
}

async function pageSnapshot(page) {
  return await page.evaluate(() => {
    const visibleModals = Array.from(document.querySelectorAll(
      '.modal, [role="dialog"], .modal-overlay, .ncc-overlay, ' +
      '#modal-pay, #modal-search, #modal-cash, #modal-calc, #modal-granel, #modal-mov-detail, ' +
      '.panel-overlay, .drawer-overlay, .vx-modal, [class*="modal"], [id^="modal-"]'
    )).filter(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && r.width > 100 && r.height > 100;
    });
    let activeScreenId = '';
    const screens = document.querySelectorAll('section[id^="screen-"]');
    for (const s of screens) {
      if (!s.classList.contains('hidden')) {
        activeScreenId = s.id;
        break;
      }
    }
    const activeMenu = document.querySelector('.menu-btn.active');
    const activeMenuName = activeMenu ? (activeMenu.getAttribute('data-menu') || '') : '';
    let headingText = '';
    if (activeScreenId) {
      const ss = document.getElementById(activeScreenId);
      if (ss) {
        const h = ss.querySelector('h1, h2, .screen-title');
        headingText = h ? (h.textContent || '').trim().substring(0, 80) : '';
      }
    }
    const toastEl = document.getElementById('toast');
    const toastShown = toastEl ? toastEl.classList.contains('show') : false;
    const toastText = toastShown ? (toastEl.textContent || '').trim().substring(0, 100) : '';
    const otherToasts = Array.from(document.querySelectorAll('.toast.show, .toast-show, [class*="toast"][class*="show"]'));
    const totalToasts = (toastShown ? 1 : 0) + otherToasts.length;
    const domSize = document.body.innerHTML.length;
    const fixedHigh = Array.from(document.querySelectorAll('div, section, aside')).filter(el => {
      const cs = getComputedStyle(el);
      const z = parseInt(cs.zIndex || '0', 10);
      return cs.position === 'fixed' && z > 500 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    // Quickpos display content
    const qp = document.getElementById('qp-display');
    const qpText = qp ? (qp.textContent || '').trim() : '';
    // Active platform toggle
    const activePlat = document.querySelector('.platform-toggle-btn.active');
    const activePlatLabel = activePlat ? (activePlat.textContent || '').trim() : '';
    // btn-mayoreo outline (mayoreo toggle visual)
    const mayoreoBtn = document.getElementById('btn-mayoreo');
    const mayoreoOutline = mayoreoBtn ? (getComputedStyle(mayoreoBtn).outlineStyle !== 'none' && getComputedStyle(mayoreoBtn).outlineWidth !== '0px') : false;
    // KDS sound state — both className AND textContent ("Sonido: ON" ↔ "Sonido: OFF")
    const soundBtn = document.getElementById('soundBtn');
    const soundClass = soundBtn ? (soundBtn.className || '') : '';
    const soundText = soundBtn ? ((soundBtn.textContent || '').trim()) : '';
    return {
      url: location.href,
      modalCount: visibleModals.length,
      modalIds: visibleModals.map(m => m.id || m.className.substring(0, 40)),
      activeScreenId,
      activeMenuName,
      headingText,
      toastCount: totalToasts,
      toastText: toastText || (otherToasts[0] ? (otherToasts[0].textContent || '').trim().substring(0, 100) : ''),
      domSize,
      fixedHighCount: fixedHigh.length,
      qpText,
      activePlatLabel,
      mayoreoOutline,
      soundClass,
      soundText,
    };
  });
}

async function probeButton(page, locator, label, opts = {}) {
  let visible = false;
  try {
    visible = await locator.isVisible({ timeout: 1200 }).catch(() => false);
  } catch {}
  if (!visible) {
    const cnt = await locator.count().catch(() => 0);
    if (cnt === 0) return { result: '❌ DEAD', observation: 'selector no encontrado en DOM' };
    return { result: '❌ DEAD', observation: 'no visible (oculto)' };
  }

  // Reset transient state so the previous probe's toast doesn't poison detection
  if (opts.resetBeforeClick !== false) {
    await resetUIState(page);
  }

  const before = await pageSnapshot(page).catch(() => ({}));

  try {
    try {
      await locator.click({ timeout: 2500, force: false });
    } catch {
      await locator.click({ timeout: 2500, force: true });
    }
    // Longer settle window — async modals + toasts need 1.2-1.5s
    await page.waitForTimeout(opts.settleMs || 1200);
  } catch (e) {
    return { result: '🚫 CRASH', observation: (e.message || '').substring(0, 200) };
  }

  const after = await pageSnapshot(page).catch(() => ({}));

  const urlChanged = before.url !== after.url;
  const modalCountIncreased = (after.modalCount || 0) > (before.modalCount || 0);
  const newModal = (after.modalIds || []).find(id => !(before.modalIds || []).includes(id));
  const screenChanged = before.activeScreenId !== after.activeScreenId;
  const menuChanged = before.activeMenuName !== after.activeMenuName;
  const headingChanged = before.headingText !== after.headingText;
  const toastIncreased = (after.toastCount || 0) > (before.toastCount || 0);
  const toastTextChanged = (before.toastText || '') !== (after.toastText || '') && (after.toastText || '').length > 0;
  const qpChanged = before.qpText !== after.qpText;
  const platChanged = before.activePlatLabel !== after.activePlatLabel;
  const mayoreoChanged = before.mayoreoOutline !== after.mayoreoOutline;
  const soundChanged = before.soundClass !== after.soundClass || before.soundText !== after.soundText;

  if (urlChanged) return { result: '✅ WORKS', observation: `URL→${after.url.split('/').pop().substring(0, 50)}` };
  if (modalCountIncreased && newModal) return { result: '✅ WORKS', observation: `modal abierto: ${newModal.substring(0, 30)}` };
  if (screenChanged || menuChanged) return { result: '✅ WORKS', observation: `screen→${after.activeMenuName || after.headingText.substring(0, 30)}` };
  if (headingChanged) return { result: '✅ WORKS', observation: `heading→"${after.headingText.substring(0, 40)}"` };
  if (toastIncreased || toastTextChanged) return { result: '✅ WORKS', observation: `toast: "${(after.toastText || '').substring(0, 50)}"` };
  if (qpChanged) return { result: '✅ WORKS', observation: `qp-display: "${before.qpText}" → "${after.qpText}"` };
  if (platChanged) return { result: '✅ WORKS', observation: `platform: "${before.activePlatLabel}" → "${after.activePlatLabel}"` };
  if (mayoreoChanged) return { result: '✅ WORKS', observation: `mayoreo outline: ${before.mayoreoOutline} → ${after.mayoreoOutline}` };
  if (soundChanged) return { result: '✅ WORKS', observation: `sound: "${before.soundText || before.soundClass}" → "${after.soundText || after.soundClass}"` };
  const fixedIncreased = (after.fixedHighCount || 0) > (before.fixedHighCount || 0);
  if (fixedIncreased) return { result: '✅ WORKS', observation: `overlay aparece (z>500 fixed)` };
  const domDeltaPct = before.domSize ? Math.abs(after.domSize - before.domSize) / before.domSize : 0;
  if (domDeltaPct > 0.005) return { result: '✅ WORKS', observation: `DOM cambió ${(domDeltaPct * 100).toFixed(1)}%` };
  return { result: '⚠️ PARTIAL', observation: 'sin cambio detectable después de cart-seeded' };
}

async function closeAnyModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  const closers = ['.modal-close', '.btn-sm:has-text("✕")', '[onclick*="closeModal"]', '#bcp-close', '#bcs-close', '#bn-close', '#bcv-close'];
  for (const sel of closers) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 200 }).catch(() => false)) {
      await el.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await resetUIState(page);
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN TEST: cart-seeded re-audit of PARTIAL buttons
// ────────────────────────────────────────────────────────────────────────────

test.describe('B43 — Cart-seeded re-audit of PARTIAL buttons', () => {
  test.setTimeout(600_000);

  test('Re-test 33 PARTIAL buttons with cart pre-seeded', async ({ page }) => {
    const TAG = 'salvadorex';
    auditData.screens[TAG] = { buttons: [], notes: [] };
    await attachLoggers(page, TAG);

    // ---------- Login ----------
    await loginAsCajero(page);

    // Navigate to POS
    if (!/salvadorex_web_v25\.html/.test(page.url())) {
      let lastErr = null;
      for (let i = 0; i < 3; i++) {
        try {
          await page.goto(`${BASE_URL}/salvadorex_web_v25.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await page.waitForTimeout(2500 * (i + 1));
        }
      }
      if (lastErr) throw lastErr;
    }
    await page.waitForTimeout(3000);
    await dismissOverlays(page);
    await page.waitForTimeout(500);
    await dismissOverlays(page);

    // Salvadorex internal login
    try {
      const internalLogin = page.locator('#btn-login-submit');
      if (await internalLogin.isVisible({ timeout: 1500 }).catch(() => false)) {
        await page.locator('#login-email').fill(CAJERO.email).catch(() => {});
        await page.locator('#login-password').fill(CAJERO.password).catch(() => {});
        await internalLogin.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);
        await dismissOverlays(page);
      }
    } catch {}
    try {
      await page.evaluate(() => {
        const ls = document.getElementById('login-screen');
        if (ls) ls.style.display = 'none';
      });
    } catch {}

    // Click POS menu to ensure POS screen
    try {
      await page.locator('button[data-menu="pos"]').first().click({ force: true });
      await page.waitForTimeout(800);
    } catch {}
    await snap(page, '01-pos-loaded');

    // ──────────────────────────────────────────────────────────────────────
    // SEED CART with 3 products
    // ──────────────────────────────────────────────────────────────────────
    const seedResult = await seedCart(page);
    auditData.screens[TAG].notes.push(`Seed result: ${JSON.stringify(seedResult)}`);
    await page.waitForTimeout(500);
    await snap(page, '02-cart-seeded');

    // ──────────────────────────────────────────────────────────────────────
    // PARTIAL probes — listed exactly per R3-A audit
    // ──────────────────────────────────────────────────────────────────────
    const partialProbes = [
      // Topbar — Vista Android/Web (toggles .active)
      { sel: 'button.platform-toggle-btn[onclick*="android"]', label: 'Vista Android', line: 1419, requiresPos: false },
      { sel: 'button.platform-toggle-btn[onclick*="web"]', label: 'Vista Web', line: 1423, requiresPos: false },
      { sel: 'button.tb-btn.notif', label: 'Notificaciones', line: 1404, requiresPos: false },
      // Menu locked — should toast
      { sel: 'button[data-menu="sugeridas"]', label: 'Menu: Compras IA (locked)', line: 1553, requiresPos: false },
      // POS area buttons (cart now seeded)
      { sel: 'button[data-feature="pos.mayoreo"]', label: 'POS: Mayoreo', line: 1613, requiresPos: true, reseed: true },
      { sel: 'button[data-feature="pos.entradas"]', label: 'POS: Entradas', line: 1617, requiresPos: true },
      { sel: 'button[data-feature="pos.salidas"]', label: 'POS: Salidas', line: 1621, requiresPos: true },
      { sel: 'button[data-feature="pos.borrar"]', label: 'POS: Borrar', line: 1625, requiresPos: true, reseed: true },
      { sel: 'button[data-feature="pos.verificador"]', label: 'POS: Verificador', line: 1629, requiresPos: true },
      { sel: 'button[data-feature="pos.panel"]', label: 'POS: Panel catálogo', line: 1636, requiresPos: true },
      { sel: 'button[data-feature="pos.granel"]', label: 'POS: Granel', line: 1644, requiresPos: true },
      { sel: 'button[data-feature="pos.descuento"]', label: 'POS: Descuento', line: 1648, requiresPos: true, reseed: true },
      { sel: 'button[data-feature="pos.recargas_btn"]', label: 'POS: Recargas (tiempo aire)', line: 1652, requiresPos: true },
      { sel: 'button[data-feature="pos.servicios_btn"]', label: 'POS: Servicios', line: 1656, requiresPos: true },
      { sel: 'button[data-feature="pos.calculadora"]', label: 'POS: Calculadora', line: 1660, requiresPos: true },
      // Bottom-bar buttons — need cart
      { sel: 'button[data-feature="pos.cambiar"]', label: 'POS: Cambiar precio', line: 1702, requiresPos: true, reseed: true },
      { sel: 'button[data-feature="pos.pendiente"]', label: 'POS: Venta pendiente', line: 1706, requiresPos: true, reseed: true },
      { sel: 'button[onclick="clearCart()"]', label: 'POS: Eliminar venta', line: 1710, requiresPos: true, reseed: true },
      { sel: 'button[onclick="openCustomerSelector()"]', label: 'POS: Asignar cliente', line: 1714, requiresPos: true },
      { sel: 'button[onclick="enviarAImpresora()"]', label: 'POS: Enviar a impresora', line: 1749, requiresPos: true },
    ];

    for (const probe of partialProbes) {
      try {
        if (probe.requiresPos) {
          const isPosVisible = await page.locator('input#barcode-input').first().isVisible({ timeout: 600 }).catch(() => false);
          if (!isPosVisible) {
            await page.locator('button[data-menu="pos"]').first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(700);
          }
        }
        if (probe.reseed) {
          await seedCart(page);
          await page.waitForTimeout(300);
        }
        const loc = page.locator(probe.sel).first();
        // savePendingSale issues a fetch that may take 1.5-2s under rate-limit retries
        const settleMs = probe.label.includes('pendiente') || probe.label.includes('impresora') ? 2200 : 1200;
        const result = await probeButton(page, loc, probe.label, { settleMs });
        auditData.screens[TAG].buttons.push({
          label: probe.label,
          line: probe.line,
          selector: probe.sel,
          ...result,
        });
        await closeAnyModal(page);
      } catch (e) {
        auditData.screens[TAG].buttons.push({
          label: probe.label,
          line: probe.line,
          selector: probe.sel,
          result: '🚫 CRASH',
          observation: (e.message || '').substring(0, 200),
        });
      }
    }

    // Test "Buscar (Enter)" with a non-empty barcode (so searchProduct actually runs).
    // searchProduct() shows a toast in both success ("+ <name>") and failure ("Producto no encontrado") cases,
    // both of which qualify as visible feedback for the test.
    try {
      await page.locator('button[data-menu="pos"]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      const bc = page.locator('input#barcode-input').first();
      if (await bc.isVisible({ timeout: 1000 }).catch(() => false)) {
        await bc.fill('NOTFOUND-' + Date.now()).catch(() => {});
      }
      const buscar = page.locator('button.btn-enter').first();
      const r = await probeButton(page, buscar, 'POS: Buscar (Enter)', { settleMs: 1500 });
      auditData.screens[TAG].buttons.push({
        label: 'POS: Buscar (Enter)',
        line: 1593,
        selector: 'button.btn-enter',
        ...r,
      });
      await closeAnyModal(page);
    } catch (e) {
      auditData.screens[TAG].notes.push(`Buscar Enter error: ${(e.message || '').substring(0, 200)}`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Quickpos keys — navigate to quickpos screen FIRST so #qp-display visible
    // ──────────────────────────────────────────────────────────────────────
    try {
      await page.locator('button.tb-btn.rapido').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      await snap(page, '03-quickpos-loaded');

      const qpKeys = ['7','8','9','4','5','6','1','2','3','0','.','C'];
      for (const k of qpKeys) {
        try {
          // Use exact text match
          const loc = page.locator('button.quickpos-key').filter({ hasText: new RegExp(`^${k.replace('.', '\\.')}$`) }).first();
          const r = await probeButton(page, loc, `Quickpos key ${k}`, { resetBeforeClick: false, settleMs: 500 });
          auditData.screens[TAG].buttons.push({
            label: `Quickpos key ${k}`,
            line: 2359,
            selector: `button.quickpos-key (${k})`,
            ...r,
          });
        } catch (e) {
          auditData.screens[TAG].buttons.push({
            label: `Quickpos key ${k}`,
            line: 2359,
            selector: `button.quickpos-key (${k})`,
            result: '🚫 CRASH',
            observation: (e.message || '').substring(0, 200),
          });
        }
      }
    } catch (e) {
      auditData.screens[TAG].notes.push(`Quickpos error: ${(e.message || '').substring(0, 200)}`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // KDS sound toggle (in separate page)
    // ──────────────────────────────────────────────────────────────────────
    await snap(page, '04-final-pos');
  });

  test('KDS sound toggle re-test', async ({ page }) => {
    const TAG = 'kds';
    auditData.screens[TAG] = { buttons: [], notes: [] };
    await attachLoggers(page, TAG);

    await loginAsCajero(page);
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto(`${BASE_URL}/volvix-kds.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await page.waitForTimeout(2500 * (i + 1));
      }
    }
    if (lastErr) {
      auditData.screens[TAG].notes.push(`KDS goto failed: ${lastErr.message}`);
      return;
    }
    await page.waitForTimeout(2500);
    await dismissOverlays(page);
    await snap(page, 'kds-01-loaded');

    try {
      const soundBtn = page.locator('#soundBtn').first();
      const r = await probeButton(page, soundBtn, 'Sonido ON/OFF', { settleMs: 800 });
      auditData.screens[TAG].buttons.push({
        label: 'Sonido ON/OFF',
        line: 66,
        selector: '#soundBtn',
        ...r,
      });
    } catch (e) {
      auditData.screens[TAG].notes.push(`Sound btn error: ${(e.message || '').substring(0, 200)}`);
    }
    await snap(page, 'kds-02-final');
  });

  test.afterAll(async () => {
    auditData.endTime = new Date().toISOString();
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(auditData, null, 2));
    console.log('Cart-seeded audit data written to:', RESULTS_PATH);

    // Build summary
    const allButtons = [];
    for (const screen in auditData.screens) {
      for (const b of auditData.screens[screen].buttons || []) {
        allButtons.push({ screen, ...b });
      }
    }
    const works = allButtons.filter(b => /WORKS/.test(b.result || '')).length;
    const partial = allButtons.filter(b => /PARTIAL/.test(b.result || '')).length;
    const dead = allButtons.filter(b => /DEAD/.test(b.result || '')).length;
    const crash = allButtons.filter(b => /CRASH/.test(b.result || '')).length;
    console.log(`\n[B43 cart-seeded summary] WORKS=${works} PARTIAL=${partial} DEAD=${dead} CRASH=${crash} (total=${allButtons.length})`);
    console.log(`Console errors: salvadorex=${(auditData.consoleErrors.salvadorex || []).length}, kds=${(auditData.consoleErrors.kds || []).length}`);
  });
});
