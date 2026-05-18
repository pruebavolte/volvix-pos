/**
 * volvix-ui-tabs.js
 * UI Component: Tabs
 * Features: horizontal/vertical orientation, lazy load content, persist active tab,
 *           scrollable tab strip, keyboard navigation, dynamic add/remove, events.
 * Exposes: window.Tabs
 */
(function (global) {
  'use strict';

  const STORAGE_PREFIX = 'volvix.tabs.';
  const instances = new Map();
  let uidCounter = 0;
  const nextId = () => 'tabs-' + (++uidCounter) + '-' + Date.now().toString(36);

  // ---------- Styles (injected once) ----------
  function injectStyles() {
    if (document.getElementById('volvix-tabs-styles')) return;
    const css = `
    .vx-tabs{display:flex;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;}
    .vx-tabs.vx-h{flex-direction:column;}
    .vx-tabs.vx-v{flex-direction:row;}
    .vx-tabs-strip{display:flex;position:relative;background:#f9fafb;border:1px solid #e5e7eb;}
    .vx-h .vx-tabs-strip{flex-direction:row;overflow-x:auto;overflow-y:hidden;border-radius:8px 8px 0 0;}
    .vx-v .vx-tabs-strip{flex-direction:column;overflow-y:auto;overflow-x:hidden;border-radius:8px 0 0 8px;min-width:160px;}
    .vx-tabs-strip::-webkit-scrollbar{height:6px;width:6px;}
    .vx-tabs-strip::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}
    .vx-tab{flex:0 0 auto;padding:10px 16px;cursor:pointer;border:none;background:transparent;
            font-size:14px;color:#475569;white-space:nowrap;transition:background .15s,color .15s;
            border-bottom:2px solid transparent;outline:none;user-select:none;}
    .vx-v .vx-tab{border-bottom:none;border-right:2px solid transparent;text-align:left;}
    .vx-tab:hover{background:#eef2f7;color:#0f172a;}
    .vx-tab:focus-visible{box-shadow:inset 0 0 0 2px #3b82f6;}
    .vx-tab.vx-active{color:#1d4ed8;background:#fff;border-color:#1d4ed8;font-weight:600;}
    .vx-tab.vx-disabled{opacity:.45;cursor:not-allowed;}
    .vx-tab-close{margin-left:8px;font-size:12px;opacity:.55;}
    .vx-tab-close:hover{opacity:1;color:#dc2626;}
    .vx-tabs-panels{flex:1;background:#fff;border:1px solid #e5e7eb;padding:16px;min-height:80px;}
    .vx-h .vx-tabs-panels{border-top:none;border-radius:0 0 8px 8px;}
    .vx-v .vx-tabs-panels{border-left:none;border-radius:0 8px 8px 0;}
    .vx-panel{display:none;}
    .vx-panel.vx-active{display:block;animation:vxFade .18s ease;}
    .vx-loading{color:#64748b;font-style:italic;}
    @keyframes vxFade{from{opacity:0;transform:translateY(2px);}to{opacity:1;transform:none;}}
    `;
    const s = document.createElement('style');
    s.id = 'volvix-tabs-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- Persistence ----------
  function loadPersisted(key) {
    if (!key) return null;
    try { return localStorage.getItem(STORAGE_PREFIX + key); } catch (_) { return null; }
  }
  function savePersisted(key, value) {
    if (!key) return;
    try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch (_) {}
  }

  // ---------- Core class ----------
  class TabsInstance {
    constructor(container, options) {
      if (!container) throw new Error('Tabs: container required');
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) throw new Error('Tabs: container not found');

      this.options = Object.assign({
        orientation: 'horizontal', // 'horizontal' | 'vertical'
        tabs: [],                  // [{id,label,content,contentLoader,disabled,closable}]
        activeId: null,
        persistKey: null,          // localStorage key
        scrollable: true,
        closable: false,           // global default
        onChange: null,
        onClose: null,
      }, options || {});

      this.id = nextId();
      this.tabs = [];
      this.activeId = null;
      this.loaded = new Set();
      this.listeners = { change: [], close: [], add: [] };

      injectStyles();
      this._build();
      (this.options.tabs || []).forEach(t => this.add(t, { silent: true, render: false }));
      this._render();

      let initial = this.options.activeId;
      const persisted = loadPersisted(this.options.persistKey);
      if (persisted && this.tabs.some(t => t.id === persisted)) initial = persisted;
      if (!initial && this.tabs.length) initial = this.tabs.find(t => !t.disabled)?.id || this.tabs[0].id;
      if (initial) this.activate(initial, { silent: true });

      instances.set(this.id, this);
    }

    _build() {
      this.container.classList.add('vx-tabs');
      this.container.classList.add(this.options.orientation === 'vertical' ? 'vx-v' : 'vx-h');
      this.container.innerHTML = '';
      this.stripEl = document.createElement('div');
      this.stripEl.className = 'vx-tabs-strip';
      this.stripEl.setAttribute('role', 'tablist');
      this.stripEl.setAttribute('aria-orientation', this.options.orientation);
      this.panelsEl = document.createElement('div');
      this.panelsEl.className = 'vx-tabs-panels';
      this.container.appendChild(this.stripEl);
      this.container.appendChild(this.panelsEl);
      this.stripEl.addEventListener('keydown', e => this._onKey(e));
    }

    _render() {
      this.stripEl.innerHTML = '';
      this.panelsEl.innerHTML = '';
      this.tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vx-tab' + (tab.disabled ? ' vx-disabled' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('data-tab-id', tab.id);
        btn.setAttribute('aria-selected', tab.id === this.activeId ? 'true' : 'false');
        btn.tabIndex = tab.id === this.activeId ? 0 : -1;
        btn.textContent = tab.label;
        if (tab.closable || (this.options.closable && tab.closable !== false)) {
          const x = document.createElement('span');
          x.className = 'vx-tab-close';
          x.textContent = '×';
          x.addEventListener('click', ev => { ev.stopPropagation(); this.remove(tab.id); });
          btn.appendChild(x);
        }
        btn.addEventListener('click', () => { if (!tab.disabled) this.activate(tab.id); });
        if (tab.id === this.activeId) btn.classList.add('vx-active');
        this.stripEl.appendChild(btn);

        const panel = document.createElement('div');
        panel.className = 'vx-panel' + (tab.id === this.activeId ? ' vx-active' : '');
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('data-panel-id', tab.id);
        if (tab.id === this.activeId) this._populatePanel(panel, tab);
        else if (tab.content && !tab.contentLoader) this._writeInto(panel, tab.content);
        this.panelsEl.appendChild(panel);
      });
    }

    _writeInto(el, content) {
      if (content == null) { el.innerHTML = ''; return; }
      if (typeof content === 'string') el.innerHTML = content;
      else if (content instanceof HTMLElement) { el.innerHTML = ''; el.appendChild(content); }
      else el.textContent = String(content);
    }

    _populatePanel(panel, tab) {
      if (this.loaded.has(tab.id)) return;
      if (typeof tab.contentLoader === 'function') {
        panel.innerHTML = '<div class="vx-loading">Cargando…</div>';
        Promise.resolve().then(() => tab.contentLoader(tab))
          .then(result => { this._writeInto(panel, result); this.loaded.add(tab.id); })
          .catch(err => { panel.innerHTML = '<div style="color:#dc2626">Error: ' + (err && err.message ? err.message : err) + '</div>'; });
      } else {
        this._writeInto(panel, tab.content || '');
        this.loaded.add(tab.id);
      }
    }

    _onKey(e) {
      const horiz = this.options.orientation === 'horizontal';
      const next = horiz ? 'ArrowRight' : 'ArrowDown';
      const prev = horiz ? 'ArrowLeft' : 'ArrowUp';
      if (![next, prev, 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const enabled = this.tabs.filter(t => !t.disabled);
      if (!enabled.length) return;
      let idx = enabled.findIndex(t => t.id === this.activeId);
      if (e.key === next) idx = (idx + 1) % enabled.length;
      else if (e.key === prev) idx = (idx - 1 + enabled.length) % enabled.length;
      else if (e.key === 'Home') idx = 0;
      else if (e.key === 'End') idx = enabled.length - 1;
      this.activate(enabled[idx].id);
      const btn = this.stripEl.querySelector('[data-tab-id="' + enabled[idx].id + '"]');
      if (btn) btn.focus();
    }

    _emit(event, payload) {
      (this.listeners[event] || []).forEach(fn => { try { fn(payload); } catch (_) {} });
      if (event === 'change' && typeof this.options.onChange === 'function') this.options.onChange(payload);
      if (event === 'close' && typeof this.options.onClose === 'function') this.options.onClose(payload);
    }

    // ---------- Public API ----------
    on(event, fn) { (this.listeners[event] = this.listeners[event] || []).push(fn); return this; }
    off(event, fn) { this.listeners[event] = (this.listeners[event] || []).filter(f => f !== fn); return this; }

    add(tab, opts) {
      opts = opts || {};
      if (!tab || !tab.id) throw new Error('Tabs.add: tab.id required');
      if (this.tabs.some(t => t.id === tab.id)) throw new Error('Tabs.add: duplicate id ' + tab.id);
      this.tabs.push({
        id: tab.id, label: tab.label || tab.id,
        content: tab.content, contentLoader: tab.contentLoader,
        disabled: !!tab.disabled, closable: tab.closable,
      });
      if (opts.render !== false) this._render();
      if (!opts.silent) this._emit('add', { id: tab.id });
      return this;
    }

    remove(id) {
      const idx = this.tabs.findIndex(t => t.id === id);
      if (idx < 0) return this;
      const wasActive = this.activeId === id;
      this.tabs.splice(idx, 1);
      this.loaded.delete(id);
      if (wasActive) {
        const fallback = this.tabs[idx] || this.tabs[idx - 1];
        this.activeId = fallback ? fallback.id : null;
      }
      this._render();
      this._emit('close', { id });
      return this;
    }

    activate(id, opts) {
      opts = opts || {};
      const tab = this.tabs.find(t => t.id === id);
      if (!tab || tab.disabled) return this;
      if (this.activeId === id) return this;
      const previous = this.activeId;
      this.activeId = id;

      this.stripEl.querySelectorAll('.vx-tab').forEach(b => {
        const match = b.getAttribute('data-tab-id') === id;
        b.classList.toggle('vx-active', match);
        b.setAttribute('aria-selected', match ? 'true' : 'false');
        b.tabIndex = match ? 0 : -1;
      });
      this.panelsEl.querySelectorAll('.vx-panel').forEach(p => {
        const match = p.getAttribute('data-panel-id') === id;
        p.classList.toggle('vx-active', match);
        if (match) this._populatePanel(p, tab);
      });

      const activeBtn = this.stripEl.querySelector('.vx-tab.vx-active');
      if (activeBtn && this.options.scrollable) {
        try { activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (_) {}
      }
      savePersisted(this.options.persistKey, id);
      if (!opts.silent) this._emit('change', { id, previous });
      return this;
    }

    setOrientation(orientation) {
      if (orientation !== 'horizontal' && orientation !== 'vertical') return this;
      this.options.orientation = orientation;
      this.container.classList.remove('vx-h', 'vx-v');
      this.container.classList.add(orientation === 'vertical' ? 'vx-v' : 'vx-h');
      this.stripEl.setAttribute('aria-orientation', orientation);
      return this;
    }

    setDisabled(id, disabled) {
      const t = this.tabs.find(x => x.id === id);
      if (!t) return this;
      t.disabled = !!disabled;
      this._render();
      return this;
    }

    setLabel(id, label) {
      const t = this.tabs.find(x => x.id === id);
      if (!t) return this;
      t.label = label;
      const btn = this.stripEl.querySelector('[data-tab-id="' + id + '"]');
      if (btn) btn.firstChild ? (btn.firstChild.nodeValue = label) : (btn.textContent = label);
      return this;
    }

    reload(id) {
      this.loaded.delete(id);
      const tab = this.tabs.find(t => t.id === id);
      const panel = this.panelsEl.querySelector('[data-panel-id="' + id + '"]');
      if (tab && panel) this._populatePanel(panel, tab);
      return this;
    }

    getActive() { return this.activeId; }
    getTabs() { return this.tabs.slice(); }

    destroy() {
      instances.delete(this.id);
      this.container.classList.remove('vx-tabs', 'vx-h', 'vx-v');
      this.container.innerHTML = '';
      this.listeners = { change: [], close: [], add: [] };
    }
  }

  // ---------- Public factory ----------
  const Tabs = {
    create(container, options) { return new TabsInstance(container, options); },
    get(id) { return instances.get(id) || null; },
    all() { return Array.from(instances.values()); },
    version: '1.0.0',
  };

  global.Tabs = Tabs;
})(typeof window !== 'undefined' ? window : this);
