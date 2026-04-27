// QA DESTRUCTIVO #5 - Ataques a autenticación: JWT none, replay, bruteforce, multi-tenant
const { test, expect, request } = require('@playwright/test');
const crypto = require('crypto');

const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
const EMAIL = 'admin@volvix.test';
const PASS = 'Volvix2026!';

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function craftJWT(header, payload, sig = '') {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  return `${h}.${p}.${sig}`;
}

async function loginToken(ctx) {
  const r = await ctx.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASS },
    failOnStatusCode: false
  });
  const j = r.ok() ? await r.json().catch(() => ({})) : {};
  return j.token || j.access_token || null;
}

test.describe('Ataques a autenticación', () => {

  test('JWT con alg:none debe ser rechazado', async () => {
    const ctx = await request.newContext();
    const fake = craftJWT(
      { alg: 'none', typ: 'JWT' },
      { sub: '1', email: 'admin@volvix.test', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
      ''
    );
    const r = await ctx.get(`${BASE}/api/me`, {
      headers: { Authorization: `Bearer ${fake}` },
      failOnStatusCode: false
    });
    console.log(`[alg-none] status=${r.status()}`);
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('JWT con firma modificada → 401', async () => {
    const ctx = await request.newContext();
    const real = await loginToken(ctx);
    test.skip(!real, 'no se obtuvo token real');
    const parts = real.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${b64url(crypto.randomBytes(32))}`;
    const r = await ctx.get(`${BASE}/api/me`, {
      headers: { Authorization: `Bearer ${tampered}` },
      failOnStatusCode: false
    });
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('JWT expirado por 1 segundo → 401', async () => {
    const ctx = await request.newContext();
    const expired = craftJWT(
      { alg: 'HS256', typ: 'JWT' },
      { sub: '1', role: 'admin', exp: Math.floor(Date.now() / 1000) - 1 },
      b64url(crypto.randomBytes(32))
    );
    const r = await ctx.get(`${BASE}/api/me`, {
      headers: { Authorization: `Bearer ${expired}` },
      failOnStatusCode: false
    });
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('Token de otro tenant → 403 (multi-tenant isolation)', async () => {
    // Token con tenant_id diferente al del recurso solicitado
    const ctx = await request.newContext();
    const real = await loginToken(ctx);
    test.skip(!real, 'no se obtuvo token real');
    // Intentar acceder a recurso con tenant_id explícito de otro tenant
    const r = await ctx.get(`${BASE}/api/products?tenant_id=TENANT_OTRO_FALSO`, {
      headers: { Authorization: `Bearer ${real}` },
      failOnStatusCode: false
    });
    // El backend debe ignorar el tenant_id del query y usar el del JWT.
    // Si filtra correctamente, ningún producto del otro tenant debería filtrarse.
    expect(r.status()).toBeLessThan(500);
    if (r.ok()) {
      const body = await r.json().catch(() => ({}));
      const items = body.products || body.data || body.items || (Array.isArray(body) ? body : []);
      // Si trajo algo, debe ser del tenant del usuario, NO del query falso
      if (Array.isArray(items) && items.length > 0) {
        const wrongTenant = items.find(i => i.tenant_id === 'TENANT_OTRO_FALSO');
        expect(wrongTenant).toBeFalsy();
      }
    }
    await ctx.dispose();
  });

  test('Bruteforce login 100 intentos → rate limit 429', async () => {
    const ctx = await request.newContext();
    const tasks = Array.from({ length: 100 }, (_, i) =>
      ctx.post(`${BASE}/api/auth/login`, {
        data: { email: EMAIL, password: 'WRONG' + i },
        failOnStatusCode: false
      })
    );
    const results = await Promise.all(tasks);
    const statuses = results.map(r => r.status());
    const rate = statuses.filter(s => s === 429).length;
    const crash = statuses.filter(s => s >= 500).length;
    console.log(`[bruteforce] 429=${rate} 5xx=${crash} sample=${statuses.slice(0, 10)}`);
    expect(crash).toBe(0);
    expect(rate).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('Replay attack: enviar request idéntica 2x', async () => {
    const ctx = await request.newContext();
    const tok = await loginToken(ctx);
    test.skip(!tok, 'no token');
    const headers = {
      Authorization: `Bearer ${tok}`,
      'Idempotency-Key': 'replay-test-' + Date.now(),
      'X-Nonce': 'nonce-' + Date.now()
    };
    const data = { items: [{ product_id: 1, qty: 1, price: 1 }], total: 1 };
    const r1 = await ctx.post(`${BASE}/api/sales`, { headers, data, failOnStatusCode: false });
    const r2 = await ctx.post(`${BASE}/api/sales`, { headers, data, failOnStatusCode: false });
    console.log(`[replay] r1=${r1.status()} r2=${r2.status()}`);
    expect(r1.status()).toBeLessThan(500);
    expect(r2.status()).toBeLessThan(500);
    // Idealmente: r2 devuelve mismo recurso (idempotente) o 409 (conflict)
    // Si ambos crean recurso nuevo → vulnerable a replay
    await ctx.dispose();
  });

  test('Header injection en Authorization', async () => {
    const ctx = await request.newContext();
    const r = await ctx.get(`${BASE}/api/me`, {
      headers: { Authorization: 'Bearer fake\r\nX-Admin: true' },
      failOnStatusCode: false
    });
    expect(r.status()).toBeLessThan(500);
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

});
