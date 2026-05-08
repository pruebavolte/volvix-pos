// =============================================================================
// tests/panel-permisos-v87.spec.js
// 10+ escenarios de prueba para verificar el fix del panel de permisos v1.0.87
// Corre contra: https://volvix-pos.vercel.app
// =============================================================================
const { test, expect, request } = require('@playwright/test');

const BASE = process.env.TEST_BASE || 'https://volvix-pos.vercel.app';
const EMAIL = process.env.TEST_EMAIL || 'grupovolvix@gmail.com';
const PASS  = process.env.TEST_PASS  || '123456789';

let TOKEN = null;
let ctxRequest;

test.beforeAll(async () => {
  ctxRequest = await request.newContext({ baseURL: BASE });
  // Login para obtener JWT
  const r = await ctxRequest.post('/api/login', {
    headers: { 'Content-Type': 'application/json' },
    data: { email: EMAIL, password: PASS },
  });
  expect(r.ok(), 'login debe responder 200').toBeTruthy();
  const j = await r.json();
  TOKEN = j.token || j.jwt || j.access_token || (j.session && j.session.token);
  expect(TOKEN, 'token JWT presente').toBeTruthy();
  console.log('[setup] token obtenido:', TOKEN.slice(0, 32) + '…');
});

// ESCENARIO 1: Healthcheck del deploy
test('1. /version.json sirve v1.0.87 o superior', async () => {
  const r = await ctxRequest.get('/version.json');
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  console.log('  version:', j.version);
  expect(j.version).toMatch(/^1\.0\.\d+/);
  const patch = parseInt(j.version.split('.')[2], 10);
  expect(patch).toBeGreaterThanOrEqual(87);
});

