#!/usr/bin/env node
/**
 * manual-backup.js
 * ----------------
 * Genera un snapshot SQL de las tablas críticas vía Supabase REST.
 *
 * Estrategia:
 *   1. Si SUPABASE_PAT (Personal Access Token) y SUPABASE_PROJECT_REF están
 *      definidos, intenta llamar a la Management API:
 *        POST https://api.supabase.com/v1/projects/{ref}/database/backups
 *      (endpoint actualmente en beta — si falla, hace fallback al paso 2).
 *   2. Fallback: lee las tablas críticas vía PostgREST
 *      (SUPABASE_URL + SUPABASE_SERVICE_KEY) y emite INSERT statements
 *      idempotentes (ON CONFLICT DO NOTHING).
 *
 * Output: backups/snapshots/YYYY-MM-DD.sql.gz
 *
 * Uso:
 *   node backups/manual-backup.js
 *
 * Variables esperadas (.env):
 *   SUPABASE_URL              https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY      eyJ... (service_role)
 *   SUPABASE_PAT              sbp_... (opcional, Management API)
 *   SUPABASE_PROJECT_REF      xxx     (opcional, Management API)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

// ── Carga ligera de .env (sin dotenv para no añadir deps) ──
(function loadEnv() {
  const candidates = ['.env.local', '.env', '.env.production'];
  for (const f of candidates) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k]) continue;
      const v = vRaw.replace(/^['"]|['"]$/g, '');
      process.env[k] = v;
    }
  }
})();

const TABLES = ['pos_users', 'pos_products', 'pos_sales', 'customers'];

const SUPABASE_URL         = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_PAT         = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN || '';
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function reqJSON(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function sqlEscape(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') v = JSON.stringify(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function rowsToInserts(table, rows) {
  if (!rows.length) return `-- (no rows in ${table})\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const lines = rows.map((r) => {
    const vals = cols.map((c) => sqlEscape(r[c])).join(', ');
    return `INSERT INTO "${table}" (${colList}) VALUES (${vals}) ON CONFLICT DO NOTHING;`;
  });
  return lines.join('\n') + '\n';
}

async function tryManagementAPI() {
  if (!SUPABASE_PAT || !SUPABASE_PROJECT_REF) return null;
  const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/backups`;
  const r = await reqJSON(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${SUPABASE_PAT}`, 'Content-Type': 'application/json' },
  });
  if (r.status >= 200 && r.status < 300) {
    return `-- Supabase Management API listing\n-- ${url}\n-- ${r.body}\n`;
  }
  console.warn(`[manual-backup] Management API ${r.status} — fallback a REST. body=${r.body.slice(0, 200)}`);
  return null;
}

async function dumpTableREST(table) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return `-- skipped ${table}: SUPABASE_URL/SERVICE_KEY missing\n`;
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*`;
  const r = await reqJSON(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (r.status !== 200) {
    return `-- ERROR ${table}: HTTP ${r.status} — ${r.body.slice(0, 200)}\n`;
  }
  let rows;
  try { rows = JSON.parse(r.body); } catch (e) { return `-- ERROR ${table}: parse ${e.message}\n`; }
  return `-- ${table}: ${rows.length} rows\n` + rowsToInserts(table, rows);
}

async function main() {
  const stamp = today();
  const outDir  = path.join(__dirname, 'snapshots');
  const outFile = path.join(outDir, `${stamp}.sql.gz`);
  fs.mkdirSync(outDir, { recursive: true });

  const parts = [
    `-- Volvix POS manual snapshot ${stamp}\n`,
    `-- generated by backups/manual-backup.js\n`,
    `BEGIN;\n`,
  ];

  const mgmt = await tryManagementAPI();
  if (mgmt) parts.push(mgmt);

  for (const t of TABLES) {
    try {
      parts.push(await dumpTableREST(t));
    } catch (e) {
      parts.push(`-- EXCEPTION ${t}: ${e.message}\n`);
    }
  }
  parts.push(`COMMIT;\n`);

  const sql = parts.join('\n');
  const gz  = zlib.gzipSync(Buffer.from(sql, 'utf8'));
  fs.writeFileSync(outFile, gz);
  console.log(`[manual-backup] OK -> ${outFile} (${gz.length} bytes)`);
}

main().catch((e) => {
  console.error('[manual-backup] FATAL', e);
  process.exit(1);
});
