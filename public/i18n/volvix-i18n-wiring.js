/**
 * Volvix i18n wiring
 * - Lee localStorage.volvix_lang o navigator.language
 * - Reemplaza elementos con [data-i18n="key.path"] por la traduccion
 * - Atributos: [data-i18n-attr="placeholder:auth.email"] o [data-i18n-placeholder="auth.email"]
 * - Auto-inyecta language switcher en el footer (si existe)
 *
 * Uso:
 *   <script src="/i18n/volvix-i18n-wiring.js" defer></script>
 *   <h1 data-i18n="landing.features_title">Todo lo que tu negocio necesita</h1>
 *   <input data-i18n-placeholder="auth.email" placeholder="Correo">
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'volvix_lang';
  var DEFAULT_LANG = 'es-MX';
  var SUPPORTED = ['es-MX', 'en'];
  var BASE_PATH = '/i18n/';

  var translations = {};
  var currentLang = DEFAULT_LANG;

  function detectLang() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored && SUPPORTED.indexOf(stored) >= 0) return stored;

    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.indexOf('es') === 0) return 'es-MX';
    if (nav.indexOf('en') === 0) return 'en';
    return DEFAULT_LANG;
  }

  function get(obj, path) {
    if (!obj || !path) return null;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return (typeof cur === 'string') ? cur : null;
  }

  function loadLang(lang) {
    return fetch(BASE_PATH + lang + '.json', { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('i18n load failed: ' + r.status);
        return r.json();
      });
  }

  function applyTranslations(root) {
    root = root || document;
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      var val = get(translations, key);
      if (val != null) el.textContent = val;
    }

    // data-i18n-placeholder, data-i18n-title, data-i18n-aria-label, etc.
    var attrNodes = root.querySelectorAll(
      '[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label],[data-i18n-value],[data-i18n-alt]'
    );
    for (var j = 0; j < attrNodes.length; j++) {
      var el2 = attrNodes[j];
      var attrs = el2.attributes;
      for (var k = 0; k < attrs.length; k++) {
        var a = attrs[k];
        if (a.name.indexOf('data-i18n-') === 0) {
          var attrName = a.name.substring('data-i18n-'.length);
          var v = get(translations, a.value);
          if (v != null) el2.setAttribute(attrName, v);
        }
      }
    }

    // [data-i18n-attr="placeholder:auth.email,title:common.save"]
    var combo = root.querySelectorAll('[data-i18n-attr]');
    for (var m = 0; m < combo.length; m++) {
      var spec = combo[m].getAttribute('data-i18n-attr') || '';
      var pairs = spec.split(',');
      for (var n = 0; n < pairs.length; n++) {
        var p = pairs[n].trim();
        var idx = p.indexOf(':');
        if (idx < 0) continue;
        var attrN = p.substring(0, idx).trim();
        var keyN = p.substring(idx + 1).trim();
        var vv = get(translations, keyN);
        if (vv != null) combo[m].setAttribute(attrN, vv);
      }
    }

    document.documentElement.setAttribute('lang', currentLang);
  }

  function injectSwitcher() {
    if (document.querySelector('[data-volvix-i18n-switcher]')) return;
    var footer = document.querySelector('footer') || document.body;
    if (!footer) return;

    var wrap = document.createElement('div');
    wrap.setAttribute('data-volvix-i18n-switcher', '1');
    wrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center;padding:6px 10px;font-size:12px;opacity:0.85;';

    var label = document.createElement('span');
    label.textContent = 'Lang:';
    wrap.appendChild(label);

    for (var i = 0; i < SUPPORTED.length; i++) {
      (function (l) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = l;
        btn.style.cssText = 'background:transparent;border:1px solid currentColor;color:inherit;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;' +
          (l === currentLang ? 'font-weight:bold;' : '');
        btn.addEventListener('click', function () { window.VolvixI18n.setLang(l); });
        wrap.appendChild(btn);
      })(SUPPORTED[i]);
    }

    footer.appendChild(wrap);
  }

  function init() {
    currentLang = detectLang();
    loadLang(currentLang)
      .then(function (data) {
        translations = data || {};
        applyTranslations(document);
        injectSwitcher();
        document.dispatchEvent(new CustomEvent('volvix:i18n:ready', { detail: { lang: currentLang } }));
      })
      .catch(function (err) {
        // Fallback: si falla la carga, intentamos default
        if (currentLang !== DEFAULT_LANG) {
          currentLang = DEFAULT_LANG;
          loadLang(DEFAULT_LANG).then(function (d) {
            translations = d || {};
            applyTranslations(document);
            injectSwitcher();
          }).catch(function () { console.warn('[volvix-i18n] no se pudo cargar', err); });
        } else {
          console.warn('[volvix-i18n] error:', err);
        }
      });
  }

  window.VolvixI18n = {
    t: function (key) { return get(translations, key) || key; },
    getLang: function () { return currentLang; },
    setLang: function (lang) {
      if (SUPPORTED.indexOf(lang) < 0) return;
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
      currentLang = lang;
      loadLang(lang).then(function (data) {
        translations = data || {};
        applyTranslations(document);
        document.dispatchEvent(new CustomEvent('volvix:i18n:changed', { detail: { lang: lang } }));
      });
    },
    apply: applyTranslations,
    supported: SUPPORTED.slice(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
