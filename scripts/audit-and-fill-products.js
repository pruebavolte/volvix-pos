#!/usr/bin/env node
/**
 * audit-and-fill-products.js
 *
 * Para cada giro del ecosystem JSON:
 *  1) Audita cada URL de clientes_finales — devuelve status + tiene OG/JSON-LD
 *  2) Rellena `productos_plantilla` con 10 productos extraídos via /api/products/search-public
 *
 * Uso: node scripts/audit-and-fill-products.js [--dry] [--prod]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const API_BASE = process.argv.includes('--prod')
  ? 'https://systeminternational.app'
  : 'https://systeminternational.app'; // siempre producción para search-public
const DRY = process.argv.includes('--dry');

function fetchUrl(url, opts = {}) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const ctrl = new AbortController();
      const timeoutMs = opts.timeout || 6000;
      const t = setTimeout(() => { try { req.destroy(); } catch(_){} resolve({ status: 0, error: 'timeout' }); }, timeoutMs);
      const req = lib.request(url, {
        method: opts.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
          'Accept': opts.accept || 'text/html,application/json',
          ...(opts.headers || {}),
        },
      }, (res) => {
        let body = '';
        res.on('data', c => { body += c.toString(); if (body.length > 80000) { req.destroy(); } });
        res.on('end', () => { clearTimeout(t); resolve({ status: res.statusCode, body }); });
      });
      req.on('error', (e) => { clearTimeout(t); resolve({ status: 0, error: String(e.message).slice(0, 60) }); });
      req.end();
    } catch (e) {
      resolve({ status: 0, error: e.message });
    }
  });
}

async function auditUrl(url) {
  const r = await fetchUrl(url, { timeout: 5000 });
  const hasOg = r.body ? /og:image/.test(r.body) : false;
  const hasJsonLd = r.body ? /application\/ld\+json/.test(r.body) : false;
  const ok = (r.status >= 200 && r.status < 400) && (hasOg || hasJsonLd);
  return { url, status: r.status, hasOg, hasJsonLd, ok, error: r.error };
}

async function searchProducts(query, slug, limit = 10) {
  const url = API_BASE + '/api/products/search-public?q=' + encodeURIComponent(query) +
              '&giro=' + encodeURIComponent(slug) + '&limit=' + limit;
  const r = await fetchUrl(url, { timeout: 20000, accept: 'application/json' });
  if (r.status !== 200 || !r.body) return [];
  try {
    const j = JSON.parse(r.body);
    return Array.isArray(j.results) ? j.results : [];
  } catch (_) { return []; }
}

(async () => {
  const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));
  console.log('Total giros:', data.giros.length);
  console.log('');

  // ─── FASE 1: AUDIT ─────────────────────────────────────────────────
  console.log('═══════════ FASE 1: AUDIT URLs ═══════════');
  const audit = { ok: 0, fail: 0, byGiro: {} };
  for (const g of data.giros) {
    audit.byGiro[g.slug] = { ok: 0, fail: 0, details: [] };
    const cfs = g.cadena_valor?.clientes_finales || [];
    for (const cf of cfs) {
      const a = await auditUrl(cf.url);
      audit.byGiro[g.slug].details.push(a);
      if (a.ok) { audit.ok++; audit.byGiro[g.slug].ok++; }
      else { audit.fail++; audit.byGiro[g.slug].fail++; }
    }
    process.stdout.write('.');
  }
  console.log('');
  console.log('AUDIT: ' + audit.ok + ' OK · ' + audit.fail + ' FAIL · ' + (audit.ok + audit.fail) + ' total');
  console.log('');
  console.log('Giros con TODAS las URLs fallando:');
  Object.entries(audit.byGiro).forEach(([slug, r]) => {
    if (r.ok === 0 && r.fail > 0) {
      console.log('  ❌', slug.padEnd(20), 'fallas:', r.details.map(d => d.url.replace(/^https?:\/\//,'').replace(/\/$/,'').slice(0,30)).join(', '));
    }
  });

  // ─── FASE 2: RELLENAR PRODUCTOS ──────────────────────────────────
  console.log('');
  console.log('═══════════ FASE 2: PRODUCTOS PLANTILLA ═══════════');
  console.log('Llamando /api/products/search-public para cada giro…');
  console.log('');

  // Query optimizada por giro — versión V2 con queries menos ambiguas
  const QUERIES = {
    sex_shop: 'lubricante intimo',
    restaurante: 'mexican food dish',  // EN trae mejores results en DummyJSON
    veterinaria: 'pet food cat dog',
    dentista: 'toothpaste',
    hotel: 'hotel toiletries',
    farmacia: 'paracetamol medicine',
    optica: 'eyeglasses sunglasses',
    gimnasio: 'protein powder supplement',
    salon_belleza: 'hair shampoo conditioner',
    taller_mecanico: 'motor oil castrol',
    abarrotes: 'soda drink',
    barberia: 'beard trimmer clipper',
    panaderia: 'bread loaf',
    cafeteria: 'coffee beans espresso',
    ferreteria: 'screw nail tool',
    pizzeria: 'pizza margherita pepperoni',
    taqueria: 'taco corn tortilla',
    heladeria: 'ice cream cone',
    pasteleria: 'cake chocolate',
    jugos_naturales: 'fresh juice orange',
    jugos_frescos: 'smoothie acai',
    marisqueria: 'shrimp lobster seafood',
    sushi: 'sushi roll nigiri',
    hamburguesas: 'burger fries',
    fruteria: 'apple banana orange fruit',
    carniceria: 'beef steak meat',
    polleria: 'chicken roast',
    tortilleria: 'corn tortilla',
    ropa: 'shirt t-shirt',
    zapateria: 'shoes sneakers',
    electronica: 'headphones bluetooth',
    papeleria: 'notebook pen pencil',
    joyeria: 'gold ring necklace jewelry',
    floreria: 'rose bouquet flower',
    lavanderia: 'detergent laundry',
    muebleria: 'chair sofa furniture',
  };

  let totalProducts = 0;
  for (const g of data.giros) {
    const query = QUERIES[g.slug] || g.que_vende || g.name;
    const productos = await searchProducts(query, g.slug, 10);
    g.productos_plantilla = productos.map(p => ({
      nombre: (p.name || '').slice(0, 100),
      imagen: p.image || '',
      precio: p.price || null,
      moneda: p.currency || null,
      marca: p.brand || null,
      source: p.source || null,
    })).filter(p => p.nombre && p.imagen);
    totalProducts += g.productos_plantilla.length;
    process.stdout.write('.');
  }
  console.log('');
  console.log('Productos plantilla generados: ' + totalProducts + ' (avg ' + (totalProducts / data.giros.length).toFixed(1) + ' por giro)');
  console.log('');

  // Resumen por giro
  console.log('Resumen por giro:');
  data.giros.forEach(g => {
    const n = (g.productos_plantilla || []).length;
    const flag = n === 10 ? '✅' : n >= 5 ? '⚠️' : '❌';
    console.log('  ' + flag + ' ' + g.slug.padEnd(20) + ' ' + n + ' productos');
  });

  if (!DRY) {
    data._meta.last_audit = new Date().toISOString();
    data._meta.products_total = totalProducts;
    fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));
    console.log('');
    console.log('✅ Guardado en ' + ECO_PATH);
  } else {
    console.log('');
    console.log('(--dry mode: no se guardó)');
  }
})();
