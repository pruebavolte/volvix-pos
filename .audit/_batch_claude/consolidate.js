#!/usr/bin/env node
/**
 * Consolida los 200 JSONs de los 4 batches en snippets JavaScript
 * listos para insertar en brands.config.js y volvix-brand-router.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SECTORS = ['01-alimentos', '02-retail', '03-tecnicos', '04-educacion'];
const OUT_DIR = path.join(ROOT, 'output');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// === LOAD all JSONs ===
const allBrands = [];
const routerMappings = {};

for (const sector of SECTORS) {
  const dir = path.join(ROOT, sector);
  const files = fs.readdirSync(dir)
    .filter(f => /^\d+.*\.json$/.test(f))
    .sort();

  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!data.slug || !data.brand) {
        console.error(`SKIP ${f}: missing slug or brand`);
        continue;
      }
      allBrands.push({ ...data, _file: f, _sector: sector });
    } catch (e) {
      console.error(`ERROR parsing ${full}: ${e.message}`);
    }
  }

  // Load router mappings
  const rmPath = path.join(dir, 'ROUTER-MAPPINGS.json');
  if (fs.existsSync(rmPath)) {
    try {
      const rm = JSON.parse(fs.readFileSync(rmPath, 'utf8'));
      Object.assign(routerMappings, rm);
    } catch (e) {
      console.error(`ERROR parsing router mappings ${rmPath}: ${e.message}`);
    }
  }
}

console.log(`Loaded ${allBrands.length} brands.`);

// === Detect slug conflicts ===
const slugCount = {};
for (const b of allBrands) {
  slugCount[b.slug] = (slugCount[b.slug] || 0) + 1;
}
const dupes = Object.entries(slugCount).filter(([_, c]) => c > 1);
if (dupes.length) {
  console.error('DUPLICATE SLUGS:', dupes);
  process.exit(1);
}

// === Sanitize: brand names with accents ===
// Some agents wrote "Compas", "Sarten", "Tutoria", "Particular" — keep as-is, agent decided.
// Slug must be kebab-case ASCII; verify.
for (const b of allBrands) {
  if (!/^[a-z0-9-]+$/.test(b.slug)) {
    console.error(`BAD SLUG ${b.slug} in ${b._file}`);
    process.exit(1);
  }
}

// === Helper: emit JavaScript object literal from JSON-safe value ===
function jsLiteral(v, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);

  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // Single-quote strings; escape single quotes and backslashes
    return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    // Inline if all primitives or short
    const items = v.map(x => jsLiteral(x, indent + 1));
    const inlineStr = '[' + items.join(', ') + ']';
    if (inlineStr.length < 120 && !items.some(s => s.includes('\n'))) return inlineStr;
    return '[\n' + items.map(s => padIn + s).join(',\n') + '\n' + pad + ']';
  }
  if (typeof v === 'object') {
    // Skip comment keys
    const entries = Object.entries(v).filter(([k]) => !k.startsWith('//'));
    if (entries.length === 0) return '{}';
    const parts = entries.map(([k, val]) => {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
      return `${key}: ${jsLiteral(val, indent + 1)}`;
    });
    const inlineStr = '{' + parts.join(', ') + '}';
    if (inlineStr.length < 100 && !parts.some(s => s.includes('\n'))) return inlineStr;
    return '{\n' + parts.map(s => padIn + s).join(',\n') + '\n' + pad + '}';
  }
  return 'null';
}

// === Emit brand const declarations ===
const brandConsts = [];
for (const b of allBrands) {
  // Strip private keys
  const { _file, _sector, ...clean } = b;
  // Strip comment keys from nested objects too
  const stripped = JSON.parse(JSON.stringify(clean, (k, v) => k.startsWith('//') ? undefined : v));
  const SLUG_UPPER = b.slug.replace(/-/g, '_').toUpperCase();
  const lit = jsLiteral(stripped, 0);
  brandConsts.push(`// =============================================================
// BRAND_${SLUG_UPPER} — ${b.giro} (${b.vibe} vibe)
// =============================================================
const BRAND_${SLUG_UPPER} = ${lit};`);
}

fs.writeFileSync(
  path.join(OUT_DIR, 'brands-snippet.js'),
  brandConsts.join('\n\n\n') + '\n'
);
console.log(`Wrote ${brandConsts.length} BRAND_X consts`);

// === Emit BRANDS registry entries (just the lines) ===
const branRegEntries = allBrands.map(b => {
  const slugKey = b.slug.replace(/-/g, '_');
  const SLUG_UPPER = slugKey.toUpperCase();
  return `  '${b.slug}': BRAND_${SLUG_UPPER},`;
});
fs.writeFileSync(
  path.join(OUT_DIR, 'brands-registry-snippet.js'),
  branRegEntries.join('\n') + '\n'
);
console.log(`Wrote ${branRegEntries.length} registry entries`);

// === Emit SOCIAL_PROOF entries from quotes ===
const socialEntries = [];
for (const b of allBrands) {
  const q = b.quote || {};
  // role is like "Joyería Karat, Polanco, CDMX" -> biz="Joyería Karat" city="Polanco, CDMX"
  const role = q.role || '';
  let biz = b.brand;
  let city = 'México, MX';
  const m = role.match(/^([^,]+?)(?:,\s*(.+))?$/);
  if (m) {
    biz = m[1].trim() || b.brand;
    if (m[2]) city = m[2].trim();
  }
  // Random "when" minutes/hours
  const mins = Math.floor(Math.random() * 60) + 1;
  const when = mins < 60 ? `hace ${mins} min` : `hace ${Math.floor(mins / 60)} hr`;
  socialEntries.push(`  {brand:'${b.brand.replace(/'/g, "\\'")}', biz:'${biz.replace(/'/g, "\\'")}', city:'${city.replace(/'/g, "\\'")}', when:'${when}'},`);
}
fs.writeFileSync(
  path.join(OUT_DIR, 'social-proof-snippet.js'),
  socialEntries.join('\n') + '\n'
);
console.log(`Wrote ${socialEntries.length} social proof entries`);

// === Emit router aliases consolidated ===
const routerEntries = [];
for (const b of allBrands) {
  // Get aliases from router-mappings.json if exists, otherwise build minimal
  let aliases = [];
  const rm = routerMappings[b.slug];
  if (rm && Array.isArray(rm.aliases) && rm.aliases.length) {
    aliases = rm.aliases;
  } else {
    aliases = [b.giro, b.giroPlural].filter(Boolean);
  }
  // Deduplicate, normalize
  aliases = [...new Set(aliases.map(a => String(a).toLowerCase().trim()))].filter(Boolean);
  const aliasLines = aliases.map(a => `      '${a.replace(/'/g, "\\'")}'`).join(',\n');
  routerEntries.push(`    '${b.slug}': {
      brand: '${b.brand.replace(/'/g, "\\'")}',
      url: '${b.slug}.html',
      aliases: [
${aliasLines}
      ],
    }`);
}
fs.writeFileSync(
  path.join(OUT_DIR, 'router-mappings-snippet.js'),
  routerEntries.join(',\n') + '\n'
);
console.log(`Wrote ${routerEntries.length} router entries`);

// === Write manifest ===
const manifest = {
  totalBrands: allBrands.length,
  bySector: SECTORS.map(s => ({
    sector: s,
    count: allBrands.filter(b => b._sector === s).length,
  })),
  vibes: Object.fromEntries(
    Object.entries(
      allBrands.reduce((acc, b) => {
        acc[b.vibe] = (acc[b.vibe] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1])
  ),
  liveDemoTypes: Object.fromEntries(
    Object.entries(
      allBrands.reduce((acc, b) => {
        const t = b.liveDemo?.type || 'unknown';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1])
  ),
  slugs: allBrands.map(b => b.slug).sort(),
};
fs.writeFileSync(
  path.join(OUT_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log('Manifest:', JSON.stringify({
  total: manifest.totalBrands,
  bySector: manifest.bySector,
  vibes: manifest.vibes,
  liveDemoTypes: manifest.liveDemoTypes,
}, null, 2));

console.log('\n✅ Consolidation complete. Files in:', OUT_DIR);
