/**
 * Volvix performance wiring
 * Lighthouse 90+ targets:
 *  - Lazy load images via IntersectionObserver
 *  - Defer scripts marcados con [data-defer]
 *  - Inline critical CSS para above-the-fold
 *  - Preload key resources
 *  - Resource hints (dns-prefetch, preconnect)
 *
 * Uso (en el <head> con defer):
 *   <script src="/volvix-perf-wiring.js" defer></script>
 *   <img data-src="hero.jpg" data-srcset="..." alt="...">
 *   <script data-defer src="/heavy.js"></script>
 */
(function () {
  'use strict';

  // ---- 1) Resource hints (dns-prefetch + preconnect) -------------------------
  var HINTS = [
    { rel: 'dns-prefetch', href: 'https://fonts.googleapis.com' },
    { rel: 'dns-prefetch', href: 'https://fonts.gstatic.com' },
    { rel: 'dns-prefetch', href: 'https://cdn.jsdelivr.net' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
  ];

  function injectHints() {
    var head = document.head;
    if (!head) return;
    HINTS.forEach(function (h) {
      var sel = 'link[rel="' + h.rel + '"][href="' + h.href + '"]';
      if (head.querySelector(sel)) return;
      var l = document.createElement('link');
      l.rel = h.rel;
      l.href = h.href;
      if (h.crossorigin != null) l.crossOrigin = h.crossorigin;
      head.appendChild(l);
    });
  }

  // ---- 2) Preload key resources marcados con [data-preload] -----------------
  function injectPreloads() {
    var nodes = document.querySelectorAll('[data-preload]');
    var head = document.head;
    if (!head) return;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var href = n.getAttribute('data-preload');
      var as = n.getAttribute('data-preload-as') || guessAs(href);
      if (!href) continue;
      if (head.querySelector('link[rel="preload"][href="' + href + '"]')) continue;
      var l = document.createElement('link');
      l.rel = 'preload';
      l.href = href;
      if (as) l.as = as;
      if (as === 'font') l.crossOrigin = 'anonymous';
      head.appendChild(l);
    }
  }

  function guessAs(href) {
    if (!href) return null;
    var ext = (href.split('?')[0].split('.').pop() || '').toLowerCase();
    if (['woff', 'woff2', 'ttf', 'otf'].indexOf(ext) >= 0) return 'font';
    if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'].indexOf(ext) >= 0) return 'image';
    if (ext === 'css') return 'style';
    if (ext === 'js') return 'script';
    return null;
  }

  // ---- 3) Lazy load images via IntersectionObserver -------------------------
  var io = null;
  function setupLazyImages() {
    var imgs = document.querySelectorAll('img[data-src], img[loading="lazy"][data-src], source[data-srcset]');
    if (!imgs.length) return;

    if (!('IntersectionObserver' in window)) {
      // Fallback: cargar todo
      for (var i = 0; i < imgs.length; i++) loadImg(imgs[i]);
      return;
    }

    if (!io) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            loadImg(entries[i].target);
            io.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '200px 0px', threshold: 0.01 });
    }

    for (var j = 0; j < imgs.length; j++) {
      // Mark loading=lazy as native fallback
      if (imgs[j].tagName === 'IMG' && !imgs[j].hasAttribute('loading')) {
        imgs[j].setAttribute('loading', 'lazy');
        imgs[j].setAttribute('decoding', 'async');
      }
      io.observe(imgs[j]);
    }
  }

  function loadImg(el) {
    var ds = el.getAttribute('data-src');
    var dss = el.getAttribute('data-srcset');
    var dsi = el.getAttribute('data-sizes');
    if (ds) { el.src = ds; el.removeAttribute('data-src'); }
    if (dss) { el.srcset = dss; el.removeAttribute('data-srcset'); }
    if (dsi) { el.sizes = dsi; el.removeAttribute('data-sizes'); }
  }

  // ---- 4) Defer non-critical scripts marcados con [data-defer] --------------
  function deferScripts() {
    var scripts = document.querySelectorAll('script[data-defer]');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      if (s.dataset.deferred === '1') continue;
      var src = s.getAttribute('src');
      var inline = s.textContent;
      var n = document.createElement('script');
      if (src) n.src = src;
      if (inline) n.textContent = inline;
      n.async = true;
      n.defer = true;
      n.dataset.deferred = '1';
      // Reemplazar al idle
      var insert = function (node) {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(function () { document.body.appendChild(node); });
        } else {
          setTimeout(function () { document.body.appendChild(node); }, 200);
        }
      };
      s.parentNode.removeChild(s);
      insert(n);
    }
  }

  // ---- 5) Inline critical CSS para above-the-fold ---------------------------
  // Critical CSS minimo: layout base + tipografia + variables.
  // Las paginas pueden anular con [data-critical-css] para inyectar mas.
  var CRITICAL_CSS = [
    '*,::before,::after{box-sizing:border-box}',
    'html{-webkit-text-size-adjust:100%;text-rendering:optimizeLegibility}',
    'body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a;background:#fff}',
    'img,svg,video{max-width:100%;height:auto;display:block}',
    'a{color:inherit;text-decoration:none}',
    'button{font:inherit;cursor:pointer}',
    '.volvix-hero{min-height:60vh;display:flex;align-items:center;justify-content:center}',
    '[hidden]{display:none!important}',
  ].join('');

  function inlineCriticalCss() {
    if (document.querySelector('style[data-volvix-critical]')) return;
    var st = document.createElement('style');
    st.setAttribute('data-volvix-critical', '1');
    st.textContent = CRITICAL_CSS;
    var head = document.head || document.getElementsByTagName('head')[0];
    if (head && head.firstChild) head.insertBefore(st, head.firstChild);
    else if (head) head.appendChild(st);
  }

  // ---- 6) Async load de stylesheets [data-async-css] ------------------------
  function asyncStyles() {
    var links = document.querySelectorAll('link[data-async-css]');
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      // patron preload swap
      l.rel = 'preload';
      l.as = 'style';
      l.onload = function () { this.rel = 'stylesheet'; };
    }
  }

  // ---- 7) Boot --------------------------------------------------------------
  function boot() {
    inlineCriticalCss();
    injectHints();
    injectPreloads();
    asyncStyles();
    setupLazyImages();
    deferScripts();

    // Re-procesar en mutaciones (SPAs)
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () {
        setupLazyImages();
        deferScripts();
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.VolvixPerf = {
    refresh: function () { setupLazyImages(); deferScripts(); },
    preload: function (href, as) {
      var l = document.createElement('link');
      l.rel = 'preload'; l.href = href;
      if (as) l.as = as;
      document.head.appendChild(l);
    },
  };
})();
