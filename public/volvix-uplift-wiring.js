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

  // ---- Helper compartido: ¿estamos en una página pública? -----------------
  // Definido aquí (uplift se inyecta en TODAS las HTML) además de en
  // auth-gate.js para garantizar disponibilidad antes que cualquier wrapper
  // de fetch consulte 401. Idempotente: solo asigna si no existe.
  if (typeof window.__vlxIsPublicPage !== 'function') {
    var __VLX_PUB_EXACT = [
      '/', '/index.html', '/login.html', '/registro.html', '/marketplace.html',
      '/blog.html', '/landing_dynamic.html', '/cookies-policy.html',
      '/aviso-privacidad.html', '/terminos-condiciones.html', '/autofactura.html',
      '/404.html', '/INDICE-TUTORIALES.html', '/TUTORIAL-REGISTRO-USUARIOS.html',
      '/docs.html', '/api-docs.html', '/status-page.html',
      '/volvix-grand-tour.html', '/volvix-hub-landing.html',
      '/volvix-customer-portal.html', '/volvix-customer-portal-v2.html',
      '/salvadorex_web_v25.html'
    ];
    var __VLX_PUB_PATTERNS = [
      /^\/landing-[a-z0-9_-]+\.html$/i,
      /^\/landing_[a-z0-9_-]+\.html$/i,
      /^\/ai\.html$/i
    ];
    window.__vlxIsPublicPage = function (pathname) {
      pathname = pathname || (window.location && window.location.pathname) || '/';
      for (var i = 0; i < __VLX_PUB_EXACT.length; i++) {
        if (pathname === __VLX_PUB_EXACT[i] || pathname.endsWith(__VLX_PUB_EXACT[i])) return true;
      }
      for (var j = 0; j < __VLX_PUB_PATTERNS.length; j++) {
        if (__VLX_PUB_PATTERNS[j].test(pathname)) return true;
      }
      return false;
    };
  }

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

    // === LOAD MODULE FLAGS WIRING — solo si no está ya cargado y la página
    // tiene elementos data-module o data-button (heurística: páginas
    // funcionales del POS, no las landings públicas).
    try { ensureModuleFlagsWiring(); } catch (_) {}

    // === FORCE LIGHT MODE — el usuario reportó texto invisible (negro sobre
    // negro) cuando su OS está en dark mode. Las landings de giro tenían
    // @media (prefers-color-scheme: dark) que invertía colores según el OS.
    // Forzamos light siempre para evitar el problema. Una toggle dark se
    // puede agregar después sin volver a depender de prefers-color-scheme.
    try { forceLightModeAlways(); } catch (_) {}

    // === VISUAL REFRESH 2026-05 — solo CSS variables, tipografía, sombras,
    // radios y micro-interacciones. NO toca layout ni estructura.
    try { injectVisualRefresh(); } catch (_) {}

    // === KILL FLOATERS — ocultar globalmente todo widget flotante de usuario.
    // Se mantienen visibles solo si:
    //   - URL contiene ?debug=1
    //   - JWT del usuario es superadmin / role=platform_owner / email @systeminternational.app
    // Esto deja la UI limpia para el cliente final pero permite a los admins ver
    // notificaciones, sync, IA, salud del sistema, etc.
    try {
      injectNoFloatersGuard();
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Module Flags Wiring loader
  // ---------------------------------------------------------------------------
  function ensureModuleFlagsWiring() {
    if (window.__vlxModuleFlagsLoaded) return;
    // Solo en páginas con auth (POS, launcher, owner panel, etc.)
    var path = (location.pathname || '').toLowerCase();
    var isPublic = /^\/(login|registro|index|404|cookies|aviso|terminos|gdpr|landing-|marketplace|blog|autofactura)/.test(path)
                || path === '/' || path === '';
    if (isPublic) return;
    // Cargar el script
    var s = document.createElement('script');
    s.src = '/volvix-module-flags-wiring.js';
    s.defer = true;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // Force Light Mode
  // ---------------------------------------------------------------------------
  function forceLightModeAlways() {
    if (document.getElementById('vlx-force-light-css')) return;
    // 1. Decirle al navegador que solo soportamos light scheme. Esto neutraliza
    //    @media (prefers-color-scheme: dark) en TODAS las páginas + form
    //    controls, scrollbars y user-agent stylesheet.
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'color-scheme');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'light only');
    // 2. Atributo data-theme=light para apps que lo respetan (como
    //    volvix-launcher.html que usa `[data-theme="light"]`)
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.colorScheme = 'light';
    // 3. CSS override que GANA contra cualquier @media dark — usamos
    //    @media all para forzar los mismos colores que el media query base
    //    independiente del prefers-color-scheme del OS.
    var st = document.createElement('style');
    st.id = 'vlx-force-light-css';
    st.textContent = [
      ':root { color-scheme: light !important; }',
      '/* Anular @media (prefers-color-scheme: dark) que invertía colores */',
      '@media (prefers-color-scheme: dark) {',
      '  :root, html, body {',
      '    background-color: #FFFFFF !important;',
      '    color: #0B0B0F !important;',
      '  }',
      '  body * { background-color: revert; color: revert; }',
      // Restaurar elementos comunes que las landings invertían
      '  body { color: #0B0B0F !important; }',
      '  h1, h2, h3, h4, h5, h6, p, span, li, a, label { color: inherit; }',
      '  input, textarea, select { background: #FFFFFF !important; color: #0B0B0F !important; border-color: #E5E5EA !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------------------
  // Visual Refresh 2026-05 — diseño moderno, limpio, profesional.
  // SOLO modifica: variables de color, tipografía, sombras, radios, transiciones,
  // y micro-interacciones (hover/focus). NO toca layout ni estructura.
  // ---------------------------------------------------------------------------
  function injectVisualRefresh() {
    if (document.getElementById('vlx-visual-refresh-css')) return;
    var st = document.createElement('style');
    st.id = 'vlx-visual-refresh-css';
    st.textContent = [
      // ---- Design Tokens (CSS variables globales con fallback gentle) ----
      ':root {',
      '  --vlx-c-bg:        #FAFAFB;',
      '  --vlx-c-surface:   #FFFFFF;',
      '  --vlx-c-surface-2: #F4F4F7;',
      '  --vlx-c-border:    #E6E7EB;',
      '  --vlx-c-border-2:  #EFEFF3;',
      '  --vlx-c-text:      #0B0B0F;',
      '  --vlx-c-text-2:    #475569;',
      '  --vlx-c-text-mute: #94A3B8;',
      '  --vlx-c-primary:   #2563EB;',
      '  --vlx-c-primary-h: #1D4ED8;',
      '  --vlx-c-primary-50:#EFF6FF;',
      '  --vlx-c-success:   #10B981;',
      '  --vlx-c-warn:      #F59E0B;',
      '  --vlx-c-danger:    #EF4444;',
      '  --vlx-r-sm: 8px;',
      '  --vlx-r-md: 12px;',
      '  --vlx-r-lg: 16px;',
      '  --vlx-r-xl: 22px;',
      '  --vlx-r-pill: 999px;',
      '  --vlx-s-1: 0 1px 2px rgba(15,23,42,.04), 0 1px 1px rgba(15,23,42,.03);',
      '  --vlx-s-2: 0 4px 12px rgba(15,23,42,.06), 0 2px 4px rgba(15,23,42,.04);',
      '  --vlx-s-3: 0 14px 32px rgba(15,23,42,.08), 0 6px 12px rgba(15,23,42,.05);',
      '  --vlx-s-glow: 0 0 0 4px rgba(37,99,235,.14);',
      '  --vlx-t-fast:  140ms cubic-bezier(.2,.7,.3,1);',
      '  --vlx-t-mid:   220ms cubic-bezier(.2,.7,.3,1);',
      '}',

      // ---- Tipografía global modernizada (system stack premium + Inter optional) ----
      'html, body {',
      '  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif !important;',
      '  -webkit-font-smoothing: antialiased;',
      '  -moz-osx-font-smoothing: grayscale;',
      '  text-rendering: optimizeLegibility;',
      '  font-feature-settings: "ss01","cv11","cv05";',
      '  letter-spacing: -0.005em;',
      '}',
      'h1, h2, h3, h4, h5, h6 { letter-spacing: -0.02em; font-weight: 700; }',
      'h1 { font-weight: 800; }',
      'p, li, label { line-height: 1.55; }',

      // ---- Botones — bordes y sombras suaves, hover sutil, transición ----
      'button, .btn, [role="button"], input[type="submit"], input[type="button"] {',
      '  transition: transform var(--vlx-t-fast), box-shadow var(--vlx-t-fast), background-color var(--vlx-t-fast), border-color var(--vlx-t-fast), color var(--vlx-t-fast) !important;',
      '  border-radius: var(--vlx-r-md);',
      '}',
      'button:hover:not(:disabled), .btn:hover:not(:disabled), [role="button"]:hover:not([aria-disabled="true"]) {',
      '  transform: translateY(-1px);',
      '  box-shadow: var(--vlx-s-2);',
      '}',
      'button:active:not(:disabled), .btn:active:not(:disabled) {',
      '  transform: translateY(0);',
      '  box-shadow: var(--vlx-s-1);',
      '}',
      'button:focus-visible, .btn:focus-visible, [role="button"]:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {',
      '  outline: none !important;',
      '  box-shadow: var(--vlx-s-glow) !important;',
      '}',

      // ---- Botón primario — gradiente sutil + sombra azul al hover ----
      '.btn-primary, .primary, button.primary, [data-variant="primary"], .button-primary {',
      '  background-image: linear-gradient(180deg, #2C6BF0 0%, #1F58D6 100%) !important;',
      '  border: 1px solid rgba(15,23,42,.08) !important;',
      '  color: #FFFFFF !important;',
      '  font-weight: 600 !important;',
      '  letter-spacing: -0.01em;',
      '  box-shadow: 0 1px 0 rgba(255,255,255,.18) inset, 0 1px 2px rgba(15,23,42,.10);',
      '}',
      '.btn-primary:hover:not(:disabled), .primary:hover:not(:disabled), button.primary:hover:not(:disabled), [data-variant="primary"]:hover:not(:disabled), .button-primary:hover:not(:disabled) {',
      '  background-image: linear-gradient(180deg, #2160E5 0%, #174FCC 100%) !important;',
      '  box-shadow: 0 8px 24px rgba(37,99,235,.28), 0 1px 0 rgba(255,255,255,.18) inset !important;',
      '}',

      // ---- Inputs — borde más limpio, focus ring premium, transición suave ----
      'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea {',
      '  border-radius: var(--vlx-r-md);',
      '  transition: border-color var(--vlx-t-fast), box-shadow var(--vlx-t-fast), background-color var(--vlx-t-fast);',
      '}',
      'input:hover:not(:disabled):not(:focus), select:hover:not(:disabled):not(:focus), textarea:hover:not(:disabled):not(:focus) {',
      '  border-color: #C8CBD3;',
      '}',

      // ---- Cards / contenedores — sombras suaves, radio mayor ----
      '.card, .panel, .box, .modal-content, .dialog, [role="dialog"] > div, .surface {',
      '  border-radius: var(--vlx-r-lg);',
      '  box-shadow: var(--vlx-s-2);',
      '  transition: box-shadow var(--vlx-t-mid), transform var(--vlx-t-mid);',
      '}',

      // ---- Links — underline gradient, transición de color ----
      'a { transition: color var(--vlx-t-fast), text-decoration-color var(--vlx-t-fast); }',
      'a:hover { text-decoration-thickness: 2px; }',

      // ---- Tablas — separadores más sutiles, hover de fila ----
      'table { border-collapse: separate; border-spacing: 0; }',
      'table th { font-weight: 600; letter-spacing: -0.005em; }',
      'table tbody tr { transition: background-color var(--vlx-t-fast); }',
      'table tbody tr:hover { background-color: rgba(37,99,235,.035); }',

      // ---- Badges / chips / pills — tipografía y radio ----
      '.badge, .chip, .tag, .pill { border-radius: var(--vlx-r-pill); font-weight: 600; letter-spacing: 0.01em; }',

      // ---- Scrollbars limpios ----
      '* { scrollbar-width: thin; scrollbar-color: #CBD0D9 transparent; }',
      '*::-webkit-scrollbar { width: 10px; height: 10px; }',
      '*::-webkit-scrollbar-track { background: transparent; }',
      '*::-webkit-scrollbar-thumb { background: #D5D8DF; border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }',
      '*::-webkit-scrollbar-thumb:hover { background: #B8BCC5; border: 2px solid transparent; background-clip: padding-box; }',

      // ---- Selección de texto ----
      '::selection { background: rgba(37,99,235,.18); color: inherit; }',

      // ---- Imágenes/logos: render más limpio ----
      'img { image-rendering: -webkit-optimize-contrast; }',

      // ---- Reduced motion respetado ----
      '@media (prefers-reduced-motion: reduce) {',
      '  *, *::before, *::after { transition: none !important; animation: none !important; }',
      '  button:hover, .btn:hover { transform: none !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(st);

    // Pre-conectar a Google Fonts una sola vez para que Inter cargue rápido si
    // alguna landing lo trae (es opcional; el system stack ya cubre).
    try {
      var pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = 'https://fonts.googleapis.com';
      pre.crossOrigin = 'anonymous';
      document.head.appendChild(pre);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // No-Floaters Guard
  // ---------------------------------------------------------------------------
  function _isAdminViewer() {
    try {
      var qs = new URLSearchParams(location.search || '');
      if (qs.get('debug') === '1') return true;
      var tok = localStorage.getItem('volvix_token') || localStorage.getItem('jwt') || localStorage.getItem('token') || '';
      if (!tok) return false;
      var parts = String(tok).split('.');
      if (parts.length < 2) return false;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      var p = JSON.parse(decodeURIComponent(escape(atob(b64 + pad))));
      var role = String(p.role || p.rol || '').toLowerCase();
      var email = String(p.email || '').toLowerCase();
      return role === 'superadmin' || role === 'platform_owner'
        || email.endsWith('@systeminternational.app');
    } catch (_) { return false; }
  }
  function injectNoFloatersGuard() {
    if (_isAdminViewer()) return; // admins ven TODO (incluye flotantes y diagnóstico)
    if (document.getElementById('vlx-no-floaters-css')) return;
    var st = document.createElement('style');
    st.id = 'vlx-no-floaters-css';
    // POLÍTICA 2026-05: usuario regular SOLO ve el botón de ayuda (?).
    // Todos los demás flotantes (bandera, sync, refresh, list, search,
    // settings/wrench, AI, theme, robot, etc.) se ocultan. Admin (token con
    // role superadmin/platform_owner o email @systeminternational.app, o
    // ?debug=1) vuelve a verlos automáticamente.
    st.textContent = [
      // ---- OCULTAR todos los flotantes conocidos del sistema ----
      '#vlx-health-pill, #vlx-health-modal { display: none !important; }',
      '.vx-banner-container { display: none !important; }',
      '#vlx-mx-flag, .vlx-mx-flag-floating { display: none !important; }',
      '#vlx-robot-avatar, .vlx-robot-fab { display: none !important; }',
      '#vlx-theme-toggle, #vlx-theme-fab { display: none !important; }',
      '#vlx-online-pill, .vlx-online-pill { display: none !important; }',
      '#vlx-bell, #vlx-notif-drawer { display: none !important; }',
      '.vlx-widget, .vlx-sync-widget, .vlx-sync-fab { display: none !important; }',
      '#vlx-ai-fab, #vlx-ai-avatar, #vlx-ai-bubble, .vlx-ai-fab { display: none !important; }',
      '#vlx-search-fab, .vlx-search-fab { display: none !important; }',
      '#vlx-settings-fab, .vlx-settings-fab, #vlx-wrench-fab, .vlx-wrench-fab { display: none !important; }',
      '#vlx-save-fab, .vlx-save-fab, #vlx-refresh-fab, .vlx-refresh-fab { display: none !important; }',
      '#vlx-list-fab, .vlx-list-fab, #vlx-menu-fab, .vlx-menu-fab { display: none !important; }',
      '#vlx-print-fab, .vlx-print-fab { display: none !important; }',
      '#vlx-i18n-fab, .vlx-i18n-fab, #vlx-lang-fab, .vlx-lang-fab { display: none !important; }',
      '#vlx-pwa-prompt, .vlx-pwa-prompt-fab { display: none !important; }',
      '#vlx-fab-cluster, .vlx-fab-cluster, .vlx-fab-group { display: none !important; }',
      '[data-vlx-floater]:not([data-vlx-floater="help"]) { display: none !important; }',
      // Genéricos: cualquier "fab" que no sea help
      '.fab:not(.vlx-help-fab):not([data-vlx-floater="help"]):not([aria-label*="ayuda" i]):not([aria-label*="help" i]) { display: none !important; }',

      // ---- WHITELIST: el ÚNICO botón flotante visible es el de ayuda ----
      '#vlx-help-fab, .vlx-help-fab, [data-vlx-floater="help"], [aria-label="Ayuda"], [aria-label="Help"] {',
      '  display: inline-flex !important;',
      '  position: fixed !important;',
      '  bottom: 18px !important;',
      '  right: 18px !important;',
      '  width: 44px !important;',
      '  height: 44px !important;',
      '  border-radius: 50% !important;',
      '  background: #FFFFFF !important;',
      '  color: #2563EB !important;',
      '  border: 1px solid #E6E7EB !important;',
      '  box-shadow: 0 6px 18px rgba(15,23,42,0.10), 0 2px 4px rgba(15,23,42,0.06) !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  font-size: 18px !important;',
      '  font-weight: 700 !important;',
      '  cursor: pointer !important;',
      '  z-index: 9998 !important;',
      '  transition: transform 140ms ease, box-shadow 140ms ease !important;',
      '}',
      '#vlx-help-fab:hover, .vlx-help-fab:hover, [data-vlx-floater="help"]:hover {',
      '  transform: translateY(-2px) !important;',
      '  box-shadow: 0 12px 28px rgba(37,99,235,0.18), 0 4px 8px rgba(15,23,42,0.08) !important;',
      '}'
    ].join('\n');
    document.head.appendChild(st);

    // MutationObserver: barrido continuo. Cualquier elemento posicionado fixed
    // anclado a esquinas inferiores que NO sea el de ayuda → display:none.
    function _isHelp(n) {
      if (!n || n.nodeType !== 1) return false;
      try {
        if (n.id === 'vlx-help-fab') return true;
        if (n.classList && n.classList.contains('vlx-help-fab')) return true;
        var df = n.getAttribute && n.getAttribute('data-vlx-floater');
        if (df === 'help') return true;
        var al = (n.getAttribute && (n.getAttribute('aria-label') || '')).toLowerCase();
        if (al.indexOf('ayuda') >= 0 || al.indexOf('help') >= 0) return true;
      } catch (_) {}
      return false;
    }
    function _isCornerFloater(n) {
      try {
        var cs = window.getComputedStyle(n);
        if (cs.position !== 'fixed') return false;
        var r = n.getBoundingClientRect();
        var vh = window.innerHeight, vw = window.innerWidth;
        // Esquinas inferiores: dentro de 120px del bottom y 200px de cualquier lado
        var nearBottom = (vh - r.bottom) < 140;
        var nearSides = r.left < 220 || (vw - r.right) < 220;
        return nearBottom && nearSides && r.width < 220 && r.height < 220;
      } catch (_) { return false; }
    }
    function _sweep(root) {
      try {
        var nodes = (root || document).querySelectorAll('body *');
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i];
          if (_isHelp(n)) continue;
          if (_isCornerFloater(n)) {
            n.style.setProperty('display', 'none', 'important');
          }
        }
      } catch (_) {}
    }
    // Sweep inicial al cargar y barrido secundario tras 1.5s para librerías lazy
    try { _sweep(); } catch (_) {}
    setTimeout(function () { try { _sweep(); } catch (_) {} }, 1500);
    setTimeout(function () { try { _sweep(); } catch (_) {} }, 4000);

    try {
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          (m.addedNodes || []).forEach(function (n) {
            if (!n || n.nodeType !== 1) return;
            if (_isHelp(n)) return;
            // Hide explicit known IDs
            if (typeof n.id === 'string' && n.id.indexOf('vlx-') === 0 && !_isHelp(n)) {
              n.style.setProperty('display', 'none', 'important');
              return;
            }
            // Hide if it's a corner floater
            try {
              setTimeout(function () { if (_isCornerFloater(n) && !_isHelp(n)) n.style.setProperty('display', 'none', 'important'); }, 50);
            } catch (_) {}
          });
        });
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
