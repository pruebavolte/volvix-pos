/**
 * volvix-ui-accordion.js
 * UI Accordion: single/multi expansion, animations, lazy load, persist state
 * Exposes: window.Accordion
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    multi: false,
    duration: 250,
    easing: 'ease',
    persist: false,
    storageKey: 'volvix-accordion',
    lazy: false,
    lazyLoader: null,
    defaultOpen: [],
    headerSelector: '[data-accordion-header]',
    panelSelector: '[data-accordion-panel]',
    itemSelector: '[data-accordion-item]',
    activeClass: 'is-open',
    onOpen: null,
    onClose: null,
    onToggle: null,
    onLazyLoad: null
  };

  const instances = new WeakMap();
  let uid = 0;

  function uniqueId(prefix) {
    return (prefix || 'acc-') + (++uid) + '-' + Date.now().toString(36);
  }

  function $$(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  function loadState(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveState(key, state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      /* quota or disabled */
    }
  }

  function clearState(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* noop */ }
  }

  function animateOpen(panel, duration, easing, done) {
    panel.style.display = 'block';
    panel.style.overflow = 'hidden';
    panel.style.height = '0px';
    panel.style.transition = 'height ' + duration + 'ms ' + easing;
    const target = panel.scrollHeight;
    requestAnimationFrame(function () {
      panel.style.height = target + 'px';
    });
    const onEnd = function () {
      panel.removeEventListener('transitionend', onEnd);
      panel.style.height = '';
      panel.style.overflow = '';
      panel.style.transition = '';
      if (done) done();
    };
    panel.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, duration + 60);
  }

  function animateClose(panel, duration, easing, done) {
    const start = panel.scrollHeight;
    panel.style.overflow = 'hidden';
    panel.style.height = start + 'px';
    panel.style.transition = 'height ' + duration + 'ms ' + easing;
    requestAnimationFrame(function () {
      panel.style.height = '0px';
    });
    const onEnd = function () {
      panel.removeEventListener('transitionend', onEnd);
      panel.style.display = 'none';
      panel.style.height = '';
      panel.style.overflow = '';
      panel.style.transition = '';
      if (done) done();
    };
    panel.addEventListener('transitionend', onEnd);
    setTimeout(onEnd, duration + 60);
  }

  function Accordion(root, options) {
    if (!root) throw new Error('Accordion: root element required');
    if (typeof root === 'string') root = document.querySelector(root);
    if (!root) throw new Error('Accordion: root not found');

    if (instances.has(root)) {
      return instances.get(root);
    }

    const opts = Object.assign({}, DEFAULTS, options || {});
    const self = this;
    self.root = root;
    self.options = opts;
    self.id = root.id || uniqueId('accordion-');
    self.items = [];
    self._state = opts.persist ? loadState(opts.storageKey + ':' + self.id) : {};
    self._lazyDone = {};

    self._collectItems();
    self._bind();
    self._applyInitial();

    instances.set(root, self);
  }

  Accordion.prototype._collectItems = function () {
    const opts = this.options;
    const items = $$(this.root, opts.itemSelector);
    const list = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const header = item.querySelector(opts.headerSelector);
      const panel = item.querySelector(opts.panelSelector);
      if (!header || !panel) continue;
      const key = item.getAttribute('data-accordion-key') || ('item-' + i);
      item.setAttribute('data-accordion-key', key);
      if (!header.hasAttribute('role')) header.setAttribute('role', 'button');
      if (!header.hasAttribute('tabindex')) header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.display = 'none';
      list.push({ key: key, item: item, header: header, panel: panel });
    }
    this.items = list;
  };

  Accordion.prototype._bind = function () {
    const self = this;
    self._handler = function (ev) {
      const target = ev.target;
      for (let i = 0; i < self.items.length; i++) {
        const it = self.items[i];
        if (it.header === target || it.header.contains(target)) {
          if (ev.type === 'keydown') {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            ev.preventDefault();
          }
          self.toggle(it.key);
          return;
        }
      }
    };
    self.root.addEventListener('click', self._handler);
    self.root.addEventListener('keydown', self._handler);
  };

  Accordion.prototype._applyInitial = function () {
    const self = this;
    const opts = self.options;
    const persisted = opts.persist ? self._state : null;
    const initial = [];
    for (let i = 0; i < self.items.length; i++) {
      const k = self.items[i].key;
      if (persisted && persisted[k]) {
        initial.push(k);
      } else if (!persisted && opts.defaultOpen.indexOf(k) !== -1) {
        initial.push(k);
      }
    }
    if (!opts.multi && initial.length > 1) initial.length = 1;
    for (let j = 0; j < initial.length; j++) {
      self.open(initial[j], true);
    }
  };

  Accordion.prototype._find = function (key) {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].key === key) return this.items[i];
    }
    return null;
  };

  Accordion.prototype.isOpen = function (key) {
    const it = this._find(key);
    return !!(it && it.item.classList.contains(this.options.activeClass));
  };

  Accordion.prototype._persist = function () {
    if (!this.options.persist) return;
    const state = {};
    for (let i = 0; i < this.items.length; i++) {
      state[this.items[i].key] = this.isOpen(this.items[i].key);
    }
    saveState(this.options.storageKey + ':' + this.id, state);
  };

  Accordion.prototype._lazy = function (it, done) {
    const self = this;
    const opts = self.options;
    if (!opts.lazy || self._lazyDone[it.key]) {
      done();
      return;
    }
    const loader = opts.lazyLoader;
    if (typeof loader !== 'function') {
      self._lazyDone[it.key] = true;
      done();
      return;
    }
    Promise.resolve(loader(it.key, it.panel, it.item)).then(function (content) {
      if (typeof content === 'string') it.panel.innerHTML = content;
      else if (content && content.nodeType) {
        it.panel.innerHTML = '';
        it.panel.appendChild(content);
      }
      self._lazyDone[it.key] = true;
      if (typeof opts.onLazyLoad === 'function') opts.onLazyLoad(it.key, it.panel);
      done();
    }, function () {
      done();
    });
  };

  Accordion.prototype.open = function (key, instant) {
    const self = this;
    const opts = self.options;
    const it = self._find(key);
    if (!it) return false;
    if (self.isOpen(key)) return true;

    if (!opts.multi) {
      for (let i = 0; i < self.items.length; i++) {
        if (self.items[i].key !== key && self.isOpen(self.items[i].key)) {
          self.close(self.items[i].key, instant);
        }
      }
    }

    self._lazy(it, function () {
      it.item.classList.add(opts.activeClass);
      it.header.setAttribute('aria-expanded', 'true');
      it.panel.setAttribute('aria-hidden', 'false');
      if (instant) {
        it.panel.style.display = 'block';
      } else {
        animateOpen(it.panel, opts.duration, opts.easing);
      }
      self._persist();
      if (typeof opts.onOpen === 'function') opts.onOpen(key, it);
      if (typeof opts.onToggle === 'function') opts.onToggle(key, true, it);
    });
    return true;
  };

  Accordion.prototype.close = function (key, instant) {
    const opts = this.options;
    const it = this._find(key);
    if (!it) return false;
    if (!this.isOpen(key)) return true;
    it.item.classList.remove(opts.activeClass);
    it.header.setAttribute('aria-expanded', 'false');
    it.panel.setAttribute('aria-hidden', 'true');
    if (instant) {
      it.panel.style.display = 'none';
    } else {
      animateClose(it.panel, opts.duration, opts.easing);
    }
    this._persist();
    if (typeof opts.onClose === 'function') opts.onClose(key, it);
    if (typeof opts.onToggle === 'function') opts.onToggle(key, false, it);
    return true;
  };

  Accordion.prototype.toggle = function (key) {
    return this.isOpen(key) ? this.close(key) : this.open(key);
  };

  Accordion.prototype.openAll = function () {
    if (!this.options.multi) return false;
    for (let i = 0; i < this.items.length; i++) this.open(this.items[i].key);
    return true;
  };

  Accordion.prototype.closeAll = function () {
    for (let i = 0; i < this.items.length; i++) this.close(this.items[i].key);
    return true;
  };

  Accordion.prototype.refresh = function () {
    this._collectItems();
    this._applyInitial();
  };

  Accordion.prototype.clearPersisted = function () {
    clearState(this.options.storageKey + ':' + this.id);
    this._state = {};
  };

  Accordion.prototype.destroy = function () {
    this.root.removeEventListener('click', this._handler);
    this.root.removeEventListener('keydown', this._handler);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.item.classList.remove(this.options.activeClass);
      it.panel.style.display = '';
      it.header.removeAttribute('aria-expanded');
      it.panel.removeAttribute('aria-hidden');
    }
    instances.delete(this.root);
    this.items = [];
  };

  Accordion.init = function (selector, options) {
    const nodes = typeof selector === 'string'
      ? Array.prototype.slice.call(document.querySelectorAll(selector))
      : (selector.length ? Array.prototype.slice.call(selector) : [selector]);
    return nodes.map(function (n) { return new Accordion(n, options); });
  };

  Accordion.get = function (root) {
    if (typeof root === 'string') root = document.querySelector(root);
    return instances.get(root) || null;
  };

  global.Accordion = Accordion;
})(typeof window !== 'undefined' ? window : this);
