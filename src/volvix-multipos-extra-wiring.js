/**
 * VOLVIX MULTIPOS EXTRA WIRING
 * Cableado avanzado para gestión multi-sucursal en multipos_suite_v3.html
 * Cubre: sucursales, transferencias, sync, permisos, reportes consolidados,
 * stock entre sucursales, cajas, empleados, configuración, dashboard, alertas, comparativas.
 *
 * NO modifica multipos_suite_v3.html — solo agrega comportamientos via window.*
 */
(function () {
  'use strict';

  const API = location.origin;
  const LS = {
    SESSION: 'volvixSession',
    TRANSFERS: 'volvix:transfers',
    EMPLOYEES: 'volvix:empleados',
    BRANCH_CFG: 'volvix:branch-config',
    PERMISSIONS: 'volvix:branch-permissions',
    CASHBOX: 'volvix:cashboxes',
    ALERTS_LOG: 'volvix:alerts-log',
    NOTIF_LOG: 'volvix:notif-log',
    REALTIME_TICK: 'volvix:realtime-tick'
  };

  let session = null;
  let branches = [];
  let allSalesData = {};
  let realtimeTimer = null;
  let lastRealtimeFetch = 0;

  console.log('[MULTIPOS-EXTRA] Activo — gestión multi-sucursal avanzada cargada');

  /* ───────────────────────── Sesión y API ───────────────────────── */
  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(LS.SESSION) || 'null'); }
    catch { session = null; }
  }

  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (session?.token) h['Authorization'] = 'Bearer ' + session.token;
    return h;
  }

  async function apiGet(path) {
    try {
      const r = await fetch(API + path, { headers: authHeaders(), credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      console.warn('[MULTIPOS-EXTRA] GET', path, e.message);
      return null;
    }
  }

  async function apiPost(path, body) {
    try {
      const r = await fetch(API + path, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify(body || {})
      });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      console.warn('[MULTIPOS-EXTRA] POST', path, e.message);
      return null;
    }
  }

  /* ───────────────────────── Storage helpers ───────────────────────── */
  function lsRead(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
    catch { return def; }
  }
  function lsWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('[MULTIPOS-EXTRA] LS write fail', e.message); return false; }
  }

  /* ───────────────────────── VolvixUI helpers ───────────────────────── */
  function uiAvailable() {
    return !!(window.VolvixUI && typeof window.VolvixUI.form === 'function');
  }

  async function uiForm(opts) {
    const { title, fields, submitText, onSubmit } = opts || {};
    if (uiAvailable()) {
      try {
        return await window.VolvixUI.form({
          title: title || 'Datos',
          fields: fields || [],
          submitText: submitText || 'Aceptar',
          onSubmit: onSubmit
        });
      } catch (e) { console.warn('[MULTIPOS-EXTRA] VolvixUI.form falló, fallback prompt:', e); }
    } else {
      console.warn('[MULTIPOS-EXTRA] VolvixUI no cargado, fallback prompt nativo');
    }
    const result = {};
    for (const f of (fields || [])) {
      const label = f.label || f.name;
      const def = f.default != null ? String(f.default) : '';
      const val = prompt(label + (def ? ' (' + def + ')' : '') + ':', def);
      if (val === null) return null;
      let v = (val.trim() || def);
      if (f.type === 'number') v = parseFloat(v) || 0;
      if (f.type === 'switch' || f.type === 'checkbox') v = /^(s|si|sí|y|yes|true|1)$/i.test(v);
      result[f.name] = v;
    }
    if (typeof onSubmit === 'function') { try { await onSubmit(result); } catch {} }
    return result;
  }

  async function uiConfirm(opts) {
    if (uiAvailable() && typeof window.VolvixUI.confirm === 'function') {
      try { return !!(await window.VolvixUI.confirm(opts)); }
      catch (e) { console.warn('[MULTIPOS-EXTRA] VolvixUI.confirm falló:', e); }
    }
    return confirm(((opts && opts.title) ? opts.title + '\n\n' : '') + ((opts && opts.message) || '¿Confirmar?'));
  }

  async function uiDestructiveConfirm(opts) {
    if (uiAvailable() && typeof window.VolvixUI.destructiveConfirm === 'function') {
      try { return !!(await window.VolvixUI.destructiveConfirm(opts)); }
      catch (e) { console.warn('[MULTIPOS-EXTRA] destructiveConfirm falló:', e); }
    } else if (uiAvailable() && typeof window.VolvixUI.confirm === 'function') {
      try { return !!(await window.VolvixUI.confirm(Object.assign({ danger: true }, opts || {}))); }
      catch {}
    }
    const expected = (opts && opts.requireText) || 'ELIMINAR';
    const txt = prompt(((opts && opts.message) ? opts.message + '\n\n' : '') + 'Escribe "' + expected + '" para confirmar:');
    return txt === expected;
  }

  function uiToast(msg, kind) {
    if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
      try { window.VolvixUI.toast({ type: kind === 'warn' ? 'warning' : (kind || 'info'), message: msg }); return; } catch {}
    }
    toast(msg, kind);
  }

  /* ───────────────────────── Modal centralizado ───────────────────────── */
  function showModal(title, bodyHtml, opts) {
    const id = 'mp-modal-' + Date.now();
    const html = `
      <div id="${id}" style="position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,Roboto,sans-serif;" onclick="if(event.target.id==='${id}')this.remove()">
        <div style="background:#0f172a;color:#f1f5f9;padding:24px 28px;border-radius:14px;max-width:${opts?.width||640}px;width:92%;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h2 style="margin:0;font-size:18px;letter-spacing:-0.02em">${title}</h2>
            <button onclick="document.getElementById('${id}').remove()" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1">×</button>
          </div>
          <hr style="border:none;border-top:1px solid #1e293b;margin:0 0 14px">
          <div style="font-size:13px;line-height:1.55">${bodyHtml}</div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    return id;
  }

  function toast(msg, kind) {
    const colors = { ok: '#16a34a', err: '#dc2626', warn: '#d97706', info: '#2563eb' };
    const bg = colors[kind || 'info'];
    const id = 'mp-toast-' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = `position:fixed;bottom:24px;right:24px;background:${bg};color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:99998;box-shadow:0 6px 18px rgba(0,0,0,0.3);`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  /* ───────────────────────── Carga de sucursales ───────────────────────── */
  async function loadAllBranches() {
    const data = await apiGet('/api/owner/tenants');
    if (Array.isArray(data)) branches = data;
    else if (data?.tenants) branches = data.tenants;
    else branches = [];
    return branches;
  }

  function pickBranchPrompt(label) {
    if (!branches.length) { toast('Sin sucursales cargadas', 'warn'); return -1; }
    const list = branches.map((b, i) => `${i + 1}. ${b.name || b.id}`).join('\n');
    const v = prompt(`${label}\n${list}`);
    const idx = parseInt(v, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= branches.length) return -1;
    return idx;
  }

  /* ───────────────────────── 1) COMPARAR SUCURSALES ───────────────────────── */
  window.multiposCompareBranches = async function () {
    if (!branches.length) await loadAllBranches();
    const a = pickBranchPrompt('Sucursal A:');
    if (a < 0) return;
    const b = pickBranchPrompt('Sucursal B:');
    if (b < 0 || a === b) { toast('Selección inválida', 'warn'); return; }

    const [ba, bb] = [branches[a], branches[b]];
    const html = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:1px solid #334155">
          <th style="text-align:left;padding:8px 4px;color:#94a3b8">Métrica</th>
          <th style="text-align:left;padding:8px 4px">${ba.name||ba.id}</th>
          <th style="text-align:left;padding:8px 4px">${bb.name||bb.id}</th>
        </tr></thead>
        <tbody>
          ${rowCmp('Plan', ba.plan, bb.plan)}
          ${rowCmp('Estado', ba.is_active ? 'Activa' : 'Inactiva', bb.is_active ? 'Activa' : 'Inactiva')}
          ${rowCmp('Productos', ba.products_count || '—', bb.products_count || '—')}
          ${rowCmp('Usuarios', ba.users_count || '—', bb.users_count || '—')}
          ${rowCmp('Creada', ba.created_at?.slice(0,10) || '—', bb.created_at?.slice(0,10) || '—')}
        </tbody>
      </table>
      <div style="margin-top:14px;padding:10px;background:#1e293b;border-radius:8px;font-size:12px;color:#cbd5e1">
        ID A: <code>${ba.id}</code><br>ID B: <code>${bb.id}</code>
      </div>
    `;
    showModal(`Comparar: ${ba.name} vs ${bb.name}`, html, { width: 600 });
  };
  function rowCmp(label, a, b) {
    return `<tr style="border-bottom:1px solid #1e293b"><td style="padding:7px 4px;color:#94a3b8">${label}</td><td style="padding:7px 4px">${a}</td><td style="padding:7px 4px">${b}</td></tr>`;
  }

  /* ───────────────────────── 2) TRANSFERIR STOCK ───────────────────────── */
  window.multiposTransferStock = async function () {
    if (!branches.length) await loadAllBranches();
    if (!branches.length) { toast('Sin sucursales cargadas', 'warn'); return; }

    const branchOptions = branches.map(b => ({ value: b.id, label: b.name || b.id }));

    const data = await uiForm({
      title: 'Transferencia de stock entre sucursales',
      submitText: 'Registrar transferencia',
      fields: [
        { name: 'from',    label: 'Sucursal ORIGEN',  type: 'select',   options: branchOptions, required: true },
        { name: 'to',      label: 'Sucursal DESTINO', type: 'select',   options: branchOptions, required: true },
        { name: 'product', label: 'Producto (código o nombre)', type: 'autocomplete', source: 'catalog', required: true },
        { name: 'qty',     label: 'Cantidad a transferir', type: 'number', step: 1, min: 1, required: true },
        { name: 'note',    label: 'Razón / nota (opcional)', type: 'textarea', rows: 2 }
      ]
    });
    if (!data) return;
    if (!data.from || !data.to) { toast('Selección inválida', 'warn'); return; }
    if (data.from === data.to) { toast('Origen y destino deben ser distintos', 'warn'); return; }
    const qty = parseInt(data.qty, 10);
    if (!qty || qty <= 0) { toast('Cantidad inválida', 'warn'); return; }
    if (!data.product) { toast('Producto requerido', 'warn'); return; }

    const fromBranch = branches.find(b => b.id === data.from) || {};
    const toBranch = branches.find(b => b.id === data.to) || {};

    const transfers = lsRead(LS.TRANSFERS, []);
    const transfer = {
      id: 'TRF-' + Date.now(),
      from: fromBranch.id,
      from_name: fromBranch.name,
      to: toBranch.id,
      to_name: toBranch.name,
      product: data.product,
      qty,
      note: data.note || '',
      status: 'pendiente',
      created_by: session?.user_id || 'unknown',
      date: Date.now()
    };
    transfers.push(transfer);
    lsWrite(LS.TRANSFERS, transfers);

    // Intentar registro remoto (best-effort)
    apiPost('/api/sync', { type: 'stock_transfer', payload: transfer }).catch(() => {});
    uiToast(`Transferencia ${transfer.id} registrada`, 'ok');
  };

  window.multiposListTransfers = function () {
    const transfers = lsRead(LS.TRANSFERS, []);
    if (!transfers.length) { toast('Sin transferencias registradas', 'info'); return; }
    const rows = transfers.slice(-30).reverse().map(t => `
      <tr style="border-bottom:1px solid #1e293b">
        <td style="padding:6px 4px;font-family:monospace;font-size:11px">${t.id}</td>
        <td style="padding:6px 4px">${t.from_name || t.from}</td>
        <td style="padding:6px 4px">→ ${t.to_name || t.to}</td>
        <td style="padding:6px 4px">${t.product}</td>
        <td style="padding:6px 4px;text-align:right">${t.qty}</td>
        <td style="padding:6px 4px"><span style="padding:2px 8px;background:${t.status==='completada'?'#16a34a':'#d97706'};border-radius:4px;font-size:10px">${t.status}</span></td>
      </tr>`).join('');
    showModal('Historial de transferencias', `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid #334155;color:#94a3b8">
        <th style="text-align:left;padding:8px 4px">ID</th><th style="text-align:left;padding:8px 4px">Origen</th>
        <th style="text-align:left;padding:8px 4px">Destino</th><th style="text-align:left;padding:8px 4px">Producto</th>
        <th style="text-align:right;padding:8px 4px">Qty</th><th style="text-align:left;padding:8px 4px">Estado</th>
      </tr></thead><tbody>${rows}</tbody></table>`, { width: 760 });
  };

  /* ───────────────────────── 3) DASHBOARD CONSOLIDADO ───────────────────────── */
  window.multiposDashboardConsolidated = async function () {
    const dashboard = await apiGet('/api/owner/dashboard');
    if (!dashboard) { toast('No se pudo cargar dashboard', 'err'); return; }
    const m = dashboard.metrics || dashboard || {};
    const fmt = n => (typeof n === 'number') ? n.toLocaleString('es-MX') : (n ?? '—');
    const fmtMoney = n => (typeof n === 'number') ? '$' + n.toFixed(2) : '—';

    const cells = [
      ['Sucursales activas', `${fmt(m.active_tenants)}/${fmt(m.total_tenants)}`, '#3b82f6'],
      ['Usuarios activos', `${fmt(m.active_users)}/${fmt(m.total_users)}`, '#8b5cf6'],
      ['Ventas totales', fmt(m.total_sales), '#10b981'],
      ['Ingresos', fmtMoney(m.total_revenue), '#10b981'],
      ['Productos', fmt(m.total_products), '#f59e0b'],
      ['Clientes', fmt(m.total_customers), '#f59e0b'],
      ['MRR', fmtMoney(m.mrr), '#06b6d4'],
      ['ARR', fmtMoney(m.arr), '#06b6d4']
    ];
    const grid = cells.map(([l, v, c]) => `
      <div style="background:#1e293b;padding:14px;border-radius:10px;border-left:3px solid ${c}">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">${l}</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">${v}</div>
      </div>`).join('');

    showModal('Dashboard Consolidado MultiPOS', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${grid}</div>
      <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="window.multiposSalesPerBranch()" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">Ventas por sucursal</button>
        <button onclick="window.multiposShowAlerts()" style="padding:8px 14px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">Ver alertas</button>
        <button onclick="window.multiposExportConsolidated()" style="padding:8px 14px;background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">Exportar JSON</button>
      </div>`, { width: 680 });
  };

  /* ───────────────────────── 4) EMPLEADOS POR SUCURSAL ───────────────────────── */
  window.multiposCreateEmployee = async function () {
    if (!branches.length) await loadAllBranches();
    if (!branches.length) { toast('Sin sucursales cargadas', 'warn'); return; }

    const branchOptions = branches.map(b => ({ value: b.id, label: b.name || b.id }));

    const data = await uiForm({
      title: 'Crear empleado',
      submitText: 'Crear empleado',
      fields: [
        { name: 'name',          label: 'Nombre del empleado', type: 'text', required: true, minLength: 2, maxLength: 80 },
        { name: 'email',         label: 'Email', type: 'email' },
        { name: 'rfc',           label: 'RFC', type: 'text', mask: 'AAAA######XXX', uppercase: true, pattern: '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$', placeholder: 'XAXX010101000' },
        { name: 'role',          label: 'Rol', type: 'radio', required: true, default: 'cajero', options: [
          { value: 'cajero',   label: 'Cajero' },
          { value: 'manager',  label: 'Manager' },
          { value: 'cocinero', label: 'Cocinero' },
          { value: 'mesero',   label: 'Mesero' }
        ]},
        { name: 'sueldo_diario', label: 'Sueldo diario', type: 'number', step: 0.01, min: 0, default: 0 },
        { name: 'branch',        label: 'Asignar a sucursal', type: 'select', options: branchOptions, required: true },
        { name: 'phone',         label: 'Teléfono (opcional)', type: 'tel' },
        { name: 'pin',           label: 'PIN de 4 dígitos', type: 'text', pattern: '^\\d{4}$', placeholder: '1234' }
      ]
    });
    if (!data || !data.name || !data.branch) return;

    const branch = branches.find(b => b.id === data.branch) || {};
    const empleados = lsRead(LS.EMPLOYEES, []);
    const emp = {
      id: 'EMP-' + Date.now(),
      name: data.name,
      email: data.email || '',
      rfc: (data.rfc || '').toUpperCase(),
      role: data.role || 'cajero',
      sueldo_diario: parseFloat(data.sueldo_diario) || 0,
      phone: data.phone || '',
      pin: data.pin || ('' + Math.floor(1000 + Math.random() * 9000)),
      branch: branch.id,
      branch_name: branch.name,
      active: true,
      created: Date.now()
    };
    empleados.push(emp);
    lsWrite(LS.EMPLOYEES, empleados);
    apiPost('/api/sync', { type: 'employee_create', payload: emp }).catch(() => {});
    uiToast(`Empleado ${emp.name} registrado en ${emp.branch_name}`, 'ok');
  };

  window.multiposListEmployees = async function () {
    if (!branches.length) await loadAllBranches();
    const empleados = lsRead(LS.EMPLOYEES, []);
    if (!empleados.length) { toast('Sin empleados registrados', 'info'); return; }

    const byBranch = {};
    empleados.forEach(e => {
      const k = e.branch_name || e.branch || 'Sin sucursal';
      (byBranch[k] = byBranch[k] || []).push(e);
    });

    const sections = Object.entries(byBranch).map(([branch, list]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:#3b82f6;margin-bottom:6px">${branch} (${list.length})</div>
        ${list.map(e => `
          <div style="padding:8px 10px;background:#1e293b;border-radius:6px;margin-bottom:5px;display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${(e.name||'?').slice(0,2).toUpperCase()}</div>
            <div style="flex:1">
              <div style="font-weight:600">${e.name}</div>
              <div style="font-size:11px;color:#94a3b8">${e.role} · ${e.email || 'sin email'}</div>
            </div>
            <button onclick="window.multiposToggleEmployee('${e.id}')" style="padding:4px 10px;background:${e.active?'#16a34a':'#475569'};border:none;color:#fff;border-radius:4px;font-size:11px;cursor:pointer">${e.active?'Activo':'Inactivo'}</button>
          </div>
        `).join('')}
      </div>`).join('');
    showModal(`Empleados (${empleados.length} total)`, sections, { width: 640 });
  };

  window.multiposToggleEmployee = function (empId) {
    const empleados = lsRead(LS.EMPLOYEES, []);
    const e = empleados.find(x => x.id === empId);
    if (!e) return;
    e.active = !e.active;
    lsWrite(LS.EMPLOYEES, empleados);
    toast(`${e.name}: ${e.active ? 'activado' : 'desactivado'}`, 'ok');
  };

  /* ───────────────────────── 5) VENTAS POR SUCURSAL ───────────────────────── */
  window.multiposSalesPerBranch = async function () {
    if (!branches.length) await loadAllBranches();
    if (!branches.length) { toast('Sin sucursales', 'warn'); return; }

    const rows = [];
    for (const branch of branches) {
      const sales = await apiGet(`/api/sales?tenant_id=${encodeURIComponent(branch.id)}`).catch(() => null);
      const list = Array.isArray(sales) ? sales : (sales?.sales || []);
      const total = list.reduce((s, r) => s + (Number(r.total) || 0), 0);
      allSalesData[branch.id] = { count: list.length, total };
      rows.push(`
        <tr style="border-bottom:1px solid #1e293b">
          <td style="padding:8px 6px"><strong>${branch.name}</strong><br><span style="font-size:10px;color:#94a3b8">${branch.plan || '—'}</span></td>
          <td style="padding:8px 6px;text-align:center">${branch.is_active ? '🟢' : '🔴'}</td>
          <td style="padding:8px 6px;text-align:right">${list.length}</td>
          <td style="padding:8px 6px;text-align:right;font-weight:700">$${total.toFixed(2)}</td>
        </tr>`);
    }
    showModal('Ventas por sucursal', `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid #334155;color:#94a3b8">
        <th style="text-align:left;padding:8px 6px">Sucursal</th>
        <th style="text-align:center;padding:8px 6px">Estado</th>
        <th style="text-align:right;padding:8px 6px">Tickets</th>
        <th style="text-align:right;padding:8px 6px">Total</th>
      </tr></thead><tbody>${rows.join('')}</tbody></table>`, { width: 620 });
  };

  /* ───────────────────────── 6) CONFIGURACIÓN POR SUCURSAL ───────────────────────── */
  window.multiposConfigBranch = async function () {
    const config = lsRead(LS.BRANCH_CFG, {});
    const tenantId = session?.tenant_id;
    if (!tenantId) { toast('Sin sesión activa', 'warn'); return; }
    const current = config[tenantId] || {};

    const data = await uiForm({
      title: 'Configuración de sucursal',
      submitText: 'Guardar configuración',
      fields: [
        { name: 'tax',             label: 'IVA aplicable', type: 'radio', required: true, default: String(current.tax ?? 16), options: [
          { value: '0',  label: '0% (exento)' },
          { value: '8',  label: '8% (frontera)' },
          { value: '16', label: '16% (general)' }
        ]},
        { name: 'currency',        label: 'Moneda', type: 'select', default: current.currency || 'MXN', options: [
          { value: 'MXN', label: 'MXN — Peso mexicano' },
          { value: 'USD', label: 'USD — Dólar' },
          { value: 'EUR', label: 'EUR — Euro' }
        ]},
        { name: 'printer',         label: 'Impresora', type: 'text', default: current.printer || 'Térmica USB' },
        { name: 'decimals',        label: 'Decimales en precio', type: 'number', step: 1, min: 0, max: 4, default: current.decimals ?? 2 },
        { name: 'allow_discounts', label: 'Permitir descuentos manuales', type: 'switch', default: !!current.allow_discounts }
      ]
    });
    if (!data) return;

    config[tenantId] = {
      tax: parseFloat(data.tax),
      currency: data.currency || 'MXN',
      printer: data.printer || 'Térmica USB',
      decimals: parseInt(data.decimals, 10),
      allow_discounts: !!data.allow_discounts,
      updated: Date.now()
    };
    lsWrite(LS.BRANCH_CFG, config);
    apiPost('/api/sync', { type: 'branch_config', tenant_id: tenantId, payload: config[tenantId] }).catch(() => {});
    uiToast('Configuración guardada y sincronizada', 'ok');
  };

  /* ───────────────────────── 7) PERMISOS POR SUCURSAL ───────────────────────── */
  window.multiposManagePermissions = async function () {
    if (!branches.length) await loadAllBranches();
    const branchIdx = pickBranchPrompt('Configurar permisos para sucursal:');
    if (branchIdx < 0) return;
    const branch = branches[branchIdx];

    const perms = lsRead(LS.PERMISSIONS, {});
    const current = perms[branch.id] || {
      cajero: { ventas: true, descuentos: false, devoluciones: false, reportes: false },
      manager: { ventas: true, descuentos: true, devoluciones: true, reportes: true },
      cocinero: { ventas: false, descuentos: false, devoluciones: false, reportes: false }
    };

    const list = Object.entries(current).map(([rol, p]) =>
      `${rol}: ${Object.entries(p).filter(([, v]) => v).map(([k]) => k).join(', ') || 'sin permisos'}`
    ).join('\n');

    const html = `
      <div style="font-size:12px;color:#cbd5e1;margin-bottom:12px">Sucursal: <strong>${branch.name}</strong></div>
      <pre style="background:#1e293b;padding:12px;border-radius:6px;font-size:11px;color:#e2e8f0;white-space:pre-wrap">${list}</pre>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        ${['cajero', 'manager', 'cocinero'].map(rol => `
          <button onclick="window.multiposEditPermission('${branch.id}','${rol}')" style="padding:8px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">Editar ${rol}</button>
        `).join('')}
      </div>`;
    showModal(`Permisos: ${branch.name}`, html);
  };

  window.multiposEditPermission = async function (branchId, rol) {
    const perms = lsRead(LS.PERMISSIONS, {});
    perms[branchId] = perms[branchId] || {};
    perms[branchId][rol] = perms[branchId][rol] || {};
    const flags = ['ventas', 'descuentos', 'devoluciones', 'reportes', 'inventario', 'config'];
    const current = flags.filter(f => !!perms[branchId][rol][f]);

    const data = await uiForm({
      title: `Permisos · ${rol}`,
      submitText: 'Guardar permisos',
      fields: [
        { name: 'scopes', label: 'Permisos otorgados', type: 'multiselect', default: current,
          options: flags.map(f => ({ value: f, label: f })) }
      ]
    });
    if (!data) return;
    const granted = Array.isArray(data.scopes) ? data.scopes : (data.scopes ? String(data.scopes).split(',') : []);
    flags.forEach(f => { perms[branchId][rol][f] = granted.includes(f); });
    lsWrite(LS.PERMISSIONS, perms);
    uiToast(`Permisos ${rol} actualizados`, 'ok');
  };

  /* ───────────────────────── 8) CAJAS MÚLTIPLES ───────────────────────── */
  window.multiposOpenCashbox = async function () {
    if (!branches.length) await loadAllBranches();
    if (!branches.length) { toast('Sin sucursales cargadas', 'warn'); return; }
    const branchOptions = branches.map(b => ({ value: b.id, label: b.name || b.id }));

    const data = await uiForm({
      title: 'Apertura de caja (multi-sucursal)',
      submitText: 'Abrir caja',
      fields: [
        { name: 'branch',         label: 'Sucursal', type: 'select', options: branchOptions, required: true },
        { name: 'monto_apertura', label: 'Monto de apertura (fondo inicial)', type: 'number', step: 0.01, min: 0, default: 1000, required: true },
        { name: 'cashier',        label: 'Cajero responsable', type: 'text', default: 'sin asignar' }
      ]
    });
    if (!data || !data.branch) return;

    const branch = branches.find(b => b.id === data.branch) || {};
    const initial = parseFloat(data.monto_apertura) || 0;
    const cashier = data.cashier || 'sin asignar';

    const cashboxes = lsRead(LS.CASHBOX, []);
    const cb = {
      id: 'CB-' + Date.now(),
      branch_id: branch.id,
      branch_name: branch.name,
      cashier, initial,
      opened: Date.now(),
      closed: null,
      sales_count: 0,
      total_sales: 0,
      status: 'abierta'
    };
    cashboxes.push(cb);
    lsWrite(LS.CASHBOX, cashboxes);
    uiToast(`Caja abierta en ${cb.branch_name} con $${initial.toFixed(2)}`, 'ok');
  };

  window.multiposCloseCashbox = async function () {
    const cashboxes = lsRead(LS.CASHBOX, []);
    const open = cashboxes.filter(c => c.status === 'abierta');
    if (!open.length) { toast('Sin cajas abiertas', 'info'); return; }

    const cbOptions = open.map(c => ({
      value: c.id,
      label: `${c.branch_name} · ${c.cashier} · ${new Date(c.opened).toLocaleTimeString()}`
    }));

    const data = await uiForm({
      title: 'Cerrar caja',
      submitText: 'Cerrar caja',
      fields: [
        { name: 'cashbox_id',  label: 'Caja a cerrar', type: 'select',   options: cbOptions, required: true },
        { name: 'monto_cierre',label: 'Efectivo contado al cierre', type: 'number', step: 0.01, min: 0, default: 0, required: true },
        { name: 'notas',       label: 'Notas (opcional)', type: 'textarea', rows: 2 }
      ]
    });
    if (!data || !data.cashbox_id) return;

    const cb = cashboxes.find(c => c.id === data.cashbox_id);
    if (!cb) return;
    const counted = parseFloat(data.monto_cierre) || 0;

    cb.closed = Date.now();
    cb.counted = counted;
    cb.expected = cb.initial + cb.total_sales;
    cb.diff = counted - cb.expected;
    cb.notas = data.notas || '';
    cb.status = 'cerrada';
    lsWrite(LS.CASHBOX, cashboxes);
    apiPost('/api/sync', { type: 'cashbox_close', payload: cb }).catch(() => {});
    uiToast(`Caja cerrada. Diferencia: $${cb.diff.toFixed(2)}`, cb.diff === 0 ? 'ok' : 'warn');
  };

  window.multiposListCashboxes = function () {
    const cashboxes = lsRead(LS.CASHBOX, []).slice(-20).reverse();
    if (!cashboxes.length) { toast('Sin cajas registradas', 'info'); return; }
    const rows = cashboxes.map(c => `
      <tr style="border-bottom:1px solid #1e293b">
        <td style="padding:7px 4px;font-family:monospace;font-size:11px">${c.id}</td>
        <td style="padding:7px 4px">${c.branch_name}</td>
        <td style="padding:7px 4px">${c.cashier}</td>
        <td style="padding:7px 4px;text-align:right">$${c.initial}</td>
        <td style="padding:7px 4px"><span style="padding:2px 8px;background:${c.status==='abierta'?'#16a34a':'#475569'};border-radius:4px;font-size:10px">${c.status}</span></td>
      </tr>`).join('');
    showModal('Cajas múltiples', `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid #334155;color:#94a3b8">
        <th style="text-align:left;padding:8px 4px">ID</th><th style="text-align:left;padding:8px 4px">Sucursal</th>
        <th style="text-align:left;padding:8px 4px">Cajero</th><th style="text-align:right;padding:8px 4px">Fondo</th>
        <th style="text-align:left;padding:8px 4px">Estado</th>
      </tr></thead><tbody>${rows}</tbody></table>`, { width: 720 });
  };

  /* ───────────────────────── 9) ALERTAS Y NOTIFICACIONES ───────────────────────── */
  window.multiposShowAlerts = async function () {
    const alerts = [];
    // Stock bajo
    const lowStock = await apiGet('/api/owner/low-stock').catch(() => null);
    if (Array.isArray(lowStock) && lowStock.length) {
      lowStock.slice(0, 10).forEach(p =>
        alerts.push({ kind: 'stock', icon: '📦', msg: `${p.name}: ${p.stock} unidades`, sev: 'warn' })
      );
    }
    // Sucursales inactivas
    if (!branches.length) await loadAllBranches();
    branches.filter(b => !b.is_active).forEach(b =>
      alerts.push({ kind: 'branch', icon: '🔴', msg: `Sucursal inactiva: ${b.name}`, sev: 'err' })
    );
    // Cajas abiertas hace > 12h
    const cashboxes = lsRead(LS.CASHBOX, []);
    const stale = cashboxes.filter(c => c.status === 'abierta' && (Date.now() - c.opened) > 12 * 3600 * 1000);
    stale.forEach(c =>
      alerts.push({ kind: 'cashbox', icon: '⏰', msg: `Caja abierta >12h en ${c.branch_name}`, sev: 'warn' })
    );

    if (!alerts.length) {
      showModal('Alertas', '<div style="text-align:center;padding:24px;color:#16a34a;font-size:15px">✅ Sin alertas activas</div>');
      return;
    }
    lsWrite(LS.ALERTS_LOG, alerts.map(a => ({ ...a, ts: Date.now() })));
    const html = alerts.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#1e293b;border-radius:8px;margin-bottom:6px;border-left:3px solid ${a.sev==='err'?'#dc2626':'#d97706'}">
        <div style="font-size:20px">${a.icon}</div>
        <div style="flex:1;font-size:13px">${a.msg}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase">${a.kind}</div>
      </div>`).join('');
    showModal(`Alertas (${alerts.length})`, html);
  };

  window.multiposNotify = function (msg, kind) {
    const log = lsRead(LS.NOTIF_LOG, []);
    log.push({ msg, kind: kind || 'info', ts: Date.now() });
    lsWrite(LS.NOTIF_LOG, log.slice(-100));
    toast(msg, kind);
  };

  /* ───────────────────────── 10) BACKUP / EXPORT ───────────────────────── */
  window.multiposBackupBranch = async function () {
    const tid = session?.tenant_id;
    if (!tid) { toast('Sin tenant en sesión', 'warn'); return; }
    toast('Generando backup…', 'info');
    const data = {
      branch: tid,
      products: await apiGet('/api/products?tenant_id=' + tid),
      customers: await apiGet('/api/customers?tenant_id=' + tid),
      sales: await apiGet('/api/sales?tenant_id=' + tid),
      inventory: await apiGet('/api/inventory?tenant_id=' + tid),
      employees: lsRead(LS.EMPLOYEES, []).filter(e => e.branch === tid),
      transfers: lsRead(LS.TRANSFERS, []).filter(t => t.from === tid || t.to === tid),
      config: lsRead(LS.BRANCH_CFG, {})[tid] || null,
      timestamp: Date.now(),
      version: 'v3'
    };
    downloadJson(data, `volvix-backup-${tid}-${Date.now()}.json`);
    toast('Backup descargado', 'ok');
  };

  window.multiposExportConsolidated = async function () {
    if (!branches.length) await loadAllBranches();
    const data = {
      branches,
      sales_summary: allSalesData,
      transfers: lsRead(LS.TRANSFERS, []),
      employees: lsRead(LS.EMPLOYEES, []),
      cashboxes: lsRead(LS.CASHBOX, []),
      configs: lsRead(LS.BRANCH_CFG, {}),
      permissions: lsRead(LS.PERMISSIONS, {}),
      generated_at: new Date().toISOString()
    };
    downloadJson(data, `volvix-multipos-consolidated-${Date.now()}.json`);
    toast('Reporte consolidado exportado', 'ok');
  };

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ───────────────────────── 11) SYNC EN TIEMPO REAL ───────────────────────── */
  window.multiposStartRealtime = function (intervalMs) {
    const ms = intervalMs || 30000;
    if (realtimeTimer) clearInterval(realtimeTimer);
    realtimeTimer = setInterval(realtimeTick, ms);
    toast(`Sync tiempo real ON (cada ${ms / 1000}s)`, 'ok');
    realtimeTick();
  };

  window.multiposStopRealtime = function () {
    if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer = null; }
    toast('Sync tiempo real OFF', 'info');
  };

  async function realtimeTick() {
    lastRealtimeFetch = Date.now();
    const dash = await apiGet('/api/owner/dashboard').catch(() => null);
    if (dash) {
      lsWrite(LS.REALTIME_TICK, { ts: lastRealtimeFetch, dashboard: dash });
      // Actualiza badges/numbers en pantalla si existen
      document.querySelectorAll('[data-mp-metric]').forEach(el => {
        const k = el.getAttribute('data-mp-metric');
        const v = (dash.metrics || dash || {})[k];
        if (v != null) el.textContent = v;
      });
    }
  }

  /* ───────────────────────── 12) STOCK ENTRE SUCURSALES ───────────────────────── */
  window.multiposStockOverview = async function () {
    if (!branches.length) await loadAllBranches();
    const rows = [];
    for (const branch of branches) {
      const inv = await apiGet(`/api/inventory?tenant_id=${encodeURIComponent(branch.id)}`).catch(() => null);
      const items = Array.isArray(inv) ? inv : (inv?.items || []);
      const total = items.reduce((s, i) => s + (Number(i.stock) || 0), 0);
      const low = items.filter(i => (Number(i.stock) || 0) < (Number(i.min_stock) || 5)).length;
      rows.push(`
        <tr style="border-bottom:1px solid #1e293b">
          <td style="padding:8px 6px"><strong>${branch.name}</strong></td>
          <td style="padding:8px 6px;text-align:right">${items.length}</td>
          <td style="padding:8px 6px;text-align:right">${total}</td>
          <td style="padding:8px 6px;text-align:right;color:${low>0?'#dc2626':'#16a34a'}">${low}</td>
        </tr>`);
    }
    showModal('Stock por sucursal', `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid #334155;color:#94a3b8">
        <th style="text-align:left;padding:8px 6px">Sucursal</th>
        <th style="text-align:right;padding:8px 6px">SKUs</th>
        <th style="text-align:right;padding:8px 6px">Unidades</th>
        <th style="text-align:right;padding:8px 6px">Stock bajo</th>
      </tr></thead><tbody>${rows.join('')}</tbody></table>`, { width: 600 });
  };

  /* ───────────────────────── 13) AGREGAR SUCURSAL ───────────────────────── */
  window.multiposAddBranch = async function () {
    const data = await uiForm({
      title: 'Crear sucursal',
      submitText: 'Crear sucursal',
      fields: [
        { name: 'name',    label: 'Nombre de la sucursal', type: 'text', required: true, minLength: 2, maxLength: 80 },
        { name: 'address', label: 'Dirección', type: 'textarea', rows: 2 },
        { name: 'type',    label: 'Tipo', type: 'radio', required: true, default: 'branch', options: [
          { value: 'warehouse', label: 'Almacén (warehouse)' },
          { value: 'branch',    label: 'Sucursal (branch)' },
          { value: 'transit',   label: 'Tránsito (transit)' }
        ]},
        { name: 'phone',   label: 'Teléfono', type: 'tel' },
        { name: 'plan',    label: 'Plan', type: 'radio', default: 'basico', options: [
          { value: 'basico',     label: 'Básico' },
          { value: 'pro',        label: 'Pro' },
          { value: 'enterprise', label: 'Enterprise' }
        ]}
      ]
    });
    if (!data || !data.name) return;

    const payload = {
      name: data.name,
      address: data.address || '',
      phone: data.phone || '',
      plan: data.plan || 'basico',
      type: data.type || 'branch',
      is_active: true
    };
    const res = await apiPost('/api/owner/tenants', payload);
    if (res?.ok || res?.id) {
      uiToast(`Sucursal "${payload.name}" creada`, 'ok');
      await loadAllBranches();
    } else {
      // fallback local
      branches.push({ id: 'LOCAL-' + Date.now(), ...payload, created_at: new Date().toISOString() });
      uiToast(`Sucursal local agregada (sin sync)`, 'warn');
    }
  };

  /* ───────────────────────── 14) WIRING DE BOTONES ───────────────────────── */
  function wireButtons() {
    document.querySelectorAll('[onclick],button,div.setting-row,div.tabbar-item').forEach(btn => {
      if (btn.dataset.extraWired) return;
      const text = (btn.textContent || '').trim().toLowerCase();
      const onclick = btn.getAttribute('onclick') || '';
      // No tocar funciones nativas del sample (showToast, goScreen) salvo match específico
      if (onclick.includes('multipos')) { btn.dataset.extraWired = 'true'; return; }

      let handler = null;
      if (/comparar|compare/.test(text)) handler = window.multiposCompareBranches;
      else if (/transferir|transferenc/.test(text)) handler = window.multiposTransferStock;
      else if (/historial.*transfer|listar.*transfer/.test(text)) handler = window.multiposListTransfers;
      else if (/dashboard.*consolid|consolid.*dashboard/.test(text)) handler = window.multiposDashboardConsolidated;
      else if (/nuevo empleado|agregar empleado|crear empleado/.test(text)) handler = window.multiposCreateEmployee;
      else if (/listar empleado|empleados$|ver empleado/.test(text)) handler = window.multiposListEmployees;
      else if (/ventas.*sucursal|ventas por suc/.test(text)) handler = window.multiposSalesPerBranch;
      else if (/config.*sucursal|configurar sucursal/.test(text)) handler = window.multiposConfigBranch;
      else if (/permisos|roles/.test(text) && /sucursal|tenant/.test(text)) handler = window.multiposManagePermissions;
      else if (/abrir caja/.test(text)) handler = window.multiposOpenCashbox;
      else if (/cerrar caja|corte de caja/.test(text)) handler = window.multiposCloseCashbox;
      else if (/listar cajas|cajas múltiples|todas las cajas/.test(text)) handler = window.multiposListCashboxes;
      else if (/alertas|alert/.test(text) && !text.includes('alerta 10') && !text.includes('alerta 20')) handler = window.multiposShowAlerts;
      else if (/backup|respaldo/.test(text)) handler = window.multiposBackupBranch;
      else if (/exportar.*consolid|export.*todo/.test(text)) handler = window.multiposExportConsolidated;
      else if (/sync.*tiempo|tiempo real|realtime/.test(text)) handler = window.multiposStartRealtime;
      else if (/stock.*sucursal|inventario.*global/.test(text)) handler = window.multiposStockOverview;
      else if (/agregar sucursal|nueva sucursal/.test(text)) handler = window.multiposAddBranch;

      if (handler) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          try { handler(); } catch (err) { console.error('[MULTIPOS-EXTRA]', err); toast('Error: ' + err.message, 'err'); }
        }, true);
        btn.dataset.extraWired = 'true';
      }
    });
  }

  /* ───────────────────────── Panel flotante ───────────────────────── */
  function injectFloatingPanel() {
    if (document.getElementById('mp-extra-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'mp-extra-panel';
    panel.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:99000;display:flex;flex-direction:column;gap:6px;font-family:-apple-system,sans-serif';
    panel.innerHTML = `
      <button onclick="window.multiposDashboardConsolidated()" title="Dashboard consolidado" style="padding:8px 12px;background:#0f172a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;box-shadow:0 4px 12px rgba(0,0,0,0.25)">📊 Dashboard</button>
      <button onclick="window.multiposShowAlerts()" title="Alertas" style="padding:8px 12px;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;box-shadow:0 4px 12px rgba(0,0,0,0.25)">⚠ Alertas</button>
      <button onclick="window.multiposCompareBranches()" title="Comparar" style="padding:8px 12px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;box-shadow:0 4px 12px rgba(0,0,0,0.25)">🔀 Comparar</button>
      <button onclick="window.multiposTransferStock()" title="Transferir stock" style="padding:8px 12px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;box-shadow:0 4px 12px rgba(0,0,0,0.25)">📦 Transfer</button>
    `;
    document.body.appendChild(panel);
  }

  /* ───────────────────────── INIT ───────────────────────── */
  async function init() {
    loadSession();
    await loadAllBranches().catch(() => {});
    wireButtons();
    setInterval(wireButtons, 2500);
    injectFloatingPanel();
    // Inicia sync en tiempo real solo si hay sesión owner
    if (session?.role === 'owner' || session?.is_owner) {
      window.multiposStartRealtime(45000);
    }
    console.log(`[MULTIPOS-EXTRA] init OK · ${branches.length} sucursales`);
  }

  // API pública
  window.MultiposExtra = {
    compare: window.multiposCompareBranches,
    transfer: window.multiposTransferStock,
    listTransfers: window.multiposListTransfers,
    dashboard: window.multiposDashboardConsolidated,
    createEmployee: window.multiposCreateEmployee,
    listEmployees: window.multiposListEmployees,
    salesPerBranch: window.multiposSalesPerBranch,
    config: window.multiposConfigBranch,
    permissions: window.multiposManagePermissions,
    openCashbox: window.multiposOpenCashbox,
    closeCashbox: window.multiposCloseCashbox,
    listCashboxes: window.multiposListCashboxes,
    alerts: window.multiposShowAlerts,
    notify: window.multiposNotify,
    backup: window.multiposBackupBranch,
    exportAll: window.multiposExportConsolidated,
    startRealtime: window.multiposStartRealtime,
    stopRealtime: window.multiposStopRealtime,
    stockOverview: window.multiposStockOverview,
    addBranch: window.multiposAddBranch,
    reload: loadAllBranches,
    getBranches: () => branches,
    getSession: () => session
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
