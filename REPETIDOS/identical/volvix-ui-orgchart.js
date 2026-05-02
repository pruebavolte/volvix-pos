/* volvix-ui-orgchart.js
 * Volvix UI - Organizational Chart Component
 * Hierarchical visual chart with expand/collapse, photo + position
 * Exposes: window.OrgChart
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'volvix-orgchart-styles';
  const CSS = `
  .vx-org-root{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;overflow:auto;min-height:100%;box-sizing:border-box}
  .vx-org-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
  .vx-org-toolbar input[type=search]{flex:1;min-width:180px;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;transition:border .15s}
  .vx-org-toolbar input[type=search]:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
  .vx-org-btn{padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;color:#374151;transition:all .15s}
  .vx-org-btn:hover{background:#f3f4f6;border-color:#9ca3af}
  .vx-org-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
  .vx-org-btn.primary:hover{background:#1d4ed8}
  .vx-org-tree{list-style:none;padding:0;margin:0;display:flex;justify-content:center}
  .vx-org-tree ul{list-style:none;padding-top:24px;position:relative;display:flex;justify-content:center;flex-wrap:nowrap;margin:0}
  .vx-org-tree li{position:relative;padding:24px 8px 0 8px;text-align:center}
  .vx-org-tree li::before,.vx-org-tree li::after{content:'';position:absolute;top:0;border-top:2px solid #cbd5e1;width:50%;height:24px}
  .vx-org-tree li::before{right:50%;border-right:2px solid #cbd5e1;border-top-right-radius:8px}
  .vx-org-tree li::after{left:50%;border-left:2px solid #cbd5e1;border-top-left-radius:8px}
  .vx-org-tree li:only-child::before,.vx-org-tree li:only-child::after{display:none}
  .vx-org-tree li:only-child{padding-top:24px}
  .vx-org-tree li:first-child::before,.vx-org-tree li:last-child::after{border:0}
  .vx-org-tree li:last-child::before{border-right:2px solid #cbd5e1;border-top-right-radius:8px}
  .vx-org-tree li:first-child::after{border-left:2px solid #cbd5e1;border-top-left-radius:8px}
  .vx-org-tree>li{padding-top:0}
  .vx-org-tree>li::before,.vx-org-tree>li::after{display:none}
  .vx-org-tree ul::before{content:'';position:absolute;top:0;left:50%;border-left:2px solid #cbd5e1;height:24px}
  .vx-org-card{display:inline-flex;flex-direction:column;align-items:center;padding:14px 18px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;min-width:170px;max-width:220px;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:all .2s;cursor:pointer;position:relative}
  .vx-org-card:hover{box-shadow:0 6px 16px rgba(0,0,0,.08);border-color:#93c5fd;transform:translateY(-2px)}
  .vx-org-card.selected{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.18)}
  .vx-org-card.match{border-color:#f59e0b;background:#fffbeb}
  .vx-org-photo{width:64px;height:64px;border-radius:50%;object-fit:cover;background:#e5e7eb;margin-bottom:8px;border:2px solid #fff;box-shadow:0 0 0 2px #e5e7eb}
  .vx-org-photo-fallback{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:22px;margin-bottom:8px;border:2px solid #fff;box-shadow:0 0 0 2px #e5e7eb}
  .vx-org-name{font-weight:600;font-size:14px;color:#111827;line-height:1.3;margin:0}
  .vx-org-role{font-size:12px;color:#6b7280;margin-top:2px;line-height:1.3}
  .vx-org-dept{display:inline-block;margin-top:6px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;background:#eff6ff;color:#2563eb;border-radius:999px;font-weight:600}
  .vx-org-toggle{position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid #cbd5e1;color:#475569;font-size:14px;line-height:20px;text-align:center;cursor:pointer;font-weight:700;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.1);z-index:2}
  .vx-org-toggle:hover{background:#2563eb;color:#fff;border-color:#2563eb}
  .vx-org-collapsed>ul{display:none}
  .vx-org-empty{padding:40px;text-align:center;color:#9ca3af;font-style:italic}
  .vx-org-detail{position:fixed;top:0;right:0;width:340px;height:100%;background:#fff;border-left:1px solid #e5e7eb;box-shadow:-4px 0 24px rgba(0,0,0,.08);padding:24px;overflow-y:auto;transform:translateX(100%);transition:transform .25s;z-index:9999}
  .vx-org-detail.open{transform:translateX(0)}
  .vx-org-detail h3{margin:0 0 4px 0;font-size:18px}
  .vx-org-detail .close{position:absolute;top:12px;right:12px;background:transparent;border:0;font-size:22px;cursor:pointer;color:#6b7280}
  .vx-org-detail dl{margin:16px 0;font-size:13px}
  .vx-org-detail dt{font-weight:600;color:#374151;margin-top:10px}
  .vx-org-detail dd{margin:2px 0 0 0;color:#6b7280}
  @media (max-width:640px){.vx-org-card{min-width:130px;padding:10px}.vx-org-photo,.vx-org-photo-fallback{width:48px;height:48px;font-size:18px}.vx-org-detail{width:100%}}
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  function buildTree(flatList) {
    // Accepts either a tree (with children) or a flat list of {id, parentId, ...}
    if (!Array.isArray(flatList)) return flatList;
    if (flatList.length && flatList[0].children !== undefined && !flatList.some(n => n.parentId)) {
      return flatList;
    }
    const map = {};
    flatList.forEach(n => { map[n.id] = Object.assign({}, n, { children: [] }); });
    const roots = [];
    flatList.forEach(n => {
      if (n.parentId && map[n.parentId]) map[n.parentId].children.push(map[n.id]);
      else roots.push(map[n.id]);
    });
    return roots;
  }

  function OrgChart(options) {
    if (!(this instanceof OrgChart)) return new OrgChart(options);
    this.options = Object.assign({
      container: null,
      data: [],
      collapsibleAt: 0,
      onSelect: null,
      showToolbar: true,
      showDetail: true
    }, options || {});
    this.selected = null;
    this._collapsed = new Set();
    this._init();
  }

  OrgChart.prototype._init = function () {
    injectStyles();
    const c = typeof this.options.container === 'string'
      ? document.querySelector(this.options.container)
      : this.options.container;
    if (!c) throw new Error('OrgChart: container not found');
    this.container = c;
    this.container.classList.add('vx-org-root');
    this.tree = buildTree(this.options.data);
    this._render();
  };

  OrgChart.prototype._render = function () {
    this.container.innerHTML = '';
    if (this.options.showToolbar) this._renderToolbar();
    const treeWrap = document.createElement('ul');
    treeWrap.className = 'vx-org-tree';
    if (!this.tree || (Array.isArray(this.tree) && this.tree.length === 0)) {
      const e = document.createElement('div');
      e.className = 'vx-org-empty';
      e.textContent = 'Sin datos para mostrar';
      this.container.appendChild(e);
      return;
    }
    const roots = Array.isArray(this.tree) ? this.tree : [this.tree];
    roots.forEach(r => treeWrap.appendChild(this._renderNode(r, 0)));
    this.container.appendChild(treeWrap);
    if (this.options.showDetail) this._ensureDetailPanel();
  };

  OrgChart.prototype._renderToolbar = function () {
    const tb = document.createElement('div');
    tb.className = 'vx-org-toolbar';
    tb.innerHTML = `
      <input type="search" placeholder="Buscar por nombre, cargo o departamento..." />
      <button class="vx-org-btn" data-action="expand">Expandir todo</button>
      <button class="vx-org-btn" data-action="collapse">Colapsar todo</button>
      <button class="vx-org-btn primary" data-action="export">Exportar</button>
    `;
    this.container.appendChild(tb);
    const input = tb.querySelector('input');
    input.addEventListener('input', e => this._search(e.target.value));
    tb.querySelector('[data-action=expand]').addEventListener('click', () => this.expandAll());
    tb.querySelector('[data-action=collapse]').addEventListener('click', () => this.collapseAll());
    tb.querySelector('[data-action=export]').addEventListener('click', () => this.exportJSON());
  };

  OrgChart.prototype._renderNode = function (node, depth) {
    const li = document.createElement('li');
    li.dataset.id = node.id;
    const card = document.createElement('div');
    card.className = 'vx-org-card';
    card.dataset.id = node.id;

    let photoHtml;
    if (node.photo) {
      photoHtml = `<img class="vx-org-photo" src="${escapeHtml(node.photo)}" alt="${escapeHtml(node.name||'')}" onerror="this.outerHTML='<div class=\\'vx-org-photo-fallback\\'>${escapeHtml(initials(node.name))}</div>'"/>`;
    } else {
      photoHtml = `<div class="vx-org-photo-fallback">${escapeHtml(initials(node.name))}</div>`;
    }
    const deptHtml = node.department
      ? `<span class="vx-org-dept">${escapeHtml(node.department)}</span>`
      : '';
    card.innerHTML = `
      ${photoHtml}
      <p class="vx-org-name">${escapeHtml(node.name || 'Sin nombre')}</p>
      <span class="vx-org-role">${escapeHtml(node.role || node.title || '')}</span>
      ${deptHtml}
    `;
    card.addEventListener('click', e => {
      e.stopPropagation();
      this._select(node, card);
    });
    li.appendChild(card);

    const hasChildren = node.children && node.children.length;
    if (hasChildren) {
      const toggle = document.createElement('button');
      toggle.className = 'vx-org-toggle';
      toggle.type = 'button';
      toggle.textContent = this._collapsed.has(node.id) ? '+' : '−';
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        this.toggleNode(node.id);
      });
      card.appendChild(toggle);

      if (!this._collapsed.has(node.id)) {
        const ul = document.createElement('ul');
        node.children.forEach(ch => ul.appendChild(this._renderNode(ch, depth + 1)));
        li.appendChild(ul);
      } else {
        li.classList.add('vx-org-collapsed');
      }
    }
    return li;
  };

  OrgChart.prototype._select = function (node, cardEl) {
    this.container.querySelectorAll('.vx-org-card.selected')
      .forEach(el => el.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');
    this.selected = node;
    if (typeof this.options.onSelect === 'function') {
      try { this.options.onSelect(node); } catch (e) { console.error(e); }
    }
    if (this.options.showDetail) this._showDetail(node);
  };

  OrgChart.prototype._ensureDetailPanel = function () {
    if (this._detail) return;
    const d = document.createElement('aside');
    d.className = 'vx-org-detail';
    d.innerHTML = `<button class="close" type="button">&times;</button><div class="content"></div>`;
    document.body.appendChild(d);
    d.querySelector('.close').addEventListener('click', () => d.classList.remove('open'));
    this._detail = d;
  };

  OrgChart.prototype._showDetail = function (node) {
    if (!this._detail) return;
    const c = this._detail.querySelector('.content');
    const photo = node.photo
      ? `<img class="vx-org-photo" style="width:96px;height:96px" src="${escapeHtml(node.photo)}"/>`
      : `<div class="vx-org-photo-fallback" style="width:96px;height:96px;font-size:32px">${escapeHtml(initials(node.name))}</div>`;
    const extras = Object.keys(node)
      .filter(k => !['id','parentId','name','role','title','photo','children','department'].includes(k))
      .map(k => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(node[k])}</dd>`).join('');
    c.innerHTML = `
      <div style="text-align:center">${photo}</div>
      <h3 style="text-align:center;margin-top:12px">${escapeHtml(node.name || '')}</h3>
      <p style="text-align:center;color:#6b7280;margin:4px 0">${escapeHtml(node.role || node.title || '')}</p>
      ${node.department ? `<p style="text-align:center"><span class="vx-org-dept">${escapeHtml(node.department)}</span></p>` : ''}
      <dl>
        ${node.email ? `<dt>Email</dt><dd><a href="mailto:${escapeHtml(node.email)}">${escapeHtml(node.email)}</a></dd>` : ''}
        ${node.phone ? `<dt>Teléfono</dt><dd>${escapeHtml(node.phone)}</dd>` : ''}
        ${extras}
        <dt>Reportes directos</dt><dd>${(node.children||[]).length}</dd>
      </dl>
    `;
    this._detail.classList.add('open');
  };

  OrgChart.prototype._search = function (term) {
    const t = (term || '').toLowerCase().trim();
    const cards = this.container.querySelectorAll('.vx-org-card');
    cards.forEach(card => {
      card.classList.remove('match');
      if (!t) return;
      const txt = card.textContent.toLowerCase();
      if (txt.indexOf(t) !== -1) {
        card.classList.add('match');
        let p = card.parentElement;
        while (p && p !== this.container) {
          if (p.classList && p.classList.contains('vx-org-collapsed')) {
            const id = p.dataset.id;
            if (id) this._collapsed.delete(id);
          }
          p = p.parentElement;
        }
      }
    });
    if (t) this._render();
  };

  OrgChart.prototype.toggleNode = function (id) {
    if (this._collapsed.has(id)) this._collapsed.delete(id);
    else this._collapsed.add(id);
    this._render();
  };

  OrgChart.prototype._walk = function (nodes, fn) {
    (nodes || []).forEach(n => { fn(n); if (n.children) this._walk(n.children, fn); });
  };

  OrgChart.prototype.expandAll = function () {
    this._collapsed.clear();
    this._render();
  };

  OrgChart.prototype.collapseAll = function () {
    this._collapsed.clear();
    const roots = Array.isArray(this.tree) ? this.tree : [this.tree];
    this._walk(roots, n => { if (n.children && n.children.length) this._collapsed.add(n.id); });
    // Keep top-level visible
    roots.forEach(r => this._collapsed.delete(r.id));
    this._render();
  };

  OrgChart.prototype.setData = function (data) {
    this.options.data = data;
    this.tree = buildTree(data);
    this._collapsed.clear();
    this._render();
  };

  OrgChart.prototype.findNode = function (id) {
    let found = null;
    const roots = Array.isArray(this.tree) ? this.tree : [this.tree];
    this._walk(roots, n => { if (n.id === id) found = n; });
    return found;
  };

  OrgChart.prototype.exportJSON = function () {
    const data = JSON.stringify(this.tree, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orgchart.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  OrgChart.prototype.destroy = function () {
    if (this._detail && this._detail.parentNode) this._detail.parentNode.removeChild(this._detail);
    this.container.innerHTML = '';
    this.container.classList.remove('vx-org-root');
  };

  // Demo data helper
  OrgChart.demoData = function () {
    return [
      { id: 'ceo', name: 'Ana Martínez', role: 'CEO', department: 'Dirección', email: 'ana@volvix.com' },
      { id: 'cto', parentId: 'ceo', name: 'Luis Pérez', role: 'CTO', department: 'Tecnología' },
      { id: 'cfo', parentId: 'ceo', name: 'María Gómez', role: 'CFO', department: 'Finanzas' },
      { id: 'coo', parentId: 'ceo', name: 'Carlos Ruiz', role: 'COO', department: 'Operaciones' },
      { id: 'dev1', parentId: 'cto', name: 'Pedro Silva', role: 'Lead Dev', department: 'Tecnología' },
      { id: 'dev2', parentId: 'cto', name: 'Laura Díaz', role: 'QA Lead', department: 'Tecnología' },
      { id: 'fin1', parentId: 'cfo', name: 'Jorge Núñez', role: 'Contador', department: 'Finanzas' },
      { id: 'op1', parentId: 'coo', name: 'Sofía López', role: 'Logística', department: 'Operaciones' }
    ];
  };

  global.OrgChart = OrgChart;
})(typeof window !== 'undefined' ? window : this);
