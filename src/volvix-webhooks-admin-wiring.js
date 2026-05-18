/* volvix-webhooks-admin-wiring.js
 * R14 — Outbound webhooks admin UI (list, create, deliveries, regenerate secret).
 * Renders into the element with id "webhooks-admin-root" if present.
 */
(function () {
  'use strict';

  const EVENTS = [
    'sale.created', 'sale.refunded',
    'customer.created',
    'inventory.low_stock',
    'payment.succeeded', 'payment.failed'
  ];

  function token() {
    return localStorage.getItem('volvix_jwt') || localStorage.getItem('jwt') || '';
  }

  async function api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((data && data.error) || ('HTTP ' + r.status));
    return data;
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'onclick' || k === 'onchange' || k === 'onsubmit') el[k] = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    for (const c of children) {
      if (c == null) continue;
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  async function render(root) {
    root.innerHTML = '';
    const title = h('h2', null, 'Webhooks salientes');
    const newBtn = h('button', { class: 'btn btn-primary', onclick: () => showCreateForm(root) }, '+ Nuevo webhook');
    const list = h('div', { id: 'wh-list', style: { marginTop: '12px' } }, 'Cargando...');
    root.append(title, newBtn, list);

    try {
      const items = await api('GET', '/api/webhooks');
      list.innerHTML = '';
      if (!items.length) { list.appendChild(h('p', null, 'No hay endpoints registrados.')); return; }
      const tbl = h('table', { class: 'table', style: { width: '100%' } });
      tbl.innerHTML = '<thead><tr><th>URL</th><th>Eventos</th><th>Activo</th><th>Secret</th><th>Acciones</th></tr></thead>';
      const tbody = h('tbody');
      for (const it of items) {
        const tr = h('tr', null,
          h('td', null, it.url),
          h('td', null, (it.events || []).join(', ')),
          h('td', null, it.active ? 'Sí' : 'No'),
          h('td', { style: { fontFamily: 'monospace', fontSize: '12px' } }, it.secret || ''),
          h('td', null,
            h('button', { onclick: () => testEndpoint(it.id), class: 'btn-sm' }, 'Test'),
            ' ',
            h('button', { onclick: () => viewDeliveries(root, it.id), class: 'btn-sm' }, 'Deliveries'),
            ' ',
            h('button', { onclick: () => regenSecret(it.id, root), class: 'btn-sm' }, 'Rotar secret'),
            ' ',
            h('button', { onclick: () => toggleActive(it, root), class: 'btn-sm' }, it.active ? 'Pausar' : 'Activar'),
            ' ',
            h('button', { onclick: () => removeEndpoint(it.id, root), class: 'btn-sm btn-danger' }, 'Eliminar')
          )
        );
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      list.appendChild(tbl);
    } catch (e) {
      list.innerHTML = '';
      list.appendChild(h('p', { style: { color: 'red' } }, 'Error: ' + e.message));
    }
  }

  function showCreateForm(root) {
    const form = h('form', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const events = EVENTS.filter(e => fd.get('ev_' + e));
        try {
          await api('POST', '/api/webhooks', {
            url: fd.get('url'),
            description: fd.get('description') || null,
            events
          });
          VolvixUI.toast({type:'success', message:'Webhook creado.'});
          render(root);
        } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
      },
      style: { border: '1px solid #ccc', padding: '12px', marginTop: '12px' }
    },
      h('h3', null, 'Nuevo webhook'),
      h('label', null, 'URL: ', h('input', { type: 'url', name: 'url', required: 'true', style: { width: '100%' } })),
      h('label', null, 'Descripción: ', h('input', { type: 'text', name: 'description', style: { width: '100%' } })),
      h('fieldset', null, h('legend', null, 'Eventos'),
        ...EVENTS.map(e => h('label', { style: { display: 'block' } },
          h('input', { type: 'checkbox', name: 'ev_' + e, value: '1' }), ' ', e))
      ),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Guardar')
    );
    const existing = document.getElementById('wh-create-form');
    if (existing) existing.remove();
    form.id = 'wh-create-form';
    root.appendChild(form);
  }

  async function testEndpoint(id) {
    try {
      const r = await api('POST', '/api/webhooks/' + id + '/test');
      VolvixUI.toast({type:'info', message:'Resultado: ' + JSON.stringify(r, null, 2)});
    } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
  }

  async function viewDeliveries(root, id) {
    try {
      const items = await api('GET', '/api/webhooks/' + id + '/deliveries');
      const dlg = h('div', { id: 'wh-deliveries', style: { border: '1px solid #888', padding: '12px', marginTop: '12px' } });
      dlg.appendChild(h('h3', null, 'Deliveries (' + items.length + ')'));
      const tbl = h('table', { class: 'table', style: { width: '100%' } });
      tbl.innerHTML = '<thead><tr><th>TS</th><th>Evento</th><th>Status</th><th>Code</th><th>Intentos</th><th>Error</th></tr></thead>';
      const tbody = h('tbody');
      for (const d of items) {
        tbody.appendChild(h('tr', null,
          h('td', null, d.ts),
          h('td', null, d.event),
          h('td', null, d.status),
          h('td', null, d.status_code || ''),
          h('td', null, d.attempts),
          h('td', { style: { color: 'red', fontSize: '12px' } }, d.last_error || '')
        ));
      }
      tbl.appendChild(tbody);
      dlg.appendChild(tbl);
      dlg.appendChild(h('button', { onclick: () => dlg.remove() }, 'Cerrar'));
      const old = document.getElementById('wh-deliveries');
      if (old) old.remove();
      root.appendChild(dlg);
    } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
  }

  async function regenSecret(id, root) {
    if (!await VolvixUI.destructiveConfirm({ title: 'Regenerar secret', message: 'Esto invalidará el secret actual. ¿Continuar?', confirmText: 'Regenerar', requireText: 'ELIMINAR' })) return;
    try {
      const r = await api('PATCH', '/api/webhooks/' + id, { regenerate_secret: true });
      VolvixUI.toast({type:'success', message:'Nuevo secret:\n' + (r.secret || '(creado)')});
      render(root);
    } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
  }

  async function toggleActive(it, root) {
    try {
      await api('PATCH', '/api/webhooks/' + it.id, { active: !it.active });
      render(root);
    } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
  }

  async function removeEndpoint(id, root) {
    if (!await VolvixUI.destructiveConfirm({ title: 'Eliminar endpoint', message: '¿Eliminar este endpoint?', confirmText: 'Eliminar', requireText: 'ELIMINAR' })) return;
    try {
      await api('DELETE', '/api/webhooks/' + id);
      render(root);
    } catch (e) { VolvixUI.toast({type:'error', message:'Error: ' + e.message}); }
  }

  function init() {
    const root = document.getElementById('webhooks-admin-root');
    if (root) render(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual mounting
  window.VolvixWebhooksAdmin = { render, init };
})();
