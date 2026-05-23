/* ============================================================
 * applyGiroConfig.js — Schema-driven UI config por giro
 * Version: 1.0 → V13.39
 * Fecha: 2026-05-18 (V1) → 2026-05-21 (V13.39)
 * Branch: feature/ampliacion-modulos
 * Compat: salvadorex-pos.html + paneldecontrol.html + todo el resto
 *
 * V13.39 — POWERED-UP ENGINE:
 *   • Lee terminologías desde Supabase (/api/giros/master?slug=X) con fallback al JSON estático
 *   • Convierte array terminologia[{generico, este_giro}] → {generico_lower: este_giro}
 *   • Mapea metadata.modules_enabled → modulos_activos[]
 *   • Soporta data-i18n-attr-* (title, alt, aria-label, etc.) para reemplazo en atributos
 *   • Soporta data-i18n-html para reemplazar innerHTML
 *   • Soporta data-i18n-plural para pluralización automática (+s)
 *   • Clase CSS vlx-hidden-by-giro al ocultar (inspeccionable)
 *   • applyGiroConfig.reload() — limpia cache y re-fetcha
 *   • Evento volvix:giro-applied con slug + stats
 *   • Tests inline con console.assert
 *
 * USO:
 *   1. Incluir <script src="/js/applyGiroConfig.js"></script> antes de </body>
 *   2. Llamar applyGiroConfig('restaurante')  // slug del giro del tenant
 *   3. (opcional) applyGiroConfig.reload() — para refrescar desde Supabase
 *
 * NO ROMPE NADA: 100% compatible con uso previo (data-module, data-giros, data-i18n,
 * data-i18n-placeholder, data-i18n-force, data-vlx-auto-giro).
 * ============================================================ */

