/**
 * volvix-tables-wiring.js
 * Sistema de mesas para restaurante Volvix POS
 * - Floor plan visual con drag & drop
 * - Estados: free / ocupada / reserva / sucia / bloqueada
 * - Asignar comanda, transferir mesa, dividir cuenta
 * - Persistencia en localStorage + sync opcional Supabase
 *
 * API pública: window.TablesAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix.tables.v1';
  const STATES = Object.freeze({
    FREE: 'free',
    OCUPADA: 'ocupada',
    RESERVA: 'reserva',
    SUCIA: 'sucia',
    BLOQUEADA: 'bloqueada'
  });

  const STATE_COLORS = {
    free:      '#22c55e',
    ocupada:   '#ef4444',
    reserva:   '#f59e0b',
    sucia:     '#94a3b8',
    bloqueada: '#1f2937'
  };

  const STATE_LABELS = {
    free:      'Libre',
    ocupada:   'Ocupada',
    reserva:   'Reservada',
    sucia:     'Sucia',
    bloqueada: 'Bloqueada'
  };

  const DEFAULT_LAYOUT = {
    width: 1200,
    height: 700,
    gridSize: 20,
    zones: [
      { id: 'salon',    name: 'Salón Principal', color: '#fef3c7' },
      { id: 'terraza',  name: 'Terraza',         color: '#dbeafe' },
      { id: 'privado',  name: 'Privado',         color: '#fce7f3' },
      { id: 'barra',    name: 'Barra',           color: '#e9d5ff' }
    ],
    tables: []
  };

  // ─────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────
  let _layout = null;
  let _container = null;
  let _selectedId = null;
  let _draggingId = null;
  let _dragOffset = { x: 0, y: 0 };
  let _editMode = false;
  const _listeners = {};

  // ─────────────────────────────────────────────────────────────
  // EVENT BUS
  // ─────────────────────────────────────────────────────────────
  function on(evt, fn) {
    (_listeners[evt] = _listeners[evt] || []).push(fn);
  }
  function off(evt, fn) {
    if (!_listeners[evt]) return;
    _listeners[evt] = _listeners[evt].filter(f => f !== fn);
  }
  function emit(evt, payload) {
    (_listeners[evt] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error('TablesAPI listener', evt, e); }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PERSISTENCIA
  // ─────────────────────────────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _layout = JSON.parse(raw);
      } else {
        _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        seedDefaultTables();
        save();
      }
    } catch (e) {
      console.warn('TablesAPI load fallback', e);
      _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
      seedDefaultTables();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_layout));
      emit('saved', _layout);
    } catch (e) {
      console.error('TablesAPI save', e);
    }
  }

  function seedDefaultTables() {
    const zones = ['salon', 'salon', 'salon', 'salon', 'terraza', 'terraza', 'privado', 'barra'];
    for (let i = 0; i < 12; i++) {
      _layout.tables.push({
        id: 'mesa-' + (i + 1),
        number: i + 1,
        zone: zones[i % zones.length],
        x: 80 + (i % 4) * 220,
        y: 80 + Math.floor(i / 4) * 180,
        w: 120,
        h: 120,
        shape: i % 3 === 0 ? 'circle' : 'rect',
        capacity: 4,
        state: STATES.FREE,
        order: null,
        reservation: null,
        openedAt: null,
        notes: ''
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CRUD MESAS
  // ─────────────────────────────────────────────────────────────
  function uid() {
    return 'mesa-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getTable(id) {
    return _layout.tables.find(t => t.id === id) || null;
  }

  function listTables(filter) {
    if (!filter) return _layout.tables.slice();
    return _layout.tables.filter(t => {
      if (filter.zone && t.zone !== filter.zone) return false;
      if (filter.state && t.state !== filter.state) return false;
      return true;
    });
  }

  function addTable(data) {
    const t = Object.assign({
      id: uid(),
      number: _layout.tables.length + 1,
      zone: _layout.zones[0].id,
      x: 100, y: 100, w: 120, h: 120,
      shape: 'rect',
      capacity: 4,
      state: STATES.FREE,
      order: null,
      reservation: null,
      openedAt: null,
      notes: ''
    }, data || {});
    _layout.tables.push(t);
    save();
    render();
    emit('table:added', t);
    return t;
  }

  function updateTable(id, patch) {
    const t = getTable(id);
    if (!t) return null;
    Object.assign(t, patch);
    save();
    render();
    emit('table:updated', t);
    return t;
  }

  function removeTable(id) {
    const idx = _layout.tables.findIndex(t => t.id === id);
    if (idx < 0) return false;
    const [removed] = _layout.tables.splice(idx, 1);
    save();
    render();
    emit('table:removed', removed);
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // ESTADOS
  // ─────────────────────────────────────────────────────────────
  function setState(id, state) {
    if (!Object.values(STATES).includes(state)) {
      throw new Error('Estado inválido: ' + state);
    }
    return updateTable(id, { state });
  }

  function freeTable(id) {
    return updateTable(id, {
      state: STATES.SUCIA,
      order: null,
      openedAt: null
    });
  }

  function cleanTable(id) {
    return updateTable(id, { state: STATES.FREE });
  }

  // ─────────────────────────────────────────────────────────────
  // COMANDAS
  // ─────────────────────────────────────────────────────────────
  function assignOrder(tableId, order) {
    const t = getTable(tableId);
    if (!t) throw new Error('Mesa no existe: ' + tableId);
    if (t.state === STATES.OCUPADA && t.order && t.order.id !== (order && order.id)) {
      throw new Error('Mesa ya tiene comanda activa. Use mergeOrder o transfer.');
    }
    const ord = Object.assign({
      id: 'ord-' + Date.now().toString(36),
      items: [],
      total: 0,
      diners: t.capacity,
      waiter: null,
      createdAt: new Date().toISOString()
    }, order || {});
    updateTable(tableId, {
      state: STATES.OCUPADA,
      order: ord,
      openedAt: ord.createdAt
    });
    emit('order:assigned', { tableId, order: ord });
    return ord;
  }

  function addItem(tableId, item) {
    const t = getTable(tableId);
    if (!t || !t.order) throw new Error('Mesa sin comanda');
    const it = Object.assign({
      id: 'it-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      qty: 1,
      price: 0,
      name: 'Item',
      notes: ''
    }, item || {});
    t.order.items.push(it);
    t.order.total = recalcTotal(t.order);
    save();
    render();
    emit('item:added', { tableId, item: it });
    return it;
  }

  function removeItem(tableId, itemId) {
    const t = getTable(tableId);
    if (!t || !t.order) return false;
    const before = t.order.items.length;
    t.order.items = t.order.items.filter(i => i.id !== itemId);
    if (t.order.items.length === before) return false;
    t.order.total = recalcTotal(t.order);
    save();
    render();
    emit('item:removed', { tableId, itemId });
    return true;
  }

  function recalcTotal(order) {
    return order.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSFERIR / FUSIONAR / DIVIDIR
  // ─────────────────────────────────────────────────────────────
  function transferTable(fromId, toId) {
    const from = getTable(fromId);
    const to = getTable(toId);
    if (!from || !to) throw new Error('Mesa no existe');
    if (!from.order) throw new Error('Mesa origen no tiene comanda');
    if (to.state === STATES.OCUPADA) throw new Error('Mesa destino ocupada (use merge)');
    to.order = from.order;
    to.openedAt = from.openedAt;
    to.state = STATES.OCUPADA;
    from.order = null;
    from.openedAt = null;
    from.state = STATES.SUCIA;
    save();
    render();
    emit('table:transferred', { fromId, toId });
    return to;
  }

  function mergeOrder(fromId, toId) {
    const from = getTable(fromId);
    const to = getTable(toId);
    if (!from || !to || !from.order || !to.order) throw new Error('Ambas mesas necesitan comanda');
    to.order.items = to.order.items.concat(from.order.items);
    to.order.total = recalcTotal(to.order);
    from.order = null;
    from.openedAt = null;
    from.state = STATES.SUCIA;
    save();
    render();
    emit('order:merged', { fromId, toId });
    return to.order;
  }

  /**
   * Divide la cuenta de una mesa.
   * @param {string} tableId
   * @param {Array<Array<string>>} groups - cada grupo es un array de itemId
   * @returns {Array} sub-cuentas con items y total
   */
  function splitBill(tableId, groups) {
    const t = getTable(tableId);
    if (!t || !t.order) throw new Error('Mesa sin comanda');
    if (!Array.isArray(groups) || !groups.length) throw new Error('Grupos requeridos');

    const itemMap = new Map(t.order.items.map(i => [i.id, i]));
    const bills = groups.map((ids, idx) => {
      const items = ids.map(id => itemMap.get(id)).filter(Boolean);
      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      return {
        id: 'bill-' + Date.now().toString(36) + '-' + idx,
        tableId,
        items,
        total,
        paid: false
      };
    });

    // Modo equitativo: si groups === 'equal:N'
    emit('bill:split', { tableId, bills });
    return bills;
  }

  function splitEqual(tableId, n) {
    const t = getTable(tableId);
    if (!t || !t.order) throw new Error('Mesa sin comanda');
    n = Math.max(1, Math.floor(n));
    const each = Math.round((t.order.total / n) * 100) / 100;
    const bills = Array.from({ length: n }, (_, i) => ({
      id: 'bill-eq-' + Date.now().toString(36) + '-' + i,
      tableId,
      items: [],
      total: each,
      paid: false,
      label: `Comensal ${i + 1} de ${n}`
    }));
    emit('bill:split', { tableId, bills });
    return bills;
  }

  // ─────────────────────────────────────────────────────────────
  // RESERVAS
  // ─────────────────────────────────────────────────────────────
  function reserve(tableId, info) {
    const t = getTable(tableId);
    if (!t) throw new Error('Mesa no existe');
    if (t.state === STATES.OCUPADA) throw new Error('Mesa ocupada');
    const r = Object.assign({
      id: 'res-' + Date.now().toString(36),
      name: 'Cliente',
      phone: '',
      diners: t.capacity,
      datetime: new Date().toISOString(),
      notes: ''
    }, info || {});
    updateTable(tableId, { state: STATES.RESERVA, reservation: r });
    emit('reservation:created', { tableId, reservation: r });
    return r;
  }

  function cancelReservation(tableId) {
    const t = getTable(tableId);
    if (!t) return false;
    updateTable(tableId, { state: STATES.FREE, reservation: null });
    emit('reservation:cancelled', { tableId });
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER (canvas DOM)
  // ─────────────────────────────────────────────────────────────
  function mount(selector) {
    _container = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;
    if (!_container) {
      console.warn('TablesAPI.mount: contenedor no encontrado', selector);
      return;
    }
    _container.classList.add('volvix-tables-root');
    _container.style.position = 'relative';
    _container.style.width = _layout.width + 'px';
    _container.style.height = _layout.height + 'px';
    _container.style.background = '#f8fafc';
    _container.style.border = '1px solid #cbd5e1';
    _container.style.overflow = 'auto';
    render();
    bindEvents();
  }

  function render() {
    if (!_container) return;
    _container.innerHTML = '';

    // Zonas (fondo)
    _layout.zones.forEach((z, i) => {
      const zd = document.createElement('div');
      zd.className = 'volvix-zone';
      zd.dataset.zone = z.id;
      zd.style.cssText = `
        position:absolute; left:${20 + i * 290}px; top:20px;
        width:280px; height:${_layout.height - 60}px;
        background:${z.color}; opacity:0.35; border-radius:8px;
        pointer-events:none;
      `;
      const lbl = document.createElement('div');
      lbl.textContent = z.name;
      lbl.style.cssText = 'position:absolute;top:6px;left:10px;font:600 12px sans-serif;color:#334155;';
      zd.appendChild(lbl);
      _container.appendChild(zd);
    });

    // Mesas
    _layout.tables.forEach(t => {
      const el = document.createElement('div');
      el.className = 'volvix-table';
      el.dataset.id = t.id;
      el.dataset.state = t.state;
      const isCircle = t.shape === 'circle';
      el.style.cssText = `
        position:absolute; left:${t.x}px; top:${t.y}px;
        width:${t.w}px; height:${t.h}px;
        background:${STATE_COLORS[t.state]};
        color:#fff; font:600 14px sans-serif;
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        border-radius:${isCircle ? '50%' : '10px'};
        box-shadow:0 2px 6px rgba(0,0,0,.15);
        cursor:${_editMode ? 'move' : 'pointer'};
        user-select:none;
        ${_selectedId === t.id ? 'outline:3px solid #2563eb;' : ''}
      `;
      el.innerHTML = `
        <div style="font-size:18px">Mesa ${t.number}</div>
        <div style="font-size:11px;opacity:.85">${STATE_LABELS[t.state]}</div>
        <div style="font-size:10px;opacity:.75">${t.capacity}p</div>
        ${t.order ? `<div style="font-size:10px;margin-top:2px">$${t.order.total.toFixed(2)}</div>` : ''}
      `;
      _container.appendChild(el);
    });
  }

  function bindEvents() {
    _container.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    _container.addEventListener('click', onClick);
    _container.addEventListener('dblclick', onDblClick);
  }

  function onDown(e) {
    const el = e.target.closest('.volvix-table');
    if (!el) return;
    if (!_editMode) return;
    _draggingId = el.dataset.id;
    const t = getTable(_draggingId);
    const rect = _container.getBoundingClientRect();
    _dragOffset.x = e.clientX - rect.left - t.x;
    _dragOffset.y = e.clientY - rect.top - t.y;
  }

  function onMove(e) {
    if (!_draggingId) return;
    const t = getTable(_draggingId);
    if (!t) return;
    const rect = _container.getBoundingClientRect();
    let nx = e.clientX - rect.left - _dragOffset.x;
    let ny = e.clientY - rect.top - _dragOffset.y;
    const g = _layout.gridSize;
    nx = Math.round(nx / g) * g;
    ny = Math.round(ny / g) * g;
    t.x = Math.max(0, Math.min(_layout.width - t.w, nx));
    t.y = Math.max(0, Math.min(_layout.height - t.h, ny));
    render();
  }

  function onUp() {
    if (_draggingId) {
      save();
      emit('table:moved', getTable(_draggingId));
      _draggingId = null;
    }
  }

  function onClick(e) {
    const el = e.target.closest('.volvix-table');
    if (!el) { _selectedId = null; render(); return; }
    _selectedId = el.dataset.id;
    render();
    emit('table:selected', getTable(_selectedId));
  }

  function onDblClick(e) {
    const el = e.target.closest('.volvix-table');
    if (!el) return;
    const t = getTable(el.dataset.id);
    if (!t) return;
    // Ciclo rápido de estado
    const order = [STATES.FREE, STATES.OCUPADA, STATES.RESERVA, STATES.SUCIA, STATES.BLOQUEADA];
    const next = order[(order.indexOf(t.state) + 1) % order.length];
    setState(t.id, next);
  }

  function setEditMode(flag) {
    _editMode = !!flag;
    render();
    emit('editmode:changed', _editMode);
  }

  // ─────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────
  function stats() {
    const out = { total: _layout.tables.length, byState: {}, revenue: 0, occupancy: 0 };
    Object.values(STATES).forEach(s => out.byState[s] = 0);
    _layout.tables.forEach(t => {
      out.byState[t.state]++;
      if (t.order) out.revenue += t.order.total;
    });
    out.occupancy = out.total
      ? Math.round((out.byState.ocupada / out.total) * 100)
      : 0;
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // SYNC (placeholder Supabase)
  // ─────────────────────────────────────────────────────────────
  async function syncRemote() {
    if (!global.supabase || !global.supabase.from) {
      console.info('TablesAPI: Supabase no configurado, sync omitido');
      return false;
    }
    try {
      await global.supabase
        .from('volvix_tables_layout')
        .upsert({ id: 'main', layout: _layout, updated_at: new Date().toISOString() });
      emit('sync:ok');
      return true;
    } catch (e) {
      console.error('sync', e);
      emit('sync:error', e);
      return false;
    }
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    _layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    seedDefaultTables();
    save();
    render();
    emit('reset');
  }

  function exportLayout() { return JSON.parse(JSON.stringify(_layout)); }
  function importLayout(obj) {
    if (!obj || !Array.isArray(obj.tables)) throw new Error('Layout inválido');
    _layout = obj;
    save();
    render();
    emit('imported', _layout);
  }

  // ─────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────
  load();

  global.TablesAPI = {
    STATES,
    mount,
    render,
    setEditMode,

    // CRUD
    listTables, getTable, addTable, updateTable, removeTable,

    // Estados
    setState, freeTable, cleanTable,

    // Comandas
    assignOrder, addItem, removeItem,

    // Operaciones
    transferTable, mergeOrder, splitBill, splitEqual,

    // Reservas
    reserve, cancelReservation,

    // Datos
    stats, exportLayout, importLayout, reset,

    // Sync
    syncRemote,

    // Eventos
    on, off
  };

  console.log('[Volvix] TablesAPI listo. Mesas:', _layout.tables.length);
})(typeof window !== 'undefined' ? window : globalThis);
