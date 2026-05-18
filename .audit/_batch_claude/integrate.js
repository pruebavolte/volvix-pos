#!/usr/bin/env node
/**
 * Integra los snippets generados a public/brands.config.js
 *
 * Anchors:
 *   1. Inserta brands-snippet.js justo después del último BRAND_X existente
 *      (antes del comentario "// SOCIAL PROOF")
 *   2. Inserta social-proof-snippet.js antes del `];` que cierra SOCIAL_PROOF
 *   3. Inserta brands-registry-snippet.js antes del `};` que cierra BRANDS
 *
 * Crea backup en public/brands.config.js.bak-pre-200marcas
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..', '..');
const BRANDS_CFG = path.join(PROJECT, 'public', 'brands.config.js');
const BACKUP = BRANDS_CFG + '.bak-pre-200marcas';
const OUT_DIR = path.join(__dirname, 'output');

const brandsSnippet = fs.readFileSync(path.join(OUT_DIR, 'brands-snippet.js'), 'utf8').trimEnd();
const registrySnippet = fs.readFileSync(path.join(OUT_DIR, 'brands-registry-snippet.js'), 'utf8').trimEnd();
const socialSnippet = fs.readFileSync(path.join(OUT_DIR, 'social-proof-snippet.js'), 'utf8').trimEnd();

let src = fs.readFileSync(BRANDS_CFG, 'utf8');

// Safety check: only run once
if (src.includes('BRAND_TROMPO')) {
  console.error('❌ brands.config.js already has BRAND_TROMPO — already integrated. Aborting.');
  process.exit(1);
}

// Backup
fs.writeFileSync(BACKUP, src);
console.log(`✅ Backup written: ${BACKUP}`);

// === ANCHOR 1: insert brands snippet before "// SOCIAL PROOF" comment ===
const anchor1 = '// =============================================================\n// SOCIAL PROOF';
const pos1 = src.indexOf(anchor1);
if (pos1 < 0) {
  console.error('❌ Anchor 1 (SOCIAL PROOF comment) not found');
  process.exit(1);
}
src = src.slice(0, pos1) + brandsSnippet + '\n\n\n' + src.slice(pos1);
console.log(`✅ Inserted ${brandsSnippet.split('\n').length} lines of brand consts`);

// === ANCHOR 2: insert social proof entries before the `];` that closes SOCIAL_PROOF ===
// Find the SOCIAL_PROOF declaration and locate its closing `];`
const socialStart = src.indexOf('const SOCIAL_PROOF = [');
if (socialStart < 0) {
  console.error('❌ SOCIAL_PROOF declaration not found');
  process.exit(1);
}
// Find first `];` after socialStart
const socialEnd = src.indexOf('];', socialStart);
if (socialEnd < 0) {
  console.error('❌ SOCIAL_PROOF closing not found');
  process.exit(1);
}
// Insert before `];` — make sure there's a newline before our content
const beforeSocial = src.slice(0, socialEnd);
const afterSocial = src.slice(socialEnd);
const needsNewline = !beforeSocial.endsWith('\n');
src = beforeSocial + (needsNewline ? '\n' : '') + socialSnippet + '\n' + afterSocial;
console.log(`✅ Inserted ${socialSnippet.split('\n').length} social proof entries`);

// === ANCHOR 3: insert BRANDS registry entries before the `};` that closes `const BRANDS = {` ===
const brandsStart = src.indexOf('const BRANDS = {');
if (brandsStart < 0) {
  console.error('❌ const BRANDS = { not found');
  process.exit(1);
}
const brandsEnd = src.indexOf('};', brandsStart);
if (brandsEnd < 0) {
  console.error('❌ BRANDS closing not found');
  process.exit(1);
}
const beforeBrands = src.slice(0, brandsEnd);
const afterBrands = src.slice(brandsEnd);
// The registry snippet starts with "'trompo':" (no leading "  ") so we need to add indent.
// Actually it doesn't have leading spaces consistently — let me reformat
const indentedRegistry = registrySnippet
  .split('\n')
  .map(l => l.trim() ? (l.startsWith('  ') ? l : '  ' + l.trim()) : l)
  .join('\n');
const needsNewline2 = !beforeBrands.endsWith('\n');
src = beforeBrands + (needsNewline2 ? '\n' : '') + indentedRegistry + '\n' + afterBrands;
console.log(`✅ Inserted ${registrySnippet.split('\n').length} BRANDS registry entries`);

// === Write result ===
fs.writeFileSync(BRANDS_CFG, src);
const newLines = src.split('\n').length;
console.log(`\n✅ brands.config.js updated. New size: ${newLines} lines`);

// === Verify syntax: try to require ===
try {
  delete require.cache[BRANDS_CFG];
  const mod = require(BRANDS_CFG);
  if (!mod.BRANDS) {
    console.error('❌ BRANDS export missing after integration');
    process.exit(1);
  }
  const brandCount = Object.keys(mod.BRANDS).length;
  const socialCount = mod.SOCIAL_PROOF.length;
  console.log(`✅ Module loads OK: ${brandCount} brands, ${socialCount} social entries`);
} catch (e) {
  console.error('❌ Module load failed:', e.message);
  console.error('Restoring backup...');
  fs.writeFileSync(BRANDS_CFG, fs.readFileSync(BACKUP, 'utf8'));
  console.error('Restored from backup.');
  process.exit(1);
}
