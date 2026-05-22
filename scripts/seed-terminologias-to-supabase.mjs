#!/usr/bin/env node
/**
 * seed-terminologias-to-supabase.mjs · V14.2
 *
 * Lee public/data/giros-terminologias-v2.json y patchea cada giro en
 * giros_maestro.metadata, preservando metadata existente y agregando:
 *   - terminologias_full      (objeto de strings)
 *   - modulos_activos_full    (array)
 *   - modulos_inactivos_full  (array)
 *
 * Si un giro del JSON NO existe en giros_maestro, se skip con warning.
 *
 * USO: node scripts/seed-terminologias-to-supabase.mjs
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

if (!SUPA_URL || !SUPA_KEY) {
  console.error('FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
  process.exit(1);
}

const JSON_PATH = path.join(PROJECT_ROOT, 'public', 'data', 'giros-terminologias-v2.json');

async function getRow(slug) {
  const r = await fetch(`${SUPA_URL}/rest/v1/giros_maestro?slug=eq.${encodeURIComponent(slug)}&select=slug,metadata`, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY },
  });
  if (!r.ok) throw new Error(`GET HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

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
  if (!r.ok) throw new Error(`PATCH HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

  // Filtrar entradas que NO son giros (e.g. _meta, default)
  const slugs = Object.keys(data).filter(k => k !== '_meta' && k !== 'default');

  console.log(`Total slugs en JSON: ${slugs.length}`);
  console.log(`SUPA_URL: ${SUPA_URL}`);
  console.log('');

  let patched = 0;
  let skipped = 0;
  let failed = 0;
  const skippedSlugs = [];
  const failedSlugs = [];

  for (const slug of slugs) {
    const entry = data[slug];
    if (!entry || typeof entry !== 'object') {
      console.warn(`SKIP ${slug}: invalid entry in JSON`);
      skipped++;
      skippedSlugs.push(slug);
      continue;
    }

    try {
      const row = await getRow(slug);
      if (!row) {
        console.warn(`SKIP ${slug}: not found in giros_maestro`);
        skipped++;
        skippedSlugs.push(slug);
        continue;
      }

      const existingMeta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
      const newMeta = {
        ...existingMeta,
        terminologias_full: entry.terminologias || {},
        modulos_activos_full: Array.isArray(entry.modulos_activos) ? entry.modulos_activos : [],
        modulos_inactivos_full: Array.isArray(entry.modulos_inactivos) ? entry.modulos_inactivos : [],
      };

      await patchRow(slug, { metadata: newMeta });
      console.log(`Patched ${slug}: OK`);
      patched++;
    } catch (e) {
      console.error(`FAIL ${slug}: ${e.message}`);
      failed++;
      failedSlugs.push({ slug, error: e.message });
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Patched: ${patched}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  if (skippedSlugs.length > 0) {
    console.log(`  Skipped slugs: ${skippedSlugs.join(', ')}`);
  }
  if (failedSlugs.length > 0) {
    console.log(`  Failed slugs:`);
    failedSlugs.forEach(f => console.log(`    - ${f.slug}: ${f.error}`));
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
