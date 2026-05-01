#!/usr/bin/env node
/**
 * scripts/optimize-html.js
 *
 * Minifica HTML inline, comprime espacios y reporta scripts inline grandes.
 * Uso:
 *   node scripts/optimize-html.js                 # dry-run, reporta sobre public/
 *   node scripts/optimize-html.js --write         # escribe los cambios
 *   node scripts/optimize-html.js --dir <dir>     # cambia directorio
 *   node scripts/optimize-html.js --threshold 10  # KB para flag inline scripts
 *
 * Sin dependencias. NO se ejecuta automaticamente; corre manualmente.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => args.indexOf(name) >= 0;
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.resolve(ROOT, argVal('--dir', 'public'));
const WRITE = flag('--write');
const SCRIPT_KB_THRESHOLD = parseFloat(argVal('--threshold', '10'));
const VERBOSE = flag('--verbose') || flag('-v');

function listHtml(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      out.push(...listHtml(full));
    } else if (e.isFile() && /\.html?$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

// Minificacion conservadora: NO toca scripts ni style ni textareas ni pre.
function minifyHtml(src) {
  const blocks = [];
  const placeholder = (i) => `__VOLVIX_BLOCK_${i}__`;

  // Preservar contenido sensible
  const preserveRe = /<(script|style|textarea|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let work = src.replace(preserveRe, (m) => {
    const idx = blocks.push(m) - 1;
    return placeholder(idx);
  });

  // Quitar comentarios HTML (excepto IE conditionals)
  work = work.replace(/<!--(?!\s*\[if)[\s\S]*?-->/g, '');

  // Colapsar whitespace entre tags
  work = work.replace(/>\s+</g, '><');

  // Colapsar runs de espacios/tabs/newlines a un solo espacio
  work = work.replace(/[ \t]+/g, ' ');
  work = work.replace(/\s*\n\s*/g, '\n');
  work = work.replace(/\n{2,}/g, '\n');

  // Trim por linea
  work = work.split('\n').map(l => l.trim()).filter(l => l.length).join('\n');

  // Restaurar bloques
  work = work.replace(/__VOLVIX_BLOCK_(\d+)__/g, (_, n) => blocks[parseInt(n, 10)] || '');

  return work;
}

function findLargeInlineScripts(src, file) {
  const findings = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, idx = 0;
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue; // externos
    const bytes = Buffer.byteLength(body, 'utf8');
    const kb = bytes / 1024;
    if (kb >= SCRIPT_KB_THRESHOLD) {
      findings.push({
        file,
        index: idx,
        kb: kb.toFixed(2),
        recommendation: `Extraer a archivo externo (e.g. /js/${path.basename(file, path.extname(file))}-inline-${idx}.js) y referenciar con <script src="..." defer>`,
      });
    }
    idx++;
  }
  return findings;
}

function pad(n, w) {
  let s = String(n);
  while (s.length < w) s = ' ' + s;
  return s;
}

function main() {
  console.log('volvix optimize-html');
  console.log('  dir       :', TARGET_DIR);
  console.log('  mode      :', WRITE ? 'WRITE' : 'dry-run');
  console.log('  script KB :', SCRIPT_KB_THRESHOLD);
  console.log('');

  const files = listHtml(TARGET_DIR);
  if (!files.length) {
    console.log('  (no HTML files encontrados)');
    return;
  }

  let totalIn = 0, totalOut = 0, changedCount = 0;
  const allFindings = [];

  for (const f of files) {
    let src;
    try {
      src = fs.readFileSync(f, 'utf8');
    } catch (e) {
      console.warn('  skip (read error):', f, e.message);
      continue;
    }

    const inBytes = Buffer.byteLength(src, 'utf8');
    const out = minifyHtml(src);
    const outBytes = Buffer.byteLength(out, 'utf8');
    const saved = inBytes - outBytes;
    const pct = inBytes > 0 ? ((saved / inBytes) * 100).toFixed(1) : '0.0';

    totalIn += inBytes;
    totalOut += outBytes;

    if (saved > 0) {
      changedCount++;
      if (VERBOSE) {
        console.log('  ' + path.relative(ROOT, f));
        console.log('    ' + pad(inBytes, 8) + ' -> ' + pad(outBytes, 8) + '  (' + pct + '% saved)');
      }
      if (WRITE) fs.writeFileSync(f, out, 'utf8');
    }

    const inline = findLargeInlineScripts(src, f);
    if (inline.length) allFindings.push(...inline);
  }

  console.log('');
  console.log('Resumen:');
  console.log('  archivos     :', files.length);
  console.log('  con cambios  :', changedCount);
  console.log('  bytes in     :', totalIn);
  console.log('  bytes out    :', totalOut);
  const totalSaved = totalIn - totalOut;
  const totalPct = totalIn > 0 ? ((totalSaved / totalIn) * 100).toFixed(1) : '0.0';
  console.log('  ahorrado     :', totalSaved + ' bytes (' + totalPct + '%)');
  console.log('  modo         :', WRITE ? 'ESCRITO' : 'dry-run (usa --write para aplicar)');

  if (allFindings.length) {
    console.log('');
    console.log('Inline scripts grandes (>= ' + SCRIPT_KB_THRESHOLD + ' KB):');
    for (const f of allFindings) {
      console.log('  - ' + path.relative(ROOT, f.file) + ' [#' + f.index + '] ' + f.kb + ' KB');
      console.log('    ' + f.recommendation);
    }
    console.log('');
    console.log('Total inline scripts grandes:', allFindings.length);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

module.exports = { minifyHtml, findLargeInlineScripts, listHtml };
