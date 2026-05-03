/**
 * volvix-ratelimit-wiring.js
 * Volvix POS - Client-side Rate Limiting + UI
 * Agent-42 / Ronda 8 Fibonacci
 *
 * Features:
 *  1. Token bucket algorithm
 *  2. Per-endpoint limits
 *  3. Per-user limits
 *  4. Visual countdown when exceeded
 *  5. Warning before block
 *  6. Admin bypass
 *  7. Stats tracking
 *  8. Auto-throttle of fetch()
 *  9. window.RateLimitAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────
  // 2026-05: default cap subido (era 30/1 — el boot del POS dispara ~30 fetch
  // concurrentes que tiraban "Rate limit exceeded for default" en cascada.
  // Ahora: 200 tokens, refill 10/s — capacidad para boot + actividad normal.
  const DEFAULT_CONFIG = {
    capacity: 200,          // tokens (era 30)
    refillRate: 10,         // tokens per second (era 1)
    warningThreshold: 0.2,  // warn when <20% tokens left
    blockOnEmpty: true,
    autoThrottleFetch: true,
    adminBypass: true,
    countdownContainerId: 'rl-countdown-container',
    persistStats: true,
    storageKey: 'volvix_ratelimit_stats_v1'
  };

  const ENDPOINT_CONFIG = {
    '/api/auth/login':      { capacity: 5,   refillRate: 0.05 },
    '/api/auth/register':   { capacity: 3,   refillRate: 0.02 },
    '/api/sales/create':    { capacity: 60,  refillRate: 2 },
    '/api/sales/list':      { capacity: 120, refillRate: 4 },
    '/api/inventory':       { capacity: 200, refillRate: 10 }, // 2026-05: era 60/2
    '/api/reports':         { capacity: 60,  refillRate: 2 },  // 2026-05: era 20/0.5
    '/api/admin':           { capacity: 200, refillRate: 10 }, // 2026-05: era 30/1
    'default':              { capacity: 200, refillRate: 10 }  // 2026-05: era 30/1
  };

  const USER_CONFIG = {
    'admin':   { multiplier: Infinity, bypass: true },
    'manager': { multiplier: 3 },
    'cashier': { multiplier: 1 },
    'guest':   { multiplier: 0.5 }
  };

  // ─────────────────────────────────────────────────────────────
  // TOKEN BUCKET
  // ─────────────────────────────────────────────────────────────
  class TokenBucket {
    constructor(capacity, refillRate, name) {
      this.capacity = capacity;
      this.refillRate = refillRate;
      this.tokens = capacity;
      this.lastRefill = Date.now();
      this.name = name || 'bucket';
      this.totalConsumed = 0;
      this.totalDenied = 0;
    }
    refill() {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      const add = elapsed * this.refillRate;
      if (add > 0) {
        this.tokens = Math.min(this.capacity, this.tokens + add);
        this.lastRefill = now;
      }
    }
    tryConsume(n = 1) {
      this.refill();
      if (this.tokens >= n) {
        this.tokens -= n;
        this.totalConsumed += n;
        return true;
      }
      this.totalDenied += n;
      return false;
    }
    timeUntilAvailable(n = 1) {
      this.refill();
      if (this.tokens >= n) return 0;
      const need = n - this.tokens;
      return Math.ceil((need / this.refillRate) * 1000);
    }
    ratio() {
      this.refill();
      return this.tokens / this.capacity;
    }
    snapshot() {
      this.refill();
      return {
        name: this.name,
        tokens: Math.floor(this.tokens),
        capacity: this.capacity,
        refillRate: this.refillRate,
        ratio: this.ratio(),
        totalConsumed: this.totalConsumed,
        totalDenied: this.totalDenied
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // RATE LIMIT MANAGER
  // ─────────────────────────────────────────────────────────────
  class RateLimitManager {
    constructor(config) {
      this.config = Object.assign({}, DEFAULT_CONFIG, config || {});
      this.endpointBuckets = new Map();
      this.userBuckets = new Map();
      this.currentUser = { id: 'guest', role: 'guest' };
      this.stats = {
        startedAt: Date.now(),
        totalRequests: 0,
        totalBlocked: 0,
        totalWarnings: 0,
        byEndpoint: {},
        byUser: {}
      };
      this.listeners = { warning: [], block: [], allow: [] };
      this._loadStats();
      this._installFetchHook();
      this._injectStyles();
    }

    setUser(user) {
      this.currentUser = Object.assign({ id: 'guest', role: 'guest' }, user || {});
    }

    isAdminBypass() {
      if (!this.config.adminBypass) return false;
      const role = this.currentUser.role;
      const cfg = USER_CONFIG[role];
      return !!(cfg && cfg.bypass);
    }

    _endpointKey(url) {
      try {
        const u = typeof url === 'string' ? url : url.url;
        const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        for (const k of Object.keys(ENDPOINT_CONFIG)) {
          if (k !== 'default' && path.startsWith(k)) return k;
        }
        return 'default';
      } catch (_) {
        return 'default';
      }
    }

    _getEndpointBucket(key) {
      if (!this.endpointBuckets.has(key)) {
        const cfg = ENDPOINT_CONFIG[key] || ENDPOINT_CONFIG.default;
        this.endpointBuckets.set(key, new TokenBucket(cfg.capacity, cfg.refillRate, 'endpoint:' + key));
      }
      return this.endpointBuckets.get(key);
    }

    _getUserBucket(userId, role) {
      const key = userId + '::' + role;
      if (!this.userBuckets.has(key)) {
        const base = ENDPOINT_CONFIG.default;
        const userCfg = USER_CONFIG[role] || { multiplier: 1 };
        const mult = userCfg.multiplier === Infinity ? 1000 : userCfg.multiplier;
        this.userBuckets.set(key, new TokenBucket(
          Math.floor(base.capacity * mult),
          base.refillRate * mult,
          'user:' + key
        ));
      }
      return this.userBuckets.get(key);
    }

    check(url, cost = 1) {
      this.stats.totalRequests++;
      const epKey = this._endpointKey(url);
      this.stats.byEndpoint[epKey] = (this.stats.byEndpoint[epKey] || 0) + 1;

      if (this.isAdminBypass()) {
        return { allowed: true, bypass: true, endpoint: epKey };
      }

      const epBucket = this._getEndpointBucket(epKey);
      const userBucket = this._getUserBucket(this.currentUser.id, this.currentUser.role);

      const epRatio = epBucket.ratio();
      const userRatio = userBucket.ratio();
      const minRatio = Math.min(epRatio, userRatio);

      if (minRatio <= this.config.warningThreshold && minRatio > 0) {
        this.stats.totalWarnings++;
        this._emit('warning', { endpoint: epKey, ratio: minRatio });
        this._showWarning(epKey, minRatio);
      }

      const epOk = epBucket.tryConsume(cost);
      const userOk = userBucket.tryConsume(cost);

      if (!epOk || !userOk) {
        this.stats.totalBlocked++;
        const wait = Math.max(
          epBucket.timeUntilAvailable(cost),
          userBucket.timeUntilAvailable(cost)
        );
        this._emit('block', { endpoint: epKey, waitMs: wait });
        this._showCountdown(epKey, wait);
        this._persistStats();
        return { allowed: false, endpoint: epKey, waitMs: wait, reason: !epOk ? 'endpoint' : 'user' };
      }

      this._emit('allow', { endpoint: epKey });
      this._persistStats();
      return { allowed: true, endpoint: epKey };
    }

    on(event, fn) {
      if (this.listeners[event]) this.listeners[event].push(fn);
    }
    _emit(event, payload) {
      (this.listeners[event] || []).forEach(fn => {
        try { fn(payload); } catch (e) { console.warn('[RateLimit] listener error', e); }
      });
    }

    // ───── stats ─────
    getStats() {
      const buckets = {};
      this.endpointBuckets.forEach((b, k) => { buckets[k] = b.snapshot(); });
      const users = {};
      this.userBuckets.forEach((b, k) => { users[k] = b.snapshot(); });
      return {
        ...this.stats,
        uptimeMs: Date.now() - this.stats.startedAt,
        endpointBuckets: buckets,
        userBuckets: users,
        currentUser: this.currentUser
      };
    }
    resetStats() {
      this.stats = {
        startedAt: Date.now(),
        totalRequests: 0,
        totalBlocked: 0,
        totalWarnings: 0,
        byEndpoint: {},
        byUser: {}
      };
      this._persistStats();
    }
    _persistStats() {
      if (!this.config.persistStats) return;
      try {
        localStorage.setItem(this.config.storageKey, JSON.stringify({
          totalRequests: this.stats.totalRequests,
          totalBlocked: this.stats.totalBlocked,
          totalWarnings: this.stats.totalWarnings,
          byEndpoint: this.stats.byEndpoint
        }));
      } catch (_) {}
    }
    _loadStats() {
      if (!this.config.persistStats) return;
      try {
        const raw = localStorage.getItem(this.config.storageKey);
        if (!raw) return;
        const s = JSON.parse(raw);
        Object.assign(this.stats, s);
      } catch (_) {}
    }

    // ───── UI ─────
    _injectStyles() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('rl-styles')) return;
      const css = `
        #rl-countdown-container{position:fixed;top:12px;right:12px;z-index:99999;font-family:system-ui,sans-serif;display:flex;flex-direction:column;gap:8px}
        .rl-toast{background:#1f2937;color:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.25);min-width:240px;font-size:13px;animation:rl-in .25s ease}
        .rl-toast.warn{background:#b45309}
        .rl-toast.block{background:#b91c1c}
        .rl-toast b{display:block;margin-bottom:4px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
        .rl-bar{height:4px;background:rgba(255,255,255,.25);border-radius:2px;margin-top:6px;overflow:hidden}
        .rl-bar>span{display:block;height:100%;background:#fff;transition:width .25s linear}
        @keyframes rl-in{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
      `;
      const s = document.createElement('style');
      s.id = 'rl-styles';
      s.textContent = css;
      document.head.appendChild(s);
    }
    _ensureContainer() {
      if (typeof document === 'undefined') return null;
      let c = document.getElementById(this.config.countdownContainerId);
      if (!c) {
        c = document.createElement('div');
        c.id = this.config.countdownContainerId;
        document.body.appendChild(c);
      }
      return c;
    }
    _showWarning(endpoint, ratio) {
      // R28: warning toast solo en localhost o si volvix_debug=1
      try {
        const isProd = !/^(localhost|127\.|\.local$)/.test(location.hostname);
        const debugFlag = localStorage.getItem('volvix_debug') === '1';
        if (isProd && !debugFlag) {
          // En prod: log silencioso a console, no UI
          console.warn('[RateLimit]', endpoint, Math.round(ratio*100)+'% remaining');
          return;
        }
      } catch (e) {}
      const c = this._ensureContainer();
      if (!c) return;
      const el = document.createElement('div');
      el.className = 'rl-toast warn';
      el.innerHTML = `<b>Rate limit warning</b>${endpoint} - ${Math.round(ratio * 100)}% remaining`;
      c.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }
    _showCountdown(endpoint, waitMs) {
      // FIX-D: "Blocked default wait Ns" toasts are noisy internal logs — only show in dev mode.
      try {
        const isProd = !/^(localhost|127\.|\.local$)/.test(location.hostname);
        const debugFlag = (typeof localStorage !== 'undefined' && localStorage.getItem('volvix_debug') === '1');
        const devFlag = (typeof window !== 'undefined' && window.__volvixDevMode === true);
        if (isProd && !debugFlag && !devFlag) {
          console.warn('[RateLimit] Blocked:', endpoint, 'wait', Math.ceil(waitMs/1000)+'s');
          return;
        }
      } catch (e) {}
      const c = this._ensureContainer();
      if (!c) return;
      const el = document.createElement('div');
      el.className = 'rl-toast block';
      const total = waitMs;
      let remaining = waitMs;
      el.innerHTML = `<b>Blocked: ${endpoint}</b><span class="rl-msg">Wait ${Math.ceil(remaining/1000)}s</span><div class="rl-bar"><span style="width:100%"></span></div>`;
      c.appendChild(el);
      const msg = el.querySelector('.rl-msg');
      const bar = el.querySelector('.rl-bar > span');
      const start = Date.now();
      const tick = setInterval(() => {
        remaining = total - (Date.now() - start);
        if (remaining <= 0) {
          clearInterval(tick);
          el.remove();
          return;
        }
        msg.textContent = 'Wait ' + Math.ceil(remaining / 1000) + 's';
        bar.style.width = (remaining / total * 100) + '%';
      }, 200);
    }

    // ───── fetch hook ─────
    _installFetchHook() {
      if (!this.config.autoThrottleFetch) return;
      if (typeof global.fetch !== 'function') return;
      if (global.__rl_fetch_patched) return;
      global.__rl_fetch_patched = true;
      const originalFetch = global.fetch.bind(global);
      const self = this;
      global.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const result = self.check(url, 1);
        if (!result.allowed) {
          const err = new Error('Rate limit exceeded for ' + result.endpoint + '. Retry in ' + result.waitMs + 'ms');
          err.rateLimited = true;
          err.waitMs = result.waitMs;
          err.endpoint = result.endpoint;
          return Promise.reject(err);
        }
        return originalFetch(input, init);
      };
      global.fetch.__original = originalFetch;
    }
    restoreFetch() {
      if (global.fetch && global.fetch.__original) {
        global.fetch = global.fetch.__original;
        global.__rl_fetch_patched = false;
      }
    }

    // ───── manual helpers ─────
    waitFor(url, cost = 1) {
      const r = this.check(url, cost);
      if (r.allowed) return Promise.resolve(r);
      return new Promise(resolve => setTimeout(() => resolve(this.waitFor(url, cost)), r.waitMs + 50));
    }
    configureEndpoint(path, cfg) {
      ENDPOINT_CONFIG[path] = Object.assign({}, ENDPOINT_CONFIG[path] || {}, cfg);
      this.endpointBuckets.delete(path);
    }
    configureRole(role, cfg) {
      USER_CONFIG[role] = Object.assign({}, USER_CONFIG[role] || {}, cfg);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────
  const manager = new RateLimitManager();

  const RateLimitAPI = {
    version: '1.0.0',
    manager,
    setUser:    (u) => manager.setUser(u),
    check:      (url, cost) => manager.check(url, cost),
    waitFor:    (url, cost) => manager.waitFor(url, cost),
    stats:      () => manager.getStats(),
    reset:      () => manager.resetStats(),
    on:         (e, fn) => manager.on(e, fn),
    configureEndpoint: (p, c) => manager.configureEndpoint(p, c),
    configureRole:     (r, c) => manager.configureRole(r, c),
    restoreFetch:      () => manager.restoreFetch(),
    isAdmin:    () => manager.isAdminBypass(),
    dump: () => {
      const s = manager.getStats();
      console.group('%c[RateLimit] stats', 'color:#06b');
      console.log('Requests:', s.totalRequests, '| Blocked:', s.totalBlocked, '| Warnings:', s.totalWarnings);
      console.table(s.endpointBuckets);
      console.table(s.userBuckets);
      console.groupEnd();
      return s;
    }
  };

  global.RateLimitAPI = RateLimitAPI;

  // 2026-05: auto-detect user role desde JWT al boot. Antes nadie llamaba
  // setUser() y todos quedaban como 'guest' (multiplier 0.5x), causando
  // "Rate limit exceeded for default" en cascada al bootstrap del POS.
  function _autoDetectUser() {
    try {
      var keys = ['volvix_token','volvixAuthToken','jwt','token'];
      var token = null;
      for (var i = 0; i < keys.length; i++) {
        token = localStorage.getItem(keys[i]) || sessionStorage.getItem(keys[i]);
        if (token) break;
      }
      if (!token || token.split('.').length !== 3) return;
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      var role = payload.role || 'guest';
      // 'superadmin' y 'platform_owner' tienen bypass; 'owner' y 'admin' tambien
      if (role === 'superadmin' || role === 'platform_owner') role = 'admin';
      manager.setUser({ id: payload.sub || payload.user_id || 'unknown', role: role });
    } catch (_) { /* token invalid, dejar como guest */ }
  }
  _autoDetectUser();

  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    manager._injectStyles();
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => manager._injectStyles());
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RateLimitAPI, RateLimitManager, TokenBucket };
  }
})(typeof window !== 'undefined' ? window : globalThis);
