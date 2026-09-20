#!/usr/bin/env node
// =========================================================================
// scripts/check-paridad.js — guardia de paridad WEB / EXE / APK (sin dependencias)
//
// Regla de oro: un solo codigo en public/ para las 3 plataformas; solo cambia el puente
// de hardware (public/volvix-platform.js -> window.VolvixPlatform).
//
// Checks:
//   (a) ningun public/*.js (salvo volvix-platform.js) usa window.volvixElectron / Capacitor directo
//   (b) todo module.* usado (data-feature / VolvixFeatures.has|status / enforceFeature) esta en
//       volvix-feature-flags.js Y en paneldecontrol.html
//   (c) ids vlx-* creados dinamicamente llevan data-vlx-keep (el guardian de flotantes de
//       volvix-uplift-wiring.js oculta todo nodo nuevo con id vlx-* que no lo tenga)
//   (d) todos los <script> inline de salvadorex-pos.html parsean
//   (e) versiones: package.json es la fuente; android versionName/versionCode deben derivarse de ella
//
// Deuda previa: scripts/paridad-baseline.json (ratchet). Lo que esta en el baseline se reporta como
// DEUDA (no rompe); cualquier hallazgo NUEVO o que CREZCA rompe (exit 1). Para bajar la deuda:
//   node scripts/check-paridad.js --update-baseline   (solo la sesion integradora, tras corregir)
// Uso: node scripts/check-paridad.js [--verbose] [--update-baseline]
// =========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const BASELINE_FILE = path.join(__dirname, 'paridad-baseline.json');
const VERBOSE = process.argv.includes('--verbose');
const UPDATE = process.argv.includes('--update-baseline');
const POS_HTML = 'salvadorex-pos.html';

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

function walk(dir, exts, out) {
  out = out || [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(node_modules|vendor|libs?|\.git)$/i.test(e.name)) continue;
      walk(full, exts, out);
    } else if (exts.some((x) => e.name.endsWith(x)) && !/\.min\.js$|\.bak/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

// hallazgos: key -> { check, count, samples[] }
const found = new Map();
function add(check, key, sample, n) {
  let f = found.get(key);
  if (!f) { f = { check, count: 0, samples: [] }; found.set(key, f); }
  f.count += n || 1;
  if (f.samples.length < 3) f.samples.push(sample);
}

const jsFiles = walk(PUB, ['.js']);
const posText = read(path.join(PUB, POS_HTML));

// scripts inline (sin src, JS clasico) de salvadorex-pos.html
function inlineScripts(html) {
  const out = [];
  if (!html) return out;
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m; let n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const t = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    n++;
    if (t && !/^(text|application)\/(x-)?(java|ecma)script$/i.test(t)) continue; // json, templates, module...
    out.push({ n, code: m[2], line: lineOf(html, m.index + m[0].indexOf('>') + 1) });
  }
  return out;
}
const inlines = inlineScripts(posText);

// ---- (a) puente de plataforma ------------------------------------------------
const DIRECT = /\bvolvixElectron\b|\bCapacitor\b/g;
for (const f of jsFiles) {
  if (path.basename(f) === 'volvix-platform.js') continue;
  const t = read(f); if (!t) continue;
  const hits = t.match(DIRECT);
  if (hits) add('a', `a:${rel(f)}`, `${rel(f)} x${hits.length}`, hits.length);
}
for (const s of inlines) {
  const hits = s.code.match(DIRECT);
  if (hits) add('a', `a:${POS_HTML}#inline`, `${POS_HTML} inline #${s.n} (l.${s.line}) x${hits.length}`, hits.length);
}

// ---- (b) modulos on/off -------------------------------------------------------
const flagsText = read(path.join(PUB, 'volvix-feature-flags.js')) || '';
const panelText = read(path.join(PUB, 'paneldecontrol.html')) || '';
const modBlock = (() => {
  const i = panelText.indexOf('const MOD_LABELS');
  if (i < 0) return '';
  const s = panelText.indexOf('{', i); let d = 0;
  for (let j = s; j < panelText.length; j++) {
    if (panelText[j] === '{') d++;
    else if (panelText[j] === '}' && --d === 0) return panelText.slice(s, j + 1);
  }
  return '';
})();
const inFlags = (k) => new RegExp(`['"]module\\.${k}['"]`).test(flagsText);
const inPanel = (k) => new RegExp(`module\\.${k}\\b`).test(panelText) || new RegExp(`(^|[\\s,{])['"]?${k}['"]?\\s*:`).test(modBlock);

