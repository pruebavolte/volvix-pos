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

  // ── UI ────────────────────────────────────────────────────────
  var styles = '\
  #vai-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:#2a6df4;color:#fff;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);z-index:99998}\
  #vai-panel{position:fixed;right:20px;bottom:90px;width:360px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;color:#222;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:99999;font:14px/1.4 system-ui,sans-serif}\
  #vai-panel.open{display:flex}\
  #vai-head{background:#2a6df4;color:#fff;padding:10px 14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}\
  #vai-head button{background:transparent;border:none;color:#fff;font-size:18px;cursor:pointer}\
  #vai-msgs{flex:1;overflow-y:auto;padding:10px;background:#f7f8fa}\
  .vai-msg{margin:6px 0;padding:8px 10px;border-radius:8px;max-width:85%;word-wrap:break-word}\
  .vai-msg.u{background:#dbe7ff;margin-left:auto}\
  .vai-msg.a{background:#fff;border:1px solid #e5e7eb}\
  .vai-msg pre{background:#0e1525;color:#cde;padding:6px;border-radius:6px;overflow:auto;font-size:12px}\
  #vai-form{display:flex;border-top:1px solid #e5e7eb}\
  #vai-input{flex:1;border:none;padding:10px;font:inherit;outline:none}\
  #vai-send{border:none;background:#2a6df4;color:#fff;padding:0 14px;cursor:pointer}\
  #vai-send:disabled{opacity:.5;cursor:wait}\
  ';

  function mount() {
    var style = el('style'); style.textContent = styles; document.head.appendChild(style);

    var fab = el('button', { id: 'vai-fab', title: 'AI Assistant', 'aria-label': 'AI Assistant' }, ['AI']);
    var panel = el('div', { id: 'vai-panel', role: 'dialog', 'aria-label': 'Volvix AI Assistant' });
    var head = el('div', { id: 'vai-head' }, [
      'Volvix AI',
      el('button', { id: 'vai-close', title: 'Cerrar', 'aria-label': 'Cerrar' }, ['×'])
    ]);
    var msgs = el('div', { id: 'vai-msgs' });
    var form = el('form', { id: 'vai-form' });
    var input = el('input', { id: 'vai-input', type: 'text', placeholder: 'Pregunta o /help', autocomplete: 'off' });
    var send = el('button', { id: 'vai-send', type: 'submit' }, ['Enviar']);
    form.appendChild(input); form.appendChild(send);
    panel.appendChild(head); panel.appendChild(msgs); panel.appendChild(form);
    document.body.appendChild(fab); document.body.appendChild(panel);

    function append(role, text) {
      var div = el('div', { class: 'vai-msg ' + (role === 'user' ? 'u' : 'a') });
      div.innerHTML = renderMd(text);
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function rehydrate() {
      var h = loadHistory();
      h.forEach(function (m) { append(m.role, m.text); });
      if (!h.length) {
        append('assistant', 'Hola. Soy el asistente de **Volvix POS**. Escribe `/help` para ver comandos.');
      }
    }

    function pushHist(role, text) {
      var h = loadHistory();
      h.push({ role: role, text: text, ts: Date.now() });
      saveHistory(h);
    }

    function handleCommand(cmd) {
      cmd = cmd.trim().toLowerCase();
      if (cmd === '/help') {
        append('assistant', 'Comandos disponibles:\n- `/help` — esta ayuda\n- `/sales today` — ventas de hoy\n- `/inventory low` — inventario bajo\n\nO escribe cualquier pregunta libre.');
        pushHist('assistant', 'help shown');
        return true;
      }
      if (cmd === '/sales today') {
        fetch('/api/reports/daily', { headers: { 'Authorization': 'Bearer ' + getToken() }, credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var txt = '**Ventas de hoy:** ' + JSON.stringify(j);
            append('assistant', txt); pushHist('assistant', txt);
          })
          .catch(function (e) { append('assistant', 'Error: ' + e.message); });
        return true;
      }
      if (cmd === '/inventory low') {
        fetch('/api/inventory', { headers: { 'Authorization': 'Bearer ' + getToken() }, credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var low = (Array.isArray(j) ? j : []).filter(function (p) { return Number(p.stock) <= 5; });
            var lines = low.slice(0, 20).map(function (p) { return '- ' + p.name + ' (stock ' + p.stock + ')'; }).join('\n');
            var txt = low.length ? '**Inventario bajo (' + low.length + '):**\n' + lines : 'Sin inventario bajo.';
            append('assistant', txt); pushHist('assistant', txt);
          })
          .catch(function (e) { append('assistant', 'Error: ' + e.message); });
        return true;
      }
      return false;
    }

    function sendMessage(text) {
      append('user', text); pushHist('user', text);
      if (text.charAt(0) === '/' && handleCommand(text)) return;
      send.disabled = true;
      api('/api/ai/chat', { message: text, context: { url: location.pathname } })
        .then(function (r) {
          if (r.status === 503) { append('assistant', '_AI no configurado (falta ANTHROPIC_API_KEY)._'); return; }
          if (r.status === 429) { append('assistant', '_Rate limit. Espera un momento._'); return; }
          var c = (r.body && r.body.content) || (r.body && r.body.error) || 'Sin respuesta.';
          append('assistant', c); pushHist('assistant', c);
        })
        .catch(function (e) { append('assistant', 'Error: ' + e.message); })
        .finally(function () { send.disabled = false; input.focus(); });
    }

    fab.addEventListener('click', function () { panel.classList.toggle('open'); if (panel.classList.contains('open')) input.focus(); });
    $('#vai-close', panel).addEventListener('click', function () { panel.classList.remove('open'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value.trim();
      if (!t) return;
      input.value = '';
      sendMessage(t);
    });

    rehydrate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
