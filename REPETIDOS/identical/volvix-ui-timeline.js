/* volvix-ui-timeline.js
 * Volvix UI Timeline Component
 * Cronological events, vertical/horizontal layouts, custom icons,
 * descriptions, alternating layout. Exposes window.Timeline.
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-timeline-styles';
  var CSS = [
    '.vx-timeline{position:relative;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;box-sizing:border-box;padding:24px 0}',
    '.vx-timeline *{box-sizing:border-box}',
    '.vx-timeline.vertical{display:flex;flex-direction:column;gap:24px}',
    '.vx-timeline.vertical::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#3b82f6,#8b5cf6);transform:translateX(-50%)}',
    '.vx-timeline.vertical.left::before{left:24px;transform:none}',
    '.vx-timeline-item{position:relative;display:flex;align-items:flex-start;width:100%}',
    '.vx-timeline.vertical .vx-timeline-item{justify-content:flex-end;padding-right:calc(50% + 32px)}',
    '.vx-timeline.vertical .vx-timeline-item.right{justify-content:flex-start;padding-right:0;padding-left:calc(50% + 32px)}',
    '.vx-timeline.vertical.left .vx-timeline-item{justify-content:flex-start;padding-right:0;padding-left:64px}',
    '.vx-timeline-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;box-shadow:0 4px 12px rgba(0,0,0,.06);max-width:420px;position:relative;transition:transform .2s,box-shadow .2s}',
    '.vx-timeline-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.10)}',
    '.vx-timeline-date{font-size:12px;font-weight:600;color:#6b7280;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}',
    '.vx-timeline-title{font-size:16px;font-weight:700;margin:0 0 6px}',
    '.vx-timeline-desc{font-size:14px;line-height:1.45;color:#374151;margin:0}',
    '.vx-timeline-icon{position:absolute;top:14px;width:36px;height:36px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6;z-index:2}',
    '.vx-timeline.vertical .vx-timeline-icon{left:calc(50% - 18px)}',
    '.vx-timeline.vertical.left .vx-timeline-icon{left:6px}',
    '.vx-timeline-card.tag-success .vx-timeline-icon,.vx-timeline-icon.success{background:#10b981;box-shadow:0 0 0 2px #10b981}',
    '.vx-timeline-card.tag-warn .vx-timeline-icon,.vx-timeline-icon.warn{background:#f59e0b;box-shadow:0 0 0 2px #f59e0b}',
    '.vx-timeline-card.tag-danger .vx-timeline-icon,.vx-timeline-icon.danger{background:#ef4444;box-shadow:0 0 0 2px #ef4444}',
    '.vx-timeline-card.tag-info .vx-timeline-icon,.vx-timeline-icon.info{background:#3b82f6;box-shadow:0 0 0 2px #3b82f6}',
    '.vx-timeline.horizontal{display:flex;flex-direction:row;align-items:flex-start;overflow-x:auto;gap:0;padding:48px 16px}',
    '.vx-timeline.horizontal::before{content:"";position:absolute;left:0;right:0;top:64px;height:2px;background:linear-gradient(90deg,#3b82f6,#8b5cf6)}',
    '.vx-timeline.horizontal .vx-timeline-item{flex:0 0 240px;flex-direction:column;align-items:center;padding:0 12px}',
    '.vx-timeline.horizontal .vx-timeline-icon{position:relative;top:0;left:0;margin-bottom:14px}',
    '.vx-timeline.horizontal .vx-timeline-card{max-width:100%}',
    '.vx-timeline-empty{text-align:center;color:#9ca3af;font-style:italic;padding:24px}',
    '@media (max-width:680px){.vx-timeline.vertical::before{left:24px;transform:none}.vx-timeline.vertical .vx-timeline-item,.vx-timeline.vertical .vx-timeline-item.right{justify-content:flex-start;padding:0 0 0 64px}.vx-timeline.vertical .vx-timeline-icon{left:6px}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isElement(x) {
    return x && typeof x === 'object' && x.nodeType === 1;
  }

  function resolveTarget(target) {
    if (!target) throw new Error('Timeline: target requerido');
    if (isElement(target)) return target;
    if (typeof target === 'string') {
      var el = document.querySelector(target);
      if (!el) throw new Error('Timeline: selector no encontrado: ' + target);
      return el;
    }
    throw new Error('Timeline: target inválido');
  }

  function normalizeEvent(ev, idx) {
    if (!ev || typeof ev !== 'object') ev = {};
    return {
      id: ev.id != null ? String(ev.id) : 'evt-' + idx,
      date: ev.date || '',
      title: ev.title || 'Evento ' + (idx + 1),
      description: ev.description || ev.desc || '',
      icon: ev.icon || '',
      tag: ev.tag || ev.type || 'info',
      meta: ev.meta || null
    };
  }

  function sortEvents(events, order) {
    if (!order || order === 'none') return events.slice();
    var arr = events.slice();
    arr.sort(function (a, b) {
      var da = Date.parse(a.date);
      var db = Date.parse(b.date);
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return order === 'desc' ? db - da : da - db;
    });
    return arr;
  }

  function buildIcon(ev) {
    var content = ev.icon ? ev.icon : String((ev.title || '?').charAt(0)).toUpperCase();
    return '<div class="vx-timeline-icon ' + escapeHtml(ev.tag) + '">' + escapeHtml(content) + '</div>';
  }

  function buildCard(ev) {
    var date = ev.date ? '<div class="vx-timeline-date">' + escapeHtml(ev.date) + '</div>' : '';
    var desc = ev.description ? '<p class="vx-timeline-desc">' + escapeHtml(ev.description) + '</p>' : '';
    return (
      '<div class="vx-timeline-card tag-' + escapeHtml(ev.tag) + '">' +
        date +
        '<h3 class="vx-timeline-title">' + escapeHtml(ev.title) + '</h3>' +
        desc +
      '</div>'
    );
  }

  function Timeline(options) {
    if (!(this instanceof Timeline)) return new Timeline(options);
    options = options || {};
    this.target = resolveTarget(options.target);
    this.orientation = options.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    this.layout = options.layout || 'alternating'; // alternating | left | right
    this.order = options.order || 'asc';           // asc | desc | none
    this.events = (options.events || []).map(normalizeEvent);
    this.onClick = typeof options.onClick === 'function' ? options.onClick : null;
    injectStyles();
    this.render();
  }

  Timeline.prototype._rootClass = function () {
    var cls = ['vx-timeline', this.orientation];
    if (this.orientation === 'vertical' && this.layout !== 'alternating') {
      cls.push(this.layout === 'right' ? 'right' : 'left');
    }
    return cls.join(' ');
  };

  Timeline.prototype.render = function () {
    var sorted = sortEvents(this.events, this.order);
    var self = this;
    var html;
    if (!sorted.length) {
      html = '<div class="' + this._rootClass() + '"><div class="vx-timeline-empty">Sin eventos</div></div>';
    } else {
      var items = sorted.map(function (ev, i) {
        var side = '';
        if (self.orientation === 'vertical' && self.layout === 'alternating') {
          side = (i % 2 === 0) ? '' : 'right';
        }
        return (
          '<div class="vx-timeline-item ' + side + '" data-id="' + escapeHtml(ev.id) + '">' +
            buildIcon(ev) +
            buildCard(ev) +
          '</div>'
        );
      }).join('');
      html = '<div class="' + this._rootClass() + '">' + items + '</div>';
    }
    this.target.innerHTML = html;
    this._bindEvents();
  };

  Timeline.prototype._bindEvents = function () {
    if (!this.onClick) return;
    var self = this;
    var nodes = this.target.querySelectorAll('.vx-timeline-item');
    Array.prototype.forEach.call(nodes, function (node) {
      node.style.cursor = 'pointer';
      node.addEventListener('click', function () {
        var id = node.getAttribute('data-id');
        var ev = self.events.filter(function (e) { return e.id === id; })[0];
        if (ev) self.onClick(ev, node);
      });
    });
  };

  Timeline.prototype.add = function (event) {
    this.events.push(normalizeEvent(event, this.events.length));
    this.render();
    return this;
  };

  Timeline.prototype.remove = function (id) {
    this.events = this.events.filter(function (e) { return e.id !== String(id); });
    this.render();
    return this;
  };

  Timeline.prototype.update = function (id, patch) {
    this.events = this.events.map(function (e, i) {
      if (e.id !== String(id)) return e;
      return normalizeEvent(Object.assign({}, e, patch || {}), i);
    });
    this.render();
    return this;
  };

  Timeline.prototype.setEvents = function (events) {
    this.events = (events || []).map(normalizeEvent);
    this.render();
    return this;
  };

  Timeline.prototype.setOrientation = function (orientation) {
    this.orientation = orientation === 'horizontal' ? 'horizontal' : 'vertical';
    this.render();
    return this;
  };

  Timeline.prototype.setLayout = function (layout) {
    this.layout = layout || 'alternating';
    this.render();
    return this;
  };

  Timeline.prototype.setOrder = function (order) {
    this.order = order || 'asc';
    this.render();
    return this;
  };

  Timeline.prototype.destroy = function () {
    if (this.target) this.target.innerHTML = '';
    this.events = [];
    this.onClick = null;
  };

  Timeline.create = function (opts) { return new Timeline(opts); };
  Timeline.version = '1.0.0';

  global.Timeline = Timeline;
})(typeof window !== 'undefined' ? window : this);
