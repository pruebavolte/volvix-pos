#!/usr/bin/env node
/**
 * landings-inventory.js
 *
 * Inventario EXHAUSTIVO de TODOS los HTMLs del proyecto.
 * Genera: .audit/LANDINGS-INVENTORY.md (humano) + .audit/landings-inventory.json (machine)
 *
 * Categoriza:
 *  - Por carpeta (path exacto)
 *  - Por tipo (landing-giro, landing-producto, funcional, blog, tutorial, audit, etc.)
 *  - Detecta duplicados entre carpetas
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const all = execSync(
  'find . -name "*.html" -not -path "*/node_modules/*" -not -path "*/.git/*"',
  { cwd: ROOT, encoding: 'utf8' }
).split('\n').filter(Boolean).map(p => p.replace(/^\.\//, ''));

// Páginas funcionales conocidas (NO son landings)
const FUNCIONALES = new Set([
  'index','login','registro','marketplace','marketplace_v2','marketplace-final',
  'pos','pos-inventario','pos-corte','pos-clientes','pos-reportes','pos-config',
  'paneldecontrol','salvadorex-pos','volvix_owner_panel_v7','volvix_owner_panel_v8',
  'volvix-launcher','volvix-admin-saas','volvix-user-management','volvix-vendor-portal',
  'multipos_suite_v3','customer-portal','etiqueta_designer','404','test',
  'cargando-pago','volvix-app','volvix-saas-billing','manifest',
  'INDICE-TUTORIALES','TUTORIAL-REGISTRO-USUARIOS','MATRIZ_PRUEBAS_LOCAL_v1_backup',
  'admin-monitoring','aviso-privacidad','terminos','contacto',
  'cargando','about','team','demo','pricing','features','help',
  'verify-email','remote-viewer','app','blog',
]);

// Clasificar
function classify(filepath) {
  const name = path.basename(filepath, '.html').toLowerCase();
  if (filepath.includes('REPETIDOS/')) return 'repetido_backup';
  if (filepath.startsWith('android/')) return 'android_copy';
  if (filepath.startsWith('.claude/worktrees/')) return 'worktree_copy';
  if (filepath.startsWith('src/')) return 'src_legacy';
  if (filepath.includes('/blog/')) return 'blog';
  if (filepath.includes('/tutorials/')) return 'tutorial';
  if (filepath.includes('/docs/')) return 'docs';
  if (filepath.startsWith('.audit/')) return 'audit_temporal';
  if (filepath.startsWith('tests/')) return 'test';
  if (filepath.startsWith('templates/')) return 'template';
  if (filepath.startsWith('dist-electron/')) return 'electron_build';
  if (filepath.includes('test-local')) return 'test_local';
  if (filepath.includes('/internal/')) return 'internal';
  if (name.startsWith('landing-')) return 'landing_giro';
  if (FUNCIONALES.has(name)) return 'funcional';
  // Resto = landing de producto (los nombres tipo accesorio.html, navaja.html, etc)
  return 'landing_producto';
}

// Agrupar
const byFolder = {};
const byCategory = {};
const byBasename = {};

all.forEach(p => {
  const folder = path.dirname(p) + '/';
  const cat = classify(p);
  const base = path.basename(p, '.html');
  byFolder[folder] = byFolder[folder] || { count: 0, files: [], categories: {} };
  byFolder[folder].count++;
  byFolder[folder].files.push(p);
  byFolder[folder].categories[cat] = (byFolder[folder].categories[cat] || 0) + 1;
  byCategory[cat] = (byCategory[cat] || []).concat(p);
  byBasename[base] = (byBasename[base] || []).concat(p);
});

// Detectar duplicados (mismo basename en múltiples carpetas)
const duplicates = Object.entries(byBasename)
  .filter(([k, v]) => v.length > 1)
  .map(([k, v]) => ({ name: k + '.html', copies: v.length, locations: v }))
  .sort((a, b) => b.copies - a.copies);

// Solo carpetas activas en producción (excluir worktrees, REPETIDOS, src/, android/)
const productionFolders = Object.entries(byFolder)
  .filter(([k]) => !k.includes('REPETIDOS/') &&
                   !k.startsWith('.claude/') &&
                   !k.startsWith('android/') &&
                   !k.startsWith('src/') &&
                   !k.startsWith('.audit/') &&
                   !k.includes('dist-electron') &&
                   !k.startsWith('tests/') &&
                   !k.includes('test-local'));

// Escribir JSON machine-readable
fs.mkdirSync(path.join(ROOT, '.audit'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, '.audit', 'landings-inventory.json'),
  JSON.stringify({
    meta: {
      fecha: new Date().toISOString(),
      total_htmls: all.length,
      total_carpetas: Object.keys(byFolder).length,
      total_unique_basenames: Object.keys(byBasename).length,
      total_duplicates: duplicates.length,
    },
    by_folder: byFolder,
    by_category_counts: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length])
    ),
    by_category_samples: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.slice(0, 10)])
    ),
    top_duplicates: duplicates.slice(0, 30),
  }, null, 2)
);

// Escribir Markdown human-readable
const CAT_DESCS = [
  ['landing_giro', 'landing-X.html giros canónicos', 'public/'],
  ['landing_producto', 'X.html productos individuales', 'public/'],
  ['funcional', 'login/pos/panel páginas funcionales', 'public/'],
  ['blog', 'artículos blog', 'public/blog/'],
  ['tutorial', 'guías tutorials', 'public/tutorials/'],
  ['docs', 'documentación', 'public/docs/'],
  ['template', 'templates email', 'templates/email/'],
  ['android_copy', 'copia para Android APK', 'android/.../public/'],
  ['worktree_copy', 'copia worktree sesión actual', '.claude/worktrees/.../'],
  ['src_legacy', 'copia legacy src/', 'src/'],
  ['repetido_backup', 'archivos REPETIDOS detectados', 'REPETIDOS/'],
  ['audit_temporal', 'auditorías', '.audit/'],
  ['electron_build', 'build de electron', 'dist-electron/'],
  ['internal', 'internos', 'internal/'],
  ['test', 'tests', 'tests/'],
  ['test_local', 'test local', 'test-local-*/'],
];
const lines = [
  '# Inventario de HTMLs / Landings — Volvix POS',
  '',
  '**Fecha**: ' + new Date().toISOString(),
  '**Total HTMLs en repo**: ' + all.length,
  '**Total carpetas con HTMLs**: ' + Object.keys(byFolder).length,
  '**Basenames únicos**: ' + Object.keys(byBasename).length,
  '**Duplicados cross-folder**: ' + duplicates.length,
  '',
  '---',
  '',
  '## 📊 Resumen por categoría (todo el repo)',
  '',
  '| Categoría | Cantidad | Ubicación típica |',
  '|---|---|---|',
  ...CAT_DESCS.map(([cat, desc, loc]) =>
    '| ' + cat + ' | ' + (byCategory[cat] || []).length + ' | ' + loc + ' |'
  ),
  '',
  '---',
  '',
  '## 🎯 LANDINGS ACTIVAS EN PRODUCCIÓN (lo que se sirve en systeminternational.app)',
  '',
];

