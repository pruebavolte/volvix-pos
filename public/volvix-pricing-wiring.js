/* ============================================================================
 * volvix-pricing-wiring.js
 * Volvix POS — Pricing Engine
 * ----------------------------------------------------------------------------
 * Reglas de precio: volumen, cliente VIP, hora del día, día semana, festivo.
 * Price lists múltiples, dynamic pricing, happy hour.
 * Expone: window.PricingAPI
 * ============================================================================ */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // STORAGE KEYS
  // ---------------------------------------------------------------------------
  const LS_PRICE_LISTS = 'volvix_price_lists';
  const LS_RULES       = 'volvix_pricing_rules';
  const LS_HOLIDAYS    = 'volvix_holidays';
  const LS_HAPPY       = 'volvix_happy_hours';
  const LS_VIP         = 'volvix_vip_tiers';
  const LS_DYN         = 'volvix_dynamic_config';
  const LS_ACTIVE_LIST = 'volvix_active_price_list';
  const LS_LOG         = 'volvix_pricing_log';

  // ---------------------------------------------------------------------------
  // UTIL
  // ---------------------------------------------------------------------------
  const _read = (k, def) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch (e) { console.warn('[Pricing] read fail', k, e); return def; }
  };
  const _write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { console.warn('[Pricing] write fail', k, e); return false; }
  };
  const _round = (n, d = 2) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  const _uid   = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  const _clone = (o) => JSON.parse(JSON.stringify(o));
  const _now   = () => new Date();

  function _logEvent(type, payload) {
    const log = _read(LS_LOG, []);
    log.push({ ts: Date.now(), type, payload });
    if (log.length > 500) log.splice(0, log.length - 500);
    _write(LS_LOG, log);
  }

  // ---------------------------------------------------------------------------
  // PRICE LISTS
  // ---------------------------------------------------------------------------
  // Estructura: { id, name, currency, items: { [sku]: price }, default?: bool }
  function getPriceLists()       { return _read(LS_PRICE_LISTS, []); }
  function savePriceLists(lists) { return _write(LS_PRICE_LISTS, lists); }

  function createPriceList({ name, currency = 'MXN', items = {}, isDefault = false }) {
    const lists = getPriceLists();
    if (isDefault) lists.forEach(l => l.default = false);
    const list = { id: _uid('pl'), name, currency, items, default: isDefault, createdAt: Date.now() };
    lists.push(list);
    savePriceLists(lists);
    _logEvent('price_list_created', { id: list.id, name });
    return list;
  }

  function updatePriceList(id, patch) {
    const lists = getPriceLists();
    const i = lists.findIndex(l => l.id === id);
    if (i < 0) return null;
    if (patch.default) lists.forEach(l => l.default = false);
    lists[i] = Object.assign({}, lists[i], patch);
    savePriceLists(lists);
    return lists[i];
  }

  function deletePriceList(id) {
    const lists = getPriceLists().filter(l => l.id !== id);
    savePriceLists(lists);
    return true;
  }

  function setActivePriceList(id) { _write(LS_ACTIVE_LIST, id); return id; }
  function getActivePriceList() {
    const id = _read(LS_ACTIVE_LIST, null);
    const lists = getPriceLists();
    if (id) { const f = lists.find(l => l.id === id); if (f) return f; }
    return lists.find(l => l.default) || lists[0] || null;
  }

  function getBasePrice(sku, listId = null) {
    const lists = getPriceLists();
    const list  = listId ? lists.find(l => l.id === listId) : getActivePriceList();
    if (!list) return null;
    const p = list.items[sku];
    return (p == null) ? null : Number(p);
  }

  function setItemPrice(listId, sku, price) {
    const lists = getPriceLists();
    const i = lists.findIndex(l => l.id === listId);
    if (i < 0) return false;
    lists[i].items[sku] = Number(price);
    savePriceLists(lists);
    return true;
  }

  // ---------------------------------------------------------------------------
  // RULES (volumen / VIP / hora / día / festivo)
  // ---------------------------------------------------------------------------
  // Estructura genérica:
  // { id, type, name, enabled, priority, scope:{sku?,category?,listId?}, params:{...}, action:{type:'percent'|'fixed'|'override', value} }
  function getRules()       { return _read(LS_RULES, []); }
  function saveRules(rules) { return _write(LS_RULES, rules); }

  function addRule(rule) {
    const rules = getRules();
    rule.id        = rule.id || _uid('rule');
    rule.enabled   = rule.enabled !== false;
    rule.priority  = rule.priority || 100;
    rule.createdAt = Date.now();
    rules.push(rule);
    saveRules(rules);
    _logEvent('rule_added', { id: rule.id, type: rule.type });
    return rule;
  }

  function updateRule(id, patch) {
    const rules = getRules();
    const i = rules.findIndex(r => r.id === id);
    if (i < 0) return null;
    rules[i] = Object.assign({}, rules[i], patch);
    saveRules(rules);
    return rules[i];
  }

  function deleteRule(id) { saveRules(getRules().filter(r => r.id !== id)); return true; }

  // Helpers de creación rápida ------------------------------------------------
  function addVolumeRule({ name, scope = {}, tiers, priority = 50 }) {
    // tiers: [{ minQty, discountPct }] ordenados asc por minQty
    return addRule({
      type: 'volume', name: name || 'Volume discount',
      scope, params: { tiers: tiers.sort((a,b) => a.minQty - b.minQty) },
      action: { type: 'percent', value: 0 }, // se calcula dinámico
      priority
    });
  }

  function addVIPRule({ name, tier, discountPct, scope = {}, priority = 60 }) {
    return addRule({
      type: 'vip', name: name || `VIP ${tier}`,
      scope, params: { tier },
      action: { type: 'percent', value: discountPct }, priority
    });
  }

  function addHourRule({ name, fromHour, toHour, discountPct, scope = {}, priority = 70 }) {
    return addRule({
      type: 'hour', name: name || `Hour ${fromHour}-${toHour}`,
      scope, params: { fromHour, toHour },
      action: { type: 'percent', value: discountPct }, priority
    });
  }

  function addWeekdayRule({ name, weekdays, discountPct, scope = {}, priority = 70 }) {
    // weekdays: array 0(Dom)..6(Sab)
    return addRule({
      type: 'weekday', name: name || 'Weekday rule',
      scope, params: { weekdays },
      action: { type: 'percent', value: discountPct }, priority
    });
  }

  function addHolidayRule({ name, surchargePct, scope = {}, priority = 80 }) {
    return addRule({
      type: 'holiday', name: name || 'Holiday surcharge',
      scope, params: {},
      action: { type: 'percent', value: -Math.abs(surchargePct) }, // negativo = sube precio
      priority
    });
  }

  // ---------------------------------------------------------------------------
  // HOLIDAYS
  // ---------------------------------------------------------------------------
  function getHolidays()        { return _read(LS_HOLIDAYS, []); }
  function saveHolidays(arr)    { return _write(LS_HOLIDAYS, arr); }
  function addHoliday(dateISO, label = '') {
    const arr = getHolidays();
    arr.push({ date: dateISO, label });
    saveHolidays(arr);
    return arr;
  }
  function removeHoliday(dateISO) {
    saveHolidays(getHolidays().filter(h => h.date !== dateISO));
  }
  function isHoliday(d = _now()) {
    const iso = d.toISOString().slice(0, 10);
    return getHolidays().some(h => h.date === iso);
  }

  // ---------------------------------------------------------------------------
  // HAPPY HOUR
  // ---------------------------------------------------------------------------
  // { id, name, days:[0..6], from:'HH:MM', to:'HH:MM', discountPct, scope, enabled }
  function getHappyHours()      { return _read(LS_HAPPY, []); }
  function saveHappyHours(a)    { return _write(LS_HAPPY, a); }

  function addHappyHour({ name, days, from, to, discountPct, scope = {} }) {
    const arr = getHappyHours();
    const hh = { id: _uid('hh'), name, days, from, to, discountPct, scope, enabled: true };
    arr.push(hh); saveHappyHours(arr);
    return hh;
  }
  function removeHappyHour(id) { saveHappyHours(getHappyHours().filter(h => h.id !== id)); }

  function _hhActive(hh, d = _now()) {
    if (!hh.enabled) return false;
    if (hh.days && hh.days.length && !hh.days.includes(d.getDay())) return false;
    const [fh, fm] = hh.from.split(':').map(Number);
    const [th, tm] = hh.to.split(':').map(Number);
    const cur = d.getHours() * 60 + d.getMinutes();
    const f = fh * 60 + fm, t = th * 60 + tm;
    return f <= t ? (cur >= f && cur <= t) : (cur >= f || cur <= t);
  }

  // ---------------------------------------------------------------------------
  // VIP TIERS
  // ---------------------------------------------------------------------------
  // [{ tier:'gold', defaultDiscount:10, minSpend:5000 }]
  function getVIPTiers()    { return _read(LS_VIP, [
    { tier: 'silver', defaultDiscount: 5,  minSpend: 1000 },
    { tier: 'gold',   defaultDiscount: 10, minSpend: 5000 },
    { tier: 'platinum',defaultDiscount: 15, minSpend: 15000 }
  ]); }
  function saveVIPTiers(a)  { return _write(LS_VIP, a); }

  // ---------------------------------------------------------------------------
  // DYNAMIC PRICING
  // ---------------------------------------------------------------------------
  // Config: { enabled, demandFactorMax:0.2, stockSensitivity:0.15, baseStock:50 }
  function getDynamicConfig() {
    return _read(LS_DYN, { enabled: false, demandFactorMax: 0.2, stockSensitivity: 0.15, baseStock: 50 });
  }
  function setDynamicConfig(cfg) { return _write(LS_DYN, Object.assign(getDynamicConfig(), cfg)); }

  function _dynamicAdjust(price, ctx) {
    const cfg = getDynamicConfig();
    if (!cfg.enabled) return { price, factor: 0 };
    let factor = 0;
    // Demanda (ventas última hora del SKU si las hay en ctx)
    if (typeof ctx.recentSales === 'number') {
      const norm = Math.min(1, ctx.recentSales / 20);
      factor += norm * cfg.demandFactorMax;
    }
    // Stock (escasez sube precio, exceso baja)
    if (typeof ctx.stock === 'number') {
      const ratio = ctx.stock / cfg.baseStock;
      const stockAdj = (1 - Math.min(2, ratio)) * cfg.stockSensitivity;
      factor += stockAdj;
    }
    factor = Math.max(-0.3, Math.min(0.3, factor));
    return { price: _round(price * (1 + factor)), factor: _round(factor, 4) };
  }

  // ---------------------------------------------------------------------------
  // SCOPE MATCH
  // ---------------------------------------------------------------------------
  function _scopeMatches(scope, ctx) {
    if (!scope) return true;
    if (scope.sku      && scope.sku      !== ctx.sku)      return false;
    if (scope.category && scope.category !== ctx.category) return false;
    if (scope.listId   && scope.listId   !== ctx.listId)   return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // RULE EVALUATION
  // ---------------------------------------------------------------------------
  function _evalRule(rule, ctx) {
    if (!rule.enabled) return null;
    if (!_scopeMatches(rule.scope, ctx)) return null;
    const d = ctx.date || _now();

    switch (rule.type) {
      case 'volume': {
        const tiers = (rule.params.tiers || []).filter(t => ctx.qty >= t.minQty);
        if (!tiers.length) return null;
        const best = tiers[tiers.length - 1];
        return { type: 'percent', value: best.discountPct, label: `Vol ${best.minQty}+` };
      }
      case 'vip': {
        if (!ctx.customer || ctx.customer.vipTier !== rule.params.tier) return null;
        return { type: rule.action.type, value: rule.action.value, label: `VIP ${rule.params.tier}` };
      }
      case 'hour': {
        const h = d.getHours();
        const { fromHour, toHour } = rule.params;
        const active = fromHour <= toHour ? (h >= fromHour && h < toHour) : (h >= fromHour || h < toHour);
        if (!active) return null;
        return { type: rule.action.type, value: rule.action.value, label: rule.name };
      }
      case 'weekday': {
        if (!rule.params.weekdays.includes(d.getDay())) return null;
        return { type: rule.action.type, value: rule.action.value, label: rule.name };
      }
      case 'holiday': {
        if (!isHoliday(d)) return null;
        return { type: rule.action.type, value: rule.action.value, label: rule.name };
      }
      default: return null;
    }
  }

  function _applyAction(price, action) {
    if (!action) return price;
    switch (action.type) {
      case 'percent':  return price * (1 - action.value / 100);
      case 'fixed':    return Math.max(0, price - action.value);
      case 'override': return action.value;
      default:         return price;
    }
  }

  // ---------------------------------------------------------------------------
  // CORE: calcular precio
  // ---------------------------------------------------------------------------
  function calculatePrice(input) {
    // input: { sku, qty=1, category?, customer?, listId?, date?, stock?, recentSales? }
    const ctx = Object.assign({ qty: 1, date: _now() }, input);
    const list = ctx.listId ? getPriceLists().find(l => l.id === ctx.listId) : getActivePriceList();
    if (!list) return { error: 'no_price_list' };
    ctx.listId = list.id;

    const base = list.items[ctx.sku];
    if (base == null) return { error: 'sku_not_found', sku: ctx.sku };

    let price = Number(base);
    const applied = [];

    // 1) Reglas (ordenadas por priority desc)
    const rules = getRules().slice().sort((a, b) => b.priority - a.priority);
    for (const r of rules) {
      const res = _evalRule(r, ctx);
      if (res) {
        const before = price;
        price = _applyAction(price, res);
        applied.push({ rule: r.name, type: r.type, before: _round(before), after: _round(price), label: res.label });
      }
    }

    // 2) Happy Hour
    for (const hh of getHappyHours()) {
      if (_hhActive(hh, ctx.date) && _scopeMatches(hh.scope, ctx)) {
        const before = price;
        price = price * (1 - hh.discountPct / 100);
        applied.push({ rule: hh.name, type: 'happy_hour', before: _round(before), after: _round(price) });
      }
    }

    // 3) Dynamic pricing
    const dyn = _dynamicAdjust(price, ctx);
    if (dyn.factor !== 0) {
      applied.push({ rule: 'dynamic', type: 'dynamic', before: _round(price), after: _round(dyn.price), factor: dyn.factor });
      price = dyn.price;
    }

    const unit  = _round(price);
    const total = _round(unit * ctx.qty);

    return {
      sku: ctx.sku, qty: ctx.qty, currency: list.currency,
      basePrice: _round(base), unitPrice: unit, totalPrice: total,
      saving: _round((base - unit) * ctx.qty),
      applied, listId: list.id, listName: list.name, ts: Date.now()
    };
  }

  function calculateCart(items, sharedCtx = {}) {
    const lines = items.map(it => calculatePrice(Object.assign({}, sharedCtx, it)));
    const ok    = lines.filter(l => !l.error);
    const subtotal = _round(ok.reduce((s, l) => s + l.totalPrice, 0));
    const savings  = _round(ok.reduce((s, l) => s + (l.saving || 0), 0));
    return { lines, subtotal, savings, currency: ok[0]?.currency || 'MXN' };
  }

  // ---------------------------------------------------------------------------
  // SEED DEMO
  // ---------------------------------------------------------------------------
  function seedDemo() {
    if (getPriceLists().length) return false;
    const def = createPriceList({
      name: 'Lista General', currency: 'MXN', isDefault: true,
      items: { 'CAFE-AMER': 35, 'CAFE-LATTE': 55, 'CROISSANT': 28, 'PIZZA-IND': 120, 'CERVEZA': 45 }
    });
    createPriceList({
      name: 'Lista Mayoreo', currency: 'MXN',
      items: { 'CAFE-AMER': 28, 'CAFE-LATTE': 45, 'CROISSANT': 22, 'PIZZA-IND': 95, 'CERVEZA': 38 }
    });
    addVolumeRule({ name: 'Vol 5+/10+', tiers: [{ minQty: 5, discountPct: 5 }, { minQty: 10, discountPct: 10 }] });
    addVIPRule({ tier: 'gold', discountPct: 10 });
    addVIPRule({ tier: 'platinum', discountPct: 15 });
    addHourRule({ name: 'Madrugada', fromHour: 0, toHour: 6, discountPct: 8 });
    addWeekdayRule({ name: 'Martes 2x1 light', weekdays: [2], discountPct: 20 });
    addHolidayRule({ name: 'Festivo +10%', surchargePct: 10 });
    addHappyHour({ name: 'Happy Hour Cerveza', days: [3,4,5], from: '17:00', to: '19:00', discountPct: 25, scope: { sku: 'CERVEZA' } });
    addHoliday('2026-12-25', 'Navidad');
    setDynamicConfig({ enabled: false });
    setActivePriceList(def.id);
    _logEvent('demo_seeded', {});
    return true;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  const PricingAPI = {
    // Price lists
    getPriceLists, createPriceList, updatePriceList, deletePriceList,
    setActivePriceList, getActivePriceList, getBasePrice, setItemPrice,
    // Rules
    getRules, addRule, updateRule, deleteRule,
    addVolumeRule, addVIPRule, addHourRule, addWeekdayRule, addHolidayRule,
    // Holidays
    getHolidays, addHoliday, removeHoliday, isHoliday,
    // Happy hours
    getHappyHours, addHappyHour, removeHappyHour,
    // VIP
    getVIPTiers, saveVIPTiers,
    // Dynamic
    getDynamicConfig, setDynamicConfig,
    // Core
    calculatePrice, calculateCart,
    // Misc
    seedDemo, _log: () => _read(LS_LOG, []),
    version: '1.0.0'
  };

  global.PricingAPI = PricingAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = PricingAPI;

  console.log('[Volvix Pricing] wired v' + PricingAPI.version);
})(typeof window !== 'undefined' ? window : globalThis);
