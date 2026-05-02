/* R17 BUNDLES — Frontend wiring
 * Adds a "Bundles" tab inside the F3 Products screen with a drag-based
 * component picker. Loads on demand; integrates with /api/bundles.
 *
 * Dependencies: window.api (or fetch), F3 modal pattern.
 * Usage: <script src="/volvix-bundles-wiring.js" defer></script>
 */
(function () {
  'use strict';

  // VxUI: VolvixUI con fallback nativo
  const _w = window;
  const VxUI = {
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') _w.VolvixUI.toast({ type, message });
      else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message); }
    },
    async destructiveConfirm(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.destructiveConfirm === 'function')
        return !!(await _w.VolvixUI.destructiveConfirm(opts));
      const fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
    }
  };

  if (window.__volvixBundlesWired) return;
  window.__volvixBundlesWired = true;

  const API = (window.API_BASE || '') + '/api';
  const fetchJSON = async (url, opts = {}) => {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {},
      window.__authHeaders ? window.__authHeaders() : {}
    );
    const r = await fetch(url, Object.assign({}, opts, { headers }));
    return r.json();
  };

  const state = {
    bundles: [],
    products: [],
    editing: null
  };

  async function loadBundles() {
    const r = await fetchJSON(`${API}/bundles`);
    state.bundles = (r && r.items) || [];
    renderList();
  }
  async function loadProducts() {
    if (state.products.length) return;
    const r = await fetchJSON(`${API}/products`);
    state.products = (r && (r.items || r.products)) || [];
  }

  function el(tag, attrs = {}, kids = []) {
    const n = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'style') n.style.cssText = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function ensureRoot() {
    let root = document.getElementById('volvix-bundles-root');
    if (root) return root;
    root = el('div', { id: 'volvix-bundles-root', class: 'volvix-bundles' });
    root.innerHTML = `
      <style>
        .volvix-bundles { padding:12px; font-family:system-ui,sans-serif; }
        .vb-row { display:flex; gap:12px; align-items:flex-start; }
        .vb-col { flex:1; min-width:260px; }
        .vb-list { border:1px solid #ddd; border-radius:6px; max-height:340px; overflow:auto; }
        .vb-item { padding:8px 10px; border-bottom:1px solid #eee; cursor:grab; user-select:none; }
        .vb-item:hover { background:#f5f7fa; }
        .vb-drop { min-height:200px; border:2px dashed #b8c2cc; border-radius:6px; padding:8px; }
        .vb-drop.drag-over { background:#eef6ff; border-color:#3b82f6; }
        .vb-comp { display:flex; gap:6px; align-items:center; padding:6px; background:#f0f4f8; margin:4px 0; border-radius:4px; }
        .vb-comp input { width:60px; }
        .vb-toolbar { display:flex; gap:8px; margin-bottom:10px; }
        .vb-btn { padding:6px 12px; border:1px solid #3b82f6; background:#3b82f6; color:white; border-radius:4px; cursor:pointer; }
        .vb-btn.secondary { background:white; color:#3b82f6; }
        .vb-bundle-card { padding:10px; border:1px solid #ddd; border-radius:6px; margin:6px 0; }
      </style>
      <div class="vb-toolbar">
        <button class="vb-btn" id="vb-new">+ Nuevo combo</button>
        <button class="vb-btn secondary" id="vb-refresh">Recargar</button>
      </div>
      <div id="vb-list-container"></div>
      <div id="vb-editor" style="display:none; margin-top:16px;">
        <div class="vb-row">
          <div class="vb-col">
            <h4>Productos disponibles (arrastra)</h4>
            <input id="vb-search" placeholder="Buscar..." style="width:100%; padding:6px; margin-bottom:6px;">
            <div class="vb-list" id="vb-products"></div>
          </div>
          <div class="vb-col">
            <h4>Componentes del combo</h4>
            <input id="vb-name" placeholder="Nombre del combo" style="width:100%; padding:6px; margin-bottom:6px;">
            <input id="vb-sku" placeholder="SKU" style="width:48%; padding:6px; margin-bottom:6px;">
            <input id="vb-price" type="number" step="0.01" placeholder="Precio" style="width:48%; padding:6px; margin-bottom:6px;">
            <div class="vb-drop" id="vb-drop"><em>Arrastra productos aquí</em></div>
            <div style="margin-top:10px;">
              <button class="vb-btn" id="vb-save">Guardar combo</button>
              <button class="vb-btn secondary" id="vb-cancel">Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return root;
  }

  function renderList() {
    const c = document.getElementById('vb-list-container');
    if (!c) return;
    c.innerHTML = '';
    if (!state.bundles.length) {
      c.appendChild(el('p', {}, 'No hay combos. Crea el primero.'));
      return;
    }
    state.bundles.forEach(b => {
      const card = el('div', { class: 'vb-bundle-card' });
      card.innerHTML = `
        <strong>${b.name}</strong> ${b.sku ? `<small>(${b.sku})</small>` : ''}
        <span style="float:right;">$${Number(b.price||0).toFixed(2)}</span>
        <div><small>${(b.components||[]).length} componentes</small></div>
      `;
      const actions = el('div', { style: 'margin-top:6px;' });
      actions.appendChild(el('button', {
        class: 'vb-btn secondary',
        onclick: () => editBundle(b)
      }, 'Editar'));
      actions.appendChild(el('button', {
        class: 'vb-btn secondary',
        style: 'margin-left:6px;',
        onclick: () => deleteBundle(b)
      }, 'Eliminar'));
      card.appendChild(actions);
      c.appendChild(card);
    });
  }

  function renderProducts(filter = '') {
    const c = document.getElementById('vb-products');
    if (!c) return;
    c.innerHTML = '';
    const f = filter.toLowerCase();
    state.products
      .filter(p => !f || (p.name || '').toLowerCase().includes(f) || (p.sku || '').toLowerCase().includes(f))
      .slice(0, 200)
      .forEach(p => {
        const item = el('div', {
          class: 'vb-item',
          draggable: 'true',
          'data-id': p.id
        }, `${p.name || ''} ${p.sku ? `(${p.sku})` : ''}`);
        item.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ id: p.id, name: p.name }));
        });
        c.appendChild(item);
      });
  }

  function renderDrop(components) {
    const drop = document.getElementById('vb-drop');
    drop.innerHTML = '';
    if (!components.length) {
      drop.appendChild(el('em', {}, 'Arrastra productos aquí'));
      return;
    }
    components.forEach((c, idx) => {
      const prod = state.products.find(p => p.id === c.product_id) || { name: `#${c.product_id}` };
      const row = el('div', { class: 'vb-comp' });
      row.appendChild(el('span', { style: 'flex:1;' }, prod.name));
      const qty = el('input', { type: 'number', min: '1', value: c.qty || 1 });
      qty.addEventListener('input', () => { c.qty = Number(qty.value) || 1; });
      row.appendChild(qty);
      row.appendChild(el('button', {
        class: 'vb-btn secondary',
        onclick: () => { components.splice(idx, 1); renderDrop(components); }
      }, 'X'));
      drop.appendChild(row);
    });
  }

  function newBundle() {
    state.editing = { name: '', sku: '', price: 0, components: [] };
    showEditor();
  }
  function editBundle(b) {
    state.editing = JSON.parse(JSON.stringify(b));
    showEditor();
  }
  async function deleteBundle(b) {
    if (!await VxUI.destructiveConfirm({ title: 'Eliminar combo', message: `¿Eliminar combo "${b.name}"?`, confirmText: 'Eliminar', requireText: 'ELIMINAR' })) return;
    await fetchJSON(`${API}/bundles/${b.id}`, { method: 'DELETE' });
    loadBundles();
  }

  async function showEditor() {
    document.getElementById('vb-editor').style.display = 'block';
    await loadProducts();
    renderProducts();
    document.getElementById('vb-name').value = state.editing.name || '';
    document.getElementById('vb-sku').value = state.editing.sku || '';
    document.getElementById('vb-price').value = state.editing.price || 0;
    renderDrop(state.editing.components);
  }

  async function saveBundle() {
    const e = state.editing;
    e.name = document.getElementById('vb-name').value.trim();
    e.sku = document.getElementById('vb-sku').value.trim();
    e.price = Number(document.getElementById('vb-price').value || 0);
    if (!e.name || !e.components.length) {
      VxUI.toast('error', 'Nombre y al menos 1 componente requeridos');
      return;
    }
    const url = e.id ? `${API}/bundles/${e.id}` : `${API}/bundles`;
    const method = e.id ? 'PATCH' : 'POST';
    await fetchJSON(url, { method, body: JSON.stringify(e) });
    document.getElementById('vb-editor').style.display = 'none';
    state.editing = null;
    loadBundles();
  }

  function wireEditor(root) {
    root.querySelector('#vb-new').addEventListener('click', newBundle);
    root.querySelector('#vb-refresh').addEventListener('click', loadBundles);
    root.querySelector('#vb-cancel').addEventListener('click', () => {
      document.getElementById('vb-editor').style.display = 'none';
      state.editing = null;
    });
    root.querySelector('#vb-save').addEventListener('click', saveBundle);
    root.querySelector('#vb-search').addEventListener('input', e => renderProducts(e.target.value));

    const drop = root.querySelector('#vb-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag-over');
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (!state.editing) return;
        const existing = state.editing.components.find(c => c.product_id === data.id);
        if (existing) existing.qty++;
        else state.editing.components.push({ product_id: data.id, qty: 1 });
        renderDrop(state.editing.components);
      } catch (_) {}
    });
  }

  function mountTab() {
    // Hook into existing F3 Products modal/tabs if present
    const tabs = document.querySelector('[data-f3-tabs], .f3-products-tabs, #productsTabs');
    if (!tabs) return false;
    if (document.getElementById('vb-tab-btn')) return true;

    const btn = el('button', {
      id: 'vb-tab-btn',
      class: 'tab-btn',
      onclick: () => {
        document.querySelectorAll('[data-f3-tab]').forEach(t => t.style.display = 'none');
        const root = ensureRoot();
        if (!root.parentElement) {
          tabs.parentElement.appendChild(root);
          wireEditor(root);
        }
        root.style.display = 'block';
        loadBundles();
      }
    }, 'Combos');
    tabs.appendChild(btn);
    return true;
  }

  // Expose for manual mount
  window.VolvixBundles = {
    open: () => {
      const root = ensureRoot();
      if (!root.parentElement) {
        document.body.appendChild(root);
        wireEditor(root);
      }
      root.style.display = 'block';
      loadBundles();
    },
    reload: loadBundles
  };

  // Auto-mount when DOM is ready
  if (document.readyState !== 'loading') {
    setTimeout(mountTab, 200);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(mountTab, 200));
  }
})();
