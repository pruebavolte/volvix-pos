/* ============================================================================
 * volvix-tags-wiring.js
 * Sistema de Tags (Etiquetas) para Volvix POS
 * --------------------------------------------------------------------------
 * Funcionalidad:
 *  - Etiquetar productos / clientes / ventas
 *  - Color coding por tag
 *  - Smart tags: reglas auto que asignan tags segun condiciones
 *  - Filtrado por tag
 *  - Tag cloud visual (frecuencia + color)
 *  - API publica: window.TagsAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------
  var LS_TAGS      = 'volvix.tags.catalog';      // {name:{color,desc,createdAt}}
  var LS_BINDINGS  = 'volvix.tags.bindings';     // {entityType:{entityId:[tagNames]}}
  var LS_RULES     = 'volvix.tags.smartRules';   // [{id,name,entityType,when,tag,enabled}]
  var EVT          = 'volvix:tags:changed';

  function _read(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch (e) { return def; }
  }
  function _write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
  }
  function _emit(detail) {
    try { document.dispatchEvent(new CustomEvent(EVT, { detail: detail })); } catch (e) {}
  }
  function _uid() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function _slug(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
  }

  // ---------------------------------------------------------------------------
  // Color palette (Volvix-friendly)
  // ---------------------------------------------------------------------------
  var PALETTE = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#34495e','#fd79a8','#00b894',
    '#6c5ce7','#fab1a0','#55efc4','#ffeaa7','#74b9ff'
  ];
  function _autoColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  // ---------------------------------------------------------------------------
  // Tag catalog CRUD
  // ---------------------------------------------------------------------------
  function getCatalog() { return _read(LS_TAGS, {}); }
  function saveCatalog(c) { _write(LS_TAGS, c); }

  function createTag(name, color, desc) {
    if (!name) return null;
    var key = _slug(name);
    var c = getCatalog();
    if (!c[key]) {
      c[key] = {
        label: name,
        color: color || _autoColor(key),
        desc:  desc || '',
        createdAt: Date.now()
      };
      saveCatalog(c);
      _emit({ action: 'tagCreated', tag: key });
    }
    return key;
  }

  function deleteTag(name) {
    var key = _slug(name);
    var c   = getCatalog();
    if (!c[key]) return false;
    delete c[key];
    saveCatalog(c);
    // limpiar bindings
    var b = getBindings();
    Object.keys(b).forEach(function (et) {
      Object.keys(b[et]).forEach(function (id) {
        b[et][id] = (b[et][id] || []).filter(function (t) { return t !== key; });
      });
    });
    saveBindings(b);
    _emit({ action: 'tagDeleted', tag: key });
    return true;
  }

  function updateTag(name, patch) {
    var key = _slug(name);
    var c   = getCatalog();
    if (!c[key]) return false;
    Object.assign(c[key], patch || {});
    saveCatalog(c);
    _emit({ action: 'tagUpdated', tag: key });
    return true;
  }

  function listTags() {
    var c = getCatalog();
    return Object.keys(c).map(function (k) {
      return Object.assign({ key: k }, c[k]);
    });
  }

  // ---------------------------------------------------------------------------
  // Bindings: entity <-> tags
  // ---------------------------------------------------------------------------
  function getBindings() { return _read(LS_BINDINGS, {}); }
  function saveBindings(b) { _write(LS_BINDINGS, b); }

  function _normEntity(entity) {
    // entity puede ser {type:'product', id:'P-1'} o string 'product:P-1'
    if (typeof entity === 'string') {
      var parts = entity.split(':');
      return { type: parts[0], id: parts.slice(1).join(':') };
    }
    return { type: entity.type, id: String(entity.id) };
  }

  function addTag(entity, tag) {
    var e = _normEntity(entity);
    if (!e.type || !e.id || !tag) return false;
    var key = _slug(tag);
    if (!getCatalog()[key]) createTag(tag);
    var b = getBindings();
    b[e.type] = b[e.type] || {};
    b[e.type][e.id] = b[e.type][e.id] || [];
    if (b[e.type][e.id].indexOf(key) === -1) {
      b[e.type][e.id].push(key);
      saveBindings(b);
      _emit({ action: 'tagAdded', entity: e, tag: key });
    }
    return true;
  }

  function removeTag(entity, tag) {
    var e = _normEntity(entity);
    var key = _slug(tag);
    var b = getBindings();
    if (!b[e.type] || !b[e.type][e.id]) return false;
    var prev = b[e.type][e.id].length;
    b[e.type][e.id] = b[e.type][e.id].filter(function (t) { return t !== key; });
    if (b[e.type][e.id].length !== prev) {
      saveBindings(b);
      _emit({ action: 'tagRemoved', entity: e, tag: key });
      return true;
    }
    return false;
  }

  function getTagsOf(entity) {
    var e = _normEntity(entity);
    var b = getBindings();
    return ((b[e.type] || {})[e.id] || []).slice();
  }

  function listByTag(tag, entityType) {
    var key = _slug(tag);
    var b   = getBindings();
    var out = [];
    var types = entityType ? [entityType] : Object.keys(b);
    types.forEach(function (et) {
      Object.keys(b[et] || {}).forEach(function (id) {
        if ((b[et][id] || []).indexOf(key) !== -1) {
          out.push({ type: et, id: id });
        }
      });
    });
    return out;
  }

  function filterEntities(entities, opts) {
    // entities: [{type,id,...}]; opts: {anyOf:[], allOf:[], noneOf:[]}
    opts = opts || {};
    var any  = (opts.anyOf  || []).map(_slug);
    var all  = (opts.allOf  || []).map(_slug);
    var none = (opts.noneOf || []).map(_slug);
    return entities.filter(function (en) {
      var tgs = getTagsOf(en);
      if (any.length  && !any.some(function (t)  { return tgs.indexOf(t) !== -1; })) return false;
      if (all.length  && !all.every(function (t) { return tgs.indexOf(t) !== -1; })) return false;
      if (none.length &&  none.some(function (t) { return tgs.indexOf(t) !== -1; })) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Smart Rules
  // ---------------------------------------------------------------------------
  // Una regla:
  //   { id, name, entityType, when:{field, op, value}, tag, enabled }
  // ops: 'eq','ne','gt','gte','lt','lte','contains','startsWith','regex','in'
  // ---------------------------------------------------------------------------
  function getRules() { return _read(LS_RULES, []); }
  function saveRules(r) { _write(LS_RULES, r); }

  function addRule(rule) {
    var rules = getRules();
    var r = Object.assign({
      id: _uid(), enabled: true, createdAt: Date.now()
    }, rule);
    if (!r.tag || !r.entityType || !r.when) return null;
    createTag(r.tag);
    rules.push(r);
    saveRules(rules);
    _emit({ action: 'ruleAdded', rule: r });
    return r;
  }

  function removeRule(id) {
    var rules = getRules().filter(function (r) { return r.id !== id; });
    saveRules(rules);
    _emit({ action: 'ruleRemoved', id: id });
  }

  function toggleRule(id, enabled) {
    var rules = getRules();
    rules.forEach(function (r) {
      if (r.id === id) r.enabled = (enabled == null) ? !r.enabled : !!enabled;
    });
    saveRules(rules);
    _emit({ action: 'ruleToggled', id: id });
  }

  function _getField(obj, path) {
    return path.split('.').reduce(function (a, k) {
      return (a == null) ? undefined : a[k];
    }, obj);
  }

  function _matchOp(actual, op, expected) {
    switch (op) {
      case 'eq':         return actual == expected;
      case 'ne':         return actual != expected;
      case 'gt':         return Number(actual) >  Number(expected);
      case 'gte':        return Number(actual) >= Number(expected);
      case 'lt':         return Number(actual) <  Number(expected);
      case 'lte':        return Number(actual) <= Number(expected);
      case 'contains':   return String(actual || '').toLowerCase().indexOf(String(expected).toLowerCase()) !== -1;
      case 'startsWith': return String(actual || '').toLowerCase().indexOf(String(expected).toLowerCase()) === 0;
      case 'regex':      try { return new RegExp(expected, 'i').test(String(actual || '')); } catch (e) { return false; }
      case 'in':         return Array.isArray(expected) && expected.indexOf(actual) !== -1;
      default:           return false;
    }
  }

  function applyRules(entityType, items) {
    // items: arreglo de objetos con {id, ...campos}
    var rules = getRules().filter(function (r) {
      return r.enabled && r.entityType === entityType;
    });
    if (!rules.length || !Array.isArray(items)) return 0;
    var hits = 0;
    items.forEach(function (it) {
      rules.forEach(function (r) {
        var v = _getField(it, r.when.field);
        if (_matchOp(v, r.when.op, r.when.value)) {
          if (addTag({ type: entityType, id: it.id }, r.tag)) hits++;
        }
      });
    });
    return hits;
  }

  // Reglas por defecto utiles para POS
  function seedDefaultRules() {
    if (getRules().length) return;
    addRule({ name: 'VIP por compras > 5000', entityType: 'customer',
             when: { field: 'totalSpent', op: 'gte', value: 5000 }, tag: 'VIP' });
    addRule({ name: 'Stock bajo',             entityType: 'product',
             when: { field: 'stock', op: 'lte', value: 5 },         tag: 'stock-bajo' });
    addRule({ name: 'Producto premium',       entityType: 'product',
             when: { field: 'price', op: 'gte', value: 1000 },      tag: 'premium' });
    addRule({ name: 'Venta grande',           entityType: 'sale',
             when: { field: 'total', op: 'gte', value: 2000 },      tag: 'venta-grande' });
    addRule({ name: 'Cliente nuevo',          entityType: 'customer',
             when: { field: 'visits', op: 'lte', value: 1 },        tag: 'nuevo' });
  }

  // ---------------------------------------------------------------------------
  // Tag cloud (frecuencias)
  // ---------------------------------------------------------------------------
  function tagCloud(entityType) {
    var b = getBindings();
    var counts = {};
    var types = entityType ? [entityType] : Object.keys(b);
    types.forEach(function (et) {
      Object.keys(b[et] || {}).forEach(function (id) {
        (b[et][id] || []).forEach(function (t) {
          counts[t] = (counts[t] || 0) + 1;
        });
      });
    });
    var cat = getCatalog();
    var max = Math.max(1, Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }).concat([1])));
    return Object.keys(counts).map(function (k) {
      var rel = counts[k] / max;
      return {
        key:   k,
        label: (cat[k] && cat[k].label) || k,
        color: (cat[k] && cat[k].color) || _autoColor(k),
        count: counts[k],
        weight: rel,
        fontSize: (0.8 + rel * 1.6).toFixed(2) + 'em'
      };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  // ---------------------------------------------------------------------------
  // Render helpers (UI opcional, no obligatorio)
  // ---------------------------------------------------------------------------
  function renderTagPill(tagKey) {
    var c   = getCatalog()[tagKey] || {};
    var col = c.color || _autoColor(tagKey);
    var lbl = c.label || tagKey;
    return '<span class="vx-tag-pill" data-tag="' + tagKey + '" style="' +
           'display:inline-block;padding:2px 8px;margin:2px;border-radius:10px;' +
           'background:' + col + ';color:#fff;font-size:11px;font-weight:600;' +
           'box-shadow:0 1px 2px rgba(0,0,0,.15);">' + lbl + '</span>';
  }

  function renderEntityTags(entity) {
    return getTagsOf(entity).map(renderTagPill).join('');
  }

  function renderTagCloud(container, entityType) {
    var el = (typeof container === 'string')
      ? document.querySelector(container) : container;
    if (!el) return;
    var cloud = tagCloud(entityType);
    el.innerHTML = '<div class="vx-tag-cloud" style="line-height:2.4;text-align:center;padding:10px;">' +
      cloud.map(function (t) {
        return '<span class="vx-tag-cloud-item" data-tag="' + t.key + '" style="' +
               'display:inline-block;margin:4px 6px;padding:4px 12px;border-radius:20px;' +
               'background:' + t.color + ';color:#fff;cursor:pointer;font-weight:600;' +
               'font-size:' + t.fontSize + ';">' + t.label +
               '<small style="opacity:.8;margin-left:6px;">' + t.count + '</small></span>';
      }).join('') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Wiring: hook a eventos POS si existen
  // ---------------------------------------------------------------------------
  function wireToPOS() {
    document.addEventListener('volvix:sale:completed', function (ev) {
      var sale = (ev && ev.detail) || {};
      if (sale.id) applyRules('sale', [sale]);
      if (sale.customer && sale.customer.id) applyRules('customer', [sale.customer]);
      if (Array.isArray(sale.items)) applyRules('product', sale.items);
    });
    document.addEventListener('volvix:product:updated', function (ev) {
      var p = (ev && ev.detail) || {};
      if (p.id) applyRules('product', [p]);
    });
    document.addEventListener('volvix:customer:updated', function (ev) {
      var c = (ev && ev.detail) || {};
      if (c.id) applyRules('customer', [c]);
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var TagsAPI = {
    // catalog
    createTag: createTag,
    deleteTag: deleteTag,
    updateTag: updateTag,
    listTags:  listTags,
    // bindings
    addTag:    addTag,
    removeTag: removeTag,
    getTagsOf: getTagsOf,
    listByTag: listByTag,
    filter:    filterEntities,
    // smart rules
    addRule:    addRule,
    removeRule: removeRule,
    toggleRule: toggleRule,
    listRules:  getRules,
    applyRules: applyRules,
    seedDefaultRules: seedDefaultRules,
    // cloud
    tagCloud:        tagCloud,
    renderTagCloud:  renderTagCloud,
    renderTagPill:   renderTagPill,
    renderEntityTags:renderEntityTags,
    // util
    EVENT: EVT,
    _wire: wireToPOS
  };

  global.TagsAPI = TagsAPI;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      seedDefaultRules(); wireToPOS();
    });
  } else {
    seedDefaultRules(); wireToPOS();
  }

  console.log('[Volvix Tags] sistema listo. window.TagsAPI disponible.');
})(window);
