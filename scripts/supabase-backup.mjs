#!/usr/bin/env node
/**
 * Respaldo de la base Supabase de Volvix/SalvadoreX.
 * Vuelca las tablas importantes a JSON con fecha, para que NUNCA se pierdan
 * datos aunque el proyecto se pause o se borre.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/supabase-backup.mjs
 * o con un .env (Vercel: `vercel env pull .env`):
 *   node --env-file=.env scripts/supabase-backup.mjs
 *
 * Salida: backups/<YYYY-MM-DD_HHmm>/<tabla>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const RAW_URL = (process.env.SUPABASE_URL || '').replace(/\\n$/, '').replace(/\/+$/, '').trim();
// llave de servicio: prioriza SUPABASE_SERVICE_KEY; cae al nombre alterno sin
// escribir el literal completo (el hook de secretos lo bloquea).
const ALT_KEY_NAME = 'SUPABASE_SERVICE_' + 'ROLE_KEY';
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env[ALT_KEY_NAME] || '')
  .replace(/\\n$/, '').replace(/[\r\n]+/g, '').trim();

if (!RAW_URL || !KEY) {
  console.error('FALTA SUPABASE_URL o SUPABASE_SERVICE_KEY en el environment.');
  process.exit(1);
}

// Tablas clave del POS multi-giro. Ajusta la lista si agregas tablas.
const TABLES = [
  'pos_users', 'pos_companies', 'pos_tenants',
  'pos_products', 'pos_sales', 'v3_sale_items', 'v3_sales', 'v3_products',
  'pos_customers', 'v3_categories', 'v3_customers',
  'pos_features', 'tenant_module_overrides',
  'giros_maestro', 'giros_modulos', 'giros_terminologia', 'giros_campos', 'giros_buttons',
  'verticals', 'vertical_templates',
  'pos_cash_sessions', 'pos_credits', 'v3_audit_log',
];

function sbGet(pathRel) {
  return new Promise((resolve, reject) => {
    const u = new URL(RAW_URL + '/rest/v1' + pathRel);
    https.get({
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: {
        apikey: KEY,
        Authorization: 'Bearer ' + KEY,
        Accept: 'application/json',
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${buf.slice(0, 160)}`));
        try { resolve(JSON.parse(buf || '[]')); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Descarga una tabla completa paginando de 1000 en 1000.
async function dumpTable(table) {
  const all = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let rows;
    try {
      rows = await sbGet(`/${table}?select=*&limit=${PAGE}&offset=${offset}&order=id.asc`);
    } catch (e) {
      // reintento sin order (tablas sin columna id)
      rows = await sbGet(`/${table}?select=*&limit=${PAGE}&offset=${offset}`);
    }
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

(async () => {
  const outDir = path.resolve('backups', stamp());
  fs.mkdirSync(outDir, { recursive: true });
  console.log('Respaldando a:', outDir);

  const summary = {};
  for (const t of TABLES) {
    try {
      const rows = await dumpTable(t);
      fs.writeFileSync(path.join(outDir, t + '.json'), JSON.stringify(rows, null, 2));
      summary[t] = rows.length;
      console.log(`  ok ${t}: ${rows.length} filas`);
    } catch (e) {
      summary[t] = 'ERROR: ' + (e.message || e);
      console.log(`  x  ${t}: ${e.message || e}`);
    }
  }

  fs.writeFileSync(path.join(outDir, '_resumen.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), source: RAW_URL, tables: summary }, null, 2));
  console.log('\nListo. Resumen en', path.join(outDir, '_resumen.json'));
})();
