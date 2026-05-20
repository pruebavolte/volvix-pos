#!/usr/bin/env node
/**
 * fill-products-multi-source.js (V10.35)
 *
 * Para los giros que tienen <10 productos en productos_plantilla,
 * usa 6 métodos GRATUITOS para extraer más:
 *
 * 1. /api/products/search-public (V10.10 — DummyJSON + OFF + Wikimedia)
 * 2. Multi-query: 3-4 queries distintas por giro, dedupe por imagen
 * 3. Open Food Facts directo (extra giros de alimentos)
 * 4. Wikimedia con queries mejoradas
 * 5. Shopify products.json (probar URLs MX reales)
 * 6. WooCommerce REST API (probar URLs MX reales)
 *
 * Cada producto requiere: nombre + imagen + (precio o source).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const API_BASE = 'https://systeminternational.app';

function fetchUrl(url, opts = {}) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { req.destroy(); } catch(_){} resolve({ status: 0, error: 'timeout' }); }, opts.timeout || 8000);
      const req = lib.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
          'Accept': opts.json ? 'application/json' : 'text/html,application/json,application/xml',
          'Accept-Language': 'es-MX,es;q=0.9',
        }
      }, (res) => {
        let body = '';
        res.on('data', c => { body += c; if (body.length > 200000) req.destroy(); });
        res.on('end', () => { clearTimeout(t); resolve({ status: res.statusCode, body }); });
      });
      req.on('error', e => { clearTimeout(t); resolve({ status: 0, error: String(e.message).slice(0,80) }); });
      req.end();
    } catch (e) { resolve({ status: 0, error: e.message }); }
  });
}

// MÉTODO 1: nuestro endpoint /api/products/search-public
async function searchPublic(query, giro, limit = 10) {
  const url = API_BASE + '/api/products/search-public?q=' + encodeURIComponent(query) +
              '&giro=' + encodeURIComponent(giro) + '&limit=' + limit;
  const r = await fetchUrl(url, { timeout: 20000, json: true });
  if (r.status !== 200) return [];
  try { return JSON.parse(r.body).results || []; } catch(_){ return []; }
}

// MÉTODO 5: Shopify products.json
async function shopifyProducts(baseUrl) {
  const u = baseUrl.replace(/\/$/, '') + '/products.json?limit=20';
  const r = await fetchUrl(u, { timeout: 6000, json: true });
  if (r.status !== 200 || !r.body) return [];
  try {
    const j = JSON.parse(r.body);
    return (j.products || []).map(p => ({
      name: p.title || '',
      image: (p.images && p.images[0] && p.images[0].src) || '',
      price: p.variants && p.variants[0] && parseFloat(p.variants[0].price) || null,
      currency: 'MXN',
      source: 'shopify',
    })).filter(p => p.name && p.image);
  } catch(_){ return []; }
}

// MÉTODO 6: WooCommerce REST (sin auth funciona en muchos sitios)
async function woocommerceProducts(baseUrl) {
  const u = baseUrl.replace(/\/$/, '') + '/wp-json/wc/store/products?per_page=10';
  const r = await fetchUrl(u, { timeout: 6000, json: true });
  if (r.status !== 200 || !r.body) return [];
  try {
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr)) return [];
    return arr.map(p => ({
      name: p.name || '',
      image: (p.images && p.images[0] && (p.images[0].src || p.images[0].thumbnail)) || '',
      price: parseFloat(p.prices?.price || p.price || '0') || null,
      currency: p.prices?.currency_code || 'MXN',
      source: 'woocommerce',
    })).filter(p => p.name && p.image);
  } catch(_){ return []; }
}

// MULTI-QUERY: combinar resultados de varias queries diferentes
async function multiQuery(queries, giro) {
  const all = [];
  for (const q of queries) {
    const results = await searchPublic(q, giro, 10);
    all.push(...results);
  }
  // dedupe por imagen URL
  const seen = new Set();
  return all.filter(p => {
    const key = (p.image || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Queries optimizadas por giro
const QUERIES = {
  veterinaria: ['dog food pedigree', 'cat food whiskas', 'pet shampoo', 'flea collar'],
  ferreteria: ['screw bolt', 'hammer tool', 'drill makita', 'paint brush'],
  pizzeria: ['pizza margherita', 'pizza pepperoni', 'pizza hawaiian', 'tomato sauce'],
  barberia: ['hair clipper wahl', 'beard trimmer', 'shaving razor gillette', 'pomade hair'],
  jugos_frescos: ['orange juice', 'smoothie strawberry', 'green juice detox', 'apple juice'],
  // Para giros que ya tienen 10, no recargamos
};

(async () => {
  console.log('═══ FILL multi-source para giros débiles ═══\n');
  const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));
  const targetSlugs = Object.keys(QUERIES);

  for (const slug of targetSlugs) {
    const g = data.giros.find(x => x.slug === slug);
    if (!g) { console.log('⚠️ '+slug+' no existe en JSON, skip'); continue; }

    console.log('\n['+slug+'] queries:', QUERIES[slug].join(', '));
    const before = (g.productos_plantilla||[]).length;

    // 1. Multi-query con nuestro endpoint
    const multi = await multiQuery(QUERIES[slug], slug);
    console.log('  multi-query: '+multi.length+' productos');

    // 2. Probar Shopify products.json de los clientes finales
    const cfs = g.cadena_valor?.clientes_finales || [];
    for (const cf of cfs) {
      const sp = await shopifyProducts(cf.url);
      if (sp.length) { console.log('  shopify '+cf.url.replace(/^https?:\/\//,'').slice(0,30)+': '+sp.length+' productos'); multi.push(...sp); }
      const wc = await woocommerceProducts(cf.url);
      if (wc.length) { console.log('  woocommerce '+cf.url.replace(/^https?:\/\//,'').slice(0,30)+': '+wc.length+' productos'); multi.push(...wc); }
    }

    // Dedupe + top 10
    const seen = new Set();
    const final = multi.filter(p => {
      const k = (p.image||'').toLowerCase();
      if (!k || seen.has(k) || !p.name) return false;
      seen.add(k); return true;
    }).slice(0, 10);

    g.productos_plantilla = final.map(p => ({
      nombre: (p.name || '').slice(0, 100),
      imagen: p.image || '',
      precio: p.price || null,
      moneda: p.currency || null,
      marca: p.brand || null,
      source: p.source || null,
    })).filter(p => p.nombre && p.imagen);

    const after = g.productos_plantilla.length;
    console.log('  RESULTADO: '+before+' → '+after+(after>=10?' ✅':after>=5?' ⚠️':' ❌'));
  }

  data._meta.last_audit = new Date().toISOString();
  data._meta.products_total = data.giros.reduce((s,g)=>s + (g.productos_plantilla||[]).length, 0);
  fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));
  console.log('\n✅ Guardado. Total productos: ' + data._meta.products_total);
})();
