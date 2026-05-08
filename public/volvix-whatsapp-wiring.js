/**
 * volvix-whatsapp-wiring.js  (R17)
 * Chat widget para enviar quick messages de WhatsApp a clientes desde el POS.
 * Backend real: POST /api/whatsapp/send  { to, template, params:[] }
 *
 * Templates pre-aprobados:
 *   order_confirmation, payment_received, shipping_update,
 *   low_stock_alert, appointment_reminder
 *
 * Reemplaza el mock anterior por integración real con Meta Graph vía /api.
 */
(function (global) {
  'use strict';

  var BASE = '/api/whatsapp';
  var TEMPLATES = [
    'order_confirmation',
    'payment_received',
    'shipping_update',
    'low_stock_alert',
    'appointment_reminder'
  ];

  function getToken() {
    try { return localStorage.getItem('volvix_token') || sessionStorage.getItem('volvix_token') || ''; }
    catch (_) { return ''; }
  }

  function authHeaders() {
    var t = getToken();
    var h = { 'Content-Type': 'application/json' };
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: authHeaders(),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) { j.__status = r.status; return j; }).catch(function () {
        return { ok: false, error: 'parse', __status: r.status };
      });
    });
  }

  function send(to, template, params) {
    if (!to || !template) return Promise.reject(new Error('to/template requeridos'));
    if (TEMPLATES.indexOf(template) === -1) return Promise.reject(new Error('template no aprobado'));
    return api('/send', { method: 'POST', body: { to: to, template: template, params: params || [] } });
  }

  function getTemplates() { return api('/templates'); }
  function getMessages() { return api('/messages'); }

  function sendQuick(phone, customerName, orderId, total) {
    return send(phone, 'order_confirmation', [
      String(customerName || 'Cliente'),
      String(orderId || '-'),
      String(total || 0)
    ]);
  }

  // ------------------------------------------------------------------
  // Floating widget
  // ------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('vlx-wa-styles')) return;
    var s = document.createElement('style');
    s.id = 'vlx-wa-styles';
    s.textContent = [
      '#vlx-wa-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:#25D366;color:#fff;border:0;font-size:26px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:99998}',
      '#vlx-wa-panel{position:fixed;right:20px;bottom:90px;width:320px;max-height:480px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:none;flex-direction:column;z-index:99999;font-family:system-ui,sans-serif;overflow:hidden}',
      '#vlx-wa-panel.open{display:flex}',
      '#vlx-wa-head{background:#075E54;color:#fff;padding:10px 14px;font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center}',
      '#vlx-wa-body{padding:12px;overflow-y:auto;flex:1;font-size:13px}',
      '#vlx-wa-body label{display:block;font-size:11px;color:#555;margin-top:6px}',
      '#vlx-wa-body input,#vlx-wa-body select,#vlx-wa-body textarea{width:100%;margin:4px 0 6px;padding:7px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box}',
      '#vlx-wa-body textarea{resize:vertical;min-height:60px}',
      '#vlx-wa-send{background:#25D366;color:#fff;border:0;padding:9px 14px;border-radius:6px;cursor:pointer;width:100%;font-weight:600}',
      '#vlx-wa-send:disabled{opacity:.5;cursor:not-allowed}',
      '#vlx-wa-status{font-size:11px;color:#666;margin-top:8px;min-height:14px}',
      '.vlx-wa-close{cursor:pointer;background:transparent;border:0;color:#fff;font-size:18px;line-height:1}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildPanel() {
    if (document.getElementById('vlx-wa-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'vlx-wa-panel';
    var tplOptions = TEMPLATES.map(function (t) {
      return '<option value="' + t + '">' + t + '</option>';
    }).join('');
    panel.innerHTML =
      '<div id="vlx-wa-head">WhatsApp - Volvix POS' +
        '<button class="vlx-wa-close" type="button" aria-label="cerrar">&times;</button>' +
      '</div>' +
      '<div id="vlx-wa-body">' +
        '<label>Telefono (E.164, ej +5215512345678)</label>' +
        '<input type="text" id="vlx-wa-to" placeholder="+5215512345678" />' +
        '<label>Plantilla</label>' +
        '<select id="vlx-wa-tpl">' + tplOptions + '</select>' +
        '<label>Parametros (separados por |)</label>' +
        '<textarea id="vlx-wa-params" placeholder="Juan|ORD-123|450.00"></textarea>' +
        '<button id="vlx-wa-send" type="button">Enviar</button>' +
        '<div id="vlx-wa-status"></div>' +
      '</div>';
    document.body.appendChild(panel);

    panel.querySelector('.vlx-wa-close').addEventListener('click', toggle);
    panel.querySelector('#vlx-wa-send').addEventListener('click', onSendClick);
  }

  function buildFab() {
    // 2026-05-07 cleanup: FAB deshabilitado, gateado por feature flag.
    // Para re-habilitar: window.VOLVIX_WHATSAPP_FAB = true antes de cargar.
    if (window.VOLVIX_WHATSAPP_FAB !== true) return;
    if (document.getElementById('vlx-wa-fab')) return;
    var b = document.createElement('button');
    b.id = 'vlx-wa-fab';
    b.type = 'button';
    b.title = 'WhatsApp';
    b.textContent = 'WA';
    b.addEventListener('click', toggle);
    document.body.appendChild(b);
  }

  function toggle() {
    var p = document.getElementById('vlx-wa-panel');
    if (p) p.classList.toggle('open');
  }

  function onSendClick() {
    var to = (document.getElementById('vlx-wa-to').value || '').trim();
    var tpl = document.getElementById('vlx-wa-tpl').value;
    var raw = (document.getElementById('vlx-wa-params').value || '').trim();
    var params = raw ? raw.split('|').map(function (s) { return s.trim(); }) : [];
    var status = document.getElementById('vlx-wa-status');
    var btn = document.getElementById('vlx-wa-send');
    if (!to) { status.textContent = 'Falta telefono'; return; }
    btn.disabled = true; status.textContent = 'Enviando...';
    send(to, tpl, params).then(function (r) {
      if (r && r.ok) status.textContent = 'Enviado - wa_id=' + (r.wa_id || '?');
      else if (r && r.__status === 503) status.textContent = 'Backend no configurado (WHATSAPP_TOKEN)';
      else status.textContent = 'Error: ' + ((r && r.error && (r.error.message || r.error)) || 'desconocido');
    }).catch(function (e) {
      status.textContent = 'Error: ' + (e.message || e);
    }).then(function () { btn.disabled = false; });
  }

  function mount() {
    if (typeof document === 'undefined') return;
    injectStyles();
    buildFab();
    buildPanel();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }

  global.WhatsAppAPI = {
    send: send,
    sendQuick: sendQuick,
    templates: getTemplates,
    messages: getMessages,
    TEMPLATES: TEMPLATES.slice(),
    open: function () { var p = document.getElementById('vlx-wa-panel'); if (p) p.classList.add('open'); },
    close: function () { var p = document.getElementById('vlx-wa-panel'); if (p) p.classList.remove('open'); },
    mount: mount
  };
})(typeof window !== 'undefined' ? window : globalThis);
