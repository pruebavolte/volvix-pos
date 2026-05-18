/* ============================================================
 * volvix-loyalty-wiring.js
 * Volvix POS - Loyalty Program (Agent-29 / Ronda 8 Fibonacci)
 * Sistema completo de fidelizacion de clientes
 * ============================================================ */
(function (global) {
  'use strict';

  // ---------- Config ----------
  const CFG = {
    POINTS_PER_DOLLAR: 0.1,        // 1 punto por cada $10
    POINT_VALUE_USD: 0.05,         // 1 pto = $0.05 al canjear
    EXPIRY_DAYS: 365,              // caducidad 1 anio
    BIRTHDAY_BONUS: 500,
    REFERRAL_BONUS: 300,
    REFERRAL_FRIEND_BONUS: 150,
    STORAGE_KEY: 'volvix_loyalty_v1',
    TIERS: [
      { name: 'Bronze',   min: 0,     mult: 1.0, color: '#cd7f32', perks: ['Acumula puntos'] },
      { name: 'Silver',   min: 1000,  mult: 1.1, color: '#c0c0c0', perks: ['+10% puntos','Cumple x2'] },
      { name: 'Gold',     min: 5000,  mult: 1.25,color: '#ffd700', perks: ['+25% puntos','Envio gratis'] },
      { name: 'Platinum', min: 15000, mult: 1.5, color: '#e5e4e2', perks: ['+50% puntos','Soporte VIP'] },
      { name: 'Diamond',  min: 50000, mult: 2.0, color: '#b9f2ff', perks: ['x2 puntos','Concierge 24/7'] }
    ],
    REWARDS: [
      { id: 'R001', name: '5% descuento',         cost: 200,  type: 'discount', value: 5 },
      { id: 'R002', name: '10% descuento',        cost: 500,  type: 'discount', value: 10 },
      { id: 'R003', name: '20% descuento',        cost: 1200, type: 'discount', value: 20 },
      { id: 'R004', name: 'Cafe gratis',          cost: 300,  type: 'product',  sku: 'CAFE-001' },
      { id: 'R005', name: 'Producto gratis $10',  cost: 1000, type: 'voucher',  value: 10 },
      { id: 'R006', name: 'Producto gratis $25',  cost: 2300, type: 'voucher',  value: 25 },
      { id: 'R007', name: 'Envio gratis',         cost: 400,  type: 'shipping', value: 0 },
      { id: 'R008', name: 'Regalo sorpresa',      cost: 800,  type: 'mystery',  value: 0 }
    ]
  };

  // ---------- Estado ----------
  let STATE = {
    customers: {},   // id -> customer
    redemptions: {}, // code -> redemption
    movements: [],   // historial global
    initialized: false
  };

  // ---------- Util ----------
  const now = () => Date.now();
  const uuid = () => 'C' + Math.random().toString(36).slice(2, 10).toUpperCase();
  const codeGen = () => {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
    return s.match(/.{1,5}/g).join('-');
  };
  const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
  const fmtDate = ts => new Date(ts).toISOString().slice(0, 10);

  function emit(event, payload) {
    try {
      if (typeof CustomEvent === 'function' && global.dispatchEvent) {
        global.dispatchEvent(new CustomEvent('loyalty:' + event, { detail: payload }));
      }
    } catch (_) {}
    if (global.console && global.DEBUG_LOYALTY) console.log('[loyalty]', event, payload);
  }

  // ---------- Persistencia ----------
  function load() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(CFG.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        STATE.customers = parsed.customers || {};
        STATE.redemptions = parsed.redemptions || {};
        STATE.movements = parsed.movements || [];
      }
    } catch (e) {
      console.warn('[loyalty] load fallido', e);
    }
  }
  function save() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify({
          customers: STATE.customers,
          redemptions: STATE.redemptions,
          movements: STATE.movements.slice(-2000)
        }));
      }
    } catch (e) {
      console.warn('[loyalty] save fallido', e);
    }
  }

  // ---------- Movimientos ----------
  function logMove(customerId, type, points, meta) {
    const m = {
      id: 'M' + now() + Math.floor(Math.random() * 999),
      customerId,
      type,
      points,
      ts: now(),
      meta: meta || {}
    };
    STATE.movements.push(m);
    const c = STATE.customers[customerId];
    if (c) {
      c.movements = c.movements || [];
      c.movements.push(m);
      if (c.movements.length > 500) c.movements = c.movements.slice(-500);
    }
    return m;
  }

  // ---------- Tiers ----------
  function tierFor(points) {
    let t = CFG.TIERS[0];
    for (const x of CFG.TIERS) if (points >= x.min) t = x;
    return t;
  }
  function nextTier(points) {
    for (const x of CFG.TIERS) if (points < x.min) return x;
    return null;
  }
  function recomputeTier(c) {
    const before = c.tier;
    c.tier = tierFor(c.lifetimePoints).name;
    if (before && before !== c.tier) {
      logMove(c.id, 'TIER_UP', 0, { from: before, to: c.tier });
      emit('tier_up', { customer: c.id, from: before, to: c.tier });
    }
  }

  // ---------- Clientes ----------
  function createCustomer(data) {
    data = data || {};
    const id = data.id || uuid();
    if (STATE.customers[id]) return STATE.customers[id];
    const c = {
      id,
      name: data.name || 'Cliente',
      email: data.email || '',
      phone: data.phone || '',
      birthday: data.birthday || null, // 'MM-DD'
      points: 0,
      lifetimePoints: 0,
      tier: 'Bronze',
      createdAt: now(),
      lastActivity: now(),
      lastBirthdayBonus: null,
      referralCode: 'REF-' + id.slice(1, 7),
      referredBy: data.referredBy || null,
      referrals: [],
      movements: [],
      cardId: 'VLX-' + id
    };
    STATE.customers[id] = c;
    logMove(id, 'CREATED', 0, { name: c.name });
    if (c.referredBy) applyReferral(c.referredBy, id);
    save();
    emit('customer_created', c);
    return c;
  }

  function getCustomer(id) {
    return STATE.customers[id] || null;
  }

  function findCustomer(query) {
    const q = (query || '').toLowerCase();
    return Object.values(STATE.customers).find(c =>
      c.id.toLowerCase() === q ||
      c.email.toLowerCase() === q ||
      c.phone === query ||
      c.cardId.toLowerCase() === q ||
      c.referralCode.toLowerCase() === q
    ) || null;
  }

  // ---------- Puntos ----------
  function earnFromPurchase(customerId, amountUsd, meta) {
    const c = STATE.customers[customerId];
    if (!c) return { ok: false, error: 'cliente no existe' };
    if (!(amountUsd > 0)) return { ok: false, error: 'monto invalido' };
    const base = Math.floor(amountUsd * CFG.POINTS_PER_DOLLAR);
    const t = tierFor(c.lifetimePoints);
    const earned = Math.floor(base * t.mult);
    c.points += earned;
    c.lifetimePoints += earned;
    c.lastActivity = now();
    recomputeTier(c);
    logMove(c.id, 'EARN_PURCHASE', earned, { amount: amountUsd, base, mult: t.mult, ...(meta || {}) });
    save();
    emit('points_earned', { customer: c.id, points: earned, reason: 'purchase' });
    return { ok: true, earned, balance: c.points, tier: c.tier };
  }

  function adjustPoints(customerId, delta, reason) {
    const c = STATE.customers[customerId];
    if (!c) return { ok: false, error: 'cliente no existe' };
    c.points += delta;
    if (delta > 0) c.lifetimePoints += delta;
    if (c.points < 0) c.points = 0;
    recomputeTier(c);
    logMove(c.id, delta >= 0 ? 'ADJUST_PLUS' : 'ADJUST_MINUS', delta, { reason: reason || 'manual' });
    save();
    return { ok: true, balance: c.points };
  }

  // ---------- Recompensas / Canje ----------
  function listRewards(customerId) {
    const c = customerId ? STATE.customers[customerId] : null;
    return CFG.REWARDS.map(r => ({
      ...r,
      affordable: c ? c.points >= r.cost : false
    }));
  }

  function redeemReward(customerId, rewardId) {
    const c = STATE.customers[customerId];
    if (!c) return { ok: false, error: 'cliente no existe' };
    const r = CFG.REWARDS.find(x => x.id === rewardId);
    if (!r) return { ok: false, error: 'recompensa no existe' };
    if (c.points < r.cost) return { ok: false, error: 'puntos insuficientes' };
    c.points -= r.cost;
    c.lastActivity = now();
    const code = codeGen();
    const red = {
      code,
      customerId: c.id,
      rewardId: r.id,
      rewardName: r.name,
      cost: r.cost,
      type: r.type,
      value: r.value || 0,
      sku: r.sku || null,
      ts: now(),
      used: false,
      usedAt: null,
      expiresAt: now() + 30 * 86400000 // 30 dias
    };
    STATE.redemptions[code] = red;
    logMove(c.id, 'REDEEM', -r.cost, { rewardId: r.id, code });
    save();
    emit('reward_redeemed', red);
    return { ok: true, code, redemption: red, balance: c.points };
  }

  function validateCode(code) {
    const r = STATE.redemptions[(code || '').toUpperCase()];
    if (!r) return { ok: false, error: 'codigo no existe' };
    if (r.used) return { ok: false, error: 'codigo ya usado', redemption: r };
    if (now() > r.expiresAt) return { ok: false, error: 'codigo expirado', redemption: r };
    return { ok: true, redemption: r };
  }

  function consumeCode(code) {
    const v = validateCode(code);
    if (!v.ok) return v;
    v.redemption.used = true;
    v.redemption.usedAt = now();
    logMove(v.redemption.customerId, 'CODE_USED', 0, { code });
    save();
    emit('code_consumed', v.redemption);
    return { ok: true, redemption: v.redemption };
  }

  // ---------- Tarjeta digital ----------
  function digitalCard(customerId) {
    const c = STATE.customers[customerId];
    if (!c) return null;
    const t = tierFor(c.lifetimePoints);
    const next = nextTier(c.lifetimePoints);
    return {
      cardId: c.cardId,
      name: c.name,
      tier: t.name,
      tierColor: t.color,
      perks: t.perks,
      points: c.points,
      lifetime: c.lifetimePoints,
      nextTier: next ? next.name : null,
      pointsToNext: next ? (next.min - c.lifetimePoints) : 0,
      progress: next ? Math.min(1, c.lifetimePoints / next.min) : 1,
      referralCode: c.referralCode,
      qr: 'volvix://card/' + c.cardId
    };
  }

  function renderCardHTML(customerId) {
    const card = digitalCard(customerId);
    if (!card) return '<div>Cliente no encontrado</div>';
    const pct = Math.round(card.progress * 100);
    return [
      '<div class="vlx-card" style="background:linear-gradient(135deg,#111,'+card.tierColor+');',
      'color:#fff;padding:20px;border-radius:16px;font-family:sans-serif;max-width:340px">',
        '<div style="opacity:.7;font-size:11px">VOLVIX LOYALTY</div>',
        '<div style="font-size:22px;font-weight:700;margin:6px 0">', card.name, '</div>',
        '<div style="font-size:13px">Tier: <b>', card.tier, '</b></div>',
        '<div style="font-size:28px;font-weight:800;margin:8px 0">', card.points, ' pts</div>',
        '<div style="font-size:11px;opacity:.8">Acumulado: ', card.lifetime, '</div>',
        card.nextTier
          ? '<div style="margin-top:10px;font-size:11px">Faltan '+card.pointsToNext+' para '+card.nextTier+
            '<div style="background:rgba(255,255,255,.2);height:6px;border-radius:3px;margin-top:4px">'+
            '<div style="width:'+pct+'%;background:#fff;height:6px;border-radius:3px"></div></div></div>'
          : '<div style="margin-top:10px;font-size:11px">Tier maximo alcanzado</div>',
        '<div style="margin-top:12px;font-size:10px;opacity:.7">Card '+card.cardId+'</div>',
        '<div style="font-size:10px;opacity:.7">Ref: '+card.referralCode+'</div>',
      '</div>'
    ].join('');
  }

  // ---------- Birthday ----------
  function checkBirthdayBonus(customerId) {
    const c = STATE.customers[customerId];
    if (!c || !c.birthday) return { ok: false, error: 'sin fecha' };
    const d = new Date();
    const today = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (c.birthday !== today) return { ok: false, error: 'no es hoy' };
    const yr = d.getFullYear();
    if (c.lastBirthdayBonus === yr) return { ok: false, error: 'ya recibido este anio' };
    const t = tierFor(c.lifetimePoints);
    const bonus = Math.floor(CFG.BIRTHDAY_BONUS * t.mult);
    c.points += bonus;
    c.lifetimePoints += bonus;
    c.lastBirthdayBonus = yr;
    recomputeTier(c);
    logMove(c.id, 'BIRTHDAY', bonus, { year: yr });
    save();
    emit('birthday_bonus', { customer: c.id, bonus });
    return { ok: true, bonus, balance: c.points };
  }

  function scanBirthdays() {
    const results = [];
    for (const c of Object.values(STATE.customers)) {
      const r = checkBirthdayBonus(c.id);
      if (r.ok) results.push({ id: c.id, bonus: r.bonus });
    }
    return results;
  }

  // ---------- Referidos ----------
  function applyReferral(referrerId, newCustomerId) {
    const r = STATE.customers[referrerId];
    const n = STATE.customers[newCustomerId];
    if (!r || !n) return { ok: false, error: 'invalido' };
    r.referrals.push(newCustomerId);
    r.points += CFG.REFERRAL_BONUS;
    r.lifetimePoints += CFG.REFERRAL_BONUS;
    n.points += CFG.REFERRAL_FRIEND_BONUS;
    n.lifetimePoints += CFG.REFERRAL_FRIEND_BONUS;
    recomputeTier(r); recomputeTier(n);
    logMove(r.id, 'REFERRAL_BONUS', CFG.REFERRAL_BONUS, { referred: newCustomerId });
    logMove(n.id, 'REFERRAL_WELCOME', CFG.REFERRAL_FRIEND_BONUS, { referrer: referrerId });
    save();
    emit('referral', { referrer: r.id, friend: n.id });
    return { ok: true };
  }

  function registerByReferralCode(code, newCustomerData) {
    const referrer = Object.values(STATE.customers).find(c => c.referralCode === code);
    if (!referrer) return { ok: false, error: 'codigo invalido' };
    const c = createCustomer({ ...(newCustomerData || {}), referredBy: referrer.id });
    return { ok: true, customer: c };
  }

  // ---------- Caducidad ----------
  function expirePoints() {
    const cutoff = now() - CFG.EXPIRY_DAYS * 86400000;
    let totalExpired = 0;
    for (const c of Object.values(STATE.customers)) {
      const earnRecent = (c.movements || []).filter(m =>
        (m.type === 'EARN_PURCHASE' || m.type === 'BIRTHDAY' ||
         m.type === 'REFERRAL_BONUS' || m.type === 'REFERRAL_WELCOME') &&
        m.ts >= cutoff
      ).reduce((s, m) => s + m.points, 0);
      const spent = (c.movements || []).filter(m =>
        m.type === 'REDEEM' || m.type === 'EXPIRE' || m.type === 'ADJUST_MINUS'
      ).reduce((s, m) => s + Math.abs(m.points), 0);
      const valid = Math.max(0, earnRecent - Math.max(0, spent - (c.lifetimePoints - earnRecent)));
      if (c.points > valid) {
        const exp = c.points - valid;
        c.points = valid;
        totalExpired += exp;
        logMove(c.id, 'EXPIRE', -exp, { reason: 'caducidad ' + CFG.EXPIRY_DAYS + 'd' });
        emit('points_expired', { customer: c.id, expired: exp });
      }
    }
    if (totalExpired > 0) save();
    return { ok: true, totalExpired };
  }

  // ---------- Historial ----------
  function history(customerId, limit) {
    const c = STATE.customers[customerId];
    if (!c) return [];
    const list = (c.movements || []).slice().reverse();
    return limit ? list.slice(0, limit) : list;
  }

  function historyFormatted(customerId, limit) {
    return history(customerId, limit).map(m => ({
      date: fmtDate(m.ts),
      type: m.type,
      points: m.points,
      detail: JSON.stringify(m.meta)
    }));
  }

  // ---------- Stats ----------
  function stats() {
    const all = Object.values(STATE.customers);
    const byTier = {};
    CFG.TIERS.forEach(t => byTier[t.name] = 0);
    let totalPts = 0, totalLifetime = 0;
    for (const c of all) {
      byTier[c.tier] = (byTier[c.tier] || 0) + 1;
      totalPts += c.points;
      totalLifetime += c.lifetimePoints;
    }
    return {
      customers: all.length,
      totalPoints: totalPts,
      totalLifetime,
      byTier,
      redemptions: Object.keys(STATE.redemptions).length,
      movements: STATE.movements.length
    };
  }

  // ---------- Reset / Export ----------
  function exportData() {
    return JSON.parse(JSON.stringify({
      customers: STATE.customers,
      redemptions: STATE.redemptions,
      movements: STATE.movements
    }));
  }

  function importData(data) {
    if (!data) return { ok: false };
    STATE.customers = data.customers || {};
    STATE.redemptions = data.redemptions || {};
    STATE.movements = data.movements || [];
    save();
    return { ok: true };
  }

  function resetAll() {
    STATE.customers = {};
    STATE.redemptions = {};
    STATE.movements = [];
    save();
    emit('reset', {});
    return { ok: true };
  }

  // ---------- Init ----------
  function init() {
    if (STATE.initialized) return;
    load();
    STATE.initialized = true;
    emit('ready', stats());
    if (global.console) console.log('[Volvix Loyalty] inicializado.', stats());
  }

  // ---------- API publica ----------
  const LoyaltyAPI = {
    config: CFG,
    init,
    // clientes
    createCustomer,
    getCustomer,
    findCustomer,
    // puntos
    earnFromPurchase,
    adjustPoints,
    // recompensas
    listRewards,
    redeemReward,
    validateCode,
    consumeCode,
    // tarjeta
    digitalCard,
    renderCardHTML,
    // birthday
    checkBirthdayBonus,
    scanBirthdays,
    // referidos
    registerByReferralCode,
    applyReferral,
    // caducidad
    expirePoints,
    // historial
    history,
    historyFormatted,
    // misc
    stats,
    exportData,
    importData,
    resetAll,
    tierFor,
    nextTier
  };

  global.LoyaltyAPI = LoyaltyAPI;

  // Auto-init en navegador
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoyaltyAPI;
  }

})(typeof window !== 'undefined' ? window : globalThis);