productionFolders.sort((a, b) => b[1].count - a[1].count).forEach(([folder, info]) => {
  lines.push(`### \`${folder}\``);
  lines.push(`**Total**: ${info.count} HTMLs`);
  lines.push('');
  lines.push('| Categoría | Cantidad |');
  lines.push('|---|---|');
  Object.entries(info.categories).forEach(([cat, n]) => {
    lines.push(`| ${cat} | ${n} |`);
  });
  lines.push('');
  // Sample primeros 10 archivos
  lines.push('**Sample (primeros 10):**');
  lines.push('```');
  info.files.slice(0, 10).forEach(f => lines.push(path.basename(f)));
  lines.push('```');
  lines.push('');
});

lines.push('---');
lines.push('');
lines.push('## 📁 Carpetas NO en producción (backups, copias, audits)');
lines.push('');
const nonProd = Object.entries(byFolder).filter(([k]) =>
  k.includes('REPETIDOS/') ||
  k.startsWith('.claude/') ||
  k.startsWith('android/') ||
  k.startsWith('src/') ||
  k.startsWith('.audit/') ||
  k.includes('dist-electron') ||
  k.startsWith('tests/') ||
  k.includes('test-local')
).sort((a, b) => b[1].count - a[1].count);

lines.push('| Carpeta | Count | Propósito |');
lines.push('|---|---|---|');
nonProd.forEach(([f, info]) => {
  let proposito = '?';
  if (f.startsWith('android/')) proposito = '📱 Copia para Android APK';
  else if (f.startsWith('.claude/worktrees/')) proposito = '🌿 Worktree sesión actual';
  else if (f.includes('REPETIDOS/')) proposito = '🗂️ Archivos duplicados detectados (limpieza pendiente)';
  else if (f.startsWith('src/')) proposito = '📂 Carpeta legacy (anterior a /public)';
  else if (f.startsWith('.audit/')) proposito = '🔍 Auditorías históricas';
  else if (f.includes('dist-electron')) proposito = '🖥️ Build Electron Windows';
  else if (f.startsWith('tests/')) proposito = '🧪 Reportes Playwright';
  else if (f.includes('test-local')) proposito = '🧪 Tests locales';
  lines.push(`| \`${f}\` | ${info.count} | ${proposito} |`);
});

lines.push('');
lines.push('---');
lines.push('');
lines.push(`## 🔁 Top 30 archivos DUPLICADOS (mismo nombre en N carpetas)`);
lines.push('');
lines.push('| Archivo | Copias | Ubicaciones |');
lines.push('|---|---|---|');
duplicates.slice(0, 30).forEach(d => {
  lines.push(`| \`${d.name}\` | ${d.copies} | ${d.locations.map(l => '`'+l.slice(0, 60)+'`').join(' / ')} |`);
});

fs.writeFileSync(
  path.join(ROOT, '.audit', 'LANDINGS-INVENTORY.md'),
  lines.join('\n')
);

console.log('═══ INVENTARIO LANDINGS COMPLETO ═══');
console.log('');
console.log('Total HTMLs en repo:', all.length);
console.log('Total carpetas:', Object.keys(byFolder).length);
console.log('Basenames únicos:', Object.keys(byBasename).length);
console.log('Duplicados cross-folder:', duplicates.length);
console.log('');
console.log('Por categoría:');
Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length).forEach(([cat, list]) =>
  console.log('  ' + cat.padEnd(20) + ' = ' + list.length)
);
console.log('');
console.log('✅ Reportes guardados:');
console.log('   .audit/LANDINGS-INVENTORY.md (humano)');
console.log('   .audit/landings-inventory.json (machine)');
