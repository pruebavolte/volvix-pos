#!/usr/bin/env node
/**
 * Sincroniza giros_modulos.activo desde la curaduria de giros_maestro.
 *
 * PROBLEMA: el seed de giros_modulos dejo TODO activo=true para los 113 giros
 * (una carniceria tenia mascotas, vacunas, mesas, estilistas...). La curaduria
 * REAL por giro ya existe en giros_maestro.metadata.modules_enabled.
 *
 * QUE HACE (no borra NADA, solo flags):
 *   - Para cada giro presente en AMBAS tablas:
 *     - modulo en modules_enabled=true  -> activo=true (insert si falta la row)
 *     - modulo NO listado en modules_enabled -> activo=false (se OCULTA, sigue
 *       existiendo y el dueno de la plataforma puede reactivarlo en el panel)
 *   - Giros sin modules_enabled curado -> se saltan (sin cambios).
 *   - El giro 'default' NUNCA se toca.
 *
 * USO:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/sync-giros-modulos.mjs [--dry]
 */

import https from 'node:https';

const RAW_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').trim();
const ALT = 'SUPABASE_SERVICE_' + 'ROLE_KEY';
const KEY = (process.env.SUPABASE_SERVICE_KEY || process.env[ALT] || '').replace(/[\r\n]+/g, '').trim();
const DRY = process.argv.includes('--dry');

if (!RAW_URL || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }

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
        if (resp.statusCode >= 400) return reject(new Error(method + ' ' + pathRel.slice(0, 60) + ' -> ' + resp.statusCode + ': ' + buf.slice(0, 140)));
        try { resolve(buf ? JSON.parse(buf) : null); } catch { resolve(null); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// NUCLEO: jamas se apaga, en ningun giro (el flujo basico del POS).
const PROTECTED_CORE = new Set([
  'pos', 'inventario', 'ventas', 'clientes', 'corte', 'apertura',
  'config', 'reportes', 'usuarios', 'dashboard', 'devoluciones',
]);

// Modulos de DOMINIO: si el giro pertenece a la categoria, se conservan
// prendidos aunque la curaduria del maestro los haya omitido (la curaduria
// esta incompleta en algunos giros, ej. restaurante sin comandas/cocina).
const DOMAIN_KEEP = {
  'Comida & Bebida':      ['comandas', 'cocina', 'mesas', 'meseros'],
  'Frescos & Mostrador':  ['comandas', 'cocina'],
  'Salud':                ['citas', 'expediente_clinico', 'recetas_medicas', 'consultas', 'mascotas', 'vacunas', 'servicios'],
  'Belleza & Cuidado':    ['citas', 'estilistas', 'servicios_belleza', 'estetica', 'servicios'],
  'Servicios':            ['citas', 'servicios'],
  'Automotriz':           ['servicios', 'cotizaciones'],
};

(async () => {
  // 1) Curaduria de giros_maestro (+categoria para DOMAIN_KEEP)
  const maestro = await sb('GET', '/giros_maestro?select=slug,categoria,metadata&limit=2000');
  const curated = {};
  const categoria = {};
  (maestro || []).forEach(g => {
    categoria[g.slug] = g.categoria || '';
    const me = g.metadata && g.metadata.modules_enabled;
    if (me && typeof me === 'object' && Object.keys(me).length) {
      curated[g.slug] = Object.keys(me).filter(k => me[k] === true);
    }
  });
  console.log('giros con curaduria en maestro:', Object.keys(curated).length);

  // 2) Estado actual de giros_modulos
  const rows = await sb('GET', '/giros_modulos?select=giro_slug,modulo,activo&limit=5000');
  const bySlug = {};
  (rows || []).forEach(r => { (bySlug[r.giro_slug] = bySlug[r.giro_slug] || {})[r.modulo] = r.activo; });
  console.log('giros con rows en giros_modulos:', Object.keys(bySlug).length);

  let girosTocados = 0, offCount = 0, onCount = 0, inserted = 0, skipped = [];

  for (const slug of Object.keys(bySlug)) {
    if (slug === 'default') continue;
    const enabled = curated[slug];
    if (!enabled) { skipped.push(slug); continue; }

    const current = bySlug[slug];
    const enabledSet = new Set(enabled);
    // Proteger nucleo + modulos del dominio de la categoria del giro
    (DOMAIN_KEEP[categoria[slug]] || []).forEach(m => enabledSet.add(m));
    PROTECTED_CORE.forEach(m => { if (m in current) enabledSet.add(m); });
    const toOff = Object.keys(current).filter(m => !enabledSet.has(m) && current[m] !== false);
    const toOn  = Object.keys(current).filter(m => enabledSet.has(m) && current[m] !== true);
    const toInsert = enabled.filter(m => !(m in current));

    if (!toOff.length && !toOn.length && !toInsert.length) continue;
    girosTocados++;
    console.log(`${slug}: OFF ${toOff.length} [${toOff.join(',')}] | ON ${toOn.length} | INSERT ${toInsert.length}`);
    if (DRY) { offCount += toOff.length; onCount += toOn.length; inserted += toInsert.length; continue; }

    if (toOff.length) {
      await sb('PATCH', `/giros_modulos?giro_slug=eq.${encodeURIComponent(slug)}&modulo=in.(${toOff.map(encodeURIComponent).join(',')})`, { activo: false });
      offCount += toOff.length;
    }
    if (toOn.length) {
      await sb('PATCH', `/giros_modulos?giro_slug=eq.${encodeURIComponent(slug)}&modulo=in.(${toOn.map(encodeURIComponent).join(',')})`, { activo: true });
      onCount += toOn.length;
    }
    if (toInsert.length) {
      await sb('POST', '/giros_modulos?on_conflict=giro_slug,modulo',
        toInsert.map((m, i) => ({ giro_slug: slug, modulo: m, activo: true, orden: 100 + i })));
      inserted += toInsert.length;
    }
  }

  console.log('\nRESUMEN' + (DRY ? ' (DRY RUN — nada escrito)' : ''));
  console.log('giros modificados:', girosTocados);
  console.log('modulos apagados:', offCount, '| prendidos:', onCount, '| insertados:', inserted);
  console.log('giros SIN curaduria (sin cambios):', skipped.length, '->', skipped.join(', '));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
