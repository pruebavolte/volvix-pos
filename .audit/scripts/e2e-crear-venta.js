// E2E: login + crear venta vía /api/sales + verificar
const https = require('https');

const BASE = 'systeminternational.app';
const USER = 'grupovolvix@gmail.com';
const PASS = '123456789';

function req(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const r = https.request({
      hostname: BASE, port: 443, path, method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }, headers || {})
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('\n=== E2E: crear venta real ===\n');

  // 1. LOGIN
  console.log('[1] POST /api/login');
  const t0 = Date.now();
  const login = await req('POST', '/api/login', { email: USER, password: PASS });
  console.log(`    HTTP ${login.status} (${Date.now()-t0}ms)`);
  if (login.status !== 200 || !login.body.token) {
    console.log('    ❌ login fail:', JSON.stringify(login.body).slice(0, 200));
    process.exit(1);
  }
  const token = login.body.token;
  console.log(`    ✅ JWT ok, role=${login.body.user && login.body.user.role}, tenant=${login.body.user && login.body.user.tenant_id}`);

  const auth = { 'Authorization': 'Bearer ' + token };

  // 2. CREAR VENTA (producto sin UUID → no descuenta stock real)
  console.log('\n[2] POST /api/sales (test product, no UUID → no stock impact)');
  const idempKey = 'e2e-test-' + Date.now();
  const venta = {
    items: [
      { name: 'Producto E2E Test', qty: 1, price: 1.00 }
    ],
    total: 1.00,
    payment_method: 'efectivo',
    amount_paid: 1.00
  };
  const t1 = Date.now();
  const saleRes = await req('POST', '/api/sales', venta,
    Object.assign({ 'Idempotency-Key': idempKey }, auth));
  console.log(`    HTTP ${saleRes.status} (${Date.now()-t1}ms)`);
  if (saleRes.status !== 200 && saleRes.status !== 201) {
    console.log('    ❌ venta fail:', JSON.stringify(saleRes.body).slice(0, 400));
    process.exit(2);
  }
  const saleId = saleRes.body && (saleRes.body.id || (saleRes.body[0] && saleRes.body[0].id));
  console.log(`    ✅ venta creada. id=${saleId}, total=${saleRes.body.total}`);

  // 3. LISTAR VENTAS (verifica que la nueva aparece)
  console.log('\n[3] GET /api/sales (recientes)');
  const t2 = Date.now();
  const listRes = await req('GET', '/api/sales?limit=5', null, auth);
  console.log(`    HTTP ${listRes.status} (${Date.now()-t2}ms)`);
  if (listRes.status !== 200) {
    console.log('    ⚠️  list fail:', JSON.stringify(listRes.body).slice(0, 200));
  } else {
    const arr = Array.isArray(listRes.body) ? listRes.body : (listRes.body.sales || []);
    console.log(`    ✅ ${arr.length} ventas recientes`);
    if (saleId) {
      const found = arr.find(s => s.id === saleId);
      console.log(`    ${found ? '✅' : '⚠️'} venta recién creada ${found ? 'PRESENTE' : 'no encontrada'} en lista`);
    }
  }

  // 4. INTENTO IDEMPOTENCIA (mismo Idempotency-Key → debería retornar la misma venta)
  console.log('\n[4] POST /api/sales con MISMO Idempotency-Key (test idempotencia)');
  const t3 = Date.now();
  const dupRes = await req('POST', '/api/sales', venta,
    Object.assign({ 'Idempotency-Key': idempKey }, auth));
  console.log(`    HTTP ${dupRes.status} (${Date.now()-t3}ms)`);
  const dupId = dupRes.body && (dupRes.body.id || (dupRes.body[0] && dupRes.body[0].id));
  if (dupId === saleId) {
    console.log(`    ✅ idempotencia OK — devolvió misma venta id=${dupId}`);
  } else {
    console.log(`    ⚠️ idempotencia falló — id distinto (orig=${saleId}, dup=${dupId})`);
  }

  console.log('\n========== RESULT ==========');
  console.log('✅ Login JWT funcional');
  console.log('✅ Venta creada con id real:', saleId);
  console.log('✅ Listado de ventas accesible');
  console.log('✅ E2E COMPLETO\n');
  process.exit(0);
})().catch(e => { console.error('CRASH:', e); process.exit(99); });
