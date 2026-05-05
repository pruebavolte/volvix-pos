// FASE 2.1 - Autenticación: 3 roles + bad creds + logout + PIN
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const PASS = 'Volvix2026!';
const PIN = '1234';
const ROLES = [
  { email: 'admin@volvix.test', role: 'admin' },
  { email: 'owner@volvix.test', role: 'owner' },
  { email: 'cajero@volvix.test', role: 'cajero' }
];

function attach(page, label) {
  page.on('pageerror', e => console.log(`[QA][PAGEERROR][${label}]`, e.message));
  page.on('request', r => { if (r.url().includes('/api/')) console.log(`[QA][REQ][${label}]`, r.method(), r.url()); });
  page.on('response', r => { if (r.url().includes('/api/')) console.log(`[QA][RES][${label}]`, r.status(), r.url()); });
}

async function tryLogin(page, email, password) {
  await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' }).catch(() => page.goto(BASE));
  await page.waitForTimeout(800);
  const e = await page.$('input[type="email"], #email');
  const p = await page.$('input[type="password"], #password');
  if (e) await e.fill(email);
  if (p) await p.fill(password);
  const btn = await page.$('button[type="submit"]');
  if (btn) await btn.click();
  await page.waitForTimeout(1500);
}

for (const r of ROLES) {
  test(`login OK ${r.role}`, async ({ page }) => {
    attach(page, r.role);
    console.log(`[QA] testing role ${r.role}`);
    await tryLogin(page, r.email, PASS);
    await page.screenshot({ path: `artifacts/auth_${r.role}_login.png`, fullPage: true }).catch(() => {});
    const url = page.url();
    expect(url).not.toContain('/login.html');
    console.log('[QA RESULT]\n  Expected: redirect away from login\n  Actual:', url, '\n  Error?: no\n  Improvement?: stronger session indicator');
  });
}

test('login fail bad credentials', async ({ page }) => {
  attach(page, 'badcreds');
  await tryLogin(page, 'admin@volvix.test', 'wrong-password-xyz');
  const stillOnLogin = page.url().includes('/login') || await page.$('input[type="password"]');
  expect(stillOnLogin).toBeTruthy();
  console.log('[QA RESULT]\n  Expected: stay on login + error msg\n  Actual: stayed on login\n  Error?: no\n  Improvement?: throttling tras 5 intentos');
});

test('PIN keypad admin', async ({ page }) => {
  attach(page, 'pin');
  await tryLogin(page, 'admin@volvix.test', PASS);
  for (const d of PIN.split('')) {
    const k = await page.$(`[data-pin="${d}"], button:has-text("${d}")`);
    if (k) await k.click().catch(() => {});
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/auth_pin.png' }).catch(() => {});
  console.log('[QA RESULT]\n  Expected: PIN admite 1234 y abre POS\n  Actual: ver screenshot\n  Error?: depends\n  Improvement?: bloqueo tras 3 PINs incorrectos');
});

test('logout limpia sesión', async ({ page }) => {
  attach(page, 'logout');
  await tryLogin(page, 'admin@volvix.test', PASS);
  const lo = await page.$('button:has-text("Cerrar sesión"), button:has-text("Logout"), [data-action="logout"]');
  if (lo) await lo.click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.goto(`${BASE}/`).catch(() => {});
  await page.waitForTimeout(500);
  const onLogin = page.url().includes('login') || await page.$('input[type="password"]');
  expect(onLogin).toBeTruthy();
  console.log('[QA RESULT]\n  Expected: tras logout, root redirige a /login\n  Actual:', page.url(), '\n  Error?: no\n  Improvement?: invalidar JWT en server');
});
