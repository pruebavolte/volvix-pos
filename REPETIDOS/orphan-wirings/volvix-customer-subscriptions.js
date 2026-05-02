// volvix-customer-subscriptions.js
// Panel de suscripciones recurrentes en el detalle de cliente.
// Uso: incluir en el HTML del customer detail y llamar a
//   window.VolvixCustomerSubs.mount(containerEl, customerId)
// Si en la página existe un elemento con id="customer-subscriptions-panel"
// y un atributo data-customer-id, se autoinjecta al cargar.

(function () {
  'use strict';

  // VxUI: VolvixUI con fallback nativo
  const _w = window;
  const VxUI = {
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') _w.VolvixUI.toast({ type, message });
      else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message); }
    },
    async destructiveConfirm(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.destructiveConfirm === 'function')
        return !!(await _w.VolvixUI.destructiveConfirm(opts));
      const fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
    },
    async confirm(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.confirm === 'function')
        return !!(await _w.VolvixUI.confirm(opts));
      const fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
    }
  };

  const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
  const TOKEN_KEY = 'volvix_jwt';

  function authHeaders() {
    const t = localStorage.getItem(TOKEN_KEY) || '';
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  async function api(method, path, body) {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`${method} ${path} -> ${res.status} ${txt}`);
    }
    return res.json();
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
  }

  function fmtMoney(n, cur) {
    const v = Number(n) || 0;
    return v.toFixed(2) + ' ' + (cur || 'mxn').toUpperCase();
  }

  function intervalLabel(i) {
    return ({ weekly: 'Semanal', monthly: 'Mensual', yearly: 'Anual' })[i] || i;
  }

  function statusBadge(s) {
    const colors = {
      active:   '#10b981',
      paused:   '#f59e0b',
      canceled: '#ef4444',
      expired:  '#6b7280',
    };
    const c = colors[s] || '#6b7280';
    return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${s}</span>`;
  }

  function rowHTML(sub) {
    return `
      <tr data-sub-id="${sub.id}">
        <td><strong>${sub.plan_name || ''}</strong></td>
        <td>${fmtMoney(sub.amount, sub.currency)}</td>
        <td>${intervalLabel(sub.interval)}</td>
        <td>${fmtDate(sub.next_charge_at)}</td>
        <td>${statusBadge(sub.status)}</td>
        <td style="white-space:nowrap">
          ${sub.status === 'active'
            ? `<button class="vcs-btn vcs-pause" data-id="${sub.id}">Pausar</button>`
            : sub.status === 'paused'
              ? `<button class="vcs-btn vcs-resume" data-id="${sub.id}">Reanudar</button>`
              : ''}
          ${sub.status !== 'canceled'
            ? `<button class="vcs-btn vcs-cancel" data-id="${sub.id}">Cancelar</button>`
            : ''}
          ${sub.status === 'active'
            ? `<button class="vcs-btn vcs-charge" data-id="${sub.id}">Cobrar ahora</button>`
            : ''}
        </td>
      </tr>`;
  }

  function panelHTML(subs) {
    const rows = subs.length
      ? subs.map(rowHTML).join('')
      : `<tr><td colspan="6" style="text-align:center;color:#888;padding:18px">Sin suscripciones</td></tr>`;
    return `
      <style>
        .vcs-wrap { font-family: system-ui, sans-serif; margin: 12px 0; }
        .vcs-wrap h3 { margin: 0 0 8px 0; font-size: 16px; }
        .vcs-wrap table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .vcs-wrap th, .vcs-wrap td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; }
        .vcs-wrap th { background: #f7f7f7; font-weight: 600; }
        .vcs-btn { padding: 4px 8px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 4px; }
        .vcs-btn:hover { background: #f0f0f0; }
        .vcs-add { padding: 6px 12px; background: #2563eb; color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
        .vcs-form { margin-top: 8px; padding: 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; display: none; }
        .vcs-form input, .vcs-form select { padding: 4px; margin: 2px; border: 1px solid #ccc; border-radius: 3px; }
      </style>
      <div class="vcs-wrap">
        <h3>Suscripciones recurrentes</h3>
        <table>
          <thead><tr>
            <th>Plan</th><th>Monto</th><th>Intervalo</th><th>Próximo cobro</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody class="vcs-tbody">${rows}</tbody>
        </table>
        <div style="margin-top:8px">
          <button class="vcs-add">+ Nueva suscripción</button>
        </div>
        <div class="vcs-form">
          <input class="vcs-plan" placeholder="Nombre del plan" />
          <input class="vcs-amount" type="number" step="0.01" placeholder="Monto" />
          <select class="vcs-interval">
            <option value="weekly">Semanal</option>
            <option value="monthly" selected>Mensual</option>
            <option value="yearly">Anual</option>
          </select>
          <button class="vcs-create">Crear</button>
          <button class="vcs-cancel-form">Cancelar</button>
        </div>
      </div>`;
  }

  async function load(container, customerId) {
    try {
      const subs = await api('GET', `/api/customer-subscriptions?customer_id=${encodeURIComponent(customerId)}`);
      container.innerHTML = panelHTML(Array.isArray(subs) ? subs : (subs.items || []));
      bind(container, customerId);
    } catch (err) {
      container.innerHTML = `<div style="color:#b00;padding:8px">Error cargando suscripciones: ${err.message}</div>`;
    }
  }

  function bind(container, customerId) {
    const tbody = container.querySelector('.vcs-tbody');
    const form  = container.querySelector('.vcs-form');

    container.querySelector('.vcs-add').onclick = () => {
      form.style.display = form.style.display === 'block' ? 'none' : 'block';
    };
    container.querySelector('.vcs-cancel-form').onclick = () => { form.style.display = 'none'; };

    container.querySelector('.vcs-create').onclick = async () => {
      const plan = container.querySelector('.vcs-plan').value.trim();
      const amount = Number(container.querySelector('.vcs-amount').value);
      const interval = container.querySelector('.vcs-interval').value;
      if (!plan || !(amount >= 0)) { VxUI.toast('error', 'Plan y monto requeridos'); return; }
      try {
        await api('POST', '/api/customer-subscriptions', {
          customer_id: customerId, plan_name: plan, amount, interval,
        });
        await load(container, customerId);
      } catch (e) { VxUI.toast('error', 'Error: ' + e.message); }
    };

    tbody.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      try {
        if (btn.classList.contains('vcs-pause')) {
          await api('PATCH', `/api/customer-subscriptions/${id}`, { status: 'paused' });
        } else if (btn.classList.contains('vcs-resume')) {
          await api('PATCH', `/api/customer-subscriptions/${id}`, { status: 'active' });
        } else if (btn.classList.contains('vcs-cancel')) {
          if (!await VxUI.destructiveConfirm({ title: 'Cancelar suscripción', message: '¿Cancelar la suscripción?', confirmText: 'Cancelar', cancelText: 'No' })) return;
          await api('PATCH', `/api/customer-subscriptions/${id}`, { status: 'canceled' });
        } else if (btn.classList.contains('vcs-charge')) {
          if (!await VxUI.confirm({ title: 'Generar cobro', message: '¿Generar cobro ahora?', confirmText: 'Cobrar', cancelText: 'Cancelar' })) return;
          const r = await api('POST', `/api/customer-subscriptions/${id}/charge`, {});
          VxUI.toast(r.ok ? 'success' : 'error', r.ok ? 'Cobro registrado' : ('Falló: ' + (r.error || 'desconocido')));
        }
        await load(container, customerId);
      } catch (e) { VxUI.toast('error', 'Error: ' + e.message); }
    });
  }

  function mount(container, customerId) {
    if (!container) return;
    container.innerHTML = '<div style="padding:8px;color:#888">Cargando suscripciones…</div>';
    load(container, customerId);
  }

  window.VolvixCustomerSubs = { mount };

  // Auto-mount si existe el contenedor en la página.
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('customer-subscriptions-panel');
    if (el) {
      const cid = el.getAttribute('data-customer-id');
      if (cid) mount(el, cid);
    }
  });
})();
