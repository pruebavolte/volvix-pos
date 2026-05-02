/**
 * volvix-gamification-wiring.js
 * Sistema de Gamificación para Volvix POS
 * Agent-23 — Ronda 7 Fibonacci
 *
 * Características:
 *  - Sistema de puntos por acciones (ventas, tickets, etc.)
 *  - Badges/logros con iconos
 *  - Leaderboard entre cajeros
 *  - Niveles 1..100 con curva exponencial
 *  - Animaciones (toast + confetti)
 *  - Persistencia en localStorage
 *  - Notificaciones de logro
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. CONFIGURACIÓN
  // ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix_gamification_v1';
  const LEADERBOARD_KEY = 'volvix_leaderboard_v1';

  const POINTS = {
    SALE_COMPLETED: 10,
    SALE_BIG: 25,            // venta > $1000
    SALE_HUGE: 75,           // venta > $5000
    TICKET_RESOLVED: 15,
    CUSTOMER_REGISTERED: 5,
    LOGIN_DAILY: 3,
    PRODUCT_ADDED: 2,
    DISCOUNT_APPLIED: 1,
    NO_ERROR_DAY: 20,
    PERFECT_SHIFT: 50,
  };

  const BADGES = {
    FIRST_SALE:    { id:'FIRST_SALE',    name:'Primera Venta',     icon:'🎯', desc:'Realizaste tu primera venta',  points:50 },
    SALES_10:      { id:'SALES_10',      name:'Vendedor Bronce',   icon:'🥉', desc:'10 ventas completadas',         points:100 },
    SALES_100:     { id:'SALES_100',     name:'Vendedor Plata',    icon:'🥈', desc:'100 ventas completadas',        points:500 },
    SALES_1000:    { id:'SALES_1000',    name:'Vendedor Oro',      icon:'🥇', desc:'1000 ventas completadas',       points:2500 },
    SPEEDSTER:     { id:'SPEEDSTER',     name:'Velocista',         icon:'⚡', desc:'10 ventas en 1 hora',            points:200 },
    TOP_SELLER:    { id:'TOP_SELLER',    name:'Top Seller del Mes',icon:'👑', desc:'Líder del leaderboard mensual', points:1000 },
    FLAWLESS:      { id:'FLAWLESS',      name:'Sin Errores',       icon:'💎', desc:'7 días sin errores',            points:750 },
    NIGHT_OWL:     { id:'NIGHT_OWL',     name:'Búho Nocturno',     icon:'🦉', desc:'Venta entre 11pm-5am',          points:75 },
    EARLY_BIRD:    { id:'EARLY_BIRD',    name:'Madrugador',        icon:'🐦', desc:'Primera venta antes de 7am',    points:75 },
    COMBO_BREAKER: { id:'COMBO_BREAKER', name:'Combo Breaker',     icon:'🔥', desc:'5 ventas seguidas sin pausa',   points:120 },
  };

  // Curva de niveles: nivel n requiere floor(100 * n^1.5) puntos acumulados
  function pointsForLevel(level) {
    if (level <= 1) return 0;
    return Math.floor(100 * Math.pow(level - 1, 1.5));
  }
  function levelFromPoints(points) {
    let lvl = 1;
    while (lvl < 100 && points >= pointsForLevel(lvl + 1)) lvl++;
    return lvl;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ESTADO Y PERSISTENCIA
  // ─────────────────────────────────────────────────────────────
  function defaultState(userId, userName) {
    return {
      userId: userId || 'anon',
      userName: userName || 'Cajero',
      points: 0,
      level: 1,
      badges: [],            // array de badge ids
      stats: {
        sales: 0,
        ticketsResolved: 0,
        customersRegistered: 0,
        errorsToday: 0,
        consecutiveCleanDays: 0,
        lastSaleAt: 0,
        recentSales: [],     // timestamps últimas ventas (para Velocista)
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function loadState(userId) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY + ':' + userId);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Gamification] load fail', e);
      return null;
    }
  }

  function saveState(state) {
    try {
      state.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY + ':' + state.userId, JSON.stringify(state));
      updateLeaderboard(state);
    } catch (e) {
      console.warn('[Gamification] save fail', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. LEADERBOARD
  // ─────────────────────────────────────────────────────────────
  function loadLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '{}');
    } catch { return {}; }
  }
  function saveLeaderboard(lb) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb));
  }
  function updateLeaderboard(state) {
    const lb = loadLeaderboard();
    lb[state.userId] = {
      userId: state.userId,
      userName: state.userName,
      points: state.points,
      level: state.level,
      sales: state.stats.sales,
      badges: state.badges.length,
      updatedAt: state.updatedAt,
    };
    saveLeaderboard(lb);
  }
  function getLeaderboard(limit = 10) {
    const lb = loadLeaderboard();
    return Object.values(lb)
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }

  // ─────────────────────────────────────────────────────────────
  // 4. UI: TOAST + CONFETTI
  // ─────────────────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('volvix-gami-styles')) return;
    const css = `
    .vgami-toast{position:fixed;top:24px;right:24px;z-index:99999;background:linear-gradient(135deg,#1e3a8a,#7c3aed);
      color:#fff;padding:14px 20px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);
      font:600 14px/1.3 system-ui,sans-serif;display:flex;align-items:center;gap:12px;
      transform:translateX(420px);opacity:0;transition:all .35s cubic-bezier(.2,1,.4,1);max-width:340px}
    .vgami-toast.show{transform:translateX(0);opacity:1}
    .vgami-toast .icon{font-size:28px}
    .vgami-toast .title{font-size:15px;margin-bottom:2px}
    .vgami-toast .sub{font-size:12px;opacity:.85;font-weight:400}
    .vgami-confetti{position:fixed;top:-12px;width:10px;height:14px;z-index:99998;pointer-events:none;
      animation:vgamiFall linear forwards}
    @keyframes vgamiFall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}
    .vgami-levelup{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      z-index:99997;pointer-events:none;background:radial-gradient(closest-side,rgba(124,58,237,.35),transparent 60%);
      animation:vgamiPulse 1.6s ease-out forwards}
    .vgami-levelup .badge{font:800 64px/1 system-ui;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.6);
      animation:vgamiPop .6s cubic-bezier(.2,2,.4,1)}
    @keyframes vgamiPulse{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
    @keyframes vgamiPop{0%{transform:scale(.3)}100%{transform:scale(1)}}`;
    const s = document.createElement('style');
    s.id = 'volvix-gami-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function showToast(icon, title, sub) {
    if (typeof document === 'undefined') return;
    ensureStyles();
    const el = document.createElement('div');
    el.className = 'vgami-toast';
    el.innerHTML = `<div class="icon">${icon}</div><div><div class="title">${title}</div><div class="sub">${sub||''}</div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 3800);
  }

  function fireConfetti(count = 80) {
    if (typeof document === 'undefined') return;
    ensureStyles();
    const colors = ['#f59e0b','#ef4444','#10b981','#3b82f6','#a855f7','#ec4899','#facc15'];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      c.className = 'vgami-confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDuration = (2 + Math.random() * 2) + 's';
      c.style.animationDelay = (Math.random() * 0.4) + 's';
      c.style.transform = `rotate(${Math.random()*360}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  }

  function levelUpAnimation(level) {
    if (typeof document === 'undefined') return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.className = 'vgami-levelup';
    overlay.innerHTML = `<div class="badge">⭐ Nivel ${level}</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1700);
    fireConfetti(120);
  }

  function notify(title, body) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body }); } catch {}
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. CORE: AÑADIR PUNTOS Y CHEQUEAR LOGROS
  // ─────────────────────────────────────────────────────────────
  function addPoints(state, amount, reason) {
    if (!amount) return;
    const prevLevel = state.level;
    state.points += amount;
    const newLevel = levelFromPoints(state.points);
    state.level = newLevel;
    showToast('✨', `+${amount} pts`, reason || '');
    if (newLevel > prevLevel) {
      levelUpAnimation(newLevel);
      notify('¡Subiste de nivel!', `Ahora eres nivel ${newLevel}`);
    }
  }

  function awardBadge(state, badgeId) {
    if (state.badges.includes(badgeId)) return false;
    const b = BADGES[badgeId];
    if (!b) return false;
    state.badges.push(badgeId);
    addPoints(state, b.points, `Logro: ${b.name}`);
    showToast(b.icon, `¡Logro desbloqueado!`, b.name);
    fireConfetti(60);
    notify(`Logro: ${b.name}`, b.desc);
    return true;
  }

  function checkSalesBadges(state) {
    const n = state.stats.sales;
    if (n >= 1)    awardBadge(state, 'FIRST_SALE');
    if (n >= 10)   awardBadge(state, 'SALES_10');
    if (n >= 100)  awardBadge(state, 'SALES_100');
    if (n >= 1000) awardBadge(state, 'SALES_1000');
  }

  function checkSpeedster(state) {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    state.stats.recentSales = (state.stats.recentSales || []).filter(t => t >= oneHourAgo);
    state.stats.recentSales.push(now);
    if (state.stats.recentSales.length >= 10) {
      awardBadge(state, 'SPEEDSTER');
    }
  }

  function checkHourBadges(state) {
    const h = new Date().getHours();
    if (h >= 23 || h < 5) awardBadge(state, 'NIGHT_OWL');
    if (h < 7 && state.stats.sales === 1) awardBadge(state, 'EARLY_BIRD');
  }

  function checkFlawless(state) {
    if (state.stats.consecutiveCleanDays >= 7) awardBadge(state, 'FLAWLESS');
  }

  function checkTopSeller(state) {
    const lb = getLeaderboard(1);
    if (lb[0] && lb[0].userId === state.userId && state.stats.sales >= 50) {
      awardBadge(state, 'TOP_SELLER');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. API PÚBLICA
  // ─────────────────────────────────────────────────────────────
  class Gamification {
    constructor(userId, userName) {
      this.userId = userId || 'anon';
      this.state = loadState(this.userId) || defaultState(userId, userName);
      if (userName) this.state.userName = userName;
      saveState(this.state);
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }

    onSale(amount = 0) {
      this.state.stats.sales++;
      this.state.stats.lastSaleAt = Date.now();
      let pts = POINTS.SALE_COMPLETED;
      if (amount > 5000) pts = POINTS.SALE_HUGE;
      else if (amount > 1000) pts = POINTS.SALE_BIG;
      addPoints(this.state, pts, `Venta $${amount.toFixed(2)}`);
      checkSalesBadges(this.state);
      checkSpeedster(this.state);
      checkHourBadges(this.state);
      checkTopSeller(this.state);
      saveState(this.state);
    }

    onTicketResolved() {
      this.state.stats.ticketsResolved++;
      addPoints(this.state, POINTS.TICKET_RESOLVED, 'Ticket resuelto');
      saveState(this.state);
    }

    onCustomerRegistered() {
      this.state.stats.customersRegistered++;
      addPoints(this.state, POINTS.CUSTOMER_REGISTERED, 'Cliente registrado');
      saveState(this.state);
    }

    onLogin() {
      addPoints(this.state, POINTS.LOGIN_DAILY, 'Login diario');
      saveState(this.state);
    }

    onError() {
      this.state.stats.errorsToday++;
      this.state.stats.consecutiveCleanDays = 0;
      saveState(this.state);
    }

    onCleanDay() {
      this.state.stats.consecutiveCleanDays++;
      this.state.stats.errorsToday = 0;
      addPoints(this.state, POINTS.NO_ERROR_DAY, 'Día sin errores');
      checkFlawless(this.state);
      saveState(this.state);
    }

    onProductAdded()    { addPoints(this.state, POINTS.PRODUCT_ADDED, 'Producto agregado'); saveState(this.state); }
    onDiscountApplied() { addPoints(this.state, POINTS.DISCOUNT_APPLIED, 'Descuento aplicado'); saveState(this.state); }

    getProfile() {
      const next = pointsForLevel(this.state.level + 1);
      const cur = pointsForLevel(this.state.level);
      const progress = this.state.level >= 100 ? 1 : (this.state.points - cur) / (next - cur);
      return {
        userId: this.state.userId,
        userName: this.state.userName,
        points: this.state.points,
        level: this.state.level,
        nextLevelAt: next,
        progress: Math.max(0, Math.min(1, progress)),
        badges: this.state.badges.map(id => BADGES[id]).filter(Boolean),
        stats: { ...this.state.stats },
      };
    }

    getLeaderboard(limit = 10) { return getLeaderboard(limit); }
    getAllBadges() { return Object.values(BADGES); }

    reset() {
      this.state = defaultState(this.userId, this.state.userName);
      saveState(this.state);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 7. AUTO-WIRING (engancha eventos del POS si existen)
  // ─────────────────────────────────────────────────────────────
  function autoWire(instance) {
    if (typeof document === 'undefined') return;
    document.addEventListener('volvix:sale-completed',     e => instance.onSale(e.detail?.amount || 0));
    document.addEventListener('volvix:ticket-resolved',    () => instance.onTicketResolved());
    document.addEventListener('volvix:customer-registered',() => instance.onCustomerRegistered());
    document.addEventListener('volvix:login',              () => instance.onLogin());
    document.addEventListener('volvix:error',              () => instance.onError());
    document.addEventListener('volvix:product-added',      () => instance.onProductAdded());
    document.addEventListener('volvix:discount',           () => instance.onDiscountApplied());
  }

  // Export
  global.VolvixGamification = {
    create(userId, userName) {
      const g = new Gamification(userId, userName);
      autoWire(g);
      return g;
    },
    BADGES,
    POINTS,
    pointsForLevel,
    levelFromPoints,
    getLeaderboard,
  };

})(typeof window !== 'undefined' ? window : globalThis);
