#!/usr/bin/env node
/**
 * v2: Find ALL tr templates with <td> emitters, then for each, look BACK
 * up to 6000 chars for the most recent #*-body / *-tbody reference.
 */
const fs = require('fs');
const path = require('path');

const files = [
  'public/salvadorex-pos.html',
  'public/volvix-pos-wiring.js',
];

// thead column counts (from main HTML)
const headMap = {};
const html = fs.readFileSync('public/salvadorex-pos.html', 'utf8');
const tbodyRe = /<tbody\s+id="([^"]+)"/g;
let m;
while ((m = tbodyRe.exec(html)) !== null) {
  const id = m[1];
  const ctx = html.slice(Math.max(0, m.index - 4000), m.index);
  const heads = [...ctx.matchAll(/<thead[^>]*>([\s\S]*?)<\/thead>/g)];
  if (!heads.length) continue;
  const last = heads[heads.length - 1][1];
  const ths = (last.match(/<th[\s>]/g) || []).length;
  headMap[id] = ths;
}

const renderers = {};

// Find all tr...</tr> template strings with multiple <td> in JS code (skip HTML body templates)
files.forEach((f) => {
  const txt = fs.readFileSync(f, 'utf8');
  // Patterns to skip: tbody declarations (static HTML inside body)
  // We focus on JS template literals: `<tr>...<td>...</tr>`
  const trRe = /(?:`|"|')\s*(<tr[^>]*>[\s\S]{0,5000}?<\/tr>)/g;
  let r;
  while ((r = trRe.exec(txt)) !== null) {
    const tr = r[1];
    const tds = (tr.match(/<td[\s>]/g) || []).length;
    if (tds < 2) continue; // skip placeholders / single-cell

    // Look back up to 6000 chars for nearest body reference
    const window = txt.slice(Math.max(0, r.index - 6000), r.index);
    const bodyRefs = [...window.matchAll(/(?:["'#`]|getElementById\(['"`])([a-zA-Z0-9_-]+(?:-body|-tbody|-grid))['"`]?\)?/g)];
    if (!bodyRefs.length) continue;
    const lastRef = bodyRefs[bodyRefs.length - 1][1];
    if (!(lastRef in headMap)) continue;
    const lineNo = txt.slice(0, r.index).split('\n').length;
    if (!renderers[lastRef]) renderers[lastRef] = [];
    renderers[lastRef].push({ file: path.basename(f), line: lineNo, td: tds });
  }
});

console.log('| TBody ID | THEAD cols | TD renders | Status |');
console.log('|---|---:|---|---|');
const issues = [];
Object.keys(headMap).sort().forEach((id) => {
  const head = headMap[id];
  const rs = renderers[id] || [];
  if (!rs.length) {
    console.log(`| ${id} | ${head} | (sin renderer JS detectado) | -- |`);
    return;
  }
  // Dedup by line
  const seen = {};
  const uniq = rs.filter((r) => {
    const k = r.file + ':' + r.line;
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
  const counts = [...new Set(uniq.map((r) => r.td))];
  const mismatch = counts.some((c) => c !== head);
  const status = mismatch ? 'MISMATCH' : 'OK';
  if (mismatch) {
    issues.push({ id, head, counts, refs: uniq });
  }
  console.log(`| ${id} | ${head} | ${uniq.map((r) => `${r.td}(${r.file}:${r.line})`).join(', ')} | ${status} |`);
});

if (issues.length) {
  console.log('\n\nTABLAS CON MISMATCH:');
  issues.forEach((i) => {
    console.log(`\n* ${i.id}: thead=${i.head}, renderers emiten ${i.counts.join('/')} <td>`);
    i.refs.forEach((r) => console.log(`    ${r.file}:${r.line}  (${r.td} <td>)`));
  });
} else {
  console.log('\nSin descuadres detectados.');
}
