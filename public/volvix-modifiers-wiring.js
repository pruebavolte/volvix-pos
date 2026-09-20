/* ==========================================================================
 * volvix-modifiers-wiring.js
 * --------------------------------------------------------------------------
 * Sistema de modificadores para productos de restaurante en Volvix POS.
 * Permite agregar/quitar ingredientes, elegir tamanos, extras y combos,
 * con pricing dinamico y UI modal selector.
 *
 * API global: window.ModifiersAPI
 *   - registerProduct(productId, config)
 *   - openModifierModal(productId, opts)
 *   - getCartLineModifiers(lineId)
 *   - calculatePrice(productId, selection)
 *   - clearSelection(lineId)
 *   - on(event, handler) / off(event, handler)
 * ========================================================================== */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- Storage
  const _registry = new Map();   // productId -> config
  const _selections = new Map(); // cartLineId -> selection
  const _listeners = new Map();  // event -> Set<fn>
  let _lineSeq = 1;

  // ---------------------------------------------------------------- Helpers
  function fmt(n) {
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + (_lineSeq++).toString(36);
  }

  function emit(event, payload) {
    const set = _listeners.get(event);
    if (!set) return;
    set.forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error('[ModifiersAPI]', event, e); }
    });
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ---------------------------------------------------------------- Defaults
  const DEFAULT_SIZES = [
    { id: 'sz_chico',    label: 'Chico',    priceDelta: -10 },
    { id: 'sz_mediano',  label: 'Mediano',  priceDelta: 0   },
    { id: 'sz_grande',   label: 'Grande',   priceDelta: 15  }
  ];

  const DEFAULT_EXTRAS = [
    { id: 'ex_queso',    label: 'Queso extra',     priceDelta: 12 },
    { id: 'ex_tocino',   label: 'Tocino',          priceDelta: 18 },
    { id: 'ex_aguacate', label: 'Aguacate',        priceDelta: 15 },
    { id: 'ex_jalapeno', label: 'Jalapenos',       priceDelta: 5  },
    { id: 'ex_doble',    label: 'Doble carne',     priceDelta: 35 }
  ];

  const DEFAULT_REMOVABLE = [
    { id: 'rm_cebolla',  label: 'Sin cebolla' },
    { id: 'rm_jitomate', label: 'Sin jitomate' },
    { id: 'rm_lechuga',  label: 'Sin lechuga' },
    { id: 'rm_pepinillo',label: 'Sin pepinillos' },
    { id: 'rm_mayo',     label: 'Sin mayonesa' }
  ];

  const DEFAULT_COMBOS = [
    { id: 'cb_solo',     label: 'Solo producto',    priceDelta: 0  },
    { id: 'cb_papas',    label: '+ Papas',          priceDelta: 25 },
    { id: 'cb_papasref', label: '+ Papas + refresco', priceDelta: 45 },
    { id: 'cb_familiar', label: 'Combo familiar',   priceDelta: 95 }
  ];

  // ---------------------------------------------------------------- Registry
  function registerProduct(productId, config) {
    if (!productId) throw new Error('registerProduct: productId requerido');
    const cfg = Object.assign({
      name: 'Producto',
      basePrice: 0,
      sizes: DEFAULT_SIZES,
      extras: DEFAULT_EXTRAS,
      removable: DEFAULT_REMOVABLE,
      combos: DEFAULT_COMBOS,
      allowMultipleExtras: true,
      maxExtras: 6,
      requireSize: true,
      requireCombo: false
    }, config || {});
    _registry.set(productId, cfg);
    emit('product:registered', { productId: productId, config: cfg });
    return cfg;
  }

  function getProduct(productId) {
    return _registry.get(productId) || null;
  }

  // ---------------------------------------------------------------- Pricing
  function calculatePrice(productId, selection) {
    const cfg = getProduct(productId);
    if (!cfg) return { total: 0, breakdown: [], error: 'producto no registrado' };
    selection = selection || {};

    let total = Number(cfg.basePrice) || 0;
    const breakdown = [{ label: cfg.name + ' (base)', amount: total }];

    // Tamano
    if (selection.sizeId) {
      const sz = (cfg.sizes || []).find(function (s) { return s.id === selection.sizeId; });
      if (sz && sz.priceDelta) {
        total += sz.priceDelta;
        breakdown.push({ label: 'Tamano: ' + sz.label, amount: sz.priceDelta });
      }
    }

    // Extras
    const extraIds = selection.extraIds || [];
    extraIds.forEach(function (eid) {
      const ex = (cfg.extras || []).find(function (e) { return e.id === eid; });
      if (ex) {
        total += ex.priceDelta || 0;
        breakdown.push({ label: '+ ' + ex.label, amount: ex.priceDelta || 0 });
      }
    });

    // Combo
    if (selection.comboId) {
      const cb = (cfg.combos || []).find(function (c) { return c.id === selection.comboId; });
      if (cb && cb.priceDelta) {
        total += cb.priceDelta;
        breakdown.push({ label: 'Combo: ' + cb.label, amount: cb.priceDelta });
      }
    }

    // Removidos (no afectan precio pero se listan)
    const removeIds = selection.removeIds || [];
    if (removeIds.length) {
      removeIds.forEach(function (rid) {
        const rm = (cfg.removable || []).find(function (r) { return r.id === rid; });
        if (rm) breakdown.push({ label: rm.label, amount: 0 });
      });
    }

    // Cantidad
    const qty = Math.max(1, Number(selection.qty || 1));
    const lineTotal = total * qty;

    return {
      total: lineTotal,
      unit: total,
      qty: qty,
      breakdown: breakdown,
      error: null
    };
  }

  // ---------------------------------------------------------------- Validation
  function validateSelection(productId, selection) {
    const cfg = getProduct(productId);
    if (!cfg) return { ok: false, reason: 'producto no registrado' };
    selection = selection || {};

    if (cfg.requireSize && !selection.sizeId) {
      return { ok: false, reason: 'Selecciona un tamano' };
    }
    if (cfg.requireCombo && !selection.comboId) {
      return { ok: false, reason: 'Selecciona un combo' };
    }
    const extras = selection.extraIds || [];
    if (cfg.maxExtras && extras.length > cfg.maxExtras) {
      return { ok: false, reason: 'Maximo ' + cfg.maxExtras + ' extras' };
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- Modal UI
  let _modalRoot = null;

  function ensureStyles() {
    if (document.getElementById('vx-modifiers-styles')) return;
    const css = '' +
      '.vx-mod-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif}' +
      '.vx-mod-modal{background:#fff;width:min(640px,94vw);max-height:90vh;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4)}' +
      '.vx-mod-head{padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}' +
      '.vx-mod-title{font-size:18px;font-weight:700;color:#111}' +
      '.vx-mod-close{background:none;border:0;font-size:22px;cursor:pointer;color:#666}' +
      '.vx-mod-body{padding:16px 20px;overflow-y:auto;flex:1}' +
      '.vx-mod-section{margin-bottom:18px}' +
      '.vx-mod-section h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#374151}' +
      '.vx-mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}' +
      '.vx-mod-chip{border:2px solid #e5e7eb;border-radius:8px;padding:10px;cursor:pointer;background:#fff;transition:all .15s;display:flex;flex-direction:column;gap:2px;font-size:13px}' +
      '.vx-mod-chip:hover{border-color:#9ca3af}' +
      '.vx-mod-chip.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}' +
      '.vx-mod-chip .vx-mod-delta{font-size:11px;color:#6b7280}' +
      '.vx-mod-chip.active .vx-mod-delta{color:#1d4ed8}' +
      '.vx-mod-foot{padding:14px 20px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;gap:12px}' +
      '.vx-mod-total{font-size:20px;font-weight:700;color:#111}' +
      '.vx-mod-qty{display:flex;align-items:center;gap:8px}' +
      '.vx-mod-qty button{width:30px;height:30px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:16px}' +
      '.vx-mod-actions{display:flex;gap:8px}' +
      '.vx-mod-btn{padding:10px 18px;border-radius:8px;border:0;cursor:pointer;font-weight:600;font-size:14px}' +
      '.vx-mod-btn-primary{background:#2563eb;color:#fff}' +
      '.vx-mod-btn-primary:hover{background:#1d4ed8}' +
      '.vx-mod-btn-secondary{background:#f3f4f6;color:#374151}' +
      '.vx-mod-error{color:#dc2626;font-size:13px;margin-right:auto}';
    const tag = document.createElement('style');
    tag.id = 'vx-modifiers-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function closeModal() {
    if (_modalRoot && _modalRoot.parentNode) {
      _modalRoot.parentNode.removeChild(_modalRoot);
    }
    _modalRoot = null;
    emit('modal:closed', {});
  }

  function renderChip(item, isActive, showDelta) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'vx-mod-chip' + (isActive ? ' active' : '');
    chip.dataset.id = item.id;
    const lbl = document.createElement('span');
    lbl.textContent = item.label;
    chip.appendChild(lbl);
    if (showDelta && typeof item.priceDelta === 'number' && item.priceDelta !== 0) {
      const d = document.createElement('span');
      d.className = 'vx-mod-delta';
      d.textContent = (item.priceDelta > 0 ? '+' : '') + fmt(item.priceDelta);
      chip.appendChild(d);
    }
    return chip;
  }

  function buildSection(title, items, selection, kind) {
    const section = document.createElement('div');
    section.className = 'vx-mod-section';
    section.dataset.kind = kind;
    const h = document.createElement('h4');
    h.textContent = title;
    section.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'vx-mod-grid';
    items.forEach(function (it) {
      let active = false;
      if (kind === 'size')   active = selection.sizeId === it.id;
      if (kind === 'combo')  active = selection.comboId === it.id;
      if (kind === 'extra')  active = (selection.extraIds || []).indexOf(it.id) >= 0;
      if (kind === 'remove') active = (selection.removeIds || []).indexOf(it.id) >= 0;
      const chip = renderChip(it, active, kind === 'size' || kind === 'combo' || kind === 'extra');
      grid.appendChild(chip);
    });
    section.appendChild(grid);
    return section;
  }

  function openModifierModal(productId, opts) {
    opts = opts || {};
    const cfg = getProduct(productId);
    if (!cfg) {
      console.warn('[ModifiersAPI] producto no registrado:', productId);
      return null;
    }
    ensureStyles();
    closeModal();

    const lineId = opts.lineId || uid('line');
    const selection = deepClone(opts.initial || _selections.get(lineId) || {
      sizeId: cfg.requireSize && cfg.sizes && cfg.sizes.length ? cfg.sizes[0].id : null,
      comboId: cfg.requireCombo && cfg.combos && cfg.combos.length ? cfg.combos[0].id : null,
      extraIds: [],
      removeIds: [],
      qty: opts.qty || 1
    });

    _modalRoot = document.createElement('div');
    _modalRoot.className = 'vx-mod-overlay';
    _modalRoot.addEventListener('click', function (e) {
      if (e.target === _modalRoot) closeModal();
    });

    const modal = document.createElement('div');
    modal.className = 'vx-mod-modal';

    // Head
    const head = document.createElement('div');
    head.className = 'vx-mod-head';
    const title = document.createElement('div');
    title.className = 'vx-mod-title';
    title.textContent = 'Personalizar: ' + cfg.name;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'vx-mod-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = closeModal;
    head.appendChild(title);
    head.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'vx-mod-body';
    if (cfg.sizes && cfg.sizes.length)     body.appendChild(buildSection('Tamano',     cfg.sizes,     selection, 'size'));
    if (cfg.combos && cfg.combos.length)   body.appendChild(buildSection('Combo',      cfg.combos,    selection, 'combo'));
    if (cfg.extras && cfg.extras.length)   body.appendChild(buildSection('Extras',     cfg.extras,    selection, 'extra'));
    if (cfg.removable && cfg.removable.length) body.appendChild(buildSection('Quitar', cfg.removable, selection, 'remove'));

    // Foot
    const foot = document.createElement('div');
    foot.className = 'vx-mod-foot';
    const totalEl = document.createElement('div');
    totalEl.className = 'vx-mod-total';
    const errEl = document.createElement('div');
    errEl.className = 'vx-mod-error';
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'vx-mod-qty';
    const minus = document.createElement('button'); minus.textContent = '-';
    const qtyVal = document.createElement('span'); qtyVal.textContent = selection.qty;
    const plus = document.createElement('button'); plus.textContent = '+';
    qtyWrap.appendChild(minus); qtyWrap.appendChild(qtyVal); qtyWrap.appendChild(plus);

    const actions = document.createElement('div');
    actions.className = 'vx-mod-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'vx-mod-btn vx-mod-btn-secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = closeModal;
    const okBtn = document.createElement('button');
    okBtn.className = 'vx-mod-btn vx-mod-btn-primary';
    okBtn.textContent = 'Agregar al carrito';
    actions.appendChild(cancelBtn); actions.appendChild(okBtn);

    foot.appendChild(errEl);
    foot.appendChild(qtyWrap);
    foot.appendChild(totalEl);
    foot.appendChild(actions);

    modal.appendChild(head); modal.appendChild(body); modal.appendChild(foot);
    _modalRoot.appendChild(modal);
    document.body.appendChild(_modalRoot);

    function refreshTotal() {
      const r = calculatePrice(productId, selection);
      totalEl.textContent = 'Total: ' + fmt(r.total);
      qtyVal.textContent = selection.qty;
    }

    function refreshActiveChips() {
      body.querySelectorAll('.vx-mod-section').forEach(function (sec) {
        const kind = sec.dataset.kind;
        sec.querySelectorAll('.vx-mod-chip').forEach(function (chip) {
          const id = chip.dataset.id;
          let active = false;
          if (kind === 'size')   active = selection.sizeId === id;
          if (kind === 'combo')  active = selection.comboId === id;
          if (kind === 'extra')  active = (selection.extraIds || []).indexOf(id) >= 0;
          if (kind === 'remove') active = (selection.removeIds || []).indexOf(id) >= 0;
          chip.classList.toggle('active', active);
        });
      });
    }

    body.addEventListener('click', function (e) {
      const chip = e.target.closest('.vx-mod-chip');
      if (!chip) return;
      const sec = chip.closest('.vx-mod-section');
      const kind = sec.dataset.kind;
      const id = chip.dataset.id;
      if (kind === 'size')  selection.sizeId  = id;
      if (kind === 'combo') selection.comboId = id;
      if (kind === 'extra') {
        selection.extraIds = selection.extraIds || [];
        const i = selection.extraIds.indexOf(id);
        if (i >= 0) selection.extraIds.splice(i, 1);
        else selection.extraIds.push(id);
      }
      if (kind === 'remove') {
        selection.removeIds = selection.removeIds || [];
        const i = selection.removeIds.indexOf(id);
        if (i >= 0) selection.removeIds.splice(i, 1);
        else selection.removeIds.push(id);
      }
      errEl.textContent = '';
      refreshActiveChips();
      refreshTotal();
      emit('selection:changed', { productId: productId, lineId: lineId, selection: deepClone(selection) });
    });

    minus.onclick = function () {
      selection.qty = Math.max(1, (selection.qty || 1) - 1);
      refreshTotal();
    };
    plus.onclick = function () {
      selection.qty = (selection.qty || 1) + 1;
      refreshTotal();
    };

    okBtn.onclick = function () {
      const v = validateSelection(productId, selection);
      if (!v.ok) { errEl.textContent = v.reason; return; }
      const price = calculatePrice(productId, selection);
      _selections.set(lineId, deepClone(selection));
      emit('cart:add', {
        lineId: lineId,
        productId: productId,
        productName: cfg.name,
        selection: deepClone(selection),
        price: price
      });
      if (typeof opts.onConfirm === 'function') {
        try { opts.onConfirm({ lineId: lineId, selection: deepClone(selection), price: price }); }
        catch (e) { console.error('[ModifiersAPI] onConfirm', e); }
      }
      closeModal();
    };

    refreshTotal();
    emit('modal:opened', { productId: productId, lineId: lineId });
    return { lineId: lineId, close: closeModal };
  }

  // ---------------------------------------------------------------- Cart helpers
  function getCartLineModifiers(lineId) {
    const sel = _selections.get(lineId);
    return sel ? deepClone(sel) : null;
  }

  function clearSelection(lineId) {
    _selections.delete(lineId);
    emit('selection:cleared', { lineId: lineId });
  }

  // ---------------------------------------------------------------- Events
  function on(event, fn) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(fn);
  }
  function off(event, fn) {
    const set = _listeners.get(event);
    if (set) set.delete(fn);
  }

  // ---------------------------------------------------------------- Auto-wire
  // Cualquier elemento con [data-product-id][data-modifiers] dispara el modal.
  function autoWire(root) {
    root = root || document;
    root.addEventListener('click', function (e) {
      const el = e.target.closest('[data-product-id][data-modifiers]');
      if (!el) return;
      e.preventDefault();
      const pid = el.getAttribute('data-product-id');
      if (!_registry.has(pid)) {
        // registro lazy desde data-attrs
        registerProduct(pid, {
          name: el.getAttribute('data-name') || pid,
          basePrice: parseFloat(el.getAttribute('data-price') || '0')
        });
      }
      openModifierModal(pid, {});
    });
  }

  // ------------------------------------------------------- T1.3 Modificadores reales (estilo Loyverse)
  // Lee los modificadores REALES de GET /api/products/modifiers (por sku) y abre un
  // dialogo simple: grupos con sus opciones, obligatorio/una o varias, precio extra,
  // cantidad y comentario. Flag: module.modifiers.
  const _real = { cache: new Map(), fetcher: null, TTL: 300000, TIMEOUT: 2500 };

  function realEnabled() {
    try {
      if (global.VolvixFeatures && typeof global.VolvixFeatures.has === 'function') {
        return global.VolvixFeatures.has('module.modifiers') !== false;
      }
    } catch (e) {}
    return true;
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function skuOf(p) { return String((p && (p.sku || p.code || p.id)) || '').trim(); }
  function fmtMoney(n) { return '$' + round2(n).toFixed(2); }

  // filas de BD -> grupos [{label, required, multi, options:[{key,label,price_delta}]}]
  function groupize(rows) {
    const map = new Map();
    (rows || []).forEach(function (r) {
      if (!r || r.active === false || !(r.modifier_label || r.label)) return;
      const label = String(r.group_label || r.group || 'Opciones');
      if (!map.has(label)) map.set(label, { label: label, required: false, multi: false, options: [] });
      const g = map.get(label);
      if (r.required) g.required = true;
      if (r.multiselect !== false) g.multi = true;
      g.options.push({
        key: String(r.modifier_key || r.key || (g.options.length + 1)),
        label: String(r.modifier_label || r.label),
        price_delta: round2(r.price_delta || r.delta || 0)
      });
    });
    return Array.from(map.values());
  }

  // precio de la linea = precio base + suma de price_delta de los modificadores elegidos
  function linePrice(base, mods) {
    return round2((Number(base) || 0) + (mods || []).reduce(function (s, m) { return s + (Number(m && m.price_delta) || 0); }, 0));
  }
  // llave de linea: mismo producto con distintos modificadores/nota = linea distinta
  function lineKey(item) {
    const it = item || {};
    const mods = (it.modifiers || []).map(function (m) { return String((m && m.label) || m || ''); }).sort().join(',');
    return String(it.code || it.id || it.name || '') + '|' + mods + '|' + String(it.note || '');
  }
  // texto por renglon: "+ Arroz (+$5.00)", "Nota: ..."
  function describe(item) {
    const out = [];
    ((item && item.modifiers) || []).forEach(function (m) {
      const d = Number(m && m.price_delta) || 0;
      out.push('+ ' + String((m && m.label) || m) + (d ? ' (' + (d > 0 ? '+' : '-') + fmtMoney(Math.abs(d)) + ')' : ''));
    });
    if (item && item.note) out.push('Nota: ' + item.note);
    return out;
  }

  function setFetcher(fn) { _real.fetcher = fn; }
  function fetchGroups(key) {
    const hit = _real.cache.get(key);
    if (hit && (Date.now() - hit.ts) < _real.TTL) return Promise.resolve(hit.groups);
    // #6: si falla (red/timeout) NO se falla abierto en silencio: se usa la cache vencida si existe y se marca .failed
    const stale = hit ? hit.groups : null;
    const fail = function () { const g = stale ? stale.slice() : []; g.failed = true; g.stale = !!stale; return g; };
    const f = _real.fetcher || (typeof fetch === 'function' ? fetch.bind(global) : null);
    if (!f) return Promise.resolve(fail());
    const req = Promise.resolve(f('/api/products/modifiers?sku=' + encodeURIComponent(key)))
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return fail();
        const groups = groupize(j.modifiers || []);
        _real.cache.set(key, { ts: Date.now(), groups: groups });
        return groups;
      })
      .catch(fail);
    const timeout = new Promise(function (res) { setTimeout(function () { res(fail()); }, _real.TIMEOUT); });
    return Promise.race([req, timeout]);
  }
  function invalidate(key) { if (key) _real.cache.delete(String(key)); else _real.cache.clear(); }

  function applySelection(p, res) {
    const base = Number(p.price) || 0;
    const mods = (res && res.modifiers) || [];
    return Object.assign({}, p, {
      _modsDone: true,
      base_price: base,
      price: linePrice(base, mods),
      modifiers: mods,
      note: (res && res.note) || '',
      qty: (Number(p.qty) || 1) * ((res && res.qty) || 1)
    });
  }

  // Devuelve true si tomo el control (async); false si el llamador debe agregar directo (sync).
  function intercept(p, cont) {
    if (!p || p._modsDone || (p.modifiers && p.modifiers.length) || !realEnabled()) return false;
    const key = skuOf(p);
    if (!key) return false;
    const hit = _real.cache.get(key);
    const fresh = hit && (Date.now() - hit.ts) < _real.TTL;
    if (fresh && !hit.groups.length) return false;
    const go = function (groups) {
      if (groups.failed) {
        try { if (typeof global.showToast === 'function') global.showToast(groups.stale ? 'Sin conexion: modificadores guardados (pueden estar desactualizados)' : 'No se pudieron cargar los modificadores: revisa el producto antes de cobrar', 'error'); } catch (_) {}
      }
      if (!groups.length) { cont(Object.assign({}, p, { _modsDone: true })); return; }
      openRealDialog(p, groups, function (res) { if (res) cont(applySelection(p, res)); });
    };
    if (fresh) go(hit.groups); else fetchGroups(key).then(go);
    return true;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function openRealDialog(p, groups, done) {
    if (typeof document === 'undefined') { done(null); return; }
    const ov = document.createElement('div');
    ov.id = 'vlx-mod-dialog'; ov.setAttribute('data-vlx-keep', '1');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:12px;';
    let html = '<div style="background:#fff;color:#1C1917;border-radius:12px;width:420px;max-width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;">'
      + '<div style="padding:14px 16px;border-bottom:1px solid #E7E5E4;font-weight:700;font-size:16px;">' + esc(p.name || 'Producto') + ' <span id="vlx-mod-total" style="float:right;color:#16a34a;"></span></div>'
      + '<div style="padding:8px 16px;overflow:auto;flex:1;">';
    groups.forEach(function (g, gi) {
      html += '<div class="vlx-mod-group" data-g="' + gi + '" style="margin:10px 0;"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">' + esc(g.label)
        + ' <span style="font-weight:400;color:#78716C;font-size:11px;">' + (g.required ? 'obligatorio' : 'opcional') + ' - ' + (g.multi ? 'una o varias' : 'elige una') + '</span></div>';
      g.options.forEach(function (o, oi) {
        html += '<label style="display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid #F5F5F4;font-size:14px;cursor:pointer;">'
          + '<input type="' + (g.multi ? 'checkbox' : 'radio') + '" name="vlxg' + gi + '" data-g="' + gi + '" data-o="' + oi + '" style="width:20px;height:20px;">'
          + '<span style="flex:1;">' + esc(o.label) + '</span>'
          + (o.price_delta ? '<span style="color:#57534E;">' + (o.price_delta > 0 ? '+' : '-') + fmtMoney(Math.abs(o.price_delta)) + '</span>' : '') + '</label>';
      });
      html += '</div>';
    });
    html += '<div style="margin:10px 0;"><input id="vlx-mod-note" type="text" maxlength="120" placeholder="Comentario (ej. sin cebolla)" style="width:100%;padding:10px;border:1px solid #E7E5E4;border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin:8px 0 4px;">'
      + '<button type="button" id="vlx-mod-minus" style="width:40px;height:40px;border-radius:50%;border:1px solid #D6D3D1;background:#fff;font-size:20px;">-</button>'
      + '<b id="vlx-mod-qty" style="font-size:18px;min-width:24px;text-align:center;">1</b>'
      + '<button type="button" id="vlx-mod-plus" style="width:40px;height:40px;border-radius:50%;border:1px solid #D6D3D1;background:#fff;font-size:20px;">+</button></div>'
      + '<div id="vlx-mod-err" style="color:#dc2626;font-size:12px;min-height:16px;text-align:center;"></div></div>'
      + '<div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid #E7E5E4;">'
      + '<button type="button" id="vlx-mod-cancel" style="flex:1;padding:12px;border:1px solid #D6D3D1;background:#fff;border-radius:8px;font-size:15px;">Cancelar</button>'
      + '<button type="button" id="vlx-mod-ok" style="flex:1;padding:12px;border:0;background:#16a34a;color:#fff;border-radius:8px;font-size:15px;font-weight:700;">Agregar</button></div></div>';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    let qty = 1;
    const $ = function (id) { return ov.querySelector('#' + id); };
    function selected() {
      const mods = [];
      ov.querySelectorAll('input[data-g]:checked').forEach(function (el) {
        const o = groups[+el.getAttribute('data-g')].options[+el.getAttribute('data-o')];
        mods.push({ label: o.label, price_delta: o.price_delta, group: groups[+el.getAttribute('data-g')].label });
      });
      return mods;
    }
    function refresh() {
      $('vlx-mod-qty').textContent = String(qty);
      $('vlx-mod-total').textContent = fmtMoney(linePrice(p.price, selected()) * qty);
    }
    function close(res) { if (ov.parentNode) ov.parentNode.removeChild(ov); done(res); }
    ov.addEventListener('change', refresh);
    $('vlx-mod-minus').onclick = function () { if (qty > 1) { qty--; refresh(); } };
    $('vlx-mod-plus').onclick = function () { if (qty < 99) { qty++; refresh(); } };
    $('vlx-mod-cancel').onclick = function () { close(null); };
    $('vlx-mod-ok').onclick = function () {
      for (let gi = 0; gi < groups.length; gi++) {
        if (groups[gi].required && !ov.querySelector('input[data-g="' + gi + '"]:checked')) {
          $('vlx-mod-err').textContent = 'Elige una opcion en "' + groups[gi].label + '"';
          return;
        }
      }
      close({ modifiers: selected().map(function (m) { return { label: m.label, price_delta: m.price_delta }; }), note: $('vlx-mod-note').value.trim(), qty: qty });
    };
    refresh();
  }

  // ---- Back-office: editor de grupos/opciones dentro de la ficha de producto
  function rowsFromGroups(groups) {
    const rows = [];
    (groups || []).forEach(function (g) {
      (g.options || []).forEach(function (o) {
        if (!o.label) return;
        rows.push({
          modifier_key: String(o.key || (g.label + '-' + o.label)).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
          modifier_label: o.label, group_label: g.label || 'Opciones',
          price_delta: Number(o.price_delta) || 0, required: !!g.required, multiselect: !!g.multi
        });
      });
    });
    return rows;
  }
  async function loadGroups(sku) {
    invalidate(sku);
    const groups = await fetchGroups(String(sku));
    return groups.map(function (g) { return JSON.parse(JSON.stringify(g)); });
  }
  async function saveGroups(sku, groups) {
    const f = _real.fetcher || fetch.bind(global);
    const r = await f('/api/products/modifiers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: String(sku), modifiers: rowsFromGroups(groups) })
    });
    invalidate(sku);
    return !!(r && r.ok);
  }
  // Pinta el editor en `host`; devuelve {read()} para leer los grupos actuales.
  function mountEditor(host, groups) {
    const state = JSON.parse(JSON.stringify(groups || []));
    const inp = 'padding:6px;border:1px solid #D6D3D1;border-radius:6px;';
    function draw() {
      let h = '<div style="font-size:12px;color:#78716C;margin-bottom:6px;">Ej. grupo "Guarnicion" con opciones Arroz, Pure... Precio extra en pesos.</div>';
      state.forEach(function (g, gi) {
        h += '<div style="border:1px solid #E7E5E4;border-radius:8px;padding:8px;margin-bottom:8px;">'
          + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><input data-k="glabel" data-g="' + gi + '" value="' + esc(g.label) + '" placeholder="Nombre del grupo" style="flex:1;min-width:120px;' + inp + '">'
          + '<label style="font-size:12px;"><input type="checkbox" data-k="req" data-g="' + gi + '"' + (g.required ? ' checked' : '') + '> Obligatorio</label>'
          + '<select data-k="multi" data-g="' + gi + '" style="' + inp + '"><option value="0"' + (g.multi ? '' : ' selected') + '>Elegir una</option><option value="1"' + (g.multi ? ' selected' : '') + '>Elegir varias</option></select>'
          + '<button type="button" data-a="delg" data-g="' + gi + '" style="border:0;background:none;color:#dc2626;font-size:18px;">&times;</button></div>';
        g.options.forEach(function (o, oi) {
          h += '<div style="display:flex;gap:6px;margin-top:6px;"><input data-k="olabel" data-g="' + gi + '" data-o="' + oi + '" value="' + esc(o.label) + '" placeholder="Opcion" style="flex:1;' + inp + '">'
            + '<input data-k="odelta" data-g="' + gi + '" data-o="' + oi + '" type="number" step="0.01" value="' + (Number(o.price_delta) || 0) + '" title="Precio extra" style="width:80px;' + inp + '">'
            + '<button type="button" data-a="delo" data-g="' + gi + '" data-o="' + oi + '" style="border:0;background:none;color:#dc2626;font-size:18px;">&times;</button></div>';
        });
        h += '<button type="button" data-a="addo" data-g="' + gi + '" style="margin-top:6px;border:1px dashed #A8A29E;background:#fff;border-radius:6px;padding:4px 10px;font-size:12px;">+ Opcion</button></div>';
      });
      h += '<button type="button" data-a="addg" style="border:1px dashed #A8A29E;background:#fff;border-radius:6px;padding:6px 12px;font-size:13px;">+ Grupo de modificadores</button>';
      host.innerHTML = h;
    }
    function sync() {
      host.querySelectorAll('[data-k]').forEach(function (el) {
        const g = state[+el.getAttribute('data-g')]; if (!g) return;
        const k = el.getAttribute('data-k'), o = g.options[+el.getAttribute('data-o')];
        if (k === 'glabel') g.label = el.value; else if (k === 'req') g.required = el.checked;
        else if (k === 'multi') g.multi = el.value === '1';
        else if (o && k === 'olabel') o.label = el.value; else if (o && k === 'odelta') o.price_delta = Number(el.value) || 0;
      });
    }
    host.onclick = function (e) {
      const b = e.target.closest('[data-a]'); if (!b) return;
      sync();
      const a = b.getAttribute('data-a'), gi = +b.getAttribute('data-g'), oi = +b.getAttribute('data-o');
      if (a === 'addg') state.push({ label: '', required: false, multi: false, options: [{ label: '', price_delta: 0 }] });
      else if (a === 'delg') state.splice(gi, 1);
      else if (a === 'addo') state[gi].options.push({ label: '', price_delta: 0 });
      else if (a === 'delo') state[gi].options.splice(oi, 1);
      draw();
    };
    draw();
    return { read: function () { sync(); return state.filter(function (g) { return g.label && g.options.some(function (o) { return o.label; }); }); } };
  }

  const real = {
    setFetcher: setFetcher, fetchGroups: fetchGroups, invalidate: invalidate, groupize: groupize,
    linePrice: linePrice, lineKey: lineKey, describe: describe, applySelection: applySelection,
    intercept: intercept, openDialog: openRealDialog, rowsFromGroups: rowsFromGroups,
    loadGroups: loadGroups, saveGroups: saveGroups, mountEditor: mountEditor, isEnabled: realEnabled
  };

  // ---------------------------------------------------------------- Expose
  const ModifiersAPI = {
    registerProduct: registerProduct,
    getProduct: getProduct,
    openModifierModal: openModifierModal,
    calculatePrice: calculatePrice,
    validateSelection: validateSelection,
    getCartLineModifiers: getCartLineModifiers,
    clearSelection: clearSelection,
    closeModal: closeModal,
    autoWire: autoWire,
    on: on,
    off: off,
    DEFAULT_SIZES: DEFAULT_SIZES,
    DEFAULT_EXTRAS: DEFAULT_EXTRAS,
    DEFAULT_REMOVABLE: DEFAULT_REMOVABLE,
    DEFAULT_COMBOS: DEFAULT_COMBOS,
    real: real,
    version: '1.1.0'
  };

  global.ModifiersAPI = ModifiersAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ModifiersAPI;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { autoWire(document); });
    } else {
      autoWire(document);
    }
  }
})(typeof window !== 'undefined' ? window : this);
