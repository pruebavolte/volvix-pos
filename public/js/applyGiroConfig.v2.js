/* ============================================================
 * applyGiroConfig.v2.js — Motor schema-driven multi-giro V2
 * Version: 2.0
 * Fecha: 2026-05-22
 *
 * MEJORAS sobre v1:
 *  - Fetch en paralelo desde /data/giros-terminologias-v2.json
 *    + /api/giros/master?slug=X (Supabase)
 *  - Cache 5 min con TTL
 *  - Soporte data-i18n-placeholder, data-i18n-title, data-i18n-aria-label
 *  - data-giros (positivo) y data-giros-not (negativo)
 *  - AGGRESSIVE mode: TreeWalker text replacement (no requiere data-i18n)
 *  - MutationObserver: re-aplica al cambiar el DOM (modales lazy)
 *  - Evento custom 'volvix:giro-applied'
 *  - CSS injection automático para módulos inactivos
 *  - Bilingüe: soporta { es: "...", en: "..." }
 * ============================================================ */

(function () {
  'use strict';

  var _cache = null;
  var _cacheAt = 0;
  var _CACHE_TTL = 5 * 60 * 1000; // 5 min
  var _activeSlug = null;
  var _activeConfig = null;
  var _observer = null;

  function _now() { return Date.now(); }
  function _expired() { return !_cache || (_now() - _cacheAt) > _CACHE_TTL; }

  // ─── 1. Cargar terminologías (paralelo: static JSON + Supabase) ───
  async function loadConfig(slug) {
    if (!_expired() && _cache && _cache[slug]) return _cache[slug];

    var staticP = fetch('/data/giros-terminologias-v2.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });

    var apiP = slug
      ? fetch('/api/giros/master?slug=' + encodeURIComponent(slug), { cache: 'default' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
      : Promise.resolve(null);

    var results = await Promise.all([staticP, apiP]);
    var staticData = results[0] || { default: { terminologias: {}, modulos_activos: [], modulos_inactivos: [] } };
    var apiData = results[1];

    // Merge: API tiene prioridad sobre static, fallback a default si nada
    var fromStatic = staticData[slug] || staticData['default'] || {};
    var fromApi = null;
    if (apiData && apiData.ok && Array.isArray(apiData.giros) && apiData.giros[0]) {
      var g = apiData.giros[0];
      var termsObj = {};
      (g.terminologia || []).forEach(function (t) {
        if (t.generico && t.este_giro) termsObj[String(t.generico).toLowerCase()] = t.este_giro;
      });
      var mods = g.modules_enabled || {};
      var activos = Object.keys(mods).filter(function (k) { return mods[k] === true; });
      var inactivos = Object.keys(mods).filter(function (k) { return mods[k] === false; });
      fromApi = {
        modulos_activos: activos,
        modulos_inactivos: inactivos,
        terminologias: termsObj,
      };
    }

    var merged = {
      modulos_activos: (fromApi && fromApi.modulos_activos.length ? fromApi.modulos_activos : fromStatic.modulos_activos) || [],
      modulos_inactivos: (fromApi && fromApi.modulos_inactivos.length ? fromApi.modulos_inactivos : fromStatic.modulos_inactivos) || [],
      terminologias: Object.assign({}, fromStatic.terminologias || {}, fromApi ? fromApi.terminologias : {}),
    };

    _cache = _cache || {};
    _cache[slug] = merged;
    _cacheAt = _now();
    return merged;
  }

  // ─── 2. Resolver valor (soporta { es: "...", en: "..." }) ───
  function resolveVal(v, lang) {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return v[lang || 'es'] || v.es || v.en || null;
    return String(v);
  }

  // ─── 3. Aplicar config a un root element ───
  function applyTo(root, config, opts) {
    root = root || document;
    if (!config) return { hidden: 0, replaced: 0 };
    opts = opts || {};
    var terms = config.terminologias || {};
    var activos = new Set(config.modulos_activos || []);
    var inactivos = new Set(config.modulos_inactivos || []);
    var hidden = 0, replaced = 0;

    // [data-module]: ocultar si está en inactivos O si hay activos definidos Y no está incluido (excepto core)
    root.querySelectorAll('[data-module]').forEach(function (el) {
      var mod = el.getAttribute('data-module');
      if (!mod) return;
      if (inactivos.has(mod)) {
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden', 'module:' + mod);
        hidden++;
      } else if (activos.size > 0 && !activos.has(mod) && mod !== 'core' && mod !== 'pos') {
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden', 'module-not-active:' + mod);
        hidden++;
      } else {
        if (el.getAttribute('data-vlx-hidden')) {
          el.style.display = '';
          el.removeAttribute('data-vlx-hidden');
        }
      }
    });

    // [data-giros="a,b,c"] — mostrar SOLO si giro actual está
    root.querySelectorAll('[data-giros]').forEach(function (el) {
      var list = (el.getAttribute('data-giros') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (list.length === 0 || list.indexOf('*') >= 0) return;
      if (list.indexOf(_activeSlug) < 0) {
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden', 'giros');
        hidden++;
      }
    });

    // [data-giros-not] — ocultar si giro actual SÍ está en lista
    root.querySelectorAll('[data-giros-not]').forEach(function (el) {
      var list = (el.getAttribute('data-giros-not') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (list.indexOf(_activeSlug) >= 0) {
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden', 'giros-not');
        hidden++;
      }
    });

    // [data-i18n] — reemplazar textContent
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var v = resolveVal(terms[key]);
      if (!v) return;
      el.textContent = v;
      replaced++;
    });

    // [data-i18n-placeholder] — reemplazar atributo placeholder
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var v = resolveVal(terms[key]);
      if (!v) return;
      el.setAttribute('placeholder', v);
      replaced++;
    });

    // [data-i18n-title] — atributo title (tooltip)
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var v = resolveVal(terms[key]);
      if (!v) return;
      el.setAttribute('title', v);
      replaced++;
    });

    // [data-i18n-aria-label] — accessibility
    root.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria-label');
      var v = resolveVal(terms[key]);
      if (!v) return;
      el.setAttribute('aria-label', v);
      replaced++;
    });

    // AGGRESSIVE mode: TreeWalker text replacement (no requiere data-i18n)
    if (opts.aggressive) {
      var dict = {};
      // Construir diccionario invertido: { "Cliente": "Comensal", "Ticket": "Comanda", ... }
      // Solo si en default terms está "Cliente" y en current está "Comensal", reemplaza.
      // Para evitar bucles, requiere comparación case-insensitive contra cliente_default.
      var defaultTerms = (_cache && _cache['default'] && _cache['default'].terminologias) || {};
      Object.keys(defaultTerms).forEach(function (k) {
        var defaultV = resolveVal(defaultTerms[k]);
        var newV = resolveVal(terms[k]);
        if (defaultV && newV && defaultV.toLowerCase() !== newV.toLowerCase()) {
          dict[defaultV] = newV;
        }
      });

      if (Object.keys(dict).length > 0) {
        // TreeWalker para reemplazar text nodes — skip elementos en script/style
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: function (node) {
            var p = node.parentNode;
            if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
            var tag = p.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
            if (p.hasAttribute && p.hasAttribute('data-vlx-no-replace')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        var node, count = 0;
        while ((node = walker.nextNode())) {
          var txt = node.nodeValue;
          if (!txt || txt.length < 3) continue;
          var changed = false;
          Object.keys(dict).forEach(function (oldT) {
            if (txt.indexOf(oldT) >= 0) {
              var re = new RegExp('\\b' + oldT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
              var newTxt = txt.replace(re, dict[oldT]);
              if (newTxt !== txt) { txt = newTxt; changed = true; }
            }
          });
          if (changed) { node.nodeValue = txt; replaced++; count++; }
          if (count > 500) break; // límite de seguridad
        }
      }
    }

    return { hidden: hidden, replaced: replaced };
  }

  // ─── 4. CSS injection: oculta clases .module-X cuando X está inactivo ───
  function injectCss(config) {
    var inactivos = config.modulos_inactivos || [];
    if (!inactivos.length) return;
    var cssId = 'vlx-giro-config-css';
    var existing = document.getElementById(cssId);
    if (existing) existing.remove();
    var rules = inactivos.map(function (m) {
      return '[data-module="' + m + '"], .module-' + m + ', .vlx-module-' + m + ' { display: none !important; }';
    });
    var s = document.createElement('style');
    s.id = cssId;
    s.textContent = rules.join('\n');
    document.head.appendChild(s);
  }

  // ─── 5. API pública: applyGiroConfig(slug, opts) ───
  async function applyGiroConfig(slug, opts) {
    opts = opts || {};
    if (!slug || typeof slug !== 'string') {
      console.warn('[applyGiroConfig.v2] slug inválido:', slug);
      return false;
    }
    var t0 = performance.now();
    // V14.2 FIX: cargar 'default' siempre que aggressive=true para construir
    // el diccionario de reemplazo (defaultTerm → newTerm). Sin esto el
    // TreeWalker no tenía base de comparación y no reemplazaba nada.
    var config = await loadConfig(slug);
    if (opts.aggressive && (!_cache || !_cache['default'])) {
      await loadConfig('default');
    }
    if (!config) {
      console.warn('[applyGiroConfig.v2] sin config para', slug);
      return false;
    }
    _activeSlug = slug;
    _activeConfig = config;
    document.body.setAttribute('data-vlx-active-giro', slug);
    var res = applyTo(document, config, opts);
    injectCss(config);

    // MutationObserver para re-aplicar cuando aparezcan nodos nuevos
    if (opts.observe !== false && !_observer) {
      try {
        _observer = new MutationObserver(function (muts) {
          var hasNew = false;
          for (var i = 0; i < muts.length; i++) {
            if (muts[i].addedNodes && muts[i].addedNodes.length) { hasNew = true; break; }
          }
          if (hasNew && _activeConfig) {
            applyTo(document, _activeConfig, opts);
          }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
      } catch (_) {}
    }

    var t1 = performance.now();
    var detail = { slug: slug, hidden: res.hidden, replaced: res.replaced, ms: Math.round(t1 - t0) };
    console.log('[applyGiroConfig.v2]', detail);
    try {
      document.dispatchEvent(new CustomEvent('volvix:giro-applied', { detail: detail }));
    } catch (_) {}
    return true;
  }

  // ─── 6. Destroy: limpiar overrides ───
  function destroy() {
    try { _observer && _observer.disconnect(); } catch (_) {}
    _observer = null;
    document.querySelectorAll('[data-vlx-hidden]').forEach(function (el) {
      el.style.display = '';
      el.removeAttribute('data-vlx-hidden');
    });
    var s = document.getElementById('vlx-giro-config-css');
    if (s) s.remove();
    _activeSlug = null;
    _activeConfig = null;
  }

  // ─── 7. Exponer API global ───
  window.applyGiroConfig = applyGiroConfig;
  window.applyGiroConfigV2 = applyGiroConfig;
  window.applyGiroConfigDestroy = destroy;
  window.applyGiroConfigGetActive = function () { return { slug: _activeSlug, config: _activeConfig }; };

  // ─── 8. Auto-init si hay ?giro=X en URL ───
  document.addEventListener('DOMContentLoaded', function () {
    try {
      var u = new URL(window.location.href);
      var giro = u.searchParams.get('giro');
      if (giro) {
        var aggressive = u.searchParams.get('aggressive') === '1' || u.searchParams.get('preview') === '1';
        setTimeout(function () { applyGiroConfig(giro, { aggressive: aggressive }); }, 300);
      }
    } catch (_) {}
  });
})();
