/* ============================================================
   VOLVIX · OWNER PANEL WIRING
   Conecta TODOS los botones del Owner Panel a Supabase
============================================================ */
(function() {
  'use strict';

  const API = location.origin;
  let session = null;
  let dashboardData = null;
  let cachedData = {};

  console.log('%c[OWNER-WIRING]', 'background:#3B82F6;color:#fff;padding:2px 6px;border-radius:3px',
              'Cableado del Owner Panel activo');

  // =========================================================
  // SESSION
  // =========================================================
  function loadSession() {
    try {
      session = JSON.parse(localStorage.getItem('volvixSession') || 'null');
    } catch { session = null; }
    return session;
  }

  // =========================================================
  // API CALLS
  // =========================================================
  async function apiGet(path) {
    const cacheKey = 'GET:' + path;
    try {
      const res = await fetch(API + path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      cachedData[cacheKey] = data;
      return data;
    } catch (err) {
      console.warn('[API GET]', path, 'falló:', err.message);
      return cachedData[cacheKey] || null;
    }
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[API POST]', path, err.message);
      throw err;
    }
  }

  async function apiPatch(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch (err) { throw err; }
  }

  async function apiDelete(path) {
    try {
      const res = await fetch(API + path, { method: 'DELETE' });
      return await res.json();
    } catch (err) { throw err; }
  }

  // =========================================================
  // CARGAR DATOS REALES
  // =========================================================
  async function loadDashboard() {
    const data = await apiGet('/api/owner/dashboard');
    if (!data || !data.metrics) return;

    dashboardData = data;
    const m = data.metrics;

    // Actualizar contadores en la página si existen
    updateMetric('total-users', m.active_users);
    updateMetric('total-tenants', m.active_tenants);
    updateMetric('total-sales', m.total_sales);
    updateMetric('total-revenue', '$' + m.total_revenue.toFixed(2));
    updateMetric('mrr', '$' + m.mrr.toLocaleString());
    updateMetric('arr', '$' + m.arr.toLocaleString());
    updateMetric('low-stock', m.low_stock_count);

    // KPIs en el dashboard
    document.querySelectorAll('[data-kpi]').forEach(el => {
      const kpi = el.dataset.kpi;
      if (m[kpi] !== undefined) {
        el.textContent = typeof m[kpi] === 'number' ? m[kpi].toLocaleString() : m[kpi];
      }
    });

    console.log('[OWNER] Dashboard cargado:', m);
    return data;
  }

  function updateMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function loadTenants() {
    const tenants = await apiGet('/api/owner/tenants');
    if (!tenants) return [];

    // Si hay tabla de tenants en la UI, llenarla
    const tbody = document.querySelector('#tenants-table tbody, [data-table="tenants"] tbody');
    if (tbody && Array.isArray(tenants)) {
      tbody.innerHTML = tenants.map(t => `
        <tr>
          <td>${t.id ? t.id.substring(0,8) : ''}</td>
          <td><strong>${t.name || ''}</strong></td>
          <td><span class="chip">${t.plan || ''}</span></td>
          <td>${t.is_active ? '🟢 Activo' : '🔴 Suspendido'}</td>
          <td>${new Date(t.created_at || Date.now()).toLocaleDateString()}</td>
          <td>
            <button class="btn sm" onclick="ownerEditTenant('${t.id}')">✏️</button>
            <button class="btn sm" onclick="ownerToggleTenant('${t.id}', ${!t.is_active})">${t.is_active ? '⏸️' : '▶️'}</button>
          </td>
        </tr>
      `).join('');
    }

    return tenants;
  }

  async function loadUsers() {
    const users = await apiGet('/api/owner/users');
    if (!users) return [];

    const tbody = document.querySelector('#users-table tbody, [data-table="users"] tbody');
    if (tbody && Array.isArray(users)) {
      tbody.innerHTML = users.map(u => `
        <tr>
          <td>${u.email || ''}</td>
          <td><span class="chip">${u.role || ''}</span></td>
          <td>${u.full_name || '-'}</td>
          <td>${u.plan || 'free'}</td>
          <td>${u.is_active ? '🟢' : '🔴'}</td>
          <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Nunca'}</td>
        </tr>
      `).join('');
    }

    return users;
  }

  async function loadSalesReport() {
    const report = await apiGet('/api/owner/sales-report');
    return report || [];
  }

  async function loadLicenses() {
    const licenses = await apiGet('/api/owner/licenses');
    return licenses || [];
  }

  async function loadLowStock() {
    const products = await apiGet('/api/owner/low-stock');
    return products || [];
  }

  // =========================================================
  // ACTIONS GLOBALES (window.*)
  // =========================================================
  window.ownerEditTenant = async function(tenantId) {
    const newName = prompt('Nuevo nombre del tenant:');
    if (!newName) return;
    try {
      await apiPatch(`/api/tenants/${tenantId}`, { name: newName });
      if (typeof window.showToast === 'function') window.showToast('✓ Tenant actualizado');
      loadTenants();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerToggleTenant = async function(tenantId, makeActive) {
    if (!confirm(makeActive ? '¿Activar tenant?' : '¿Suspender tenant?')) return;
    try {
      await apiPatch(`/api/tenants/${tenantId}`, { is_active: makeActive });
      if (typeof window.showToast === 'function') window.showToast(makeActive ? '✓ Activado' : '✓ Suspendido');
      loadTenants();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerCreateTenant = async function() {
    const name = prompt('Nombre del nuevo tenant:');
    if (!name) return;
    const plan = prompt('Plan (trial/pro/enterprise):', 'trial');
    try {
      const result = await apiPost('/api/tenants', {
        name, plan,
        owner_user_id: session?.user_id || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
      });
      if (typeof window.showToast === 'function') window.showToast('✓ Tenant creado: ' + name);
      loadTenants();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerCreateUser = async function() {
    const email = prompt('Email del nuevo usuario:');
    if (!email) return;
    const password = prompt('Contraseña:');
    if (!password) return;
    const role = prompt('Rol (USER/ADMIN):', 'USER');
    try {
      const result = await apiPost('/api/owner/users', {
        email, password, role: role || 'USER',
        full_name: email.split('@')[0]
      });
      if (typeof window.showToast === 'function') window.showToast('✓ Usuario creado');
      loadUsers();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerCreateLicense = async function() {
    const machineName = prompt('Nombre de la máquina:');
    if (!machineName) return;
    const platform = prompt('Plataforma (windows/mac/android):', 'windows');
    try {
      const result = await apiPost('/api/owner/licenses', {
        machine_name: machineName,
        platform: platform || 'windows',
        notes: 'Creada desde panel'
      });
      if (typeof window.showToast === 'function') window.showToast('✓ Licencia creada: ' + result.license_key);
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerRequestFeature = async function() {
    const request = prompt('¿Qué feature necesitas?');
    if (!request) return;
    try {
      const result = await apiPost('/api/features/request', {
        clientRequest: request,
        tenantId: session?.tenant_id || 'TNT001'
      });
      if (typeof window.showToast === 'function') {
        window.showToast(`✓ IA decidió: ${result.decision} - ${result.feature?.name}`);
      } else {
        alert(`IA decidió: ${result.decision}\nFeature: ${result.feature?.name}\nRazón: ${result.feature?.reason}`);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerCreateTicket = async function() {
    const title = prompt('Título del ticket:');
    if (!title) return;
    const description = prompt('Descripción del problema:');
    try {
      const result = await apiPost('/api/tickets', {
        title, description,
        tenant_id: session?.tenant_id || 'TNT001'
      });
      if (typeof window.showToast === 'function') {
        const status = result.ticket?.status === 'solved' ? '✓ Resuelto por IA' : 'Asignado';
        window.showToast(`Ticket ${result.ticket?.id}: ${status}`);
      } else {
        alert(`Ticket: ${result.ticket?.id}\nStatus: ${result.ticket?.status}\nSolución: ${result.ticket?.solution}`);
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.ownerRefreshAll = async function() {
    console.log('[OWNER] Refrescando datos...');
    await Promise.all([
      loadDashboard(),
      loadTenants(),
      loadUsers(),
      loadSalesReport(),
      loadLowStock(),
    ]);
    if (typeof window.showToast === 'function') window.showToast('✓ Datos actualizados');
  };

  window.ownerExportData = function(type) {
    const data = cachedData['GET:/api/owner/' + type] || [];
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volvix-${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function jsonToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => JSON.stringify(row[h] || '')).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  // =========================================================
  // INTERCEPTAR FUNCIONES EXISTENTES
  // =========================================================
  function wireExistingButtons() {
    // Inyectar botones de acción si hay secciones específicas
    const sections = ['tenants', 'users', 'licenses', 'features', 'tickets'];
    sections.forEach(sec => {
      const container = document.querySelector(`[data-section="${sec}"], #section-${sec}, #${sec}-section`);
      if (container && !container.querySelector('.owner-actions-injected')) {
        const actions = document.createElement('div');
        actions.className = 'owner-actions-injected';
        actions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;';

        if (sec === 'tenants') {
          actions.innerHTML = `<button class="btn primary" onclick="ownerCreateTenant()">+ Nuevo Tenant</button>
                               <button class="btn" onclick="ownerRefreshAll()">🔄 Actualizar</button>
                               <button class="btn" onclick="ownerExportData('tenants')">📥 Export CSV</button>`;
        } else if (sec === 'users') {
          actions.innerHTML = `<button class="btn primary" onclick="ownerCreateUser()">+ Nuevo Usuario</button>
                               <button class="btn" onclick="ownerRefreshAll()">🔄 Actualizar</button>`;
        } else if (sec === 'licenses') {
          actions.innerHTML = `<button class="btn primary" onclick="ownerCreateLicense()">+ Nueva Licencia</button>`;
        } else if (sec === 'tickets') {
          actions.innerHTML = `<button class="btn primary" onclick="ownerCreateTicket()">+ Nuevo Ticket</button>`;
        }

        container.insertBefore(actions, container.firstChild);
      }
    });
  }

  // =========================================================
  // AUTO-INIT
  // =========================================================
  async function init() {
    loadSession();
    if (!session) {
      console.warn('[OWNER-WIRING] Sin sesión activa');
      return;
    }

    console.log(`[OWNER-WIRING] Sesión: ${session.email} (${session.role})`);

    try {
      // Cargar datos en paralelo
      await Promise.all([
        loadDashboard(),
        loadTenants(),
        loadUsers(),
      ]);

      // Cablear botones
      wireExistingButtons();

      // Refresh automático cada 30 segundos
      setInterval(() => {
        loadDashboard().catch(() => {});
      }, 30000);

      console.log('[OWNER-WIRING] ✅ Inicialización completa');
    } catch (err) {
      console.error('[OWNER-WIRING] Error:', err);
    }
  }

  // Exponer API global
  window.OwnerAPI = {
    loadDashboard, loadTenants, loadUsers, loadSalesReport,
    loadLicenses, loadLowStock,
    apiGet, apiPost, apiPatch, apiDelete,
    refresh: () => Promise.all([loadDashboard(), loadTenants(), loadUsers()]),
    getDashboard: () => dashboardData,
    getCache: () => cachedData,
  };

  // Iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
