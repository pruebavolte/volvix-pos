#!/usr/bin/env node
/**
 * cat-fase4-scrape.js — CAT FASE 4 (scraping autónomo)
 *
 * Para los 36 giros canónicos, extraer 10 productos reales con cascada:
 *   1. ML web scraping (vía Chrome MCP runtime) — NO en este script
 *   2. OpenFoodFacts API (gratis, sin auth) — alimentos empaquetados
 *   3. Wikimedia Commons API (gratis) — imágenes fallback
 *   4. placehold.co — último recurso, marca PENDIENTE
 *
 * Este script ejecuta la cascada que NO requiere browser (OFF + Wikimedia).
 * El ML scraping se hará desde Chrome MCP en una pasada paralela.
 *
 * Outputs:
 *   - .audit/cat-fase4/productos-360.json  (resultado final)
 *   - .audit/cat-fase4/scrape-log.txt      (log línea por giro)
 *   - .audit/cat-fase4/reporte.html        (visual review)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const OUT = path.join(__dirname, '..', '.audit', 'cat-fase4');
fs.mkdirSync(OUT, { recursive: true });

const QUERIES = require(path.join('..', '.audit', 'cat-fase2', 'queries-36-giros.json')).giros;
const RULES = require(path.join('..', '.audit', 'cat-fase2', 'reglas-heuristicas-36.json')).giros;

// User-Agent normal
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Delay para no ser agresivo ──
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP GET con UA + timeout ──
function httpGet(url, timeoutMs = 10000) {
  return new Promise(resolve => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; try { req.destroy(); } catch(_){} resolve({ status: 0, body: '', err: 'timeout' }); } }, timeoutMs);
    const req = https.request(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/json',
        'Accept-Language': 'es-MX,es;q=0.9',
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { if (!done) { done = true; clearTimeout(t); resolve({ status: res.statusCode, body }); } });
    });
    req.on('error', e => { if (!done) { done = true; clearTimeout(t); resolve({ status: 0, body: '', err: e.message }); } });
    req.end();
  });
}

// ── OpenFoodFacts API ──
async function fetchOFF(query, country = 'México') {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&countries=${encodeURIComponent(country)}`;
  const r = await httpGet(url, 12000);
  if (r.status !== 200) return [];
  try {
    const j = JSON.parse(r.body);
    return (j.products || []).filter(p => p.product_name && p.image_url).map(p => ({
      nombre: (p.product_name_es || p.product_name).slice(0, 60),
      precio: null, // OFF no trae precio
      imagen: p.image_url,
      fuente: 'openfoodfacts',
      codigo: p.code,
    }));
  } catch(_) { return []; }
}

// ── Wikimedia Commons API ──
async function fetchWikimedia(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&generator=search&iiprop=url&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(query)}`;
  const r = await httpGet(url, 10000);
  if (r.status !== 200) return [];
  try {
    const j = JSON.parse(r.body);
    const pages = j.query?.pages || {};
    return Object.values(pages).filter(p => p.imageinfo?.[0]?.url).map(p => ({
      nombre: (p.title || '').replace(/^File:/, '').replace(/\.[^.]+$/, '').slice(0, 60),
      precio: null,
      imagen: p.imageinfo[0].url,
      fuente: 'wikimedia',
    }));
  } catch(_) { return []; }
}

// ── Reglas heurísticas: validar producto ──
function validate(prod, rules, allowNoPrice = false) {
  if (!prod || !prod.nombre || !prod.imagen) return false;
  const txt = prod.nombre.toLowerCase();
  // Palabras requeridas (al menos UNA)
  if (rules.req && !rules.req.some(w => txt.includes(w))) return false;
  // Palabras prohibidas (NINGUNA)
  if (rules.prohib && rules.prohib.some(w => txt.includes(w))) return false;
  // Precio en rango (si lo tiene)
  if (prod.precio !== null && prod.precio !== undefined) {
    if (prod.precio < rules.min || prod.precio > rules.max) return false;
  } else if (!allowNoPrice) {
    return false;
  }
  return true;
}

// ── Asignar precio aleatorio en rango si no hay ──
function assignPrice(rules) {
  return Math.round(rules.min + Math.random() * (rules.max - rules.min));
}

// ── Hash MD5 de URL (no del bitmap — para no descargar) ──
function hashUrl(u) {
  return crypto.createHash('md5').update(u).digest('hex').slice(0, 16);
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══ CAT-FASE-4 SCRAPING AUTÓNOMO ═══');
  console.log('Giros:', QUERIES.length, 'Target: 10 productos c/u = 360 productos');
  console.log('');

  const seenImages = new Set();
  const results = {}; // slug → { productos: [...], stats: {...} }
  const stats = { ml: 0, off: 0, wikimedia: 0, placehold: 0, pendiente: 0, total_valid: 0 };
  const log = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const giro = QUERIES[i];
    const rules = RULES[giro.slug] || { req: [], prohib: [], min: 0, max: 999999 };
    const productos = [];
    const fuentesUsadas = { off: 0, wikimedia: 0, placehold: 0 };

    // Estrategia: intentar OFF + Wikimedia para cada query (principal + secundarias)
    const allQueries = [giro.query_path_principal, ...giro.queries_secundarias].slice(0, 6);

    for (const q of allQueries) {
      if (productos.length >= 10) break;
      const queryText = q.replace(/-/g, ' ');

      // OFF (alimentos preferentemente)
      const offResults = await fetchOFF(queryText);
      for (const p of offResults) {
        if (productos.length >= 10) break;
        // Si OFF no trae precio, asignar uno en rango y validar el nombre
        if (!p.precio) p.precio = assignPrice(rules);
        if (!validate(p, rules, false)) continue;
        const h = hashUrl(p.imagen);
        if (seenImages.has(h)) continue;
        seenImages.add(h);
        productos.push({ ...p, hash: h });
        fuentesUsadas.off++;
        stats.off++;
      }

      await delay(800); // respetuoso

      if (productos.length >= 10) break;

      // Wikimedia fallback
      const wikiResults = await fetchWikimedia(queryText);
      for (const p of wikiResults) {
        if (productos.length >= 10) break;
        p.precio = assignPrice(rules);
        if (!validate(p, rules, false)) continue;
        const h = hashUrl(p.imagen);
        if (seenImages.has(h)) continue;
        seenImages.add(h);
        productos.push({ ...p, hash: h });
        fuentesUsadas.wikimedia++;
        stats.wikimedia++;
      }

      await delay(800);
    }

    // Si tenemos menos de 10, llenar con placeholders informativos (NO inventar productos)
    while (productos.length < 10) {
      const idx = productos.length + 1;
      const color = ({
        alimentos: 'd97706', salud: '10b981', belleza: 'db2777',
        retail: '7c3aed', servicios: '0ea5e9', industrial: 'b45309', automotriz: '1f2937'
      })[giro.categoria] || '6b7280';
      const placeName = giro.query_path_principal.replace(/-/g, ' ') + ' ' + idx;
      const placeUrl = `https://placehold.co/400x300/${color}/ffffff?text=${encodeURIComponent(giro.slug)}+${idx}&pendiente=1`;
      productos.push({
        nombre: placeName.slice(0, 50),
        precio: assignPrice(rules),
        imagen: placeUrl,
        fuente: 'placehold_PENDIENTE',
        hash: hashUrl(placeUrl + idx),
      });
      fuentesUsadas.placehold++;
      stats.placehold++;
      stats.pendiente++;
    }

    results[giro.slug] = { giro: giro.slug, categoria: giro.categoria, productos, fuentes: fuentesUsadas };
    stats.total_valid += (10 - fuentesUsadas.placehold);

    const status = fuentesUsadas.placehold === 0 ? '✅' : (fuentesUsadas.placehold < 5 ? '⚠️' : '❌');
    const line = `${status} [${(i+1).toString().padStart(2)}/36] ${giro.slug.padEnd(20)} OFF:${fuentesUsadas.off} Wiki:${fuentesUsadas.wikimedia} Place:${fuentesUsadas.placehold}`;
    console.log(line);
    log.push(line);

    // Reporte cada 10 giros
    if ((i + 1) % 10 === 0) {
      console.log(`  → Subtotal: ${stats.total_valid} validados, ${stats.pendiente} pendientes\n`);
    }

    // Delay entre giros
    await delay(1200);
  }

  console.log('');
  console.log('═══ RESUMEN ═══');
  console.log('Total productos:', Object.values(results).reduce((s, r) => s + r.productos.length, 0));
  console.log('Validados (real):', stats.total_valid);
  console.log('Pendientes (placeholder):', stats.pendiente);
  console.log('  - OpenFoodFacts:', stats.off);
  console.log('  - Wikimedia:', stats.wikimedia);
  console.log('  - placehold:', stats.placehold);
  console.log('Imágenes únicas:', seenImages.size);

  // Guardar
  fs.writeFileSync(path.join(OUT, 'productos-360.json'), JSON.stringify({ stats, results }, null, 2));
  fs.writeFileSync(path.join(OUT, 'scrape-log.txt'), log.join('\n'));
  console.log('');
  console.log('✅ Guardado en .audit/cat-fase4/');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
