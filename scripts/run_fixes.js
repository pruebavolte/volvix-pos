#!/usr/bin/env node
// R19 — Re-ejecuta los 14 fallos con las correcciones.
const fs = require('fs');
const path = require('path');
const https = require('https');

const PAT = process.env.SUPABASE_PAT || 'sbp_b6fe6a70e5176d0662fa19c6363ecb4775a8f72e';
const PROJECT_REF = 'zhvwmzkcqngcaqpdxtwr';

// Orden:
//   1. R19_PREFLIGHT (schemas/tables/columns missing)
//   2. R19_FIX_R14_* (independientes)
//   3. R14_INVENTORY (original - ya tiene app.*; ahora app helpers existen)
//   4. R17/R18 fixes
//   5. R13_RLS_POLICIES (depende de inventory_movements creada por R14_INVENTORY)
//   6. R16_RLS_HARDENING (depende de R13)
const ORDER = [
  { file: 'R19_PREFLIGHT.sql', desc: 'Crea schemas/tables/columns faltantes' },
  { file: 'R19_FIX_R14_INDEXES.sql', desc: 'Fix R14_INDEXES' },
  { file: 'R19_FIX_R14_CURRENCIES.sql', desc: 'Fix R14_CURRENCIES (IMMUTABLE)' },
  { file: 'R19_FIX_R14_API_KEYS.sql', desc: 'Fix R14_API_KEYS' },
  { file: 'R19_FIX_R14_CFDI_TABLES.sql', desc: 'Fix R14_CFDI_TABLES' },
  { file: 'R14_INVENTORY.sql',  desc: 'R14_INVENTORY (now with app.* helpers)' },
  { file: 'R19_FIX_R14_LOYALTY.sql', desc: 'Fix R14_LOYALTY' },
  { file: 'R19_FIX_R14_REALTIME.sql', desc: 'Fix R14_REALTIME (RAISE %%)' },
  { file: 'R19_FIX_R14_VERTICAL_TEMPLATES.sql', desc: 'Fix R14_VERTICAL_TEMPLATES' },
  { file: 'R19_FIX_R17_GEOFENCE.sql', desc: 'Fix R17_GEOFENCE' },
  { file: 'R19_FIX_R17_SMS.sql', desc: 'Fix R17_SMS' },
  { file: 'R19_FIX_R18_AMAZON.sql', desc: 'Fix R18_AMAZON' },
  { file: 'R19_FIX_R18_SHOP.sql', desc: 'Fix R18_SHOP' },
  { file: 'R13_RLS_POLICIES.sql', desc: 'R13_RLS_POLICIES (depends on inventory_movements)' },
  { file: 'R16_RLS_HARDENING.sql', desc: 'R16_RLS_HARDENING (depends on R13)' },
];

function runSQL(sql) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 90000,
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 0, body: String(e.message) }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

(async () => {
  const dbDir = path.resolve(__dirname, '../db');
  const ok = []; const fail = [];

  for (const item of ORDER) {
    const fp = path.join(dbDir, item.file);
    if (!fs.existsSync(fp)) { console.log(`SKIP ${item.file} (no existe)`); continue; }
    const sql = fs.readFileSync(fp, 'utf8');
    process.stdout.write(`${item.file}... `);
    const r = await runSQL(sql);
    if (r.status === 200 || r.status === 201) {
      console.log('OK');
      ok.push(item.file);
    } else {
      const msg = r.body.slice(0, 350).replace(/\n/g, ' ');
      console.log(`FAIL [${r.status}] ${msg}`);
      fail.push({ file: item.file, status: r.status, msg });
    }
  }

  console.log('\n=== R19 FIX SUMMARY ===');
  console.log(`OK:   ${ok.length}`);
  console.log(`FAIL: ${fail.length}`);
  if (fail.length) {
    console.log('\nFailures:');
    fail.forEach(f => console.log(`  - ${f.file}: ${f.msg.slice(0, 250)}`));
  }
  fs.writeFileSync(path.resolve(__dirname, '../R19_SQL_FIXED_RESULT.json'),
    JSON.stringify({ ok, fail }, null, 2));
  console.log('\nGuardado en R19_SQL_FIXED_RESULT.json');
})();
