// Calcula el WebView/Chrome MINIMO que exige el codigo de public/ (sintaxis = piso duro; APIs = piso blando).
// Uso: node scripts/scan-webview-min.js [--json] [--all]   (por defecto: paginas del POS = salvadorex-pos.html + sus <script src> locales)
'use strict';
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', 'public');

// [id, tipo, chrome minimo, regex sobre codigo SIN comentarios ni cadenas]
const FEATURES = [
  ['optional-chaining ?.', 'sintaxis', 80, /\?\.(?![0-9])/g],
  ['nullish ??', 'sintaxis', 80, /\?\?(?!=)/g],
  ['logical-assign ??= ||= &&=', 'sintaxis', 85, /(\?\?|\|\||&&)=(?!=)/g],
  ['numeric-separator 1_000', 'sintaxis', 75, /\b\d+_\d+\b/g],
  ['private-field this.#x', 'sintaxis', 74, /\bthis\.#\w+/g],
  ['bigint literal 10n', 'sintaxis', 67, /\b\d+n\b/g],
  ['optional-catch catch {', 'sintaxis', 66, /\bcatch\s*\{/g],
  ['for-await', 'sintaxis', 63, /\bfor\s+await\b/g],
  ['object-spread {...x}', 'sintaxis', 60, /[{,]\s*\.\.\.[A-Za-z_$(\[]/g],
  ['String.replaceAll', 'api', 85, /\.replaceAll\(/g],
  ['Array/String .at()', 'api', 92, /\.at\(\s*-?\d+\s*\)/g],
  ['Object.hasOwn', 'api', 93, /\bObject\.hasOwn\(/g],
  ['structuredClone', 'api', 98, /\bstructuredClone\(/g],
  ['crypto.randomUUID', 'api', 92, /\brandomUUID\(/g],
  ['findLast/findLastIndex', 'api', 97, /\.findLast(Index)?\(/g],
  ['Promise.allSettled', 'api', 76, /\bPromise\.allSettled\(/g],
  ['String.matchAll', 'api', 73, /\.matchAll\(/g],
  ['globalThis', 'api', 71, /\bglobalThis\b/g],
  ['Array.flat/flatMap', 'api', 69, /\.flat(Map)?\(/g],
  ['AbortSignal.timeout', 'api', 103, /\bAbortSignal\.timeout\(/g],
  ['Intl.Segmenter/ListFormat/RelativeTimeFormat', 'api', 81, /\bIntl\.(Segmenter|ListFormat|RelativeTimeFormat)\b/g],
];

// Quita comentarios y CONTENIDO de cadenas/plantillas (deja los ${...} de las plantillas). Los regex literales no se tratan.
function strip(src) {
  let out = '', i = 0; const n = src.length; const tpl = [];   // pila de profundidad de llaves dentro de ${}
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") { const q = c; out += q; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; if (src[i] === '\n') break; i++; } out += q; i++; continue; }
    if (c === '`') { out += '`'; i++; for (;;) { if (i >= n) break; if (src[i] === '\\') { i += 2; continue; } if (src[i] === '`') { out += '`'; i++; break; } if (src[i] === '$' && src[i + 1] === '{') { out += '${'; i += 2; let depth = 1; while (i < n && depth) { const ch = src[i]; if (ch === '{') depth++; else if (ch === '}') depth--; if (depth) out += ch; i++; } out += '}'; continue; } i++; } continue; }
    out += c; i++;
  }
  return out;
}

function scriptsOfHtml(html) {
  const inline = [], srcs = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) {
    const a = m[1] || '', t = (a.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (t && !/^(text|application)\/(x-)?(java|ecma)script$/i.test(t)) continue;
    const s = a.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (s) srcs.push(s[1]); else if (m[2].trim()) inline.push({ name: 'inline@' + html.slice(0, m.index).split('\n').length, code: m[2] });
  }
  return { inline, srcs };
}

const units = [];   // {name, code}
if (process.argv.includes('--all')) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|downloads|\.git/.test(p)) walk(p); } else if (/\.js$/.test(e.name)) units.push({ name: path.relative(PUB, p), code: fs.readFileSync(p, 'utf8') }); });
  walk(PUB);
} else {
  const html = fs.readFileSync(path.join(PUB, 'salvadorex-pos.html'), 'latin1');
  const { inline, srcs } = scriptsOfHtml(html);
  inline.forEach((u) => units.push({ name: 'salvadorex-pos.html ' + u.name, code: u.code }));
  srcs.filter((s) => !/^https?:|^\/\//i.test(s)).forEach((s) => { const p = path.join(PUB, s.split('?')[0].replace(/^\//, '')); if (fs.existsSync(p)) units.push({ name: path.relative(PUB, p), code: fs.readFileSync(p, 'utf8') }); });
}

const res = FEATURES.map(([id, kind, chrome]) => ({ id, kind, chrome, count: 0, files: {} }));
units.forEach((u) => {
  const code = strip(u.code);
  FEATURES.forEach(([, , , re], k) => { const hits = code.match(re); if (hits) { res[k].count += hits.length; res[k].files[u.name] = (res[k].files[u.name] || 0) + hits.length; } });
});
const used = res.filter((r) => r.count);
const floorSyntax = Math.max(0, ...used.filter((r) => r.kind === 'sintaxis').map((r) => r.chrome));
const floorApi = Math.max(0, ...used.filter((r) => r.kind === 'api').map((r) => r.chrome));
if (process.argv.includes('--json')) { console.log(JSON.stringify({ units: units.length, floorSyntax, floorApi, used }, null, 1)); process.exit(0); }
console.log(`Archivos escaneados: ${units.length}`);
used.sort((a, b) => b.chrome - a.chrome).forEach((r) => {
  const top = Object.entries(r.files).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, c]) => `${f}(${c})`).join(', ');
  console.log(`[${r.kind.padEnd(8)}] Chrome>=${String(r.chrome).padEnd(3)} ${r.id.padEnd(32)} x${String(r.count).padEnd(5)} ${top}`);
});
console.log(`PISO DURO (sintaxis) = Chrome/WebView ${floorSyntax}` + `  |  piso blando (APIs usadas) = ${floorApi}`);
