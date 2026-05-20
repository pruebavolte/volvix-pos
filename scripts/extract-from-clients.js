#!/usr/bin/env node
/**
 * extract-from-clients.js (V10.36)
 *
 * Para CADA giro, intenta extraer productos de sus 3 clientes_finales[]
 * PRIMERO antes de usar fuentes alternativas.
 *
 * Técnicas por URL (en orden):
 *  1. GET / + extraer JSON-LD Product schema
 *  2. GET / + extraer OG Product (og:title + og:image + og:price)
 *  3. GET / + extraer TODAS las <img> con dimensions útiles
 *  4. GET /products.json (Shopify)
 *  5. GET /wp-json/wc/store/products (WooCommerce)
 *  6. GET /sitemap.xml + filtrar URLs de producto + scrape cada una
 *
 * Combina resultados de las 3 URLs + dedupe por imagen + top 10.
 * Si los 3 clientes finales devuelven <10 productos, fallback al endpoint
 * /api/products/search-public para completar.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ECO_PATH = path.join(__dirname, '..', 'public', 'data', 'giros-ecosystem.json');
const API_BASE = 'https://systeminternational.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';

function fetchUrl(url, opts = {}) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { req.destroy(); } catch(_){} resolve({ status: 0, error: 'timeout' }); }, opts.timeout || 7000);
      const req = lib.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept': opts.accept || 'text/html,application/json,application/xml',
          'Accept-Language': 'es-MX,es;q=0.9',
        }
      }, (res) => {
        let body = '';
        res.on('data', c => { body += c; if (body.length > 300000) req.destroy(); });
        res.on('end', () => { clearTimeout(t); resolve({ status: res.statusCode, body, headers: res.headers }); });
      });
      req.on('error', e => { clearTimeout(t); resolve({ status: 0, error: String(e.message).slice(0, 80) }); });
      req.end();
    } catch (e) { resolve({ status: 0, error: e.message }); }
  });
}

function absUrl(base, src) {
  if (!src) return '';
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('http')) return src;
  try { return new URL(src, base).href; } catch(_){ return ''; }
}

// ─── MÉTODO 1: JSON-LD Schema.org ────────────────────────────────
function extractJsonLd(html, baseUrl) {
  const products = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1].trim());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) collectProducts(item, products, baseUrl);
    } catch(_){}
  }
  return products;
}
function collectProducts(node, out, baseUrl) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node['@graph'])) node['@graph'].forEach(n => collectProducts(n, out, baseUrl));
  if (Array.isArray(node.itemListElement)) node.itemListElement.forEach(n => collectProducts(n.item || n, out, baseUrl));
  if (Array.isArray(node.hasMenuItem)) node.hasMenuItem.forEach(n => collectProducts(n, out, baseUrl));
  if (Array.isArray(node.menuSection)) node.menuSection.forEach(s => {
    if (Array.isArray(s.hasMenuItem)) s.hasMenuItem.forEach(mi => collectProducts(mi, out, baseUrl));
  });
  const types = [].concat(node['@type'] || []);
  const isProduct = types.some(t => /^(Product|MenuItem|Service)$/i.test(String(t)));
  if (isProduct) {
    const name = String(node.name || '').trim();
    if (!name) return;
    let image = '';
    if (Array.isArray(node.image)) image = String(node.image[0] || '');
    else if (typeof node.image === 'string') image = node.image;
    else if (node.image && typeof node.image === 'object') image = String(node.image.url || node.image['@id'] || '');
    let price = null, currency = null;
    if (node.offers) {
      const o = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (o) { price = Number(o.price) || o.price || null; currency = o.priceCurrency || null; }
    }
    if (price === null && node.price) price = Number(node.price) || node.price;
    out.push({ name: name.slice(0, 100), image: absUrl(baseUrl, image), price, currency, source: 'json-ld' });
  }
}

// ─── MÉTODO 2: Open Graph ──────────────────────────────────────
function extractOpenGraph(html, baseUrl) {
  const meta = (name) => {
    const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]+content=["\']([^"\']+)["\']', 'i');
    const m = html.match(re);
    return m ? m[1] : null;
  };
  const title = meta('og:title') || meta('twitter:title');
  const image = meta('og:image') || meta('twitter:image');
  const description = meta('og:description');
  const priceAmount = meta('og:price:amount') || meta('product:price:amount');
  const priceCurrency = meta('og:price:currency') || meta('product:price:currency');
  if (!title && !image) return [];
  return [{
    name: title ? String(title).slice(0, 100) : '',
    image: absUrl(baseUrl, image || ''),
    price: priceAmount ? Number(priceAmount) : null,
    currency: priceCurrency || null,
    description: description || null,
    source: 'open-graph',
  }];
}

// ─── MÉTODO 3: <img> tags con dimensiones útiles ─────────────
function extractImgs(html, baseUrl) {
  const out = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null && out.length < 50) {
    const src = absUrl(baseUrl, m[1]);
    if (!src || seen.has(src)) continue;
    if (/(logo|icon|sprite|favicon|pixel|tracking|1x1)/i.test(src)) continue;
    // alt text como nombre
    const tag = m[0];
    const altM = tag.match(/alt=["']([^"']+)["']/i);
    const widthM = tag.match(/width=["']?(\d+)/i);
    const heightM = tag.match(/height=["']?(\d+)/i);
    const w = widthM ? Number(widthM[1]) : 0;
    const h = heightM ? Number(heightM[1]) : 0;
    // si tiene dimensiones, debe ser >200px para no ser icono
    if ((w && w < 200) || (h && h < 200)) continue;
    const alt = altM ? altM[1].trim().slice(0, 80) : '';
    if (!alt) continue;
    seen.add(src);
    out.push({ name: alt, image: src, price: null, currency: null, source: 'img-tag' });
  }
  return out;
}

// ─── MÉTODO 4: Shopify products.json ─────────────────────────
async function shopifyProducts(baseUrl) {
  const u = baseUrl.replace(/\/$/, '') + '/products.json?limit=20';
  const r = await fetchUrl(u, { timeout: 6000 });
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

// ─── MÉTODO 5: WooCommerce REST público ──────────────────────
async function woocommerceProducts(baseUrl) {
  const u = baseUrl.replace(/\/$/, '') + '/wp-json/wc/store/products?per_page=15';
  const r = await fetchUrl(u, { timeout: 6000 });
  if (r.status !== 200 || !r.body) return [];
  try {
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr)) return [];
    return arr.map(p => ({
      name: p.name || '',
      image: (p.images && p.images[0] && (p.images[0].src || p.images[0].thumbnail)) || '',
      price: parseFloat(p.prices?.price || '0') / 100 || null,
      currency: p.prices?.currency_code || 'MXN',
      source: 'woocommerce',
    })).filter(p => p.name && p.image);
  } catch(_){ return []; }
}

// ─── COMBINADOR: extraer todo lo posible de UNA URL ─────────
async function extractFromUrl(url) {
  const results = { url, methods: [], products: [] };
  // 1. Shopify products.json (fast check primero)
  const sh = await shopifyProducts(url);
  if (sh.length) { results.methods.push('shopify:'+sh.length); results.products.push(...sh); }
  // 2. WooCommerce REST
  const wc = await woocommerceProducts(url);
  if (wc.length) { results.methods.push('woo:'+wc.length); results.products.push(...wc); }
  // 3. HTML scraping (JSON-LD + OG + IMG)
  const r = await fetchUrl(url, { timeout: 7000 });
  if (r.status >= 200 && r.status < 400 && r.body) {
    const jl = extractJsonLd(r.body, url);
    if (jl.length) { results.methods.push('jsonld:'+jl.length); results.products.push(...jl); }
    const og = extractOpenGraph(r.body, url);
    if (og.length && og[0].image) { results.methods.push('og:1'); results.products.push(...og); }
    const im = extractImgs(r.body, url);
    if (im.length) { results.methods.push('img:'+im.length); results.products.push(...im); }
  } else {
    results.methods.push('html-fail:'+r.status);
  }
  // Dedupe por imagen
  const seen = new Set();
  results.products = results.products.filter(p => {
    if (!p.name || !p.image) return false;
    const k = p.image;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return results;
}

// fallback al endpoint /api/products/search-public
async function fallbackSearchPublic(query, slug, limit) {
  const url = API_BASE + '/api/products/search-public?q=' + encodeURIComponent(query) +
              '&giro=' + encodeURIComponent(slug) + '&limit=' + limit;
  const r = await fetchUrl(url, { timeout: 20000, accept: 'application/json' });
  if (r.status !== 200) return [];
  try { return JSON.parse(r.body).results || []; } catch(_){ return []; }
}

(async () => {
  const data = JSON.parse(fs.readFileSync(ECO_PATH, 'utf8'));
  console.log('═══ EXTRAER de clientes_finales primero ═══');
  console.log('Total giros:', data.giros.length);
  console.log('');

  let stats = { fromClients: 0, fromFallback: 0, giroCounts: {} };

  for (const g of data.giros) {
    const cfs = g.cadena_valor?.clientes_finales || [];
    const allFromClients = [];

    process.stdout.write('['+g.slug+']');
    for (const cf of cfs) {
      const r = await extractFromUrl(cf.url);
      if (r.products.length) {
        process.stdout.write(' '+cf.nombre.slice(0,12)+':'+r.products.length+'('+r.methods.join(',')+')');
        allFromClients.push(...r.products);
      } else {
        process.stdout.write(' '+cf.nombre.slice(0,12)+':0('+r.methods.join(',')+')');
      }
    }

    // Dedupe global por imagen
    const seen = new Set();
    let combined = allFromClients.filter(p => {
      const k = (p.image||'').toLowerCase();
      if (!k || seen.has(k) || !p.name) return false;
      seen.add(k); return true;
    });
    stats.fromClients += combined.length;

    // Si <10 productos, completar con fallback
    if (combined.length < 10) {
      const need = 10 - combined.length;
      const query = g.que_vende || g.name || g.slug;
      const fb = await fallbackSearchPublic(query, g.slug, need + 3);
      for (const p of fb) {
        const k = (p.image||'').toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        combined.push(p);
        stats.fromFallback++;
        if (combined.length >= 10) break;
      }
    }

    combined = combined.slice(0, 10);
    g.productos_plantilla = combined.map(p => ({
      nombre: (p.name || '').slice(0, 100),
      imagen: p.image || '',
      precio: p.price || null,
      moneda: p.currency || null,
      source: p.source || null,
    }));
    stats.giroCounts[g.slug] = combined.length;
    console.log(' → '+combined.length);
  }

  console.log('');
  console.log('═══ RESUMEN ═══');
  console.log('Productos de clientes_finales (directos):', stats.fromClients);
  console.log('Productos de fallback (api/products/search-public):', stats.fromFallback);
  const total = data.giros.reduce((s,g)=>s+(g.productos_plantilla||[]).length, 0);
  console.log('Total productos:', total);

  data._meta.last_audit = new Date().toISOString();
  data._meta.products_total = total;
  data._meta.extraction_v = 'V10.36 — cliente final primero';
  fs.writeFileSync(ECO_PATH, JSON.stringify(data, null, 2));
  console.log('✅ Guardado');
})();
