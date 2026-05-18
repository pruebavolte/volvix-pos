/**
 * volvix-ui-badge.js
 * UI Badge/Chip component for Volvix
 * Exposes: window.Badge
 *
 * Features:
 *  - Count badges (with max overflow "99+")
 *  - Status badges (success, warning, danger, info, neutral, primary)
 *  - Removable chips (with onRemove callback)
 *  - Color variants (solid, outline, soft, dot)
 *  - Sizes (xs, sm, md, lg)
 *  - Optional leading/trailing icons
 *  - Pulse / dot indicator
 *  - Tooltip via title attribute
 *  - Click handler
 *  - Auto style injection (once)
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-badge-styles';
  var COLORS = {
    primary: { bg: '#2563eb', fg: '#ffffff', soft: '#dbeafe', softFg: '#1e40af', border: '#2563eb' },
    success: { bg: '#16a34a', fg: '#ffffff', soft: '#dcfce7', softFg: '#166534', border: '#16a34a' },
    warning: { bg: '#f59e0b', fg: '#1f2937', soft: '#fef3c7', softFg: '#92400e', border: '#f59e0b' },
    danger:  { bg: '#dc2626', fg: '#ffffff', soft: '#fee2e2', softFg: '#991b1b', border: '#dc2626' },
    info:    { bg: '#0891b2', fg: '#ffffff', soft: '#cffafe', softFg: '#155e75', border: '#0891b2' },
    neutral: { bg: '#6b7280', fg: '#ffffff', soft: '#f3f4f6', softFg: '#374151', border: '#9ca3af' },
    dark:    { bg: '#111827', fg: '#ffffff', soft: '#e5e7eb', softFg: '#111827', border: '#111827' }
  };

  var SIZES = {
    xs: { fs: '10px', pad: '1px 6px',  h: '16px', radius: '8px',  iconSize: '10px' },
    sm: { fs: '11px', pad: '2px 8px',  h: '20px', radius: '10px', iconSize: '12px' },
    md: { fs: '12px', pad: '3px 10px', h: '24px', radius: '12px', iconSize: '14px' },
    lg: { fs: '14px', pad: '5px 14px', h: '32px', radius: '16px', iconSize: '16px' }
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.vx-badge{display:inline-flex;align-items:center;gap:4px;font-family:system-ui,-apple-system,sans-serif;font-weight:600;line-height:1;white-space:nowrap;vertical-align:middle;border:1px solid transparent;box-sizing:border-box;transition:all .15s ease;user-select:none}'
      + '.vx-badge.vx-clickable{cursor:pointer}'
      + '.vx-badge.vx-clickable:hover{filter:brightness(1.08);transform:translateY(-1px)}'
      + '.vx-badge .vx-badge-dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}'
      + '.vx-badge.vx-pulse .vx-badge-dot{animation:vx-pulse 1.4s infinite}'
      + '@keyframes vx-pulse{0%{box-shadow:0 0 0 0 currentColor}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}'
      + '.vx-badge .vx-badge-close{margin-left:2px;cursor:pointer;opacity:.7;font-weight:700;line-height:1;padding:0 2px;border-radius:50%}'
      + '.vx-badge .vx-badge-close:hover{opacity:1;background:rgba(0,0,0,.15)}'
      + '.vx-badge .vx-badge-icon{display:inline-flex;align-items:center;justify-content:center}'
      + '.vx-badge.vx-rounded{border-radius:999px}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function applyVariant(el, color, variant) {
    var c = COLORS[color] || COLORS.neutral;
    if (variant === 'outline') {
      el.style.background = 'transparent';
      el.style.color = c.bg;
      el.style.borderColor = c.border;
    } else if (variant === 'soft') {
      el.style.background = c.soft;
      el.style.color = c.softFg;
      el.style.borderColor = 'transparent';
    } else if (variant === 'dot') {
      el.style.background = 'transparent';
      el.style.color = c.bg;
      el.style.borderColor = 'transparent';
    } else { // solid
      el.style.background = c.bg;
      el.style.color = c.fg;
      el.style.borderColor = c.bg;
    }
  }

  function applySize(el, size) {
    var s = SIZES[size] || SIZES.md;
    el.style.fontSize = s.fs;
    el.style.padding = s.pad;
    el.style.minHeight = s.h;
    el.style.borderRadius = s.radius;
  }

  function formatCount(n, max) {
    if (typeof n !== 'number') return String(n);
    if (max && n > max) return max + '+';
    return String(n);
  }

  function create(opts) {
    injectStyles();
    opts = opts || {};
    var label = opts.label != null ? opts.label : '';
    var color = opts.color || 'neutral';
    var variant = opts.variant || 'solid';
    var size = opts.size || 'md';
    var rounded = opts.rounded !== false;
    var dot = !!opts.dot || variant === 'dot';
    var pulse = !!opts.pulse;
    var removable = !!opts.removable;
    var count = opts.count;
    var max = opts.max || 99;

    var el = document.createElement('span');
    el.className = 'vx-badge';
    if (rounded) el.classList.add('vx-rounded');
    if (pulse) el.classList.add('vx-pulse');
    if (opts.title) el.title = opts.title;

    applySize(el, size);
    applyVariant(el, color, variant);

    if (dot) {
      var d = document.createElement('span');
      d.className = 'vx-badge-dot';
      el.appendChild(d);
    }

    if (opts.iconLeft) {
      var il = document.createElement('span');
      il.className = 'vx-badge-icon';
      il.innerHTML = opts.iconLeft;
      el.appendChild(il);
    }

    var text = document.createElement('span');
    text.className = 'vx-badge-text';
    if (typeof count === 'number') {
      text.textContent = formatCount(count, max);
    } else {
      text.textContent = label;
    }
    if (text.textContent) el.appendChild(text);

    if (opts.iconRight) {
      var ir = document.createElement('span');
      ir.className = 'vx-badge-icon';
      ir.innerHTML = opts.iconRight;
      el.appendChild(ir);
    }

    if (typeof opts.onClick === 'function') {
      el.classList.add('vx-clickable');
      el.addEventListener('click', function (e) {
        if (e.target.classList.contains('vx-badge-close')) return;
        opts.onClick(e, api);
      });
    }

    if (removable) {
      var x = document.createElement('span');
      x.className = 'vx-badge-close';
      x.innerHTML = '&times;';
      x.setAttribute('aria-label', 'remove');
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof opts.onRemove === 'function') {
          var ok = opts.onRemove(api, e);
          if (ok === false) return;
        }
        api.destroy();
      });
      el.appendChild(x);
    }

    if (opts.parent) {
      var p = typeof opts.parent === 'string' ? document.querySelector(opts.parent) : opts.parent;
      if (p) p.appendChild(el);
    }

    var api = {
      el: el,
      setLabel: function (v) { text.textContent = v; return api; },
      setCount: function (n) { text.textContent = formatCount(n, max); return api; },
      setColor: function (c) { color = c; applyVariant(el, color, variant); return api; },
      setVariant: function (v) { variant = v; applyVariant(el, color, variant); return api; },
      setSize: function (s) { size = s; applySize(el, size); return api; },
      pulse: function (on) { el.classList.toggle('vx-pulse', !!on); return api; },
      mount: function (parent) {
        var p = typeof parent === 'string' ? document.querySelector(parent) : parent;
        if (p) p.appendChild(el);
        return api;
      },
      destroy: function () { if (el.parentNode) el.parentNode.removeChild(el); }
    };

    return api;
  }

  // Shortcuts
  function count(n, opts) { return create(Object.assign({ count: n, color: 'danger', size: 'sm' }, opts || {})); }
  function status(label, color, opts) { return create(Object.assign({ label: label, color: color, variant: 'soft' }, opts || {})); }
  function chip(label, opts) { return create(Object.assign({ label: label, removable: true, variant: 'soft', color: 'neutral' }, opts || {})); }
  function dotBadge(color, opts) { return create(Object.assign({ color: color, variant: 'dot', dot: true, pulse: true }, opts || {})); }

  global.Badge = {
    create: create,
    count: count,
    status: status,
    chip: chip,
    dot: dotBadge,
    COLORS: COLORS,
    SIZES: SIZES,
    _injectStyles: injectStyles
  };

})(typeof window !== 'undefined' ? window : this);
