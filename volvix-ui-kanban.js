/**
 * volvix-ui-kanban.js
 * Kanban board UI con drag-drop, cards, edit inline y persistencia.
 * Expuesto como window.Kanban
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix.kanban.v1';
  const DEFAULT_COLUMNS = [
    { id: 'todo', title: 'Por hacer', cards: [] },
    { id: 'doing', title: 'En curso', cards: [] },
    { id: 'review', title: 'Revisión', cards: [] },
    { id: 'done', title: 'Hecho', cards: [] }
  ];

  // ──────────────────────────────────────────────
  // Estado
  // ──────────────────────────────────────────────
  let state = { columns: clone(DEFAULT_COLUMNS) };
  let rootEl = null;
  let dragData = null; // { cardId, fromCol }
  let listeners = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function emit(ev, payload) { listeners.forEach(fn => { try { fn(ev, payload); } catch (e) {} }); }

  // ──────────────────────────────────────────────
  // Persistencia
  // ──────────────────────────────────────────────
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      emit('save', state);
    } catch (e) {
      console.warn('[Kanban] no se pudo guardar:', e);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.columns)) {
        state = parsed;
        return true;
      }
    } catch (e) {
      console.warn('[Kanban] storage corrupto, reseteando');
    }
    return false;
  }

  function reset() {
    state = { columns: clone(DEFAULT_COLUMNS) };
    save();
    render();
    emit('reset', null);
  }

  // ──────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────
  function getColumn(colId) {
    return state.columns.find(c => c.id === colId);
  }

  function findCard(cardId) {
    for (const col of state.columns) {
      const idx = col.cards.findIndex(c => c.id === cardId);
      if (idx !== -1) return { col, idx, card: col.cards[idx] };
    }
    return null;
  }

  function addCard(colId, text) {
    const col = getColumn(colId);
    if (!col) return null;
    const card = {
      id: uid(),
      text: String(text || 'Nueva tarea').trim() || 'Nueva tarea',
      createdAt: Date.now()
    };
    col.cards.push(card);
    save();
    render();
    emit('card:add', { colId, card });
    return card;
  }

  function updateCard(cardId, newText) {
    const found = findCard(cardId);
    if (!found) return false;
    found.card.text = String(newText || '').trim() || found.card.text;
    found.card.updatedAt = Date.now();
    save();
    emit('card:update', found.card);
    return true;
  }

  function deleteCard(cardId) {
    const found = findCard(cardId);
    if (!found) return false;
    found.col.cards.splice(found.idx, 1);
    save();
    render();
    emit('card:delete', { cardId });
    return true;
  }

  function moveCard(cardId, toColId, toIndex) {
    const found = findCard(cardId);
    const target = getColumn(toColId);
    if (!found || !target) return false;
    found.col.cards.splice(found.idx, 1);
    const insertAt = (typeof toIndex === 'number') ? Math.max(0, Math.min(toIndex, target.cards.length)) : target.cards.length;
    target.cards.splice(insertAt, 0, found.card);
    save();
    render();
    emit('card:move', { cardId, from: found.col.id, to: toColId, index: insertAt });
    return true;
  }

  function addColumn(title) {
    const id = 'col_' + uid();
    state.columns.push({ id, title: String(title || 'Nueva columna'), cards: [] });
    save();
    render();
    return id;
  }

  function removeColumn(colId) {
    state.columns = state.columns.filter(c => c.id !== colId);
    save();
    render();
  }

  // ──────────────────────────────────────────────
  // Estilos inline (autocontenido)
  // ──────────────────────────────────────────────
  const STYLES = `
  .vk-board { display:flex; gap:14px; padding:14px; overflow-x:auto;
    font-family: -apple-system, Segoe UI, Roboto, sans-serif;
    background:#0f172a; min-height:480px; align-items:flex-start; }
  .vk-col { background:#1e293b; border-radius:10px; min-width:280px; max-width:300px;
    padding:10px; display:flex; flex-direction:column; max-height:80vh; }
  .vk-col-head { display:flex; align-items:center; justify-content:space-between;
    color:#e2e8f0; font-weight:600; padding:4px 6px 10px; }
  .vk-col-title { background:transparent; border:none; color:#e2e8f0; font-weight:600;
    font-size:14px; flex:1; outline:none; }
  .vk-col-title:focus { background:#0f172a; border-radius:4px; padding:2px 4px; }
  .vk-col-count { background:#334155; color:#94a3b8; border-radius:10px;
    padding:2px 8px; font-size:11px; margin-left:6px; }
  .vk-col-body { flex:1; overflow-y:auto; min-height:30px; padding:4px 2px; }
  .vk-col-body.vk-drop { background:#33415555; border:2px dashed #64748b; border-radius:6px; }
  .vk-card { background:#0f172a; color:#e2e8f0; border-radius:6px; padding:10px;
    margin-bottom:8px; cursor:grab; box-shadow:0 1px 2px #0006;
    border-left:3px solid #38bdf8; word-break:break-word; }
  .vk-card.vk-dragging { opacity:0.4; cursor:grabbing; }
  .vk-card-text { font-size:13px; line-height:1.4; outline:none; }
  .vk-card-text[contenteditable="true"] { background:#1e293b; border-radius:4px; padding:4px; }
  .vk-card-foot { display:flex; justify-content:flex-end; gap:6px; margin-top:6px;
    opacity:0; transition:opacity .15s; }
  .vk-card:hover .vk-card-foot { opacity:1; }
  .vk-btn { background:#334155; color:#e2e8f0; border:none; border-radius:4px;
    padding:3px 8px; font-size:11px; cursor:pointer; }
  .vk-btn:hover { background:#475569; }
  .vk-btn-danger:hover { background:#dc2626; }
  .vk-add { width:100%; background:transparent; border:1px dashed #475569; color:#94a3b8;
    border-radius:6px; padding:8px; cursor:pointer; font-size:12px; margin-top:6px; }
  .vk-add:hover { background:#33415588; color:#e2e8f0; }
  .vk-add-input { width:100%; background:#0f172a; border:1px solid #38bdf8; color:#e2e8f0;
    border-radius:6px; padding:8px; font-size:13px; outline:none; box-sizing:border-box; }
  .vk-toolbar { display:flex; gap:8px; padding:10px 14px; background:#0b1220;
    border-bottom:1px solid #1e293b; }
  .vk-toolbar .vk-btn { background:#1e40af; }
  .vk-toolbar .vk-btn:hover { background:#2563eb; }
  `;

  function injectStyles() {
    if (document.getElementById('vk-styles')) return;
    const s = document.createElement('style');
    s.id = 'vk-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (children || []).forEach(ch => {
      if (ch == null) return;
      e.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    });
    return e;
  }

  function renderCard(card, col) {
    const textEl = el('div', {
      class: 'vk-card-text',
      contenteditable: 'false',
      ondblclick: (ev) => startEdit(ev.currentTarget, card.id)
    }, [card.text]);

    const cardEl = el('div', {
      class: 'vk-card',
      draggable: 'true',
      dataset: { cardId: card.id, colId: col.id },
      ondragstart: (ev) => {
        dragData = { cardId: card.id, fromCol: col.id };
        ev.currentTarget.classList.add('vk-dragging');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', card.id);
      },
      ondragend: (ev) => ev.currentTarget.classList.remove('vk-dragging')
    }, [
      textEl,
      el('div', { class: 'vk-card-foot' }, [
        el('button', {
          class: 'vk-btn',
          title: 'Editar',
          onclick: () => startEdit(textEl, card.id)
        }, ['✎']),
        el('button', {
          class: 'vk-btn vk-btn-danger',
          title: 'Eliminar',
          onclick: () => { if (confirm('¿Eliminar tarea?')) deleteCard(card.id); }
        }, ['×'])
      ])
    ]);
    return cardEl;
  }

  function startEdit(textEl, cardId) {
    textEl.setAttribute('contenteditable', 'true');
    textEl.focus();
    const range = document.createRange();
    range.selectNodeContents(textEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const finish = (commit) => {
      textEl.removeEventListener('blur', onBlur);
      textEl.removeEventListener('keydown', onKey);
      textEl.setAttribute('contenteditable', 'false');
      if (commit) updateCard(cardId, textEl.textContent);
      else {
        const found = findCard(cardId);
        if (found) textEl.textContent = found.card.text;
      }
    };
    const onBlur = () => finish(true);
    const onKey = (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); textEl.blur(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    };
    textEl.addEventListener('blur', onBlur);
    textEl.addEventListener('keydown', onKey);
  }

  function renderColumn(col) {
    const body = el('div', {
      class: 'vk-col-body',
      dataset: { colId: col.id },
      ondragover: (ev) => { ev.preventDefault(); ev.currentTarget.classList.add('vk-drop'); },
      ondragleave: (ev) => ev.currentTarget.classList.remove('vk-drop'),
      ondrop: (ev) => {
        ev.preventDefault();
        ev.currentTarget.classList.remove('vk-drop');
        if (!dragData) return;
        const target = ev.currentTarget;
        const cards = [...target.querySelectorAll('.vk-card')];
        let insertIdx = cards.length;
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { insertIdx = i; break; }
        }
        if (dragData.fromCol === col.id) {
          const from = state.columns.find(c => c.id === col.id).cards.findIndex(c => c.id === dragData.cardId);
          if (from < insertIdx) insertIdx--;
        }
        moveCard(dragData.cardId, col.id, insertIdx);
        dragData = null;
      }
    }, col.cards.map(c => renderCard(c, col)));

    const titleInput = el('input', {
      class: 'vk-col-title',
      value: col.title,
      onchange: (ev) => { col.title = ev.target.value || col.title; save(); }
    });

    const head = el('div', { class: 'vk-col-head' }, [
      titleInput,
      el('span', { class: 'vk-col-count' }, [String(col.cards.length)])
    ]);

    const adder = el('button', {
      class: 'vk-add',
      onclick: (ev) => showAdder(ev.currentTarget, col.id)
    }, ['+ Agregar tarea']);

    return el('div', { class: 'vk-col', dataset: { colId: col.id } }, [head, body, adder]);
  }

  function showAdder(btn, colId) {
    const input = el('input', {
      class: 'vk-add-input',
      placeholder: 'Texto de la tarea, Enter para guardar',
      onkeydown: (ev) => {
        if (ev.key === 'Enter') { addCard(colId, input.value); }
        else if (ev.key === 'Escape') { render(); }
      },
      onblur: () => { if (input.value.trim()) addCard(colId, input.value); else render(); }
    });
    btn.replaceWith(input);
    input.focus();
  }

  function renderToolbar() {
    return el('div', { class: 'vk-toolbar' }, [
      el('button', {
        class: 'vk-btn',
        onclick: () => { const t = prompt('Título columna:'); if (t) addColumn(t); }
      }, ['+ Columna']),
      el('button', {
        class: 'vk-btn',
        onclick: () => { if (confirm('¿Reiniciar tablero? Se perderán las tareas.')) reset(); }
      }, ['Reset']),
      el('button', {
        class: 'vk-btn',
        onclick: () => {
          const data = JSON.stringify(state, null, 2);
          navigator.clipboard?.writeText(data);
          alert('Estado copiado al portapapeles');
        }
      }, ['Exportar'])
    ]);
  }

  function render() {
    if (!rootEl) return;
    rootEl.innerHTML = '';
    rootEl.appendChild(renderToolbar());
    const board = el('div', { class: 'vk-board' },
      state.columns.map(renderColumn));
    rootEl.appendChild(board);
  }

  // ──────────────────────────────────────────────
  // API pública
  // ──────────────────────────────────────────────
  function mount(target) {
    injectStyles();
    rootEl = (typeof target === 'string') ? document.querySelector(target) : target;
    if (!rootEl) { console.error('[Kanban] target no encontrado:', target); return; }
    load();
    render();
    emit('mount', null);
  }

  function unmount() {
    if (rootEl) rootEl.innerHTML = '';
    rootEl = null;
  }

  function on(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function off(fn) { listeners = listeners.filter(l => l !== fn); }

  global.Kanban = {
    mount, unmount, render,
    addCard, updateCard, deleteCard, moveCard,
    addColumn, removeColumn,
    save, load, reset,
    getState: () => clone(state),
    setState: (s) => { if (s && Array.isArray(s.columns)) { state = clone(s); save(); render(); } },
    on, off,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
