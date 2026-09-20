#!/usr/bin/env node
/* Siembra el grupo de modificadores "Guarnicion" (obligatorio, elegir una, $0) en product_modifiers.
 *
 * Uso:   node scripts/seed-guarniciones.js <TENANT> <sku1> [sku2 ...] [--dry]
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY   (no se imprimen nunca)
 * NO se ejecuta automaticamente. Reemplaza (DELETE + INSERT) SOLO el grupo "Guarnicion" de cada sku,
 * asi no borra otros modificadores del producto. Con --dry solo imprime las filas.
 */
'use strict';

const GROUP = 'Guarnicion';
const OPTIONS = ['Espagueti', 'Arroz', 'Pure', 'Frijoles', 'Nopales', 'Verduras', 'Papas a la francesa', 'Coditos'];

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function buildRows(tenant, sku) {
  return OPTIONS.map((label, i) => ({
    tenant_id: tenant,
    parent_sku: sku,
    modifier_key: 'guarnicion-' + slug(label),
    modifier_label: label,
    group_label: GROUP,
    price_delta: 0,
    required: true,
    multiselect: false, // elegir una
    max_qty: 1,
    active: true,
    sort_order: i
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const rest = args.filter((a) => a !== '--dry');
  const tenant = rest[0];
  const skus = rest.slice(1);
  if (!tenant || !skus.length) {
    console.error('Uso: node scripts/seed-guarniciones.js <TENANT> <sku1> [sku2 ...] [--dry]');
    process.exit(1);
  }
  const rows = skus.flatMap((sku) => buildRows(tenant, sku));
  if (dry) { console.log(JSON.stringify(rows, null, 2)); console.log('[dry] filas:', rows.length); return; }

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el entorno'); process.exit(1); }
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

  for (const sku of skus) {
    const del = await fetch(`${base}/rest/v1/product_modifiers?tenant_id=eq.${encodeURIComponent(tenant)}&parent_sku=eq.${encodeURIComponent(sku)}&group_label=eq.${GROUP}`, { method: 'DELETE', headers: H });
    if (!del.ok) { console.error('DELETE fallo', sku, del.status); process.exit(2); }
  }
  const ins = await fetch(`${base}/rest/v1/product_modifiers`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
  if (!ins.ok) { console.error('INSERT fallo', ins.status, await ins.text()); process.exit(3); }
  console.log('OK: ' + rows.length + ' filas para ' + skus.length + ' sku(s)');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { buildRows, OPTIONS, GROUP };
