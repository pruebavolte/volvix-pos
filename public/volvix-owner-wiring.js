/* ============================================================
   VOLVIX · OWNER PANEL WIRING (R15)
   Conecta TODOS los botones del Owner Panel a Supabase a través
   del API real, usando Volvix.auth.fetch (JWT). Sin localStorage
   para datos de negocio: tenants, users, plans, métricas, etc.
============================================================ */
(function () {
  'use strict';

  const API = location.origin;
  const cachedData = {};
  let dashboardData = null;
  let metricsTimer = null;
  let session = null;

  console.log('%c[OWNER-WIRING]', 'background:#3B82F6;color:#fff;padding:2px 6px;border-radius:3px',
    'R15 · Cableado del Owner Panel contra API real');

  // =========================================================
  // FETCH HELPER (Volvix.auth.fetch con fallback)
  // =========================================================
  function authFetch(path, init = {}) {
    if (window.Volvix && window.Volvix.auth && typeof window.Volvix.auth.fetch === 'function') {
      return window.Volvix.auth.fetch(API + path, init);
    }
    return fetch(API + path, init);
  }

  // R5b GAP-O1: silently refresh JWT on 401 PERMISSIONS_CHANGED, then retry once.
  async function r5bRefreshToken() {
    try {
      let token = null;
      try { token = localStorage.getItem('volvix_token') || localStorage.getItem('volvix.jwt'); } catch (_) {}
      if (!token) return false;
      const r = await fetch(API + '/api/refresh', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
        credentials: 'same-origin'
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.token) {
        try { localStorage.setItem('volvix_token', d.token); } catch (_) {}
        try { localStorage.setItem('volvix.jwt', d.token); } catch (_) {}
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function r5bHandleResponse(res, retryFn) {
    let data = null;
    try { data = await res.clone().json(); } catch (_) {}
    if (res.status === 401 && data && data.error_code === 'PERMISSIONS_CHANGED') {
      const refreshed = await r5bRefreshToken();
      if (refreshed && typeof retryFn === 'function') {
        try { toast('Permisos actualizados', 'ok'); } catch (_) {}
        return { retry: true };
      }
      try { toast('Tus permisos cambiaron — vuelve a iniciar sesión', 'warn'); } catch (_) {}
      setTimeout(() => { try { location.href = '/'; } catch (_) {} }, 1500);
    }
    if (res.status === 402 && data && data.error_code === 'PLAN_INSUFFICIENT') {
      try { toast('Esta función requiere plan ' + (data.required_plan || 'superior'), 'warn'); } catch (_) {}
      if (data.upgrade_url) {
        if (confirm('Esta función requiere plan ' + (data.required_plan || 'superior') + '. ¿Quieres actualizar?')) {
          try { location.href = data.upgrade_url; } catch (_) {}
        }
      }
    }
    return { retry: false, data };
  }

  async function apiGet(path) {
    const cacheKey = 'GET:' + path;
    try {
      let res = await authFetch(path);
      if (!res.ok) {
        const handled = await r5bHandleResponse(res, () => authFetch(path));
        if (handled.retry) res = await authFetch(path);
        if (!res.ok) throw new Error('HTTP ' + res.status);
      }
      const data = await res.json();
      cachedData[cacheKey] = data;
      return data;
    } catch (err) {
      console.warn('[API GET]', path, 'fallo:', err.message);
      return cachedData[cacheKey] || null;
    }
  }

  async function apiPost(path, body) {
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    };
    let res = await authFetch(path, init);
    if (!res.ok) {
      const handled = await r5bHandleResponse(res, () => authFetch(path, init));
      if (handled.retry) res = await authFetch(path, init);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error('HTTP ' + res.status + ' ' + text);
        err.status = res.status; err.data = handled.data;
        throw err;
      }
    }
    return res.json();
  }

  async function apiPatch(path, body) {
    const init = {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    };
    let res = await authFetch(path, init);
    if (!res.ok) {
      const handled = await r5bHandleResponse(res, () => authFetch(path, init));
      if (handled.retry) res = await authFetch(path, init);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error('HTTP ' + res.status + ' ' + text);
        err.status = res.status; err.data = handled.data;
        throw err;
      }
    }
    return res.json();
  }

  async function apiDelete(path) {
    let res = await authFetch(path, { method: 'DELETE' });
    if (!res.ok) {
      const handled = await r5bHandleResponse(res, () => authFetch(path, { method: 'DELETE' }));
      if (handled.retry) res = await authFetch(path, { method: 'DELETE' });
    }
    return res.json();
  }

  // =========================================================
  // SESSION (solo para identidad cosmética)
  // =========================================================
  function loadSession() {
    try { session = JSON.parse(localStorage.getItem('volvixSession') || 'null'); }
    catch { session = null; }
    return session;
  }

  // =========================================================
  // TOAST HELPER
  // =========================================================
  function toast(msg, kind) {
    if (window.VolvixUI && typeof window.VolvixUI.toast === 'function') {
      try {
        window.VolvixUI.toast({
          type: kind === 'err' ? 'error' : (kind === 'warn' ? 'warning' : 'success'),
          message: msg
        });
        return;
      } catch {}
    }
    if (typeof window.showToast === 'function') { try { window.showToast(msg); return; } catch {} }
    if (typeof window.showCtrlToast === 'function') { try { window.showCtrlToast(msg); return; } catch {} }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.15);background:' + (kind === 'err' ? '#DC2626' : '#16A34A');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // VolvixUI bridge with native fallback
  async function vuiForm(opts, nativeFallback) {
    if (window.VolvixUI && typeof window.VolvixUI.form === 'function') {
      try { return await window.VolvixUI.form(opts); } catch { return null; }
    }
    return nativeFallback ? nativeFallback() : null;
  }
  async function vuiConfirm(opts, nativeFallback) {
    if (window.VolvixUI && typeof window.VolvixUI.confirm === 'function') {
      try { return await window.VolvixUI.confirm(opts); } catch { return false; }
    }
    return nativeFallback ? nativeFallback() : confirm(opts.message || '¿Confirmar?');
  }
  async function vuiDestructiveConfirm(opts, nativeFallback) {
    if (window.VolvixUI && typeof window.VolvixUI.destructiveConfirm === 'function') {
      try { return await window.VolvixUI.destructiveConfirm(opts); } catch { return false; }
    }
    return nativeFallback ? nativeFallback() : confirm(opts.message || '¿Confirmar?');
  }

  // =========================================================
  // CARGAR DATOS REALES (GET poblando tablas)
  // =========================================================
  function updateMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function loadDashboard() {
    const data = await apiGet('/api/owner/dashboard');
    if (!data || !data.metrics) return null;
    dashboardData = data;
    const m = data.metrics;

    updateMetric('total-users', m.active_users);
    updateMetric('total-tenants', m.active_tenants);
    updateMetric('total-sales', m.total_sales);
    if (typeof m.total_revenue === 'number') updateMetric('total-revenue', '$' + m.total_revenue.toFixed(2));
    if (typeof m.mrr === 'number') updateMetric('mrr', '$' + m.mrr.toLocaleString());
    if (typeof m.arr === 'number') updateMetric('arr', '$' + m.arr.toLocaleString());
    updateMetric('low-stock', m.low_stock_count);

    document.querySelectorAll('[data-kpi]').forEach(el => {
      const kpi = el.dataset.kpi;
      if (m[kpi] !== undefined) el.textContent = typeof m[kpi] === 'number' ? m[kpi].toLocaleString() : m[kpi];
    });

    document.querySelectorAll('[data-live-metric]').forEach(el => {
      const k = el.dataset.liveMetric;
      if (m[k] !== undefined) el.textContent = typeof m[k] === 'number' ? m[k].toLocaleString() : m[k];
    });

    return data;
  }

  async function loadLiveMetrics() {
    const data = await apiGet('/api/metrics');
    if (!data) return null;
    document.querySelectorAll('[data-live-metric]').forEach(el => {
      const k = el.dataset.liveMetric;
      if (data[k] !== undefined) el.textContent = typeof data[k] === 'number' ? data[k].toLocaleString() : data[k];
    });
    const stamp = document.getElementById('live-metrics-updated');
    if (stamp) stamp.textContent = 'Actualizado: ' + new Date().toLocaleTimeString();
    return data;
  }

  async function loadTenants(filters) {
    const qs = filters ? ('?' + new URLSearchParams(filters).toString()) : '';
    const tenants = await apiGet('/api/owner/tenants' + qs);
    if (!tenants) return [];
    const list = Array.isArray(tenants) ? tenants : (tenants.tenants || []);
    const tbody = document.querySelector('#tenants-table tbody, [data-table="tenants"] tbody');
    if (tbody) {
      tbody.innerHTML = list.map(t => `
        <tr data-tenant-id="${t.id || ''}">
          <td>${(t.id || '').substring(0, 8)}</td>
          <td><strong>${t.name || ''}</strong></td>
          <td><span class="chip">${t.plan || ''}</span></td>
          <td>${t.is_active ? '🟢 Activo' : '🔴 Suspendido'}</td>
          <td>${t.created_at ? new Date(t.created_at).toLocaleDateString() : '-'}</td>
          <td>
            <button class="btn sm" onclick="ownerEditTenant('${t.id}')" title="Editar">✏️</button>
            <button class="btn sm" onclick="ownerToggleTenant('${t.id}', ${!t.is_active})" title="${t.is_active ? 'Pausar' : 'Activar'}">${t.is_active ? '⏸️' : '▶️'}</button>
            <button class="btn sm" onclick="ownerChangePlan('${t.id}')" title="Plan">💳</button>
          </td>
        </tr>
      `).join('');
    }
    return list;
  }

  async function loadUsers(filters) {
    const qs = filters ? ('?' + new URLSearchParams(filters).toString()) : '';
    const users = await apiGet('/api/owner/users' + qs);
    if (!users) return [];
    const list = Array.isArray(users) ? users : (users.users || []);
    const tbody = document.querySelector('#users-table tbody, [data-table="users"] tbody');
    if (tbody) {
      tbody.innerHTML = list.map(u => `
        <tr data-user-id="${u.id || ''}">
          <td>${u.email || ''}</td>
          <td><span class="chip">${u.role || ''}</span></td>
          <td>${u.full_name || '-'}</td>
          <td>${u.plan || 'free'}</td>
          <td>${u.is_active ? '🟢' : '🔴'}</td>
          <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Nunca'}</td>
          <td>
            <button class="btn sm" onclick="ownerEditUserPermissions('${u.id}')" title="Permisos">🔐</button>
            <button class="btn sm" onclick="ownerToggleUser('${u.id}', ${!u.is_active})" title="${u.is_active ? 'Suspender' : 'Activar'}">${u.is_active ? '⏸️' : '▶️'}</button>
          </td>
        </tr>
      `).join('');
    }
    return list;
  }

  async function loadSalesReport()    { return (await apiGet('/api/owner/sales-report')) || []; }
  async function loadLicenses()       { return (await apiGet('/api/owner/licenses'))     || []; }
  async function loadLowStock()       { return (await apiGet('/api/owner/low-stock'))    || []; }

  // =========================================================
  // ACCIONES (window.*) — TODAS llaman al API
  // =========================================================
  window.ownerCreateTenant = async function () {
    const data = await vuiForm({
      title: 'Crear tenant',
      submitLabel: 'Crear tenant',
      fields: [
        { name: 'name', label: 'Nombre del tenant', type: 'text', required: true, minLength: 2, maxLength: 80 },
        { name: 'plan', label: 'Plan', type: 'radio', required: true, default: 'free',
          options: [
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
            { value: 'enterprise', label: 'Enterprise' }
          ]
        },
        { name: 'admin_email', label: 'Email del admin', type: 'email', required: true },
        { name: 'rfc', label: 'RFC', type: 'text', mask: 'rfc', required: false,
          pattern: '^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$' }
      ]
    }, () => {
      const name = prompt('Nombre del nuevo tenant:'); if (!name) return null;
      const plan = prompt('Plan (free/pro/enterprise):', 'free') || 'free';
      const admin_email = prompt('Email del admin:');
      const rfc = prompt('RFC (opcional):');
      return { name, plan, admin_email, rfc };
    });
    if (!data || !data.name) return;
    try {
      await apiPost('/api/owner/tenants', {
        name: data.name, plan: data.plan || 'free',
        admin_email: data.admin_email,
        rfc: data.rfc || null,
        owner_user_id: session?.user_id
      });
      toast('Tenant creado: ' + data.name);
      loadTenants();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerEditTenant = async function (tenantId) {
    const data = await vuiForm({
      title: 'Configuración general del tenant',
      submitLabel: 'Guardar cambios',
      fields: [
        { name: 'name', label: 'Nombre', type: 'text', required: true, minLength: 2 },
        { name: 'rfc', label: 'RFC', type: 'text', mask: 'rfc',
          pattern: '^[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}$' },
        { name: 'address', label: 'Dirección', type: 'textarea', rows: 3 },
        { name: 'timezone', label: 'Zona horaria', type: 'select', default: 'America/Mexico_City',
          options: [
            { value: 'America/Mexico_City', label: 'México (CDMX)' },
            { value: 'America/Tijuana', label: 'Tijuana' },
            { value: 'America/Cancun', label: 'Cancún' },
            { value: 'America/Monterrey', label: 'Monterrey' },
            { value: 'America/Bogota', label: 'Bogotá' },
            { value: 'America/Lima', label: 'Lima' },
            { value: 'America/Buenos_Aires', label: 'Buenos Aires' },
            { value: 'UTC', label: 'UTC' }
          ]
        },
        { name: 'currency', label: 'Moneda', type: 'select', default: 'MXN',
          options: [
            { value: 'MXN', label: 'MXN — Peso mexicano' },
            { value: 'USD', label: 'USD — Dólar' },
            { value: 'EUR', label: 'EUR — Euro' },
            { value: 'COP', label: 'COP — Peso colombiano' },
            { value: 'PEN', label: 'PEN — Sol peruano' },
            { value: 'ARS', label: 'ARS — Peso argentino' }
          ]
        }
      ]
    }, () => {
      const name = prompt('Nuevo nombre del tenant:'); return name ? { name } : null;
    });
    if (!data || !data.name) return;
    try {
      const payload = { name: data.name };
      if (data.rfc) payload.rfc = data.rfc;
      if (data.address) payload.address = data.address;
      if (data.timezone) payload.timezone = data.timezone;
      if (data.currency) payload.currency = data.currency;
      await apiPatch(`/api/owner/tenants/${tenantId}`, payload);
      toast('Tenant actualizado');
      loadTenants();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerToggleTenant = async function (tenantId, makeActive) {
    if (makeActive) {
      const ok = await vuiConfirm({
        title: 'Activar tenant',
        message: '¿Reactivar este tenant?',
        confirmLabel: 'Activar'
      }, () => confirm('¿Activar tenant?'));
      if (!ok) return;
      try {
        await apiPatch(`/api/owner/tenants/${tenantId}`, { is_active: true });
        toast('Activado');
        loadTenants();
      } catch (e) { toast('Error: ' + e.message, 'err'); }
      return;
    }

    // Pausar — destructiveConfirm + razón obligatoria
    const data = await vuiForm({
      title: 'Pausar tenant',
      submitLabel: 'Pausar tenant',
      destructive: true,
      fields: [
        { name: 'reason', label: 'Razón de pausa', type: 'textarea', required: true, minLength: 10, rows: 4,
          placeholder: 'Describe la razón por la que se pausa el tenant…' }
      ]
    }, () => {
      const reason = prompt('Razón de pausa (mínimo 10 caracteres):');
      return reason ? { reason } : null;
    });
    if (!data || !data.reason) return;
    try {
      await apiPatch(`/api/owner/tenants/${tenantId}`, {
        is_active: false,
        pause_reason: data.reason
      });
      toast('Pausado');
      loadTenants();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerPauseTenant = function (tenantId) { return window.ownerToggleTenant(tenantId, false); };

  window.ownerChangePlan = async function (tenantId) {
    // Try to read current plan + price hint from DOM/cache
    const cur = (document.querySelector(`tr[data-tenant-id="${tenantId}"] [data-plan]`)?.dataset.plan) || 'free';
    const planPrices = { free: 0, pro: 49, enterprise: 199 };

    const data = await vuiForm({
      title: 'Cambiar plan',
      submitLabel: 'Aplicar cambio',
      fields: [
        { name: 'plan', label: 'Nuevo plan', type: 'radio', required: true, default: cur,
          options: [
            { value: 'free', label: 'Free — $0/mes' },
            { value: 'pro', label: 'Pro — $49/mes' },
            { value: 'enterprise', label: 'Enterprise — $199/mes' }
          ]
        }
      ],
      onChange: function (values, ctx) {
        // Preview prorateo client-side
        try {
          const today = new Date();
          const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
          const remaining = daysInMonth - today.getDate();
          const oldP = planPrices[cur] || 0;
          const newP = planPrices[values.plan] || 0;
          const delta = ((newP - oldP) * remaining / daysInMonth);
          const sign = delta >= 0 ? '+' : '−';
          const txt = `Prorateo (${remaining}/${daysInMonth} días restantes): ${sign}$${Math.abs(delta).toFixed(2)}`;
          if (ctx && typeof ctx.setPreview === 'function') ctx.setPreview(txt);
        } catch {}
      }
    }, () => {
      const plan = prompt('Nuevo plan (free/pro/enterprise):'); return plan ? { plan } : null;
    });
    if (!data || !data.plan) return;
    try {
      await apiPatch(`/api/owner/tenants/${tenantId}`, { plan: data.plan });
      toast('Plan actualizado a ' + data.plan);
      loadTenants();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerInviteUser = window.ownerCreateUser = async function () {
    const data = await vuiForm({
      title: 'Invitar usuario',
      submitLabel: 'Enviar invitación',
      fields: [
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'role', label: 'Rol', type: 'radio', required: true, default: 'USER',
          options: [
            { value: 'USER', label: 'Usuario' },
            { value: 'MANAGER', label: 'Manager' },
            { value: 'ADMIN', label: 'Administrador' },
            { value: 'OWNER', label: 'Owner' }
          ]
        },
        { name: 'magic_link', label: 'Enviar magic link (sin contraseña)', type: 'switch', default: true },
        { name: 'password', label: 'Contraseña temporal (si no usa magic link)', type: 'password',
          showIf: function (v) { return !v.magic_link; } }
      ]
    }, () => {
      const email = prompt('Email del nuevo usuario:'); if (!email) return null;
      const password = prompt('Contraseña temporal (vacío = magic link):') || '';
      const role = prompt('Rol (USER/MANAGER/ADMIN/OWNER):', 'USER') || 'USER';
      return { email, password, role, magic_link: !password };
    });
    if (!data || !data.email) return;
    try {
      const payload = {
        email: data.email,
        role: data.role || 'USER',
        full_name: data.email.split('@')[0],
        magic_link: !!data.magic_link
      };
      if (!data.magic_link && data.password) payload.password = data.password;
      await apiPost('/api/owner/users', payload);
      toast(data.magic_link ? 'Invitación enviada (magic link)' : 'Usuario invitado');
      loadUsers();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerEditUserPermissions = async function (userId) {
    // Catálogo de scopes — todos los disponibles
    const scopeOptions = [
      { value: 'pos.read', label: 'POS · Leer' },
      { value: 'pos.write', label: 'POS · Escribir' },
      { value: 'inventory.read', label: 'Inventario · Leer' },
      { value: 'inventory.write', label: 'Inventario · Escribir' },
      { value: 'reports.read', label: 'Reportes · Leer' },
      { value: 'reports.export', label: 'Reportes · Exportar' },
      { value: 'users.read', label: 'Usuarios · Leer' },
      { value: 'users.write', label: 'Usuarios · Gestionar' },
      { value: 'billing.read', label: 'Facturación · Leer' },
      { value: 'billing.write', label: 'Facturación · Gestionar' },
      { value: 'settings.write', label: 'Configuración · Gestionar' },
      { value: 'audit.read', label: 'Auditoría · Leer' }
    ];

    const data = await vuiForm({
      title: 'Editar permisos',
      submitLabel: 'Guardar permisos',
      fields: [
        { name: 'role', label: 'Rol base', type: 'radio', required: true, default: 'USER',
          options: [
            { value: 'USER', label: 'Usuario' },
            { value: 'MANAGER', label: 'Manager' },
            { value: 'ADMIN', label: 'Administrador' },
            { value: 'OWNER', label: 'Owner' }
          ]
        },
        { name: 'scopes', label: 'Permisos (scopes)', type: 'multiselect', display: 'table',
          options: scopeOptions }
      ]
    }, () => {
      const role = prompt('Nuevo rol (USER/MANAGER/ADMIN/OWNER):'); return role ? { role } : null;
    });
    if (!data || !data.role) return;
    try {
      const payload = { role: data.role };
      if (Array.isArray(data.scopes)) payload.scopes = data.scopes;
      await apiPatch(`/api/owner/users/${userId}`, payload);
      toast('Permisos actualizados');
      loadUsers();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerToggleUser = async function (userId, makeActive) {
    if (makeActive) {
      const ok = await vuiConfirm({
        title: 'Activar usuario',
        message: '¿Reactivar este usuario?',
        confirmLabel: 'Activar'
      }, () => confirm('¿Activar usuario?'));
      if (!ok) return;
    } else {
      const ok = await vuiDestructiveConfirm({
        title: 'Suspender / eliminar usuario',
        message: 'El usuario perderá acceso. Esta acción puede revertirse activando de nuevo.',
        confirmLabel: 'Suspender',
        requireText: 'ELIMINAR'
      }, () => confirm('¿Suspender usuario?'));
      if (!ok) return;
    }
    try {
      await apiPatch(`/api/owner/users/${userId}`, { is_active: !!makeActive });
      toast(makeActive ? 'Activado' : 'Suspendido');
      loadUsers();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerCreateLicense = async function () {
    const data = await vuiForm({
      title: 'Crear licencia',
      submitLabel: 'Crear',
      fields: [
        { name: 'machine_name', label: 'Nombre de la máquina', type: 'text', required: true, minLength: 2 },
        { name: 'platform', label: 'Plataforma', type: 'radio', required: true, default: 'windows',
          options: [
            { value: 'windows', label: 'Windows' },
            { value: 'mac', label: 'macOS' },
            { value: 'android', label: 'Android' }
          ]
        }
      ]
    }, () => {
      const machine_name = prompt('Nombre de la máquina:'); if (!machine_name) return null;
      return { machine_name, platform: prompt('Plataforma (windows/mac/android):', 'windows') || 'windows' };
    });
    if (!data || !data.machine_name) return;
    try {
      const result = await apiPost('/api/owner/licenses', {
        machine_name: data.machine_name, platform: data.platform || 'windows',
        notes: 'Creada desde panel'
      });
      toast('Licencia: ' + (result.license_key || 'OK'));
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerRefreshMetrics = async function () {
    try {
      await Promise.all([loadDashboard(), loadLiveMetrics()]);
      toast('Métricas actualizadas');
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerApplyFilters = async function (form) {
    const filters = {};
    if (form && form.elements) {
      for (const el of form.elements) {
        if (el.name && el.value) filters[el.name] = el.value;
      }
    } else if (form && typeof form === 'object') {
      Object.assign(filters, form);
    }
    await Promise.all([loadTenants(filters), loadUsers(filters)]);
    toast('Filtros aplicados');
  };

  window.ownerExportReport = async function (type) {
    type = type || 'tenants';
    let data = cachedData['GET:/api/owner/' + type];
    if (!data) {
      try { data = await apiGet('/api/reports/' + type); }
      catch { data = []; }
    }
    const arr = Array.isArray(data) ? data : (data?.rows || data?.tenants || data?.users || []);
    const csv = jsonToCSV(arr);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volvix-${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Reporte exportado');
  };

  window.ownerRefreshAll = async function () {
    await Promise.all([loadDashboard(), loadTenants(), loadUsers(), loadLiveMetrics()]);
    toast('Datos actualizados');
  };

  function jsonToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  // =========================================================
  // OVERRIDE de funciones existentes que sólo tocaban localStorage
  // =========================================================
  function wrapLocalToApi() {
    // ctrlSetStatus → PATCH /api/owner/tenants/:id is_active / status
    if (typeof window.ctrlSetStatus === 'function') {
      const orig = window.ctrlSetStatus;
      window.ctrlSetStatus = async function (status) {
        try { orig(status); } catch {}
        try {
          const tenantId = window.TENANT_ID_OWNER || (session && session.tenant_id);
          if (tenantId) {
            await apiPatch(`/api/owner/tenants/${tenantId}`, {
              is_active: status === 'active',
              status
            });
          }
        } catch (e) { console.warn('[ctrlSetStatus→api]', e.message); }
      };
    }

    // ctrlUpdatePlan → PATCH plan
    if (typeof window.ctrlUpdatePlan === 'function') {
      const orig = window.ctrlUpdatePlan;
      window.ctrlUpdatePlan = async function (plan) {
        try { orig(plan); } catch {}
        try {
          const tenantId = window.TENANT_ID_OWNER || (session && session.tenant_id);
          if (tenantId) await apiPatch(`/api/owner/tenants/${tenantId}`, { plan });
        } catch (e) { console.warn('[ctrlUpdatePlan→api]', e.message); }
      };
    }

    // ctrlUpdateIdentity → PATCH name/brand
    if (typeof window.ctrlUpdateIdentity === 'function') {
      const orig = window.ctrlUpdateIdentity;
      window.ctrlUpdateIdentity = async function () {
        try { orig(); } catch {}
        try {
          const tenantId = window.TENANT_ID_OWNER || (session && session.tenant_id);
          const nameEl = document.getElementById('ctrl-name-input');
          const brandEl = document.getElementById('ctrl-brand-input');
          if (tenantId) {
            await apiPatch(`/api/owner/tenants/${tenantId}`, {
              name: nameEl?.value || undefined,
              brand: brandEl?.value || undefined
            });
          }
        } catch (e) { console.warn('[ctrlUpdateIdentity→api]', e.message); }
      };
    }
  }

  // =========================================================
  // WIRE EXISTING SECTIONS
  // =========================================================
  function wireExistingButtons() {
    const sections = ['tenants', 'users', 'licenses', 'features', 'tickets'];
    sections.forEach(sec => {
      const container = document.querySelector(`[data-section="${sec}"], #section-${sec}, #${sec}-section`);
      if (container && !container.querySelector('.owner-actions-injected')) {
        const actions = document.createElement('div');
        actions.className = 'owner-actions-injected';
        actions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;';
        if (sec === 'tenants') {
          actions.innerHTML =
            `<button class="btn primary" onclick="ownerCreateTenant()">+ Nuevo Tenant</button>
             <button class="btn" onclick="ownerRefreshAll()">🔄 Actualizar</button>
             <button class="btn" onclick="ownerExportReport('tenants')">📥 Export CSV</button>`;
        } else if (sec === 'users') {
          actions.innerHTML =
            `<button class="btn primary" onclick="ownerInviteUser()">+ Invitar Usuario</button>
             <button class="btn" onclick="ownerRefreshAll()">🔄 Actualizar</button>
             <button class="btn" onclick="ownerExportReport('users')">📥 Export CSV</button>`;
        } else if (sec === 'licenses') {
          actions.innerHTML = `<button class="btn primary" onclick="ownerCreateLicense()">+ Nueva Licencia</button>`;
        }
        container.insertBefore(actions, container.firstChild);
      }
    });
  }

  // =========================================================
  // LIVE METRICS WIDGET (setInterval 30s)
  // =========================================================
  function startLiveMetrics() {
    if (metricsTimer) clearInterval(metricsTimer);
    loadLiveMetrics().catch(() => {});
    metricsTimer = setInterval(() => {
      loadLiveMetrics().catch(() => {});
    }, 30000);
  }

  // =========================================================
  // INIT
  // =========================================================
  async function init() {
    loadSession();
    if (!session) console.warn('[OWNER-WIRING] Sin sesión activa (Volvix.auth se usará igual)');

    try {
      await Promise.all([loadDashboard(), loadTenants(), loadUsers()]);
      wireExistingButtons();
      wrapLocalToApi();
      startLiveMetrics();
      console.log('[OWNER-WIRING] R15 init OK');
    } catch (err) {
      console.error('[OWNER-WIRING] init error:', err);
    }
  }

  // API global
  window.OwnerAPI = {
    loadDashboard, loadTenants, loadUsers, loadSalesReport,
    loadLicenses, loadLowStock, loadLiveMetrics,
    apiGet, apiPost, apiPatch, apiDelete,
    refresh: () => Promise.all([loadDashboard(), loadTenants(), loadUsers(), loadLiveMetrics()]),
    getDashboard: () => dashboardData,
    getCache: () => cachedData
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
