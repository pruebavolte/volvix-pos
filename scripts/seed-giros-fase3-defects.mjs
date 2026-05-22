#!/usr/bin/env node
/**
 * seed-giros-fase3-defects.mjs · V13.33
 *
 * Arregla 3 defectos detectados en auditoría post-Fase 2:
 *  #1 257/295 giros sin modules_enabled → backfill con PROFILE_GENERIC
 *     + módulos por defecto según categoría.
 *  #2 "Belleza & Estética" duplica "Belleza & Cuidado" → unificar.
 *  #3 Categoría 'Otros giros (BD)' tiene 138 items por inferCategory
 *     pobre → re-clasificar con reglas más estrictas + diccionario.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

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

// Defaults por categoría (qué módulos pinchar por defecto)
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
  'Otros giros (BD)':   PROFILE_GENERIC,
};

async function fetchAll() {
  // V13.33: traer también nombre, emoji para incluirlos en el upsert (constraint NOT NULL)
  const r = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?select=slug,nombre,emoji,categoria,metadata&limit=2000`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  return await r.json();
}

async function patchRow(slug, patch) {
  // V13.33: usar PATCH en lugar de UPSERT para no chocar con NOT NULL nombre.
  // PATCH solo actualiza los campos enviados; UPSERT trata de hacer INSERT si
  // PostgREST piensa que es row nueva (pero sí existe → constraint dispara).
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

// Re-clasificación con reglas más fuertes para los 138 'Otros giros (BD)'
function inferCategory(slug) {
  const s = String(slug || '').toLowerCase().replace(/[-_]/g, '_');
  // Comida & Bebida
  if (/(restaurant|taqu|pizza|cafe|cafeter|panad|hambur|comida|jugo|antojit|polleri|carnice|tortill|heladeri|pasteleri|mariscos|marisquer|sushi|sandw|burrito|chilaqu|enchilad|mole|tamale|pollo|pollos|hot_?dog|crepa|gelat|cremer|cerveza|bar|cantina|pulque|mezcal|tequila|cocteler|sushi|nieve)/i.test(s)) return 'Comida & Bebida';
  // Frescos & Mostrador
  if (/(fruteria|carniceria|polleria|tortilleria|cremeria|verduler|recauder)/i.test(s)) return 'Frescos & Mostrador';
  // Tienda & Abarrotes
  if (/(abarrot|minisuper|tienda_conv|deposito|tienda_china|dulceri|naturista|refresqueria|purific|vape|sex_shop|ecologica|regalos|bazar|saborizant|tabaqueri|tienda_de)/i.test(s)) return 'Tienda & Abarrotes';
  // Salud
  if (/(farmacia|veterinari|dentista|clinica|optica|medico|fisio|consultor|tienda_masc|laboratorio_clin|psicolog|nutriolog)/i.test(s)) return 'Salud';
  // Belleza
  if (/(barber|salon|nail|spa|estetic|peluqu|cosmetic|maquillaje|depilac|masaje)/i.test(s)) return 'Belleza & Cuidado';
  // Retail
  if (/(ropa|bouti|zapate|muebleri|papele|ferret|tlapaleri|sabanas|floreri|joyer|electronica|electrod|computac|celular|reparacion_cel|gamer|deportes|vidrieri|libreria|jugueteri|musical|disque|peletera|peleteria|sombreros|cinturones|relojeria|articulos)/i.test(s)) return 'Retail';
  // Automotriz
  if (/(refacc|taller_mecan|carwash|llantera|vulcaniza|agencia_aut|motos|moto_|llanta|hojalateri|grua|servicio_aut)/i.test(s)) return 'Automotriz';
  // Servicios
  if (/(lavanderia|gimnasio|agencia_de_viaj|imprenta|carpinteri|herreri|cerrajeri|aluminio|construccion|paneles_sol|cctv|sonido|fotograf|escuela|guarderi|hotel|motel|casa_empeno|wisp|coworking|domotic|jardineri|limpieza|mudanzas|transporte|servicio_funera|mensajeria|seguridad|abogad|notari|contador|consult|asesori|capacitac|tutori|academ|curso|taller|fiestas|eventos|banquet|kinder|guarder)/i.test(s)) return 'Servicios';
  // Tecnología
  if (/(software|marketing_dig|hosting|impres|drone|automatiz|ia_chatb|criptomo|tech|saas|web|app|blockchain|nft)/i.test(s)) return 'Tecnología';
  return 'Otros giros (BD)';
}

async function main() {
  const rows = await fetchAll();
  console.log(`Total rows en BD: ${rows.length}`);

  let fixed_modules = 0;
  let fixed_categoria = 0;
  let belleza_unified = 0;
  let failed = 0;

  for (const r of rows) {
    const meta = Object.assign({}, r.metadata || {});
    let changed = false;
    let newCategoria = r.categoria;

    // #2 Unificar "Belleza & Estética" → "Belleza & Cuidado"
    if (r.categoria === 'Belleza & Estética') {
      newCategoria = 'Belleza & Cuidado';
      belleza_unified++;
      changed = true;
    }

    // #3 Re-clasificar si la categoría parece pobre (Otros giros BD pero el slug indica claramente algo más)
    if (newCategoria === 'Otros giros (BD)' || !newCategoria) {
      const inferred = inferCategory(r.slug);
      if (inferred !== 'Otros giros (BD)' && inferred !== newCategoria) {
        newCategoria = inferred;
        fixed_categoria++;
        changed = true;
      }
    }

    // #1 Backfill modules_enabled si falta
    if (!meta.modules_enabled || Object.keys(meta.modules_enabled).length === 0) {
      meta.modules_enabled = CATEGORY_DEFAULTS[newCategoria] || PROFILE_GENERIC;
      fixed_modules++;
      changed = true;
    }

    if (!changed) continue;

    try {
      await patchRow(r.slug, {
        categoria: newCategoria,
        metadata: meta,
      });
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.error(`\n  FAIL ${r.slug}:`, e.message);
    }
  }

  console.log(`\n=== Fase 3 defects fix completo ===`);
  console.log(`  #1 backfill modules_enabled:       ${fixed_modules}`);
  console.log(`  #2 unificar Belleza:                ${belleza_unified}`);
  console.log(`  #3 reclasificar 'Otros giros (BD)': ${fixed_categoria}`);
  console.log(`  failed:                              ${failed}`);

  // Verificar
  const verify = await fetchAll();
  const noMod = verify.filter(r => !r.metadata?.modules_enabled || Object.keys(r.metadata.modules_enabled).length === 0);
  const bellezaEst = verify.filter(r => r.categoria === 'Belleza & Estética');
  const otros = verify.filter(r => r.categoria === 'Otros giros (BD)');
  console.log(`\nPost-fix:`);
  console.log(`  Giros SIN modules_enabled:     ${noMod.length}`);
  console.log(`  Giros con 'Belleza & Estética': ${bellezaEst.length} (debería ser 0)`);
  console.log(`  Giros en 'Otros giros (BD)':    ${otros.length} (antes 138)`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
