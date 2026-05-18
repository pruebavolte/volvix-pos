/* volvix-ui-mention.js
 * Volvix UI Mention & Hashtag Module
 * Provides @mention (users) and #hashtag (tags) autocomplete with popup list.
 * Public API: window.Mention
 *   - Mention.attach(inputEl, opts)        -> attach to <input>/<textarea>/contenteditable
 *   - Mention.detach(inputEl)              -> remove listeners and popup
 *   - Mention.setUsers(arr)                -> set list of users [{id,name,avatar?}]
 *   - Mention.setTags(arr)                 -> set list of tags  [{id,name,count?}]
 *   - Mention.addUser(user) / addTag(tag)
 *   - Mention.on(event, cb)                -> 'select','open','close'
 *   - Mention.parse(text)                  -> { mentions:[], hashtags:[] }
 *   - Mention.render(text)                 -> HTML with <span class="mention">@x</span>
 *
 * No external dependencies. Inserts its own CSS once.
 */
(function (global) {
  'use strict';

  // ---------- internal state ----------
  var users = [];
  var tags  = [];
  var listeners = { select: [], open: [], close: [] };
  var attached = new WeakMap(); // el -> handlers
  var popup = null;
  var popupItems = [];
  var popupIndex = 0;
  var activeEl = null;
  var activeCtx = null; // { trigger, query, start, end }

  var STYLE_ID = 'volvix-mention-style';
  var POPUP_ID = 'volvix-mention-popup';

  // ---------- CSS injection ----------
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '#' + POPUP_ID + '{position:absolute;z-index:99999;min-width:220px;max-width:340px;'
      + 'max-height:260px;overflow-y:auto;background:#1e1e26;color:#eee;border:1px solid #3a3a48;'
      + 'border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.45);font:13px/1.4 system-ui,sans-serif;'
      + 'padding:4px 0;display:none}'
      + '#' + POPUP_ID + ' .vm-item{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer}'
      + '#' + POPUP_ID + ' .vm-item:hover,#' + POPUP_ID + ' .vm-item.active{background:#2d2d3c}'
      + '#' + POPUP_ID + ' .vm-avatar{width:22px;height:22px;border-radius:50%;background:#444;'
      + 'display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0}'
      + '#' + POPUP_ID + ' .vm-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '#' + POPUP_ID + ' .vm-meta{color:#888;font-size:11px}'
      + '#' + POPUP_ID + ' .vm-empty{padding:8px 12px;color:#888;font-style:italic}'
      + '.mention,.hashtag{background:#2d4f8e;color:#fff;padding:1px 4px;border-radius:3px;'
      + 'text-decoration:none;font-weight:500}'
      + '.hashtag{background:#5a3d8e}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- popup management ----------
  function ensurePopup() {
    if (popup) return popup;
    injectStyle();
    popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.addEventListener('mousedown', function (e) { e.preventDefault(); });
    document.body.appendChild(popup);
    return popup;
  }

  function hidePopup() {
    if (!popup) return;
    if (popup.style.display !== 'none') {
      popup.style.display = 'none';
      popupItems = [];
      popupIndex = 0;
      activeCtx = null;
      emit('close', {});
    }
  }

  function renderPopup(items, trigger) {
    ensurePopup();
    popupItems = items;
    popupIndex = 0;
    if (!items.length) {
      popup.innerHTML = '<div class="vm-empty">Sin resultados</div>';
    } else {
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var initials = (it.name || '?').slice(0, 1).toUpperCase();
        var meta = trigger === '#'
          ? (it.count != null ? (it.count + ' usos') : '')
          : (it.handle ? '@' + it.handle : '');
        html += '<div class="vm-item' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">'
              + '<span class="vm-avatar">' + (trigger === '#' ? '#' : initials) + '</span>'
              + '<span class="vm-name">' + escapeHtml(it.name) + '</span>'
              + '<span class="vm-meta">' + escapeHtml(meta) + '</span>'
              + '</div>';
      }
      popup.innerHTML = html;
      var nodes = popup.querySelectorAll('.vm-item');
      for (var j = 0; j < nodes.length; j++) {
        nodes[j].addEventListener('click', function (e) {
          var idx = parseInt(this.getAttribute('data-i'), 10);
          selectIndex(idx);
        });
      }
    }
    popup.style.display = 'block';
  }

  function positionPopup(el) {
    if (!popup) return;
    var rect = el.getBoundingClientRect();
    var caret = getCaretCoords(el);
    var top = window.scrollY + rect.top + (caret ? caret.top : 0) + 22;
    var left = window.scrollX + rect.left + (caret ? caret.left : 0);
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
  }

  function setActiveItem(idx) {
    if (!popup) return;
    var nodes = popup.querySelectorAll('.vm-item');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('active', i === idx);
    }
    popupIndex = idx;
    if (nodes[idx]) nodes[idx].scrollIntoView({ block: 'nearest' });
  }

  // ---------- caret / context ----------
  function getCaretCoords(el) {
    if (el.isContentEditable) {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      var r = sel.getRangeAt(0).cloneRange();
      var rect = r.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      return { top: rect.top - elRect.top, left: rect.left - elRect.left };
    }
    // textarea/input — approximate via mirror
    return { top: 0, left: 0 };
  }

  function getCurrentContext(el) {
    var value, pos;
    if (el.isContentEditable) {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      var range = sel.getRangeAt(0);
      value = el.textContent;
      pos = preCaretLength(el, range);
    } else {
      value = el.value;
      pos = el.selectionStart;
    }
    var before = value.slice(0, pos);
    var m = before.match(/(^|\s)([@#])([\w\-\.áéíóúÁÉÍÓÚñÑ]*)$/);
    if (!m) return null;
    return {
      trigger: m[2],
      query: m[3].toLowerCase(),
      start: pos - m[3].length - 1,
      end: pos,
      value: value
    };
  }

  function preCaretLength(root, range) {
    var pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  // ---------- search ----------
  function search(trigger, query) {
    var pool = trigger === '#' ? tags : users;
    if (!query) return pool.slice(0, 8);
    var out = [];
    for (var i = 0; i < pool.length && out.length < 8; i++) {
      var item = pool[i];
      var name = (item.name || '').toLowerCase();
      var handle = (item.handle || '').toLowerCase();
      if (name.indexOf(query) !== -1 || handle.indexOf(query) !== -1) out.push(item);
    }
    return out;
  }

  // ---------- selection / insertion ----------
  function selectIndex(idx) {
    var item = popupItems[idx];
    if (!item || !activeEl || !activeCtx) return hidePopup();
    insertItem(activeEl, activeCtx, item);
    emit('select', { item: item, trigger: activeCtx.trigger, el: activeEl });
    hidePopup();
  }

  function insertItem(el, ctx, item) {
    var token = ctx.trigger + (item.handle || item.name).replace(/\s+/g, '_') + ' ';
    if (el.isContentEditable) {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      // crude replace: rebuild last token via execCommand for compat
      for (var i = 0; i < ctx.end - ctx.start; i++) {
        document.execCommand('delete', false, null);
      }
      document.execCommand('insertText', false, token);
    } else {
      var v = el.value;
      el.value = v.slice(0, ctx.start) + token + v.slice(ctx.end);
      var newPos = ctx.start + token.length;
      el.selectionStart = el.selectionEnd = newPos;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ---------- event wiring ----------
  function onInput(e) {
    var el = e.currentTarget;
    activeEl = el;
    var ctx = getCurrentContext(el);
    if (!ctx) return hidePopup();
    activeCtx = ctx;
    var results = search(ctx.trigger, ctx.query);
    renderPopup(results, ctx.trigger);
    positionPopup(el);
    emit('open', { trigger: ctx.trigger, query: ctx.query });
  }

  function onKeyDown(e) {
    if (!popup || popup.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveItem(Math.min(popupIndex + 1, popupItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveItem(Math.max(popupIndex - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (popupItems.length) {
        e.preventDefault();
        selectIndex(popupIndex);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hidePopup();
    }
  }

  function onBlur() {
    setTimeout(hidePopup, 120);
  }

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function emit(ev, data) {
    var arr = listeners[ev] || [];
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](data); } catch (err) { /* swallow */ }
    }
  }

  // ---------- public API ----------
  var Mention = {
    attach: function (el, opts) {
      if (!el || attached.has(el)) return;
      opts = opts || {};
      if (opts.users) users = opts.users.slice();
      if (opts.tags)  tags  = opts.tags.slice();
      injectStyle();
      var h = {
        input: onInput,
        keydown: onKeyDown,
        blur: onBlur
      };
      el.addEventListener('input', h.input);
      el.addEventListener('keydown', h.keydown);
      el.addEventListener('blur', h.blur);
      attached.set(el, h);
      return Mention;
    },
    detach: function (el) {
      var h = attached.get(el);
      if (!h) return;
      el.removeEventListener('input', h.input);
      el.removeEventListener('keydown', h.keydown);
      el.removeEventListener('blur', h.blur);
      attached.delete(el);
    },
    setUsers: function (arr) { users = (arr || []).slice(); return Mention; },
    setTags:  function (arr) { tags  = (arr || []).slice(); return Mention; },
    addUser:  function (u) { if (u) users.push(u); return Mention; },
    addTag:   function (t) { if (t) tags.push(t);  return Mention; },
    on: function (ev, cb) {
      if (!listeners[ev]) listeners[ev] = [];
      listeners[ev].push(cb);
      return Mention;
    },
    off: function (ev, cb) {
      if (!listeners[ev]) return;
      listeners[ev] = listeners[ev].filter(function (f) { return f !== cb; });
    },
    parse: function (text) {
      text = String(text || '');
      var mentions = [];
      var hashtags = [];
      var rx = /(^|\s)([@#])([\w\-\.áéíóúÁÉÍÓÚñÑ_]+)/g;
      var m;
      while ((m = rx.exec(text)) !== null) {
        if (m[2] === '@') mentions.push(m[3]);
        else hashtags.push(m[3]);
      }
      return { mentions: mentions, hashtags: hashtags };
    },
    render: function (text) {
      return escapeHtml(text).replace(
        /(^|\s)([@#])([\w\-\.áéíóúÁÉÍÓÚñÑ_]+)/g,
        function (full, pre, sym, name) {
          var cls = sym === '@' ? 'mention' : 'hashtag';
          return pre + '<span class="' + cls + '" data-' + (sym === '@' ? 'user' : 'tag') + '="' + name + '">' + sym + name + '</span>';
        }
      );
    },
    _state: function () {
      return { users: users.slice(), tags: tags.slice(), attached: !!activeEl };
    }
  };

  global.Mention = Mention;

  // auto-init on data-mention attribute
  if (document.readyState !== 'loading') autoInit();
  else document.addEventListener('DOMContentLoaded', autoInit);

  function autoInit() {
    var nodes = document.querySelectorAll('[data-mention]');
    for (var i = 0; i < nodes.length; i++) Mention.attach(nodes[i]);
  }

})(typeof window !== 'undefined' ? window : this);
