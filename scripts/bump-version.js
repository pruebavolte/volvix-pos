#!/usr/bin/env node
// =========================================================================
// scripts/bump-version.js
// Genera public/version.json con la version actual del proyecto basada en
// git: { major: 1, minor: 0, patch: <count_de_commits>, commit: <sha>, date: <ISO> }.
//
// Se ejecuta en 3 momentos:
//   1) Pre-commit hook (.git/hooks/pre-commit) — antes de cada commit local
//   2) `npm run build` — Vercel lo ejecuta automaticamente al desplegar
//   3) Manual: `node scripts/bump-version.js` para regenerar a mano
// =========================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'version.json');
const PKG = path.join(ROOT, 'package.json');

function git(cmd, fallback = '') {
  try { return execSync('git ' + cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (_) { return fallback; }
}

// Versionado estilo SemVer: 1.0.<patch>
// Major / Minor permanecen fijos (manuales). Patch = numero de commits en main.
const MAJOR = 1;
const MINOR = 0;

// Cuenta commits + 1 si estamos en pre-commit (el commit aun no existe).
// La env var IS_PRECOMMIT la setea el hook.
const isPreCommit = process.env.IS_PRECOMMIT === '1';
const baseCount = parseInt(git('rev-list --count HEAD', '0'), 10) || 0;
const patch = baseCount + (isPreCommit ? 1 : 0);
const version = `${MAJOR}.${MINOR}.${patch}`;

// SHA del commit (para debug/soporte). En pre-commit no existe aun el SHA del nuevo
// commit, asi que usamos el del HEAD actual + sufijo.
const commit = git('rev-parse --short HEAD', 'unknown');
const date = new Date().toISOString();
const branch = git('rev-parse --abbrev-ref HEAD', 'main');

const data = {
  version,
  major: MAJOR,
  minor: MINOR,
  patch,
  commit,
  branch,
  date,
  built_at: date,
};

// Escribir version.json
try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch (_) {}
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

// Actualizar package.json para mantener consistencia (no forzamos a commitear esto)
try {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }
} catch (e) { /* package.json es opcional */ }

console.log(`[bump-version] v${version} · ${commit} · ${branch} → ${path.relative(ROOT, OUT)}`);
