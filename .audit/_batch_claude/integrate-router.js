#!/usr/bin/env node
/**
 * Integra los aliases de ROUTER-MAPPINGS a public/volvix-brand-router.js
 *
 * Estructura del router:
 *   var VLX_BRANDS = { 'slug': { brand:'X', url:'x.html' }, ... };
 *   var VLX_ALIASES = { 'alias': 'slug', ... };
 *
 * Backup en public/volvix-brand-router.js.bak-pre-200marcas
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..', '..');
const ROUTER = path.join(PROJECT, 'public', 'volvix-brand-router.js');
const BACKUP = ROUTER + '.bak-pre-200marcas';
const SECTORS = ['01-alimentos', '02-retail', '03-tecnicos', '04-educacion'];

let src = fs.readFileSync(ROUTER, 'utf8');

// Safety check: only run once
if (src.includes("'trompo':") || src.includes('BRAND_TROMPO')) {
  console.error('❌ Router already has trompo entry — already integrated. Aborting.');
  process.exit(1);
}

// Load all ROUTER-MAPPINGS
const allMappings = {};
for (const sector of SECTORS) {
  const rmPath = path.join(__dirname, sector, 'ROUTER-MAPPINGS.json');
  if (fs.existsSync(rmPath)) {
    const rm = JSON.parse(fs.readFileSync(rmPath, 'utf8'));
    Object.assign(allMappings, rm);
  }
}
const slugs = Object.keys(allMappings);
console.log(`Loaded ${slugs.length} slug mappings`);

// Backup
fs.writeFileSync(BACKUP, src);
console.log(`✅ Backup written: ${BACKUP}`);

// === Build VLX_BRANDS snippet ===
const brandLines = [];
brandLines.push('    // V7 — 200 marcas premium auto-generadas (4 sectores)');
for (const slug of slugs) {
  const m = allMappings[slug];
  const brand = (m.brand || slug).replace(/'/g, "\\'");
  const url = (m.url || `${slug}.html`).replace(/'/g, "\\'");
  // Format key with quotes for kebab-case slugs
  const key = `'${slug}'`;
  brandLines.push(`    ${key.padEnd(20)}: { brand: '${brand}', url: '${url}' },`);
}
const brandSnippet = brandLines.join('\n');

// === Build VLX_ALIASES snippet ===
const aliasLines = [];
aliasLines.push('    // V7 — aliases de las 200 marcas premium (4 sectores)');
const seenAliases = new Set();

// First, get existing aliases to avoid overwriting
const existingAliasMatches = src.matchAll(/^\s*'([^']+)':\s*'/gm);
for (const m of existingAliasMatches) {
  seenAliases.add(m[1]);
}

for (const slug of slugs) {
  const m = allMappings[slug];
  const aliases = Array.isArray(m.aliases) ? m.aliases : [];
  for (const aliasRaw of aliases) {
    const alias = String(aliasRaw).toLowerCase().trim();
    if (!alias) continue;
    if (seenAliases.has(alias)) continue; // don't overwrite existing
    seenAliases.add(alias);
    const aliasKey = `'${alias.replace(/'/g, "\\'")}'`;
    aliasLines.push(`    ${aliasKey.padEnd(45)}: '${slug}',`);
  }
}
const aliasSnippet = aliasLines.join('\n');

// === Insert VLX_BRANDS entries before its closing `};` ===
const brandsStart = src.indexOf('var VLX_BRANDS = {');
if (brandsStart < 0) {
  console.error('❌ var VLX_BRANDS not found');
  process.exit(1);
}
const brandsEnd = src.indexOf('  };', brandsStart);
if (brandsEnd < 0) {
  console.error('❌ VLX_BRANDS closing not found');
  process.exit(1);
}
src = src.slice(0, brandsEnd) + brandSnippet + '\n' + src.slice(brandsEnd);
console.log(`✅ Inserted ${slugs.length} brand entries in VLX_BRANDS`);

// === Insert VLX_ALIASES entries before its closing `};` ===
const aliasesStart = src.indexOf('var VLX_ALIASES = {');
if (aliasesStart < 0) {
  console.error('❌ var VLX_ALIASES not found');
  process.exit(1);
}
const aliasesEnd = src.indexOf('  };', aliasesStart);
if (aliasesEnd < 0) {
  console.error('❌ VLX_ALIASES closing not found');
  process.exit(1);
}
src = src.slice(0, aliasesEnd) + aliasSnippet + '\n' + src.slice(aliasesEnd);
console.log(`✅ Inserted ${aliasLines.length - 1} alias entries in VLX_ALIASES`);

// === Write result ===
fs.writeFileSync(ROUTER, src);
const newLines = src.split('\n').length;
console.log(`\n✅ volvix-brand-router.js updated. New size: ${newLines} lines`);
