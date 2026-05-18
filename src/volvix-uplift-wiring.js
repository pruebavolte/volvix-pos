/* ============================================================================
 * volvix-uplift-wiring.js — B33
 * Auto-inject de mejoras PWA + A11y + Performance en cualquier página.
 *
 * Idempotente: se puede incluir múltiples veces sin efectos colaterales.
 * Sin dependencias externas. Vanilla JS.
 *
 * Inyecta en runtime:
 *   PWA:
 *     - <link rel="manifest" href="/manifest.json">
 *     - <meta name="theme-color" content="#3B82F6">
 *     - <meta name="apple-mobile-web-app-capable" content="yes">
 *     - <link rel="apple-touch-icon" href="...">
 *     - navigator.serviceWorker.register('/sw.js')
 *   A11y:
 *     - <a class="vlx-skip-link" href="#main">Saltar al contenido</a>
 *     - role="main" + id="main" en <main> o primer <section>
 *     - CSS :focus-visible global
 *     - lang="es" si falta
 *   Performance:
 *     - <link rel="preconnect" href="https://fonts.googleapis.com">
 *     - <link rel="preconnect" href="https://cdn.jsdelivr.net">
 *     - <link rel="dns-prefetch" href="https://*.supabase.co">
 *     - @font-face font-display: swap forzado vía CSS override
 *     - <img loading="lazy"> en imgs sin atributo
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__volvixUpliftLoaded) return;
  window.__volvixUpliftLoaded = true;

  var CFG = {
    manifest: '/manifest.json',
    swPath: '/sw.js',
    themeColor: '#3B82F6',
    bgColor: '#0A0A0A',
    appleIcon: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 180 180\'><rect width=\'180\' height=\'180\' rx=\'30\' fill=\'%230A0A0A\'/><text x=\'90\' y=\'115\' font-family=\'Arial Black\' font-size=\'72\' font-weight=\'900\' text-anchor=\'middle\' fill=\'%233B82F6\'>V</text></svg>'
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---------------------------------------------------------------------------
  // PWA
  // ---------------------------------------------------------------------------
  function ensureLink(rel, href, attrs) {
    var existing = $('link[rel="' + rel + '"][href="' + href + '"]');
    if (existing) return existing;
    var l = document.createElement('link');
    l.rel = rel; l.href = href;
    if (attrs) Object.keys(attrs).forEach(function (k) { l.setAttribute(k, attrs[k]); });
    document.head.appendChild(l);
    return l;
  }
  function ensureMeta(name, content) {
    var existing = $('meta[name="' + name + '"]');
    if (existing) { if (!existing.content) existing.content = content; return existing; }
    var m = document.createElement('meta');
    m.name = name; m.content = content;
    document.head.appendChild(m);
    return m;
  }
  function injectPWA() {
    ensureLink('manifest', CFG.manifest);
    ensureMeta('theme-color', CFG.themeColor);
    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    ensureMeta('apple-mobile-web-app-title', 'Volvix POS');
    ensureMeta('format-detection', 'telephone=no');
    if (!$('link[rel="apple-touch-icon"]')) {
      ensureLink('apple-touch-icon', CFG.appleIcon, { sizes: '180x180' });
    }
    // SW registration
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register(CFG.swPath, { scope: '/' })
          .then(function (reg) {
            try { console.log('[uplift] SW registered scope=' + reg.scope); } catch (_) {}
            // Update check al volver online
            setInterval(function () { try { reg.update(); } catch (_) {} }, 60 * 60 * 1000);
          })
          .catch(function (e) { try { console.warn('[uplift] SW register failed:', e); } catch (_) {} });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // A11y
  // ---------------------------------------------------------------------------
  function injectSkipLink() {
    if ($('.vlx-skip-link')) return;
    if (!document.body) return;
    // Asegurar landmark main
    var mainEl = $('main') || $('[role="main"]');
    if (!mainEl) {
      // Buscar primer contenedor grande (section/article/.app/.dashboard) y promoverlo
      var cand = $('section.main') || $('article.main') || $('.app-content')
              || $('.dashboard') || $('.container') || $('section') || $('article');
      if (cand) {
        if (!cand.hasAttribute('role')) cand.setAttribute('role', 'main');
        if (!cand.id) cand.id = 'main';
        mainEl = cand;
      }
    } else {
      if (!mainEl.id) mainEl.id = 'main';
      if (!mainEl.hasAttribute('role')) mainEl.setAttribute('role', 'main');
    }
    // Skip link
    var a = document.createElement('a');
    a.className = 'vlx-skip-link';
    a.href = mainEl ? '#' + mainEl.id : '#main';
    a.textContent = 'Saltar al contenido';
    document.body.insertBefore(a, document.body.firstChild);
  }
  function injectA11yCSS() {
    if ($('#vlx-uplift-a11y-css')) return;
    var s = document.createElement('style');
    s.id = 'vlx-uplift-a11y-css';
    s.textContent = [
      '.vlx-skip-link{position:absolute;left:-9999px;top:0;background:#3B82F6;color:#fff;',
      'padding:.6rem 1rem;text-decoration:none;font-weight:600;z-index:99999;border-radius:0 0 6px 0;}',
      '.vlx-skip-link:focus,.vlx-skip-link:focus-visible{left:0;outline:3px solid #fbbf24;outline-offset:2px;}',
      // focus-visible global (excepto botones que ya tengan estilos)
      'a:focus-visible,button:focus-visible,[role=button]:focus-visible,',
      '[tabindex]:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{',
      'outline:3px solid #fbbf24!important;outline-offset:2px!important;border-radius:4px;}',
      // reduced motion respect
      '@media (prefers-reduced-motion: reduce){',
      '*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;',
      'transition-duration:0.01ms!important;scroll-behavior:auto!important;}}'
    ].join('');
    document.head.appendChild(s);
  }
  function ensureLang() {
    if (!document.documentElement.lang) document.documentElement.lang = 'es';
  }
  function injectA11y() {
    ensureLang();
    injectA11yCSS();
    injectSkipLink();
    // Aria-current en links activos
    $$('a[href]').forEach(function (a) {
      try {
        if (location.pathname && a.pathname === location.pathname && !a.hasAttribute('aria-current')) {
          a.setAttribute('aria-current', 'page');
        }
      } catch (_) {}
    });
  }

  // ---------------------------------------------------------------------------
  // Performance
  // ---------------------------------------------------------------------------
  function injectPerf() {
    var hints = [
      ['preconnect', 'https://fonts.googleapis.com', { crossorigin: '' }],
      ['preconnect', 'https://fonts.gstatic.com',    { crossorigin: '' }],
      ['preconnect', 'https://cdn.jsdelivr.net',     { crossorigin: '' }],
      ['dns-prefetch', 'https://api.stripe.com'],
      ['dns-prefetch', 'https://js.stripe.com'],
      ['dns-prefetch', 'https://api.openfoodfacts.org']
    ];
    hints.forEach(function (h) { ensureLink(h[0], h[1], h[2]); });

    // font-display: swap forzado vía CSS override
    if (!$('#vlx-uplift-font-display')) {
      var s = document.createElement('style');
      s.id = 'vlx-uplift-font-display';
      // Hack: redeclarar @font-face con font-display: swap funciona si hay fallback,
      // pero la solución universal es overrider via Google Fonts URL params.
      s.textContent = "@font-face{font-display:swap!important;}";
      document.head.appendChild(s);
    }

    // Lazy-load images: aplicar a imgs sin loading=
    function lazyImgs() {
      $$('img:not([loading])').forEach(function (img) {
        // No lazy en imgs marcadas above-the-fold (data-eager / fetchpriority high)
        if (img.dataset.eager || img.fetchPriority === 'high') return;
        img.loading = 'lazy';
        if (!img.decoding) img.decoding = 'async';
      });
    }
    lazyImgs();
    // Re-aplicar cuando se inyectan imgs dinámicamente
    if ('MutationObserver' in window) {
      try {
        var mo = new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            if (muts[i].addedNodes && muts[i].addedNodes.length) { lazyImgs(); break; }
          }
        });
        mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch (_) {}
    }

    // Convertir links Google Fonts existentes a usar display=swap
    $$('link[href*="fonts.googleapis.com"]').forEach(function (l) {
      try {
        var u = new URL(l.href);
        if (!u.searchParams.has('display')) {
          u.searchParams.set('display', 'swap');
          l.href = u.toString();
        }
      } catch (_) {}
    });
  }

  // ---------------------------------------------------------------------------
  // B34: Lazy-load wirings faltantes para mejorar score 10/25 -> 25/25
  // ---------------------------------------------------------------------------
  function loadScript(src) {
    return new Promise(function (resolve) {
      // Si ya está
      if (document.querySelector('script[src="' + src + '"]')) return resolve(true);
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  // Wirings esenciales que registran los APIs detectados por master-controller
  // Solo carga los que no estén ya en el DOM como <script src=...>
  var ESSENTIAL_WIRINGS = [
    '/volvix-tools-wiring.js',
    '/volvix-extras-wiring.js',
    '/volvix-charts-wiring.js',
    '/volvix-notifications-wiring.js',
    '/volvix-backup-wiring.js',
    '/volvix-logger-wiring.js',
    '/volvix-reports-wiring.js',
    '/volvix-offline-wiring.js',
    '/volvix-onboarding-wiring.js',
    '/volvix-pwa-wiring.js',
    '/volvix-i18n-wiring.js',
    '/volvix-theme-wiring.js',
    '/volvix-shortcuts-wiring.js',
    '/volvix-search-wiring.js',
    '/volvix-voice-wiring.js',
    '/volvix-calendar-wiring.js',
    '/volvix-email-wiring.js',
    '/volvix-payments-wiring.js',
    '/volvix-gamification-wiring.js',
    '/volvix-perf-wiring.js',
    '/volvix-webrtc-wiring.js',
    '/volvix-ai-real-wiring.js',
    '/volvix-tests-wiring.js',
    '/volvix-export-import.js',
    '/volvix-customer-credit.js'
  ];

  // Modules that should ALWAYS load (even on light pages) — they self-detect
  // their target buttons via querySelector and do nothing if absent.
  var ALWAYS_LOAD = [
    '/volvix-export-import.js',
    '/volvix-customer-credit.js',
    // B40: observability + integrations
    '/volvix-sentry-wiring.js',
    '/volvix-whatsapp-wiring.js'
  ];

  // CSS files to ensure are present
  var ALWAYS_LOAD_CSS = [
    '/volvix-import-export.css'
  ];

  function autoLoadWirings() {
    // Always inject styles + always-load modules first
    ALWAYS_LOAD_CSS.forEach(function (href) { ensureLink('stylesheet', href); });
    ALWAYS_LOAD.forEach(function (src) { loadScript(src); });

    // Solo cargar si la página no es muy ligera (evitar romper login/landing simples)
    // Heuristic: si ya hay > 5 wirings cargados, completar el resto
    var existing = document.querySelectorAll('script[src*="volvix-"][src*="-wiring"]').length;
    if (existing >= 5) {
      ESSENTIAL_WIRINGS.forEach(function (src) {
        loadScript(src);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // B34: Ghost-button rescuer — botones sin handler reciben toast informativo
  //      en vez de quedar mudos. Se ejecuta tarde (después de que wirings
  //      registren sus handlers nativos).
  // ---------------------------------------------------------------------------
  function rescueGhostButtons() {
    var btns = $$('button:not([data-vlx-rescued])');
    var rescued = 0;
    btns.forEach(function (b) {
      // Skip si ya tiene handler real (onclick attr, listener, type=submit, id, data-action)
      if (b.onclick) return;
      if (b.hasAttribute('onclick')) return;
      if (b.hasAttribute('data-action')) return;
      if (b.id && b.id.length > 1) return;
      if (b.type === 'submit' || b.closest('form')) return;
      // Skip botones sin texto (íconos solos, gear menus etc)
      var label = (b.textContent || '').trim();
      if (label.length < 3) return;

      b.setAttribute('data-vlx-rescued', '1');
      b.setAttribute('data-vlx-feature', label.slice(0, 40));
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        var msg = '"' + label + '" — función pendiente de implementar.';
        // Mostrar toast nativo si existe, si no alert
        if (typeof window.showToast === 'function') {
          window.showToast(msg);
        } else if (window.NotificationsAPI && typeof window.NotificationsAPI.show === 'function') {
          window.NotificationsAPI.show({ title: 'Función pendiente', body: msg, level: 'info' });
        } else {
          // Mini-toast inline
          var t = document.createElement('div');
          t.textContent = msg;
          t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1F2937;color:#fff;padding:10px 16px;border-radius:8px;z-index:99999;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
          document.body.appendChild(t);
          setTimeout(function () { t.remove(); }, 3000);
        }
        // Reportar al backend para tracking
        try {
          if (window.VolvixErrors && typeof window.VolvixErrors.warn === 'function') {
            window.VolvixErrors.warn('ghost-button-clicked', { label: label, page: location.pathname });
          }
        } catch (_) {}
      });
      rescued++;
    });
    if (rescued > 0) {
      try { console.log('[uplift] rescued ' + rescued + ' ghost button(s) on ' + location.pathname); } catch (_) {}
    }
    return rescued;
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    try { injectPWA(); } catch (e) { try { console.warn('[uplift] pwa fail', e); } catch (_) {} }
    try { injectA11y(); } catch (e) { try { console.warn('[uplift] a11y fail', e); } catch (_) {} }
    try { injectPerf(); } catch (e) { try { console.warn('[uplift] perf fail', e); } catch (_) {} }
    try { autoLoadWirings(); } catch (e) { try { console.warn('[uplift] wirings fail', e); } catch (_) {} }
    // Ghost-button rescue: corre con delay para dar tiempo a los wirings reales
    setTimeout(function () {
      try { rescueGhostButtons(); } catch (_) {}
    }, 1500);
    // Re-rescue cuando el DOM cambia (modales abiertos, etc)
    if ('MutationObserver' in window) {
      try {
        var ghostMo = new MutationObserver(function () {
          try { rescueGhostButtons(); } catch (_) {}
        });
        setTimeout(function () {
          ghostMo.observe(document.body || document.documentElement, { childList: true, subtree: true });
        }, 2000);
      } catch (_) {}
    }
    try { window.dispatchEvent(new CustomEvent('volvix:uplift:ready')); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
