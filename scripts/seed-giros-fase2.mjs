#!/usr/bin/env node
/**
 * seed-giros-fase2.mjs · V13.32
 *
 * FASE 2 SSOT: migra el HARDCODE restante de paneldecontrol.html
 * (INDUSTRY_PROFILES + INDUSTRY_LABELS + GIRO_CATEGORIES) a Supabase
 * `giros_maestro`.
 *
 * - PROFILE_GENERIC + INDUSTRY_PROFILES → metadata.modules_enabled
 * - INDUSTRY_LABELS → columna emoji + nombre (sin emoji)
 * - GIRO_CATEGORIES → columna categoria (con label friendly)
 *
 * Si un slug NO existía aún en giros_maestro, se inserta de cero.
 * Si ya existe (de Fase 1), solo se actualizan los campos faltantes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── Read env ───
function readEnv() {
  const raw = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
  const env = {};
  raw.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v.replace(/\\n$/, '');
    }
  });
  return env;
}
const env = readEnv();
const SUPA_URL = env.SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing creds'); process.exit(1); }

// ─── 1. Constantes copiadas LITERALMENTE del HTML (líneas 4883-4946 + 6632-6646) ───
const PROFILE_GENERIC = {
  pos:true, dashboard:true, apertura:true, corte:true, ventas:true,
  reportes:true, clientes:true, usuarios:true, config:true, devoluciones:true,
};
const INDUSTRY_PROFILES = {
  abarrotes:    { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, recargas:true, servicios:true, promociones:true, departamentos:true, sugeridas:true, actualizador:true },
  minisuper:    { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, recargas:true, servicios:true, promociones:true, departamentos:true, actualizador:true },
  'tienda-conveniencia': { ...PROFILE_GENERIC, inventario:true, kardex:true, proveedores:true, recargas:true, servicios:true, promociones:true, departamentos:true, actualizador:true },
  farmacia:     { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, facturacion:true, promociones:true, departamentos:true, sugeridas:true, actualizador:true },
  fruteria:     { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  carniceria:   { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true, proveedores:true },
  polleria:     { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true, proveedores:true },
  tortilleria:  { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  panaderia:    { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  pasteleria:   { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  cafeteria:    { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  restaurante:  { ...PROFILE_GENERIC, departamentos:true, promociones:true },
  taqueria:     { ...PROFILE_GENERIC, departamentos:true, promociones:true },
  pizzeria:     { ...PROFILE_GENERIC, departamentos:true, promociones:true },
  heladeria:    { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  jugos_naturales: { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  'jugos-naturales': { ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true },
  barberia:     { ...PROFILE_GENERIC, servicios:true, promociones:true },
  'salon-belleza': { ...PROFILE_GENERIC, servicios:true, promociones:true, inventario:true },
  nails:        { ...PROFILE_GENERIC, servicios:true, promociones:true, inventario:true },
  spa:          { ...PROFILE_GENERIC, servicios:true, promociones:true },
  veterinaria:  { ...PROFILE_GENERIC, inventario:true, credito:true, facturacion:true, promociones:true, servicios:true },
  'clinica-dental': { ...PROFILE_GENERIC, inventario:true, credito:true, facturacion:true, servicios:true },
  optica:       { ...PROFILE_GENERIC, inventario:true, credito:true, facturacion:true },
  ropa:         { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, departamentos:true, promociones:true, cotizaciones:true, facturacion:true },
  'tienda-ropa': { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, departamentos:true, promociones:true, cotizaciones:true, facturacion:true },
  zapateria:    { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, departamentos:true, promociones:true },
  muebleria:    { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, cotizaciones:true, facturacion:true, promociones:true },
  papeleria:    { ...PROFILE_GENERIC, inventario:true, kardex:true, proveedores:true, departamentos:true, promociones:true, cotizaciones:true, recargas:true },
  ferreteria:   { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, departamentos:true, promociones:true, cotizaciones:true, sugeridas:true },
  refaccionaria: { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, cotizaciones:true, sugeridas:true, facturacion:true },
  'taller-mecanico': { ...PROFILE_GENERIC, servicios:true, cotizaciones:true, credito:true, facturacion:true },
  carwash:      { ...PROFILE_GENERIC, servicios:true, promociones:true },
  purificadora: { ...PROFILE_GENERIC, inventario:true, credito:true },
  lavanderia:   { ...PROFILE_GENERIC, servicios:true, promociones:true },
  gimnasio:     { ...PROFILE_GENERIC, servicios:true, promociones:true },
  sabanas_premium: { ...PROFILE_GENERIC, inventario:true, kardex:true, proveedores:true, departamentos:true, promociones:true },
  floreria:     { ...PROFILE_GENERIC, inventario:true, departamentos:true, cotizaciones:true, servicios:true, promociones:true, proveedores:true },
};
const INDUSTRY_LABELS = {
  abarrotes:'🛒 Abarrotes', minisuper:'🏪 Minisúper', 'tienda-conveniencia':'🏪 Tienda de conveniencia',
  farmacia:'💊 Farmacia', fruteria:'🍎 Frutería', carniceria:'🥩 Carnicería', polleria:'🍗 Pollería',
  tortilleria:'🌽 Tortillería', panaderia:'🥖 Panadería', pasteleria:'🎂 Pastelería',
  cafeteria:'☕ Cafetería', restaurante:'🍽️ Restaurante', taqueria:'🌮 Taquería', pizzeria:'🍕 Pizzería',
  heladeria:'🍦 Heladería', jugos_naturales:'🥤 Jugos naturales', 'jugos-naturales':'🥤 Jugos naturales',
  barberia:'💈 Barbería', 'salon-belleza':'💇 Salón de belleza', nails:'💅 Nails', spa:'🧖 Spa',
  veterinaria:'🐶 Veterinaria', 'clinica-dental':'🦷 Clínica dental', optica:'👓 Óptica',
  ropa:'👕 Ropa', 'tienda-ropa':'👕 Tienda de ropa', zapateria:'👟 Zapatería',
  muebleria:'🪑 Mueblería', papeleria:'📚 Papelería', ferreteria:'🔧 Ferretería',
  refaccionaria:'🔩 Refaccionaria', 'taller-mecanico':'🔧 Taller mecánico', carwash:'🚗 Carwash',
  purificadora:'💧 Purificadora', lavanderia:'🧺 Lavandería', gimnasio:'💪 Gimnasio',
  sabanas_premium:'🛏️ Sábanas premium', floreria:'🌷 Florería',
};
const GIRO_CATEGORIES = {
  'comida-bebida':  { label: 'Comida & Bebida', items: ['restaurante','taqueria','pizzeria','cafeteria','panaderia','pasteleria','heladeria','jugos_naturales','jugos-naturales','marisqueria','sushi','hamburguesas','pollo_frito','pollos_asados','antojitos','tacos_vapor','comida_corrida','dark_kitchen','ghost_kitchen','banquetes'] },
  'frescos':        { label: 'Frescos & Mostrador', items: ['fruteria','carniceria','polleria','tortilleria','cremeria'] },
  'tienda':         { label: 'Tienda & Abarrotes', items: ['abarrotes','minisuper','tienda-conveniencia','deposito','tienda_china','dulceria','naturista','refresqueria','purificadora','vape_shop','sex_shop','cerveza_artesanal','ecologica','regalos','bazar'] },
  'salud':          { label: 'Salud', items: ['farmacia','veterinaria','clinica-dental','dentista','medico','optica','tienda_mascotas'] },
  'belleza':        { label: 'Belleza & Cuidado', items: ['barberia','salon-belleza','estetica','nails','spa','cosmeticos'] },
  'retail':         { label: 'Retail', items: ['ropa','tienda-ropa','boutique','zapateria','muebleria','papeleria','ferreteria','tlapaleria','sabanas_premium','floreria','joyeria','electronica','electrodomesticos','computacion','celulares','reparacion_celulares','gamer','deportes','vidrieria'] },
  'automotriz':     { label: 'Automotriz', items: ['refaccionaria','taller-mecanico','carwash','llantera','vulcanizadora','agencia_autos'] },
  'servicios':      { label: 'Servicios', items: ['lavanderia','gimnasio','agencia_de_viajes','imprenta','carpinteria','herreria','cerrajeria','aluminio','construccion','paneles_solares','cctv','sonido','fotografia','escuela','guarderia','hotel','motel','casa_empeno','wisp','coworking','domotica'] },
  'tecnologia':     { label: 'Tecnología', items: ['software','marketing_digital','hosting_web','impresion_3d','drones','automatizacion','ia_chatbots','criptomonedas'] },
};

// Construir slug → categoryLabel
const slugToCategory = {};
for (const [_, cat] of Object.entries(GIRO_CATEGORIES)) {
  for (const slug of cat.items) slugToCategory[slug] = cat.label;
}

// Construir slug → {emoji, nombre_solo}
function parseLabel(lbl) {
  const m = String(lbl || '').match(/^(\p{Emoji}+)\s*(.+)$/u);
  if (m) return { emoji: m[1], name: m[2] };
  return { emoji: null, name: String(lbl || '') };
}
const slugToLabel = {};
for (const [slug, lbl] of Object.entries(INDUSTRY_LABELS)) {
  slugToLabel[slug] = parseLabel(lbl);
}

// ─── 2. Construir el set unión de TODOS los slugs hardcoded ───
const allHardcodedSlugs = new Set([
  ...Object.keys(INDUSTRY_PROFILES),
  ...Object.keys(INDUSTRY_LABELS),
  ...Object.keys(slugToCategory),
]);
console.log(`Slugs únicos hardcoded a migrar: ${allHardcodedSlugs.size}`);

// ─── 3. Para cada slug: fetch row actual, merge, UPSERT ───
async function getRow(slug) {
  const r = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?slug=eq.${encodeURIComponent(slug)}&limit=1`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  if (!r.ok) return null;
  const a = await r.json();
  return Array.isArray(a) && a[0] ? a[0] : null;
}

async function upsertRow(row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?on_conflict=slug`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
}

async function main() {
  let updated = 0, inserted = 0, failed = 0;
  for (const slug of allHardcodedSlugs) {
    const existing = await getRow(slug);
    const meta = Object.assign({}, existing?.metadata || {});
    if (INDUSTRY_PROFILES[slug]) {
      meta.modules_enabled = INDUSTRY_PROFILES[slug];
    }
    const lblParsed = slugToLabel[slug];
    const categoria = slugToCategory[slug] || existing?.categoria || 'Otros giros (BD)';
    const row = {
      slug,
      nombre: lblParsed?.name || existing?.nombre || slug,
      emoji:  lblParsed?.emoji ?? existing?.emoji ?? null,
      categoria,
      activo: existing?.activo ?? true,
      metadata: meta,
    };
    try {
      await upsertRow(row);
      if (existing) updated++; else inserted++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.error(`\n  FAIL ${slug}:`, e.message);
    }
  }
  console.log(`\n=== Fase 2 seed completo: ${updated} updated, ${inserted} inserted, ${failed} failed ===`);

  // Verificar conteo final + algunos giros típicos
  const verify = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?slug=in.(taqueria,abarrotes,floreria)&select=slug,nombre,emoji,categoria,metadata`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  const rows = await verify.json();
  console.log('\nMuestra post-seed:');
  rows.forEach(r => console.log(`  ${r.slug}: emoji=${r.emoji} categoria=${r.categoria} modules_enabled keys=${Object.keys(r.metadata?.modules_enabled || {}).length}`));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
