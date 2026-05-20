#!/usr/bin/env node
/**
 * cat-fase1-detect-junk.js — CAT FASE 1
 *
 * Detección heurística (sin LLM) de:
 *   1) Slugs basura por regex (test_*, CamelCase pegado, typos)
 *   2) Duplicados por fuzzy match (token_set_ratio ≥ 80)
 *   3) Giros clonados por fingerprint MD5 de productos
 *
 * Output: 3 archivos en .audit/cat-fase1/ para review humano.
 * NO modifica nada.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const OUT_DIR = path.join(__dirname, '..', '.audit', 'cat-fase1');
fs.mkdirSync(OUT_DIR, { recursive: true });

const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));
const giros = data.giros;

// ──────────────────────────────────────────────────────────────────────
// 1.1 — DETECCIÓN DE BASURA POR REGEX
// ──────────────────────────────────────────────────────────────────────
const PATRONES_BASURA = [
  { re: /test/i, motivo: 'contiene "test"' },
  { re: /lovable/i, motivo: 'residuo de Lovable IDE' },
  { re: /pro$/i, motivo: 'sufijo "Pro" inventado por IA (BarberPro, CompuPro)' },
  { re: /(deliciosas|verde|deluxe|mx|express|plus|chic|fresh)$/i, motivo: 'sufijo marca inventada' },
  { re: /^[A-Z][a-z]+[A-Z]/, motivo: 'CamelCase pegado (AlmoiadasDeliciosas)' },
  { re: /kavanderia|almoiadas|pesacado|caobijas|pinatas|panales|tuallas|panimas/i, motivo: 'typo conocido' },
  { re: /test\d+/i, motivo: 'test con número' },
  { re: /etcetera/i, motivo: 'frase larga generada por LLM' },
  { re: /^.{60,}$/, motivo: 'nombre absurdamente largo (>60 chars)' },
  { re: /^techco$/i, motivo: 'placeholder nombre genérico' },
  { re: /^generico$/i, motivo: 'literalmente "generico"' },
  { re: /^otro_tipo/i, motivo: 'placeholder catch-all' },
];

const basura = [];
giros.forEach(g => {
  const checks = PATRONES_BASURA.filter(p => p.re.test(g.slug) || p.re.test(g.name || ''));
  if (checks.length > 0) {
    basura.push({
      slug: g.slug,
      nombre: g.name || g.slug,
      motivos: checks.map(c => c.motivo),
      productos_count: (g.productos_plantilla || []).length,
      parent: g._parent || null,
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 1.2 — DUPLICADOS POR FUZZY MATCH (sin librería externa)
// Implementación simple: Levenshtein normalizado
// ──────────────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i-1] === b[j-1] ? prev : Math.min(prev, dp[j], dp[j-1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}
function tokenSetRatio(a, b) {
  const setA = new Set(a.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  const inter = [...setA].filter(x => setB.has(x)).length;
  const union = setA.size + setB.size - inter;
  return Math.round(100 * inter / union);
}

const duplicados = [];
const seen = new Set();
for (let i = 0; i < giros.length; i++) {
  if (seen.has(giros[i].slug)) continue;
  const grupo = [giros[i].slug];
  for (let j = i + 1; j < giros.length; j++) {
    if (seen.has(giros[j].slug)) continue;
    const ratio = tokenSetRatio(giros[i].name || giros[i].slug, giros[j].name || giros[j].slug);
    if (ratio >= 60) {
      grupo.push(giros[j].slug);
      seen.add(giros[j].slug);
    }
  }
  if (grupo.length > 1) {
    duplicados.push({
      canonico_propuesto: grupo[0],
      variantes: grupo.slice(1),
      total: grupo.length,
    });
  }
  seen.add(giros[i].slug);
}

// ──────────────────────────────────────────────────────────────────────
// 1.3 — FINGERPRINTS DE PRODUCTOS (detecta giros clonados)
// ──────────────────────────────────────────────────────────────────────
function fingerprint(productos) {
  // Hash MD5 de la concatenación ordenada de nombres
  const nombres = (productos || []).map(p => (p.nombre || '').toLowerCase().trim()).sort().join('|');
  return crypto.createHash('md5').update(nombres).digest('hex');
}

const byFp = {};
giros.forEach(g => {
  const fp = fingerprint(g.productos_plantilla);
  byFp[fp] = byFp[fp] || [];
  byFp[fp].push({ slug: g.slug, name: g.name, parent: g._parent });
});

const clones = Object.entries(byFp)
  .filter(([fp, list]) => list.length > 1)
  .map(([fp, list]) => ({
    fingerprint: fp.slice(0, 12) + '...',
    giros_identicos: list.length,
    miembros: list.map(g => g.slug),
    productos_compartidos: (giros.find(g => g.slug === list[0].slug)?.productos_plantilla || []).slice(0, 3).map(p => p.nombre),
  }))
  .sort((a, b) => b.giros_identicos - a.giros_identicos);

// ──────────────────────────────────────────────────────────────────────
// 1.4 — IMÁGENES DUPLICADAS POR URL (cross-giros)
// ──────────────────────────────────────────────────────────────────────
const imgsByGiro = {};
giros.forEach(g => {
  (g.productos_plantilla || []).forEach(p => {
    if (!p.imagen) return;
    imgsByGiro[p.imagen] = imgsByGiro[p.imagen] || [];
    imgsByGiro[p.imagen].push(g.slug);
  });
});
const imagenesCompartidas = Object.entries(imgsByGiro)
  .filter(([url, list]) => new Set(list).size > 1) // misma img en >1 giro distinto
  .map(([url, list]) => ({ url: url.slice(0, 80), giros: [...new Set(list)] }))
  .slice(0, 20);

// ──────────────────────────────────────────────────────────────────────
// REPORTE
// ──────────────────────────────────────────────────────────────────────
const reporte = {
  meta: {
    fecha: new Date().toISOString(),
    total_giros: giros.length,
    total_productos: giros.reduce((s, g) => s + (g.productos_plantilla || []).length, 0),
  },
  resumen: {
    giros_con_basura: basura.length,
    grupos_duplicados: duplicados.length,
    fingerprints_clones: clones.length,
    giros_total_clones: clones.reduce((s, c) => s + c.giros_identicos, 0),
    imagenes_compartidas_cross_giros: imagenesCompartidas.length,
  },
  basura,
  duplicados,
  clones,
  imagenes_compartidas_cross_giros: imagenesCompartidas,
};

fs.writeFileSync(path.join(OUT_DIR, 'reporte-fase1.json'), JSON.stringify(reporte, null, 2));

// CSV de basura para review fácil
const csvBasura = ['slug,nombre,parent,productos_count,motivos'];
basura.forEach(b => csvBasura.push([
  b.slug, JSON.stringify(b.nombre), b.parent || '', b.productos_count, JSON.stringify(b.motivos.join('; '))
].join(',')));
fs.writeFileSync(path.join(OUT_DIR, 'basura.csv'), csvBasura.join('\n'));

// CSV de duplicados
const csvDup = ['canonico_propuesto,variantes,total'];
duplicados.forEach(d => csvDup.push([
  d.canonico_propuesto, JSON.stringify(d.variantes.join(';')), d.total
].join(',')));
fs.writeFileSync(path.join(OUT_DIR, 'duplicados.csv'), csvDup.join('\n'));

console.log('═══ CAT-FASE-1 ═══');
console.log('Total giros:', reporte.meta.total_giros);
console.log('Total productos:', reporte.meta.total_productos);
console.log('');
console.log('🚨 Giros con basura (regex):', reporte.resumen.giros_con_basura);
console.log('🔁 Grupos duplicados (fuzzy ≥60):', reporte.resumen.grupos_duplicados);
console.log('👯 Fingerprints clonados (productos idénticos):', reporte.resumen.fingerprints_clones);
console.log('   → giros que comparten fingerprint:', reporte.resumen.giros_total_clones);
console.log('🖼️ Imágenes compartidas cross-giros:', reporte.resumen.imagenes_compartidas_cross_giros);
console.log('');
console.log('Archivos generados:');
console.log('  - reporte-fase1.json (detalle completo)');
console.log('  - basura.csv');
console.log('  - duplicados.csv');
console.log('');
console.log('Top 5 fingerprints más clonados:');
clones.slice(0, 5).forEach(c => console.log('  -', c.giros_identicos, 'giros con productos:', c.productos_compartidos.join(' / ').slice(0, 80)));
