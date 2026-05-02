/* volvix-pos-payments-integration.js
 * Volvix POS — Client-side payment integrations
 * Mercado Pago | STP (transferencia + CoDi QR) | Stripe
 * Self-contained. Vanilla JS. No external CDN deps.
 */
(function () {
  'use strict';

  if (window.__vlxPaymentsIntegrationLoaded) return;
  window.__vlxPaymentsIntegrationLoaded = true;

  // -----------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------
  const CFG = {
    POLL_INTERVAL_MS: 3000,
    POLL_INTERVAL_STP_MS: 4000,
    POLL_TIMEOUT_MS: 5 * 60 * 1000,
    STP_EXPIRY_MS: 5 * 60 * 1000,
    HEALTH_REFRESH_MS: 60 * 1000,
    REALTIME_RECONNECT_MS: 5000,
    APP_VERSION: '1.0.0'
  };

  const STATE = {
    health: null,
    realtimeWS: null,
    realtimeRetry: 0,
    activeFlows: new Map(), // sale_id -> { type, abort, modal }
    supabaseUrl: null,
    supabaseAnonKey: null,
    publicConfigLoaded: false
  };

  // -----------------------------------------------------------------
  // Auth helpers
  // -----------------------------------------------------------------
  function getToken() {
    try { return localStorage.getItem('volvix_token') || ''; } catch (_) { return ''; }
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem('volvix_session') || '{}'); } catch (_) { return {}; }
  }
  function getTenantId() {
    const s = getSession();
    return s && (s.tenant_id || s.tenantId) || null;
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const tenantId = getTenantId();
    if (tenantId) headers['X-Tenant-Id'] = String(tenantId);

    let resp;
    try {
      resp = await fetch(path, Object.assign({}, opts, { headers }));
    } catch (e) {
      throw new Error('Red no disponible');
    }

    if (resp.status === 401) {
      try { localStorage.removeItem('volvix_token'); } catch (_) {}
      var __isPubP = (typeof window.__vlxIsPublicPage === 'function') && window.__vlxIsPublicPage();
      if (!__isPubP) {
        vlxToast('Sesión expirada. Redirigiendo...', 'error');
        setTimeout(function () { location.href = '/login.html'; }, 1200);
      }
      const err = new Error('Unauthorized');
      err.code = 401;
      throw err;
    }

    if (resp.status === 503) {
      let envName = '';
      try {
        const j = await resp.clone().json();
        envName = j && (j.missing_env || j.env || '');
      } catch (_) {}
      const err = new Error('Servicio no configurado');
      err.code = 503;
      err.missingEnv = envName;
      throw err;
    }

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 240); } catch (_) {}
      const err = new Error('HTTP ' + resp.status + (detail ? ': ' + detail : ''));
      err.code = resp.status;
      throw err;
    }

    const ct = resp.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) return resp.json();
    return resp.text();
  }

  // -----------------------------------------------------------------
  // Toast (only define if not already present)
  // -----------------------------------------------------------------
  if (typeof window.vlxToast !== 'function') {
    window.vlxToast = function vlxToast(msg, type) {
      type = type || 'info';
      let host = document.getElementById('vlx-toast-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'vlx-toast-host';
        document.body.appendChild(host);
      }
      const el = document.createElement('div');
      el.className = 'vlx-toast vlx-toast-' + type;
      el.textContent = String(msg);
      host.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('vlx-toast-show'); });
      setTimeout(function () {
        el.classList.remove('vlx-toast-show');
        setTimeout(function () { el.remove(); }, 280);
      }, type === 'error' ? 5500 : 3500);
    };
  }
  const vlxToast = window.vlxToast;

  // -----------------------------------------------------------------
  // CSS Injection
  // -----------------------------------------------------------------
  function injectCSS() {
    if (document.getElementById('vlx-payments-css')) return;
    const css = `
      #vlx-toast-host{position:fixed;right:18px;bottom:18px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}
      .vlx-toast{pointer-events:auto;background:#222;color:#fff;padding:12px 16px;border-radius:10px;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.25);min-width:240px;max-width:380px;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s}
      .vlx-toast-show{opacity:1;transform:translateY(0)}
      .vlx-toast-success{background:#16a34a}
      .vlx-toast-error{background:#dc2626}
      .vlx-toast-warn{background:#d97706}
      .vlx-toast-info{background:#2563eb}

      .vlx-pay-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 12px;border:1px solid #d1d5db;border-radius:10px;background:#fff;font-weight:600;font-size:14px;cursor:pointer;transition:transform .08s,box-shadow .15s,background .15s;min-height:54px;flex:1 1 calc(50% - 8px);box-sizing:border-box}
      .vlx-pay-btn:hover{box-shadow:0 4px 14px rgba(0,0,0,.10);transform:translateY(-1px)}
      .vlx-pay-btn:active{transform:translateY(0)}
      .vlx-pay-btn[disabled]{opacity:.5;cursor:not-allowed;transform:none}
      .vlx-pay-btn-mp{background:linear-gradient(135deg,#00b1ea,#009ee3);color:#fff;border-color:#0086c0}
      .vlx-pay-btn-stp{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-color:#166534}
      .vlx-pay-btn-codi{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-color:#5b21b6}
      .vlx-pay-btn-stripe{background:linear-gradient(135deg,#635bff,#4f46e5);color:#fff;border-color:#4338ca}
      .vlx-pay-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;width:100%}

      .vlx-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;animation:vlxFade .2s ease-out}
      @keyframes vlxFade{from{opacity:0}to{opacity:1}}
      .vlx-modal{background:#fff;border-radius:14px;max-width:480px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;animation:vlxPop .22s cubic-bezier(.2,.9,.3,1.2)}
      @keyframes vlxPop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
      .vlx-modal-head{padding:18px 20px;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;display:flex;align-items:center;justify-content:space-between}
      .vlx-modal-head h3{margin:0;font-size:17px;font-weight:700}
      .vlx-modal-close{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0 4px}
      .vlx-modal-body{padding:22px 20px}
      .vlx-modal-foot{padding:14px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;background:#f9fafb}
      .vlx-btn{padding:10px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;font-weight:600;cursor:pointer;font-size:14px}
      .vlx-btn:hover{background:#f3f4f6}
      .vlx-btn-primary{background:#2563eb;color:#fff;border-color:#1d4ed8}
      .vlx-btn-primary:hover{background:#1d4ed8}
      .vlx-btn-danger{background:#dc2626;color:#fff;border-color:#b91c1c}

      .vlx-clabe-box{background:#f1f5f9;border:2px dashed #94a3b8;border-radius:10px;padding:18px 16px;text-align:center;margin:12px 0}
      .vlx-clabe-label{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#64748b;font-weight:600;margin-bottom:6px}
      .vlx-clabe-value{font-size:24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;color:#0f172a;letter-spacing:1.5px;word-break:break-all;cursor:pointer;user-select:all}
      .vlx-clabe-value:hover{color:#2563eb}
      .vlx-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
      .vlx-meta-cell{background:#f8fafc;border-radius:8px;padding:10px 12px}
      .vlx-meta-cell .lbl{font-size:11px;text-transform:uppercase;color:#64748b;font-weight:600;letter-spacing:.4px}
      .vlx-meta-cell .val{font-size:15px;font-weight:700;color:#0f172a;margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .vlx-amount{font-size:34px;text-align:center;font-weight:800;color:#0f172a;margin:6px 0 14px}
      .vlx-amount .currency{font-size:18px;color:#64748b;margin-right:4px;font-weight:600}

      .vlx-countdown{text-align:center;font-size:13px;color:#475569;margin-top:8px}
      .vlx-countdown .num{font-family:ui-monospace,monospace;font-weight:700;color:#0f172a;font-size:16px}
      .vlx-countdown.expired{color:#dc2626}

      .vlx-status-line{display:flex;align-items:center;gap:8px;justify-content:center;font-size:13px;color:#475569;padding:10px 0;background:#f8fafc;border-radius:8px;margin-top:10px}
      .vlx-spin{width:14px;height:14px;border:2px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:vlxSpin 1s linear infinite}
      @keyframes vlxSpin{to{transform:rotate(360deg)}}

      .vlx-qr-wrap{text-align:center;padding:8px 0}
      .vlx-qr-wrap img{max-width:260px;width:100%;height:auto;border-radius:8px;border:1px solid #e5e7eb;background:#fff}

      .vlx-success{text-align:center;padding:24px 8px;animation:vlxFade .25s}
      .vlx-success .check{width:88px;height:88px;border-radius:50%;background:#16a34a;color:#fff;font-size:54px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;animation:vlxPunch .55s cubic-bezier(.2,.9,.3,1.4)}
      @keyframes vlxPunch{0%{transform:scale(0);opacity:0}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}
      .vlx-success h4{margin:0 0 6px;font-size:20px;color:#0f172a}
      .vlx-success p{margin:0;color:#475569;font-size:14px}

      .vlx-rt-dot{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f1f5f9;font-size:12px;font-weight:600;color:#475569;cursor:default;user-select:none}
      .vlx-rt-dot .d{width:8px;height:8px;border-radius:50%;background:#94a3b8;box-shadow:0 0 0 0 rgba(148,163,184,.7);transition:background .2s}
      .vlx-rt-dot.online .d{background:#16a34a;animation:vlxPulse 2s infinite}
      .vlx-rt-dot.error .d{background:#dc2626}
      @keyframes vlxPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.55)}70%{box-shadow:0 0 0 8px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}

      .vlx-pay-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#eef2ff;font-size:12px;font-weight:600;color:#3730a3;margin-left:8px;cursor:help}
      .vlx-pay-badge .meth{display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:6px;background:#fff;color:#3730a3;font-size:11px;border:1px solid #c7d2fe}
      .vlx-pay-badge .meth.off{opacity:.35;text-decoration:line-through}

      .vlx-copy-hint{font-size:11px;color:#64748b;margin-top:4px;text-align:center;font-style:italic}
    `;
    const style = document.createElement('style');
    style.id = 'vlx-payments-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -----------------------------------------------------------------
  // Modal helper
  // -----------------------------------------------------------------
  function openModal(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'vlx-modal-backdrop';
    wrap.innerHTML = `
      <div class="vlx-modal" role="dialog" aria-modal="true">
        <div class="vlx-modal-head">
          <h3>${escapeHtml(opts.title || 'Pago')}</h3>
          <button type="button" class="vlx-modal-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="vlx-modal-body"></div>
        ${opts.foot ? `<div class="vlx-modal-foot"></div>` : ''}
      </div>`;
    const body = wrap.querySelector('.vlx-modal-body');
    const foot = wrap.querySelector('.vlx-modal-foot');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body instanceof Node) body.appendChild(opts.body);
    if (foot && opts.foot instanceof Node) foot.appendChild(opts.foot);
    else if (foot && typeof opts.foot === 'string') foot.innerHTML = opts.foot;

    document.body.appendChild(wrap);

    function close() {
      if (!wrap.parentNode) return;
      wrap.style.opacity = '0';
      setTimeout(function () { wrap.remove(); }, 180);
      if (typeof opts.onClose === 'function') {
        try { opts.onClose(); } catch (_) {}
      }
    }
    wrap.querySelector('.vlx-modal-close').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap && opts.dismissOnBackdrop !== false) close(); });
    document.addEventListener('keydown', function escListener(e) {
      if (e.key === 'Escape' && wrap.parentNode) {
        close();
        document.removeEventListener('keydown', escListener);
      }
    });

    return { el: wrap, body, foot, close };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtMoney(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // -----------------------------------------------------------------
  // POS integration helpers
  // -----------------------------------------------------------------
  function getCurrentSale() {
    // Try several known POS globals/structures
    try {
      if (window.volvix && window.volvix.cart && typeof window.volvix.cart.snapshot === 'function') {
        return window.volvix.cart.snapshot();
      }
    } catch (_) {}
    try {
      if (typeof window.getCurrentTicket === 'function') return window.getCurrentTicket();
    } catch (_) {}
    try {
      if (window.__vlxCurrentSale) return window.__vlxCurrentSale;
    } catch (_) {}

    // Fallback: build minimal info from on-screen total
    const totalEl = document.querySelector('[data-vlx-total]') ||
                    document.querySelector('#cobro-total') ||
                    document.querySelector('.cobro-total') ||
                    document.querySelector('#total-cobrar');
    let amount = 0;
    if (totalEl) {
      const raw = (totalEl.textContent || '').replace(/[^0-9.,]/g, '').replace(/,/g, '');
      amount = parseFloat(raw) || 0;
    }
    return {
      sale_id: 'tmp_' + Date.now(),
      tenant_id: getTenantId(),
      total: amount,
      currency: 'MXN',
      items: [],
      ephemeral: true
    };
  }

  function markSalePaid(saleId, method, extra) {
    try {
      if (typeof window.__vlxPayVerifyApprove === 'function') {
        window.__vlxPayVerifyApprove({ sale_id: saleId, method: method, ref: extra });
        return true;
      }
    } catch (_) {}
    try {
      if (window.volvix && typeof window.volvix.markPaid === 'function') {
        window.volvix.markPaid(saleId, method, extra);
        return true;
      }
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('vlx:payment:approved', { detail: { sale_id: saleId, method, extra } }));
      return true;
    } catch (_) {}
    return false;
  }

  function cancelSaleFlow(reason) {
    try {
      if (typeof window.__vlxAppPayCancel === 'function') window.__vlxAppPayCancel(reason || 'cancel');
    } catch (_) {}
  }

  // -----------------------------------------------------------------
  // Sound on success
  // -----------------------------------------------------------------
  function playSuccessSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      [880, 1320, 1760].forEach(function (f, i) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.type = 'sine';
        g.gain.setValueAtTime(0, now + i * 0.10);
        g.gain.linearRampToValueAtTime(0.18, now + i * 0.10 + 0.01);
        g.gain.linearRampToValueAtTime(0, now + i * 0.10 + 0.16);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + i * 0.10); o.stop(now + i * 0.10 + 0.18);
      });
      setTimeout(function () { try { ctx.close(); } catch (_) {} }, 800);
    } catch (_) { /* silent */ }
  }

  // -----------------------------------------------------------------
  // Public config / health
  // -----------------------------------------------------------------
  async function loadPublicConfig() {
    if (STATE.publicConfigLoaded) return;
    try {
      const cfg = await apiFetch('/api/config');
      if (cfg && typeof cfg === 'object') {
        STATE.supabaseUrl = cfg.supabase_url || cfg.SUPABASE_URL ||
          (window.volvix && window.volvix.config && window.volvix.config.SUPABASE_URL) || null;
        STATE.supabaseAnonKey = cfg.supabase_anon_key || cfg.SUPABASE_ANON_KEY || cfg.anon_key || null;
      }
    } catch (e) {
      // fallback to window.volvix.config
      if (window.volvix && window.volvix.config) {
        STATE.supabaseUrl = window.volvix.config.SUPABASE_URL || null;
        STATE.supabaseAnonKey = window.volvix.config.SUPABASE_ANON_KEY || null;
      }
    }
    STATE.publicConfigLoaded = true;
  }

  async function loadHealth() {
    try {
      const h = await apiFetch('/api/payments/health');
      STATE.health = h && typeof h === 'object' ? h : null;
    } catch (e) {
      STATE.health = null;
    }
    renderHeaderBadge();
  }

  // -----------------------------------------------------------------
  // Header badge & realtime indicator
  // -----------------------------------------------------------------
  function findHeaderHost() {
    return document.querySelector('[data-vlx-online]') ||
           document.querySelector('.online-indicator') ||
           document.querySelector('#online-indicator') ||
           document.querySelector('header .status') ||
           document.querySelector('header') ||
           null;
  }

  function renderHeaderBadge() {
    const host = findHeaderHost();
    if (!host) return;

    // Realtime dot
    let dot = document.getElementById('vlx-rt-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.id = 'vlx-rt-dot';
      dot.className = 'vlx-rt-dot';
      dot.title = 'Estado realtime de pagos';
      dot.innerHTML = '<span class="d"></span><span class="t">Pagos</span>';
      host.appendChild(dot);
    }

    // Methods badge
    if (STATE.health) {
      let badge = document.getElementById('vlx-pay-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'vlx-pay-badge';
        badge.className = 'vlx-pay-badge';
        badge.title = 'Métodos de pago Volvix activos';
        host.appendChild(badge);
      }
      const methods = [
        { k: 'mp', label: 'MP' },
        { k: 'stp', label: 'STP' },
        { k: 'codi', label: 'CoDi' },
        { k: 'stripe', label: 'Stripe' }
      ];
      const inner = methods.map(function (m) {
        const on = !!STATE.health[m.k];
        return '<span class="meth ' + (on ? '' : 'off') + '" title="' + m.label + ' ' + (on ? 'activo' : 'inactivo') + '">' + m.label + '</span>';
      }).join('');
      badge.innerHTML = '<span>Pagos Volvix</span>' + inner;
    }
  }

  function setRealtimeStatus(state) {
    const dot = document.getElementById('vlx-rt-dot');
    if (!dot) return;
    dot.classList.remove('online', 'error');
    if (state === 'online') dot.classList.add('online');
    else if (state === 'error') dot.classList.add('error');
    const t = dot.querySelector('.t');
    if (t) t.textContent = state === 'online' ? 'Pagos en vivo' : (state === 'error' ? 'Pagos offline' : 'Pagos');
  }

  // -----------------------------------------------------------------
  // Supabase Realtime (raw WebSocket — no SDK needed)
  // -----------------------------------------------------------------
  function openRealtime() {
    if (!STATE.supabaseUrl || !STATE.supabaseAnonKey) {
      setRealtimeStatus('error');
      return;
    }
    try {
      if (STATE.realtimeWS && STATE.realtimeWS.readyState <= 1) return;
    } catch (_) {}

    const wsUrl = STATE.supabaseUrl.replace(/^http/, 'ws') +
      '/realtime/v1/websocket?apikey=' + encodeURIComponent(STATE.supabaseAnonKey) + '&vsn=1.0.0';
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      setRealtimeStatus('error');
      scheduleReconnect();
      return;
    }
    STATE.realtimeWS = ws;
    let heartbeat = null;
    let ref = 1;

    ws.addEventListener('open', function () {
      STATE.realtimeRetry = 0;
      setRealtimeStatus('online');
      try {
        ws.send(JSON.stringify({
          topic: 'realtime:pos_payment_updates',
          event: 'phx_join',
          payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
          ref: String(ref++)
        }));
      } catch (_) {}
      heartbeat = setInterval(function () {
        try {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref++) }));
        } catch (_) {}
      }, 25000);
    });

    ws.addEventListener('message', function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.event) return;
      if (msg.event === 'broadcast' || msg.event === 'postgres_changes' || msg.event === 'INSERT' || msg.event === 'UPDATE') {
        const payload = msg.payload && (msg.payload.payload || msg.payload.record || msg.payload) || {};
        handleRealtimePayment(payload);
      }
    });

    ws.addEventListener('close', function () {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      setRealtimeStatus('error');
      scheduleReconnect();
    });
    ws.addEventListener('error', function () {
      setRealtimeStatus('error');
      try { ws.close(); } catch (_) {}
    });
  }

  function scheduleReconnect() {
    STATE.realtimeRetry = Math.min(STATE.realtimeRetry + 1, 8);
    const delay = Math.min(CFG.REALTIME_RECONNECT_MS * STATE.realtimeRetry, 60000);
    setTimeout(openRealtime, delay);
  }

  function handleRealtimePayment(p) {
    if (!p) return;
    const saleId = p.sale_id || p.saleId || p.reference || null;
    const status = (p.status || '').toLowerCase();
    if (!saleId) return;
    if (status !== 'confirmed' && status !== 'approved' && status !== 'paid') return;

    const flow = STATE.activeFlows.get(saleId);
    if (flow) {
      flow.confirm && flow.confirm(p);
    } else {
      // Fire global event so the POS can pick it up if the active flow lives there
      window.dispatchEvent(new CustomEvent('vlx:payment:realtime', { detail: p }));
    }
  }

  // -----------------------------------------------------------------
  // Polling helper
  // -----------------------------------------------------------------
  function startPolling(fn, intervalMs, timeoutMs, onTimeout) {
    let stopped = false;
    const start = Date.now();
    function tick() {
      if (stopped) return;
      if (Date.now() - start > timeoutMs) {
        stopped = true;
        if (typeof onTimeout === 'function') onTimeout();
        return;
      }
      Promise.resolve().then(fn).catch(function () {}).finally(function () {
        if (!stopped) setTimeout(tick, intervalMs);
      });
    }
    setTimeout(tick, intervalMs);
    return function stop() { stopped = true; };
  }

  // -----------------------------------------------------------------
  // Mercado Pago
  // -----------------------------------------------------------------
  async function payWithMercadoPago() {
    const sale = getCurrentSale();
    if (!sale || !sale.total || sale.total <= 0) {
      vlxToast('No hay un total a cobrar', 'warn');
      return;
    }
    let pref;
    try {
      pref = await apiFetch('/api/payments/mercadopago/preference', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: sale.sale_id,
          tenant_id: sale.tenant_id || getTenantId(),
          amount: Number(sale.total),
          currency: sale.currency || 'MXN',
          items: sale.items || [],
          description: sale.description || 'Venta POS Volvix'
        })
      });
    } catch (e) {
      handlePayError(e, 'Mercado Pago', 'MERCADOPAGO_ACCESS_TOKEN');
      return;
    }
    if (!pref || !pref.init_point) {
      vlxToast('Mercado Pago no devolvió un init_point', 'error');
      return;
    }

    const win = window.open(pref.init_point, '_blank', 'noopener,noreferrer');
    if (!win) vlxToast('Permite ventanas emergentes para Mercado Pago', 'warn');

    showStatusModal({
      title: 'Mercado Pago',
      sale: sale,
      lead: 'Esperando confirmación del pago...',
      sub: 'Completa el pago en la ventana de Mercado Pago. Esta ventana se actualizará automáticamente.',
      onCancel: function () {
        cancelSaleFlow('mp_cancel');
      }
    }, function (modalCtl) {
      const paymentId = pref.payment_id || pref.preference_id;
      const stop = startPolling(async function () {
        try {
          const s = await apiFetch('/api/payments/mercadopago/status/' + encodeURIComponent(paymentId));
          if (s && (s.status === 'approved' || s.status === 'paid')) {
            stop();
            modalCtl.confirm(s);
          } else if (s && (s.status === 'rejected' || s.status === 'cancelled')) {
            stop();
            modalCtl.fail('Pago ' + s.status);
          }
        } catch (_) { /* keep polling */ }
      }, CFG.POLL_INTERVAL_MS, CFG.POLL_TIMEOUT_MS, function () {
        modalCtl.fail('Tiempo agotado. Verifica en Mercado Pago.');
      });
      modalCtl.onCancel(function () { stop(); });

      STATE.activeFlows.set(sale.sale_id, {
        type: 'mp',
        confirm: function (p) { stop(); modalCtl.confirm(p); }
      });
    });
  }

  // -----------------------------------------------------------------
  // STP transfer
  // -----------------------------------------------------------------
  async function payWithSTP() {
    const sale = getCurrentSale();
    if (!sale || !sale.total || sale.total <= 0) {
      vlxToast('No hay un total a cobrar', 'warn');
      return;
    }
    let ref;
    try {
      ref = await apiFetch('/api/payments/stp/generate-reference', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: sale.sale_id,
          tenant_id: sale.tenant_id || getTenantId(),
          amount: Number(sale.total),
          currency: 'MXN'
        })
      });
    } catch (e) {
      handlePayError(e, 'STP', 'STP_API_KEY');
      return;
    }
    if (!ref || !ref.clabe || !ref.reference) {
      vlxToast('STP no devolvió referencia', 'error');
      return;
    }

    const expiresAt = ref.expires_at ? new Date(ref.expires_at).getTime() : Date.now() + CFG.STP_EXPIRY_MS;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="vlx-amount"><span class="currency">$</span>${escapeHtml(fmtMoney(ref.amount || sale.total))}</div>
      <div class="vlx-clabe-box">
        <div class="vlx-clabe-label">CLABE Interbancaria</div>
        <div class="vlx-clabe-value" id="vlx-clabe">${escapeHtml(ref.clabe)}</div>
        <div class="vlx-copy-hint">Toca la CLABE para copiar</div>
      </div>
      <div class="vlx-meta-grid">
        <div class="vlx-meta-cell">
          <div class="lbl">Referencia</div>
          <div class="val">${escapeHtml(ref.reference)}</div>
        </div>
        <div class="vlx-meta-cell">
          <div class="lbl">Concepto</div>
          <div class="val">POS-${escapeHtml(String(sale.sale_id).slice(-6))}</div>
        </div>
      </div>
      <div class="vlx-status-line"><span class="vlx-spin"></span><span>Esperando confirmación SPEI...</span></div>
      <div class="vlx-countdown" id="vlx-countdown">Expira en <span class="num">5:00</span></div>
    `;
    body.querySelector('#vlx-clabe').addEventListener('click', function () {
      copyToClipboard(ref.clabe);
      vlxToast('CLABE copiada', 'success');
    });

    showStatusModal({
      title: 'Transferencia SPEI / STP',
      sale: sale,
      bodyEl: body,
      onCancel: function () { cancelSaleFlow('stp_cancel'); }
    }, function (modalCtl) {
      // Countdown
      const cdEl = body.querySelector('#vlx-countdown');
      const cdNum = body.querySelector('#vlx-countdown .num');
      const cdTimer = setInterval(function () {
        const ms = expiresAt - Date.now();
        if (ms <= 0) {
          cdEl.classList.add('expired');
          cdNum.textContent = 'EXPIRADO';
          clearInterval(cdTimer);
          modalCtl.fail('Referencia expirada');
          return;
        }
        const s = Math.floor(ms / 1000);
        cdNum.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      }, 500);

      // Polling fallback
      const stop = startPolling(async function () {
        try {
          const v = await apiFetch('/api/payments/stp/verify/' + encodeURIComponent(ref.reference));
          if (v && (v.status === 'confirmed' || v.status === 'paid')) {
            stop();
            clearInterval(cdTimer);
            modalCtl.confirm(v);
          }
        } catch (_) { /* keep polling */ }
      }, CFG.POLL_INTERVAL_STP_MS, CFG.POLL_TIMEOUT_MS, function () {
        clearInterval(cdTimer);
        modalCtl.fail('Tiempo agotado sin confirmación');
      });

      modalCtl.onCancel(function () { stop(); clearInterval(cdTimer); });

      STATE.activeFlows.set(sale.sale_id, {
        type: 'stp',
        confirm: function (p) { stop(); clearInterval(cdTimer); modalCtl.confirm(p); }
      });
      // Also index by reference for realtime
      STATE.activeFlows.set(ref.reference, {
        type: 'stp',
        confirm: function (p) { stop(); clearInterval(cdTimer); modalCtl.confirm(p); }
      });
    });
  }

  // -----------------------------------------------------------------
  // CoDi QR
  // -----------------------------------------------------------------
  async function payWithCoDi() {
    const sale = getCurrentSale();
    if (!sale || !sale.total || sale.total <= 0) {
      vlxToast('No hay un total a cobrar', 'warn');
      return;
    }
    let qr;
    try {
      qr = await apiFetch('/api/payments/stp/qr-codi', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: sale.sale_id,
          tenant_id: sale.tenant_id || getTenantId(),
          amount: Number(sale.total),
          currency: 'MXN'
        })
      });
    } catch (e) {
      handlePayError(e, 'CoDi', 'STP_API_KEY');
      return;
    }
    if (!qr || (!qr.qr_image_url && !qr.qr_data)) {
      vlxToast('CoDi no devolvió QR', 'error');
      return;
    }

    const imgSrc = qr.qr_image_url || (qr.qr_data && qr.qr_data.startsWith('data:') ? qr.qr_data : null);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="vlx-amount"><span class="currency">$</span>${escapeHtml(fmtMoney(qr.amount || sale.total))}</div>
      <div class="vlx-qr-wrap">
        ${imgSrc
          ? `<img src="${escapeHtml(imgSrc)}" alt="CoDi QR" />`
          : `<div id="vlx-qr-fallback" style="padding:20px;border:1px dashed #94a3b8;border-radius:8px;font-family:monospace;font-size:11px;word-break:break-all">${escapeHtml(qr.qr_data || '')}</div>`}
      </div>
      <div class="vlx-status-line"><span class="vlx-spin"></span><span>Escanea el QR con tu app bancaria...</span></div>
    `;

    showStatusModal({
      title: 'CoDi - Pago con QR',
      sale: sale,
      bodyEl: body,
      onCancel: function () { cancelSaleFlow('codi_cancel'); }
    }, function (modalCtl) {
      const paymentId = qr.payment_id || qr.reference || sale.sale_id;
      const stop = startPolling(async function () {
        try {
          const v = await apiFetch('/api/payments/stp/verify/' + encodeURIComponent(paymentId));
          if (v && (v.status === 'confirmed' || v.status === 'paid')) {
            stop();
            modalCtl.confirm(v);
          }
        } catch (_) { /* keep */ }
      }, CFG.POLL_INTERVAL_STP_MS, CFG.POLL_TIMEOUT_MS, function () {
        modalCtl.fail('Tiempo agotado sin confirmación');
      });

      modalCtl.onCancel(function () { stop(); });

      STATE.activeFlows.set(sale.sale_id, {
        type: 'codi',
        confirm: function (p) { stop(); modalCtl.confirm(p); }
      });
      if (paymentId !== sale.sale_id) {
        STATE.activeFlows.set(paymentId, {
          type: 'codi',
          confirm: function (p) { stop(); modalCtl.confirm(p); }
        });
      }
    });
  }

  // -----------------------------------------------------------------
  // Stripe
  // -----------------------------------------------------------------
  async function payWithStripe() {
    const sale = getCurrentSale();
    if (!sale || !sale.total || sale.total <= 0) {
      vlxToast('No hay un total a cobrar', 'warn');
      return;
    }
    let res;
    try {
      res = await apiFetch('/api/payments/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: sale.sale_id,
          tenant_id: sale.tenant_id || getTenantId(),
          amount: Number(sale.total),
          currency: sale.currency || 'MXN',
          items: sale.items || []
        })
      });
    } catch (e) {
      handlePayError(e, 'Stripe', 'STRIPE_SECRET_KEY');
      return;
    }
    if (!res || !res.url) {
      vlxToast('Stripe no devolvió URL de checkout', 'error');
      return;
    }
    const win = window.open(res.url, '_blank', 'noopener,noreferrer');
    if (!win) {
      vlxToast('Bloqueador de ventanas activo. Redirigiendo...', 'warn');
      setTimeout(function () { location.href = res.url; }, 800);
    } else {
      vlxToast('Stripe Checkout abierto en pestaña nueva', 'info');
    }
  }

  function handlePayError(e, label, envVar) {
    if (!e || e.code === 401) return; // 401 already handled
    if (e.code === 503) {
      const env = e.missingEnv || envVar || '';
      const msg = env
        ? label + ' no configurado. Agrega ' + env + ' en Vercel.'
        : label + ' no configurado todavía';
      vlxToast(msg, 'warn');
      if (env) {
        try { copyToClipboard(env); vlxToast(env + ' copiado al portapapeles', 'info'); } catch (_) {}
      }
      return;
    }
    vlxToast(label + ': ' + (e.message || 'Error desconocido'), 'error');
  }

  // -----------------------------------------------------------------
  // Generic status modal with confirm/fail/cancel hooks
  // -----------------------------------------------------------------
  function showStatusModal(opts, onReady) {
    const sale = opts.sale || {};
    const body = opts.bodyEl || (function () {
      const d = document.createElement('div');
      d.innerHTML = `
        <div class="vlx-amount"><span class="currency">$</span>${escapeHtml(fmtMoney(sale.total))}</div>
        <p style="text-align:center;color:#475569;margin:8px 0">${escapeHtml(opts.lead || '')}</p>
        ${opts.sub ? `<p style="text-align:center;color:#94a3b8;font-size:13px;margin:4px 0 12px">${escapeHtml(opts.sub)}</p>` : ''}
        <div class="vlx-status-line"><span class="vlx-spin"></span><span>Procesando...</span></div>
      `;
      return d;
    })();

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'vlx-btn';
    cancelBtn.textContent = 'Cancelar';

    const foot = document.createElement('div');
    foot.style.display = 'flex';
    foot.style.justifyContent = 'flex-end';
    foot.style.gap = '8px';
    foot.appendChild(cancelBtn);

    const cancelHooks = [];
    let closed = false;

    const m = openModal({
      title: opts.title || 'Pago',
      body,
      foot,
      dismissOnBackdrop: false,
      onClose: function () {
        if (closed) return;
        closed = true;
        cancelHooks.forEach(function (fn) { try { fn(); } catch (_) {} });
        if (sale && sale.sale_id) STATE.activeFlows.delete(sale.sale_id);
        if (typeof opts.onCancel === 'function') opts.onCancel();
      }
    });

    cancelBtn.addEventListener('click', function () { m.close(); });

    const ctl = {
      modal: m,
      onCancel: function (fn) { cancelHooks.push(fn); },
      confirm: function (data) {
        if (closed) return;
        closed = true;
        body.innerHTML = `
          <div class="vlx-success">
            <div class="check">&#10003;</div>
            <h4>Pago confirmado</h4>
            <p>${escapeHtml((data && data.amount) ? '$' + fmtMoney(data.amount) + ' MXN' : '')}</p>
          </div>
        `;
        cancelBtn.style.display = 'none';
        playSuccessSound();
        markSalePaid(sale.sale_id, opts.title || 'pay', data);
        if (sale && sale.sale_id) STATE.activeFlows.delete(sale.sale_id);
        setTimeout(function () { m.close(); }, 1800);
      },
      fail: function (msg) {
        if (closed) return;
        vlxToast(msg || 'Pago no confirmado', 'error');
        body.querySelector('.vlx-status-line') && body.querySelector('.vlx-status-line').remove();
        const errBox = document.createElement('div');
        errBox.style.cssText = 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 12px;border-radius:8px;text-align:center;font-size:13px;margin-top:8px';
        errBox.textContent = msg || 'Pago no confirmado';
        body.appendChild(errBox);
        cancelBtn.textContent = 'Cerrar';
      }
    };

    try { onReady(ctl); } catch (e) { /* swallow */ }
  }

  // -----------------------------------------------------------------
  // Clipboard
  // -----------------------------------------------------------------
  function copyToClipboard(text) {
    text = String(text || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    try {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.left = '-9999px';
      document.body.appendChild(t); t.select();
      document.execCommand('copy');
      t.remove();
    } catch (_) {}
  }

  // -----------------------------------------------------------------
  // Inject buttons into existing cobro modal
  // -----------------------------------------------------------------
  function findPaymentMethodsHost() {
    // Look for known containers, or any element with multiple .pay-method buttons
    const candidates = [
      '.pay-methods', '#pay-methods', '.payment-methods',
      '#payment-methods', '.cobro-methods', '#cobro-methods',
      '[data-vlx-pay-methods]'
    ];
    for (let i = 0; i < candidates.length; i++) {
      const el = document.querySelector(candidates[i]);
      if (el) return el;
    }
    // Heuristic: any container with >= 2 .pay-method children
    const groups = document.querySelectorAll('.pay-method');
    if (groups.length >= 2) {
      const parent = groups[0].parentElement;
      if (parent && parent.querySelectorAll('.pay-method').length >= 2) return parent;
    }
    // Or: a fieldset / div with buttons named Efectivo/Tarjeta/Transferencia
    const buttons = Array.from(document.querySelectorAll('button'));
    const found = buttons.filter(function (b) {
      const t = (b.textContent || '').trim().toLowerCase();
      return /efectivo|tarjeta|transferencia/.test(t);
    });
    if (found.length >= 2 && found[0].parentElement) {
      return found[0].parentElement;
    }
    return null;
  }

  function injectPaymentButtons() {
    const host = findPaymentMethodsHost();
    if (!host) return false;
    if (host.dataset.vlxPaymentInjected === 'true') return true;

    const row = document.createElement('div');
    row.className = 'vlx-pay-row';
    row.dataset.vlxPaymentRow = 'true';

    const buttons = [
      { id: 'mp', label: 'Mercado Pago', icon: '🔵', cls: 'vlx-pay-btn-mp', healthKey: 'mp', handler: payWithMercadoPago },
      { id: 'stp', label: 'Transferencia STP', icon: '🟢', cls: 'vlx-pay-btn-stp', healthKey: 'stp', handler: payWithSTP },
      { id: 'codi', label: 'CoDi (QR)', icon: '📱', cls: 'vlx-pay-btn-codi', healthKey: 'codi', handler: payWithCoDi },
      { id: 'stripe', label: 'Stripe', icon: '🟣', cls: 'vlx-pay-btn-stripe', healthKey: 'stripe', handler: payWithStripe }
    ];

    buttons.forEach(function (b) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vlx-pay-btn pay-method ' + b.cls;
      btn.dataset.vlxMethod = b.id;
      btn.innerHTML = '<span style="font-size:18px">' + b.icon + '</span><span>' + escapeHtml(b.label) + '</span>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        b.handler();
      });
      row.appendChild(btn);
    });

    host.appendChild(row);
    host.dataset.vlxPaymentInjected = 'true';

    refreshButtonHealth();
    return true;
  }

  function refreshButtonHealth() {
    if (!STATE.health) return;
    document.querySelectorAll('.vlx-pay-btn[data-vlx-method]').forEach(function (btn) {
      const m = btn.dataset.vlxMethod;
      const ok = !!STATE.health[m];
      btn.disabled = !ok;
      btn.title = ok ? '' : 'No configurado';
    });
  }

  // -----------------------------------------------------------------
  // Auto-inject: poll DOM until cobro modal exists, then inject
  // -----------------------------------------------------------------
  function watchForCobroModal() {
    if (injectPaymentButtons()) return;
    const obs = new MutationObserver(function () {
      if (injectPaymentButtons()) {
        // Don't disconnect — modal can be re-rendered. Throttle re-checks.
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Also re-attempt on common open events
    ['vlx:cobroOpen', 'cobroOpen', 'openPayment'].forEach(function (ev) {
      window.addEventListener(ev, function () { setTimeout(injectPaymentButtons, 60); });
    });

    // Hook openPayment if defined
    try {
      if (typeof window.openPayment === 'function' && !window.__vlxOpenPaymentHooked) {
        const orig = window.openPayment;
        window.openPayment = function () {
          const r = orig.apply(this, arguments);
          setTimeout(injectPaymentButtons, 80);
          return r;
        };
        window.__vlxOpenPaymentHooked = true;
      }
    } catch (_) {}
  }

  // -----------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------
  async function init() {
    injectCSS();
    renderHeaderBadge();
    watchForCobroModal();

    await loadPublicConfig();
    await loadHealth();
    setInterval(loadHealth, CFG.HEALTH_REFRESH_MS);

    if (STATE.supabaseUrl && STATE.supabaseAnonKey) {
      openRealtime();
    } else {
      setRealtimeStatus('error');
    }

    // Refresh button states whenever health updates
    setInterval(refreshButtonHealth, CFG.HEALTH_REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // -----------------------------------------------------------------
  // Public API (for debugging / manual trigger)
  // -----------------------------------------------------------------
  window.vlxPayments = {
    version: CFG.APP_VERSION,
    payMP: payWithMercadoPago,
    paySTP: payWithSTP,
    payCoDi: payWithCoDi,
    payStripe: payWithStripe,
    reloadHealth: loadHealth,
    reconnectRealtime: openRealtime,
    state: STATE
  };
})();
