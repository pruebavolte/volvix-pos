// FASE 1 - Exploración autónoma del POS
// Genera INVENTORY.json con todos los elementos interactivos
// Uso: node phase1_explore.js
// Requiere: npm i playwright

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = process.env.QA_EMAIL || 'admin@volvix.test';
const PASSWORD = process.env.QA_PASSWORD || 'Volvix2026!';
const PIN = process.env.QA_PIN || '1234';
const OUT_DIR = path.join(__dirname, 'artifacts');
const SCREENSHOTS = path.join(OUT_DIR, 'phase1_screens');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, { recursive: true });

function log(tag, msg) {
  console.log(`[QA][${tag}] ${msg}`);
}

async function safeShot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
  } catch (e) {
    log('SHOT_ERR', `${name}: ${e.message}`);
  }
}

async function extractInteractives(page, context) {
  const data = await page.evaluate(() => {
    function describe(el) {
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const aria = el.getAttribute('aria-label') || '';
      const label = (el.innerText || el.value || el.placeholder || aria || '').trim().slice(0, 120);
      let selector = el.tagName.toLowerCase();
      if (el.id) selector += `#${el.id}`;
      if (el.name) selector += `[name="${el.name}"]`;
      const cls = (el.className && typeof el.className === 'string') ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      if (cls) selector += `.${cls}`;
      return {
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        id: el.id || null,
        name: el.name || null,
        label,
        ariaLabel: aria,
        placeholder: el.placeholder || null,
        role: el.getAttribute('role') || null,
        disabled: !!el.disabled,
        visible,
        selector
      };
    }
    const out = { buttons: [], inputs: [], selects: [], textareas: [], links: [], modals: [] };
    document.querySelectorAll('button, [role="button"]').forEach(b => out.buttons.push(describe(b)));
    document.querySelectorAll('input').forEach(i => out.inputs.push(describe(i)));
    document.querySelectorAll('select').forEach(s => out.selects.push(describe(s)));
    document.querySelectorAll('textarea').forEach(t => out.textareas.push(describe(t)));
    document.querySelectorAll('a[href]').forEach(a => out.links.push({ ...describe(a), href: a.getAttribute('href') }));
    document.querySelectorAll('[role="dialog"], .modal, dialog').forEach(m => out.modals.push(describe(m)));
    return out;
  });
  return { context, ...data, capturedAt: new Date().toISOString() };
}

async function login(page) {
  log('LOGIN', `navigating to ${BASE_URL}/login.html`);
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  });
  await page.waitForTimeout(1500);
  await safeShot(page, '01_login_page');

  const emailSel = await page.$('input[type="email"], input[name="email"], #email');
  const pwdSel = await page.$('input[type="password"], input[name="password"], #password');
  if (emailSel) await emailSel.fill(EMAIL);
  if (pwdSel) await pwdSel.fill(PASSWORD);

  const submit = await page.$('button[type="submit"], button#login, button.btn-login');
  if (submit) await submit.click();
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await safeShot(page, '02_after_login');

  // PIN keypad
  const pinDigits = PIN.split('');
  for (const d of pinDigits) {
    const btn = await page.$(`[data-pin="${d}"], button:has-text("${d}")`);
    if (btn) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(120);
    }
  }
  await page.waitForTimeout(1500);
  await safeShot(page, '03_after_pin');
  log('LOGIN', 'login flow finished');
}

async function visitTabs(page, inventory) {
  const TABS = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
  for (const tab of TABS) {
    log('TAB', `opening ${tab}`);
    await page.keyboard.press(tab).catch(() => {});
    await page.waitForTimeout(900);
    await safeShot(page, `tab_${tab}`);
    const data = await extractInteractives(page, `tab_${tab}`);
    inventory.tabs.push(data);
  }
}

async function mapFlows(page, inventory) {
  const buttons = await page.$$('button:visible');
  const limit = Math.min(buttons.length, 25);
  for (let i = 0; i < limit; i++) {
    try {
      const txt = (await buttons[i].innerText().catch(() => '')).trim().slice(0, 40);
      if (!txt) continue;
      await buttons[i].click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(500);
      const modal = await page.$('[role="dialog"], .modal.open, dialog[open]');
      if (modal) {
        const fields = await modal.$$eval('input,select,textarea',
          els => els.map(e => ({
            tag: e.tagName.toLowerCase(),
            type: e.type || '',
            name: e.name || e.id,
            required: !!e.required,
            placeholder: e.placeholder || ''
          }))
        );
        inventory.flows.push({ trigger: txt, fields, openedModal: true });
        const close = await page.$('[aria-label="close"], .modal-close, button:has-text("Cerrar"), button:has-text("Cancelar")');
        if (close) await close.click().catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch (e) {
      log('FLOW_ERR', e.message);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') log('CONSOLE_ERR', m.text()); });

  const inventory = { url: BASE_URL, generatedAt: new Date().toISOString(), tabs: [], flows: [], global: null };

  try {
    await login(page);
    inventory.global = await extractInteractives(page, 'post_login');
    await visitTabs(page, inventory);
    await mapFlows(page, inventory);
  } catch (e) {
    log('FATAL', e.message);
    inventory.fatalError = e.message;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'INVENTORY.json'), JSON.stringify(inventory, null, 2));
  log('DONE', `INVENTORY.json written (${inventory.tabs.length} tabs, ${inventory.flows.length} flows)`);

  await context.storageState({ path: path.join(OUT_DIR, 'storage.json') }).catch(() => {});
  await browser.close();
})();
