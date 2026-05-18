#!/usr/bin/env node
/**
 * merge-patches.js
 * ───────────────────────────────────────────────────────────────────
 * Combina los 5 patches generados en Wave 1 en un solo archivo
 * generate-system-map.v2.js.
 *
 * Estrategia: lee el scanner original, agrega los snippets de cada
 * parche en su sección correspondiente, y escribe el resultado.
 *
 * Como cada parche genera UN diff.js separado con instrucciones
 * claras, este script las ensambla.
 *
 * Uso: node scripts/merge-patches.js
 *
 * Salida: scripts/generate-system-map.v2.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ORIG = path.join(ROOT, 'scripts', 'generate-system-map.js');
const OUT = path.join(ROOT, 'scripts', 'generate-system-map.v2.js');
const PATCHES_DIR = path.join(ROOT, 'scripts', '_patches');

function main() {
  if (!fs.existsSync(ORIG)) {
    console.error('✗ scripts/generate-system-map.js no encontrado');
    process.exit(1);
  }

  if (!fs.existsSync(PATCHES_DIR)) {
    console.error('✗ scripts/_patches/ no encontrado. Wave 1 no completada.');
    process.exit(1);
  }

  let original = fs.readFileSync(ORIG, 'utf8');

  // Marcador del top del archivo para sumarle un comentario
  const banner = `// ═══════════════════════════════════════════════════════════════════
// generate-system-map.v2.js — generado por blitz, ${new Date().toISOString()}
// Incluye 5 parches: botón→handler, screen→endpoint, roles, realtime, window vars.
// Versión original conservada en generate-system-map.js
// ═══════════════════════════════════════════════════════════════════
`;

  // PARCHE 1: reemplazar el bloque de buttons
  const patch1 = readPatchSnippet(1, 'PARCHE');
  if (patch1) {
    // Buscar el bloque actual de buttons en el original
    const buttonsStart = original.indexOf('  // 4. BUTTONS');
    const buttonsEnd = original.indexOf('  // 5. WINDOW FUNCTIONS');
    if (buttonsStart !== -1 && buttonsEnd !== -1) {
      original = original.slice(0, buttonsStart) +
                 '  // 4. BUTTONS (mejorado por PATCH 1)\n' +
                 indent(patch1, '  ') + '\n\n' +
                 original.slice(buttonsEnd);
      console.log('✓ Patch 1 (buttons) aplicado');
    } else {
      console.warn('⚠ No se encontró el bloque de buttons en el original');
    }
  }

  // PARCHE 1 — RELACIONES: agregar antes del fs.writeFileSync(OUT_JSON, ...)
  const patch1rel = readPatchSnippet(1, 'PARCHE RELACIONES');
  if (patch1rel) {
    original = injectBeforeMarker(original,
      'fs.writeFileSync(OUT_JSON',
      '// PATCH 1 — RELACIONES\n' + patch1rel + '\n\n');
    console.log('✓ Patch 1 relaciones aplicado');
  }

  // PARCHES 2-5: cada uno agrega bloques en scanFile() y/o en relaciones
  for (let i = 2; i <= 5; i++) {
    const ps = readPatchSnippet(i, 'PARCHE');
    if (ps) {
      // Insertar dentro de scanFile() antes del `return {`
      original = injectInScanFile(original, ps, i);
      console.log(`✓ Patch ${i} aplicado en scanFile`);
    }
    const psrel = readPatchSnippet(i, 'PARCHE RELACIONES');
    if (psrel) {
      original = injectBeforeMarker(original,
        'fs.writeFileSync(OUT_JSON',
        `// PATCH ${i} — RELACIONES\n` + psrel + '\n\n');
      console.log(`✓ Patch ${i} relaciones aplicado`);
    }
  }

  fs.writeFileSync(OUT, banner + original);
  console.log('');
  console.log('✓ Archivo merged escrito en:', OUT);
  console.log('  Tamaño:', (fs.statSync(OUT).size / 1024).toFixed(1), 'KB');
  console.log('');
  console.log('Corre: node scripts/generate-system-map.v2.js');
}

function readPatchSnippet(n, marker) {
  const f = path.join(PATCHES_DIR, `patch-${n}.diff.js`);
  if (!fs.existsSync(f)) {
    console.warn(`  ⚠ patch-${n}.diff.js no encontrado (skip)`);
    return null;
  }
  const content = fs.readFileSync(f, 'utf8');
  // Extraer entre los marcadores --- INICIO <marker> --- y --- FIN <marker> ---
  const re = new RegExp(`--- INICIO ${marker} ---\\s*([\\s\\S]*?)\\s*--- FIN ${marker} ---`);
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

function injectInScanFile(text, snippet, patchN) {
  // Busca el return final dentro de scanFile()
  const marker = '  return {\n    file:';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    console.warn(`  ⚠ No se encontró return de scanFile para inyectar patch ${patchN}`);
    return text;
  }
  return text.slice(0, idx) +
    `  // PATCH ${patchN}\n` +
    indent(snippet, '  ') + '\n\n' +
    text.slice(idx);
}

function injectBeforeMarker(text, marker, snippet) {
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return text.slice(0, idx) + snippet + text.slice(idx);
}

function indent(s, prefix) {
  return s.split('\n').map(l => l ? prefix + l : l).join('\n');
}

main();
