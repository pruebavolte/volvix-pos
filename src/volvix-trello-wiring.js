/**
 * volvix-trello-wiring.js
 * Volvix POS - Trello-style Board Integration
 * Exposes window.TrelloAPI for boards, lists, cards, and automation.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_trello_state_v1';
  const listeners = new Map();
  const automations = [];

  // ── State ──────────────────────────────────────────────────────────
  let state = {
    boards: {},   // id -> { id, name, listIds: [], createdAt }
    lists:  {},   // id -> { id, boardId, name, cardIds: [], pos }
    cards:  {},   // id -> { id, listId, title, desc, labels, due, members, checklist, archived }
    activeBoardId: null,
  };

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function now() { return new Date().toISOString(); }

  // ── Persistence ────────────────────────────────────────────────────
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('[TrelloAPI] save failed', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) { console.warn('[TrelloAPI] load failed', e); }
  }

  // ── Events ─────────────────────────────────────────────────────────
  function on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event).delete(cb);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (set) set.forEach(cb => { try { cb(payload); } catch (e) { console.error(e); } });
    runAutomations(event, payload);
  }

  // ── Boards ─────────────────────────────────────────────────────────
  function createBoard(name) {
    const id = uid('board');
    state.boards[id] = { id, name: name || 'Untitled Board', listIds: [], createdAt: now() };
    if (!state.activeBoardId) state.activeBoardId = id;
    save(); emit('board:created', state.boards[id]);
    return state.boards[id];
  }

  function deleteBoard(boardId) {
    const board = state.boards[boardId];
    if (!board) return false;
    board.listIds.slice().forEach(deleteList);
    delete state.boards[boardId];
    if (state.activeBoardId === boardId) state.activeBoardId = Object.keys(state.boards)[0] || null;
    save(); emit('board:deleted', { boardId });
    return true;
  }

  function renameBoard(boardId, name) {
    const b = state.boards[boardId]; if (!b) return null;
    b.name = name; save(); emit('board:updated', b); return b;
  }

  function getBoard(boardId) { return state.boards[boardId] || null; }
  function listBoards() { return Object.values(state.boards); }
  function setActiveBoard(boardId) { state.activeBoardId = boardId; save(); emit('board:active', { boardId }); }

  // ── Lists ──────────────────────────────────────────────────────────
  function createList(boardId, name) {
    const board = state.boards[boardId]; if (!board) return null;
    const id = uid('list');
    const pos = board.listIds.length;
    state.lists[id] = { id, boardId, name: name || 'New List', cardIds: [], pos };
    board.listIds.push(id);
    save(); emit('list:created', state.lists[id]);
    return state.lists[id];
  }

  function deleteList(listId) {
    const list = state.lists[listId]; if (!list) return false;
    list.cardIds.slice().forEach(deleteCard);
    const board = state.boards[list.boardId];
    if (board) board.listIds = board.listIds.filter(x => x !== listId);
    delete state.lists[listId];
    save(); emit('list:deleted', { listId });
    return true;
  }

  function renameList(listId, name) {
    const l = state.lists[listId]; if (!l) return null;
    l.name = name; save(); emit('list:updated', l); return l;
  }

  function moveList(listId, newPos) {
    const l = state.lists[listId]; if (!l) return false;
    const board = state.boards[l.boardId];
    board.listIds = board.listIds.filter(x => x !== listId);
    board.listIds.splice(newPos, 0, listId);
    board.listIds.forEach((id, i) => { state.lists[id].pos = i; });
    save(); emit('list:moved', { listId, newPos }); return true;
  }

  // ── Cards ──────────────────────────────────────────────────────────
  function createCard(listId, data) {
    const list = state.lists[listId]; if (!list) return null;
    const id = uid('card');
    const card = {
      id, listId,
      title: (data && data.title) || 'New Card',
      desc:  (data && data.desc)  || '',
      labels: (data && data.labels) || [],
      due:    (data && data.due)    || null,
      members:(data && data.members)|| [],
      checklist: (data && data.checklist) || [],
      archived: false,
      createdAt: now(),
    };
    state.cards[id] = card;
    list.cardIds.push(id);
    save(); emit('card:created', card);
    return card;
  }

  function updateCard(cardId, patch) {
    const c = state.cards[cardId]; if (!c) return null;
    Object.assign(c, patch);
    save(); emit('card:updated', c); return c;
  }

  function deleteCard(cardId) {
    const c = state.cards[cardId]; if (!c) return false;
    const list = state.lists[c.listId];
    if (list) list.cardIds = list.cardIds.filter(x => x !== cardId);
    delete state.cards[cardId];
    save(); emit('card:deleted', { cardId }); return true;
  }

  function moveCard(cardId, targetListId, position) {
    const c = state.cards[cardId]; if (!c) return false;
    const src = state.lists[c.listId];
    const dst = state.lists[targetListId]; if (!dst) return false;
    if (src) src.cardIds = src.cardIds.filter(x => x !== cardId);
    const pos = (typeof position === 'number') ? position : dst.cardIds.length;
    dst.cardIds.splice(pos, 0, cardId);
    const fromList = c.listId;
    c.listId = targetListId;
    save(); emit('card:moved', { cardId, fromList, toList: targetListId, position: pos });
    return true;
  }

  function archiveCard(cardId, flag) {
    const c = state.cards[cardId]; if (!c) return null;
    c.archived = flag !== false;
    save(); emit('card:archived', c); return c;
  }

  function addLabel(cardId, label) {
    const c = state.cards[cardId]; if (!c) return null;
    if (!c.labels.includes(label)) c.labels.push(label);
    save(); emit('card:updated', c); return c;
  }

  function addChecklistItem(cardId, text) {
    const c = state.cards[cardId]; if (!c) return null;
    c.checklist.push({ id: uid('chk'), text, done: false });
    save(); emit('card:updated', c); return c;
  }

  function toggleChecklistItem(cardId, itemId) {
    const c = state.cards[cardId]; if (!c) return null;
    const item = c.checklist.find(i => i.id === itemId); if (!item) return null;
    item.done = !item.done;
    save(); emit('card:updated', c); return c;
  }

  // ── Automation ─────────────────────────────────────────────────────
  function addAutomation(rule) {
    // rule: { id?, when: 'card:moved', if: fn(payload)->bool, then: fn(payload) }
    rule.id = rule.id || uid('rule');
    automations.push(rule);
    return rule.id;
  }

  function removeAutomation(id) {
    const idx = automations.findIndex(r => r.id === id);
    if (idx >= 0) { automations.splice(idx, 1); return true; }
    return false;
  }

  function runAutomations(event, payload) {
    automations.forEach(rule => {
      if (rule.when !== event) return;
      try {
        if (rule.if && !rule.if(payload)) return;
        rule.then && rule.then(payload);
      } catch (e) { console.error('[TrelloAPI] automation error', e); }
    });
  }

  // Built-in automation: auto-archive cards in lists named "Done"
  addAutomation({
    when: 'card:moved',
    if: (p) => {
      const l = state.lists[p.toList];
      return l && /done|completed|archivado/i.test(l.name);
    },
    then: (p) => {
      const c = state.cards[p.cardId];
      if (c) { c.archived = true; save(); emit('card:autoarchived', c); }
    },
  });

  // ── Queries ────────────────────────────────────────────────────────
  function getBoardData(boardId) {
    const board = state.boards[boardId]; if (!board) return null;
    return {
      ...board,
      lists: board.listIds.map(lid => ({
        ...state.lists[lid],
        cards: state.lists[lid].cardIds.map(cid => state.cards[cid]).filter(Boolean),
      })),
    };
  }

  function searchCards(query) {
    const q = (query || '').toLowerCase();
    return Object.values(state.cards).filter(c =>
      c.title.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q)
    );
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(json) {
    try { state = JSON.parse(json); save(); emit('state:imported', null); return true; }
    catch (e) { return false; }
  }
  function reset() { state = { boards: {}, lists: {}, cards: {}, activeBoardId: null }; save(); emit('state:reset', null); }

  // ── Init ───────────────────────────────────────────────────────────
  load();
  if (Object.keys(state.boards).length === 0) {
    const b = createBoard('Volvix POS - Tablero Principal');
    const todo = createList(b.id, 'Por hacer');
    createList(b.id, 'En progreso');
    createList(b.id, 'Done');
    createCard(todo.id, { title: 'Bienvenido a Trello Volvix', desc: 'Arrastra tarjetas entre listas.' });
  }

  // ── Public API ─────────────────────────────────────────────────────
  global.TrelloAPI = {
    // boards
    createBoard, deleteBoard, renameBoard, getBoard, listBoards, setActiveBoard, getBoardData,
    // lists
    createList, deleteList, renameList, moveList,
    // cards
    createCard, updateCard, deleteCard, moveCard, archiveCard,
    addLabel, addChecklistItem, toggleChecklistItem,
    // search/io
    searchCards, exportJSON, importJSON, reset,
    // automation
    addAutomation, removeAutomation,
    // events
    on, emit,
    // raw state (read-only view)
    get state() { return state; },
    get activeBoardId() { return state.activeBoardId; },
  };

  console.log('[TrelloAPI] ready - boards:', Object.keys(state.boards).length);
})(window);
