/**
 * volvix-ai-assistant.js
 * Widget flotante de AI Assistant para Volvix POS.
 * - Chat en esquina inferior derecha
 * - Markdown simple (bold, italic, code, listas, links)
 * - Historia local en localStorage `volvix_ai_history`
 * - Comandos: /help, /sales today, /inventory low
 *
 * Uso: <script src="/volvix-ai-assistant.js" defer></script>
 * Requiere JWT en localStorage `volvix_token` (o cookie httpOnly via fetch credentials).
 */
(function () {
  'use strict';
  if (window.__VOLVIX_AI_ASSISTANT__) return;
  window.__VOLVIX_AI_ASSISTANT__ = true;

  var STORAGE_KEY = 'volvix_ai_history';
  var MAX_HISTORY = 50;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'style') n.style.cssText = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Markdown muy simple
  function renderMd(text) {
    var s = escHtml(text);
    // code fences ```...```
    s = s.replace(/```([\s\S]*?)```/g, function (_, c) {
      return '<pre><code>' + c + '</code></pre>';
    });
    // inline code `x`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // bold **x**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // italic *x*
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // links [t](u)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // list lines
    s = s.replace(/(^|\n)[-*] (.+)/g, '$1<li>$2</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // newlines
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-MAX_HISTORY))); }
    catch {}
  }

  function getToken() {
    return localStorage.getItem('volvix_token') || localStorage.getItem('token') || '';
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  // ── UI — REMOVED (UI cleanup) ─────────────────────────────────
  // #vai-fab (floating AI button) and #vai-panel eliminated.
  // API functions (api, getToken, etc.) preserved for external callers.

  function mount() {
    // no-op: floating AI chat bubble removed (UI cleanup)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
