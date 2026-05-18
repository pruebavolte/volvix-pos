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

  // ════════════════════════════════════════════════════════════
  // V1.1 — Render dinámico de campos desde modal-fields-catalog.json
  // Inyecta en <div data-vlx-dynamic-fields="MODAL_NAME"></div>
  // los campos cuyo data-module está activo Y cuyo data-giros incluye el giro actual.
  // ════════════════════════════════════════════════════════════

  let _catalogCache = null;

  async function loadFieldsCatalog() {
    if (_catalogCache) return _catalogCache;
    try {
      const resp = await fetch('/data/modal-fields-catalog.json?v=' + Date.now(), { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      _catalogCache = await resp.json();
      return _catalogCache;
    } catch (err) {
      console.warn('[applyGiroConfig] No se pudo cargar catalog:', err.message);
      return null;
    }
  }

  function fieldVisibleForGiro(field, giroSlug, activeModules, inactiveModules, categoriaGiro) {
    // Filtro 1: módulo NO debe estar explícitamente INACTIVO (whitelist abierta).
    const mod = field.module || 'base';
    if (mod !== 'base' && inactiveModules.has(mod)) return false;
    // Filtro 2: giros del campo (en catálogo) — match contra:
    //   a) wildcard '*'
    //   b) el slug de la marca (navaja, receta, etc.)
    //   c) la categoria_giro mapeada (barberia, farmacia, etc.)
    const giros = field.giros || ['*'];
    if (giros.indexOf('*') >= 0) return true;
    if (giros.indexOf(giroSlug) >= 0) return true;
    if (categoriaGiro && giros.indexOf(categoriaGiro) >= 0) return true;
    return false;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function renderField(field) {
    const id = 'vlx-fld-' + field.name;
    const label = escapeAttr(field.label || field.name);
    const giros = (field.giros || ['*']).join(',');
    const readonly = field.readonly ? ' readonly' : '';
    let input;

    switch (field.type) {
      case 'switch':
        input = `<input type="checkbox" id="${id}" name="${field.name}" class="vlx-switch"${readonly} />`;
        break;
      case 'textarea':
        input = `<textarea id="${id}" name="${field.name}"${readonly} placeholder="${label}"></textarea>`;
        break;
      case 'select': {
        const opts = (field.options || []).map(o => `<option value="${escapeAttr(o)}">${escapeAttr(o)}</option>`).join('');
        input = `<select id="${id}" name="${field.name}"${readonly}><option value="">— elegir —</option>${opts}</select>`;
        break;
      }
      case 'number':
        input = `<input type="number" id="${id}" name="${field.name}" step="any"${readonly} />`;
        break;
      case 'date':
        input = `<input type="date" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'time':
        input = `<input type="time" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'datetime':
        input = `<input type="datetime-local" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'email':
        input = `<input type="email" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'tel':
        input = `<input type="tel" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'url':
        input = `<input type="url" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'color':
        input = `<input type="color" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'password':
        input = `<input type="password" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'file':
        input = `<input type="file" id="${id}" name="${field.name}"${readonly} />`;
        break;
      case 'file_multi':
        input = `<input type="file" id="${id}" name="${field.name}" multiple${readonly} />`;
        break;
      case 'rating':
        input = `<input type="number" id="${id}" name="${field.name}" min="1" max="5" step="1"${readonly} />`;
        break;
      case 'subtable':
        input = `<div class="vlx-subtable" id="${id}" data-name="${field.name}" data-readonly="${readonly ? '1' : '0'}"><em>(sub-tabla)</em></div>`;
        break;
      case 'multi_module_switches':
        input = `<div class="vlx-multi-module-switches" id="${id}" data-name="${field.name}"></div>`;
        break;
      case 'terminology_grid':
        input = `<div class="vlx-terminology-grid" id="${id}" data-name="${field.name}"></div>`;
        break;
      default:
        input = `<input type="text" id="${id}" name="${field.name}"${readonly} />`;
    }

    return `<div class="vlx-field" data-module="${escapeAttr(field.module || 'base')}" data-giros="${escapeAttr(giros)}">` +
           `<label for="${id}">${label}${field.readonly ? ' <em>(auto)</em>' : ''}</label>` +
           input + `</div>`;
  }

  async function renderDynamicFieldsForModal(container, modalName, giroSlug) {
    if (!container || !modalName || !giroSlug) return { rendered: 0 };
    const catalog = await loadFieldsCatalog();
    if (!catalog || !catalog.modals || !catalog.modals[modalName]) {
      console.warn('[applyGiroConfig] Modal no en catalog:', modalName);
      return { rendered: 0 };
    }
    const terminologias = await loadTerminologias();
    const giroCfg = resolveGiroConfig(terminologias, giroSlug);
    const activeModules = new Set((giroCfg && giroCfg.modulos_activos) || []);
    const inactiveModules = new Set((giroCfg && giroCfg.modulos_inactivos) || []);
    const categoriaGiro = giroCfg && giroCfg.categoria_giro; // marca→giro genérico
    activeModules.add('base'); // base siempre activo

    const modal = catalog.modals[modalName];
    const sections = modal.sections || {};
    let html = '';
    let total = 0;
    let visible = 0;

    for (const sectionTitle of Object.keys(sections)) {
      const fields = sections[sectionTitle];
      const visibleFields = fields.filter(f => fieldVisibleForGiro(f, giroSlug, activeModules, inactiveModules, categoriaGiro));
      total += fields.length;
      visible += visibleFields.length;
      if (visibleFields.length === 0) continue;
      html += `<fieldset class="vlx-section" data-section="${escapeAttr(sectionTitle)}">` +
              `<legend>${escapeAttr(sectionTitle)}</legend>` +
              visibleFields.map(renderField).join('') +
              `</fieldset>`;
    }

    container.innerHTML = html;
    container.setAttribute('data-vlx-rendered-modal', modalName);
    container.setAttribute('data-vlx-rendered-giro', giroSlug);
    container.setAttribute('data-vlx-rendered-fields', String(visible));
    container.setAttribute('data-vlx-total-fields', String(total));

    console.log(`[applyGiroConfig] renderModal=${modalName} giro=${giroSlug} visible=${visible}/${total}`);
    return { rendered: visible, total: total };
  }

  // Auto-render: cada <div data-vlx-dynamic-fields="MODAL_NAME"> visible.
  async function renderAllDynamicContainers(giroSlug) {
    if (!giroSlug) return;
    const containers = document.querySelectorAll('[data-vlx-dynamic-fields]');
    const results = [];
    for (const c of containers) {
      const modal = c.getAttribute('data-vlx-dynamic-fields');
      if (!modal) continue;
      const r = await renderDynamicFieldsForModal(c, modal, giroSlug);
      results.push({ modal, ...r });
    }
    return results;
  }

  // Exponer públicamente
  window.applyGiroConfig = applyGiroConfig;
  window.listGirosDisponibles = listGirosDisponibles;
  window.getGiroConfig = getGiroConfig;
  window.resetGiroConfig = resetGiroConfig;
  window.vlxRenderDynamicFields = renderDynamicFieldsForModal;
  window.vlxRenderAllDynamicContainers = renderAllDynamicContainers;
  window.vlxLoadFieldsCatalog = loadFieldsCatalog;
  window.vlxSchemaDrivenUI = {
    apply: applyGiroConfig,
    list: listGirosDisponibles,
    get: getGiroConfig,
    reset: resetGiroConfig,
    renderModal: renderDynamicFieldsForModal,
    renderAll: renderAllDynamicContainers,
    catalog: loadFieldsCatalog,
    activeGiro: () => _activeGiroSlug,
    version: '1.1'
  };

  // Cuando applyGiroConfig se ejecute, auto-renderizar containers dinámicos
  window.addEventListener('vlx:giro-applied', function(e) {
    if (e && e.detail && e.detail.giroSlug) {
      renderAllDynamicContainers(e.detail.giroSlug).catch(err => {
        console.warn('[applyGiroConfig] renderAllDynamicContainers fail:', err.message);
      });
    }
  });

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
