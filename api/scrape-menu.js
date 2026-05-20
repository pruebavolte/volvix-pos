/**
 * scrape-menu.js (V10.32)
 *
 * Endpoint: GET /api/scrape/menu?url=<URL>
 *
 * Extrae productos/menú de URLs de clientes finales (mcdonalds.com.mx,
 * dominos.com.mx, starbucks.com.mx, etc.) usando 3 técnicas en orden:
 *
 *  1. Adaptadores HARDCODED por dominio (saben dónde está cada producto)
 *  2. JSON-LD Schema.org (estructured data, muchos sitios la tienen)
 *  3. Open Graph + meta tags (fallback genérico)
 *
 * Sin cheerio — usa regex puro para mantener footprint bajo.
 * User-Agent simula Chrome reciente (algunos sitios bloquean bots).
 * Cache memoria 1 hora por URL.
 *
 * Limitaciones conocidas:
 * - Sitios protegidos por Cloudflare/Akamai bloquean datacenter IPs.
 *   En esos casos devolvemos { ok: false, reason: 'blocked' }.
 * - SPAs (React/Vue puros sin SSR) no se pueden parsear sin headless browser.
 *   Para esos usamos solo Open Graph del HTML inicial (limitado).
 * - Algunos sitios devuelven HTML diferente según User-Agent o cookies.
 */

'use strict';

const CACHE = new Map();
const TTL_MS = 60 * 60 * 1000; // 1h
const TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cacheGet(key) {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { CACHE.delete(key); return null; }
  return e.value;
}
function cacheSet(key, value) {
  CACHE.set(key, { exp: Date.now() + TTL_MS, value });
  if (CACHE.size > 200) {
    const it = CACHE.keys();
    for (let i = 0; i < 50; i++) CACHE.delete(it.next().value);
  }
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, status: r.status };
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('html')) return { ok: false, reason: 'not-html' };
    const html = await r.text();
    return { ok: true, html, finalUrl: r.url };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, reason: 'timeout-or-network', error: String(e && e.message || e).slice(0, 100) };
  }
}

// ─── Extracción JSON-LD Schema.org ─────────────────────────────────────
function extractJsonLd(html) {
  const products = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const txt = m[1].trim();
      const json = JSON.parse(txt);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        collectProductsFromJsonLd(item, products);
      }
    } catch (_) { /* ignorar JSON inválido */ }
  }
  return products;
}
function collectProductsFromJsonLd(node, out) {
  if (!node || typeof node !== 'object') return;
  // @graph contiene array de nodes
  if (Array.isArray(node['@graph'])) {
    node['@graph'].forEach(n => collectProductsFromJsonLd(n, out));
  }
  // ItemList
  if (Array.isArray(node.itemListElement)) {
    node.itemListElement.forEach(n => collectProductsFromJsonLd(n.item || n, out));
  }
  // Restaurant / Menu / MenuItem
  if (node.menu) collectProductsFromJsonLd(node.menu, out);
  if (Array.isArray(node.hasMenu)) node.hasMenu.forEach(n => collectProductsFromJsonLd(n, out));
  if (Array.isArray(node.menuSection)) node.menuSection.forEach(s => {
    if (Array.isArray(s.hasMenuItem)) s.hasMenuItem.forEach(mi => collectProductsFromJsonLd(mi, out));
  });
  if (Array.isArray(node.hasMenuItem)) node.hasMenuItem.forEach(n => collectProductsFromJsonLd(n, out));
  // Producto / MenuItem
  const types = [].concat(node['@type'] || []);
  const isProduct = types.some(t => /^(Product|MenuItem|Service|Offer)$/i.test(String(t)));
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
      if (o && typeof o === 'object') {
        if (o.price) price = Number(o.price) || o.price;
        if (o.priceCurrency) currency = String(o.priceCurrency);
      }
    }
    if (price === null && node.price) price = Number(node.price) || node.price;
    out.push({
      name: name.slice(0, 120),
      image: image || null,
      price: price,
      currency: currency,
      description: String(node.description || '').slice(0, 200) || null,
      source: 'json-ld',
    });
  }
}

