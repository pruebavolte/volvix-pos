/* ============================================================================
 * volvix-coupons-wiring.js
 * Volvix POS — Sistema de Cupones, Descuentos y Gift Cards
 * Agent-63 R9 Volvix
 * ----------------------------------------------------------------------------
 * Expone window.CouponsAPI con:
 *   - Generación de códigos (manual / aleatorio / batch)
 *   - Descuentos % o monto fijo
 *   - Fecha de vencimiento
 *   - Límite de uso (global y por cliente)
 *   - Productos / categorías aplicables
 *   - BOGO (Buy One Get One) configurable
 *   - Gift Cards con saldo recargable
 *   - Persistencia en localStorage
 *   - Validación, aplicación y reverso
 * ========================================================================== */
(function (global) {
  'use strict';

  const STORE_KEY     = 'volvix_coupons_v1';
  const GIFT_KEY      = 'volvix_giftcards_v1';
  const REDEMPTION_KEY= 'volvix_redemptions_v1';

  // --------------------------------------------------------------------------
  // Utilidades internas
  // --------------------------------------------------------------------------
  function _load(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch (e) { return def; }
  }
  function _save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('[Coupons] save error', e); return false; }
  }
  function _uid(prefix) {
    return (prefix || 'C') + '-' + Date.now().toString(36) +
           '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  function _randomCode(len) {
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < (len || 8); i++)
      out += alpha[Math.floor(Math.random() * alpha.length)];
    return out;
  }
  function _today() { return new Date().toISOString().slice(0, 10); }
  function _isExpired(c) {
    if (!c.expiresAt) return false;
    return new Date(c.expiresAt) < new Date();
  }

  // --------------------------------------------------------------------------
  // Estado en memoria
  // --------------------------------------------------------------------------
  let coupons     = _load(STORE_KEY, []);
  let giftcards   = _load(GIFT_KEY, []);
  let redemptions = _load(REDEMPTION_KEY, []);

  // --------------------------------------------------------------------------
  // CRUD de cupones
  // --------------------------------------------------------------------------
  function createCoupon(opts) {
    opts = opts || {};
    const c = {
      id:               _uid('CPN'),
      code:             (opts.code || _randomCode(8)).toUpperCase(),
      type:             opts.type || 'percent',     // percent | amount | bogo | freeship
      value:            Number(opts.value) || 0,    // % o $
      minPurchase:      Number(opts.minPurchase) || 0,
      maxDiscount:      Number(opts.maxDiscount) || 0,
      expiresAt:        opts.expiresAt || null,
      usageLimit:       Number(opts.usageLimit) || 0,    // 0 = ilimitado
      perCustomerLimit: Number(opts.perCustomerLimit) || 0,
      usedCount:        0,
      applicableProducts:   opts.applicableProducts   || [], // SKUs
      applicableCategories: opts.applicableCategories || [],
      excludedProducts:     opts.excludedProducts     || [],
      bogo: opts.bogo || null,   // {buy:N, get:M, discountPct:100}
      stackable: !!opts.stackable,
      active:    opts.active !== false,
      description: opts.description || '',
      createdAt: new Date().toISOString()
    };
    if (coupons.find(x => x.code === c.code))
      return { ok: false, error: 'CODE_EXISTS' };
    coupons.push(c);
    _save(STORE_KEY, coupons);
    return { ok: true, coupon: c };
  }

  function createBatch(prefix, count, baseOpts) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const code = (prefix || 'PROMO') + '-' + _randomCode(6);
      const r = createCoupon(Object.assign({}, baseOpts, { code }));
      if (r.ok) out.push(r.coupon);
    }
    return { ok: true, generated: out.length, coupons: out };
  }

  function updateCoupon(code, patch) {
    const i = coupons.findIndex(c => c.code === code.toUpperCase());
    if (i < 0) return { ok: false, error: 'NOT_FOUND' };
    coupons[i] = Object.assign({}, coupons[i], patch);
    _save(STORE_KEY, coupons);
    return { ok: true, coupon: coupons[i] };
  }

  function deleteCoupon(code) {
    const before = coupons.length;
    coupons = coupons.filter(c => c.code !== code.toUpperCase());
    _save(STORE_KEY, coupons);
    return { ok: coupons.length < before };
  }

  function getCoupon(code) {
    return coupons.find(c => c.code === (code || '').toUpperCase()) || null;
  }
  function listCoupons(filter) {
    filter = filter || {};
    return coupons.filter(c => {
      if (filter.active != null && c.active !== filter.active) return false;
      if (filter.type && c.type !== filter.type) return false;
      if (filter.notExpired && _isExpired(c)) return false;
      return true;
    });
  }

  // --------------------------------------------------------------------------
  // Validación
  // --------------------------------------------------------------------------
  function validate(code, ctx) {
    ctx = ctx || {};
    const c = getCoupon(code);
    if (!c)              return { ok: false, error: 'NOT_FOUND' };
    if (!c.active)       return { ok: false, error: 'INACTIVE' };
    if (_isExpired(c))   return { ok: false, error: 'EXPIRED' };
    if (c.usageLimit > 0 && c.usedCount >= c.usageLimit)
      return { ok: false, error: 'USAGE_LIMIT' };

    const subtotal = Number(ctx.subtotal) || 0;
    if (subtotal < c.minPurchase)
      return { ok: false, error: 'MIN_PURCHASE', required: c.minPurchase };

    if (c.perCustomerLimit > 0 && ctx.customerId) {
      const used = redemptions.filter(r =>
        r.code === c.code && r.customerId === ctx.customerId).length;
      if (used >= c.perCustomerLimit)
        return { ok: false, error: 'PER_CUSTOMER_LIMIT' };
    }

    if (c.applicableProducts.length || c.applicableCategories.length) {
      const items = ctx.items || [];
      const hit = items.some(it =>
        c.applicableProducts.includes(it.sku) ||
        c.applicableCategories.includes(it.category));
      if (!hit) return { ok: false, error: 'NOT_APPLICABLE' };
    }

    return { ok: true, coupon: c };
  }

  // --------------------------------------------------------------------------
  // Cálculo de descuento
  // --------------------------------------------------------------------------
  function calcDiscount(coupon, ctx) {
    const subtotal = Number(ctx.subtotal) || 0;
    const items    = ctx.items || [];
    let discount = 0;

    // Filtrar items elegibles si aplica restricción
    const eligible = (coupon.applicableProducts.length ||
                      coupon.applicableCategories.length)
      ? items.filter(it =>
          coupon.applicableProducts.includes(it.sku) ||
          coupon.applicableCategories.includes(it.category))
      : items.filter(it => !coupon.excludedProducts.includes(it.sku));

    const eligibleTotal = eligible.reduce(
      (s, it) => s + (Number(it.price) * Number(it.qty || 1)), 0);

    switch (coupon.type) {
      case 'percent':
        discount = eligibleTotal * (coupon.value / 100);
        break;
      case 'amount':
        discount = Math.min(coupon.value, eligibleTotal);
        break;
      case 'freeship':
        discount = Number(ctx.shipping) || 0;
        break;
      case 'bogo': {
        const cfg = coupon.bogo || { buy: 1, get: 1, discountPct: 100 };
        // Ordenar por precio asc para descontar los más baratos
        const expanded = [];
        eligible.forEach(it => {
          for (let i = 0; i < (it.qty || 1); i++) expanded.push(Number(it.price));
        });
        expanded.sort((a, b) => a - b);
        const groupSize = cfg.buy + cfg.get;
        const groups    = Math.floor(expanded.length / groupSize);
        for (let g = 0; g < groups; g++) {
          for (let k = 0; k < cfg.get; k++) {
            const idx = g * groupSize + k;
            discount += expanded[idx] * (cfg.discountPct / 100);
          }
        }
        break;
      }
      default:
        discount = 0;
    }

    if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount)
      discount = coupon.maxDiscount;
    if (discount > subtotal) discount = subtotal;

    return Math.round(discount * 100) / 100;
  }

  // --------------------------------------------------------------------------
  // Aplicar / Reversar
  // --------------------------------------------------------------------------
  function apply(code, ctx) {
    const v = validate(code, ctx);
    if (!v.ok) return v;
    const discount = calcDiscount(v.coupon, ctx);
    const rec = {
      id:         _uid('RDM'),
      code:       v.coupon.code,
      customerId: ctx.customerId || null,
      orderId:    ctx.orderId    || null,
      subtotal:   ctx.subtotal,
      discount:   discount,
      at:         new Date().toISOString()
    };
    redemptions.push(rec);
    _save(REDEMPTION_KEY, redemptions);

    v.coupon.usedCount += 1;
    _save(STORE_KEY, coupons);

    return { ok: true, discount: discount, redemptionId: rec.id, coupon: v.coupon };
  }

  function reverse(redemptionId) {
    const i = redemptions.findIndex(r => r.id === redemptionId);
    if (i < 0) return { ok: false, error: 'NOT_FOUND' };
    const rec = redemptions[i];
    const c   = getCoupon(rec.code);
    if (c && c.usedCount > 0) { c.usedCount -= 1; _save(STORE_KEY, coupons); }
    redemptions.splice(i, 1);
    _save(REDEMPTION_KEY, redemptions);
    return { ok: true, reversed: rec };
  }

  // --------------------------------------------------------------------------
  // Gift Cards
  // --------------------------------------------------------------------------
  function createGiftCard(opts) {
    opts = opts || {};
    const g = {
      id:        _uid('GFT'),
      code:      (opts.code || ('GC-' + _randomCode(10))).toUpperCase(),
      initial:   Number(opts.amount) || 0,
      balance:   Number(opts.amount) || 0,
      currency:  opts.currency || 'MXN',
      pin:       opts.pin || _randomCode(4),
      expiresAt: opts.expiresAt || null,
      buyer:     opts.buyer     || null,
      recipient: opts.recipient || null,
      message:   opts.message   || '',
      active:    true,
      history:   [{ at: new Date().toISOString(), type: 'ISSUE',
                    amount: Number(opts.amount) || 0 }],
      createdAt: new Date().toISOString()
    };
    if (giftcards.find(x => x.code === g.code))
      return { ok: false, error: 'CODE_EXISTS' };
    giftcards.push(g);
    _save(GIFT_KEY, giftcards);
    return { ok: true, giftcard: g };
  }

  function getGiftCard(code) {
    return giftcards.find(g => g.code === (code || '').toUpperCase()) || null;
  }

  function chargeGiftCard(code, amount, pin) {
    const g = getGiftCard(code);
    if (!g)               return { ok: false, error: 'NOT_FOUND' };
    if (!g.active)        return { ok: false, error: 'INACTIVE' };
    if (_isExpired(g))    return { ok: false, error: 'EXPIRED' };
    if (g.pin && pin && g.pin !== pin) return { ok: false, error: 'BAD_PIN' };
    amount = Number(amount) || 0;
    if (amount <= 0)         return { ok: false, error: 'BAD_AMOUNT' };
    if (g.balance < amount)  return { ok: false, error: 'INSUFFICIENT', balance: g.balance };
    g.balance -= amount;
    g.history.push({ at: new Date().toISOString(), type: 'CHARGE', amount: amount });
    _save(GIFT_KEY, giftcards);
    return { ok: true, charged: amount, balance: g.balance };
  }

  function reloadGiftCard(code, amount) {
    const g = getGiftCard(code);
    if (!g) return { ok: false, error: 'NOT_FOUND' };
    amount = Number(amount) || 0;
    if (amount <= 0) return { ok: false, error: 'BAD_AMOUNT' };
    g.balance += amount;
    g.history.push({ at: new Date().toISOString(), type: 'RELOAD', amount: amount });
    _save(GIFT_KEY, giftcards);
    return { ok: true, balance: g.balance };
  }

  function listGiftCards() { return giftcards.slice(); }

  // --------------------------------------------------------------------------
  // Reportes
  // --------------------------------------------------------------------------
  function stats() {
    const totalDiscount = redemptions.reduce((s, r) => s + (r.discount || 0), 0);
    const byCode = {};
    redemptions.forEach(r => {
      byCode[r.code] = byCode[r.code] || { count: 0, total: 0 };
      byCode[r.code].count += 1;
      byCode[r.code].total += r.discount || 0;
    });
    return {
      coupons:          coupons.length,
      activeCoupons:    coupons.filter(c => c.active && !_isExpired(c)).length,
      giftcards:        giftcards.length,
      giftcardBalance:  giftcards.reduce((s, g) => s + g.balance, 0),
      redemptions:      redemptions.length,
      totalDiscount:    Math.round(totalDiscount * 100) / 100,
      byCode:           byCode
    };
  }

  function exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      coupons: coupons,
      giftcards: giftcards,
      redemptions: redemptions
    };
  }

  function importAll(data) {
    if (!data || data.version !== 1) return { ok: false, error: 'BAD_FORMAT' };
    coupons     = data.coupons     || [];
    giftcards   = data.giftcards   || [];
    redemptions = data.redemptions || [];
    _save(STORE_KEY, coupons);
    _save(GIFT_KEY,  giftcards);
    _save(REDEMPTION_KEY, redemptions);
    return { ok: true };
  }

  function reset() {
    coupons = []; giftcards = []; redemptions = [];
    _save(STORE_KEY, coupons);
    _save(GIFT_KEY,  giftcards);
    _save(REDEMPTION_KEY, redemptions);
    return { ok: true };
  }

  // --------------------------------------------------------------------------
  // API pública
  // --------------------------------------------------------------------------
  global.CouponsAPI = {
    // cupones
    create:        createCoupon,
    createBatch:   createBatch,
    update:        updateCoupon,
    delete:        deleteCoupon,
    get:           getCoupon,
    list:          listCoupons,
    validate:      validate,
    calcDiscount:  calcDiscount,
    apply:         apply,
    reverse:       reverse,
    // gift cards
    giftcard: {
      create: createGiftCard,
      get:    getGiftCard,
      charge: chargeGiftCard,
      reload: reloadGiftCard,
      list:   listGiftCards
    },
    // utilidades
    stats:    stats,
    export:   exportAll,
    import:   importAll,
    reset:    reset,
    _version: '1.0.0'
  };

  console.log('[Volvix] CouponsAPI listo — v' + global.CouponsAPI._version +
              ' | cupones:' + coupons.length + ' | giftcards:' + giftcards.length);
})(typeof window !== 'undefined' ? window : globalThis);
