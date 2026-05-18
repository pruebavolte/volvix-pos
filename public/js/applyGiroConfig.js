/* ============================================================
 * applyGiroConfig.js — Schema-driven UI config por giro
 * Version: 1.0
 * Fecha: 2026-05-18
 * Branch: feature/ampliacion-modulos
 * Compat: salvadorex-pos.html + paneldecontrol.html
 *
 * USO:
 *   1. Incluir <script src="/js/applyGiroConfig.js"></script> antes de </body>
 *   2. Llamar applyGiroConfig('navaja')  // o el slug del giro del tenant
 *
 * COMPORTAMIENTO:
 *   - Lee terminologías + módulos activos desde /data/giros-terminologias.json
 *   - Oculta elementos con data-module no activo
 *   - Oculta elementos con data-giros que no incluyen el slug actual
 *   - Reemplaza textos en elementos data-i18n con la terminología del giro
 *
 * NO ROMPE NADA: si un elemento no tiene los atributos, se queda como está.
 * ============================================================ */

(function() {
  'use strict';

  // Cache del config cargado
  let _terminologiasCache = null;
  let _activeGiroSlug = null;

  /**
   * Carga el JSON de terminologías (cached)
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
      console.warn('[applyGiroConfig] No se pudo cargar terminologias:', err.message);
      return null;
    }
  }

  /**
   * Resuelve la config para un giro específico.
   * Si el giro no existe en el JSON, aplica inferencia por categoría.
   */
  function resolveGiroConfig(terminologias, giroSlug) {
    if (!terminologias || !giroSlug) return null;

    // 1. Match exacto
    if (terminologias[giroSlug] && typeof terminologias[giroSlug] === 'object') {
      return terminologias[giroSlug];
    }

    // 2. Default fallback
    return terminologias['default'] || null;
  }

  /**
   * Aplica config visual a un root element (default: document)
   */
  function apply(config, root) {
    root = root || document;
    if (!config) return { hidden: 0, replaced: 0 };

    const modulosActivos = new Set(config.modulos_activos || []);
    const modulosInactivos = new Set(config.modulos_inactivos || []);
    const terminologias = config.terminologias || {};

    let hidden = 0;
    let replaced = 0;

    // 1. Mostrar/ocultar por data-module
    root.querySelectorAll('[data-module]').forEach(el => {
      const mod = el.getAttribute('data-module');
      if (!mod) return;
      // Si el módulo está explícitamente inactivo O no está en activos, ocultar
      if (modulosInactivos.has(mod)) {
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden-reason', 'module:' + mod);
        hidden++;
      } else if (modulosActivos.size > 0 && !modulosActivos.has(mod) && mod !== 'core') {
        // Si hay lista explícita de activos y este módulo NO está, ocultar (excepto core que siempre se muestra)
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden-reason', 'module-not-active:' + mod);
        hidden++;
      } else {
        // Restaurar
        if (el.getAttribute('data-vlx-hidden-reason')) {
          el.style.display = '';
          el.removeAttribute('data-vlx-hidden-reason');
        }
      }
    });

    // 2. Mostrar/ocultar por data-giros
    root.querySelectorAll('[data-giros]').forEach(el => {
      const giros = (el.getAttribute('data-giros') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (giros.length === 0) return;
      if (giros.includes('*')) return; // Universal
      if (!giros.includes(_activeGiroSlug)) {
        el.style.display = 'none';
        el.setAttribute('data-vlx-hidden-reason', 'giro:' + _activeGiroSlug);
        hidden++;
      }
    });

    // 3. Reemplazar textos data-i18n con la terminología
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key || !terminologias[key]) return;
      const newText = terminologias[key];
      // Solo reemplazar si el text content actual coincide con el key (case-insensitive)
      // o si tiene atributo data-i18n-force
      const oldText = (el.textContent || '').trim().toLowerCase();
      if (oldText === key.toLowerCase() || el.hasAttribute('data-i18n-force')) {
        el.textContent = newText;
        replaced++;
      } else {
        // Reemplazo más agresivo: buscar el key en el text node y reemplazar
        if (oldText.includes(key.toLowerCase())) {
          el.textContent = el.textContent.replace(new RegExp(key, 'gi'), newText);
          replaced++;
        }
      }
    });

    // 4. Reemplazar placeholders en inputs con data-i18n-placeholder
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key || !terminologias[key]) return;
      el.setAttribute('placeholder', terminologias[key]);
      replaced++;
    });

    return { hidden, replaced };
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

    const terminologias = await loadTerminologias();
    if (!terminologias) {
      console.warn('[applyGiroConfig] No hay terminologías cargadas, abort');
      return false;
    }

    const config = resolveGiroConfig(terminologias, giroSlug);
    if (!config) {
      console.warn('[applyGiroConfig] No hay config para giro:', giroSlug);
      return false;
    }

    _activeGiroSlug = giroSlug;
    document.body.setAttribute('data-vlx-active-giro', giroSlug);

    const result = apply(config, document);

    const t1 = performance.now();
    console.log(
      '[applyGiroConfig] giro=' + giroSlug +
      ' hidden=' + result.hidden +
      ' replaced=' + result.replaced +
      ' time=' + Math.round(t1 - t0) + 'ms'
    );

    // Disparar evento custom para que otros scripts puedan reaccionar
    window.dispatchEvent(new CustomEvent('vlx:giro-applied', { detail: { giroSlug, result } }));

    return true;
  }

  /**
   * Función pública: lista de giros disponibles
   */
  async function listGirosDisponibles() {
    const terminologias = await loadTerminologias();
    if (!terminologias) return [];
    return Object.keys(terminologias).filter(k => !k.startsWith('_') && k !== 'default');
  }

  /**
   * Función pública: obtener config actual sin aplicar
   */
  async function getGiroConfig(giroSlug) {
    const terminologias = await loadTerminologias();
    return resolveGiroConfig(terminologias, giroSlug);
  }

  /**
   * Función pública: reset visual (restaurar todo)
   */
  function resetGiroConfig() {
    document.querySelectorAll('[data-vlx-hidden-reason]').forEach(el => {
      el.style.display = '';
      el.removeAttribute('data-vlx-hidden-reason');
    });
    _activeGiroSlug = null;
    document.body.removeAttribute('data-vlx-active-giro');
    console.log('[applyGiroConfig] Reset completo');
  }

  // Exponer públicamente
  window.applyGiroConfig = applyGiroConfig;
  window.listGirosDisponibles = listGirosDisponibles;
  window.getGiroConfig = getGiroConfig;
  window.resetGiroConfig = resetGiroConfig;
  window.vlxSchemaDrivenUI = {
    apply: applyGiroConfig,
    list: listGirosDisponibles,
    get: getGiroConfig,
    reset: resetGiroConfig,
    activeGiro: () => _activeGiroSlug,
    version: '1.0'
  };

  // Auto-apply si hay data-vlx-auto-giro en body
  document.addEventListener('DOMContentLoaded', function() {
    const autoGiro = document.body.getAttribute('data-vlx-auto-giro');
    if (autoGiro) {
      console.log('[applyGiroConfig] auto-apply detected:', autoGiro);
      applyGiroConfig(autoGiro);
    } else {
      console.log('[applyGiroConfig] v1.0 ready. Usa applyGiroConfig("navaja") para activar.');
    }
  });

})();
