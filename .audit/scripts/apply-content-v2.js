// V2: Más seguro - usa bracket counting para encontrar el final exacto
const fs = require('fs');

const PACK = JSON.parse(fs.readFileSync('D:/github/volvix-pos/.audit/content-pack-data.json','utf8'));

const cfgPath = 'D:/github/volvix-pos/public/brands.config.js';
let cfg = fs.readFileSync(cfgPath, 'utf8');

function escSQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function findClosingBracket(text, openIdx) {
  // openIdx points to '['; find matching ']' considering nested {}
  let depth = 1;
  let inSQ = false, inDQ = false, inBT = false, escape = false;
  for (let i = openIdx + 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && (inSQ || inDQ || inBT)) { escape = true; continue; }
    if (!inDQ && !inBT && ch === "'") { inSQ = !inSQ; continue; }
    if (!inSQ && !inBT && ch === '"') { inDQ = !inDQ; continue; }
    if (!inSQ && !inDQ && ch === '`') { inBT = !inBT; continue; }
    if (inSQ || inDQ || inBT) continue;
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function findClosingBrace(text, openIdx) {
  let depth = 1;
  let inSQ = false, inDQ = false, inBT = false, escape = false;
  for (let i = openIdx + 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && (inSQ || inDQ || inBT)) { escape = true; continue; }
    if (!inDQ && !inBT && ch === "'") { inSQ = !inSQ; continue; }
    if (!inSQ && !inBT && ch === '"') { inDQ = !inDQ; continue; }
    if (!inSQ && !inDQ && ch === '`') { inBT = !inBT; continue; }
    if (inSQ || inDQ || inBT) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function patchBrand(slug, data) {
  const upper = 'BRAND_' + slug.toUpperCase();
  const startMarker = 'const ' + upper + ' = {';
  const sIdx = cfg.indexOf(startMarker);
  if (sIdx === -1) { console.log('SKIP', slug, '- not found'); return false; }

  const braceStart = sIdx + startMarker.length - 1; // position of '{'
  const braceEnd = findClosingBrace(cfg, braceStart);
  if (braceEnd === -1) { console.log('SKIP', slug, '- no closing brace'); return false; }

  let block = cfg.substring(sIdx, braceEnd + 1);

  // 1) Update hero h1 (formato simple, primer match)
  block = block.replace(/(hero\s*:\s*\{[\s\S]*?h1\s*:\s*)'(?:[^'\\]|\\.)*'/m, "$1'" + escSQ(data.tagline_hero) + "'");

  // 2) Update hero deck
  block = block.replace(/(hero\s*:\s*\{[\s\S]*?deck\s*:\s*)'(?:[^'\\]|\\.)*'/m, "$1'" + escSQ(data.subtagline) + "'");

  // 3) Reemplazar thefts: find "thefts:" + bracket positions in block
  const theftsStart = block.indexOf('thefts');
  if (theftsStart !== -1) {
    const bracketOpen = block.indexOf('[', theftsStart);
    if (bracketOpen !== -1) {
      const bracketClose = findClosingBracket(block, bracketOpen);
      if (bracketClose !== -1) {
        const newItems = data.dolores.map(([icon, titulo, rob, fix]) =>
          `    {title:'${escSQ(icon + ' ' + titulo)}',\n     rob:'${escSQ(rob)}',\n     fix:'${escSQ(fix)}'}`
        ).join(',\n');
        block = block.slice(0, bracketOpen + 1) + '\n' + newItems + '\n  ' + block.slice(bracketClose);
      }
    }
  }

  // 4) Update first hero image URL
  block = block.replace(/(images\s*:\s*\{[\s\S]*?hero\s*:\s*)'[^']*'/m, "$1'" + data.imagenes[0] + "?w=1200&h=1600&fit=crop&q=85'");

  cfg = cfg.slice(0, sIdx) + block + cfg.slice(braceEnd + 1);
  console.log('OK', slug);
  return true;
}

for (const slug of Object.keys(PACK)) {
  patchBrand(slug, PACK[slug]);
}

fs.writeFileSync(cfgPath, cfg);

// Validar sintaxis
const vm = require('vm');
try {
  vm.runInThisContext(cfg);
  console.log('Syntax OK after patch');
} catch (e) {
  const ln = (e.stack || '').match(/evalmachine[^:]*:(\d+)/);
  console.log('SYNTAX ERROR at line', ln ? ln[1] : '?', '-', e.message);
  process.exit(1);
}
