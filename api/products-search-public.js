/**
 * products-search-public.js
 *
 * Endpoint: GET /api/products/search-public?q=<query>&giro=<slug>&limit=<n>
 *
 * Devuelve sugerencias de productos (imagen + nombre + marca + precio) extraídas
 * de fuentes públicas SIN credenciales. Diseñado para autocompletar productos
 * en el modal "Nuevo producto" del POS y poblar landings con imágenes reales.
 *
 * Fuentes (orden de preferencia):
 *   1. DummyJSON     — products/search?q=...        (rich data, USD, ~10 items)
 *   2. OpenFoodFacts — search_terms=...&json=1      (mejor para abarrotes/comida)
 *   3. Wikimedia     — commons.wikimedia.org/api.php (imágenes libres genéricas)
 *   4. MercadoLibre  — sólo si process.env.MERCADOLIBRE_TOKEN está configurado
 *
 * Características:
 *   - Sin API keys requeridas para las 3 primeras fuentes.
 *   - Cache en memoria 10 min por (q, giro, limit).
 *   - Timeouts cortos (4s c/u) para no bloquear request.
 *   - Sin scraping agresivo: sólo APIs JSON oficiales o públicas.
 *
 * Shape de respuesta:
 *   {
 *     query: "calcetines",
 *     giro: "ropa",
 *     results: [
 *       { name, brand, price, currency, image, image_alt, source, ref_url }, ...
 *     ],
 *     sources_tried: ["dummyjson","off","wikimedia"],
 *     cache_hit: false,
 *     ms: 412
 *   }
 *
 * Para activar MercadoLibre OAuth:
 *   - Registrar app en https://developers.mercadolibre.com/
 *   - Setear MERCADOLIBRE_TOKEN en Vercel env
 */

'use strict';

// Node 18+ tiene fetch global. AbortController también.
const CACHE = new Map(); // key → { exp, value }
const TTL_MS = 10 * 60 * 1000; // 10 min
const DEFAULT_TIMEOUT = 4000;

function cacheKey(q, giro, limit) {
  return [String(q || '').toLowerCase().trim(), String(giro || '').toLowerCase().trim(), Number(limit) || 8].join('|');
}
function cacheGet(k) {
  const e = CACHE.get(k);
  if (!e) return null;
  if (Date.now() > e.exp) { CACHE.delete(k); return null; }
  return e.value;
}
function cacheSet(k, v) {
  CACHE.set(k, { exp: Date.now() + TTL_MS, value: v });
  if (CACHE.size > 500) {
    // evict oldest
    const it = CACHE.keys();
    for (let i = 0; i < 100; i++) CACHE.delete(it.next().value);
  }
}

async function fetchJSON(url, timeoutMs = DEFAULT_TIMEOUT, extraHeaders = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Volvix-POS/1.0 (+https://systeminternational.app; product-search)',
        'Accept': 'application/json',
        ...extraHeaders,
      },
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('json')) return null;
    return await r.json();
  } catch (_) {
    clearTimeout(timer);
    return null;
  }
}