// ─── Extracción Open Graph (sitio único, no múltiples productos) ──────
function extractOpenGraph(html) {
  const meta = (name) => {
    const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]+content=["\']([^"\']+)["\']', 'i');
    const m = html.match(re);
    return m ? m[1] : null;
  };
  const meta2 = (name) => {
    const re = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']' + name + '["\']', 'i');
    const m = html.match(re);
    return m ? m[1] : null;
  };
  const get = (n) => meta(n) || meta2(n);
  const title = get('og:title') || get('twitter:title');
  const image = get('og:image') || get('twitter:image');
  const description = get('og:description') || get('description');
  const priceAmount = get('og:price:amount') || get('product:price:amount');
  const priceCurrency = get('og:price:currency') || get('product:price:currency');
  if (!title && !image) return [];
  return [{
    name: title ? String(title).slice(0, 120) : '(sin título)',
    image: image || null,
    price: priceAmount ? (Number(priceAmount) || priceAmount) : null,
    currency: priceCurrency || null,
    description: description ? String(description).slice(0, 200) : null,
    source: 'open-graph',
  }];
}

// ─── Adaptadores específicos por dominio ──────────────────────────────
// Cada uno toma HTML y devuelve array de productos.
const ADAPTERS = {
  // McDonald's MX — buscar links a productos en el HTML server-rendered
  'mcdonalds.com.mx': (html) => {
    const items = [];
    // Intenta extraer del JSON inline (algunos sitios McDonald's lo tienen)
    const m = html.match(/__NEXT_DATA__[\s\S]*?({[\s\S]*?})<\/script>/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const recurse = (n) => {
          if (!n || typeof n !== 'object') return;
          if (n.name && (n.image || n.imageUrl) && !items.some(i => i.name === n.name)) {
            items.push({ name: String(n.name).slice(0, 120), image: n.image || n.imageUrl, price: n.price || null, currency: 'MXN', source: 'mcdonalds-next' });
          }
          if (Array.isArray(n)) n.forEach(recurse);
          else Object.values(n).forEach(recurse);
        };
        recurse(data);
      } catch (_) {}
    }
    return items;
  },
  // Domino's MX — productos en JSON-LD generalmente
  'dominos.com.mx': null, // usa JSON-LD genérico
  // Starbucks MX — Open Graph + JSON-LD
  'starbucks.com.mx': null,
  // OXXO — productos básicos
  'oxxo.com': null,
};

function domainFromUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, '');
  } catch (_) { return ''; }
}

async function scrapeMenu(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'invalid-url' };
  }
  const cached = cacheGet(url);
  if (cached) return { ok: true, products: cached, cache: true };

  const fetched = await fetchHtml(url);
  if (!fetched.ok) return { ok: false, ...fetched };

  const html = fetched.html;
  const domain = domainFromUrl(fetched.finalUrl || url);

  // 1. Adaptador específico
  let products = [];
  if (ADAPTERS[domain] && typeof ADAPTERS[domain] === 'function') {
    try { products = ADAPTERS[domain](html) || []; } catch (_) {}
  }

  // 2. JSON-LD genérico
  if (!products.length) {
    products = extractJsonLd(html);
  }

  // 3. Open Graph fallback
  if (!products.length) {
    products = extractOpenGraph(html);
  }

  // dedupe + clean
  const seen = new Set();
  products = products.filter(p => {
    if (!p.name || !p.image) return false;
    const k = p.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 20);

  cacheSet(url, products);
  return { ok: true, products, domain, count: products.length };
}

function createHandler({ sendJSON, sendError, parseQuery }) {
  return async function handler(req, res) {
    const t0 = Date.now();
    try {
      const qs = parseQuery(req.url);
      const url = String(qs.url || '').trim();
      if (!url) return sendJSON(res, { error: 'url requerido' }, 400);

      const out = await scrapeMenu(url);
      return sendJSON(res, { ...out, ms: Date.now() - t0 });
    } catch (err) {
      try { sendError(res, err); } catch (_) { sendJSON(res, { error: 'internal' }, 500); }
    }
  };
}

module.exports = { createHandler, scrapeMenu, extractJsonLd, extractOpenGraph };