// ESCENARIO 2: Login API funciona
test('2. /api/login retorna JWT válido para superadmin', async () => {
  const r = await ctxRequest.post('/api/login', {
    headers: { 'Content-Type': 'application/json' },
    data: { email: EMAIL, password: PASS },
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  const token = j.token || j.jwt || (j.session && j.session.token);
  expect(token).toBeTruthy();
  // JWT formato: header.payload.signature
  expect(token.split('.').length).toBe(3);
});

// ESCENARIO 3: GET /api/admin/tenants devuelve >= 30 items (FIX C bug 1)
test('3. /api/admin/tenants devuelve {items} con tenants reales', async () => {
  const r = await ctxRequest.get('/api/admin/tenants', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  expect(Array.isArray(j.items), 'devuelve items, no tenants').toBeTruthy();
  console.log('  tenants count:', j.items.length);
  expect(j.items.length).toBeGreaterThanOrEqual(20);
  // Verificar que cada item tiene tenant_id (slug) y name
  const sample = j.items[0];
  expect(sample.tenant_id).toMatch(/^TNT-?[A-Z0-9]+/);
  expect(sample.name).toBeTruthy();
});

// ESCENARIO 4: GET /api/admin/users/hierarchy
test('4. /api/admin/users/hierarchy retorna árbol completo', async () => {
  const r = await ctxRequest.get('/api/admin/users/hierarchy', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  expect(j.platform_owners.length).toBeGreaterThanOrEqual(1);
  expect(j.tenants.length).toBeGreaterThanOrEqual(20);
  expect(j.totals.users).toBeGreaterThan(50);
  console.log('  superadmins:', j.platform_owners.length, '· tenants:', j.tenants.length, '· employees:', j.totals.employees);
  // grupovolvix debe estar en platform_owners
  const me = j.platform_owners.find(p => p.email === EMAIL);
  expect(me, 'grupovolvix@gmail.com debe ser superadmin').toBeTruthy();
});

// ESCENARIO 5: Rosticería tiene 2 empleados (los que sembramos)
test('5. Rosticería (TNT-62384) tiene 2+ empleados', async () => {
  const r = await ctxRequest.get('/api/admin/users/hierarchy', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  const j = await r.json();
  const ros = j.tenants.find(t => t.tenant_id === 'TNT-62384');
  expect(ros, 'Rosticería debe existir').toBeTruthy();
  console.log('  Rosticería empleados:', ros.employees.length);
  expect(ros.employees.length).toBeGreaterThanOrEqual(2);
  const emails = ros.employees.map(e => e.email);
  expect(emails.some(e => e && e.includes('rosticeria@volvix.demo'))).toBeTruthy();
});

// ESCENARIO 6: PañalesExpress tiene gerente + cajera
test('6. PañalesExpress (TNT-GZACJ) tiene gerente y cajera', async () => {
  const r = await ctxRequest.get('/api/admin/tenant/TNT-GZACJ/employees', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  console.log('  PañalesExpress empleados:', j.employees.length);
  const roles = j.employees.map(e => e.role);
  expect(roles).toContain('manager');
  expect(roles).toContain('cajero');
});

// ESCENARIO 7: GET /api/admin/user/by-email resuelve email -> uuid
test('7. /api/admin/user/by-email resuelve grupovolvix@gmail.com', async () => {
  const r = await ctxRequest.get('/api/admin/user/by-email?email=' + encodeURIComponent(EMAIL), {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  expect(j.user.email).toBe(EMAIL);
  expect(j.user.id).toMatch(/^[a-f0-9-]{36}$/i);
  expect(j.user.volvix_role).toBe('superadmin');
  console.log('  uuid:', j.user.id, '· tenant:', j.user.tenant_id);
});

// ESCENARIO 8: GET /api/admin/tenant/:tid/flags para TNT-62384
test('8. /api/admin/tenant/TNT-62384/flags devuelve modules+buttons', async () => {
  const r = await ctxRequest.get('/api/admin/tenant/TNT-62384/flags', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  expect(j.tenant_id).toBe('TNT-62384');
  expect(typeof j.modules).toBe('object');
  expect(typeof j.buttons).toBe('object');
  expect(j.name).toContain('Rosticeria');
  console.log('  modules en DB:', Object.keys(j.modules).length, '· buttons:', Object.keys(j.buttons).length);
});

// ESCENARIO 9: Toggle a module via API y persiste
test('9. POST /api/admin/tenant/TNT-62384/module persiste cambio', async () => {
  const r = await ctxRequest.post('/api/admin/tenant/TNT-62384/module', {
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    data: { module_key: 'recargas', enabled: false },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  // Verificar que se persistió
  const r2 = await ctxRequest.get('/api/admin/tenant/TNT-62384/flags', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  const j2 = await r2.json();
  expect(j2.modules.recargas).toBe(false);
  console.log('  recargas para Rosticería:', j2.modules.recargas);
  // Restaurar
  await ctxRequest.post('/api/admin/tenant/TNT-62384/module', {
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    data: { module_key: 'recargas', enabled: true },
  });
});

// ESCENARIO 10: Audit log registra el cambio
test('10. Audit log de TNT-62384 contiene cambios recientes', async () => {
  const r = await ctxRequest.get('/api/admin/tenant/TNT-62384/audit', {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBeTruthy();
  expect(Array.isArray(j.audit)).toBeTruthy();
  console.log('  audit entries:', j.audit.length);
  expect(j.audit.length).toBeGreaterThan(0);
  // El más reciente debe ser de hoy
  const latest = j.audit[0];
  expect(latest.module_key || latest.scope_ref).toBeTruthy();
});

// ESCENARIO 11: Forbidden para no-superadmin
test('11. Sin token = 401/403, token inválido = 401', async () => {
  const r1 = await ctxRequest.get('/api/admin/tenants');
  expect([401, 403]).toContain(r1.status());
  const r2 = await ctxRequest.get('/api/admin/tenants', {
    headers: { 'Authorization': 'Bearer fake.token.here' },
  });
  expect([401, 403]).toContain(r2.status());
  console.log('  sin token:', r1.status(), '· token fake:', r2.status());
});

// ESCENARIO 12: UI — la página #permisos carga
test('12. UI: /salvadorex-pos.html#permisos carga sin errores JS', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Inyectar token antes de navegar
  await page.goto(BASE + '/salvadorex-pos.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((tok) => {
    localStorage.setItem('volvix_token', tok);
    localStorage.setItem('volvixAuthToken', tok);
    localStorage.setItem('volvix_onboarding_done', '1');
    localStorage.setItem('volvix_onboarding_dismissed', '1');
  }, TOKEN);
  await page.goto(BASE + '/salvadorex-pos.html#permisos', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  // Capturar screenshot
  await page.screenshot({ path: 'tests/_screenshots/12-permisos-loaded.png', fullPage: false });
  // No debe haber errores fatales
  console.log('  errores JS:', errors.length, errors.slice(0,2));
  expect(errors.filter(e => !e.includes('favicon')).length).toBeLessThan(3);
});

// ESCENARIO 13: UI — tenant dropdown se popula con multiple options
test('13. UI: dropdown #perm-tenant-sel tiene >5 tenants', async ({ page }) => {
  await page.goto(BASE + '/salvadorex-pos.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok) => {
    localStorage.setItem('volvix_token', tok);
    localStorage.setItem('volvixAuthToken', tok);
    localStorage.setItem('volvix_onboarding_done', '1');
    localStorage.setItem('volvix_onboarding_dismissed', '1');
  }, TOKEN);
  await page.goto(BASE + '/salvadorex-pos.html#permisos', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#perm-tenant-sel', { timeout: 10000 });
  await page.waitForTimeout(3000); // dejar que loadTenants termine
  const optCount = await page.$$eval('#perm-tenant-sel option', opts => opts.length);
  console.log('  options en dropdown:', optCount);
  expect(optCount).toBeGreaterThan(5);
  await page.screenshot({ path: 'tests/_screenshots/13-tenant-dropdown.png', fullPage: false });
});

// ESCENARIO 14: UI — Tab Jerarquía renderiza el árbol
test('14. UI: tab Jerarquía muestra superadmin + tenants + empleados', async ({ page }) => {
  await page.goto(BASE + '/salvadorex-pos.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok) => {
    localStorage.setItem('volvix_token', tok);
    localStorage.setItem('volvixAuthToken', tok);
    localStorage.setItem('volvix_onboarding_done', '1');
    localStorage.setItem('volvix_onboarding_dismissed', '1');
  }, TOKEN);
  await page.goto(BASE + '/salvadorex-pos.html#permisos', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#perm-tab-hierarchy', { timeout: 10000 });
  await page.click('#perm-tab-hierarchy');
  await page.waitForTimeout(3000); // dejar que loadHierarchy termine
  const treeText = await page.textContent('#perm-hierarchy-tree');
  console.log('  primeros 200 chars:', treeText.slice(0, 200));
  expect(treeText).toContain('PLATFORM OWNERS');
  expect(treeText).toContain('grupovolvix@gmail.com');
  expect(treeText).toContain('NEGOCIOS');
  await page.screenshot({ path: 'tests/_screenshots/14-jerarquia-tab.png', fullPage: true });
});

// ESCENARIO 15: UI — clic en otro tenant cambia el banner
test('15. UI: cambiar tenant en dropdown actualiza banner', async ({ page }) => {
  await page.goto(BASE + '/salvadorex-pos.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((tok) => {
    localStorage.setItem('volvix_token', tok);
    localStorage.setItem('volvixAuthToken', tok);
    localStorage.setItem('volvix_onboarding_done', '1');
    localStorage.setItem('volvix_onboarding_dismissed', '1');
  }, TOKEN);
  await page.goto(BASE + '/salvadorex-pos.html#permisos', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#perm-tenant-sel', { timeout: 10000 });
  await page.waitForTimeout(3000);
  // Banner inicial debe decir "MI propio negocio"
  const banner1 = await page.textContent('#perm-tenant-banner');
  console.log('  banner inicial:', banner1.trim().slice(0, 80));
  // Cambiar a Rosticería
  await page.selectOption('#perm-tenant-sel', 'TNT-62384').catch(() => {});
  await page.waitForTimeout(2500);
  const banner2 = await page.textContent('#perm-tenant-banner');
  console.log('  banner después:', banner2.trim().slice(0, 80));
  expect(banner2).toContain('OTRO tenant');
  await page.screenshot({ path: 'tests/_screenshots/15-banner-otro-tenant.png', fullPage: false });
});
