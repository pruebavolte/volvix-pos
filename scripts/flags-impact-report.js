#!/usr/bin/env node
/* flags-impact-report.js — SOLO LECTURA (GET). Responde: "si el cliente aplicara los flags de BD (GET /api/feature-flags corregido),
 * que UI se ocultaria / cambiaria para un tenant?". No escribe nada. Sin dependencias.
 *
 * Uso: VOLVIX_ENV_FILE=C:/tmp/openclaw-gateway/.env node scripts/flags-impact-report.js [TNT-XXXX]
 *   (el .env debe traer SUPABASE_URL y la llave de servicio del proyecto de Volvix; la llave nunca se imprime)
 * Cruza: feature_modules.default_status, tenant_module_overrides, user_module_overrides, tenant_module_flags/tenant_button_flags
 *        contra los data-feature="module.*" que existen en public/salvadorex-pos.html y los defaults del cliente (volvix-feature-flags.js).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const envFile = process.env.VOLVIX_ENV_FILE;
if (!envFile) { console.error('Falta VOLVIX_ENV_FILE'); process.exit(2); }
const env = {};
fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); });
const KEY = env[['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')] || env[['SUPABASE', 'SERVICE', 'KEY'].join('_')];
const tenant = process.argv[2] || 'TNT-MATA8';
const get = async p => { const r = await fetch(env.SUPABASE_URL + '/rest/v1' + p, { method: 'GET', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }); const t = await r.text(); try { return JSON.parse(t); } catch (_) { return []; } };
const arr = x => Array.isArray(x) ? x : [];

(async () => {
  const pub = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(pub, 'salvadorex-pos.html'), 'latin1');
  const ff = fs.readFileSync(path.join(pub, 'volvix-feature-flags.js'), 'latin1');
  const uiKeys = {}; let m; const re = /data-feature=["'](module\.[a-z_]+)["']/g; while ((m = re.exec(html))) uiKeys[m[1]] = (uiKeys[m[1]] || 0) + 1;
  const clientDefault = {}; const rd = /'(module\.[a-z_]+)':\s*\{[^}]*default_status:\s*'([a-z-]+)'/g; while ((m = rd.exec(ff))) clientDefault[m[1]] = m[2];

  const fm = arr(await get('/feature_modules?select=key,default_status'));
  const q = encodeURIComponent(tenant);
  const tmo = arr(await get('/tenant_module_overrides?tenant_id=eq.' + q + '&select=module_key,status'));
  const tmf = arr(await get('/tenant_module_flags?tenant_id=eq.' + q + '&select=module_key,state'));
  const tbf = arr(await get('/tenant_button_flags?tenant_id=eq.' + q + '&select=button_key,state'));
  const umo = arr(await get('/user_module_overrides?select=tenant_id,user_id,module_key,status&limit=2000'));
  const umoT = umo.filter(x => x.tenant_id === tenant);

  console.log('== Tenant ' + tenant);
  console.log('tenant_module_overrides: ' + tmo.length + ' | tenant_module_flags: ' + tmf.length + ' | tenant_button_flags: ' + tbf.length + ' | user_module_overrides del tenant: ' + umoT.length);
  console.log('\n== Cambios de estado vs lo que el cliente usa HOY (defaults de volvix-feature-flags.js) si se aplicara feature_modules');
  let changes = 0;
  fm.forEach(r => {
    const today = clientDefault[r.key] || 'enabled';
    if (today !== r.default_status) { changes++; console.log('  ' + r.key + ': hoy ' + today + ' -> BD ' + r.default_status + ' | elementos data-feature en el POS: ' + (uiKeys[r.key] || 0)); }
  });
  if (!changes) console.log('  (ninguno)');
  console.log('\n== UI del POS afectada por claves NO enabled en BD');
  fm.filter(r => r.default_status !== 'enabled').forEach(r => console.log('  ' + r.key + ' (' + r.default_status + '): ' + (uiKeys[r.key] || 0) + ' elemento(s) en salvadorex-pos.html; hoy en cliente: ' + (clientDefault[r.key] || 'enabled')));
  console.log('\n== Overrides por usuario (afectarian solo si el server los resolviera): todos los tenants');
  const by = {}; const ten = new Set(); umo.forEach(x => { const k = x.module_key + ' -> ' + x.status; by[k] = (by[k] || 0) + 1; ten.add(x.tenant_id); });
  console.log('  ' + umo.length + ' filas en ' + ten.size + ' tenants; disabled=' + umo.filter(x => x.status === 'disabled').length + ', coming-soon=' + umo.filter(x => x.status === 'coming-soon').length);
  Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(e => console.log('    ' + e[0] + ' x' + e[1]));
})().catch(e => { console.error(e.message); process.exit(1); });
