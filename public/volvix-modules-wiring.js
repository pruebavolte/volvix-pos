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
      // No forzamos login si estamos en una página pública (landings, marketplace…)
      var __isPub = (typeof window.__vlxIsPublicPage === 'function') && window.__vlxIsPublicPage();
      if (!__isPub) {
        vlxToast('Sesión expirada. Redirigiendo…', 'warn');
        setTimeout(function () { window.location.href = '/login.html'; }, 800);
      }
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
    // Pre-launch: la health pill flotante queda oculta en producción.
    // Solo se muestra con ?debug=1 en la URL.
    try {
      var qs = new URLSearchParams(window.location.search || '');
      if (qs.get('debug') !== '1') return false;
    } catch (_) { return false; }
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
  // Pages: ai.html / volvix_ai_engine.html / volvix_ai_support.html / volvix_ai_academy.html
  // Wiring against api/ai-engine.js: /api/ai/{chat, forecast, reorder-suggestions,
  //   sales-insights, support-chat}. Real contract uses { messages: [...] }, not
  //   { message }. Mock provider returns 200 with provider:'mock' (no 503).
  // ---------------------------------------------------------------------------
  function getPageKind() {
    if (/volvix_ai_engine\.html?$/i.test(fileName))  return 'engine';
    if (/volvix_ai_support\.html?$/i.test(fileName)) return 'support';
    if (/volvix_ai_academy\.html?$/i.test(fileName)) return 'academy';
    if (/(^|\/)ai\.html?$/i.test(fileName))          return 'ai';
    return null;
  }

  function endpointFor(kind) {
    if (kind === 'support') return '/api/ai/support-chat';
    return '/api/ai/chat';
  }

  function systemPromptFor(kind) {
    if (kind === 'engine')  return 'Eres el motor de IA de Volvix POS. Decides si el feature pedido por un cliente debe ACTIVARSE (ya existe), EXTENDERSE (existe parcial) o CREARSE (nuevo). Responde en español, conciso, indicando la decisión.';
    if (kind === 'support') return null; // backend ya inyecta SUPPORT_SYSTEM
    if (kind === 'academy') return 'Eres tutor de la Volvix Academy. Explicas paso a paso cómo usar el POS, en español, con bullets y pasos numerados.';
    return 'Eres la IA de Volvix POS. Ayudas a comerciantes con su negocio. Responde en español, conciso.';
  }

  function notifyMockIfNeeded(data) {
    if (data && data.provider === 'mock') {
      vlxToast('IA no configurada · agrega OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel', 'warn');
    }
  }

  // Per-page conversation history (resets on reload)
  var _aiHistory = [];

  async function aiSend(kind, userText, opts) {
    opts = opts || {};
    _aiHistory.push({ role: 'user', content: String(userText || '') });
    // Cap history to last 20 turns to stay token-light
    if (_aiHistory.length > 20) _aiHistory = _aiHistory.slice(-20);
    var body = { messages: _aiHistory.slice() };
    var sys = opts.system || systemPromptFor(kind);
    if (sys) body.system = sys;
    if (opts.lessonId) body.lesson_id = opts.lessonId;
    if (opts.context)  body.context   = opts.context;

    var data = await vlxCallApi('POST', endpointFor(kind), body);
    var reply = (data && (data.reply || data.message || data.text)) || '';
    if (reply) _aiHistory.push({ role: 'assistant', content: String(reply) });
    notifyMockIfNeeded(data);
    return { reply: String(reply || ''), raw: data };
  }

  // ----- ai.html (admin features) — no chat surface, just expose helpers -----
  // ----- volvix_ai_support.html: #chat-msgs / #chat-input / .send-btn ------
  function setupSupportChat() {
    var input = document.querySelector('#chat-input');
    var container = document.querySelector('#chat-msgs');
    var btn = document.querySelector('.send-btn');
    if (!input || !container) return;

    function appendBubble(role, text) {
      var wrap = document.createElement('div');
      wrap.className = 'msg ' + (role === 'user' ? 'client' : 'ai');
      wrap.innerHTML =
        '<div class="av">' + (role === 'user' ? '👤' : '🤖') + '</div>' +
        '<div>' +
          (role === 'user' ? '' : '<span class="tag">IA · Volvix Support</span>') +
          '<div class="bubble"></div>' +
          '<div class="time">' + new Date().toLocaleTimeString().slice(0,5) + '</div>' +
        '</div>';
      wrap.querySelector('.bubble').textContent = text;
      container.appendChild(wrap);
      container.scrollTop = container.scrollHeight;
      return wrap.querySelector('.bubble');
    }

    async function submit() {
      var msg = (input.value || '').trim();
      if (!msg) return;
      appendBubble('user', msg);
      input.value = '';
      var thinking = appendBubble('ai', '…');
      try {
        var r = await aiSend('support', msg);
        thinking.textContent = r.reply || '(sin respuesta)';
        if (r.raw && r.raw.escalate_to_human) {
          vlxToast('Sugerencia: escalar a soporte humano', 'warn');
        }
      } catch (e) {
        thinking.textContent = '⛔ Error consultando IA';
      }
    }

    if (btn && markWired(btn, 'supportSend')) {
      btn.addEventListener('click', function (ev) { ev.preventDefault(); submit(); });
    }
    if (input && markWired(input, 'supportKey')) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(); }
      });
    }
  }

  // ----- volvix_ai_engine.html: #ai-input / .ai-send / .ai-messages --------
  // The page already ships a hardcoded simulator (sendAI()). We keep it as
  // fallback when no auth token is present; with a token, route to /api/ai/chat.
  function setupEngineChat() {
    var input = document.querySelector('#ai-input');
    var container = document.querySelector('.ai-messages');
    var btn = document.querySelector('.ai-send');
    if (!input || !container || !btn) return;
    if (!getToken()) return; // leave the local simulator alone

    function appendBubble(role, text) {
      var wrap = document.createElement('div');
      wrap.className = 'ai-msg ' + (role === 'user' ? 'user' : 'ai');
      wrap.innerHTML = (role === 'user' ? '' : '<span class="tag">IA · Volvix</span>') +
        '<div></div>';
      wrap.lastChild.textContent = text;
      container.appendChild(wrap);
      container.scrollTop = container.scrollHeight;
      return wrap.lastChild;
    }

    async function submit() {
      var msg = (input.value || '').trim();
      if (!msg) return;
      input.value = '';
      appendBubble('user', msg);
      var thinking = appendBubble('ai', '…');
      try {
        var r = await aiSend('engine', msg);
        thinking.textContent = r.reply || '(sin respuesta)';
      } catch (e) {
        thinking.textContent = '⛔ Error consultando IA';
      }
    }

    // Override the page's onclick by capturing first
    if (markWired(btn, 'engineSend')) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopImmediatePropagation(); submit();
      }, true);
    }
    if (markWired(input, 'engineKey')) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault(); ev.stopImmediatePropagation(); submit();
        }
      }, true);
    }
  }

  // ----- volvix_ai_academy.html: no chat surface — inject floating widget --
  function setupAcademyAi() {
    if (document.getElementById('vlx-academy-ai')) return;
    // Pre-launch: avatar/IA flotante (círculo con bot) deshabilitado.
    // Solo se activa con ?debug=1 o si la página opta-in con <body data-vlx-academy-ai="1">.
    try {
      var qs = new URLSearchParams(window.location.search || '');
      var optIn = qs.get('debug') === '1' ||
                  (document.body && document.body.getAttribute('data-vlx-academy-ai') === '1');
      if (!optIn) return;
    } catch (_) { return; }

    var btn = document.createElement('button');
    btn.id = 'vlx-academy-ai-toggle';
    btn.type = 'button';
    btn.textContent = '🤖 Pregúntale a la IA';
    btn.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483640;padding:12px 16px;border-radius:999px;border:0;background:' + COLOR_AMBER + ';color:' + COLOR_DARK + ';font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);font-size:14px';

    var panel = document.createElement('div');
    panel.id = 'vlx-academy-ai';
    panel.style.cssText = 'position:fixed;right:18px;bottom:72px;width:360px;max-width:calc(100vw - 36px);height:480px;max-height:calc(100vh - 110px);background:#0F1014;border:1px solid #2A2D33;border-radius:14px;display:none;flex-direction:column;z-index:2147483641;box-shadow:0 12px 40px rgba(0,0,0,.55);font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden';
    panel.innerHTML =
      '<div style="padding:10px 12px;background:' + COLOR_NAVY + ';color:#fff;font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:space-between">' +
        '<span>🎓 IA · Volvix Academy</span>' +
        '<span id="vlx-acad-close" style="cursor:pointer;opacity:.8">×</span>' +
      '</div>' +
      '<div id="vlx-acad-msgs" style="flex:1;overflow-y:auto;padding:10px;font-size:13px;color:#ddd;line-height:1.45"></div>' +
      '<div style="display:flex;gap:6px;padding:8px;border-top:1px solid #2A2D33;background:#0A0B0F">' +
        '<input id="vlx-acad-input" placeholder="¿Qué quieres aprender?" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #333;background:#15161B;color:#eee;font-size:13px;outline:none">' +
        '<button id="vlx-acad-send" type="button" style="padding:8px 12px;border:0;border-radius:8px;background:' + COLOR_AMBER + ';color:#000;font-weight:700;cursor:pointer">Enviar</button>' +
      '</div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    var msgsEl = panel.querySelector('#vlx-acad-msgs');
    var inputEl = panel.querySelector('#vlx-acad-input');
    var sendEl = panel.querySelector('#vlx-acad-send');

    function append(role, text) {
      var div = document.createElement('div');
      div.style.cssText = 'margin:6px 0;padding:8px 10px;border-radius:10px;max-width:90%;white-space:pre-wrap;' +
        (role === 'user'
          ? 'background:' + COLOR_NAVY + ';color:#fff;margin-left:auto'
          : 'background:rgba(251,191,36,.10);border-left:3px solid ' + COLOR_AMBER + ';color:#eee');
      div.textContent = text;
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return div;
    }
    append('assistant', 'Hola! Pregúntame cualquier duda sobre cómo usar Volvix POS.');

    async function submit() {
      var msg = (inputEl.value || '').trim();
      if (!msg) return;
      inputEl.value = '';
      append('user', msg);
      var thinking = append('assistant', '…');
      try {
        var lessonId = (window.__vlxAcademyLessonId || null);
        var r = await aiSend('academy', msg, { context: 'academy', lessonId: lessonId });
        thinking.textContent = r.reply || '(sin respuesta)';
      } catch (e) {
        thinking.textContent = '⛔ Error consultando IA';
      }
    }

    btn.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
      if (panel.style.display === 'flex') setTimeout(function () { inputEl.focus(); }, 30);
    });
    panel.querySelector('#vlx-acad-close').addEventListener('click', function () {
      panel.style.display = 'none';
    });
    sendEl.addEventListener('click', function (ev) { ev.preventDefault(); submit(); });
    inputEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submit(); }
    });
  }

  // ----- Public AI helpers (forecast / reorder / insights) ------------------
  // Engine page UI doesn't ship buttons for these; expose programmatic API
  // so any future button can call window.vlxAi.{forecast,reorder,insights}().
  var vlxAi = {
    chat: function (kind, text, opts) { return aiSend(kind || 'ai', text, opts); },
    forecast: async function (params) {
      var p = params || {};
      var body = { days: [7, 14, 30].indexOf(Number(p.days)) >= 0 ? Number(p.days) : 14 };
      if (Array.isArray(p.product_ids)) body.product_ids = p.product_ids.map(String);
      if (p.tenant_id) body.tenant_id = p.tenant_id;
      var data = await vlxCallApi('POST', '/api/ai/forecast', body);
      notifyMockIfNeeded({ provider: data && data.provider });
      return data;
    },
    reorder: async function (params) {
      var body = (params && params.tenant_id) ? { tenant_id: params.tenant_id } : {};
      return vlxCallApi('POST', '/api/ai/reorder-suggestions', body);
    },
    insights: async function (params) {
      var p = params || {};
      var body = {};
      if (['7d','30d','90d'].indexOf(p.period) >= 0) body.period = p.period;
      if (p.tenant_id) body.tenant_id = p.tenant_id;
      return vlxCallApi('POST', '/api/ai/sales-insights', body);
    },
    health: function () { return vlxCallApi('GET', '/api/ai/health'); }
  };
  window.vlxAi = vlxAi;

  // Auto-wire any button that opts in via data attributes
  function setupAiButtonHooks() {
    observeBody(function () {
      document.querySelectorAll('[data-vlx-ai-action]').forEach(function (el) {
        if (!markWired(el, 'aiAction')) return;
        el.addEventListener('click', async function (ev) {
          ev.preventDefault();
          var action = el.getAttribute('data-vlx-ai-action');
          var target = el.getAttribute('data-vlx-target');
          var paramsAttr = el.getAttribute('data-vlx-params');
          var params = {};
          try { if (paramsAttr) params = JSON.parse(paramsAttr); } catch (_) {}
          var fn = vlxAi[action];
          if (typeof fn !== 'function') return;
          el.disabled = true;
          try {
            var data = await fn(params);
            if (target) {
              var t = document.querySelector(target);
              if (t) t.textContent = JSON.stringify(data, null, 2);
            }
            vlxToast(action + ' OK', 'success');
          } catch (_) { /* toast already shown by vlxCallApi */ }
          finally { el.disabled = false; }
        });
      });
    });
  }

  function setupAiChat() {
    var kind = getPageKind();
    if (!kind) return;
    if (kind === 'support') setupSupportChat();
    else if (kind === 'engine')  setupEngineChat();
    else if (kind === 'academy') setupAcademyAi();
    // 'ai' (admin features page) has no chat — only helpers
    setupAiButtonHooks();
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
  // Analytics: GA4 (gtag) + Meta Pixel (fbq) on PUBLIC pages only
  // ---------------------------------------------------------------------------
  // Public pages: index, marketplace, landing_dynamic, landing-*, registro, login.
  // Authenticated/private pages (POS, owner panels, AI panels, etc.) skip injection.
  // IDs come from window.VOLVIX_GA_ID / window.VOLVIX_FB_PIXEL_ID (per-tenant).
  // If neither is defined, nothing is injected (graceful no-op).
  function isPublicPage() {
    var f = fileName;
    if (!f || f === '' || f === '/') return /\/$/.test(path); // root
    return /^index\.html?$/i.test(f) ||
           /^marketplace\.html?$/i.test(f) ||
           /^landing_dynamic\.html?$/i.test(f) ||
           /^landing-[a-z0-9_-]+\.html?$/i.test(f) ||
           /^registro\.html?$/i.test(f) ||
           /^login\.html?$/i.test(f);
  }

  function injectGtag(gaId) {
    if (!gaId || window.__vlxGtagInjected) return;
    window.__vlxGtagInjected = true;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', gaId, { send_page_view: true });
    } catch (_) {}
  }

  function injectFbq(pixelId) {
    if (!pixelId || window.__vlxFbqInjected) return;
    window.__vlxFbqInjected = true;
    try {
      // Standard Meta Pixel base snippet (manually expanded, no eval-style minified blob).
      if (!window.fbq) {
        var n = window.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!window._fbq) window._fbq = n;
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        var t = document.createElement('script');
        t.async = true;
        t.src = 'https://connect.facebook.net/en_US/fbevents.js';
        var s = document.getElementsByTagName('script')[0];
        if (s && s.parentNode) s.parentNode.insertBefore(t, s);
        else document.head.appendChild(t);
      }
      window.fbq('init', String(pixelId));
      window.fbq('track', 'PageView');
    } catch (_) {}
  }

  function setupAnalytics() {
    if (!isPublicPage()) return;
    var gaId = window.VOLVIX_GA_ID;
    var pxId = window.VOLVIX_FB_PIXEL_ID;
    if (!gaId && !pxId) return; // graceful no-op
    if (gaId) injectGtag(gaId);
    if (pxId) injectFbq(pxId);

    // Wire CTA clicks → custom events on both providers.
    function wireCtas() {
      var ctas = document.querySelectorAll('.cta, [data-cta]');
      ctas.forEach(function (el) {
        if (!markWired(el, 'analyticsCta')) return;
        el.addEventListener('click', function () {
          var label = el.getAttribute('data-cta') ||
                      (el.innerText || el.textContent || '').trim().slice(0, 60).toLowerCase().replace(/\s+/g, '_') ||
                      'cta';
          try {
            if (window.gtag) window.gtag('event', 'cta_click', { label: label, page: fileName });
          } catch (_) {}
          try {
            if (window.fbq) window.fbq('track', 'Lead', { content_name: label, page: fileName });
          } catch (_) {}
        }, { capture: false });
      });
    }
    observeBody(wireCtas);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  function loadNotificationsCenter() {
    if (window.__vlxNotifWiringLoaded) return;
    if (document.querySelector('script[data-vlx-notif]')) return;
    try {
      var s = document.createElement('script');
      s.src = '/volvix-notifications-wiring.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-vlx-notif', '1');
      document.head.appendChild(s);
    } catch (_) {}
  }

  function loadMexicoPride() {
    if (window.__vlxMexicoPrideLoaded) return;
    if (document.querySelector('script[data-vlx-mxpride]')) return;
    // Skip explícito en login/registro/embed (el script se auto-omite también).
    if (/login\.html?$/i.test(fileName) || /registro\.html?$/i.test(fileName)) return;
    try {
      var qs = new URLSearchParams(window.location.search || '');
      if (qs.get('embed') === '1') return;
    } catch (_) {}
    try {
      var s = document.createElement('script');
      s.src = '/volvix-mexico-pride-wiring.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-vlx-mxpride', '1');
      document.head.appendChild(s);
    } catch (_) {}
  }

  whenReady(function () {
    try { setupAnalytics(); }        catch (e) { console.warn('[vlx] analytics', e); }
    try { setupRegistroOtp(); }      catch (e) { console.warn('[vlx] otp', e); }
    try { setupAiChat(); }           catch (e) { console.warn('[vlx] ai', e); }
    try { setupOwnerPanelPdf(); }    catch (e) { console.warn('[vlx] owner', e); }
    try { setupCorteZ(); }           catch (e) { console.warn('[vlx] corteZ', e); }
    try { setupCfdi(); }             catch (e) { console.warn('[vlx] cfdi', e); }
    try { setupHealthPill(); }       catch (e) { console.warn('[vlx] pill', e); }
    try { loadNotificationsCenter(); } catch (e) { console.warn('[vlx] notif', e); }
    try { loadMexicoPride(); }       catch (e) { console.warn('[vlx] mxpride', e); }
  });
})();
