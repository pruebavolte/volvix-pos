#!/usr/bin/env node
/**
 * seed-giros-master.mjs · V13.31
 *
 * Migra el contenido de public/data/giros-ecosystem.json (295 giros) +
 * los INDUSTRY_PROFILES/LABELS/GIRO_CATEGORIES hardcoded en paneldecontrol.html
 * a la tabla `giros_maestro` de Supabase (que ya existía con 36 rows).
 *
 * El "rich data" (cadena_valor, competidores_sector, terminologia,
 * productos_plantilla, etc.) se guarda en la columna metadata JSONB
 * — así NO necesitamos ALTER TABLE (que requiere acceso DDL al SQL Editor).
 *
 * Uso:  node scripts/seed-giros-master.mjs
 * Requiere variables de entorno SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── 1. Leer credenciales desde .env ───
function readEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\n$/, '');
      env[m[1]] = v;
    }
  });
  return env;
}

const env = readEnv();
const SUPA_URL = env.SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// ─── 2. Leer ecosystem JSON ───
const ecoPath = path.join(PROJECT_ROOT, 'public', 'data', 'giros-ecosystem.json');
const ecosystem = JSON.parse(fs.readFileSync(ecoPath, 'utf-8'));
console.log(`Ecosystem JSON cargado: ${ecosystem.giros.length} giros, generated_at=${ecosystem._meta.generated_at}`);

// ─── 3. Mapeo de categorías (espejo de GIRO_CATEGORIES hardcoded en panel) ───
// Aproximación: usamos un mapping slug → categoría friendly basado en heurística
const CATEGORY_MAP = {
  'alimentos': 'Comida & Bebida',
  'restaurantes': 'Comida & Bebida',
  'comida_corrida': 'Comida & Bebida',
  'tiendas': 'Tienda & Abarrotes',
  'abarrotes': 'Tienda & Abarrotes',
  'salud': 'Salud',
  'belleza': 'Belleza & Estética',
  'servicios': 'Servicios',
  'retail': 'Retail',
  'tecnologia': 'Tecnología',
  'automotriz': 'Automotriz',
  'educacion': 'Educación',
  'otros': 'Otros giros (BD)',
};

function inferCategory(g) {
  const slug = (g.slug || '').toLowerCase();
  if (/(restaurante|taquer|pizza|cafe|panade|hambur|comida|jugos|antojitos|polleria|carnice|tortill|heladeria|pasteleri)/.test(slug)) return 'Comida & Bebida';
  if (/(abarrot|minisuper|tienda-conv|deposito|cremer|frutera|fruteria)/.test(slug)) return 'Tienda & Abarrotes';
  if (/(farmacia|veterinaria|dentista|clinica|optica|fisio|medico|consult)/.test(slug)) return 'Salud';
  if (/(barber|salon|nail|spa|estetica|peluqu|cosmetic)/.test(slug)) return 'Belleza & Estética';
  if (/(taller|carwash|lavanderia|purificadora|cerrajeria|gimnasio|ferrete|cctv|domotic|fotograf|escuela|guarderia)/.test(slug)) return 'Servicios';
  if (/(ropa|zapate|bouti|muebleri|papele|elect|electrod|celular|computac|gamer|deportes|tatuaj|libreria|jugueteria)/.test(slug)) return 'Retail';
  if (/(crypto|domotic|drone|automatiz|ciber)/.test(slug)) return 'Tecnología';
  if (/(refacc|agencia_auto|motos)/.test(slug)) return 'Automotriz';
  return 'Otros giros (BD)';
}

// ─── 4. Construir rows para upsert ───
function toMasterRow(g) {
  // Extraer emoji del name si lo trae (ej: "🌮 Taquería" → emoji "🌮", name "Taquería")
  let emoji = null;
  let nameOnly = String(g.name || g.slug);
  const m = nameOnly.match(/^(\p{Emoji}+)\s*(.+)$/u);
  if (m) {
    emoji = m[1];
    nameOnly = m[2];
  }

  // Sinónimos: combinar synonyms si existen + el slug normalizado
  const sinonimos = Array.isArray(g.synonyms) ? g.synonyms.slice(0, 30) : [];

  // Categoría
  const categoria = inferCategory(g);

  // Todo el "rich data" va a metadata
  const metadata = {
    que_vende:               g.que_vende || '',
    tipo_operacion:          g.tipo_operacion || '',
    regulacion:              g.regulacion || null,
    cadena_valor:            g.cadena_valor || null,
    competidores_sector:     g.competidores_sector || [],
    funcionalidades_criticas: g.funcionalidades_criticas || [],
    problemas_evitar:        g.problemas_evitar || [],
    terminologia:            g.terminologia || [],
    productos_plantilla:     g.productos_plantilla || [],
    landing_url:             g.landing_url || null,
    landing_type:            g.landing_type || null,
    source:                  g.source || 'ecosystem_json',
    _ecosystem_generated_at: ecosystem._meta.generated_at,
  };

  return {
    slug:        g.slug,
    nombre:      nameOnly,
    categoria,
    emoji,
    sinonimos,
    landing_slug: g.landing_url ? g.landing_url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '') : null,
    activo:      true,
    prioridad:   100,
    metadata,
  };
}

const allRows = ecosystem.giros.map(toMasterRow);
console.log(`Total rows preparados: ${allRows.length}`);

// ─── 5. Bulk upsert vía PostgREST en chunks de 50 ───
async function upsertBatch(rows) {
  const url = SUPA_URL + '/rest/v1/giros_maestro?on_conflict=slug';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return true;
}

async function main() {
  const CHUNK = 50;
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const batch = allRows.slice(i, i + CHUNK);
    process.stdout.write(`  Batch ${Math.floor(i / CHUNK) + 1}/${Math.ceil(allRows.length / CHUNK)} (${batch.length} rows)... `);
    try {
      await upsertBatch(batch);
      ok += batch.length;
      console.log('OK');
    } catch (e) {
      failed += batch.length;
      console.error('FAIL:', e.message);
    }
  }
  console.log(`\n=== Seed completo: ${ok} ok / ${failed} failed (${allRows.length} total) ===`);

  // Verificar conteo final
  const verify = await fetch(SUPA_URL + '/rest/v1/giros_maestro?select=*&limit=0', {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Prefer': 'count=exact',
      'Range': '0-0',
    },
  });
  const total = verify.headers.get('content-range');
  console.log(`Conteo final en BD: ${total}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
