#!/usr/bin/env node
/**
 * apply-ml-enrichment.js (V10.40)
 *
 * Lee los resultados de Mercado Libre obtenidos via Chrome MCP
 * (Downloads/ml-final-XXXX.json) y los aplica al ecosystem JSON.
 *
 * Estrategia: para cada uno de los 360 productos:
 *  - Si ML devolvió título coherente (compartir keyword ≥4 chars con el query): reemplazar
 *    imagen + precio con los valores de ML. MANTENER el nombre original del producto.
 *  - Si NO es coherente: mantener loremflickr + precio curado.
 *
 * Mantenemos el nombre español original porque ML devuelve títulos largos con marca/specs
 * (ej. "Martillo Uña Curva 16 Oz Mango Fibra De Vidrio") que no son ideales como nombre POS.
 * Pero la imagen real + precio real son mucho mejores que loremflickr.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const ML_PATH = process.env.ML_INPUT || path.join(process.env.TEMP || '/tmp', 'ml-final.json');

const ml = JSON.parse(fs.readFileSync(ML_PATH, 'utf8'));
const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));

// Flatten products del ecosystem para mapear índices con los de ML
const flat = [];
data.giros.forEach(g => {
  (g.productos_plantilla || []).forEach((p, i) => flat.push({ g, i, p }));
});

if (flat.length !== ml.length) {
  console.error('❌ Mismatch: ecosystem tiene', flat.length, '— ml tiene', ml.length);
  process.exit(1);
}

let applied = 0, skipped = 0;
const skippedSamples = [];

ml.forEach((mlItem, idx) => {
  const node = flat[idx];
  if (!mlItem || !node) return;
  if (mlItem.coherent && mlItem.t && mlItem.p && mlItem.m) {
    // Aplicar: reemplazar imagen + precio (MANTENER el nombre)
    node.p.imagen = mlItem.m;
    node.p.precio = mlItem.p;
    node.p.moneda = 'MXN';
    node.p.source = 'mercadolibre';
    node.p.ml_title = mlItem.t; // referencia
    applied++;
  } else {
    skipped++;
    if (skippedSamples.length < 10) {
      skippedSamples.push({
        giro: node.g.slug,
        nombre: node.p.nombre,
        ml_title: mlItem?.t || '(sin título)',
      });
    }
  }
});

// Metadata
data._meta.last_audit = new Date().toISOString();
data._meta.products_total = data.giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0);
data._meta.ml_enriched_count = applied;
data._meta.ml_skipped_count = skipped;
data._meta.curated_version = 'V10.40';

fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));

console.log('═══ APPLY ML ENRICHMENT (V10.40) ═══');
console.log('');
console.log('Total productos:', flat.length);
console.log('Enriquecidos con ML:', applied, '(' + Math.round(100 * applied / flat.length) + '%)');
console.log('Skipped (mantienen loremflickr):', skipped);
console.log('');
console.log('Muestra de skipped (top 10):');
skippedSamples.forEach(s => console.log(' ', s.giro.padEnd(20), '→', s.nombre.slice(0, 40).padEnd(40), '   ML returned:', s.ml_title.slice(0, 50)));
console.log('');
console.log('✅ Guardado en', ECO_PATH);
