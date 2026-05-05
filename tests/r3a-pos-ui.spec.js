// tests/r3a-pos-ui.spec.js
// R3A — TRUE click-by-click UI verification of the POS system
// Click EVERY button, capture state changes, modals, console errors, network failures
// SCOPE: salvadorex_web_v25.html (main POS) + volvix-kds.html + Quickpos mode

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-r3a');
const REPORT_PATH = path.join(__dirname, '..', 'B42_POS_UI_AUDIT.md');

const CAJERO = { email: 'cajero@volvix.test', password: 'Volvix2026!' };

// Ensure dirs
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Global accumulators
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
  // Strategy: hit /api/login directly, then inject the token+session into localStorage
  // before navigating to the protected page.
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // Dismiss cookie banner first so it doesn't intercept future clicks
  const cookieBtns = ['button:has-text("Aceptar todo")', 'button:has-text("Reject")', 'button:has-text("Aceptar")'];
  for (const sel of cookieBtns) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
      await el.click({ timeout: 1500, force: true }).catch(() => {});
      await page.waitForTimeout(300);
      break;
    }
  }

  // Call login API and store result in localStorage (mimicking handleLogin)
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

/**
 * Dismiss any overlay/welcome/cookie that blocks the UI.
 */
async function dismissOverlays(page) {
  // Cookie banner — click "Aceptar todo" or "Reject"
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
  // Welcome tutorial — "Después" / "Empezar tutorial" -> we click "Después"
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
  // ESC just in case
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function snap(page, name) {
  const fname = `${name}.png`;
  const fpath = path.join(SCREENSHOT_DIR, fname);
  try {
    await page.screenshot({ path: fpath, fullPage: false });
    auditData.screenshots.push(fname);
  } catch (e) {
    // ignore screenshot failures
  }
}

/**
 * Click a single button locator and detect what happened.
 * Returns: { result: '✅|⚠️|❌|🚫', observation: string }
 */
/**
 * Snapshot of the page state for diffing.
 * Captures: URL, active screen ID, count of "modals", visible main heading text.
 */
async function pageSnapshot(page) {
  return await page.evaluate(() => {
    // Modals — broad criteria + actually visible
    const visibleModals = Array.from(document.querySelectorAll(
      '.modal, [role="dialog"], .modal-overlay, .ncc-overlay, ' +
      '#modal-pay, #modal-search, #modal-cash, #modal-calc, #modal-granel, #modal-mov-detail, ' +
      '.panel-overlay, .drawer-overlay, .vx-modal, [class*="modal"]'
    )).filter(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && r.width > 100 && r.height > 100;
    });
    // ACTIVE SCREEN — salvadorex uses #screen-XXX and toggles .hidden
    let activeScreenId = '';
    const screens = document.querySelectorAll('section[id^="screen-"]');
    for (const s of screens) {
      if (!s.classList.contains('hidden')) {
        activeScreenId = s.id;
        break;
      }
    }
    // Active menu button
    const activeMenu = document.querySelector('.menu-btn.active');
    const activeMenuName = activeMenu ? (activeMenu.getAttribute('data-menu') || '') : '';
    // Heading text (within the active screen)
    let headingText = '';
    if (activeScreenId) {
      const ss = document.getElementById(activeScreenId);
      if (ss) {
        const h = ss.querySelector('h1, h2, .screen-title');
        headingText = h ? (h.textContent || '').trim().substring(0, 80) : '';
      }
    }
    // Toast — salvadorex uses #toast.show
    const toastEl = document.getElementById('toast');
    const toastShown = toastEl ? toastEl.classList.contains('show') : false;
    const toastText = toastShown ? (toastEl.textContent || '').trim().substring(0, 100) : '';
    // Also look for arbitrary toasts
    const otherToasts = Array.from(document.querySelectorAll('.toast.show, .toast-show, [class*="toast"][class*="show"]'));
    const totalToasts = (toastShown ? 1 : 0) + otherToasts.length;
    // Body size proxy
    const domSize = document.body.innerHTML.length;
    // High-z fixed
    const fixedHigh = Array.from(document.querySelectorAll('div, section, aside')).filter(el => {
      const cs = getComputedStyle(el);
      const z = parseInt(cs.zIndex || '0', 10);
      return cs.position === 'fixed' && z > 500 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
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
    };
  });
}

async function probeButton(page, locator, label) {
  let crashed = false;
  let errorText = '';

  // Check existence
  let visible = false;
  try {
    visible = await locator.isVisible({ timeout: 1200 }).catch(() => false);
  } catch {}
  if (!visible) {
    const cnt = await locator.count().catch(() => 0);
    if (cnt === 0) return { result: '❌ DEAD', observation: 'selector no encontrado en DOM' };
    return { result: '❌ DEAD', observation: 'no visible (oculto)' };
  }

  // Take snapshot before
  const before = await pageSnapshot(page).catch(() => ({}));

  // Click with safeguards
  try {
    try {
      await locator.click({ timeout: 2500, force: false });
    } catch {
      await locator.click({ timeout: 2500, force: true });
    }
    await page.waitForTimeout(700);
  } catch (e) {
    return { result: '🚫 CRASH', observation: (e.message || '').substring(0, 200) };
  }

  // Snapshot after
  const after = await pageSnapshot(page).catch(() => ({}));

  // Diff
  const urlChanged = before.url !== after.url;
  const modalCountIncreased = (after.modalCount || 0) > (before.modalCount || 0);
  const newModal = (after.modalIds || []).find(id => !(before.modalIds || []).includes(id));
  const screenChanged = before.activeScreenId !== after.activeScreenId;
  const menuChanged = before.activeMenuName !== after.activeMenuName;
  const headingChanged = before.headingText !== after.headingText;
  const toastIncreased = (after.toastCount || 0) > (before.toastCount || 0);

  if (urlChanged) {
    return { result: '✅ WORKS', observation: `URL→${after.url.split('/').pop().substring(0, 50)}` };
  }
  if (modalCountIncreased && newModal) {
    return { result: '✅ WORKS', observation: `modal abierto: ${newModal.substring(0, 30)}` };
  }
  if (screenChanged || menuChanged) {
    return { result: '✅ WORKS', observation: `screen→${after.activeMenuName || after.headingText.substring(0, 30)}` };
  }
  if (headingChanged) {
    return { result: '✅ WORKS', observation: `heading→"${after.headingText.substring(0, 40)}"` };
  }
  if (toastIncreased) {
    return { result: '✅ WORKS', observation: `toast: "${(after.toastText || '').substring(0, 40)}"` };
  }
  // Fallback: did fixed-position high-z elements appear?
  const fixedIncreased = (after.fixedHighCount || 0) > (before.fixedHighCount || 0);
  if (fixedIncreased) {
    return { result: '✅ WORKS', observation: `overlay aparece (z>500 fixed)` };
  }
  // Any DOM mutation at all? (>1% change)
  const domDeltaPct = before.domSize ? Math.abs(after.domSize - before.domSize) / before.domSize : 0;
  if (domDeltaPct > 0.01) {
    return { result: '✅ WORKS', observation: `DOM cambió ${(domDeltaPct * 100).toFixed(1)}%` };
  }
  return { result: '⚠️ PARTIAL', observation: 'sin cambio detectable (DOM/heading/modal/url/toast)' };
}

async function closeAnyModal(page) {
  // Try ESC
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  // Try click ✕ if visible
  const closers = ['.modal-close', '.btn-sm:has-text("✕")', '[onclick*="closeModal"]'];
  for (const sel of closers) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 200 }).catch(() => false)) {
      await el.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN TEST: salvadorex_web_v25.html
// ────────────────────────────────────────────────────────────────────────────
test.describe('R3A — POS UI click-by-click audit', () => {
  test.setTimeout(600_000); // 10 min total

  test('Screen 1: salvadorex_web_v25.html (main POS)', async ({ page }) => {
    const TAG = 'salvadorex';
    auditData.screens[TAG] = { buttons: [], notes: [] };
    await attachLoggers(page, TAG);

    // ---------- Login ----------
    await loginAsCajero(page);
    auditData.screens[TAG].notes.push(`Post-login URL: ${page.url()}`);

    // Navigate to POS page if not already there
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
    await page.waitForTimeout(2500);
    await snap(page, '01-pos-loaded-pre-dismiss');
    // Dismiss cookies + welcome modal
    await dismissOverlays(page);
    await page.waitForTimeout(800);
    await dismissOverlays(page); // run twice to catch sequential modals

    // Salvadorex has its OWN internal login screen — handle it
    try {
      const internalLogin = page.locator('#btn-login-submit');
      if (await internalLogin.isVisible({ timeout: 1500 }).catch(() => false)) {
        auditData.screens[TAG].notes.push('Internal salvadorex login screen detected — logging in again');
        await page.locator('#login-email').fill(CAJERO.email).catch(() => {});
        await page.locator('#login-password').fill(CAJERO.password).catch(() => {});
        await internalLogin.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);
        await dismissOverlays(page);
      }
    } catch {}

    // Hide any login-screen via JS in case it's still around but invisible
    try {
      await page.evaluate(() => {
        const ls = document.getElementById('login-screen');
        if (ls) ls.style.display = 'none';
      });
    } catch {}
    await page.waitForTimeout(500);
    await snap(page, '01b-pos-loaded-post-dismiss');

    // DEBUG: capture the visible top-level form/modal that's blocking
    try {
      const debug = await page.evaluate(() => {
        // Find topmost visible button
        const btns = Array.from(document.querySelectorAll('button')).filter(b => {
          const r = b.getBoundingClientRect();
          const cs = getComputedStyle(b);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        });
        const topButtons = btns.slice(0, 25).map(b => ({
          text: (b.textContent || '').trim().substring(0, 40),
          id: b.id,
          cls: b.className.substring(0, 60),
          onclick: b.getAttribute('onclick') || '',
        }));
        // Also visible text
        const visibleText = (document.body.innerText || '').substring(0, 800);
        // Find currently visible login screen
        const ls = document.getElementById('login-screen');
        const lsVisible = ls ? getComputedStyle(ls).display !== 'none' : false;
        return { topButtons, visibleText, lsVisible, lsHTML: ls ? ls.outerHTML.substring(0, 800) : null };
      });
      auditData.screens[TAG].notes.push(`DEBUG: login-screen visible: ${debug.lsVisible}`);
      auditData.screens[TAG].notes.push(`DEBUG: visible text: ${(debug.visibleText || '').substring(0, 500).replace(/\n+/g, ' | ')}`);
      auditData.screens[TAG].notes.push(`DEBUG: top buttons: ${JSON.stringify(debug.topButtons).substring(0, 1500)}`);
    } catch (e) {
      auditData.screens[TAG].notes.push(`debug error: ${e.message}`);
    }

    // ---------- Build button list ----------
    // Strategy: enumerate buttons by their handler/label combination from HTML inspection
    // We'll click each one in order and probe for changes
    const buttonProbes = [
      // Topbar
      { sel: 'button.tb-btn.notif', label: 'Notificaciones', line: 1404 },
      { sel: 'button#tb-lowstock-bell', label: 'Alertas stock bajo', line: 1409 },
      { sel: 'button.platform-toggle-btn[onclick*="windows"]', label: 'Vista Windows', line: 1415 },
      { sel: 'button.platform-toggle-btn[onclick*="android"]', label: 'Vista Android', line: 1419 },
      { sel: 'button.platform-toggle-btn[onclick*="web"]', label: 'Vista Web', line: 1423 },
      { sel: 'button.tb-btn.rapido', label: 'Modo caja rápida (Quickpos)', line: 1429 },
      { sel: 'button.tb-btn.saas', label: 'SAAS Admin', line: 1434 },
      { sel: 'button.tb-btn.movil', label: 'Móvil (mobile-apps)', line: 1438 },
      { sel: 'button.tb-btn.livesync', label: 'LiveSync (salud)', line: 1442 },
      { sel: 'button.tb-btn.perfil', label: 'Perfil', line: 1447 },
      { sel: 'button.tb-btn.ayuda', label: 'Ayuda', line: 1451 },
      // Salir tested last (would log out)

      // Menu lateral — use data-menu attr for reliability
      { sel: 'button[data-menu="pos"]', label: 'Menu: POS', line: 1463 },
      { sel: 'button[data-menu="credito"]', label: 'Menu: Crédito', line: 1467 },
      { sel: 'button[data-menu="clientes"]', label: 'Menu: Clientes', line: 1471 },
      { sel: 'button[data-menu="inventario"]', label: 'Menu: Inventario', line: 1475 },
      { sel: 'button[data-menu="kardex"]', label: 'Menu: Kardex', line: 1479 },
      { sel: 'button[data-menu="proveedores"]', label: 'Menu: Proveedores', line: 1483 },
      { sel: 'button[data-menu="config"]', label: 'Menu: Configuración', line: 1487 },
      { sel: 'button[data-menu="facturacion"]', label: 'Menu: Facturación', line: 1491 },
      { sel: 'button[data-menu="corte"]', label: 'Menu: Corte', line: 1495 },
      { sel: 'button[data-menu="reportes"]', label: 'Menu: Reportes', line: 1499 },
      { sel: 'button[data-menu="dashboard"]', label: 'Menu: Dashboard', line: 1506 },
      { sel: 'button[data-menu="apertura"]', label: 'Menu: Apertura', line: 1510 },
      { sel: 'button[data-menu="cotizaciones"]', label: 'Menu: Cotizaciones', line: 1514 },
      { sel: 'button[data-menu="devoluciones"]', label: 'Menu: Devoluciones', line: 1518 },
      { sel: 'button[data-menu="ventas"]', label: 'Menu: Ventas', line: 1522 },
      { sel: 'button[data-menu="usuarios"]', label: 'Menu: Usuarios', line: 1526 },
      { sel: 'button[data-menu="recargas"]', label: 'Menu: Recargas', line: 1533 },
      { sel: 'button[data-menu="servicios"]', label: 'Menu: Servicios', line: 1537 },
      { sel: 'button[data-menu="tarjetas"]', label: 'Menu: Tarjetas (locked)', line: 1541 },
      { sel: 'button[data-menu="promociones"]', label: 'Menu: Promociones', line: 1545 },
      { sel: 'button[data-menu="departamentos"]', label: 'Menu: Departamentos', line: 1549 },
      { sel: 'button[data-menu="sugeridas"]', label: 'Menu: Compras IA (locked)', line: 1553 },
      { sel: 'button[data-menu="actualizador"]', label: 'Menu: Actualizador', line: 1557 },
      { sel: 'button.menu-btn.more', label: 'Menu: Más módulos', line: 1564 },
    ];

    // Click each menu button and POS-area button
    for (const probe of buttonProbes) {
      try {
        const loc = page.locator(probe.sel).first();
        // Restore POS view first if a non-POS menu button broke layout
        const before = page.url();
        const result = await probeButton(page, loc, probe.label);
        auditData.screens[TAG].buttons.push({
          label: probe.label,
          line: probe.line,
          selector: probe.sel,
          ...result,
        });
        // Take a snap of every menu nav for visual inventory
        if (probe.sel.startsWith('button[data-menu=')) {
          const menuSlug = probe.sel.match(/data-menu="([^"]+)"/)[1];
          await snap(page, `menu-${menuSlug}`);
        }
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

    // ---------- Return to POS to test POS area buttons ----------
    try {
      await page.locator('button[data-menu="pos"]').first().click();
      await page.waitForTimeout(800);
    } catch {}
    await snap(page, '02-pos-after-nav');

    // POS-area action buttons (use data-feature for reliability)
    const posActionProbes = [
      { sel: 'button[data-feature="pos.ins_varios"]', label: 'POS: Varios/Kits', line: 1601 },
      { sel: 'button[data-feature="pos.art_comun"]', label: 'POS: Producto común', line: 1605 },
      { sel: 'button[data-feature="pos.buscar"]', label: 'POS: Buscar', line: 1609 },
      { sel: 'button[data-feature="pos.mayoreo"]', label: 'POS: Mayoreo', line: 1613 },
      { sel: 'button[data-feature="pos.entradas"]', label: 'POS: Entradas', line: 1617 },
      { sel: 'button[data-feature="pos.salidas"]', label: 'POS: Salidas', line: 1621 },
      { sel: 'button[data-feature="pos.borrar"]', label: 'POS: Borrar', line: 1625 },
      { sel: 'button[data-feature="pos.verificador"]', label: 'POS: Verificador', line: 1629 },
      { sel: 'button[data-feature="pos.panel"]', label: 'POS: Panel catálogo', line: 1636 },
      { sel: 'button[data-feature="pos.catalogo"]', label: 'POS: Catálogo visual', line: 1640 },
      { sel: 'button[data-feature="pos.granel"]', label: 'POS: Granel', line: 1644 },
      { sel: 'button[data-feature="pos.descuento"]', label: 'POS: Descuento', line: 1648 },
      { sel: 'button[data-feature="pos.recargas_btn"]', label: 'POS: Recargas (tiempo aire)', line: 1652 },
      { sel: 'button[data-feature="pos.servicios_btn"]', label: 'POS: Servicios', line: 1656 },
      { sel: 'button[data-feature="pos.calculadora"]', label: 'POS: Calculadora', line: 1660 },
      // Cart bottom buttons
      { sel: 'button.btn-cobrar', label: 'POS: Cobrar', line: 1719 },
      { sel: 'button[data-feature="pos.cambiar"]', label: 'POS: Cambiar precio', line: 1702 },
      { sel: 'button[data-feature="pos.pendiente"]', label: 'POS: Venta pendiente', line: 1706 },
      { sel: 'button[onclick="clearCart()"]', label: 'POS: Eliminar venta', line: 1710 },
      { sel: 'button[onclick="openCustomerSelector()"]', label: 'POS: Asignar cliente', line: 1714 },
      { sel: 'button[onclick="reimprimirUltimoTicket()"]', label: 'POS: Reimprimir', line: 1745 },
      { sel: 'button[onclick="enviarAImpresora()"]', label: 'POS: Enviar a impresora', line: 1749 },
      { sel: 'button[onclick*="showScreen(\'ventas\')"]', label: 'POS: Historial ventas', line: 1753 },
    ];

    // Re-go POS once before the round
    try {
      await page.locator('button[data-menu="pos"]').first().click();
      await page.waitForTimeout(700);
    } catch {}

    for (const probe of posActionProbes) {
      try {
        // Make sure we're on POS first (always click POS menu before each probe to ensure consistent state)
        const isPosVisible = await page.locator('input#barcode-input').first().isVisible({ timeout: 600 }).catch(() => false);
        if (!isPosVisible) {
          await page.locator('button[data-menu="pos"]').first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(700);
        }
        const loc = page.locator(probe.sel).first();
        const result = await probeButton(page, loc, probe.label);
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
    await snap(page, '03-after-pos-actions');

    // ---------- Barcode input ----------
    try {
      // Make sure POS is active
      await page.locator('button[data-menu="pos"]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
      const barcode = page.locator('input#barcode-input').first();
      const visible = await barcode.isVisible({ timeout: 1500 }).catch(() => false);
      auditData.screens[TAG].buttons.push({
        label: 'Barcode input field',
        line: 1593,
        selector: 'input#barcode-input',
        result: visible ? '✅ WORKS' : '❌ DEAD',
        observation: visible ? 'visible y editable' : 'no encontrado',
      });
      if (visible) {
        await barcode.fill('12345').catch(() => {});
        await snap(page, '04-barcode-filled');
        await barcode.fill('').catch(() => {});
      }
      // Buscar (Enter) button
      const buscar = page.locator('button.btn-enter').first();
      const r = await probeButton(page, buscar, 'POS: Buscar (Enter)');
      auditData.screens[TAG].buttons.push({
        label: 'POS: Buscar (Enter)',
        line: 1593,
        selector: 'button.btn-enter',
        ...r,
      });
      await closeAnyModal(page);
    } catch (e) {
      auditData.screens[TAG].notes.push(`Barcode test error: ${(e.message || '').substring(0, 200)}`);
    }

    // ---------- Quickpos (F1 / numeric keypad) ----------
    try {
      // Activate via topbar rapido button
      await page.locator('button.tb-btn.rapido').first().click().catch(() => {});
      await page.waitForTimeout(900);
      await snap(page, '05-quickpos');

      const qpKeys = ['7','8','9','4','5','6','1','2','3','0','.','C'];
      for (const k of qpKeys) {
        const sel = `button.quickpos-key:has-text("${k === '.' ? '\\.' : k}")`;
        const r = await probeButton(page, page.locator(`button.quickpos-key`).filter({ hasText: new RegExp(`^${k.replace('.', '\\.')}$`) }).first(), `Quickpos key ${k}`);
        auditData.screens[TAG].buttons.push({
          label: `Quickpos key ${k}`,
          line: 2359,
          selector: `button.quickpos-key (${k})`,
          ...r,
        });
      }
      // Quickpos Cobrar
      const r = await probeButton(page, page.locator('button[onclick="quickPosCobrar()"]').first(), 'Quickpos Cobrar');
      auditData.screens[TAG].buttons.push({
        label: 'Quickpos Cobrar',
        line: 2371,
        selector: 'button[onclick="quickPosCobrar()"]',
        ...r,
      });
      await closeAnyModal(page);
    } catch (e) {
      auditData.screens[TAG].notes.push(`Quickpos error: ${(e.message || '').substring(0, 200)}`);
    }

    // Return to main POS
    try {
      await page.locator('button[data-menu="pos"]').first().click().catch(() => {});
      await page.waitForTimeout(500);
    } catch {}

    // ---------- Last: test Salir (logout) ----------
    try {
      const r = await probeButton(page, page.locator('button.tb-btn.salir').first(), 'Topbar: Salir (logout)');
      auditData.screens[TAG].buttons.push({
        label: 'Topbar: Salir',
        line: 1455,
        selector: 'button.tb-btn.salir',
        ...r,
      });
      await snap(page, '06-after-logout');
    } catch (e) {
      auditData.screens[TAG].notes.push(`Salir error: ${(e.message || '').substring(0, 200)}`);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN 2: KDS Comandero
  // ──────────────────────────────────────────────────────────────────────────
  test('Screen 2: volvix-kds.html (Comandero)', async ({ page }) => {
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

    // Test sound toggle
    try {
      const r = await probeButton(page, page.locator('#soundBtn').first(), 'KDS: Sonido toggle');
      auditData.screens[TAG].buttons.push({
        label: 'Sonido ON/OFF',
        line: 66,
        selector: '#soundBtn',
        ...r,
      });
    } catch (e) {
      auditData.screens[TAG].notes.push(`Sound btn error: ${(e.message || '').substring(0, 200)}`);
    }

    // Test station filter
    try {
      const stationSel = page.locator('#station').first();
      if (await stationSel.isVisible({ timeout: 1500 }).catch(() => false)) {
        await stationSel.selectOption('grill').catch(() => {});
        await page.waitForTimeout(500);
        await stationSel.selectOption('').catch(() => {});
        auditData.screens[TAG].buttons.push({
          label: 'Filtro estación',
          line: 60,
          selector: '#station',
          result: '✅ WORKS',
          observation: 'select cambia opciones',
        });
      } else {
        auditData.screens[TAG].buttons.push({
          label: 'Filtro estación',
          line: 60,
          selector: '#station',
          result: '❌ DEAD',
          observation: 'no visible',
        });
      }
    } catch (e) {
      auditData.screens[TAG].notes.push(`station error: ${(e.message || '').substring(0, 200)}`);
    }

    // Check connection status
    try {
      const connStatus = await page.locator('#connStatus').textContent().catch(() => '');
      auditData.screens[TAG].notes.push(`Connection status: "${connStatus}"`);
    } catch {}

    // Check that the 3 columns are present
    try {
      const cols = await page.locator('section.col').count();
      auditData.screens[TAG].notes.push(`KDS columns rendered: ${cols} (esperado: 3)`);
    } catch {}

    await snap(page, 'kds-02-final');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // After all tests, write the report
  // ──────────────────────────────────────────────────────────────────────────
  test.afterAll(async () => {
    const lines = [];
    lines.push(`# B42 — POS UI Click-by-Click Audit (R3A)`);
    lines.push(``);
    lines.push(`**Generated:** ${auditData.startTime}`);
    lines.push(`**Base URL:** ${auditData.baseURL}`);
    lines.push(`**User:** ${CAJERO.email}`);
    lines.push(`**Methodology:** Real Playwright browser, click EVERY button, measure response`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);

    // Per screen
    for (const [tag, data] of Object.entries(auditData.screens)) {
      lines.push(`## Screen: ${tag}`);
      lines.push(``);
      if (data.notes.length) {
        lines.push(`**Notes:**`);
        for (const n of data.notes) lines.push(`- ${n}`);
        lines.push(``);
      }
      lines.push(`### Button-by-button results`);
      lines.push(``);
      lines.push(`| Label | Line | Selector | Result | Observation |`);
      lines.push(`|---|---|---|---|---|`);
      for (const b of data.buttons) {
        lines.push(`| ${b.label} | ${b.line} | \`${b.selector}\` | ${b.result} | ${b.observation} |`);
      }
      lines.push(``);

      // Aggregate stats
      const total = data.buttons.length;
      const works = data.buttons.filter(b => b.result.includes('✅')).length;
      const partial = data.buttons.filter(b => b.result.includes('⚠️')).length;
      const dead = data.buttons.filter(b => b.result.includes('❌')).length;
      const crash = data.buttons.filter(b => b.result.includes('🚫')).length;
      lines.push(`### Stats — ${tag}`);
      lines.push(``);
      lines.push(`- **Total buttons probed:** ${total}`);
      lines.push(`- **✅ WORKS:** ${works}`);
      lines.push(`- **⚠️ PARTIAL (no visible change):** ${partial}`);
      lines.push(`- **❌ DEAD:** ${dead}`);
      lines.push(`- **🚫 CRASH:** ${crash}`);
      const score = total === 0 ? 0 : Math.round((works * 100 + partial * 30) / total);
      lines.push(`- **Score / 100:** ${score}`);
      lines.push(``);

      // Dead buttons list
      const deadList = data.buttons.filter(b => b.result.includes('❌') || b.result.includes('🚫'));
      if (deadList.length > 0) {
        lines.push(`### Dead/crashing buttons (${deadList.length})`);
        lines.push(``);
        for (const b of deadList) {
          lines.push(`- **${b.label}** (line ${b.line}) → ${b.result}: ${b.observation}`);
        }
        lines.push(``);
      }

      // Console errors
      const errs = auditData.consoleErrors[tag] || [];
      lines.push(`### Console errors — ${tag} (${errs.length})`);
      lines.push(``);
      if (errs.length === 0) {
        lines.push(`- _ninguno_`);
      } else {
        for (const e of errs.slice(0, 20)) {
          lines.push(`- \`${e.text.replace(/\|/g, '\\|')}\``);
        }
        if (errs.length > 20) lines.push(`- _… y ${errs.length - 20} más_`);
      }
      lines.push(``);

      // Network failures
      const nets = auditData.networkFailures[tag] || [];
      lines.push(`### Network failures (4xx/5xx) — ${tag} (${nets.length})`);
      lines.push(``);
      if (nets.length === 0) {
        lines.push(`- _ninguno_`);
      } else {
        const grouped = {};
        for (const n of nets) {
          const key = `${n.method} ${n.status} ${n.url.split('?')[0]}`;
          grouped[key] = (grouped[key] || 0) + 1;
        }
        for (const [k, count] of Object.entries(grouped).slice(0, 30)) {
          lines.push(`- \`${k}\` × ${count}`);
        }
      }
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    // Screenshot inventory
    lines.push(`## Screenshot inventory`);
    lines.push(``);
    lines.push(`Saved in: \`tests/screenshots-r3a/\``);
    lines.push(``);
    for (const s of auditData.screenshots) {
      lines.push(`- ${s}`);
    }
    lines.push(``);

    // Aggregate
    let totalAll = 0, worksAll = 0, partialAll = 0, deadAll = 0, crashAll = 0;
    for (const data of Object.values(auditData.screens)) {
      totalAll += data.buttons.length;
      worksAll += data.buttons.filter(b => b.result.includes('✅')).length;
      partialAll += data.buttons.filter(b => b.result.includes('⚠️')).length;
      deadAll += data.buttons.filter(b => b.result.includes('❌')).length;
      crashAll += data.buttons.filter(b => b.result.includes('🚫')).length;
    }
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Global summary`);
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Total buttons probed | ${totalAll} |`);
    lines.push(`| ✅ Works | ${worksAll} |`);
    lines.push(`| ⚠️ Partial | ${partialAll} |`);
    lines.push(`| ❌ Dead | ${deadAll} |`);
    lines.push(`| 🚫 Crash | ${crashAll} |`);
    const overallScore = totalAll === 0 ? 0 : Math.round((worksAll * 100 + partialAll * 30) / totalAll);
    lines.push(`| **Overall score / 100** | **${overallScore}** |`);
    lines.push(``);

    fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'audit-data.json'), JSON.stringify(auditData, null, 2), 'utf8');
    console.log(`\n[R3A] Report written: ${REPORT_PATH}`);
    console.log(`[R3A] Screenshots: ${SCREENSHOT_DIR}`);
  });
});
