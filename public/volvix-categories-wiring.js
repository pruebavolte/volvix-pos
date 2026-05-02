/**
 * volvix-categories-wiring.js
 * Categories tree management for Volvix POS
 * Features: hierarchical tree (parent-child), drag-drop reorder,
 * products by category, breadcrumbs nav, filters, item counts.
 * Exposes window.CategoriesAPI with full CRUD.
 */
(function (global) {
  'use strict';

  // ========== STATE ==========
  const state = {
    categories: [],          // flat list { id, name, parentId, order, icon, color, productIds:[] }
    products: [],            // flat list { id, name, categoryId, price, stock }
    selectedId: null,
    breadcrumbs: [],
    filters: { search: '', minCount: 0, onlyEmpty: false, onlyWithProducts: false },
    listeners: {},
    nextCatId: 1,
    nextProdId: 1,
    dragSrc: null,
  };

  // ========== EVENT BUS ==========
  function on(event, cb) {
    (state.listeners[event] = state.listeners[event] || []).push(cb);
  }
  function emit(event, payload) {
    (state.listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error('[Categories] listener error', e); }
    });
  }

  // ========== PERSISTENCE ==========
  const STORAGE_KEY = 'volvix.categories.v1';
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        categories: state.categories,
        products: state.products,
        nextCatId: state.nextCatId,
        nextProdId: state.nextProdId,
      }));
    } catch (e) { console.warn('[Categories] persist failed', e); }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.categories = data.categories || [];
      state.products = data.products || [];
      state.nextCatId = data.nextCatId || 1;
      state.nextProdId = data.nextProdId || 1;
      return true;
    } catch (e) {
      console.warn('[Categories] restore failed', e);
      return false;
    }
  }

  // ========== CRUD CATEGORIES ==========
  function createCategory({ name, parentId = null, icon = '', color = '#888' }) {
    if (!name || !name.trim()) throw new Error('name required');
    const cat = {
      id: state.nextCatId++,
      name: name.trim(),
      parentId: parentId,
      order: siblingsOf(parentId).length,
      icon, color,
      productIds: [],
      createdAt: Date.now(),
    };
    state.categories.push(cat);
    persist();
    emit('category:created', cat);
    emit('tree:changed');
    return cat;
  }
  function readCategory(id) {
    return state.categories.find(c => c.id === id) || null;
  }
  function updateCategory(id, patch) {
    const cat = readCategory(id);
    if (!cat) return null;
    if (patch.parentId !== undefined && patch.parentId !== cat.parentId) {
      if (wouldCreateCycle(id, patch.parentId)) {
        throw new Error('Cannot move a category into one of its descendants');
      }
    }
    Object.assign(cat, patch);
    persist();
    emit('category:updated', cat);
    emit('tree:changed');
    return cat;
  }
  function deleteCategory(id, { cascade = false } = {}) {
    const cat = readCategory(id);
    if (!cat) return false;
    const kids = childrenOf(id);
    if (kids.length && !cascade) {
      throw new Error('Category has children. Pass {cascade:true} or move them first.');
    }
    if (cascade) kids.forEach(k => deleteCategory(k.id, { cascade: true }));
    // unassign products
    state.products.forEach(p => { if (p.categoryId === id) p.categoryId = null; });
    state.categories = state.categories.filter(c => c.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    persist();
    emit('category:deleted', { id });
    emit('tree:changed');
    return true;
  }
  function listCategories() { return state.categories.slice(); }

  // ========== CRUD PRODUCTS ==========
  function createProduct({ name, categoryId = null, price = 0, stock = 0 }) {
    if (!name) throw new Error('product name required');
    const prod = {
      id: state.nextProdId++,
      name: name.trim(),
      categoryId, price: +price, stock: +stock,
      createdAt: Date.now(),
    };
    state.products.push(prod);
    if (categoryId != null) {
      const cat = readCategory(categoryId);
      if (cat) cat.productIds.push(prod.id);
    }
    persist();
    emit('product:created', prod);
    return prod;
  }
  function updateProduct(id, patch) {
    const p = state.products.find(x => x.id === id);
    if (!p) return null;
    if (patch.categoryId !== undefined && patch.categoryId !== p.categoryId) {
      const oldCat = readCategory(p.categoryId);
      if (oldCat) oldCat.productIds = oldCat.productIds.filter(pid => pid !== id);
      const newCat = readCategory(patch.categoryId);
      if (newCat) newCat.productIds.push(id);
    }
    Object.assign(p, patch);
    persist();
    emit('product:updated', p);
    return p;
  }
  function deleteProduct(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return false;
    state.products = state.products.filter(x => x.id !== id);
    const cat = readCategory(p.categoryId);
    if (cat) cat.productIds = cat.productIds.filter(pid => pid !== id);
    persist();
    emit('product:deleted', { id });
    return true;
  }
  function productsByCategory(categoryId, { recursive = false } = {}) {
    if (!recursive) return state.products.filter(p => p.categoryId === categoryId);
    const ids = new Set([categoryId, ...descendantIds(categoryId)]);
    return state.products.filter(p => ids.has(p.categoryId));
  }

  // ========== TREE HELPERS ==========
  function rootCategories() {
    return state.categories
      .filter(c => c.parentId == null)
      .sort((a, b) => a.order - b.order);
  }
  function childrenOf(id) {
    return state.categories
      .filter(c => c.parentId === id)
      .sort((a, b) => a.order - b.order);
  }
  function siblingsOf(parentId) {
    return state.categories.filter(c => c.parentId === parentId);
  }
  function descendantIds(id) {
    const out = [];
    function walk(pid) {
      childrenOf(pid).forEach(ch => { out.push(ch.id); walk(ch.id); });
    }
    walk(id);
    return out;
  }
  function ancestorsOf(id) {
    const chain = [];
    let cur = readCategory(id);
    while (cur && cur.parentId != null) {
      const p = readCategory(cur.parentId);
      if (!p) break;
      chain.unshift(p);
      cur = p;
    }
    return chain;
  }
  function wouldCreateCycle(id, newParentId) {
    if (newParentId == null) return false;
    if (newParentId === id) return true;
    return descendantIds(id).includes(newParentId);
  }
  function buildTree() {
    function node(c) {
      return {
        ...c,
        count: countItems(c.id, true),
        directCount: countItems(c.id, false),
        children: childrenOf(c.id).map(node),
      };
    }
    return rootCategories().map(node);
  }
  function countItems(id, recursive = false) {
    if (!recursive) return state.products.filter(p => p.categoryId === id).length;
    const ids = new Set([id, ...descendantIds(id)]);
    return state.products.filter(p => ids.has(p.categoryId)).length;
  }

  // ========== REORDER ==========
  function reorder(id, newIndex) {
    const cat = readCategory(id);
    if (!cat) return false;
    const sibs = childrenOf(cat.parentId);
    const filtered = sibs.filter(s => s.id !== id);
    const clamped = Math.max(0, Math.min(newIndex, filtered.length));
    filtered.splice(clamped, 0, cat);
    filtered.forEach((s, i) => { s.order = i; });
    persist();
    emit('tree:changed');
    return true;
  }
  function moveCategory(id, newParentId, newIndex = -1) {
    if (wouldCreateCycle(id, newParentId)) {
      throw new Error('Cannot move into descendant');
    }
    const cat = readCategory(id);
    if (!cat) return false;
    cat.parentId = newParentId;
    const sibs = childrenOf(newParentId).filter(s => s.id !== id);
    const idx = newIndex < 0 ? sibs.length : Math.min(newIndex, sibs.length);
    sibs.splice(idx, 0, cat);
    sibs.forEach((s, i) => { s.order = i; });
    persist();
    emit('category:moved', { id, newParentId, newIndex: idx });
    emit('tree:changed');
    return true;
  }

  // ========== BREADCRUMBS ==========
  function selectCategory(id) {
    state.selectedId = id;
    const cat = readCategory(id);
    state.breadcrumbs = cat ? [...ancestorsOf(id), cat] : [];
    emit('selection:changed', { id, breadcrumbs: state.breadcrumbs });
    return state.breadcrumbs;
  }
  function getBreadcrumbs() { return state.breadcrumbs.slice(); }

  // ========== FILTERS ==========
  function setFilter(patch) {
    Object.assign(state.filters, patch);
    emit('filter:changed', state.filters);
  }
  function applyFilters(tree = buildTree()) {
    const f = state.filters;
    function visit(node) {
      const kids = node.children.map(visit).filter(Boolean);
      const matchSearch = !f.search ||
        node.name.toLowerCase().includes(f.search.toLowerCase());
      const matchCount = node.count >= (f.minCount || 0);
      const matchEmpty = !f.onlyEmpty || node.count === 0;
      const matchWith = !f.onlyWithProducts || node.count > 0;
      const ok = matchSearch && matchCount && matchEmpty && matchWith;
      if (ok || kids.length) return { ...node, children: kids };
      return null;
    }
    return tree.map(visit).filter(Boolean);
  }

  // ========== DRAG-DROP RENDER ==========
  function render(container) {
    const el = typeof container === 'string'
      ? document.querySelector(container) : container;
    if (!el) return;
    const tree = applyFilters();
    el.innerHTML = '';
    el.appendChild(renderBreadcrumbsEl());
    el.appendChild(renderFiltersEl());
    const ul = document.createElement('ul');
    ul.className = 'volvix-cat-tree';
    tree.forEach(n => ul.appendChild(renderNode(n)));
    el.appendChild(ul);
    el.appendChild(renderProductsPaneEl());
  }
  function renderNode(node) {
    const li = document.createElement('li');
    li.className = 'volvix-cat-node';
    li.dataset.id = node.id;
    li.draggable = true;
    li.innerHTML = `
      <span class="cat-handle">::</span>
      <span class="cat-icon" style="color:${node.color}">${node.icon || '#'}</span>
      <span class="cat-name">${escapeHtml(node.name)}</span>
      <span class="cat-count">(${node.count})</span>
    `;
    li.addEventListener('click', (e) => { e.stopPropagation(); selectCategory(node.id); });
    li.addEventListener('dragstart', (e) => {
      state.dragSrc = node.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(node.id));
    });
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const srcId = state.dragSrc;
      if (srcId && srcId !== node.id) {
        try { moveCategory(srcId, node.id); render(li.closest('.volvix-cat-root') || document.body); }
        catch (err) { console.warn(err.message); }
      }
      state.dragSrc = null;
    });
    if (node.children && node.children.length) {
      const ul = document.createElement('ul');
      node.children.forEach(ch => ul.appendChild(renderNode(ch)));
      li.appendChild(ul);
    }
    return li;
  }
  function renderBreadcrumbsEl() {
    const nav = document.createElement('nav');
    nav.className = 'volvix-cat-breadcrumbs';
    nav.innerHTML = state.breadcrumbs
      .map((c, i, a) => `<a data-id="${c.id}">${escapeHtml(c.name)}</a>${i < a.length - 1 ? ' / ' : ''}`)
      .join('');
    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => selectCategory(+a.dataset.id));
    });
    return nav;
  }
  function renderFiltersEl() {
    const div = document.createElement('div');
    div.className = 'volvix-cat-filters';
    div.innerHTML = `
      <input type="search" placeholder="Buscar..." value="${state.filters.search}" />
      <label><input type="checkbox" ${state.filters.onlyWithProducts ? 'checked' : ''}/> Con productos</label>
      <label><input type="checkbox" ${state.filters.onlyEmpty ? 'checked' : ''}/> Vacías</label>
    `;
    const [search, withCb, emptyCb] = div.querySelectorAll('input');
    search.addEventListener('input', () => { setFilter({ search: search.value }); });
    withCb.addEventListener('change', () => setFilter({ onlyWithProducts: withCb.checked }));
    emptyCb.addEventListener('change', () => setFilter({ onlyEmpty: emptyCb.checked }));
    return div;
  }
  function renderProductsPaneEl() {
    const pane = document.createElement('div');
    pane.className = 'volvix-cat-products';
    if (state.selectedId == null) {
      pane.textContent = 'Selecciona una categoría';
      return pane;
    }
    const items = productsByCategory(state.selectedId, { recursive: true });
    pane.innerHTML = `<h4>Productos (${items.length})</h4>` +
      '<ul>' + items.map(p =>
        `<li>${escapeHtml(p.name)} — $${p.price.toFixed(2)} (stock ${p.stock})</li>`
      ).join('') + '</ul>';
    return pane;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  // ========== IMPORT/EXPORT ==========
  function exportJSON() {
    return JSON.stringify({
      categories: state.categories,
      products: state.products,
    }, null, 2);
  }
  function importJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    state.categories = data.categories || [];
    state.products = data.products || [];
    state.nextCatId = Math.max(0, ...state.categories.map(c => c.id)) + 1;
    state.nextProdId = Math.max(0, ...state.products.map(p => p.id)) + 1;
    persist();
    emit('tree:changed');
  }

  // ========== INIT ==========
  function init() {
    if (!restore()) {
      // seed sample
      const food = createCategory({ name: 'Alimentos', icon: 'F', color: '#e67e22' });
      const drinks = createCategory({ name: 'Bebidas', icon: 'B', color: '#3498db' });
      createCategory({ name: 'Snacks', parentId: food.id });
      createCategory({ name: 'Refrescos', parentId: drinks.id });
    }
    emit('ready');
  }

  // ========== PUBLIC API ==========
  global.CategoriesAPI = {
    init, on,
    create: createCategory, read: readCategory, update: updateCategory, delete: deleteCategory,
    list: listCategories, tree: buildTree,
    children: childrenOf, ancestors: ancestorsOf, descendants: descendantIds,
    move: moveCategory, reorder,
    select: selectCategory, breadcrumbs: getBreadcrumbs,
    countItems,
    setFilter, getFilters: () => ({ ...state.filters }),
    products: {
      create: createProduct, update: updateProduct, delete: deleteProduct,
      byCategory: productsByCategory, list: () => state.products.slice(),
    },
    render,
    export: exportJSON, import: importJSON,
    _state: state, // debug
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