const USE_PATTERNS = [
  /data-feature\s*=\s*\\?["']module\.([a-z][a-z0-9_]*)/g,
  /\.(?:has|status|enabled)\(\s*\\?["']module\.([a-z][a-z0-9_]*)/g,
  /enforceFeature\(\s*\\?["'](?:module\.)?([a-z][a-z0-9_]*)/g,
  /['"]module\.([a-z][a-z0-9_]*)['"]/g, // cualquier literal 'module.x' (helpers propios, isOn, etc.)
];
const usedMods = new Map(); // clave -> primer archivo
const srcFiles = jsFiles.concat(walk(PUB, ['.html'])).concat([path.join(ROOT, 'api', 'index.js')]);
for (const f of srcFiles) {
  const bn = path.basename(f);
  if (bn === 'paneldecontrol.html' || bn === 'volvix-feature-flags.js' || bn === 'volvix-feature-flags-admin.html') continue;
  const t = read(f); if (!t) continue;
  for (const re of USE_PATTERNS) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(t))) if (!usedMods.has(m[1])) usedMods.set(m[1], rel(f));
  }
}
for (const [k, file] of usedMods) {
  if (!inFlags(k)) add('b', `b:module.${k}:volvix-feature-flags.js`, `module.${k} (usado en ${file}) falta en volvix-feature-flags.js`);
  if (!inPanel(k)) add('b', `b:module.${k}:paneldecontrol.html`, `module.${k} (usado en ${file}) falta en paneldecontrol.html`);
}

// ---- (c) ids vlx-* dinamicos sin data-vlx-keep --------------------------------
// Solo nodos raiz (el.id = 'vlx-..' / setAttribute('id','vlx-..')): el guardian solo revisa el nodo agregado,
// no sus hijos. Limite: raices creadas via innerHTML+firstChild no se detectan.
function checkVlx(text, label, baseLine) {
  const lines = text.split('\n');
  const re = /(?:\.id\s*=\s*|setAttribute\(\s*['"]id['"]\s*,\s*)['"](vlx-[\w-]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (/-(css|style|styles)$/.test(id)) continue;
    const li = lineOf(text, m.index) - 1;
    const win = lines.slice(Math.max(0, li - 4), li + 12).join('\n');
    if (/data-vlx-keep/.test(win)) continue;
    if (/createElement\(\s*['"](style|link|script)['"]\)|<style\b|<link\b|<script\b/.test(lines.slice(Math.max(0, li - 3), li + 1).join('\n'))) continue;
    add('c', `c:${label}:${id}`, `${label}:${(baseLine || 0) + li + 1} id ${id} sin data-vlx-keep`);
  }
}
for (const f of jsFiles) { if (path.basename(f) === 'volvix-uplift-wiring.js') continue; const t = read(f); if (t) checkVlx(t, rel(f)); }
for (const s of inlines) checkVlx(s.code, `${POS_HTML}#inline`, s.line - 1);

// ---- (d) <script> inline parsea -------------------------------------------------
if (posText === null) add('d', 'd:no-pos-html', `${POS_HTML} no existe`);
for (const s of inlines) {
  try { new vm.Script(s.code, { filename: `${POS_HTML}#inline${s.n}` }); }
  catch (e) { add('d', `d:${POS_HTML}#inline${s.n}`, `${POS_HTML} script inline #${s.n} (html l.${s.line}): ${e.message}`); }
}

// ---- (e) versiones alineadas ------------------------------------------------------
const pkg = (() => { try { return JSON.parse(read(path.join(ROOT, 'package.json'))); } catch (_) { return {}; } })();
// public/version.json es GENERADO (bump-version.js): fuente de verdad = package.json; no se compara.
const gradle = read(path.join(ROOT, 'android', 'app', 'build.gradle')) || '';
if (!pkg.version) add('e', 'e:package.json', 'package.json sin version');
else {
  const vn = (gradle.match(/versionName\s+["']([^"']+)["']/) || [])[1];
  const derived = /package\.json|VOLVIX_VERSION|APP_VERSION|VERSION_NAME|VERSION_CODE/.test(gradle);
  if (!derived && vn !== pkg.version) add('e', 'e:android/versionName', `android versionName=${vn} != package.json=${pkg.version}`);
  const vc = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
  if (!derived && vc === '1') add('e', 'e:android/versionCode', 'android versionCode fijo en 1 (no sube con cada release)');
}

// ---- baseline (ratchet) ---------------------------------------------------------
let baseline = {};
try { baseline = JSON.parse(read(BASELINE_FILE) || '{}'); } catch (_) {}

if (UPDATE) {
  const next = {};
  for (const [k, f] of found) next[k] = f.count;
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(next, Object.keys(next).sort(), 2) + '\n');
  console.log(`baseline actualizado: ${Object.keys(next).length} entradas -> ${rel(BASELINE_FILE)}`);
  process.exit(0);
}

const fails = []; const debt = []; const improved = [];
for (const [k, f] of found) {
  const allowed = baseline[k];
  if (allowed === undefined || f.count > allowed) fails.push({ k, f, allowed });
  else debt.push({ k, f });
}
for (const k of Object.keys(baseline)) {
  const f = found.get(k);
  if (!f || f.count < baseline[k]) improved.push(k);
}

const byCheck = (arr) => arr.reduce((o, x) => { o[x.f.check] = (o[x.f.check] || 0) + 1; return o; }, {});
console.log(`check-paridad: ${fails.length} NUEVOS/EMPEORADOS | ${debt.length} de deuda conocida ${JSON.stringify(byCheck(debt))} | ${improved.length} mejorados`);
console.log(`  modulos usados: ${usedMods.size} | scripts inline evaluados: ${inlines.length} | js escaneados: ${jsFiles.length}`);
for (const x of fails) {
  console.log(`FALLA [${x.f.check}] ${x.k}${x.allowed !== undefined ? ` (crecio ${x.allowed} -> ${x.f.count})` : ''}`);
  for (const s of x.f.samples) console.log(`     ${s}`);
}
if (VERBOSE) for (const x of debt) console.log(`deuda [${x.f.check}] ${x.k} x${x.f.count}`);
if (improved.length) console.log(`mejorado (baja el baseline con --update-baseline): ${improved.slice(0, 8).join(', ')}${improved.length > 8 ? ' ...' : ''}`);
process.exit(fails.length ? 1 : 0);
