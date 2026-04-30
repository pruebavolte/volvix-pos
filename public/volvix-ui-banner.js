/**
 * Volvix UI Banner Component
 * Top/bottom announcement banners with dismissible, sticky, and type variants.
 *
 * Usage:
 *   const b = Banner.show({ message: 'Hello', type: 'info', position: 'top' });
 *   b.hide();
 *   Banner.hideAll();
 *
 * Types: info | promo | warning | success | error
 * Positions: top | bottom
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'volvix-banner-styles';
  var CONTAINER_TOP_ID = 'volvix-banner-container-top';
  var CONTAINER_BOTTOM_ID = 'volvix-banner-container-bottom';
  var STORAGE_PREFIX = 'volvix.banner.dismissed.';

  var TYPE_COLORS = {
    info:    { bg: '#2563eb', fg: '#ffffff', accent: '#1e40af' },
    promo:   { bg: '#7c3aed', fg: '#ffffff', accent: '#5b21b6' },
    warning: { bg: '#f59e0b', fg: '#1f2937', accent: '#b45309' },
    success: { bg: '#10b981', fg: '#ffffff', accent: '#047857' },
    error:   { bg: '#ef4444', fg: '#ffffff', accent: '#b91c1c' }
  };

  var DEFAULTS = {
    message: '',
    type: 'info',
    position: 'top',
    sticky: false,
    dismissible: true,
    persistDismiss: false,
    id: null,
    icon: null,
    actionText: null,
    actionHref: null,
    onAction: null,
    onShow: null,
    onDismiss: null,
    autoDismiss: 0,
    html: false,
    zIndex: 9999,
    animate: true
  };

  var instances = {};
  var counter = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.vx-banner-container{position:fixed;left:0;right:0;display:flex;flex-direction:column;pointer-events:none;}'
      + '.vx-banner-container.top{top:0;}'
      + '.vx-banner-container.bottom{bottom:0;flex-direction:column-reverse;}'
      + '.vx-banner{pointer-events:auto;width:100%;box-sizing:border-box;padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.4;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.15);}'
      + '.vx-banner.sticky{position:sticky;}'
      + '.vx-banner-icon{flex:0 0 auto;font-size:18px;line-height:1;}'
      + '.vx-banner-msg{flex:1 1 auto;}'
      + '.vx-banner-action{flex:0 0 auto;background:rgba(255,255,255,.18);color:inherit;border:1px solid rgba(255,255,255,.4);padding:5px 12px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;text-decoration:none;display:inline-block;}'
      + '.vx-banner-action:hover{background:rgba(255,255,255,.3);}'
      + '.vx-banner-close{flex:0 0 auto;background:transparent;border:0;color:inherit;cursor:pointer;font-size:20px;line-height:1;padding:0 4px;opacity:.8;}'
      + '.vx-banner-close:hover{opacity:1;}'
      + '.vx-banner.animate-in{animation:vxBannerIn .25s ease-out;}'
      + '.vx-banner.animate-out{animation:vxBannerOut .2s ease-in forwards;}'
      + '@keyframes vxBannerIn{from{transform:translateY(-100%);opacity:0;}to{transform:translateY(0);opacity:1;}}'
      + '@keyframes vxBannerOut{from{transform:translateY(0);opacity:1;}to{transform:translateY(-100%);opacity:0;}}'
      + '.vx-banner-container.bottom .vx-banner.animate-in{animation-name:vxBannerInBot;}'
      + '.vx-banner-container.bottom .vx-banner.animate-out{animation-name:vxBannerOutBot;}'
      + '@keyframes vxBannerInBot{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}}'
      + '@keyframes vxBannerOutBot{from{transform:translateY(0);opacity:1;}to{transform:translateY(100%);opacity:0;}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function getContainer(position, zIndex) {
    var id = position === 'bottom' ? CONTAINER_BOTTOM_ID : CONTAINER_TOP_ID;
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'vx-banner-container ' + (position === 'bottom' ? 'bottom' : 'top');
      el.style.zIndex = String(zIndex);
      document.body.appendChild(el);
    } else {
      el.style.zIndex = String(Math.max(parseInt(el.style.zIndex || '0', 10), zIndex));
    }
    return el;
  }

  function isDismissed(id) {
    try {
      return global.localStorage.getItem(STORAGE_PREFIX + id) === '1';
    } catch (e) { return false; }
  }

  function markDismissed(id) {
    try { global.localStorage.setItem(STORAGE_PREFIX + id, '1'); } catch (e) {}
  }

  function clearDismissed(id) {
    try {
      if (id) global.localStorage.removeItem(STORAGE_PREFIX + id);
      else {
        for (var i = global.localStorage.length - 1; i >= 0; i--) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf(STORAGE_PREFIX) === 0) global.localStorage.removeItem(k);
        }
      }
    } catch (e) {}
  }

  function merge(a, b) {
    var o = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined) o[k] = b[k];
    return o;
  }

  function build(opts) {
    var palette = TYPE_COLORS[opts.type] || TYPE_COLORS.info;
    var el = document.createElement('div');
    el.className = 'vx-banner' + (opts.sticky ? ' sticky' : '') + (opts.animate ? ' animate-in' : '');
    el.setAttribute('role', opts.type === 'error' || opts.type === 'warning' ? 'alert' : 'status');
    el.style.background = palette.bg;
    el.style.color = palette.fg;
    el.style.borderBottom = opts.position === 'top' ? '2px solid ' + palette.accent : '0';
    el.style.borderTop = opts.position === 'bottom' ? '2px solid ' + palette.accent : '0';

    if (opts.icon) {
      var ic = document.createElement('span');
      ic.className = 'vx-banner-icon';
      ic.textContent = opts.icon;
      el.appendChild(ic);
    } else {
      var defaultIcons = { info: 'i', promo: '*', warning: '!', success: 'OK', error: 'X' };
      var ic2 = document.createElement('span');
      ic2.className = 'vx-banner-icon';
      ic2.textContent = defaultIcons[opts.type] || '';
      el.appendChild(ic2);
    }

    var msg = document.createElement('span');
    msg.className = 'vx-banner-msg';
    if (opts.html) msg.innerHTML = opts.message;
    else msg.textContent = opts.message;
    el.appendChild(msg);

    if (opts.actionText) {
      var act;
      if (opts.actionHref) {
        act = document.createElement('a');
        act.href = opts.actionHref;
      } else {
        act = document.createElement('button');
        act.type = 'button';
      }
      act.className = 'vx-banner-action';
      act.textContent = opts.actionText;
      act.addEventListener('click', function (e) {
        if (typeof opts.onAction === 'function') opts.onAction(e);
      });
      el.appendChild(act);
    }

    if (opts.dismissible) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vx-banner-close';
      btn.setAttribute('aria-label', 'Cerrar');
      btn.textContent = '×';
      btn.addEventListener('click', function () { hideInstance(opts._uid, true); });
      el.appendChild(btn);
    }

    return el;
  }

  function hideInstance(uid, userInitiated) {
    var inst = instances[uid];
    if (!inst) return;
    var el = inst.el;
    var opts = inst.opts;
    if (inst.timer) { clearTimeout(inst.timer); inst.timer = null; }
    if (userInitiated && opts.persistDismiss && opts.id) markDismissed(opts.id);

    var done = function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      delete instances[uid];
      if (typeof opts.onDismiss === 'function') opts.onDismiss({ userInitiated: !!userInitiated });
    };

    if (opts.animate) {
      el.classList.remove('animate-in');
      el.classList.add('animate-out');
      setTimeout(done, 220);
    } else {
      done();
    }
  }

  function show(options) {
    if (!document.body) {
      return new Promise(function (resolve) {
        document.addEventListener('DOMContentLoaded', function () { resolve(show(options)); });
      });
    }
    injectStyles();
    var opts = merge(DEFAULTS, options || {});
    if (!opts.message) throw new Error('Banner.show: message required');
    if (opts.persistDismiss && opts.id && isDismissed(opts.id)) {
      return { hide: function () {}, el: null, dismissed: true };
    }
    counter += 1;
    opts._uid = 'b' + counter;

    var container = getContainer(opts.position, opts.zIndex);
    var el = build(opts);
    if (opts.position === 'bottom') container.appendChild(el);
    else container.appendChild(el);

    var inst = { el: el, opts: opts, timer: null };
    instances[opts._uid] = inst;

    if (opts.autoDismiss && opts.autoDismiss > 0) {
      inst.timer = setTimeout(function () { hideInstance(opts._uid, false); }, opts.autoDismiss);
    }
    if (typeof opts.onShow === 'function') opts.onShow();

    return {
      el: el,
      uid: opts._uid,
      hide: function () { hideInstance(opts._uid, false); },
      update: function (newMsg) {
        var m = el.querySelector('.vx-banner-msg');
        if (!m) return;
        if (opts.html) m.innerHTML = newMsg; else m.textContent = newMsg;
      }
    };
  }

  function hideAll() {
    Object.keys(instances).forEach(function (uid) { hideInstance(uid, false); });
  }

  var Banner = {
    show: show,
    hideAll: hideAll,
    info: function (msg, o) { return show(merge({ message: msg, type: 'info' }, o)); },
    promo: function (msg, o) { return show(merge({ message: msg, type: 'promo' }, o)); },
    warning: function (msg, o) { return show(merge({ message: msg, type: 'warning' }, o)); },
    success: function (msg, o) { return show(merge({ message: msg, type: 'success' }, o)); },
    error: function (msg, o) { return show(merge({ message: msg, type: 'error' }, o)); },
    clearDismissed: clearDismissed,
    _instances: instances
  };

  global.Banner = Banner;
  if (typeof module !== 'undefined' && module.exports) module.exports = Banner;
})(typeof window !== 'undefined' ? window : this);
