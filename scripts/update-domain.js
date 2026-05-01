#!/usr/bin/env node
/**
 * update-domain.js
 * Replace canonical domain `volvix-pos.vercel.app` with `salvadorexoficial.com`
 * across the entire codebase.
 *
 * Rules:
 *   - Skips heavy/irrelevant dirs (node_modules, REPETIDOS, backups, etc.)
 *   - REPETIDOS/ is preserved untouched (legacy duplicates).
 *   - Case-insensitive search ("volvix-pos.vercel.app", "VOLVIX-POS.VERCEL.APP")
 *   - Replacement is exact-case `salvadorexoficial.com`
 *   - Dry-run by default. Pass --apply to write changes.
 *
 * Usage:
 *   node scripts/update-domain.js            # dry-run, prints summary
 *   node scripts/update-domain.js --apply    # writes changes
 *   node scripts/update-domain.js --apply --verbose
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const OLD_DOMAIN = 'volvix-pos.vercel.app';
const NEW_DOMAIN = 'salvadorexoficial.com';

const SKIP_DIRS = new Set([
  'node_modules', 'REPETIDOS', '.git', '_audit_tmp', 'backups',
  'tests', 'tests-e2e', 'test-results', '_baseline', 'live_status',
  'android', 'ios', 'electron', 'mobile-assets', 'volvix-zapier-app',
  'memory', 'kb', 'downloads', 'logos-demo', 'marketplace-assets',
]);

const ALLOWED_EXT = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.xml', '.md', '.txt', '.yaml', '.yml', '.css',
  '.template', '.production', '.example', '.svg', '.sh', '.bat',
  '.ps1', '.py',
]);

const SKIP_BASENAMES = new Set([
  'update-domain.js',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const oldRegex = new RegExp(OLD_DOMAIN.replace(/\./g, '\\.'), 'gi');

const stats = {
  filesScanned: 0,
  filesModified: 0,
  totalReplacements: 0,
  modifiedFiles: [],
};

function shouldSkipDir(name) {
  if (SKIP_DIRS.has(name)) return true;
  if (name.startsWith('.') && name !== '.env.production' && name !== '.env.production.template') return true;
  return false;
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (shouldSkipDir(e.name)) continue;
      walk(full);
    } else if (e.isFile()) {
      processFile(full, e.name);
    }
  }
}

function processFile(full, base) {
  if (SKIP_BASENAMES.has(base)) return;
  const ext = path.extname(base).toLowerCase();
  // Allow files starting with . (dotfiles like .env.production.template) by name
  const isDotEnv = base.startsWith('.env');
  if (!ALLOWED_EXT.has(ext) && !isDotEnv) return;

  let content;
  try {
    content = fs.readFileSync(full, 'utf8');
  } catch (_) { return; }

  stats.filesScanned++;

  // Quick reject
  if (!oldRegex.test(content)) {
    oldRegex.lastIndex = 0;
    return;
  }
  oldRegex.lastIndex = 0;

  const matches = content.match(oldRegex);
  const count = matches ? matches.length : 0;
  if (!count) return;

  const updated = content.replace(oldRegex, NEW_DOMAIN);

  stats.filesModified++;
  stats.totalReplacements += count;
  stats.modifiedFiles.push({ file: path.relative(ROOT, full), count });

  if (APPLY) {
    fs.writeFileSync(full, updated, 'utf8');
  }
  if (VERBOSE) {
    console.log(`  [${count}] ${path.relative(ROOT, full)}`);
  }
}

function main() {
  console.log(`update-domain.js`);
  console.log(`  ROOT:       ${ROOT}`);
  console.log(`  OLD:        ${OLD_DOMAIN}`);
  console.log(`  NEW:        ${NEW_DOMAIN}`);
  console.log(`  MODE:       ${APPLY ? 'APPLY (writing changes)' : 'DRY-RUN (no writes)'}`);
  console.log('');
  walk(ROOT);
  console.log('');
  console.log(`Files scanned:      ${stats.filesScanned}`);
  console.log(`Files with matches: ${stats.filesModified}`);
  console.log(`Total replacements: ${stats.totalReplacements}`);
  if (!APPLY) {
    console.log('');
    console.log('Run again with --apply to write changes.');
  }
  // Persist a summary log next to the script
  const logPath = path.join(ROOT, 'scripts', 'update-domain.last-run.json');
  try {
    fs.writeFileSync(logPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      apply: APPLY,
      old: OLD_DOMAIN,
      new: NEW_DOMAIN,
      ...stats,
    }, null, 2), 'utf8');
  } catch (_) {}
}

main();
