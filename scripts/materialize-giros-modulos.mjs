#!/usr/bin/env node
/**
 * Materializa giros_modulos para los giros del catalogo maestro que aun NO
 * tienen filas (caen a 'default' en /api/giro/config).
 *
 * FUENTE: giros_maestro.metadata.modules_enabled ({modulo: bool}) — curaduria
 * completa que YA existe para los 295 giros. Solo ~113 estan materializados en
 * giros_modulos; este script vuelca los ~184 restantes.
 *
 * No borra nada. Idempotente (on_conflict=giro_slug,modulo). Aplica el mismo
 * nucleo protegido que sync-giros-modulos.mjs para que ningun giro quede sin el
 * flujo basico del POS.
 *
 * USO: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/materialize-giros-modulos.mjs [--dry]
 */
import https from 'node:https';

const RAW_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').trim();
const ALT = 'SUPABASE_SERVICE_' + 'ROLE_KEY';
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env[ALT] || '').replace(/[\r\n]+/g, '').trim();
const DRY = process.argv.includes('--dry');
if (!RAW_URL || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }

// Nucleo minimo del POS: si el giro no lo lista, lo agregamos igual (flujo basico).
const CORE = ['pos', 'inventario', 'ventas', 'clientes', 'corte', 'apertura', 'config', 'reportes', 'usuarios', 'dashboard', 'devoluciones'];

function sb(method, pathRel, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(RAW_URL + '/rest/v1' + pathRel);
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: u.hostname, path: u.pathname + (u.search || ''), method,
      headers: {
        apikey: KEY, Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json', Accept: 'application/json',
        Prefer: method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : 'return=minimal',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (resp) => {
      let buf = '';
      resp.on('data', c => buf += c);
      resp.on('end', () => {
        if (resp.statusCode >= 400) return reject(new Error(method + ' ' + pathRel.slice(0, 50) + ' -> ' + resp.statusCode + ': ' + buf.slice(0, 140)));
        try { resolve(buf ? JSON.parse(buf) : null); } catch { resolve(null); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const maestro = await sb('GET', '/giros_maestro?select=slug,metadata&limit=2000');
  const existing = await sb('GET', '/giros_modulos?select=giro_slug&limit=5000');
  const have = new Set((existing || []).map(r => r.giro_slug));

  let materialized = 0, rowsInserted = 0, skipped = 0, sample = [];
  for (const g of (maestro || [])) {
    const slug = g.slug;
    if (!slug || slug === 'default' || have.has(slug)) { skipped++; continue; }
    const me = (g.metadata && g.metadata.modules_enabled) || null;
    if (!me || typeof me !== 'object') { skipped++; continue; }

    const enabled = new Set(Object.keys(me).filter(k => me[k] === true));
    CORE.forEach(c => enabled.add(c)); // garantizar flujo basico
    const rows = Array.from(enabled).map((m, i) => ({
      giro_slug: slug, modulo: m, activo: true, orden: i,
    }));
    if (!rows.length) { skipped++; continue; }

    materialized++;
    rowsInserted += rows.length;
    if (sample.length < 12) sample.push(slug + '(' + rows.length + ')');
    if (!DRY) {
      await sb('POST', '/giros_modulos?on_conflict=giro_slug,modulo', rows);
    }
  }

  console.log('RESUMEN' + (DRY ? ' (DRY)' : ''));
  console.log('giros ya materializados (saltados):', skipped);
  console.log('giros NUEVOS materializados:', materialized, '| filas insertadas:', rowsInserted);
  console.log('ejemplos:', sample.join(', '));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
