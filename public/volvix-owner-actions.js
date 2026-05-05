/* ============================================================================
 * volvix-owner-actions.js — Phase 5 ghost-button rescue
 * Real handlers for ghost buttons in volvix-owner-panel.html
 *
 * Exposes window.VolvixOwnerActions with named methods invoked via
 * onclick="VolvixOwnerActions.X(...)" attributes.
 *
 * Depends on: volvix-admin-helpers.js (window.VolvixAdmin)
 * Falls back gracefully if VolvixAdmin / VolvixUI missing.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.VolvixOwnerActions) return;

  function V() { return window.VolvixAdmin || null; }
  function getView() {
    // Detect current visible <section id="v-...">
    var sections = document.querySelectorAll('section[id^="v-"]');
    for (var i = 0; i < sections.length; i++) {
      if (!sections[i].classList.contains('hidden')) {
        return sections[i].id.replace(/^v-/, '');
      }
    }
    return 'overview';
  }
  function refresh(view) {
    // Best-effort refresh hooks defined elsewhere in the page
    try { if (view === 'tenants' && typeof window.loadTenants === 'function') return window.loadTenants(); } catch (_) {}
    try { if (view === 'brands' && typeof window.loadBrandsFromAPI === 'function') return window.loadBrandsFromAPI(); } catch (_) {}
    try { if (view === 'verticals' && typeof window.renderVerticals === 'function') return window.renderVerticals(); } catch (_) {}
    try { if (view === 'modules' && typeof window.renderModules === 'function') return window.renderModules(); } catch (_) {}
    try { if (view === 'deploys' && typeof window.renderDeploys === 'function') return window.renderDeploys(); } catch (_) {}
    try { if (view === 'devices' && typeof window.renderDevices === 'function') return window.renderDevices(); } catch (_) {}
  }

  // ---------- EXPORT (current view) ----------
  async function exportCurrentView(btn) {
    var v = V(); if (!v) { alert('Helpers no cargados'); return; }
    var view = getView();
    v.lockButton(btn, 'Exportando…');
    try {
      var ts = new Date().toISOString().slice(0, 10);
      var rows = [];
      // Try to read the visible table inside the active section
      var section = document.querySelector('#v-' + view + ':not(.hidden)') || document.querySelector('section:not(.hidden)');
      var table = section && section.querySelector('table');
      if (table) {
        var headers = [];
        table.querySelectorAll('thead th').forEach(function (th) { headers.push(th.textContent.trim() || '_'); });
        table.querySelectorAll('tbody tr').forEach(function (tr) {
          var row = [];
          tr.querySelectorAll('td').forEach(function (td) { row.push(td.textContent.trim().replace(/\s+/g, ' ')); });
          if (row.length) rows.push(row);
        });
        v.downloadCSV('volvix-' + view + '-' + ts + '.csv', rows, headers);
        v.toast('Exportado: volvix-' + view + '-' + ts + '.csv (' + rows.length + ' filas)', 'success');
      } else {
        // Fallback: KPIs visibles
        var kpis = [];
        (section || document).querySelectorAll('[data-kpi]').forEach(function (e) {
          kpis.push({ kpi: e.getAttribute('data-kpi'), value: e.textContent.trim() });
        });
        if (kpis.length) {
          v.downloadCSV('volvix-' + view + '-kpis-' + ts + '.csv', kpis, ['kpi', 'value']);
          v.toast('Exportado: KPIs (' + kpis.length + ')', 'success');
        } else {
          v.toast('Sin tabla ni KPIs en esta vista', 'warn');
        }
      }
    } catch (e) {
      v.toast('Error al exportar: ' + e.message, 'error');
    } finally {
      v.unlockButton(btn);
    }
  }

  // ---------- CREATE (current view) ----------
  async function createForCurrentView(btn) {
    var view = getView();
    switch (view) {
      case 'verticals':  return newVertical(btn);
      case 'brands':     return newBrand(btn);
      case 'modules':    return newModule(btn);
      case 'tenants':    return newTenant(btn);
      case 'devices':    return issueSeat(btn);
      case 'deploys':    return newDeploy(btn);
      case 'giros':      return newGiro(btn);
      case 'apps':       return openAppRequest(btn);
      default: {
        var v = V();
        if (v) v.toast('No hay acción "crear" para la vista "' + view + '"', 'info');
      }
    }
  }

  // ---------- NEW VERTICAL ----------
  async function newVertical(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: '+ Nueva vertical',
      description: 'Plantilla de giro con terminología y módulos por defecto.',
      fields: [
        { name: 'key', label: 'Clave', type: 'text', required: true,
          placeholder: 'retail',
          validate: function (s) { return /^[a-z][a-z0-9_-]{1,20}$/.test(s||'') ? null : 'kebab/snake 2-21 chars'; } },
        { name: 'name', label: 'Nombre', type: 'text', required: true,
          validate: function (s) { return (s||'').trim().length >= 2 ? null : 'Mínimo 2 caracteres'; } },
        { name: 'icon', label: 'Icono (emoji)', type: 'text', required: true, default: '🏷️' },
        { name: 'desc', label: 'Descripción corta', type: 'textarea', required: true },
        { name: 'terms', label: 'Términos (separados por · )', type: 'text', required: true,
          placeholder: 'cliente · producto · venta · ticket' }
      ],
      submitText: 'Crear vertical'
    });
    if (!values) return;
    v.lockButton(btn, 'Creando…');
    var res = await v.api('POST', '/api/owner/verticals', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Vertical "' + values.name + '" creada', 'success'); refresh('verticals'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- EDIT VERTICAL ----------
  async function editVertical(key, btn) {
    var v = V(); if (!v) return;
    // Try to load current data
    var get = await v.api('GET', '/api/owner/verticals/' + encodeURIComponent(key));
    var current = (get.ok && get.data) || {};
    var values = await v.openFormModal({
      title: 'Editar vertical: ' + (current.name || key),
      fields: [
        { name: 'name', label: 'Nombre', type: 'text', required: true },
        { name: 'icon', label: 'Icono', type: 'text', required: true },
        { name: 'desc', label: 'Descripción', type: 'textarea', required: true },
        { name: 'terms', label: 'Términos', type: 'text', required: true }
      ],
      initialValues: current,
      submitText: 'Guardar cambios'
    });
    if (!values) return;
    v.lockButton(btn, 'Guardando…');
    var res = await v.api('PATCH', '/api/owner/verticals/' + encodeURIComponent(key), values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Vertical actualizada', 'success'); refresh('verticals'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- VIEW VERTICAL TENANTS ----------
  async function viewVerticalTenants(key, btn) {
    var v = V(); if (!v) return;
    v.lockButton(btn, '');
    var res = await v.api('GET', '/api/owner/tenants?vertical=' + encodeURIComponent(key));
    v.unlockButton(btn);
    var list = (res.ok && (res.data && (res.data.items || res.data))) || [];
    if (!Array.isArray(list)) list = [];
    var body;
    if (!list.length) {
      body = '<p style="padding:20px;color:#666">Sin tenants en esta vertical.</p>';
    } else {
      body = '<table style="width:100%;font-size:13px;border-collapse:collapse">'
        + '<thead><tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Tenant</th>'
        + '<th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Marca</th>'
        + '<th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">Plan</th>'
        + '<th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">MRR</th></tr></thead><tbody>'
        + list.map(function (t) {
          return '<tr><td style="padding:6px;border-bottom:1px solid #eee">' + (t.name || '—') + '</td>'
            + '<td style="padding:6px;border-bottom:1px solid #eee">' + (t.brand || '—') + '</td>'
            + '<td style="padding:6px;border-bottom:1px solid #eee">' + (t.plan || '—') + '</td>'
            + '<td style="padding:6px;border-bottom:1px solid #eee;text-align:right">$' + (t.mrr || 0) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    if (window.VolvixUI && window.VolvixUI.modal) {
      window.VolvixUI.modal({ title: 'Tenants de "' + key + '"', body: body, size: 'lg', dismissable: true });
    } else {
      console.table(list);
      v.toast(list.length + ' tenant(s) — ver consola', 'info');
    }
  }

  // ---------- NEW BRAND ----------
  async function newBrand(btn) {
    var v = V(); if (!v) return;
    // Reuse existing modal if present
    if (typeof window.openNewBrandModal === 'function') {
      try { window.openNewBrandModal(); return; } catch (_) {}
    }
    var values = await v.openFormModal({
      title: '+ Nueva marca blanca',
      fields: [
        { name: 'name', label: 'Nombre comercial', type: 'text', required: true },
        { name: 'subdomain', label: 'Subdominio', type: 'text', required: true,
          validate: function (s) { return /^[a-z0-9][a-z0-9-]{1,30}$/i.test(s||'') ? null : 'Inválido'; } },
        { name: 'vertical', label: 'Vertical', type: 'select', required: true,
          options: [
            { value: 'retail', label: 'Retail' },
            { value: 'health', label: 'Salud' },
            { value: 'beauty', label: 'Belleza' },
            { value: 'food', label: 'Alimentos' },
            { value: 'rental', label: 'Rentas' },
            { value: 'services', label: 'Servicios' }
          ] },
        { name: 'type', label: 'Tipo', type: 'select', required: true,
          options: [
            { value: 'own', label: 'Oficial (propia)' },
            { value: 'reseller', label: 'De revendedor' }
          ] },
        { name: 'revshare', label: 'Revshare al padre (%)', type: 'number', default: 0,
          validate: function (s) { var n = Number(s); return (n >= 0 && n <= 100) ? null : '0-100'; } }
      ],
      submitText: 'Crear marca'
    });
    if (!values) return;
    v.lockButton(btn, 'Creando…');
    var res = await v.api('POST', '/api/owner/brands', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Marca "' + values.name + '" creada', 'success'); refresh('brands'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- OPEN BRAND ----------
  async function openBrand(brandId, btn) {
    var v = V(); if (!v) return;
    v.lockButton(btn, '');
    var res = await v.api('GET', '/api/owner/brands/' + encodeURIComponent(brandId));
    v.unlockButton(btn);
    if (!res.ok) { v.toast('No se encontró la marca: ' + res.error, 'error'); return; }
    var b = res.data || {};
    var body = '<dl style="font-size:13px">'
      + '<dt><b>Nombre:</b></dt><dd>' + (b.name || '—') + '</dd>'
      + '<dt><b>Subdominio:</b></dt><dd>' + (b.subdomain || '—') + '</dd>'
      + '<dt><b>Vertical:</b></dt><dd>' + (b.vertical || '—') + '</dd>'
      + '<dt><b>Tipo:</b></dt><dd>' + (b.type || '—') + '</dd>'
      + '<dt><b>Tenants:</b></dt><dd>' + (b.tenants || 0) + '</dd>'
      + '<dt><b>MRR:</b></dt><dd>$' + (b.mrr || 0) + '</dd>'
      + '<dt><b>Revshare:</b></dt><dd>' + (b.rev || b.revshare || 0) + '%</dd>'
      + '</dl>';
    if (window.VolvixUI && window.VolvixUI.modal) {
      window.VolvixUI.modal({ title: 'Marca: ' + (b.name || brandId), body: body, size: 'md', dismissable: true });
    } else {
      v.toast('Marca cargada — ver consola', 'info');
      console.log('[brand]', b);
    }
  }

  // ---------- NEW MODULE ----------
  async function newModule(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: '+ Crear módulo',
      description: 'Funcionalidad activable por marca o tenant.',
      fields: [
        { name: 'key', label: 'Clave (kebab)', type: 'text', required: true,
          validate: function (s) { return /^[a-z][a-z0-9_-]{1,30}$/.test(s||'') ? null : 'kebab/snake'; } },
        { name: 'name', label: 'Nombre visible', type: 'text', required: true },
        { name: 'icon', label: 'Icono (emoji)', type: 'text', required: true, default: '⚙️' },
        { name: 'type', label: 'Tipo', type: 'select', required: true,
          options: [
            { value: 'core', label: 'Core' },
            { value: 'vertical', label: 'Vertical' },
            { value: 'custom', label: 'Custom' }
          ] },
        { name: 'desc', label: 'Descripción', type: 'textarea', required: true },
        { name: 'price', label: 'Precio mensual (USD)', type: 'number', required: true, default: 29,
          validate: function (s) { return Number(s) >= 0 ? null : '≥ 0'; } }
      ],
      submitText: 'Crear módulo'
    });
    if (!values) return;
    v.lockButton(btn, 'Creando…');
    var res = await v.api('POST', '/api/owner/modules', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Módulo "' + values.name + '" creado', 'success'); refresh('modules'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- NEW TENANT ----------
  async function newTenant(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: '+ Nuevo tenant',
      fields: [
        { name: 'name', label: 'Nombre comercial', type: 'text', required: true,
          validate: function (s) { return (s||'').trim().length >= 2 ? null : 'Mínimo 2 caracteres'; } },
        { name: 'brand_id', label: 'Marca blanca (subdominio)', type: 'text', required: true },
        { name: 'admin_email', label: 'Email del admin', type: 'email', required: true,
          validate: function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s||'') ? null : 'Email inválido'; } },
        { name: 'plan', label: 'Plan', type: 'select', required: true,
          options: [
            { value: 'trial', label: 'Trial' },
            { value: 'starter', label: 'Starter' },
            { value: 'pro', label: 'Pro' },
            { value: 'business', label: 'Business' }
          ], default: 'trial' }
      ],
      submitText: 'Crear tenant'
    });
    if (!values) return;
    v.lockButton(btn, 'Creando…');
    var res = await v.api('POST', '/api/owner/tenants', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Tenant "' + values.name + '" creado', 'success'); refresh('tenants'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- FILTER TENANTS ----------
  async function filterTenants(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: 'Filtrar tenants',
      fields: [
        { name: 'plan', label: 'Plan', type: 'select',
          options: [
            { value: '', label: 'Todos' },
            { value: 'trial', label: 'Trial' },
            { value: 'starter', label: 'Starter' },
            { value: 'pro', label: 'Pro' },
            { value: 'business', label: 'Business' },
            { value: 'enterprise', label: 'Enterprise' }
          ] },
        { name: 'status', label: 'Estado', type: 'select',
          options: [
            { value: '', label: 'Todos' },
            { value: 'active', label: 'Activos' },
            { value: 'suspended', label: 'Suspendidos' }
          ] },
        { name: 'q', label: 'Búsqueda libre', type: 'text', placeholder: 'nombre, subdominio…' }
      ],
      submitText: 'Aplicar'
    });
    if (!values) return;
    var rows = document.querySelectorAll('#tenantsBody tr');
    var visible = 0;
    var q = String(values.q || '').toLowerCase();
    rows.forEach(function (tr) {
      var text = tr.textContent.toLowerCase();
      var ok = true;
      if (values.plan && text.indexOf(values.plan.toLowerCase()) < 0) ok = false;
      if (values.status === 'active' && text.indexOf('inactivo') >= 0) ok = false;
      if (values.status === 'suspended' && text.indexOf('suspend') < 0) ok = false;
      if (q && text.indexOf(q) < 0) ok = false;
      tr.style.display = ok ? '' : 'none';
      if (ok) visible++;
    });
    v.toast('Filtros aplicados: ' + visible + ' tenant(s)', 'success');
  }

  // ---------- ISSUE SEAT ----------
  async function issueSeat(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: '+ Emitir seat',
      description: 'Asignar una nueva licencia (seat) a un tenant.',
      fields: [
        { name: 'tenant_id', label: 'Tenant ID o subdominio', type: 'text', required: true },
        { name: 'platform', label: 'Plataforma', type: 'select', required: true,
          options: [
            { value: 'web', label: 'Web (PWA)' },
            { value: 'windows', label: 'Windows' },
            { value: 'android', label: 'Android' },
            { value: 'ios', label: 'iOS' }
          ] },
        { name: 'qty', label: 'Cantidad', type: 'number', required: true, default: 1,
          validate: function (s) { var n = Number(s); return (n >= 1 && n <= 100) ? null : '1-100'; } },
        { name: 'note', label: 'Nota (opcional)', type: 'textarea' }
      ],
      submitText: 'Emitir'
    });
    if (!values) return;
    v.lockButton(btn, 'Emitiendo…');
    var res = await v.api('POST', '/api/owner/seats', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Seats emitidos: ' + values.qty + ' (' + values.platform + ')', 'success'); refresh('devices'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- NEW DEPLOY ----------
  async function newDeploy(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: '🚀 Nuevo deploy',
      fields: [
        { name: 'version', label: 'Versión (ej. v1.2.3)', type: 'text', required: true,
          validate: function (s) { return /^v?\d+\.\d+\.\d+/.test(s||'') ? null : 'semver: v1.2.3'; } },
        { name: 'channel', label: 'Canal', type: 'select', required: true,
          options: [
            { value: 'stable', label: 'Estable' },
            { value: 'beta',   label: 'Beta' },
            { value: 'canary', label: 'Canary (5% tenants)' }
          ], default: 'stable' },
        { name: 'platform', label: 'Plataforma', type: 'select', required: true,
          options: [
            { value: 'all',     label: 'Todas' },
            { value: 'web',     label: 'Solo Web' },
            { value: 'windows', label: 'Solo Windows' },
            { value: 'android', label: 'Solo Android' }
          ], default: 'all' },
        { name: 'notes', label: 'Release notes', type: 'textarea', required: true,
          validate: function (s) { return (s||'').trim().length >= 10 ? null : 'Mínimo 10 chars'; } }
      ],
      submitText: 'Lanzar deploy'
    });
    if (!values) return;
    if (values.channel === 'stable') {
      var ok = await v.confirmDestructive({
        title: '¿Lanzar a estable?',
        message: 'Afectará a TODOS los tenants. Confirma para continuar.',
        confirmWord: 'DEPLOY'
      });
      if (!ok) return;
    }
    v.lockButton(btn, 'Lanzando…');
    var res = await v.api('POST', '/api/owner/deploys', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Deploy ' + values.version + ' iniciado', 'success'); refresh('deploys'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- SAVE TENANT CHANGES (modal) ----------
  async function saveTenantChanges(btn) {
    var v = V(); if (!v) return;
    var modal = document.getElementById('modal-tenant');
    if (!modal) { v.toast('Modal no encontrado', 'error'); return; }
    var nameEl = document.getElementById('modal-tenant-name');
    var tenantName = nameEl ? nameEl.textContent.trim() : '';
    // Collect changes from terminology inputs and toggles
    var terminology = {};
    modal.querySelectorAll('#mtab-term tbody tr').forEach(function (tr) {
      var label = tr.cells[0] ? tr.cells[0].textContent.trim() : '';
      var input = tr.cells[1] ? tr.cells[1].querySelector('input') : null;
      if (label && input) terminology[label] = input.value;
    });
    var modules = [];
    modal.querySelectorAll('#modal-modules-list .toggle.on, #modal-modules-list [data-mod-key]').forEach(function (n) {
      var key = n.getAttribute('data-mod-key');
      if (key) modules.push(key);
    });
    var tenantId = modal.getAttribute('data-tenant-id') || tenantName;
    v.lockButton(btn, 'Guardando…');
    var res = await v.api('PATCH', '/api/owner/tenants/' + encodeURIComponent(tenantId),
      { terminology: terminology, modules: modules });
    v.unlockButton(btn);
    if (res.ok) {
      v.toast('Cambios guardados ✓', 'success');
      try { if (typeof window.closeModal === 'function') window.closeModal('modal-tenant'); } catch (_) {}
      refresh('tenants');
    } else {
      v.toast('Error: ' + res.error, 'error');
    }
  }

  // ---------- NEW GIRO (placeholder) ----------
  async function newGiro(btn) {
    var v = V(); if (!v) return;
    var values = await v.openFormModal({
      title: '+ Nuevo giro',
      fields: [
        { name: 'key', label: 'Clave', type: 'text', required: true,
          validate: function (s) { return /^[a-z][a-z0-9_-]{1,30}$/.test(s||'') ? null : 'kebab'; } },
        { name: 'name', label: 'Nombre', type: 'text', required: true },
        { name: 'icon', label: 'Icono', type: 'text', required: true, default: '🏪' },
        { name: 'category', label: 'Categoría', type: 'select', required: true,
          options: [
            { value: 'retail', label: 'Retail' },
            { value: 'food',   label: 'Alimentos' },
            { value: 'beauty', label: 'Belleza' },
            { value: 'health', label: 'Salud' },
            { value: 'services', label: 'Servicios' }
          ] }
      ],
      submitText: 'Crear giro'
    });
    if (!values) return;
    v.lockButton(btn, 'Creando…');
    var res = await v.api('POST', '/api/owner/giros', values);
    v.unlockButton(btn);
    if (res.ok) { v.toast('Giro "' + values.name + '" creado', 'success'); }
    else v.toast('Error: ' + res.error, 'error');
  }

  // ---------- APP REQUEST ----------
  async function openAppRequest(btn) {
    var v = V(); if (!v) return;
    v.toast('Sin acción "crear" definida en Apps Suite. Usa Control granular.', 'info');
  }

  // ---------- EXPORT ----------
  window.VolvixOwnerActions = {
    exportCurrentView: exportCurrentView,
    createForCurrentView: createForCurrentView,
    newVertical: newVertical,
    editVertical: editVertical,
    viewVerticalTenants: viewVerticalTenants,
    newBrand: newBrand,
    openBrand: openBrand,
    newModule: newModule,
    newTenant: newTenant,
    filterTenants: filterTenants,
    issueSeat: issueSeat,
    newDeploy: newDeploy,
    saveTenantChanges: saveTenantChanges,
    newGiro: newGiro,
    openAppRequest: openAppRequest
  };
})();
