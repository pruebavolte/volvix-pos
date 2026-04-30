/* volvix-modules-wiring.js
 * Auto-injected client wiring for AI / Email / PDF / Recargas / CFDI / Gateways.
 * Non-invasive: detects existing buttons via MutationObserver and patches them.
 * Vanilla JS, no dependencies. Volvix dark theme: #FBBF24 / #1E3A8A / #0A0A0A.
 */
(function () {
  'use strict';
  if (window.__vlxModulesWiringLoaded) return;
  window.__vlxModulesWiringLoaded = true;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var COLOR_AMBER = '#FBBF24';
  var COLOR_NAVY = '#1E3A8A';
  var COLOR_DARK = '#0A0A0A';
  var TOKEN_KEY = 'volvix_token';
  var HIDE_PILL_KEY = 'volvix_health_pill_hidden';
  var path = (document.location && document.location.pathname) || '/';
  var fileName = path.split('/').pop().toLowerCase();

  // ---------------------------------------------------------------------------
  // Universal helpers (idempotent — only define if not already present)
  // ---------------------------------------------------------------------------
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  async function vlxCallApi(method, url, body, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    var init = { method: method, headers: headers };
    if (body !== undefined && body !== null && method !== 'GET') {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      vlxToast('Error de red: ' + e.message, 'error');
      throw e;
    }
    if (res.status === 401) {
      vlxToast('Sesión expirada. Redirigiendo…', 'warn');
      setTimeout(function () { window.location.href = '/login.html'; }, 800);
      throw new Error('unauthorized');
    }
    if (res.status === 503) {
      var envHint = '';
      try {
        var data503 = await res.clone().json();
        envHint = data503.env_var || data503.envVar || data503.required || '';
      } catch (_) {}
      vlxToast('Servicio no configurado' + (envHint ? ': agrega ' + envHint + ' en Vercel' : ''), 'warn');
      throw new Error('service_unavailable');
    }
    var ct = res.headers.get('content-type') || '';
    var data;
    if (ct.indexOf('application/json') !== -1) {
      data = await res.json().catch(function () { return null; });
    } else {
      data = await res.text().catch(function () { return ''; });
    }
    if (!res.ok) {
      var msg = (data && data.error) || (data && data.message) || ('HTTP ' + res.status);
      vlxToast(msg, 'error');
      throw new Error(msg);
    }
    return data;
  }
  if (typeof window.vlxCallApi !== 'function') window.vlxCallApi = vlxCallApi;

  function ensureToastContainer() {
    var c = document.getElementById('vlx-toast-stack');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'vlx-toast-stack';
    c.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
    document.body.appendChild(c);
    return c;
  }
  function vlxToast(message, type) {
    try {
      var c = ensureToastContainer();
      var el = document.createElement('div');
      var bg = COLOR_NAVY, fg = '#fff', border = COLOR_AMBER;
      if (type === 'error')   { bg = '#7f1d1d'; border = '#fecaca'; }
      if (type === 'warn')    { bg = '#92400e'; border = COLOR_AMBER; }
      if (type === 'success') { bg = '#065f46'; border = '#a7f3d0'; }
      el.style.cssText = 'pointer-events:auto;padding:10px 14px;border-radius:10px;color:' + fg + ';background:' + bg + ';border-left:4px solid ' + border + ';box-shadow:0 4px 14px rgba(0,0,0,.35);font-size:14px;max-width:340px;line-height:1.35;animation:vlxToastIn .25s ease-out';
      el.textContent = String(message);
      c.appendChild(el);
      setTimeout(function () {
        el.style.transition = 'opacity .35s, transform .35s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 380);
      }, 4000);
    } catch (e) { /* noop */ }
  }
  if (typeof window.vlxToast !== 'function') window.vlxToast = vlxToast;

  function vlxFormatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency || 'MXN' }).format(Number(amount) || 0);
    } catch (_) { return '$' + (Number(amount) || 0).toFixed(2); }
  }
  if (typeof window.vlxFormatMoney !== 'function') window.vlxFormatMoney = vlxFormatMoney;

  function vlxOpenPdf(url) {
    try { window.open(url, '_blank', 'noopener'); } catch (_) {}
  }
  if (typeof window.vlxOpenPdf !== 'function') window.vlxOpenPdf = vlxOpenPdf;

  // Inject one-time stylesheet
  (function injectCss() {
    if (document.getElementById('vlx-modules-wiring-css')) return;
    var st = document.createElement('style');
    st.id = 'vlx-modules-wiring-css';
    st.textContent =
      '@keyframes vlxToastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}' +
      '.vlx-pdf-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:' + COLOR_AMBER + ';color:' + COLOR_DARK + ';font-weight:600;font-size:13px;border:none;cursor:pointer;margin-left:6px;font-family:inherit}' +
      '.vlx-pdf-btn:hover{filter:brightness(1.08)}' +
      '#vlx-health-pill{position:fixed;top:12px;right:12px;z-index:2147483645;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;background:' + COLOR_DARK + ';color:#fff;border:1px solid ' + COLOR_AMBER + ';border-radius:999px;padding:6px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);user-select:none}' +
      '#vlx-health-pill .vlx-hp-detail{display:none;margin-top:6px;padding-top:6px;border-top:1px solid #333;text-align:left;line-height:1.6}' +
      '#vlx-health-pill.vlx-hp-open{border-radius:12px;padding:8px 12px}' +
      '#vlx-health-pill.vlx-hp-open .vlx-hp-detail{display:block}' +
      '#vlx-health-pill .vlx-hp-x{margin-left:8px;color:#999;font-weight:700}' +
      '.vlx-gw-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #333;border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,.02)}' +
      '.vlx-gw-row code{font-size:11px;color:' + COLOR_AMBER + ';background:rgba(0,0,0,.4);padding:2px 6px;border-radius:4px;cursor:pointer}' +
      '.vlx-switch{position:relative;display:inline-block;width:42px;height:22px}' +
      '.vlx-switch input{opacity:0;width:0;height:0}' +
      '.vlx-slider{position:absolute;cursor:pointer;inset:0;background:#444;border-radius:22px;transition:.2s}' +
      '.vlx-slider:before{content:"";position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}' +
      '.vlx-switch input:checked + .vlx-slider{background:' + COLOR_AMBER + '}' +
      '.vlx-switch input:checked + .vlx-slider:before{transform:translateX(20px)}';
    document.head.appendChild(st);
  })();

  // ---------------------------------------------------------------------------
  // Generic DOM helper: run fn now and on every future mutation
  // ---------------------------------------------------------------------------
  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else fn();
  }
  function observeBody(handler) {
    try { handler(); } catch (_) {}
    var debounce = null;
    var mo = new MutationObserver(function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { try { handler(); } catch (_) {} }, 120);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return mo;
  }

  function findButtonByText(matcher) {
    var btns = document.querySelectorAll('button, [role=button], input[type=submit], a.btn, .btn');
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].innerText || btns[i].value || '').trim().toLowerCase();
      if (matcher(t, btns[i])) return btns[i];
    }
    return null;
  }

  function markWired(el, key) {
    if (!el || el.dataset['vlxWired_' + key]) return false;
    el.dataset['vlxWired_' + key] = '1';
    return true;
  }

  // ---------------------------------------------------------------------------
  // Health pill (universal — except login/registro)
  // ---------------------------------------------------------------------------
  function shouldShowHealthPill() {
    if (/login\.html?$/i.test(fileName) || /registro\.html?$/i.test(fileName)) return false;
    try { if (localStorage.getItem(HIDE_PILL_KEY) === '1') return false; } catch (_) {}
    return true;
  }
  async function setupHealthPill() {
    if (!shouldShowHealthPill()) return;
    if (document.getElementById('vlx-health-pill')) return;
    var pill = document.createElement('div');
    pill.id = 'vlx-health-pill';
    pill.innerHTML = '<span class="vlx-hp-summary">⏳ verificando…</span><span class="vlx-hp-x" title="Ocultar">×</span><div class="vlx-hp-detail"></div>';
    pill.addEventListener('click', function (e) {
      if ((e.target && e.target.classList && e.target.classList.contains('vlx-hp-x'))) {
        try { localStorage.setItem(HIDE_PILL_KEY, '1'); } catch (_) {}
        if (pill.parentNode) pill.parentNode.removeChild(pill);
        e.stopPropagation();
        return;
      }
      pill.classList.toggle('vlx-hp-open');
    });
    document.body.appendChild(pill);

    var modules = [
      { key: 'mercadopago', label: 'MP' },
      { key: 'stp', label: 'STP' },
      { key: 'stripe', label: 'Stripe' },
      { key: 'ai', label: 'AI' },
      { key: 'email', label: 'Email' },
      { key: 'cfdi', label: 'CFDI' },
      { key: 'recargas', label: 'Recargas' },
      { key: 'qr', label: 'QR' },
      { key: 'pdf', label: 'PDF' }
    ];
    var data = null;
    try {
      data = await fetch('/api/payments/health', { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    } catch (_) {}

    var configured = 0;
    var detail = '';
    modules.forEach(function (m) {
      var ok = false;
      if (data && typeof data === 'object') {
        var node = data[m.key] || (data.modules && data.modules[m.key]);
        if (node === true) ok = true;
        else if (node && typeof node === 'object') ok = !!(node.configured || node.ok || node.healthy);
      }
      if (ok) configured++;
      detail += '<div>' + (ok ? '🟢' : '⛔') + ' ' + m.label + '</div>';
    });

    var summary = pill.querySelector('.vlx-hp-summary');
    var detailEl = pill.querySelector('.vlx-hp-detail');
    if (configured === 0) {
      summary.textContent = '🔴 0 servicios activos · agrega API keys en Vercel';
    } else {
      summary.textContent = '🟢 ' + configured + '/' + modules.length + ' servicios activos';
    }
    detailEl.innerHTML = detail;
  }

  // ---------------------------------------------------------------------------
  // Page: registro.html — OTP via /api/email/otp
  // ---------------------------------------------------------------------------
  function genOtp() { return ('' + Math.floor(100000 + Math.random() * 900000)).slice(0, 6); }
  function setupRegistroOtp() {
    if (!/registro\.html?$/i.test(fileName)) return;
    function findOtpBtn() {
      return document.querySelector('#btnSendOtp, #otp-resend, [data-vlx-otp-send]') ||
        findButtonByText(function (t) { return /(reenviar.*c[oó]digo|enviar.*c[oó]digo|c[oó]digo|otp|siguiente)/i.test(t); });
    }
    function findEmailInput() {
      return document.querySelector('input[type=email], input[name=email], #email, #correo, [data-vlx-email]');
    }
    observeBody(function () {
      var btn = findOtpBtn();
      if (!btn || !markWired(btn, 'otp')) return;
      btn.addEventListener('click', async function (ev) {
        var emailEl = findEmailInput();
        var email = emailEl ? (emailEl.value || '').trim() : '';
        if (!email || email.indexOf('@') === -1) return; // let native validation handle it
        var code = genOtp();
        try {
          sessionStorage.setItem('vlx_otp_code', code);
          sessionStorage.setItem('vlx_otp_email', email);
          sessionStorage.setItem('vlx_otp_ts', String(Date.now()));
        } catch (_) {}
        try {
          await vlxCallApi('POST', '/api/email/otp', { email: email, code: code });
          vlxToast('Código enviado a tu correo', 'success');
        } catch (e) { /* toast already shown */ }
      }, { capture: false });
    });
  }

  // ---------------------------------------------------------------------------
  // Pages: ai.html / volvix_ai_engine.html / volvix_ai_support.html
  // ---------------------------------------------------------------------------
  function setupAiChat() {
    var isAi = /ai\.html?$/i.test(fileName);
    var isEngine = /volvix_ai_engine\.html?$/i.test(fileName);
    var isSupport = /volvix_ai_support\.html?$/i.test(fileName);
    if (!isAi && !isEngine && !isSupport) return;

    var endpoint = isEngine ? '/api/ai/forecast' : isSupport ? '/api/ai/support-chat' : '/api/ai/chat';

    function findChatContainer() {
      return document.querySelector('#chat-messages, .chat-history, [data-vlx-chat]');
    }
    function findInput() {
      return document.querySelector('#chat-input, [data-vlx-chat-input], textarea[name=message], input[name=message], textarea[placeholder*="mensaje" i], textarea[placeholder*="pregunta" i], input[placeholder*="mensaje" i]');
    }
    function findSendBtn() {
      return document.querySelector('#chat-send, [data-vlx-chat-send]') ||
        findButtonByText(function (t, el) {
          return /^(enviar|send|preguntar|ask)$/i.test(t) || el.querySelector && el.querySelector('svg[data-icon=send]');
        });
    }

    function appendMsg(container, role, text) {
      var div = document.createElement('div');
      div.className = 'vlx-chat-msg vlx-chat-' + role;
      div.style.cssText = 'padding:8px 12px;border-radius:10px;margin:6px 0;max-width:85%;' +
        (role === 'user'
          ? 'background:' + COLOR_NAVY + ';color:#fff;margin-left:auto;'
          : 'background:rgba(251,191,36,.08);border-left:3px solid ' + COLOR_AMBER + ';color:#eee;');
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
      return div;
    }

    async function submit() {
      var inp = findInput();
      var container = findChatContainer();
      if (!inp || !container) return;
      var msg = (inp.value || '').trim();
      if (!msg) return;
      appendMsg(container, 'user', msg);
      inp.value = '';
      var thinking = appendMsg(container, 'assistant', '…');
      try {
        var data = await vlxCallApi('POST', endpoint, { message: msg, prompt: msg });
        var reply = (data && (data.reply || data.message || data.text || data.forecast || data.answer)) ||
          (typeof data === 'string' ? data : JSON.stringify(data));
        thinking.textContent = String(reply);
      } catch (e) {
        thinking.textContent = '⛔ Error consultando IA';
      }
    }

    observeBody(function () {
      var btn = findSendBtn();
      if (btn && markWired(btn, 'aichat')) {
        btn.addEventListener('click', function (ev) { ev.preventDefault(); submit(); });
      }
      var inp = findInput();
      if (inp && markWired(inp, 'aichatkey')) {
        inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(); }
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Page: volvix_owner_panel_v8.html — PDF buttons + gateways section
  // ---------------------------------------------------------------------------
  function getDateRangeParams() {
    var from = document.querySelector('input[name=from], #date-from, [data-vlx-from]');
    var to = document.querySelector('input[name=to], #date-to, [data-vlx-to]');
    var qs = [];
    if (from && from.value) qs.push('from=' + encodeURIComponent(from.value));
    if (to && to.value) qs.push('to=' + encodeURIComponent(to.value));
    qs.push('download=1');
    return qs.join('&');
  }

  function setupOwnerPanelPdf() {
    if (!/volvix_owner_panel_v8\.html?$/i.test(fileName)) return;

    function addPdfBtn(near, label, url) {
      if (!near || near.parentNode.querySelector('[data-vlx-pdf="' + url + '"]')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'vlx-pdf-btn';
      b.dataset.vlxPdf = url;
      b.textContent = '📄 ' + label;
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        var qs = getDateRangeParams();
        vlxOpenPdf(url + (url.indexOf('?') === -1 ? '?' : '&') + qs);
      });
      near.parentNode.insertBefore(b, near.nextSibling);
    }

    observeBody(function () {
      var csvBtns = document.querySelectorAll('button, a');
      csvBtns.forEach(function (el) {
        var t = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (!/exportar.*csv|descargar.*csv|csv/i.test(t)) return;
        if (!markWired(el, 'pdfsib')) return;
        // Heuristic — match by text/section
        var section = (document.body.innerText || '').toLowerCase();
        var url;
        var sectionLabel = (el.closest('section,div,article,[data-section]') || document.body).innerText || '';
        var sectLow = sectionLabel.toLowerCase();
        if (/inventari/.test(sectLow))      { url = '/api/reports/inventory/pdf'; addPdfBtn(el, 'PDF inventario', url); }
        else if (/cliente/.test(sectLow))   { url = '/api/reports/customers/pdf'; addPdfBtn(el, 'PDF clientes', url); }
        else if (/utilidad|profit|ganan/.test(sectLow)) { url = '/api/reports/profit/pdf'; addPdfBtn(el, 'PDF utilidades', url); }
        else                                { url = '/api/reports/sales/pdf'; addPdfBtn(el, 'PDF ventas', url); }
      });

      // Gateways section
      var integ = document.querySelector('[data-tab=integraciones], #tab-integraciones, [data-vlx-integraciones]');
      if (!integ) {
        var headers = document.querySelectorAll('h1,h2,h3,h4');
        for (var i = 0; i < headers.length; i++) {
          if (/integracion/i.test(headers[i].innerText || '')) { integ = headers[i].parentElement; break; }
        }
      }
      if (integ && markWired(integ, 'gateways')) {
        var sect = document.createElement('div');
        sect.dataset.vlxGateways = '1';
        sect.style.cssText = 'margin-top:18px;padding:14px;border:1px solid #333;border-radius:10px;background:rgba(0,0,0,.25)';
        sect.innerHTML =
          '<h3 style="margin:0 0 10px;color:' + COLOR_AMBER + ';font-size:15px">Pasarelas de pago</h3>' +
          '<div data-vlx-gw-list>Cargando estado…</div>';
        integ.appendChild(sect);
        loadGateways(sect.querySelector('[data-vlx-gw-list]'));
      }
    });
  }

  async function loadGateways(target) {
    if (!target) return;
    var data = null;
    try {
      data = await vlxCallApi('GET', '/api/payments/health');
    } catch (_) { target.textContent = 'No se pudo consultar /api/payments/health'; return; }

    var rows = [
      { key: 'mercadopago', label: 'Mercado Pago',  env: 'MP_ACCESS_TOKEN',     endpoint: '/api/payments/mercadopago/configure' },
      { key: 'stp',         label: 'STP (SPEI)',     env: 'STP_API_KEY',         endpoint: '/api/payments/stp/configure' },
      { key: 'stripe',      label: 'Stripe',         env: 'STRIPE_SECRET_KEY',  endpoint: '/api/payments/stripe/configure' },
      { key: 'qr',          label: 'QR Payments',    env: 'QR_PROVIDER_KEY',    endpoint: '/api/payments/qr/configure' }
    ];
    target.innerHTML = '';
    rows.forEach(function (r) {
      var node = (data && (data[r.key] || (data.modules && data.modules[r.key]))) || null;
      var enabled = false;
      if (node === true) enabled = true;
      else if (node && typeof node === 'object') enabled = !!(node.configured || node.enabled || node.ok);
      var div = document.createElement('div');
      div.className = 'vlx-gw-row';
      div.innerHTML =
        '<div><strong>' + r.label + '</strong> &nbsp; <code title="Click para copiar">' + r.env + '</code></div>' +
        '<label class="vlx-switch"><input type="checkbox"' + (enabled ? ' checked' : '') + '><span class="vlx-slider"></span></label>';
      var code = div.querySelector('code');
      code.addEventListener('click', function () {
        try { navigator.clipboard.writeText(r.env); vlxToast('Copiado: ' + r.env, 'success'); } catch (_) {}
      });
      var cb = div.querySelector('input');
      cb.addEventListener('change', async function () {
        try {
          await vlxCallApi('POST', r.endpoint, { enabled: cb.checked });
          vlxToast(r.label + ' ' + (cb.checked ? 'activado' : 'desactivado'), 'success');
        } catch (e) {
          cb.checked = !cb.checked;
        }
      });
      target.appendChild(div);
    });
  }

  // ---------------------------------------------------------------------------
  // Pages: pos-corte.html / salvadorex_web_v25.html — Imprimir Corte Z
  // ---------------------------------------------------------------------------
  function setupCorteZ() {
    var isCorte = /pos-corte\.html?$/i.test(fileName);
    var isSalv = /salvadorex_web_v25\.html?$/i.test(fileName);
    if (!isCorte && !isSalv) return;
    observeBody(function () {
      var anchor = document.querySelector('[data-vlx-corte], #btn-corte-z, .corte-z-actions') ||
        findButtonByText(function (t) { return /corte.*z|cierre.*z/i.test(t); });
      if (!anchor || !markWired(anchor, 'corteZ')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'vlx-pdf-btn';
      b.textContent = '🖨️ Imprimir Corte Z (PDF)';
      b.addEventListener('click', function () {
        var cutId = (document.querySelector('[data-vlx-cut-id]') && document.querySelector('[data-vlx-cut-id]').value) ||
                    (window.currentCutId || '');
        var url = '/api/reports/cash-cut/pdf' + (cutId ? '?cut_id=' + encodeURIComponent(cutId) : '');
        vlxOpenPdf(url);
      });
      var holder = anchor.parentNode || document.body;
      holder.insertBefore(b, anchor.nextSibling || null);
    });
  }

  // ---------------------------------------------------------------------------
  // Generic CFDI button via [data-vlx-cfdi-button]
  // ---------------------------------------------------------------------------
  function setupCfdi() {
    observeBody(function () {
      var btns = document.querySelectorAll('[data-vlx-cfdi-button]');
      btns.forEach(function (b) {
        if (!markWired(b, 'cfdi')) return;
        b.addEventListener('click', async function (ev) {
          ev.preventDefault();
          var saleId = b.dataset.saleId || b.getAttribute('data-sale-id') || window.currentSaleId || '';
          var rfc = window.prompt('RFC del cliente:');
          if (!rfc) return;
          rfc = rfc.trim().toUpperCase();
          try {
            var data = await vlxCallApi('POST', '/api/cfdi/stamp', { sale_id: saleId, rfc: rfc });
            var uuid = (data && (data.uuid || data.UUID || (data.cfdi && data.cfdi.uuid))) || '';
            vlxToast('CFDI timbrado: ' + (uuid || 'OK'), 'success');
          } catch (_) {}
        });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  whenReady(function () {
    try { setupRegistroOtp(); }      catch (e) { console.warn('[vlx] otp', e); }
    try { setupAiChat(); }           catch (e) { console.warn('[vlx] ai', e); }
    try { setupOwnerPanelPdf(); }    catch (e) { console.warn('[vlx] owner', e); }
    try { setupCorteZ(); }           catch (e) { console.warn('[vlx] corteZ', e); }
    try { setupCfdi(); }             catch (e) { console.warn('[vlx] cfdi', e); }
    try { setupHealthPill(); }       catch (e) { console.warn('[vlx] pill', e); }
  });
})();
