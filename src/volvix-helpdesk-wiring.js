/**
 * volvix-helpdesk-wiring.js
 * R12-O-5-D: Helpdesk widget flotante con KB search + soporte 24/7 + bug report
 *
 * Uso:
 *   <script src="./volvix-helpdesk-wiring.js" defer></script>
 *   window.VolvixHelpdesk.init({ lang: 'es', crispWebsiteId: '...', userRole: 'owner' });
 *
 * Trigger: solo paneles owner/cashier (NO en landings publicas).
 * Vanilla JS - SIN dependencias externas.
 */
(function (global) {
  'use strict';

  // ===== i18n =====
  var I18N = {
    es: {
      help_btn: 'Ayuda',
      title: 'Centro de soporte Volvix',
      placeholder: 'Buscar en la base de conocimiento...',
      top_articles: 'Articulos mas consultados',
      talk_support: 'Hablar con soporte',
      report_bug: 'Reportar un bug',
      send_idea: 'Enviar idea',
      submit: 'Enviar',
      cancel: 'Cancelar',
      desc_bug: 'Describe el problema (que esperabas, que paso):',
      desc_idea: 'Comparte tu idea o sugerencia:',
      thanks: 'Gracias, recibimos tu reporte.',
      no_results: 'Sin resultados. Intenta con otra palabra.',
      offline: 'Estamos fuera de linea, deja un mensaje.',
      take_screenshot: 'Adjuntar captura de pantalla',
      sending: 'Enviando...'
    },
    en: {
      help_btn: 'Help',
      title: 'Volvix Support Center',
      placeholder: 'Search the knowledge base...',
      top_articles: 'Top articles',
      talk_support: 'Talk to support',
      report_bug: 'Report a bug',
      send_idea: 'Send idea',
      submit: 'Submit',
      cancel: 'Cancel',
      desc_bug: 'Describe the problem (expected vs actual):',
      desc_idea: 'Share your idea or suggestion:',
      thanks: 'Thanks, we received your report.',
      no_results: 'No results. Try another word.',
      offline: 'We are offline, please leave a message.',
      take_screenshot: 'Attach screenshot',
      sending: 'Sending...'
    }
  };

  var TOP_ARTICLES_FALLBACK = [
    { slug: 'getting-started', title_es: 'Como empezar', title_en: 'Getting started' },
    { slug: 'cobrar-tarjeta', title_es: 'Cobrar con tarjeta', title_en: 'Charge a card' },
    { slug: 'cierre-z', title_es: 'Cierre Z diario', title_en: 'Daily Z close' },
    { slug: 'inventario-bajo', title_es: 'Inventario bajo', title_en: 'Low inventory' },
    { slug: 'devoluciones', title_es: 'Devoluciones', title_en: 'Returns' },
    { slug: 'cfdi-error', title_es: 'Error CFDI 4.0', title_en: 'CFDI 4.0 error' },
    { slug: 'contrasena-olvidada', title_es: 'Contrasena olvidada', title_en: 'Forgot password' },
    { slug: 'agregar-cajero', title_es: 'Agregar cajero', title_en: 'Add cashier' },
    { slug: 'multi-sucursal', title_es: 'Multi sucursal', title_en: 'Multi branch' },
    { slug: 'exportar-datos', title_es: 'Exportar datos', title_en: 'Export data' }
  ];

  var state = {
    lang: 'es',
    open: false,
    crispWebsiteId: null,
    plainAppId: null,
    apiBase: '/api',
    userRole: null,
    panelMode: 'home', // home | bug | idea | results
    lastQuery: ''
  };

  function t(key) {
    var dict = I18N[state.lang] || I18N.es;
    return dict[key] || key;
  }

  // ===== STYLES (inyectados dinamicamente) =====
  var CSS = [
    '#vlx-hd-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#3b82f6);border:none;color:#fff;font-size:24px;cursor:pointer;z-index:99998;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;animation:vlxPulse 2s infinite}',
    '@keyframes vlxPulse{0%{box-shadow:0 0 0 0 rgba(124,58,237,.5)}70%{box-shadow:0 0 0 14px rgba(124,58,237,0)}100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}}',
    '#vlx-hd-panel{position:fixed;bottom:88px;right:20px;width:340px;max-height:500px;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,sans-serif}',
    '#vlx-hd-panel.open{display:flex}',
    '#vlx-hd-head{background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;padding:14px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}',
    '#vlx-hd-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer}',
    '#vlx-hd-body{padding:14px;overflow-y:auto;flex:1}',
    '.vlx-hd-search{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box}',
    '.vlx-hd-search:focus{border-color:#7c3aed}',
    '.vlx-hd-section{margin-top:12px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase}',
    '.vlx-hd-list{list-style:none;padding:0;margin:6px 0}',
    '.vlx-hd-list li{padding:8px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:#1f2937}',
    '.vlx-hd-list li:hover{background:#f3f4f6}',
    '.vlx-hd-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}',
    '.vlx-hd-btn{padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;color:#374151;transition:all .15s}',
    '.vlx-hd-btn:hover{background:#f9fafb;border-color:#7c3aed}',
    '.vlx-hd-btn.primary{background:#7c3aed;color:#fff;border-color:#7c3aed}',
    '.vlx-hd-textarea{width:100%;min-height:90px;padding:8px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;box-sizing:border-box;resize:vertical}',
    '.vlx-hd-row{display:flex;gap:8px;margin-top:10px}',
    '.vlx-hd-toast{position:fixed;bottom:90px;right:20px;background:#10b981;color:#fff;padding:10px 14px;border-radius:8px;z-index:99999;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.15)}',
    '.vlx-hd-empty{color:#9ca3af;font-size:13px;text-align:center;padding:14px}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('vlx-hd-styles')) return;
    var s = document.createElement('style');
    s.id = 'vlx-hd-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ===== UI BUILDER =====
  function buildButton() {
    if (document.getElementById('vlx-hd-btn')) return;
    var b = document.createElement('button');
    b.id = 'vlx-hd-btn';
    b.setAttribute('aria-label', t('help_btn'));
    b.title = t('help_btn');
    b.innerHTML = '?';
    b.addEventListener('click', togglePanel);
    document.body.appendChild(b);
  }

  function buildPanel() {
    if (document.getElementById('vlx-hd-panel')) return;
    var p = document.createElement('div');
    p.id = 'vlx-hd-panel';
    p.innerHTML = ''
      + '<div id="vlx-hd-head">'
      + '  <span>' + t('title') + '</span>'
      + '  <button id="vlx-hd-close" aria-label="Close">x</button>'
      + '</div>'
      + '<div id="vlx-hd-body"></div>';
    document.body.appendChild(p);
    document.getElementById('vlx-hd-close').addEventListener('click', togglePanel);
    renderHome();
  }

  function togglePanel() {
    state.open = !state.open;
    var p = document.getElementById('vlx-hd-panel');
    if (!p) return;
    if (state.open) {
      p.classList.add('open');
      state.panelMode = 'home';
      renderHome();
    } else {
      p.classList.remove('open');
    }
  }

  // ===== RENDERS =====
  function renderHome() {
    var body = document.getElementById('vlx-hd-body');
    if (!body) return;
    var titleKey = state.lang === 'en' ? 'title_en' : 'title_es';
    var listHtml = TOP_ARTICLES_FALLBACK.slice(0, 5).map(function (a) {
      return '<li data-slug="' + a.slug + '">' + a[titleKey] + '</li>';
    }).join('');
    body.innerHTML = ''
      + '<input type="text" class="vlx-hd-search" id="vlx-hd-q" placeholder="' + t('placeholder') + '"/>'
      + '<div class="vlx-hd-section">' + t('top_articles') + '</div>'
      + '<ul class="vlx-hd-list" id="vlx-hd-articles">' + listHtml + '</ul>'
      + '<div class="vlx-hd-actions">'
      + '  <button class="vlx-hd-btn primary" id="vlx-hd-talk">' + t('talk_support') + '</button>'
      + '  <button class="vlx-hd-btn" id="vlx-hd-bug">' + t('report_bug') + '</button>'
      + '</div>';
    var q = document.getElementById('vlx-hd-q');
    q.addEventListener('input', debounce(onSearch, 300));
    document.getElementById('vlx-hd-articles').addEventListener('click', function (e) {
      var slug = e.target && e.target.getAttribute('data-slug');
      if (slug) openArticle(slug);
    });
    document.getElementById('vlx-hd-talk').addEventListener('click', openSupport);
    document.getElementById('vlx-hd-bug').addEventListener('click', function () { renderForm('bug'); });
  }

  function renderForm(type) {
    state.panelMode = type;
    var body = document.getElementById('vlx-hd-body');
    if (!body) return;
    var label = type === 'bug' ? t('desc_bug') : t('desc_idea');
    body.innerHTML = ''
      + '<div style="margin-bottom:8px;font-size:13px;color:#374151">' + label + '</div>'
      + '<textarea class="vlx-hd-textarea" id="vlx-hd-msg" required></textarea>'
      + '<label style="display:block;margin-top:8px;font-size:12px;color:#6b7280">'
      + '  <input type="checkbox" id="vlx-hd-shot"/> ' + t('take_screenshot')
      + '</label>'
      + '<div class="vlx-hd-row">'
      + '  <button class="vlx-hd-btn" id="vlx-hd-cancel">' + t('cancel') + '</button>'
      + '  <button class="vlx-hd-btn primary" id="vlx-hd-submit">' + t('submit') + '</button>'
      + '</div>';
    document.getElementById('vlx-hd-cancel').addEventListener('click', renderHome);
    document.getElementById('vlx-hd-submit').addEventListener('click', function () { submitFeedback(type); });
  }

  function renderResults(items, q) {
    var body = document.getElementById('vlx-hd-body');
    if (!body) return;
    state.panelMode = 'results';
    var listHtml = '';
    if (!items || items.length === 0) {
      listHtml = '<div class="vlx-hd-empty">' + t('no_results') + '</div>';
    } else {
      var titleKey = state.lang === 'en' ? 'title_en' : 'title_es';
      listHtml = '<ul class="vlx-hd-list">' + items.map(function (a) {
        return '<li data-slug="' + a.slug + '">' + (a[titleKey] || a.title || a.slug) + '</li>';
      }).join('') + '</ul>';
    }
    body.innerHTML = ''
      + '<input type="text" class="vlx-hd-search" id="vlx-hd-q" value="' + escapeHtml(q) + '"/>'
      + '<div class="vlx-hd-section">' + items.length + ' resultados</div>'
      + listHtml;
    document.getElementById('vlx-hd-q').addEventListener('input', debounce(onSearch, 300));
    body.querySelectorAll('[data-slug]').forEach(function (el) {
      el.addEventListener('click', function () { openArticle(el.getAttribute('data-slug')); });
    });
  }

  // ===== ACTIONS =====
  function onSearch(e) {
    var q = (e.target.value || '').trim();
    state.lastQuery = q;
    if (q.length < 2) { renderHome(); return; }
    fetchJson(state.apiBase + '/kb/search?q=' + encodeURIComponent(q))
      .then(function (res) {
        renderResults((res && res.items) || filterFallback(q), q);
      })
      .catch(function () { renderResults(filterFallback(q), q); });
  }

  function filterFallback(q) {
    var lower = q.toLowerCase();
    return TOP_ARTICLES_FALLBACK.filter(function (a) {
      return a.title_es.toLowerCase().indexOf(lower) >= 0 || a.title_en.toLowerCase().indexOf(lower) >= 0;
    });
  }

  function openArticle(slug) {
    fetchJson(state.apiBase + '/kb/article/' + encodeURIComponent(slug))
      .then(function (res) {
        var body = document.getElementById('vlx-hd-body');
        if (!body) return;
        var content = (res && res.html) || '<p>Articulo no disponible offline.</p>';
        body.innerHTML = ''
          + '<button class="vlx-hd-btn" id="vlx-hd-back">&larr; ' + t('cancel') + '</button>'
          + '<div style="margin-top:10px;font-size:13px;line-height:1.5">' + content + '</div>';
        document.getElementById('vlx-hd-back').addEventListener('click', renderHome);
      })
      .catch(function () {
        toast(t('offline'));
      });
  }

  function openSupport() {
    if (state.crispWebsiteId && global.$crisp) {
      try { global.$crisp.push(['do', 'chat:open']); return; } catch (e) {}
    }
    if (state.crispWebsiteId) {
      loadCrisp(state.crispWebsiteId);
      setTimeout(function () { try { global.$crisp.push(['do', 'chat:open']); } catch (e) {} }, 1500);
      return;
    }
    if (state.plainAppId && global.Plain) {
      try { global.Plain.open(); return; } catch (e) {}
    }
    // Fallback: form de contacto manual
    renderForm('idea');
  }

  function submitFeedback(type) {
    var msg = (document.getElementById('vlx-hd-msg') || {}).value || '';
    if (!msg.trim()) return;
    var btn = document.getElementById('vlx-hd-submit');
    if (btn) { btn.disabled = true; btn.textContent = t('sending'); }
    var withShot = (document.getElementById('vlx-hd-shot') || {}).checked;
    var screenshot_b64 = null;
    var promise = withShot ? captureScreenshot() : Promise.resolve(null);
    promise.then(function (shot) {
      screenshot_b64 = shot;
      var payload = {
        type: type,
        message: msg.trim(),
        page_url: location.href,
        user_agent: navigator.userAgent,
        screenshot_b64: screenshot_b64,
        user_role: state.userRole,
        lang: state.lang
      };
      return fetchJson(state.apiBase + '/feedback', { method: 'POST', body: payload });
    })
    .then(function () {
      toast(t('thanks'));
      togglePanel();
    })
    .catch(function () {
      // Fallback: guardar localmente para reintentar
      try {
        var queued = JSON.parse(localStorage.getItem('vlx_feedback_queue') || '[]');
        queued.push({ type: type, message: msg, page_url: location.href, ts: Date.now() });
        localStorage.setItem('vlx_feedback_queue', JSON.stringify(queued));
      } catch (e) {}
      toast(t('thanks'));
      togglePanel();
    });
  }

  function captureScreenshot() {
    // html2canvas no esta disponible por defecto; devolvemos null si no carga
    if (typeof global.html2canvas !== 'function') return Promise.resolve(null);
    return global.html2canvas(document.body, { logging: false, scale: 0.5 })
      .then(function (canvas) { return canvas.toDataURL('image/png'); })
      .catch(function () { return null; });
  }

  function loadCrisp(websiteId) {
    if (global.$crisp) return;
    global.$crisp = [];
    global.CRISP_WEBSITE_ID = websiteId;
    var d = document, s = d.createElement('script');
    s.src = 'https://client.crisp.chat/l.js'; s.async = 1;
    d.getElementsByTagName('head')[0].appendChild(s);
  }

  // ===== HELPERS =====
  function fetchJson(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include' };
    if (opts.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'vlx-hd-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }

  function isAdminPage() {
    var p = (location.pathname || '').toLowerCase();
    // Solo paneles owner/cashier - NO en landings publicas
    return /owner|cashier|admin|dashboard|pos|panel/.test(p)
      || /owner|cashier|admin|dashboard|pos/.test(document.title.toLowerCase());
  }

  // ===== PUBLIC API =====
  var Helpdesk = {
    init: function (opts) {
      opts = opts || {};
      state.lang = opts.lang || (navigator.language || 'es').slice(0, 2) === 'en' ? 'en' : 'es';
      state.crispWebsiteId = opts.crispWebsiteId || null;
      state.plainAppId = opts.plainAppId || null;
      state.apiBase = opts.apiBase || '/api';
      state.userRole = opts.userRole || null;
      var force = opts.forceShow === true;
      if (!force && !isAdminPage()) return; // Solo paneles owner/cashier
      injectStyles();
      buildButton();
      buildPanel();
      // Auto-load Crisp si hay websiteId
      if (state.crispWebsiteId && opts.preloadCrisp) loadCrisp(state.crispWebsiteId);
    },
    open: function () { if (!state.open) togglePanel(); },
    close: function () { if (state.open) togglePanel(); },
    setLang: function (l) { state.lang = (l === 'en') ? 'en' : 'es'; if (state.open) renderHome(); }
  };

  global.VolvixHelpdesk = Helpdesk;

  // Auto-init si el body tiene data-helpdesk-auto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
  function autoInit() {
    var b = document.body;
    if (b && b.hasAttribute('data-helpdesk-auto')) {
      Helpdesk.init({
        lang: b.getAttribute('data-helpdesk-lang') || 'es',
        crispWebsiteId: b.getAttribute('data-helpdesk-crisp') || null,
        userRole: b.getAttribute('data-helpdesk-role') || null
      });
    }
  }
})(typeof window !== 'undefined' ? window : this);
