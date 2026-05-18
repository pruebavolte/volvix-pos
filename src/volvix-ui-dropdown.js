/**
 * volvix-ui-dropdown.js
 * UI Dropdown component: searchable, multi-select, async load, virtual scroll, tags.
 * Exposes: window.Dropdown
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'volvix-dropdown-styles';
  const CSS = `
.vx-dd{position:relative;display:inline-block;min-width:220px;font-family:system-ui,sans-serif;font-size:14px}
.vx-dd *{box-sizing:border-box}
.vx-dd-control{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:36px;padding:4px 28px 4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer}
.vx-dd-control:hover{border-color:#94a3b8}
.vx-dd.open .vx-dd-control{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.15)}
.vx-dd-placeholder{color:#94a3b8}
.vx-dd-tag{display:inline-flex;align-items:center;gap:4px;background:#e0e7ff;color:#1e3a8a;padding:2px 6px;border-radius:4px;font-size:12px}
.vx-dd-tag-x{cursor:pointer;font-weight:bold;opacity:.6}
.vx-dd-tag-x:hover{opacity:1}
.vx-dd-arrow{position:absolute;right:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:#64748b}
.vx-dd-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:9999;display:none;max-height:280px;overflow:hidden;flex-direction:column}
.vx-dd.open .vx-dd-panel{display:flex}
.vx-dd-search{padding:6px;border-bottom:1px solid #e2e8f0}
.vx-dd-search input{width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;outline:none;font-size:13px}
.vx-dd-search input:focus{border-color:#2563eb}
.vx-dd-list{flex:1;overflow-y:auto;position:relative}
.vx-dd-vscroll{position:relative;width:100%}
.vx-dd-opt{padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vx-dd-opt:hover,.vx-dd-opt.active{background:#f1f5f9}
.vx-dd-opt.selected{background:#dbeafe;color:#1e3a8a}
.vx-dd-opt input[type=checkbox]{margin:0}
.vx-dd-empty,.vx-dd-loading{padding:12px;text-align:center;color:#64748b;font-size:13px}
.vx-dd-spinner{display:inline-block;width:14px;height:14px;border:2px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:vx-spin .7s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes vx-spin{to{transform:rotate(360deg)}}
`;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const ROW_HEIGHT = 30;
  const VIRTUAL_BUFFER = 4;

  class Dropdown {
    constructor(el, opts) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) throw new Error('Dropdown: element not found');
      injectStyles();

      this.host = el;
      this.opts = Object.assign({
        options: [],
        multi: false,
        placeholder: 'Selecciona...',
        searchable: true,
        async: null,        // function(query) -> Promise<array>
        labelKey: 'label',
        valueKey: 'value',
        maxTags: 5,
        onChange: null,
        virtualThreshold: 50
      }, opts || {});

      this.state = {
        open: false,
        query: '',
        items: this._normalize(this.opts.options),
        filtered: [],
        selected: [],
        active: -1,
        loading: false,
        scrollTop: 0
      };
      this.state.filtered = this.state.items.slice();

      this._build();
      this._bind();
      this._render();
    }

    _normalize(arr) {
      const lk = this.opts.labelKey, vk = this.opts.valueKey;
      return (arr || []).map(o => {
        if (o == null) return null;
        if (typeof o === 'string' || typeof o === 'number') return { label: String(o), value: o };
        return { label: String(o[lk] ?? o.label ?? o.value), value: o[vk] ?? o.value };
      }).filter(Boolean);
    }

    _build() {
      const root = document.createElement('div');
      root.className = 'vx-dd';
      root.innerHTML = `
        <div class="vx-dd-control" tabindex="0">
          <span class="vx-dd-values"></span>
          <span class="vx-dd-arrow">▼</span>
        </div>
        <div class="vx-dd-panel">
          ${this.opts.searchable ? '<div class="vx-dd-search"><input type="text" placeholder="Buscar..."/></div>' : ''}
          <div class="vx-dd-list"><div class="vx-dd-vscroll"></div></div>
        </div>`;
      this.host.appendChild(root);
      this.root = root;
      this.elControl = root.querySelector('.vx-dd-control');
      this.elValues = root.querySelector('.vx-dd-values');
      this.elPanel = root.querySelector('.vx-dd-panel');
      this.elSearch = root.querySelector('.vx-dd-search input');
      this.elList = root.querySelector('.vx-dd-list');
      this.elVScroll = root.querySelector('.vx-dd-vscroll');
    }

    _bind() {
      this.elControl.addEventListener('click', (e) => {
        if (e.target.classList.contains('vx-dd-tag-x')) return;
        this.toggle();
      });
      this.elControl.addEventListener('keydown', (e) => this._onKey(e));
      if (this.elSearch) {
        this.elSearch.addEventListener('input', (e) => {
          this.state.query = e.target.value;
          if (this.opts.async) this._loadAsync(this.state.query);
          else this._filter();
        });
        this.elSearch.addEventListener('keydown', (e) => this._onKey(e));
      }
      this.elList.addEventListener('scroll', () => {
        this.state.scrollTop = this.elList.scrollTop;
        this._renderList();
      });
      this._docClick = (e) => { if (!this.root.contains(e.target)) this.close(); };
      document.addEventListener('mousedown', this._docClick);
    }

    _onKey(e) {
      const k = e.key;
      if (k === 'Escape') { this.close(); return; }
      if (k === 'Enter') {
        e.preventDefault();
        if (!this.state.open) { this.open(); return; }
        if (this.state.active >= 0) this._toggleItem(this.state.filtered[this.state.active]);
        return;
      }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        if (!this.state.open) this.open();
        const dir = k === 'ArrowDown' ? 1 : -1;
        const n = this.state.filtered.length;
        if (!n) return;
        this.state.active = (this.state.active + dir + n) % n;
        this._scrollToActive();
        this._renderList();
      }
    }

    _scrollToActive() {
      const top = this.state.active * ROW_HEIGHT;
      const h = this.elList.clientHeight;
      if (top < this.elList.scrollTop) this.elList.scrollTop = top;
      else if (top + ROW_HEIGHT > this.elList.scrollTop + h) this.elList.scrollTop = top + ROW_HEIGHT - h;
    }

    _filter() {
      const q = this.state.query.trim().toLowerCase();
      this.state.filtered = !q ? this.state.items.slice()
        : this.state.items.filter(i => i.label.toLowerCase().includes(q));
      this.state.active = this.state.filtered.length ? 0 : -1;
      this._renderList();
    }

    _loadAsync(q) {
      const p = this.opts.async(q);
      this.state.loading = true;
      this._renderList();
      const reqId = ++this._reqId || (this._reqId = 1);
      Promise.resolve(p).then(res => {
        if (reqId !== this._reqId) return;
        this.state.items = this._normalize(res);
        this.state.filtered = this.state.items.slice();
        this.state.loading = false;
        this.state.active = this.state.filtered.length ? 0 : -1;
        this._renderList();
      }).catch(() => { this.state.loading = false; this._renderList(); });
    }

    _toggleItem(item) {
      if (!item) return;
      const i = this.state.selected.findIndex(s => s.value === item.value);
      if (this.opts.multi) {
        if (i >= 0) this.state.selected.splice(i, 1);
        else this.state.selected.push(item);
      } else {
        this.state.selected = i >= 0 ? [] : [item];
        this.close();
      }
      this._render();
      if (typeof this.opts.onChange === 'function') {
        this.opts.onChange(this.value(), this);
      }
    }

    _render() {
      this._renderControl();
      this._renderList();
    }

    _renderControl() {
      const sel = this.state.selected;
      if (!sel.length) {
        this.elValues.innerHTML = `<span class="vx-dd-placeholder">${this._esc(this.opts.placeholder)}</span>`;
        return;
      }
      if (!this.opts.multi) {
        this.elValues.textContent = sel[0].label;
        return;
      }
      const max = this.opts.maxTags;
      const shown = sel.slice(0, max);
      let html = shown.map(s => `<span class="vx-dd-tag">${this._esc(s.label)}<span class="vx-dd-tag-x" data-v="${this._esc(String(s.value))}">×</span></span>`).join('');
      if (sel.length > max) html += `<span class="vx-dd-tag">+${sel.length - max}</span>`;
      this.elValues.innerHTML = html;
      this.elValues.querySelectorAll('.vx-dd-tag-x').forEach(x => {
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          const v = x.getAttribute('data-v');
          const idx = this.state.selected.findIndex(s => String(s.value) === v);
          if (idx >= 0) {
            this.state.selected.splice(idx, 1);
            this._render();
            if (typeof this.opts.onChange === 'function') this.opts.onChange(this.value(), this);
          }
        });
      });
    }

    _renderList() {
      if (this.state.loading) {
        this.elVScroll.style.height = 'auto';
        this.elVScroll.innerHTML = `<div class="vx-dd-loading"><span class="vx-dd-spinner"></span>Cargando...</div>`;
        return;
      }
      const items = this.state.filtered;
      if (!items.length) {
        this.elVScroll.style.height = 'auto';
        this.elVScroll.innerHTML = `<div class="vx-dd-empty">Sin resultados</div>`;
        return;
      }
      const useVirtual = items.length >= this.opts.virtualThreshold;
      const total = items.length;
      const totalH = total * ROW_HEIGHT;
      let start = 0, end = total;
      if (useVirtual) {
        const viewH = this.elList.clientHeight || 240;
        start = Math.max(0, Math.floor(this.state.scrollTop / ROW_HEIGHT) - VIRTUAL_BUFFER);
        end = Math.min(total, Math.ceil((this.state.scrollTop + viewH) / ROW_HEIGHT) + VIRTUAL_BUFFER);
        this.elVScroll.style.height = totalH + 'px';
      } else {
        this.elVScroll.style.height = 'auto';
      }
      const selSet = new Set(this.state.selected.map(s => s.value));
      let html = '';
      for (let i = start; i < end; i++) {
        const it = items[i];
        const top = useVirtual ? `position:absolute;top:${i * ROW_HEIGHT}px;left:0;right:0;height:${ROW_HEIGHT}px;` : '';
        const cls = 'vx-dd-opt' + (selSet.has(it.value) ? ' selected' : '') + (i === this.state.active ? ' active' : '');
        const cb = this.opts.multi ? `<input type="checkbox" ${selSet.has(it.value) ? 'checked' : ''} tabindex="-1"/>` : '';
        html += `<div class="${cls}" data-i="${i}" style="${top}">${cb}<span>${this._esc(it.label)}</span></div>`;
      }
      this.elVScroll.innerHTML = html;
      this.elVScroll.querySelectorAll('.vx-dd-opt').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const i = parseInt(el.getAttribute('data-i'), 10);
          this._toggleItem(this.state.filtered[i]);
        });
      });
    }

    _esc(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    open() {
      if (this.state.open) return;
      this.state.open = true;
      this.root.classList.add('open');
      if (this.elSearch) setTimeout(() => this.elSearch.focus(), 0);
      if (this.opts.async && !this.state.items.length) this._loadAsync('');
      this._renderList();
    }

    close() {
      if (!this.state.open) return;
      this.state.open = false;
      this.root.classList.remove('open');
    }

    toggle() { this.state.open ? this.close() : this.open(); }

    value() {
      const vs = this.state.selected.map(s => s.value);
      return this.opts.multi ? vs : (vs[0] ?? null);
    }

    setValue(v) {
      const vals = Array.isArray(v) ? v : [v];
      this.state.selected = this.state.items.filter(i => vals.includes(i.value));
      this._render();
    }

    setOptions(arr) {
      this.state.items = this._normalize(arr);
      this._filter();
    }

    clear() {
      this.state.selected = [];
      this._render();
      if (typeof this.opts.onChange === 'function') this.opts.onChange(this.value(), this);
    }

    destroy() {
      document.removeEventListener('mousedown', this._docClick);
      this.root.remove();
    }
  }

  global.Dropdown = Dropdown;
})(window);
