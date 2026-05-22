#!/usr/bin/env node
/**
 * seed-giros-fase4-perfection.mjs · V13.35
 *
 * Reclasifica los 104 giros que aún están en 'Otros giros (BD)' usando
 * un mapeo agresivo basado en inspección manual. Cada slug se categoriza
 * a una de las 10 categorías existentes.
 *
 * Esto cierra el último defecto de la migración: 35% de giros mal etiquetados.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function readEnv() {
  const raw = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
  const env = {};
  raw.split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
      env[m[1]] = v.replace(/\\n$/, '');
    }
  });
  return env;
}
const env = readEnv();
const SUPA_URL = env.SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// Mapeo explícito slug → categoría (basado en inspección manual de los 104)
const SLUG_TO_CATEGORY = {
  // === Comida & Bebida ===
  'tacos': 'Comida & Bebida',
  'neveria': 'Comida & Bebida',
  'paleteria': 'Comida & Bebida',
  'postreria': 'Comida & Bebida',
  'carnitas_estilo_michoacan': 'Comida & Bebida',
  'alimentos': 'Comida & Bebida',
  'comedor_industrial': 'Comida & Bebida',
  'venta_de_alimentos': 'Comida & Bebida',
  'venta_de_boneles': 'Comida & Bebida',
  'venta_de_boneless': 'Comida & Bebida',
  'fabricacion_de_bebidas': 'Comida & Bebida',
  'caf-orgnico': 'Comida & Bebida',
  'negocios_de_venta_de_alimentos': 'Comida & Bebida',
  'queseria': 'Comida & Bebida',

  // === Frescos & Mostrador ===
  'frutas': 'Frescos & Mostrador',
  'frutas-deshidratadas': 'Frescos & Mostrador',
  'pescado': 'Frescos & Mostrador',
  'venta-de-fruta': 'Frescos & Mostrador',

  // === Salud ===
  'salud': 'Salud',
  'servicios_de_salud': 'Salud',
  'laboratorio': 'Salud',
  'herbalife': 'Salud',
  'industria_quimica': 'Salud',

  // === Belleza & Cuidado ===
  'proveedora_de_belleza': 'Belleza & Cuidado',

  // === Retail (ropa, accesorios, hogar, decoración, instrumentos) ===
  'calcetines': 'Retail',
  'fajas': 'Retail',
  'lenceria': 'Retail',
  'mochila': 'Retail',
  'patines': 'Retail',
  'pantimedias': 'Retail',
  'toallas': 'Retail',
  'renta-de-vestidos': 'Retail',
  'camas': 'Retail',
  'colchas': 'Retail',
  'edredones': 'Retail',
  'hogar': 'Retail',
  'macetas': 'Retail',
  'arboles': 'Retail',
  'vivero': 'Retail',
  'vibero': 'Retail',
  'floristeria': 'Retail',
  'retail': 'Retail',
  'guitarra': 'Retail',
  'guitarras': 'Retail',
  'compu': 'Retail',
  'equipo_de_computo': 'Retail',
  'foto_estudio': 'Retail',

  // === Tienda & Abarrotes ===
  'tienda': 'Tienda & Abarrotes',
  'mini_super': 'Tienda & Abarrotes',
  'bodegas': 'Tienda & Abarrotes',
  'sexshop': 'Tienda & Abarrotes',
  'venta_de_productos_artesanales': 'Tienda & Abarrotes',
  'venta_de_cristales_energeticos': 'Tienda & Abarrotes',
  'vending_machines': 'Tienda & Abarrotes',

  // === Servicios (todo lo "servicios_*", profesional, fumigación, etc.) ===
  'asesor_de_seguros': 'Servicios',
  'banco': 'Servicios',
  'bienes_raices': 'Servicios',
  'inmobiliaria': 'Servicios',
  'seguros': 'Servicios',
  'financiero': 'Servicios',
  'servicios_financieros': 'Servicios',
  'servicios_legales': 'Servicios',
  'servicios_profesionales': 'Servicios',
  'control_de_plagas': 'Servicios',
  'servicios_de_fumigacion': 'Servicios',
  'funeraria': 'Servicios',
  'colegio': 'Servicios',
  'educacion': 'Servicios',
  'paqueteria': 'Servicios',
  'logistica': 'Servicios',
  'almacen_logistica': 'Servicios',
  'forrajera': 'Servicios',
  'comunidad_industrial': 'Servicios',
  'industria_automotriz': 'Servicios',
  'industrial': 'Servicios',
  'fabrica': 'Servicios',
  'fabricacion_de_mobiliario_y_equipamiento_industrial': 'Servicios',
  'fabricacion_industrial': 'Servicios',
  'fabricante_de_etiquetas': 'Servicios',
  'fabricante_de_etiquetas_adhesivas_e_in_mould': 'Servicios',
  'mantenimiento_industrial': 'Servicios',
  'manufactura_avanzada': 'Servicios',
  'maquiladora': 'Servicios',
  'maquinados': 'Servicios',
  'maquinaria_industrial': 'Servicios',
  'metalmecanica': 'Servicios',
  'mineria': 'Servicios',
  'petroleo_y_gas': 'Servicios',
  'proveedor_de_empaque': 'Servicios',
  'puertas': 'Servicios',
  'botes-de-basura': 'Servicios',
  'servicios_industriales': 'Servicios',
  'servicios_de_mantenimiento_industrial': 'Servicios',
  'servicios': 'Servicios',

  // === Automotriz ===
  'gasolinera': 'Automotriz',

  // === Tecnología ===
  'tecnologia_de_puntos_de_venta': 'Tecnología',
  'tecnologia_y_conectividad': 'Tecnología',
  'servicios_de_telecomunicaciones': 'Tecnología',
  'servicios_tecnicos_en_informatica': 'Tecnología',
  'servicios_tic': 'Tecnología',
  'soluciones_de_conectividad_y_tecnologia': 'Tecnología',
  'aire-acondicionado': 'Tecnología',
  'climas': 'Tecnología',
  'venta-de-aire-acondicionado': 'Tecnología',
};

// PROFILE_GENERIC + módulos por categoría (mismo que fase3)
const PROFILE_GENERIC = {
  pos:true, dashboard:true, apertura:true, corte:true, ventas:true,
  reportes:true, clientes:true, usuarios:true, config:true, devoluciones:true,
};
const CATEGORY_DEFAULTS = {
  'Comida & Bebida':    { ...PROFILE_GENERIC, departamentos:true, promociones:true },
  'Frescos & Mostrador':{ ...PROFILE_GENERIC, inventario:true, departamentos:true, promociones:true, proveedores:true },
  'Tienda & Abarrotes': { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, recargas:true, departamentos:true, promociones:true, sugeridas:true },
  'Salud':              { ...PROFILE_GENERIC, inventario:true, credito:true, facturacion:true, promociones:true, servicios:true },
  'Belleza & Cuidado':  { ...PROFILE_GENERIC, servicios:true, promociones:true, inventario:true },
  'Retail':             { ...PROFILE_GENERIC, inventario:true, kardex:true, credito:true, proveedores:true, departamentos:true, promociones:true, cotizaciones:true, facturacion:true },
  'Automotriz':         { ...PROFILE_GENERIC, servicios:true, cotizaciones:true, credito:true, facturacion:true, inventario:true, proveedores:true },
  'Servicios':          { ...PROFILE_GENERIC, servicios:true, promociones:true, cotizaciones:true },
  'Tecnología':         { ...PROFILE_GENERIC, servicios:true, cotizaciones:true, credito:true, facturacion:true },
};

async function patchRow(slug, patch) {
  const r = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
}

async function main() {
  // Traer los 104 actuales en "Otros giros (BD)"
  const r = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?categoria=eq.Otros+giros+(BD)&select=slug,metadata`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  const rows = await r.json();
  console.log(`Total en 'Otros giros (BD)': ${rows.length}`);

  let reclassified = 0;
  let unmapped = 0;
  const stillOthers = [];

  for (const row of rows) {
    const newCat = SLUG_TO_CATEGORY[row.slug];
    if (!newCat) {
      unmapped++;
      stillOthers.push(row.slug);
      continue;
    }
    const meta = Object.assign({}, row.metadata || {});
    // Actualizar también modules_enabled para reflejar el cambio de categoría
    meta.modules_enabled = CATEGORY_DEFAULTS[newCat] || PROFILE_GENERIC;
    try {
      await patchRow(row.slug, { categoria: newCat, metadata: meta });
      reclassified++;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\n  FAIL ${row.slug}:`, e.message);
    }
  }

  console.log(`\n=== Fase 4 perfección ===`);
  console.log(`  Reclasificados: ${reclassified}`);
  console.log(`  Sin mapeo (queda en Otros): ${unmapped}`);
  if (stillOthers.length) {
    console.log(`  Slugs sin mapeo (revisar manual):`);
    stillOthers.forEach(s => console.log(`    - ${s}`));
  }

  // Verificar
  const verify = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?select=categoria&limit=2000`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  const all = await verify.json();
  const dist = {};
  all.forEach(r => { dist[r.categoria || 'NULL'] = (dist[r.categoria || 'NULL'] || 0) + 1; });
  console.log(`\nDistribución final por categoría:`);
  Object.entries(dist).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
