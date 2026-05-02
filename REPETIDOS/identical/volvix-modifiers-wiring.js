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
    version: '1.0.0'
  };

  global.ModifiersAPI = ModifiersAPI;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { autoWire(document); });
    } else {
      autoWire(document);
    }
  }
})(typeof window !== 'undefined' ? window : this);
