#!/usr/bin/env node
/**
 * 2026-05-14: Aplica la migracion R24_RESTOCK_ATOMIC.sql contra Supabase
 * usando la Management API + SUPABASE_PAT.
 *
 * Uso: node scripts/apply-r24-restock.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Cargar .env
const envPath = path.join(__dirname, '..', '.env');
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) {
    let v = m[2].replace(/^["']|["']$/g, '');
    // 2026-05-14: el .env contiene literalmente '\n' (backslash + n) al final
    // de algunos valores que se generaron via shell heredoc mal escapado.
    // Hay que strip esa cadena de 2 chars (backslash + n), no la regex \n
    // que matchea newline. En JS source: /\\\\n/g => regex pattern \\n =>
    // matchea backslash + n. Tambien strip CR.
    // Replace literal "\n" (two chars: backslash + n). Usamos indexOf-loop
    // para evitar confusiones de double-escape en regex.
    while (v.includes('\\n')) v = v.replace('\\n', '');
    while (v.includes('\\r')) v = v.replace('\\r', '');
    v = v.replace(/[\r\n]+/g, '').trim();
    env[m[1]] = v;
  }
});

const PAT = env.SUPABASE_PAT;
const SUPABASE_URL = env.SUPABASE_URL;
if (!PAT) { console.error('SUPABASE_PAT no encontrado en .env'); process.exit(1); }
if (!SUPABASE_URL) { console.error('SUPABASE_URL no encontrado'); process.exit(1); }

const projectRefMatch = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!projectRefMatch) { console.error('No pude extraer project ref de SUPABASE_URL'); process.exit(1); }
const projectRef = projectRefMatch[1];

const sqlPath = path.join(__dirname, '..', 'db', 'R24_RESTOCK_ATOMIC.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log('Project ref:', projectRef);
console.log('SQL length:', sql.length, 'chars');
console.log('Enviando a Supabase Management API...');

const body = JSON.stringify({ query: sql });

const opts = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${projectRef}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + PAT,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(opts, (res) => {
  let chunks = '';
  res.on('data', (c) => chunks += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', chunks.slice(0, 2000));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\n✓ Migracion R24 aplicada correctamente.');
      // Verificacion: llamar la funcion con array vacio
      verifyRPC().catch((e) => { console.error('Verificacion fallo:', e); process.exit(1); });
    } else {
      console.error('\n✗ Error aplicando migracion');
      process.exit(1);
    }
  });
});
req.on('error', (e) => { console.error('Request error:', e); process.exit(1); });
req.write(body);
req.end();

async function verifyRPC() {
  console.log('\nVerificando que restock_atomic exista...');
  const verifySql = "SELECT proname FROM pg_proc WHERE proname = 'restock_atomic';";
  const verifyBody = JSON.stringify({ query: verifySql });
  await new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + PAT,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(verifyBody),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        console.log('Verify status:', res.statusCode);
        console.log('Verify response:', chunks);
        if (chunks.includes('restock_atomic')) {
          console.log('\n✅ RPC restock_atomic confirmada en DB');
          resolve();
        } else {
          reject(new Error('RPC no encontrada tras migracion'));
        }
      });
    });
    r.on('error', reject);
    r.write(verifyBody);
    r.end();
  });
}
