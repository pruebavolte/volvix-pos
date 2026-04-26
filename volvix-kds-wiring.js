/* ============================================================================
 * volvix-kds-wiring.js  —  Volvix POS · Kitchen Display System (KDS)
 * ----------------------------------------------------------------------------
 * Agent-53 R9 · Pantalla de cocina en tiempo real.
 * Estados: pending → cooking → ready → served
 * Features: timer por orden, sonidos, color coding por antiguedad, swipe
 * to complete, filtros por estación, contadores, persistencia local.
 *
 * Expone:  window.KDSAPI
 * ========================================================================== */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 0. Constantes / configuración
  // -------------------------------------------------------------------------
  const STORAGE_KEY      = 'volvix_kds_orders_v1';
  const STATION_KEY      = 'volvix_kds_station_v1';
  const SOUND_KEY        = 'volvix_kds_sound_v1';
  const TICK_MS          = 1000;     // refresco timers
  const POLL_MS          = 4000;     // polling backend (si existe)
  const WARN_SECONDS     = 8 * 60;   // amarillo a los 8 min
  const ALERT_SECONDS    = 15 * 60;  // rojo a los 15 min
  const READY_TTL        = 5 * 60;   // ready desaparece tras 5 min
  const SWIPE_THRESHOLD  = 90;       // px para completar por swipe
  const STATIONS = ['ALL', 'GRILL', 'FRY', 'COLD', 'BAR', 'DESSERT'];
  const STATES   = ['pending', 'cooking', 'ready', 'served'];

  // -------------------------------------------------------------------------
  // 1. Estado interno
  // -------------------------------------------------------------------------
  const state = {
    orders: [],          // { id, table, items:[{name,qty,station,notes}], state, createdAt, startedAt, readyAt }
    station: 'ALL',
    sound: true,
    tickHandle: null,
    pollHandle: null,
    listeners: new Set(),
    rootEl: null,
    audioCtx: null,
    lastNotifiedIds: new Set(),
  };

  // -------------------------------------------------------------------------
  // 2. Utilidades
  // -------------------------------------------------------------------------
  const uid = () => 'ord_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const now = () => Date.now();

  function fmtClock(secs) {
    if (secs < 0) secs = 0;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function ageSeconds(o) {
    const ref = o.startedAt || o.createdAt;
    return Math.floor((now() - ref) / 1000);
  }

  function colorFor(o) {
    const a = ageSeconds(o);
    if (o.state === 'ready')   return 'kds-ready';
    if (a >= ALERT_SECONDS)    return 'kds-alert';
    if (a >= WARN_SECONDS)     return 'kds-warn';
    return 'kds-ok';
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.orders = JSON.parse(raw) || [];
      state.station = localStorage.getItem(STATION_KEY) || 'ALL';
      const s = localStorage.getItem(SOUND_KEY);
      state.sound = s === null ? true : s === '1';
    } catch (e) { console.warn('[KDS] load fail', e); }
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
      localStorage.setItem(STATION_KEY, state.station);
      localStorage.setItem(SOUND_KEY, state.sound ? '1' : '0');
    } catch (e) { /* quota */ }
  }

  function emit(evt, payload) {
    state.listeners.forEach(fn => { try { fn(evt, payload); } catch (e) {} });
  }

  // -------------------------------------------------------------------------
  // 3. Audio (WebAudio beep — sin assets externos)
  // -------------------------------------------------------------------------
  function ensureAudio() {
    if (!state.audioCtx) {
      try {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        state.audioCtx = Ctx ? new Ctx() : null;
      } catch (e) { state.audioCtx = null; }
    }
    return state.audioCtx;
  }
  function beep(freq, dur, vol) {
    if (!state.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = vol == null ? 0.15 : vol;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (dur || 0.18));
  }
  const sndNew    = () => { beep(880, 0.12); setTimeout(() => beep(1175, 0.18), 130); };
  const sndReady  = () => { beep(660, 0.10); setTimeout(() => beep(990, 0.10), 100); setTimeout(() => beep(1320, 0.18), 200); };
  const sndAlert  = () => { beep(220, 0.30, 0.25); };

  // -------------------------------------------------------------------------
  // 4. CRUD de órdenes
  // -------------------------------------------------------------------------
  function addOrder(order) {
    const o = {
      id:        order.id || uid(),
      table:     order.table || '—',
      items:     (order.items || []).map(it => ({
        name:    it.name || 'Item',
        qty:     it.qty || 1,
        station: it.station || 'GRILL',
        notes:   it.notes || '',
        done:    false,
      })),
      state:     'pending',
      createdAt: order.createdAt || now(),
      startedAt: null,
      readyAt:   null,
      server:    order.server || '',
    };
    state.orders.push(o);
    persist();
    if (!state.lastNotifiedIds.has(o.id)) { sndNew(); state.lastNotifiedIds.add(o.id); }
    emit('order:add', o);
    render();
    return o;
  }

  function setState(id, newState) {
    const o = state.orders.find(x => x.id === id);
    if (!o) return false;
    if (STATES.indexOf(newState) < 0) return false;
    o.state = newState;
    if (newState === 'cooking' && !o.startedAt) o.startedAt = now();
    if (newState === 'ready')   { o.readyAt = now(); sndReady(); }
    if (newState === 'served')  o.servedAt = now();
    persist();
    emit('order:state', { id, state: newState });
    render();
    return true;
  }

  function toggleItem(orderId, idx) {
    const o = state.orders.find(x => x.id === orderId);
    if (!o || !o.items[idx]) return false;
    o.items[idx].done = !o.items[idx].done;
    // si todos los items están listos → estado ready
    if (o.items.every(i => i.done) && o.state !== 'ready') {
      setState(orderId, 'ready');
    } else {
      persist(); render();
    }
    return true;
  }

  function removeOrder(id) {
    const i = state.orders.findIndex(x => x.id === id);
    if (i < 0) return false;
    state.orders.splice(i, 1);
    persist();
    emit('order:remove', { id });
    render();
    return true;
  }

  function purgeOldServed() {
    const cutoff = now() - READY_TTL * 1000;
    const before = state.orders.length;
    state.orders = state.orders.filter(o => !(o.state === 'served' && (o.servedAt || 0) < cutoff));
    if (state.orders.length !== before) persist();
  }

  // -------------------------------------------------------------------------
  // 5. Filtros / contadores
  // -------------------------------------------------------------------------
  function setStation(st) {
    if (STATIONS.indexOf(st) < 0) return;
    state.station = st;
    persist();
    render();
  }
  function setSound(on) { state.sound = !!on; persist(); render(); }

  function visibleOrders() {
    return state.orders
      .filter(o => o.state !== 'served')
      .filter(o => state.station === 'ALL' ? true : o.items.some(i => i.station === state.station))
      .sort((a, b) => (a.createdAt - b.createdAt));
  }

  function counters() {
    const v = state.orders.filter(o => o.state !== 'served');
    return {
      total:   v.length,
      pending: v.filter(o => o.state === 'pending').length,
      cooking: v.filter(o => o.state === 'cooking').length,
      ready:   v.filter(o => o.state === 'ready').length,
      late:    v.filter(o => ageSeconds(o) >= ALERT_SECONDS).length,
    };
  }

  // -------------------------------------------------------------------------
  // 6. Render (DOM)
  // -------------------------------------------------------------------------
  const STYLES = `
    .kds-root{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:12px;box-sizing:border-box}
    .kds-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
    .kds-chip{background:#1e293b;border:1px solid #334155;border-radius:999px;padding:6px 12px;cursor:pointer;font-size:13px;color:#cbd5e1}
    .kds-chip.active{background:#2563eb;color:#fff;border-color:#2563eb}
    .kds-counts{margin-left:auto;display:flex;gap:8px;font-size:12px}
    .kds-counts span{background:#1e293b;padding:4px 10px;border-radius:6px}
    .kds-counts .late{background:#7f1d1d;color:#fecaca}
    .kds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
    .kds-card{background:#1e293b;border-radius:10px;padding:12px;border-top:6px solid #475569;position:relative;touch-action:pan-y;transition:transform .12s ease}
    .kds-card.kds-ok{border-top-color:#22c55e}
    .kds-card.kds-warn{border-top-color:#f59e0b;animation:kdsPulse 2s infinite}
    .kds-card.kds-alert{border-top-color:#ef4444;animation:kdsPulse 1s infinite}
    .kds-card.kds-ready{border-top-color:#3b82f6;background:#1e3a8a}
    .kds-card.dragging{transition:none;opacity:.85}
    .kds-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
    .kds-table{font-weight:700;font-size:18px}
    .kds-timer{font-family:ui-monospace,Consolas,monospace;font-size:16px;font-weight:600}
    .kds-items{list-style:none;padding:0;margin:0 0 10px}
    .kds-items li{padding:6px 4px;border-bottom:1px dashed #334155;cursor:pointer;display:flex;gap:6px;align-items:flex-start;font-size:14px}
    .kds-items li.done{text-decoration:line-through;opacity:.55}
    .kds-qty{background:#0f172a;border-radius:4px;padding:0 6px;font-weight:700;min-width:22px;text-align:center}
    .kds-st{font-size:10px;background:#334155;padding:1px 6px;border-radius:4px;margin-left:auto}
    .kds-notes{display:block;font-size:11px;color:#fbbf24;margin-top:2px;width:100%}
    .kds-actions{display:flex;gap:6px}
    .kds-btn{flex:1;background:#334155;color:#e2e8f0;border:0;border-radius:6px;padding:8px;cursor:pointer;font-size:13px;font-weight:600}
    .kds-btn.primary{background:#2563eb;color:#fff}
    .kds-btn.success{background:#16a34a;color:#fff}
    .kds-btn.danger{background:#7f1d1d;color:#fee2e2}
    .kds-empty{text-align:center;padding:40px;color:#64748b;font-size:14px}
    .kds-swipe-hint{position:absolute;right:8px;top:8px;font-size:10px;color:#94a3b8;opacity:.6}
    @keyframes kdsPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
  `;

  function injectStyles() {
    if (document.getElementById('kds-styles')) return;
    const s = document.createElement('style');
    s.id = 'kds-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function mount(rootSelectorOrEl) {
    injectStyles();
    const el = typeof rootSelectorOrEl === 'string'
      ? document.querySelector(rootSelectorOrEl)
      : rootSelectorOrEl;
    if (!el) { console.error('[KDS] root no encontrado'); return; }
    state.rootEl = el;
    el.classList.add('kds-root');
    render();
    startTicker();
    return el;
  }

  function renderBar() {
    const c = counters();
    const chips = STATIONS.map(s =>
      `<button class="kds-chip ${state.station === s ? 'active' : ''}" data-st="${s}">${s}</button>`
    ).join('');
    return `
      <div class="kds-bar">
        ${chips}
        <button class="kds-chip" data-sound>${state.sound ? '🔊' : '🔇'}</button>
        <div class="kds-counts">
          <span>Total ${c.total}</span>
          <span>Pend ${c.pending}</span>
          <span>Cook ${c.cooking}</span>
          <span>Ready ${c.ready}</span>
          ${c.late ? `<span class="late">Late ${c.late}</span>` : ''}
        </div>
      </div>`;
  }

  function renderCard(o) {
    const items = o.items.map((it, i) => `
      <li class="${it.done ? 'done' : ''}" data-item="${i}">
        <span class="kds-qty">${it.qty}×</span>
        <span>${escapeHtml(it.name)}</span>
        <span class="kds-st">${it.station}</span>
        ${it.notes ? `<span class="kds-notes">↳ ${escapeHtml(it.notes)}</span>` : ''}
      </li>`).join('');

    const action = o.state === 'pending'
      ? `<button class="kds-btn primary" data-act="cooking">Iniciar</button>`
      : o.state === 'cooking'
        ? `<button class="kds-btn success" data-act="ready">Listo</button>`
        : `<button class="kds-btn success" data-act="served">Entregar</button>`;

    return `
      <div class="kds-card ${colorFor(o)}" data-id="${o.id}">
        <span class="kds-swipe-hint">swipe →</span>
        <div class="kds-h">
          <span class="kds-table">Mesa ${escapeHtml(String(o.table))}</span>
          <span class="kds-timer">${fmtClock(ageSeconds(o))}</span>
        </div>
        <ul class="kds-items">${items}</ul>
        <div class="kds-actions">
          ${action}
          <button class="kds-btn danger" data-act="cancel">✕</button>
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function render() {
    if (!state.rootEl) return;
    purgeOldServed();
    const list = visibleOrders();
    const cards = list.length
      ? `<div class="kds-grid">${list.map(renderCard).join('')}</div>`
      : `<div class="kds-empty">Sin órdenes activas</div>`;
    state.rootEl.innerHTML = renderBar() + cards;
    bindEvents();
  }

  // -------------------------------------------------------------------------
  // 7. Eventos (clicks + swipe)
  // -------------------------------------------------------------------------
  function bindEvents() {
    const root = state.rootEl;
    if (!root) return;

    root.querySelectorAll('.kds-chip[data-st]').forEach(b =>
      b.addEventListener('click', () => setStation(b.dataset.st)));
    const sb = root.querySelector('.kds-chip[data-sound]');
    if (sb) sb.addEventListener('click', () => setSound(!state.sound));

    root.querySelectorAll('.kds-card').forEach(card => {
      const id = card.dataset.id;

      card.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'cancel') {
            if (confirm('¿Cancelar orden?')) removeOrder(id);
          } else {
            setState(id, act);
          }
        });
      });

      card.querySelectorAll('[data-item]').forEach(li => {
        li.addEventListener('click', () => toggleItem(id, parseInt(li.dataset.item, 10)));
      });

      attachSwipe(card, id);
    });
  }

  function attachSwipe(card, id) {
    let startX = 0, dx = 0, active = false;
    const onDown = e => {
      const t = e.touches ? e.touches[0] : e;
      startX = t.clientX; dx = 0; active = true;
      card.classList.add('dragging');
    };
    const onMove = e => {
      if (!active) return;
      const t = e.touches ? e.touches[0] : e;
      dx = t.clientX - startX;
      if (dx < 0) dx = 0;
      card.style.transform = `translateX(${dx}px)`;
    };
    const onUp = () => {
      if (!active) return;
      active = false;
      card.classList.remove('dragging');
      if (dx >= SWIPE_THRESHOLD) {
        card.style.transform = 'translateX(120%)';
        const o = state.orders.find(x => x.id === id);
        if (o) {
          if (o.state === 'pending') setState(id, 'cooking');
          else if (o.state === 'cooking') setState(id, 'ready');
          else if (o.state === 'ready') setState(id, 'served');
        }
      } else {
        card.style.transform = '';
      }
      dx = 0;
    };
    card.addEventListener('touchstart', onDown, { passive: true });
    card.addEventListener('touchmove',  onMove, { passive: true });
    card.addEventListener('touchend',   onUp);
    card.addEventListener('mousedown',  onDown);
    global.addEventListener('mousemove', onMove);
    global.addEventListener('mouseup',   onUp);
  }

  // -------------------------------------------------------------------------
  // 8. Ticker (timers + alertas)
  // -------------------------------------------------------------------------
  function startTicker() {
    stopTicker();
    state.tickHandle = setInterval(() => {
      // alertas en órdenes que cruzan el umbral
      state.orders.forEach(o => {
        if (o.state === 'served' || o.state === 'ready') return;
        const a = ageSeconds(o);
        if (a === ALERT_SECONDS) sndAlert();
      });
      // refresca timers sin re-render completo si DOM existe
      if (state.rootEl) {
        state.rootEl.querySelectorAll('.kds-card').forEach(card => {
          const id = card.dataset.id;
          const o = state.orders.find(x => x.id === id);
          if (!o) return;
          const t = card.querySelector('.kds-timer');
          if (t) t.textContent = fmtClock(ageSeconds(o));
          const desired = colorFor(o);
          ['kds-ok','kds-warn','kds-alert','kds-ready'].forEach(c => {
            if (c !== desired) card.classList.remove(c);
          });
          card.classList.add(desired);
        });
      }
    }, TICK_MS);
  }
  function stopTicker() {
    if (state.tickHandle) clearInterval(state.tickHandle);
    state.tickHandle = null;
  }

  // -------------------------------------------------------------------------
  // 9. Polling backend opcional (si window.VolvixBackend existe)
  // -------------------------------------------------------------------------
  function startPolling(fetcher) {
    stopPolling();
    if (typeof fetcher !== 'function') return;
    state.pollHandle = setInterval(async () => {
      try {
        const incoming = await fetcher();
        if (!Array.isArray(incoming)) return;
        incoming.forEach(o => {
          if (!state.orders.find(x => x.id === o.id)) addOrder(o);
        });
      } catch (e) { /* silencioso */ }
    }, POLL_MS);
  }
  function stopPolling() {
    if (state.pollHandle) clearInterval(state.pollHandle);
    state.pollHandle = null;
  }

  // -------------------------------------------------------------------------
  // 10. Listeners externos
  // -------------------------------------------------------------------------
  function on(fn)  { state.listeners.add(fn);    return () => state.listeners.delete(fn); }
  function off(fn) { state.listeners.delete(fn); }

  // -------------------------------------------------------------------------
  // 11. Demo / seed
  // -------------------------------------------------------------------------
  function seedDemo() {
    addOrder({ table: 4,  server: 'Ana', items: [
      { name: 'Volvix Burger', qty: 2, station: 'GRILL', notes: 'sin cebolla' },
      { name: 'Papas',         qty: 2, station: 'FRY' },
      { name: 'Coca',          qty: 2, station: 'BAR' },
    ]});
    addOrder({ table: 7,  server: 'Luis', items: [
      { name: 'Cesar Salad',   qty: 1, station: 'COLD' },
      { name: 'Tiramisu',      qty: 1, station: 'DESSERT' },
    ]});
    addOrder({ table: 12, server: 'Ana', items: [
      { name: 'Ribeye 12oz',   qty: 1, station: 'GRILL', notes: 'término medio' },
      { name: 'Vino tinto',    qty: 2, station: 'BAR' },
    ]});
  }

  // -------------------------------------------------------------------------
  // 12. API pública
  // -------------------------------------------------------------------------
  load();

  global.KDSAPI = {
    mount,
    addOrder,
    setState,
    toggleItem,
    removeOrder,
    setStation,
    setSound,
    on, off,
    counters,
    visibleOrders,
    startPolling, stopPolling,
    seedDemo,
    _state: state,        // útil para debug
    STATIONS, STATES,
    version: '1.0.0',
  };

  // Auto-mount si existe #kds-root
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const auto = document.getElementById('kds-root');
      if (auto) mount(auto);
    });
  } else {
    const auto = document.getElementById('kds-root');
    if (auto) mount(auto);
  }

})(typeof window !== 'undefined' ? window : globalThis);
