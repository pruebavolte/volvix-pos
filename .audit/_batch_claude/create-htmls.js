#!/usr/bin/env node
/**
 * Crea 200 archivos HTML copy de pareo.html, uno por marca.
 *
 * Por cada marca:
 *   1. Copia public/pareo.html → public/{slug}.html
 *   2. Reemplaza:
 *      - <title>Pareo — ...</title> → <title>{Brand} — {tagline}</title>
 *      - history.replaceState(null, '', '?b=pareo') → ?b={slug}
 *
 * NO toca pareo.html original.
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..', '..');
const TEMPLATE = path.join(PROJECT, 'public', 'pareo.html');
const PUBLIC = path.join(PROJECT, 'public');
const SECTORS = ['01-alimentos', '02-retail', '03-tecnicos', '04-educacion'];

const templateContent = fs.readFileSync(TEMPLATE, 'utf8');
console.log(`Template loaded: ${templateContent.length} bytes`);

// Load all brand JSONs
const brands = [];
for (const sector of SECTORS) {
  const dir = path.join(__dirname, sector);
  const files = fs.readdirSync(dir).filter(f => /^\d+.*\.json$/.test(f)).sort();
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (data.slug && data.brand) {
      brands.push({ slug: data.slug, brand: data.brand, tagline: data.tagline || '' });
    }
  }
}

console.log(`Brands to process: ${brands.length}`);

let created = 0;
let skipped = 0;

for (const b of brands) {
  const dest = path.join(PUBLIC, `${b.slug}.html`);

  // Safety: don't overwrite existing HTMLs (especially the 11 premium hand-tuned ones)
  if (fs.existsSync(dest)) {
    console.log(`  SKIP ${b.slug}.html (exists)`);
    skipped++;
    continue;
  }

  // Replace title and history.replaceState
  // Original title: <title>Pareo — El sistema para zapaterías que sí cuentan cada par</title>
  const titleRegex = /<title>[^<]*<\/title>/;
  const newTitle = `<title>${b.brand} — ${b.tagline.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>`;

  let html = templateContent.replace(titleRegex, newTitle);
  html = html.replace(
    /history\.replaceState\(null,\s*''\s*,\s*'\?b=pareo'\)/g,
    `history.replaceState(null, '', '?b=${b.slug}')`
  );

  // Also handle the case where the URL param is part of any other string
  // (e.g., for canonical, OG tags, etc.)
  html = html.replace(/\?b=pareo/g, `?b=${b.slug}`);

  fs.writeFileSync(dest, html);
  created++;
  if (created % 25 === 0) console.log(`  Progress: ${created} HTMLs created`);
}

console.log(`\n✅ Done. Created: ${created}, Skipped (existed): ${skipped}, Total: ${brands.length}`);
