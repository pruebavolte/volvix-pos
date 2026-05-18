/* ============================================================
 * volvix-drinks-wiring.js
 * Bar / Drinks module: cocktail recipes, ABV calculation,
 * draft beer pouring, happy hour pricing.
 * Exposes: window.DrinksAPI
 * ============================================================ */
(function (global) {
  'use strict';

  // -----------------------------
  // Internal state
  // -----------------------------
  const STATE = {
    cocktails: new Map(),       // id -> cocktail recipe
    ingredients: new Map(),     // id -> { name, abv, stock_ml, cost_per_ml }
    taps: new Map(),            // tap_id -> { beer, keg_ml_left, keg_capacity_ml, abv, price }
    happyHour: {
      enabled: false,
      startHour: 17,            // 5pm
      endHour: 20,              // 8pm
      discountPct: 25,
      appliesTo: ['cocktail', 'beer']
    },
    pourLog: [],                // audit trail of every pour
    salesLog: []                // sales events
  };

  const POUR_SIZES = {
    shot: 44,        // ml (1.5oz)
    double: 88,
    rocks: 60,
    highball: 120,
    pint: 473,       // 16oz
    half_pint: 237,
    schooner: 355
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function nowIso() { return new Date().toISOString(); }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function round2(n) { return Math.round(n * 100) / 100; }

  // -----------------------------
  // Ingredient registry
  // -----------------------------
  function registerIngredient(spec) {
    if (!spec || !spec.name) throw new Error('ingredient.name required');
    const id = spec.id || uid('ing');
    const ing = {
      id,
      name: spec.name,
      abv: clamp(Number(spec.abv) || 0, 0, 100),       // % alcohol
      stock_ml: Math.max(0, Number(spec.stock_ml) || 0),
      cost_per_ml: Math.max(0, Number(spec.cost_per_ml) || 0),
      category: spec.category || 'spirit'
    };
    STATE.ingredients.set(id, ing);
    return ing;
  }

  function getIngredient(id) {
    const ing = STATE.ingredients.get(id);
    if (!ing) throw new Error('ingredient not found: ' + id);
    return ing;
  }

  function adjustStock(id, deltaMl) {
    const ing = getIngredient(id);
    ing.stock_ml = Math.max(0, ing.stock_ml + deltaMl);
    return ing.stock_ml;
  }

  // -----------------------------
  // Cocktail recipes
  // -----------------------------
  /**
   * spec.components: [{ ingredient_id, ml }]
   * spec.glass, spec.method ('shake'|'stir'|'build'|'blend')
   * spec.dilutionPct: extra water/ice dilution percentage (default by method)
   */
  function registerCocktail(spec) {
    if (!spec || !spec.name) throw new Error('cocktail.name required');
    if (!Array.isArray(spec.components) || !spec.components.length)
      throw new Error('cocktail.components required');
    const id = spec.id || uid('cock');
    const dilutionDefaults = { shake: 25, stir: 20, build: 10, blend: 30 };
    const cocktail = {
      id,
      name: spec.name,
      glass: spec.glass || 'rocks',
      method: spec.method || 'build',
      components: spec.components.map(c => ({
        ingredient_id: c.ingredient_id,
        ml: Math.max(0, Number(c.ml) || 0)
      })),
      dilutionPct: spec.dilutionPct != null
        ? Number(spec.dilutionPct)
        : (dilutionDefaults[spec.method] || 15),
      garnish: spec.garnish || null,
      basePrice: Math.max(0, Number(spec.basePrice) || 0)
    };
    STATE.cocktails.set(id, cocktail);
    return cocktail;
  }

  /**
   * ABV = sum(ml_i * abv_i) / total_volume_after_dilution
   * Also returns cost.
   */
  function computeCocktailMetrics(cocktailId) {
    const c = STATE.cocktails.get(cocktailId);
    if (!c) throw new Error('cocktail not found: ' + cocktailId);
    let alcoholMl = 0, baseVolMl = 0, costCents = 0;
    for (const comp of c.components) {
      const ing = getIngredient(comp.ingredient_id);
      alcoholMl += comp.ml * (ing.abv / 100);
      baseVolMl += comp.ml;
      costCents += comp.ml * ing.cost_per_ml * 100;
    }
    const totalVol = baseVolMl * (1 + c.dilutionPct / 100);
    const abv = totalVol > 0 ? (alcoholMl / totalVol) * 100 : 0;
    const standardDrinks = alcoholMl / 17.7; // 14g pure alcohol ~= 17.7ml
    return {
      id: c.id,
      name: c.name,
      baseVolMl: round2(baseVolMl),
      finalVolMl: round2(totalVol),
      alcoholMl: round2(alcoholMl),
      abv: round2(abv),
      standardDrinks: round2(standardDrinks),
      costUsd: round2(costCents / 100),
      pourCostPct: c.basePrice > 0
        ? round2(((costCents / 100) / c.basePrice) * 100)
        : null
    };
  }

  function makeCocktail(cocktailId, opts) {
    const c = STATE.cocktails.get(cocktailId);
    if (!c) throw new Error('cocktail not found: ' + cocktailId);
    // Check stock
    for (const comp of c.components) {
      const ing = getIngredient(comp.ingredient_id);
      if (ing.stock_ml < comp.ml)
        throw new Error('insufficient ' + ing.name + ' (need ' +
          comp.ml + 'ml, have ' + ing.stock_ml + 'ml)');
    }
    // Deduct
    for (const comp of c.components) adjustStock(comp.ingredient_id, -comp.ml);
    const metrics = computeCocktailMetrics(cocktailId);
    const price = applyHappyHour(c.basePrice, 'cocktail', opts && opts.at);
    const event = {
      id: uid('sale'),
      type: 'cocktail',
      ref: cocktailId,
      name: c.name,
      price: price,
      metrics,
      at: nowIso(),
      bartender: (opts && opts.bartender) || null
    };
    STATE.salesLog.push(event);
    return event;
  }

  // -----------------------------
  // Draft beer / taps
  // -----------------------------
  function registerTap(spec) {
    if (!spec || !spec.tap_id) throw new Error('tap_id required');
    const tap = {
      tap_id: spec.tap_id,
      beer: spec.beer || 'Unknown',
      style: spec.style || 'lager',
      abv: clamp(Number(spec.abv) || 0, 0, 100),
      keg_capacity_ml: Math.max(0, Number(spec.keg_capacity_ml) || 19550), // 1/2 barrel
      keg_ml_left: Math.max(0, Number(spec.keg_ml_left) ||
        Number(spec.keg_capacity_ml) || 19550),
      pricePerPint: Math.max(0, Number(spec.pricePerPint) || 0),
      foamFactor: clamp(Number(spec.foamFactor) || 0.05, 0, 0.5)
    };
    STATE.taps.set(tap.tap_id, tap);
    return tap;
  }

  function pourBeer(tap_id, sizeOrMl, opts) {
    const tap = STATE.taps.get(tap_id);
    if (!tap) throw new Error('tap not found: ' + tap_id);
    const ml = typeof sizeOrMl === 'number'
      ? sizeOrMl
      : (POUR_SIZES[sizeOrMl] || POUR_SIZES.pint);
    // Real liquid drawn from keg includes foam waste
    const drawn = ml * (1 + tap.foamFactor);
    if (tap.keg_ml_left < drawn)
      throw new Error('keg ' + tap_id + ' nearly empty (' +
        tap.keg_ml_left + 'ml left, need ' + round2(drawn) + 'ml)');
    tap.keg_ml_left = Math.max(0, tap.keg_ml_left - drawn);

    const sizeName = typeof sizeOrMl === 'string' ? sizeOrMl : 'custom';
    const basePrice = sizeName === 'pint'
      ? tap.pricePerPint
      : tap.pricePerPint * (ml / POUR_SIZES.pint);
    const price = applyHappyHour(basePrice, 'beer', opts && opts.at);
    const alcoholMl = ml * (tap.abv / 100);

    const event = {
      id: uid('pour'),
      type: 'beer',
      tap_id,
      beer: tap.beer,
      sizeName,
      poured_ml: round2(ml),
      drawn_ml: round2(drawn),
      keg_ml_left: round2(tap.keg_ml_left),
      keg_pct_left: round2((tap.keg_ml_left / tap.keg_capacity_ml) * 100),
      abv: tap.abv,
      alcoholMl: round2(alcoholMl),
      standardDrinks: round2(alcoholMl / 17.7),
      price: round2(price),
      at: nowIso(),
      bartender: (opts && opts.bartender) || null
    };
    STATE.pourLog.push(event);
    STATE.salesLog.push(event);
    if (event.keg_pct_left < 15) event.warn = 'KEG_LOW';
    return event;
  }

  function tapStatus(tap_id) {
    if (tap_id) {
      const t = STATE.taps.get(tap_id);
      if (!t) return null;
      return {
        ...t,
        keg_pct_left: round2((t.keg_ml_left / t.keg_capacity_ml) * 100)
      };
    }
    return Array.from(STATE.taps.values()).map(t => ({
      ...t,
      keg_pct_left: round2((t.keg_ml_left / t.keg_capacity_ml) * 100)
    }));
  }

  function changeKeg(tap_id, newCapacityMl) {
    const tap = STATE.taps.get(tap_id);
    if (!tap) throw new Error('tap not found: ' + tap_id);
    const cap = newCapacityMl != null
      ? Number(newCapacityMl)
      : tap.keg_capacity_ml;
    tap.keg_capacity_ml = cap;
    tap.keg_ml_left = cap;
    return tap;
  }

  // -----------------------------
  // Happy hour
  // -----------------------------
  function setHappyHour(cfg) {
    Object.assign(STATE.happyHour, cfg || {});
    return STATE.happyHour;
  }

  function isHappyHour(at) {
    const hh = STATE.happyHour;
    if (!hh.enabled) return false;
    const d = at ? new Date(at) : new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    if (hh.startHour <= hh.endHour)
      return h >= hh.startHour && h < hh.endHour;
    // wraps midnight
    return h >= hh.startHour || h < hh.endHour;
  }

  function applyHappyHour(price, kind, at) {
    if (!price) return 0;
    if (!isHappyHour(at)) return round2(price);
    if (!STATE.happyHour.appliesTo.includes(kind)) return round2(price);
    const off = STATE.happyHour.discountPct / 100;
    return round2(price * (1 - off));
  }

  // -----------------------------
  // Reporting
  // -----------------------------
  function salesSummary() {
    const summary = { count: 0, revenue: 0, byType: {}, alcoholMl: 0 };
    for (const s of STATE.salesLog) {
      summary.count++;
      summary.revenue += s.price || 0;
      summary.byType[s.type] = (summary.byType[s.type] || 0) + 1;
      const a = (s.metrics && s.metrics.alcoholMl) || s.alcoholMl || 0;
      summary.alcoholMl += a;
    }
    summary.revenue = round2(summary.revenue);
    summary.alcoholMl = round2(summary.alcoholMl);
    return summary;
  }

  function lowStockAlerts(thresholdMl) {
    const t = thresholdMl || 200;
    const ingLow = Array.from(STATE.ingredients.values())
      .filter(i => i.stock_ml < t)
      .map(i => ({ kind: 'ingredient', id: i.id, name: i.name, stock_ml: i.stock_ml }));
    const tapLow = Array.from(STATE.taps.values())
      .filter(tp => (tp.keg_ml_left / tp.keg_capacity_ml) < 0.15)
      .map(tp => ({
        kind: 'tap', tap_id: tp.tap_id, beer: tp.beer,
        keg_pct_left: round2((tp.keg_ml_left / tp.keg_capacity_ml) * 100)
      }));
    return [...ingLow, ...tapLow];
  }

  // -----------------------------
  // Public API
  // -----------------------------
  const DrinksAPI = {
    POUR_SIZES,
    // ingredients
    registerIngredient, getIngredient, adjustStock,
    // cocktails
    registerCocktail, computeCocktailMetrics, makeCocktail,
    // taps
    registerTap, pourBeer, tapStatus, changeKeg,
    // pricing
    setHappyHour, isHappyHour, applyHappyHour,
    // reports
    salesSummary, lowStockAlerts,
    // raw state (read-only-ish)
    _state: STATE
  };

  global.DrinksAPI = DrinksAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = DrinksAPI;
})(typeof window !== 'undefined' ? window : globalThis);