(function() {
  'use strict';

  const VERSION = 'V13.39';

  // Cache del config cargado
  let _terminologiasCache = null;        // JSON estático (fallback)
  let _supabaseGiroCache = {};            // Cache por slug desde Supabase
  let _activeGiroSlug = null;

  // Inyectar CSS de soporte (vlx-hidden-by-giro)
  function injectStyles() {
    if (document.getElementById('vlx-giro-config-styles')) return;
    const style = document.createElement('style');
    style.id = 'vlx-giro-config-styles';
    style.textContent = '.vlx-hidden-by-giro { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Convierte el formato Supabase al formato interno esperado.
   *  Input  : { terminologia: [{generico:"cliente", este_giro:"Comensal"}], modules_enabled: {pos:true, ventas:false} }
   *  Output : { terminologias: {cliente:"Comensal"}, modulos_activos:["pos"], modulos_inactivos:["ventas"] }
   */
  function normalizeSupabaseGiro(giro) {
    if (!giro || typeof giro !== 'object') return null;

    // 1) terminologia[] → terminologias{}
    const terminologias = {};
    const arr = Array.isArray(giro.terminologia)
      ? giro.terminologia
      : (giro.metadata && Array.isArray(giro.metadata.terminologia) ? giro.metadata.terminologia : []);
    arr.forEach(t => {
      if (t && t.generico && t.este_giro) {
        terminologias[String(t.generico).trim().toLowerCase()] = String(t.este_giro);
      }
    });

    // 2) modules_enabled → modulos_activos[] + modulos_inactivos[]
    const modEnabled = giro.modules_enabled
      || (giro.metadata && giro.metadata.modules_enabled)
      || {};
    const modulos_activos = [];
    const modulos_inactivos = [];
    Object.keys(modEnabled).forEach(k => {
      if (modEnabled[k] === true) modulos_activos.push(k);
      else if (modEnabled[k] === false) modulos_inactivos.push(k);
    });

    return {
      slug: giro.slug,
      name: giro.name,
      categoria: giro.categoria,
      terminologias,
      modulos_activos,
      modulos_inactivos,
      _source: 'supabase'
    };
  }

  /**
   * Intenta cargar config desde Supabase (/api/giros/master?slug=X)
   * Devuelve null si falla (caller hará fallback al JSON estático).
   */
  async function loadFromSupabase(giroSlug) {
    if (!giroSlug) return null;
    if (_supabaseGiroCache[giroSlug]) return _supabaseGiroCache[giroSlug];
    try {
      const resp = await fetch('/api/giros/master?slug=' + encodeURIComponent(giroSlug), {
        cache: 'no-cache'
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data || data.ok !== true) throw new Error('Response not ok');
      const giro = Array.isArray(data.giros) ? data.giros[0] : (data.giro || data.data);
      if (!giro) throw new Error('Sin giro en respuesta');
      const normalized = normalizeSupabaseGiro(giro);
      if (normalized) _supabaseGiroCache[giroSlug] = normalized;
      return normalized;
    } catch (err) {
      console.warn('[applyGiroConfig] Supabase fetch falló para', giroSlug, '→ fallback JSON:', err.message);
      return null;
    }
  }

  /**
   * Carga el JSON estático de terminologías (fallback, cached)
   */
  async function loadTerminologias() {
    if (_terminologiasCache) return _terminologiasCache;
    try {
      const resp = await fetch('/data/giros-terminologias.json?v=' + Date.now(), {
        cache: 'no-cache'
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      _terminologiasCache = await resp.json();
      return _terminologiasCache;
    } catch (err) {
      console.warn('[applyGiroConfig] No se pudo cargar JSON estático:', err.message);
      return null;
    }
  }

  /**
   * Resuelve la config para un giro: PRIMERO intenta Supabase, fallback al JSON estático.
   */
  async function resolveGiroConfigSmart(giroSlug) {
    if (!giroSlug) return null;

    // 1) Intentar Supabase
    const fromDB = await loadFromSupabase(giroSlug);
    if (fromDB) return fromDB;

    // 2) Fallback JSON estático
    const terminologias = await loadTerminologias();
    if (!terminologias) return null;
    if (terminologias[giroSlug] && typeof terminologias[giroSlug] === 'object') {
      const c = terminologias[giroSlug];
      c._source = 'static';
      return c;
    }
    const def = terminologias['default'];
    if (def) { def._source = 'static-default'; return def; }
    return null;
  }

  /**
   * Aplica config visual a un root element (default: document)
   */
  function apply(config, root) {
    root = root || document;
    if (!config) return { hidden: 0, replaced: 0, attrs: 0, html: 0, plurals: 0 };

    injectStyles();

    const modulosActivos = new Set(config.modulos_activos || []);
    const modulosInactivos = new Set(config.modulos_inactivos || []);
    const terminologias = config.terminologias || {};

    let hidden = 0;
    let replaced = 0;
    let attrs = 0;
    let html = 0;
    let plurals = 0;

    // Helper: pluralización ES simple (cliente → clientes, ticket → tickets, comanda → comandas)
    function pluralizeES(word) {
      if (!word) return word;
      const w = String(word);
      const last = w.slice(-1).toLowerCase();
      if (/[aeiou]/.test(last)) return w + 's';
      if (last === 'z') return w.slice(0, -1) + 'ces';
      return w + 'es';
    }

    // 1. Mostrar/ocultar por data-module
    root.querySelectorAll('[data-module]').forEach(el => {
      const mod = el.getAttribute('data-module');
      if (!mod) return;
      const shouldHide =
        modulosInactivos.has(mod) ||
        (modulosActivos.size > 0 && !modulosActivos.has(mod) && mod !== 'core');

      if (shouldHide) {
        el.style.display = 'none';
        el.classList.add('vlx-hidden-by-giro');
        el.setAttribute('data-vlx-hidden-reason',
          modulosInactivos.has(mod) ? ('module:' + mod) : ('module-not-active:' + mod));
        hidden++;
      } else {
        if (el.getAttribute('data-vlx-hidden-reason')) {
          el.style.display = '';
          el.classList.remove('vlx-hidden-by-giro');
          el.removeAttribute('data-vlx-hidden-reason');
        }
      }
    });

    // 2. Mostrar/ocultar por data-giros
    root.querySelectorAll('[data-giros]').forEach(el => {
      const giros = (el.getAttribute('data-giros') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (giros.length === 0) return;
      if (giros.includes('*')) return;
      if (!giros.includes(_activeGiroSlug)) {
        el.style.display = 'none';
        el.classList.add('vlx-hidden-by-giro');
        el.setAttribute('data-vlx-hidden-reason', 'giro:' + _activeGiroSlug);
        hidden++;
      }
    });

    // Helper para lookup case-insensitive
    function tlookup(key) {
      if (!key) return null;
      const k = String(key).trim().toLowerCase();
      return terminologias[k] || terminologias[key] || null;
    }

    // 3. Reemplazar textos data-i18n con la terminología
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const newText = tlookup(key);
      if (!newText) return;
      const oldText = (el.textContent || '').trim().toLowerCase();
      if (oldText === String(key).toLowerCase() || el.hasAttribute('data-i18n-force')) {
        el.textContent = newText;
        replaced++;
      } else if (oldText.includes(String(key).toLowerCase())) {
        el.textContent = el.textContent.replace(new RegExp(key, 'gi'), newText);
        replaced++;
      }
    });

    // 4. Placeholders en inputs
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const newText = tlookup(key);
      if (!newText) return;
      el.setAttribute('placeholder', newText);
      replaced++;
    });

    // 5. NUEVO V13.39 — data-i18n-attr-X para reemplazar atributos arbitrarios
    //    Ej: <a data-i18n-attr-title="cliente" title="cliente"> → title="Comensal"
    root.querySelectorAll('*').forEach(el => {
      if (!el.attributes) return;
      for (let i = 0; i < el.attributes.length; i++) {
        const a = el.attributes[i];
        if (!a || !a.name) continue;
        if (a.name.indexOf('data-i18n-attr-') !== 0) continue;
        const attrName = a.name.substring('data-i18n-attr-'.length);
        if (!attrName) continue;
        const newText = tlookup(a.value);
        if (!newText) continue;
        el.setAttribute(attrName, newText);
        attrs++;
      }
    });

    // 6. NUEVO V13.39 — data-i18n-html para reemplazar innerHTML
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const newText = tlookup(key);
      if (!newText) return;
      el.innerHTML = newText;
      html++;
    });

    // 7. NUEVO V13.39 — data-i18n-plural (pluralización ES)
    root.querySelectorAll('[data-i18n-plural]').forEach(el => {
      const key = el.getAttribute('data-i18n-plural');
      const newText = tlookup(key);
      if (!newText) return;
      const pluralized = pluralizeES(newText);
      const oldText = (el.textContent || '').trim().toLowerCase();
      if (oldText === String(key).toLowerCase() ||
          oldText === pluralizeES(String(key)).toLowerCase() ||
          el.hasAttribute('data-i18n-force')) {
        el.textContent = pluralized;
      } else {
        el.textContent = pluralized;
      }
      plurals++;
    });

    return { hidden, replaced, attrs, html, plurals };
  }

  /**
   * Función pública: aplica la config completa
   */
  async function applyGiroConfig(giroSlug, options) {
    options = options || {};
    const t0 = performance.now();

    if (!giroSlug || typeof giroSlug !== 'string') {
      console.warn('[applyGiroConfig] giroSlug inválido:', giroSlug);
      return false;
    }

    const config = await resolveGiroConfigSmart(giroSlug);
    if (!config) {
      console.warn('[applyGiroConfig] No hay config para giro:', giroSlug);
      return false;
    }

    _activeGiroSlug = giroSlug;
    document.body.setAttribute('data-vlx-active-giro', giroSlug);
    document.body.setAttribute('data-vlx-giro-source', config._source || 'unknown');

    const result = apply(config, document);
    const t1 = performance.now();
    const stats = Object.assign({}, result, {
      slug: giroSlug,
      source: config._source,
      ms: Math.round(t1 - t0)
    });

    console.log(
      '[applyGiroConfig ' + VERSION + '] giro=' + giroSlug +
      ' src=' + config._source +
      ' hidden=' + result.hidden +
      ' replaced=' + result.replaced +
      ' attrs=' + result.attrs +
      ' html=' + result.html +
      ' plurals=' + result.plurals +
      ' time=' + stats.ms + 'ms'
    );

    // Eventos: nuevo namespace (volvix:) + compat con anterior (vlx:)
    window.dispatchEvent(new CustomEvent('volvix:giro-applied', { detail: stats }));
    window.dispatchEvent(new CustomEvent('vlx:giro-applied', { detail: { giroSlug, result } }));

    return true;
  }

  /**
   * Función pública: lista de giros disponibles (JSON estático)
   */
  async function listGirosDisponibles() {
    const terminologias = await loadTerminologias();
    if (!terminologias) return [];
    return Object.keys(terminologias).filter(k => !k.startsWith('_') && k !== 'default');
  }

  /**
   * Función pública: obtener config actual sin aplicar (smart: DB primero)
   */
  async function getGiroConfig(giroSlug) {
    return await resolveGiroConfigSmart(giroSlug);
  }

  /**
   * Función pública: reset visual (restaurar todo)
   */
  function resetGiroConfig() {
    document.querySelectorAll('[data-vlx-hidden-reason]').forEach(el => {
      el.style.display = '';
      el.classList.remove('vlx-hidden-by-giro');
      el.removeAttribute('data-vlx-hidden-reason');
    });
    _activeGiroSlug = null;
    document.body.removeAttribute('data-vlx-active-giro');
    document.body.removeAttribute('data-vlx-giro-source');
    console.log('[applyGiroConfig] Reset completo');
  }

  /**
   * V13.39 NUEVO: limpia cache y re-fetcha desde Supabase
   */
  async function reload() {
    _terminologiasCache = null;
    _supabaseGiroCache = {};
    console.log('[applyGiroConfig] Cache limpio. Re-aplicando giro activo:', _activeGiroSlug);
    if (_activeGiroSlug) {
      return await applyGiroConfig(_activeGiroSlug);
    }
    return true;
  }

  // Exponer públicamente
  window.applyGiroConfig = applyGiroConfig;
  // Exponer reload como propiedad de la función (no rompe llamadas existentes)
  window.applyGiroConfig.reload = reload;
  window.applyGiroConfig.version = VERSION;

  window.listGirosDisponibles = listGirosDisponibles;
  window.getGiroConfig = getGiroConfig;
  window.resetGiroConfig = resetGiroConfig;
  window.vlxSchemaDrivenUI = {
    apply: applyGiroConfig,
    list: listGirosDisponibles,
    get: getGiroConfig,
    reset: resetGiroConfig,
    reload: reload,
    activeGiro: () => _activeGiroSlug,
    version: VERSION
  };

  // ===== Tests inline (console.assert) =====
  try {
    // Test 1: normalizeSupabaseGiro convierte terminologia[] → terminologias{}
    const t1 = normalizeSupabaseGiro({
      slug: 'restaurante',
      terminologia: [
        { generico: 'cliente', este_giro: 'Comensal' },
        { generico: 'producto', este_giro: 'Platillo' }
      ],
      modules_enabled: { pos: true, ventas: true, ascensor: false }
    });
    console.assert(t1 && t1.terminologias.cliente === 'Comensal',
      '[applyGiroConfig TEST] terminologia[] → {cliente:"Comensal"} FAIL');
    console.assert(t1 && t1.modulos_activos.indexOf('pos') >= 0 && t1.modulos_inactivos.indexOf('ascensor') >= 0,
      '[applyGiroConfig TEST] modules_enabled mapping FAIL');

    // Test 2: lookup case-insensitive
    const t2 = normalizeSupabaseGiro({
      terminologia: [{ generico: 'CLIENTE', este_giro: 'Comensal' }],
      modules_enabled: {}
    });
    console.assert(t2 && t2.terminologias.cliente === 'Comensal',
      '[applyGiroConfig TEST] lowercase key normalization FAIL');

    // Test 3: input vacío no truena
    console.assert(normalizeSupabaseGiro(null) === null,
      '[applyGiroConfig TEST] null input FAIL');
    console.assert(normalizeSupabaseGiro({}) !== null,
      '[applyGiroConfig TEST] empty object no truena FAIL');
  } catch (e) {
    console.warn('[applyGiroConfig TEST] excepción durante self-test:', e.message);
  }

  // Auto-apply si hay data-vlx-auto-giro en body
  document.addEventListener('DOMContentLoaded', function() {
    injectStyles();
    const autoGiro = document.body.getAttribute('data-vlx-auto-giro');
    if (autoGiro) {
      console.log('[applyGiroConfig] auto-apply detected:', autoGiro);
      applyGiroConfig(autoGiro);
    } else {
      console.log('[applyGiroConfig] ' + VERSION + ' ready. Usa applyGiroConfig("restaurante") para activar.');
    }
  });

})();