function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function isUrl(s) { return typeof s === 'string' && /^https?:\/\//i.test(s); }

// ---------- Adapter: DummyJSON ----------
// https://dummyjson.com/docs/products  (REST público, sin auth)
async function searchDummyJSON(q, limit) {
  if (!q) return { source: 'dummyjson', items: [] };
  const url = `https://dummyjson.com/products/search?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 30)}`;
  const data = await fetchJSON(url);
  if (!data || !Array.isArray(data.products)) return { source: 'dummyjson', items: [] };
  const items = data.products.slice(0, limit).map(p => ({
    name: clean(p.title),
    brand: clean(p.brand),
    price: typeof p.price === 'number' ? p.price : null,
    currency: 'USD',
    image: isUrl(p.thumbnail) ? p.thumbnail : (Array.isArray(p.images) && isUrl(p.images[0]) ? p.images[0] : null),
    image_alt: Array.isArray(p.images) ? p.images.filter(isUrl).slice(0, 4) : [],
    source: 'dummyjson',
    ref_url: null,
    category: clean(p.category),
    description: clean(p.description).slice(0, 200) || null,
  })).filter(x => x.name && x.image);
  return { source: 'dummyjson', items };
}

// ---------- Adapter: Open Food Facts ----------
async function searchOFF(q, limit) {
  if (!q) return { source: 'off', items: [] };
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1&page_size=${Math.min(limit, 24)}&fields=product_name,product_name_es,image_url,image_front_url,brands,categories,code`;
  const data = await fetchJSON(url, DEFAULT_TIMEOUT);
  if (!data || !Array.isArray(data.products)) return { source: 'off', items: [] };
  const items = data.products.slice(0, limit).map(p => ({
    name: clean(p.product_name_es || p.product_name),
    brand: clean(p.brands).split(',')[0] || null,
    price: null, // OFF no tiene precios
    currency: null,
    image: isUrl(p.image_front_url) ? p.image_front_url : (isUrl(p.image_url) ? p.image_url : null),
    image_alt: [],
    source: 'off',
    ref_url: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : null,
    category: clean(p.categories).split(',')[0] || null,
    description: null,
  })).filter(x => x.name && x.image);
  return { source: 'off', items };
}

// ---------- Adapter: Wikimedia Commons ----------
async function searchWikimedia(q, limit) {
  if (!q) return { source: 'wikimedia', items: [] };
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${Math.min(limit, 20)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=400&format=json&origin=*`;
  const data = await fetchJSON(url);
  const pages = (data && data.query && data.query.pages) ? Object.values(data.query.pages) : [];
  const items = pages
    .map(p => {
      const info = (p.imageinfo && p.imageinfo[0]) || {};
      const mime = String(info.mime || '');
      if (!mime.startsWith('image/')) return null;
      const thumb = isUrl(info.thumburl) ? info.thumburl : null;
      if (!thumb) return null;
      const title = clean(p.title || '').replace(/^File:/, '').replace(/\.[a-zA-Z0-9]+$/, '');
      return {
        name: title.slice(0, 80),
        brand: null,
        price: null,
        currency: null,
        image: thumb,
        image_alt: isUrl(info.url) ? [info.url] : [],
        source: 'wikimedia',
        ref_url: isUrl(info.descriptionurl) ? info.descriptionurl : null,
        category: null,
        description: null,
      };
    })
    .filter(Boolean)
    .slice(0, limit);
  return { source: 'wikimedia', items };
}

// ---------- Adapter: Mercado Libre (sólo con token OAuth) ----------
async function searchMercadoLibre(q, limit) {
  const token = process.env.MERCADOLIBRE_TOKEN || process.env.ML_ACCESS_TOKEN;
  if (!token || !q) return { source: 'mercadolibre', items: [], skipped: !token ? 'no_token' : 'no_query' };
  const site = process.env.MERCADOLIBRE_SITE || 'MLM'; // MLM=México
  const url = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 20)}`;
  const data = await fetchJSON(url, DEFAULT_TIMEOUT, { Authorization: `Bearer ${token}` });
  if (!data || !Array.isArray(data.results)) return { source: 'mercadolibre', items: [] };
  const items = data.results.slice(0, limit).map(r => ({
    name: clean(r.title).slice(0, 120),
    brand: null,
    price: typeof r.price === 'number' ? r.price : null,
    currency: clean(r.currency_id) || null,
    image: isUrl(r.thumbnail) ? r.thumbnail.replace(/^http:/, 'https:') : null,
    image_alt: [],
    source: 'mercadolibre',
    ref_url: isUrl(r.permalink) ? r.permalink : null,
    category: clean(r.category_id) || null,
    description: null,
  })).filter(x => x.name && x.image);
  return { source: 'mercadolibre', items };
}

// ---------- Combiner ----------
function dedupeByImage(items) {
  const seen = new Set();
  return items.filter(it => {
    const k = (it.image || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Búsqueda combinada en paralelo. Returns { results, sources_tried }.
 *
 * Estrategia:
 *   - DummyJSON, OFF, ML reciben la query RAW (sus catálogos no entienden
 *     palabras genéricas como "ropa" o "tienda" agregadas como contexto).
 *   - Wikimedia recibe la query con el giro, porque le ayuda a desambiguar
 *     (ej: "calcetines ropa" devuelve mejores resultados que "calcetines").
 *   - Wikimedia se rankea ÚLTIMO porque devuelve mucho ruido en queries
 *     genéricas (ej: "smartphone" → "Electronic junk separation").
 *   - El cliente puede filtrar source si quiere sólo product-photos.
 */
// Diccionario mínimo ES→EN para mejorar hits en catálogos en inglés (DummyJSON)
const ES_EN = {
  calcetines: 'socks',         calcetín: 'sock',
  zapatos: 'shoes',            zapato: 'shoe',
  camisa: 'shirt',             camiseta: 't-shirt',
  pantalón: 'pants',           pantalones: 'pants',
  vestido: 'dress',            falda: 'skirt',
  chaqueta: 'jacket',          abrigo: 'coat',
  reloj: 'watch',              gafas: 'glasses', lentes: 'glasses',
  bolso: 'bag', bolsa: 'bag', mochila: 'backpack',
  perfume: 'perfume',          maquillaje: 'makeup',
  shampoo: 'shampoo',          champú: 'shampoo',
  jabón: 'soap',
  laptop: 'laptop',            celular: 'phone', móvil: 'phone',
  teléfono: 'phone',
  audífonos: 'headphones', auriculares: 'headphones',
  tornillo: 'screw',           martillo: 'hammer',
  taladro: 'drill',            destornillador: 'screwdriver',
  silla: 'chair',              mesa: 'table',
  cama: 'bed',                 sofá: 'sofa',
  refresco: 'soda',            gaseosa: 'soda',
  cerveza: 'beer',             vino: 'wine',
  café: 'coffee',               leche: 'milk',
  pan: 'bread',                queso: 'cheese',
  carne: 'meat',               pollo: 'chicken',
  fruta: 'fruit',              verdura: 'vegetable',
};
function translateES(q) {
  const w = String(q || '').toLowerCase().trim();
  if (ES_EN[w]) return ES_EN[w];
  // Traducir palabra por palabra si hay matches
  const parts = w.split(/\s+/).map(p => ES_EN[p] || p);
  return parts.join(' ');
}

async function searchPublic({ q, giro, limit }) {
  const lim = Math.max(1, Math.min(Number(limit) || 8, 24));
  const rawQ = String(q || '').trim();
  if (!rawQ) return { results: [], sources_tried: [] };
  const enQ = translateES(rawQ); // versión inglés (igual a rawQ si no hay match)

  // Disparar todas las fuentes en paralelo (cada una con su query óptima)
  const promises = [
    searchDummyJSON(enQ, lim),        // catálogo inglés → query traducida
    searchOFF(rawQ, lim),             // OFF acepta multi-idioma con search_terms
    searchMercadoLibre(rawQ, lim),    // MX, español preferido
    searchWikimedia(rawQ, lim),       // Wikipedia acepta multi-idioma
  ];

  const settled = await Promise.allSettled(promises);
  const tried = [];
  const allItems = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value) {
      tried.push(s.value.source + (s.value.skipped ? `(${s.value.skipped})` : `:${s.value.items.length}`));
      if (Array.isArray(s.value.items)) allItems.push(...s.value.items);
    }
  }

  // Dedupe por URL de imagen
  const unique = dedupeByImage(allItems);

  // Ordenar por score: precio (+3), marca (+1), descripción (+1),
  // fuente confiable (+2 para dummyjson/off/ml, +0 para wikimedia)
  const SOURCE_RANK = { mercadolibre: 4, dummyjson: 3, off: 3, wikimedia: 0 };
  unique.sort((a, b) => {
    const score = (it) => (it.price != null ? 3 : 0)
                       + (it.brand ? 1 : 0)
                       + (it.description ? 1 : 0)
                       + (SOURCE_RANK[it.source] || 0);
    return score(b) - score(a);
  });

  return { results: unique.slice(0, lim), sources_tried: tried };
}

/**
 * Handler estilo Node HTTP nativo (compatible con el `handlers` map del proyecto).
 * Recibe (req, res), helpers (sendJSON, etc.) son parámetros para no acoplar a index.js.
 */
function createHandler({ sendJSON, sendError, parseQuery }) {
  return async function handler(req, res) {
    const t0 = Date.now();
    try {
      const qs = parseQuery(req.url);
      const q = String(qs.q || qs.query || '').trim();
      const giro = String(qs.giro || '').trim();
      const limit = qs.limit;
      if (!q || q.length < 2) {
        return sendJSON(res, { error: 'q requerido (mínimo 2 caracteres)', query: q }, 400);
      }

      const ck = cacheKey(q, giro, limit);
      const hit = cacheGet(ck);
      if (hit) {
        return sendJSON(res, { ...hit, cache_hit: true, ms: Date.now() - t0 });
      }

      const out = await searchPublic({ q, giro, limit });
      const payload = {
        query: q,
        giro: giro || null,
        results: out.results,
        sources_tried: out.sources_tried,
        cache_hit: false,
        ms: Date.now() - t0,
      };
      cacheSet(ck, payload);
      return sendJSON(res, payload);
    } catch (err) {
      try { sendError(res, err); } catch (_) { sendJSON(res, { error: 'internal' }, 500); }
    }
  };
}

module.exports = {
  createHandler,
  searchPublic,
  // expuestos para tests:
  searchDummyJSON,
  searchOFF,
  searchWikimedia,
  searchMercadoLibre,
};
