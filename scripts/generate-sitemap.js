#!/usr/bin/env node
/**
 * generate-sitemap.js
 * Genera sitemap.xml escaneando *.html en root y public/.
 *
 * Reglas:
 *   - Excluye carpetas: REPETIDOS, internal, ios, tests, tests-e2e, test-results,
 *     _audit_tmp, node_modules, backups, _baseline, .audit, .baseline
 *   - <lastmod>    desde mtime del archivo
 *   - <changefreq> daily landings, weekly docs, monthly legal/cookies/aviso
 *   - <priority>   1.0 raíz, 0.9 landings tier 2, 0.8 POS, 0.7 docs, 0.5 resto, 0.3 legal
 *
 * Uso: node scripts/generate-sitemap.js [--base-url https://volvix.com]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = (() => {
  const arg = process.argv.find((a) => a.startsWith('--base-url='));
  if (arg) return arg.split('=')[1].replace(/\/$/, '');
  return 'https://salvadorexoficial.com';
})();

const SCAN_DIRS = [
  { dir: ROOT, urlPrefix: '' },
  { dir: path.join(ROOT, 'public'), urlPrefix: '' },
];

const EXCLUDE_DIRS = new Set([
  'REPETIDOS', 'internal', 'ios', 'tests', 'tests-e2e', 'test-results',
  '_audit_tmp', 'node_modules', 'backups', '.git', '.audit', '.baseline',
  'android', 'electron', 'mobile-assets', 'supabase', 'migrations',
]);

const EXCLUDE_FILES = new Set([
  '404.html',
]);

const TIER2_LANDINGS = new Set([
  'landing-restaurant.html', 'landing-barberia.html', 'landing-farmacia.html',
  'landing-abarrotes.html', 'landing-cafe.html', 'landing-cafeteria.html',
  'landing-estetica.html', 'landing-clinica-dental.html', 'landing-colegio.html',
  'landing-fitness.html', 'landing-gym.html', 'landing-gimnasio.html',
  'landing-taqueria.html', 'landing-pizzeria.html',
]);

const POS_FILES = new Set([
  'multipos-suite.html', 'pos.html', 'volvix-launcher.html',
  'volvix-hub-landing.html', 'marketplace.html',
]);

const LEGAL_FILES = new Set([
  'aviso-privacidad.html', 'terminos-condiciones.html', 'cookies-policy.html',
  'volvix-gdpr-portal.html',
]);

function isExcludedDir(name) {
  return EXCLUDE_DIRS.has(name) || name.startsWith('_') || name.startsWith('.');
}

function listHtmlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.html') && !EXCLUDE_FILES.has(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

function classify(filename) {
  const f = filename.toLowerCase();

  if (f === 'index.html') {
    return { changefreq: 'daily', priority: '1.0' };
  }
  if (POS_FILES.has(f)) {
    return { changefreq: 'weekly', priority: '0.8' };
  }
  if (TIER2_LANDINGS.has(f)) {
    return { changefreq: 'daily', priority: '0.9' };
  }
  if (f.startsWith('landing-') || f.startsWith('landing_')) {
    return { changefreq: 'weekly', priority: '0.7' };
  }
  if (f === 'docs.html' || f.startsWith('docs/') || f.includes('tutorial')) {
    return { changefreq: 'weekly', priority: '0.7' };
  }
  if (LEGAL_FILES.has(f)) {
    return { changefreq: 'monthly', priority: '0.3' };
  }
  return { changefreq: 'weekly', priority: '0.5' };
}

function fileToUrl(absPath) {
  let rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  if (rel.startsWith('public/')) rel = rel.slice('public/'.length);
  if (rel.toLowerCase() === 'index.html') return `${BASE_URL}/`;
  return `${BASE_URL}/${rel}`;
}

function isoLastMod(absPath) {
  try {
    const st = fs.statSync(absPath);
    return st.mtime.toISOString().slice(0, 10);
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function main() {
  const all = new Map();

  for (const { dir } of SCAN_DIRS) {
    if (isExcludedDir(path.basename(dir))) continue;
    for (const f of listHtmlFiles(dir)) {
      const url = fileToUrl(f);
      if (!all.has(url)) {
        all.set(url, {
          url,
          lastmod: isoLastMod(f),
          ...classify(path.basename(f)),
        });
      }
    }
  }

  const sorted = [...all.values()].sort((a, b) => {
    const pa = parseFloat(a.priority);
    const pb = parseFloat(b.priority);
    if (pa !== pb) return pb - pa;
    return a.url.localeCompare(b.url);
  });

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const e of sorted) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(e.url)}</loc>`);
    lines.push(`    <lastmod>${e.lastmod}</lastmod>`);
    lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    lines.push(`    <priority>${e.priority}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  lines.push('');

  const outPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`sitemap.xml generated: ${sorted.length} URLs -> ${outPath}`);
}

main();
