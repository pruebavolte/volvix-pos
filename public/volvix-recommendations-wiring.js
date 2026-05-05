/**
 * volvix-recommendations-wiring.js
 * Volvix POS — Recommendations Engine
 * Agent-36 / Ronda 8 Fibonacci
 *
 * Provides:
 *   - Frequently Bought Together (FBT)
 *   - Similar Products (content-based)
 *   - Trending Products
 *   - Customer-based (collaborative filtering)
 *   - Cross-sell at checkout
 *   - Up-sell (more expensive alternatives)
 *   - Recommended For You (personalized hybrid)
 *
 * Algorithms: Collaborative Filtering (user-user & item-item) + Content-Based.
 * Data source: /api/sales (cached locally).
 * Public API: window.RecommendAPI
 */
(function (global) {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ────────────────────────────────────────────────────────────────────────
  const CONFIG = {
    SALES_ENDPOINT: '/api/sales',
    PRODUCTS_ENDPOINT: '/api/products',
    CACHE_TTL_MS: 5 * 60 * 1000,
    MIN_SUPPORT: 2,
    MIN_CONFIDENCE: 0.15,
    TRENDING_WINDOW_DAYS: 14,
    MAX_RECOMMENDATIONS: 8,
    UPSELL_PRICE_RATIO_MIN: 1.15,
    UPSELL_PRICE_RATIO_MAX: 2.5,
    SIMILARITY_THRESHOLD: 0.05,
    PERSONALIZATION_WEIGHT: 0.6,
    POPULAR_WEIGHT: 0.4,
    LOG_PREFIX: '[RecommendAPI]'
  };

  const STATE = {
    sales: [],
    products: [],
    productIndex: new Map(),
    lastFetch: 0,
    fbtMatrix: new Map(),
    itemSimilarity: new Map(),
    userVectors: new Map(),
    trending: [],
    ready: false
  };

  // ────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ────────────────────────────────────────────────────────────────────────
  function log(...args) {
    if (global.console) console.log(CONFIG.LOG_PREFIX, ...args);
  }
  function warn(...args) {
    if (global.console) console.warn(CONFIG.LOG_PREFIX, ...args);
  }
  function err(...args) {
    if (global.console) console.error(CONFIG.LOG_PREFIX, ...args);
  }

  function daysBetween(a, b) {
    return Math.abs((new Date(a) - new Date(b)) / 86400000);
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function topN(arr, n, scoreFn) {
    return arr
      .map(x => ({ item: x, score: scoreFn ? scoreFn(x) : x.score || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  function safeFetch(url) {
    if (typeof global.fetch !== 'function') {
      return Promise.reject(new Error('fetch not available'));
    }
    return global.fetch(url, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  // ────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ────────────────────────────────────────────────────────────────────────
  async function loadSales(force) {
    const fresh = Date.now() - STATE.lastFetch < CONFIG.CACHE_TTL_MS;
    if (!force && fresh && STATE.sales.length) return STATE.sales;
    try {
      const data = await safeFetch(CONFIG.SALES_ENDPOINT);
      STATE.sales = Array.isArray(data) ? data : (data.sales || data.data || []);
      STATE.lastFetch = Date.now();
      log('Loaded', STATE.sales.length, 'sales');
    } catch (e) {
      warn('Sales fetch failed, using local fallback:', e.message);
      STATE.sales = readLocalSales();
    }
    return STATE.sales;
  }

  async function loadProducts(force) {
    if (!force && STATE.products.length) return STATE.products;
    try {
      const data = await safeFetch(CONFIG.PRODUCTS_ENDPOINT);
      STATE.products = Array.isArray(data) ? data : (data.products || []);
    } catch (e) {
      warn('Products fetch failed:', e.message);
      STATE.products = readLocalProducts();
    }
    STATE.productIndex.clear();
    STATE.products.forEach(p => STATE.productIndex.set(String(p.id), p));
    return STATE.products;
  }

  function readLocalSales() {
    try {
      const raw = global.localStorage && global.localStorage.getItem('volvix_sales');
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function readLocalProducts() {
    try {
      const raw = global.localStorage && global.localStorage.getItem('volvix_products');
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function getProduct(id) {
    return STATE.productIndex.get(String(id)) || null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // INDEX BUILDING
  // ────────────────────────────────────────────────────────────────────────
  function buildFBTMatrix() {
    const matrix = new Map();
    const supportCount = new Map();

    STATE.sales.forEach(sale => {
      const items = unique((sale.items || []).map(i => String(i.productId || i.id)));
      items.forEach(id => supportCount.set(id, (supportCount.get(id) || 0) + 1));
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          addPair(matrix, items[i], items[j]);
          addPair(matrix, items[j], items[i]);
        }
      }
    });

    // Convert raw co-counts to confidence scores
    matrix.forEach((map, a) => {
      const supA = supportCount.get(a) || 1;
      map.forEach((count, b) => {
        if (count < CONFIG.MIN_SUPPORT) {
          map.delete(b);
          return;
        }
        const conf = count / supA;
        if (conf < CONFIG.MIN_CONFIDENCE) {
          map.delete(b);
        } else {
          map.set(b, conf);
        }
      });
    });

    STATE.fbtMatrix = matrix;
    log('FBT matrix:', matrix.size, 'anchors');
  }

  function addPair(matrix, a, b) {
    if (!matrix.has(a)) matrix.set(a, new Map());
    const m = matrix.get(a);
    m.set(b, (m.get(b) || 0) + 1);
  }

  function buildUserVectors() {
    const users = new Map();
    STATE.sales.forEach(sale => {
      const uid = sale.userId || sale.customerId || sale.customer || 'guest';
      if (!users.has(uid)) users.set(uid, new Map());
      const v = users.get(uid);
      (sale.items || []).forEach(it => {
        const pid = String(it.productId || it.id);
        v.set(pid, (v.get(pid) || 0) + (it.qty || 1));
      });
    });
    STATE.userVectors = users;
    log('User vectors:', users.size);
  }

  function buildItemSimilarity() {
    // Cosine similarity between items based on user purchase vectors.
    const itemUsers = new Map();
    STATE.userVectors.forEach((vec, uid) => {
      vec.forEach((qty, pid) => {
        if (!itemUsers.has(pid)) itemUsers.set(pid, new Map());
        itemUsers.get(pid).set(uid, qty);
      });
    });

    const sim = new Map();
    const items = Array.from(itemUsers.keys());
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const va = itemUsers.get(a);
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const vb = itemUsers.get(b);
        const s = cosine(va, vb);
        if (s >= CONFIG.SIMILARITY_THRESHOLD) {
          if (!sim.has(a)) sim.set(a, new Map());
          if (!sim.has(b)) sim.set(b, new Map());
          sim.get(a).set(b, s);
          sim.get(b).set(a, s);
        }
      }
    }
    STATE.itemSimilarity = sim;
    log('Item similarity entries:', sim.size);
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    a.forEach((v) => { na += v * v; });
    b.forEach((v) => { nb += v * v; });
    a.forEach((v, k) => {
      if (b.has(k)) dot += v * b.get(k);
    });
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  function buildTrending() {
    const cutoff = Date.now() - CONFIG.TRENDING_WINDOW_DAYS * 86400000;
    const counts = new Map();
    STATE.sales.forEach(sale => {
      const t = new Date(sale.date || sale.createdAt || Date.now()).getTime();
      if (t < cutoff) return;
      (sale.items || []).forEach(it => {
        const pid = String(it.productId || it.id);
        const w = (it.qty || 1) * Math.exp(-(Date.now() - t) / (CONFIG.TRENDING_WINDOW_DAYS * 86400000));
        counts.set(pid, (counts.get(pid) || 0) + w);
      });
    });
    STATE.trending = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([pid, score]) => ({ productId: pid, score }));
    log('Trending products:', STATE.trending.length);
  }

  // ────────────────────────────────────────────────────────────────────────
  // CONTENT-BASED SIMILARITY (categories, tags, price band)
  // ────────────────────────────────────────────────────────────────────────
  function contentSimilarity(a, b) {
    if (!a || !b || a.id === b.id) return 0;
    let score = 0;
    if (a.category && a.category === b.category) score += 0.5;
    if (a.brand && a.brand === b.brand) score += 0.2;
    const ta = new Set(a.tags || []);
    const tb = new Set(b.tags || []);
    if (ta.size && tb.size) {
      let inter = 0;
      ta.forEach(t => { if (tb.has(t)) inter++; });
      const union = new Set([...ta, ...tb]).size;
      score += 0.2 * (inter / union);
    }
    if (a.price && b.price) {
      const ratio = Math.min(a.price, b.price) / Math.max(a.price, b.price);
      score += 0.1 * ratio;
    }
    return score;
  }

  // ────────────────────────────────────────────────────────────────────────
  // RECOMMENDERS
  // ────────────────────────────────────────────────────────────────────────
  function frequentlyBoughtTogether(productId, limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    const id = String(productId);
    const map = STATE.fbtMatrix.get(id);
    if (!map) return [];
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, conf]) => ({
        productId: pid,
        product: getProduct(pid),
        score: conf,
        reason: 'frequently_bought_together'
      }))
      .filter(r => r.product);
  }

  function similarProducts(productId, limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    const anchor = getProduct(productId);
    if (!anchor) return [];
    // Hybrid: collaborative item-similarity + content similarity
    const collab = STATE.itemSimilarity.get(String(productId)) || new Map();
    const scores = new Map();
    collab.forEach((s, pid) => scores.set(pid, (scores.get(pid) || 0) + s * 0.7));
    STATE.products.forEach(p => {
      if (String(p.id) === String(productId)) return;
      const s = contentSimilarity(anchor, p);
      if (s > 0) scores.set(String(p.id), (scores.get(String(p.id)) || 0) + s * 0.3);
    });
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, score]) => ({
        productId: pid,
        product: getProduct(pid),
        score,
        reason: 'similar_product'
      }))
      .filter(r => r.product);
  }

  function trendingProducts(limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    return STATE.trending.slice(0, limit).map(t => ({
      productId: t.productId,
      product: getProduct(t.productId),
      score: t.score,
      reason: 'trending'
    })).filter(r => r.product);
  }

  function customerBased(userId, limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    const target = STATE.userVectors.get(userId);
    if (!target) return trendingProducts(limit);
    // Find K nearest neighbours
    const sims = [];
    STATE.userVectors.forEach((vec, uid) => {
      if (uid === userId) return;
      const s = cosine(target, vec);
      if (s > 0) sims.push({ uid, score: s });
    });
    sims.sort((a, b) => b.score - a.score);
    const neighbours = sims.slice(0, 25);
    const candidate = new Map();
    neighbours.forEach(({ uid, score }) => {
      const v = STATE.userVectors.get(uid);
      v.forEach((qty, pid) => {
        if (target.has(pid)) return;   // already bought
        candidate.set(pid, (candidate.get(pid) || 0) + qty * score);
      });
    });
    return Array.from(candidate.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, score]) => ({
        productId: pid,
        product: getProduct(pid),
        score,
        reason: 'customers_like_you'
      }))
      .filter(r => r.product);
  }

  function crossSell(cartItems, limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    const cartIds = new Set((cartItems || []).map(i => String(i.productId || i.id)));
    const scores = new Map();
    cartIds.forEach(pid => {
      frequentlyBoughtTogether(pid, 25).forEach(rec => {
        if (cartIds.has(rec.productId)) return;
        scores.set(rec.productId, (scores.get(rec.productId) || 0) + rec.score);
      });
    });
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, score]) => ({
        productId: pid,
        product: getProduct(pid),
        score,
        reason: 'cross_sell'
      }))
      .filter(r => r.product);
  }

  function upSell(productId, limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    const anchor = getProduct(productId);
    if (!anchor || !anchor.price) return [];
    const minP = anchor.price * CONFIG.UPSELL_PRICE_RATIO_MIN;
    const maxP = anchor.price * CONFIG.UPSELL_PRICE_RATIO_MAX;
    const candidates = STATE.products.filter(p => {
      if (String(p.id) === String(productId)) return false;
      if (!p.price) return false;
      if (p.price < minP || p.price > maxP) return false;
      if (anchor.category && p.category !== anchor.category) return false;
      return true;
    });
    return candidates
      .map(p => ({
        productId: String(p.id),
        product: p,
        score: contentSimilarity(anchor, p) + (p.rating || 0) * 0.1,
        reason: 'up_sell'
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function recommendedForYou(userId, limit) {
    limit = limit || CONFIG.MAX_RECOMMENDATIONS;
    const personal = customerBased(userId, limit * 2);
    const popular = trendingProducts(limit * 2);
    const merged = new Map();
    personal.forEach(r => {
      merged.set(r.productId, {
        ...r,
        score: r.score * CONFIG.PERSONALIZATION_WEIGHT,
        reason: 'recommended_for_you'
      });
    });
    popular.forEach(r => {
      const existing = merged.get(r.productId);
      const w = r.score * CONFIG.POPULAR_WEIGHT;
      if (existing) existing.score += w;
      else merged.set(r.productId, { ...r, score: w, reason: 'recommended_for_you' });
    });
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ────────────────────────────────────────────────────────────────────────
  // ORCHESTRATION
  // ────────────────────────────────────────────────────────────────────────
  async function init(opts) {
    opts = opts || {};
    if (opts.salesEndpoint) CONFIG.SALES_ENDPOINT = opts.salesEndpoint;
    if (opts.productsEndpoint) CONFIG.PRODUCTS_ENDPOINT = opts.productsEndpoint;
    log('Initializing recommendations engine...');
    await Promise.all([loadSales(true), loadProducts(true)]);
    rebuildIndexes();
    STATE.ready = true;
    log('Engine ready.');
    return true;
  }

  function rebuildIndexes() {
    buildFBTMatrix();
    buildUserVectors();
    buildItemSimilarity();
    buildTrending();
  }

  async function refresh() {
    await loadSales(true);
    await loadProducts(true);
    rebuildIndexes();
    return true;
  }

  function track(event) {
    // Lightweight client-side event recorder, e.g. impressions / clicks
    try {
      const buf = JSON.parse(global.localStorage.getItem('volvix_recommend_events') || '[]');
      buf.push({ ...event, ts: Date.now() });
      if (buf.length > 500) buf.splice(0, buf.length - 500);
      global.localStorage.setItem('volvix_recommend_events', JSON.stringify(buf));
    } catch (e) { /* ignore */ }
  }

  function status() {
    return {
      ready: STATE.ready,
      sales: STATE.sales.length,
      products: STATE.products.length,
      users: STATE.userVectors.size,
      fbtAnchors: STATE.fbtMatrix.size,
      itemSimilarityEntries: STATE.itemSimilarity.size,
      trending: STATE.trending.length,
      lastFetch: STATE.lastFetch
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────────────────────
  const RecommendAPI = {
    init,
    refresh,
    status,
    track,
    config: CONFIG,
    frequentlyBoughtTogether,
    similarProducts,
    trending: trendingProducts,
    customerBased,
    crossSell,
    upSell,
    recommendedForYou,
    // Utility passthroughs
    _state: STATE,
    _internals: {
      cosine,
      contentSimilarity,
      buildFBTMatrix,
      buildUserVectors,
      buildItemSimilarity,
      buildTrending
    }
  };

  global.RecommendAPI = RecommendAPI;

  // Auto-init if document is ready and endpoints exist
  if (global.document && global.document.readyState !== 'loading') {
    setTimeout(() => init().catch(e => err('auto-init failed', e)), 0);
  } else if (global.document) {
    global.document.addEventListener('DOMContentLoaded', () => {
      init().catch(e => err('auto-init failed', e));
    });
  }

  log('volvix-recommendations-wiring.js loaded. window.RecommendAPI ready.');
})(typeof window !== 'undefined' ? window : globalThis);
