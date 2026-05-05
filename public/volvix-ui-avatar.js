/**
 * volvix-ui-avatar.js
 * UI Avatar component: image / initials / icon, sizes, group stack,
 * status indicator, fallback handling.
 *
 * Exposes: window.Avatar
 *
 *   Avatar.create({ src, name, size, status, shape, icon, alt, bg, color })
 *   Avatar.group([{...}, {...}], { max: 4, size: 'md' })
 *   Avatar.mount(target, opts)
 *   Avatar.update(el, opts)
 *
 * No dependencies. Pure DOM.
 */
(function (global) {
  'use strict';

  // ---------- Style injection (once) ----------
  var STYLE_ID = 'volvix-ui-avatar-styles';
  var BASE_CSS = [
    '.vx-avatar{position:relative;display:inline-flex;align-items:center;justify-content:center;',
    'overflow:hidden;flex-shrink:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
    'font-weight:600;color:#fff;background:#6b7280;user-select:none;line-height:1;vertical-align:middle;',
    'box-sizing:border-box;}',
    '.vx-avatar.vx-circle{border-radius:9999px;}',
    '.vx-avatar.vx-rounded{border-radius:8px;}',
    '.vx-avatar.vx-square{border-radius:0;}',
    '.vx-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.vx-avatar svg{width:60%;height:60%;fill:currentColor;}',
    '.vx-avatar .vx-status{position:absolute;border-radius:9999px;border:2px solid #fff;',
    'right:0;bottom:0;width:25%;height:25%;min-width:8px;min-height:8px;}',
    '.vx-status.vx-online{background:#22c55e;}',
    '.vx-status.vx-offline{background:#9ca3af;}',
    '.vx-status.vx-busy{background:#ef4444;}',
    '.vx-status.vx-away{background:#f59e0b;}',
    '.vx-avatar-group{display:inline-flex;}',
    '.vx-avatar-group .vx-avatar{border:2px solid #fff;margin-left:-8px;}',
    '.vx-avatar-group .vx-avatar:first-child{margin-left:0;}',
    '.vx-avatar-group .vx-avatar.vx-more{background:#374151;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = BASE_CSS;
    document.head.appendChild(s);
  }

  // ---------- Sizes ----------
  var SIZES = {
    xs: 20, sm: 28, md: 36, lg: 48, xl: 64, '2xl': 96
  };
  function resolveSize(size) {
    if (typeof size === 'number') return size;
    return SIZES[size] || SIZES.md;
  }

  // ---------- Initials ----------
  function getInitials(name) {
    if (!name || typeof name !== 'string') return '?';
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ---------- Color from string (deterministic) ----------
  var PALETTE = [
    '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
    '#10b981','#14b8a6','#06b6d4','#0ea5e9','#3b82f6','#6366f1',
    '#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e'
  ];
  function colorFor(str) {
    if (!str) return PALETTE[0];
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return PALETTE[Math.abs(h) % PALETTE.length];
  }

  // ---------- Default user icon ----------
  var USER_ICON_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z"/>' +
    '</svg>';

  // ---------- Create ----------
  function create(opts) {
    injectStyles();
    opts = opts || {};
    var size = resolveSize(opts.size);
    var shape = opts.shape || 'circle'; // circle | rounded | square
    var name = opts.name || '';
    var alt = opts.alt || name || 'avatar';

    var el = document.createElement('span');
    el.className = 'vx-avatar vx-' + shape;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.fontSize = Math.max(10, Math.round(size * 0.4)) + 'px';

    var bg = opts.bg || (name ? colorFor(name) : '#6b7280');
    el.style.background = bg;
    if (opts.color) el.style.color = opts.color;

    if (opts.src) {
      var img = document.createElement('img');
      img.alt = alt;
      img.src = opts.src;
      img.onerror = function () {
        // Fallback to initials/icon
        el.removeChild(img);
        renderFallback(el, opts);
      };
      el.appendChild(img);
    } else {
      renderFallback(el, opts);
    }

    if (opts.status) {
      var dot = document.createElement('span');
      dot.className = 'vx-status vx-' + opts.status;
      el.appendChild(dot);
    }

    if (opts.title) el.title = opts.title;
    else if (name) el.title = name;

    return el;
  }

  function renderFallback(el, opts) {
    if (opts.icon) {
      el.innerHTML = typeof opts.icon === 'string' ? opts.icon : USER_ICON_SVG;
    } else if (opts.name) {
      el.textContent = getInitials(opts.name);
    } else {
      el.innerHTML = USER_ICON_SVG;
    }
  }

  // ---------- Group ----------
  function group(items, opts) {
    injectStyles();
    items = Array.isArray(items) ? items : [];
    opts = opts || {};
    var max = typeof opts.max === 'number' ? opts.max : 4;
    var size = opts.size || 'md';

    var wrap = document.createElement('span');
    wrap.className = 'vx-avatar-group';

    var visible = items.slice(0, max);
    var rest = items.length - visible.length;

    visible.forEach(function (it) {
      var merged = Object.assign({}, it, { size: size });
      wrap.appendChild(create(merged));
    });

    if (rest > 0) {
      var more = create({ name: '+' + rest, size: size, bg: '#374151' });
      more.classList.add('vx-more');
      more.textContent = '+' + rest;
      more.title = rest + ' more';
      wrap.appendChild(more);
    }

    return wrap;
  }

  // ---------- Mount / Update ----------
  function mount(target, opts) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return null;
    var el = create(opts);
    host.innerHTML = '';
    host.appendChild(el);
    return el;
  }

  function update(el, opts) {
    if (!el || !el.parentNode) return null;
    var fresh = create(opts);
    el.parentNode.replaceChild(fresh, el);
    return fresh;
  }

  // ---------- Public API ----------
  var Avatar = {
    create: create,
    group: group,
    mount: mount,
    update: update,
    getInitials: getInitials,
    colorFor: colorFor,
    SIZES: SIZES,
    version: '1.0.0'
  };

  global.Avatar = Avatar;
  if (typeof module !== 'undefined' && module.exports) module.exports = Avatar;
})(typeof window !== 'undefined' ? window : this);
