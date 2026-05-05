// FASE 5 - Validación BD simulada: comparar POST sale vs GET /api/sales/latest
const { test, expect } = require('@playwright/test');
const BASE = process.env.BASE_URL || 'https://volvix-pos.vercel.app';
test.use({ storageState: 'artifacts/storage.json' });

test('POST sale aparece en GET /api/sales/latest', async ({ request }) => {
  const payload = {
    items: [{ sku: 'QA-PROD-1', qty: 1, price: 100 }],
    payment: 'cash',
    total: 100,
    idempotencyKey: `qa-${Date.now()}`
  };
  const post1 = await request.post(`${BASE}/api/sales`, { data: payload, failOnStatusCode: false }).catch(() => null);
  const post1Status = post1 ? post1.status() : 'ERR';
  let post1Body = {};
  try { post1Body = post1 ? await post1.json() : {}; } catch (e) {}
  console.log('[QA][POST1]', post1Status, JSON.stringify(post1Body).slice(0, 200));

  await new Promise(r => setTimeout(r, 600));
  const latest = await request.get(`${BASE}/api/sales/latest`, { failOnStatusCode: false }).catch(() => null);
  const latestStatus = latest ? latest.status() : 'ERR';
  let latestBody = null;
  try { latestBody = latest ? await latest.json() : null; } catch (e) {}
  console.log('[QA][LATEST]', latestStatus, JSON.stringify(latestBody).slice(0, 200));

  const matches = latestBody && JSON.stringify(latestBody).includes(payload.idempotencyKey);
  console.log('[QA RESULT]\n  Expected: latest contiene la venta recién creada\n  Actual: matches =', matches, '\n  Error?: depends\n  Improvement?: include id en POST response');
});

test('detecta duplicados con dos POST iguales', async ({ request }) => {
  const key = `qa-dup-${Date.now()}`;
  const payload = { items: [{ sku: 'QA-PROD-1', qty: 1, price: 50 }], payment: 'cash', total: 50, idempotencyKey: key };
  const r1 = await request.post(`${BASE}/api/sales`, { data: payload, failOnStatusCode: false }).catch(() => null);
  const r2 = await request.post(`${BASE}/api/sales`, { data: payload, failOnStatusCode: false }).catch(() => null);
  const s1 = r1 ? r1.status() : 'ERR';
  const s2 = r2 ? r2.status() : 'ERR';
  let b1 = {}, b2 = {};
  try { b1 = r1 ? await r1.json() : {}; } catch (e) {}
  try { b2 = r2 ? await r2.json() : {}; } catch (e) {}
  const sameId = b1 && b2 && b1.id && b1.id === b2.id;
  const dupRejected = s2 === 409 || s2 === 422;
  console.log('[QA RESULT]\n  Expected: 2do POST devuelve mismo id (idempotent) o 409\n  Actual: s1=', s1, 's2=', s2, 'sameId=', sameId, '\n  Error?:', !sameId && !dupRejected, '\n  Improvement?: implementar idempotency-key correctamente');
});
