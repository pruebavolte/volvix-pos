/* ============================================================================
 * volvix-admin-saas-actions.js — Phase 5 ghost-button rescue
 * Real handlers for every action button in volvix-admin-saas.html.
 *
 * Wires data-action="..." attributes to real implementations.
 * Depends on: volvix-admin-helpers.js (VolvixAdmin global)
 * Optional:    VolvixUI (volvix-modals.js) for nicer modals — falls back gracefully.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__volvixAdminSaasActions) return;
  window.__volvixAdminSaasActions = true;

  function VA() { return window.VolvixAdmin; }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // ---------- HANDLERS ----------

  // Export current dashboard view to CSV
  async function exportDashboard(btn) {
    var V = VA(); if (!V) return;
    V.lockButton(btn, 'Generando CSV…');
    try {
      // Read all visible KPIs
      var kpis = [];
      document.querySelectorAll('[data-kpi]').forEach(function (el) {
        kpis.push({ kpi: el.getAttribute('data-kpi'), value: el.textContent.trim() });
      });
      // Read tenants table
      var tenantRows = [];
      document.querySelectorAll('#adm-tenants-tbody tr').forEach(function (tr) {
        var tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
          tenantRows.push({
            tenant: tds[0].textContent.trim().replace(/\s+/g, ' '),
            plan: tds[1].textContent.trim(),
            usuarios: tds[2].textContent.trim(),
            mrr: tds[3].textContent.trim(),
            estado: tds[4].textContent.trim(),
            region: tds[5].textContent.trim(),
            ultima_actividad: tds[6].textContent.trim()
          });
        }
      });
      var ts = new Date().toISOString().slice(0, 10);
      V.downloadCSV('volvix-saas-kpis-' + ts + '.csv', kpis, ['kpi', 'value']);
      if (tenantRows.length) {
        V.downloadCSV('volvix-saas-tenants-' + ts + '.csv', tenantRows,
          ['tenant', 'plan', 'usuarios', 'mrr', 'estado', 'region', 'ultima_actividad']);
      }
      V.toast('Exportación completada (' + (1 + (tenantRows.length ? 1 : 0)) + ' archivo/s)', 'success');
    } catch (e) {
      V.toast('Error al exportar: ' + (e && e.message || e), 'error');
    } finally {
      V.unlockButton(btn);
    }
  }

  // Date-range picker (period filter)
  async function periodPicker(btn) {
    var V = VA(); if (!V) return;
    var current = btn.getAttribute('data-period') || '30d';
    var values = await V.openFormModal({
      title: 'Periodo del dashboard',
      description: 'Selecciona el rango temporal aplicado a KPIs y gráficas.',
      fields: [{
        name: 'period', label: 'Periodo', type: 'select', required: true,
        options: [
          { value: '24h', label: 'Últimas 24 horas' },
          { value: '7d',  label: 'Últimos 7 días' },
          { value: '30d', label: 'Últimos 30 días' },
          { value: '90d', label: 'Últimos 90 días' },
          { value: '1y',  label: 'Último año' },
          { value: 'all', label: 'Todo el historial' }
        ],
        default: current
      }],
      submitText: 'Aplicar'
    });
    if (!values) return;
    var labelMap = { '24h':'24 horas','7d':'7 días','30d':'30 días','90d':'90 días','1y':'1 año','all':'todo' };
    btn.setAttribute('data-period', values.period);
    btn.innerHTML = '📅 Últimos ' + labelMap[values.period];
    try {
      var url = new URL(location.href);
      url.searchParams.set('period', values.period);
      history.replaceState({}, '', url.toString());
    } catch (e) {}
    V.toast('Periodo: ' + labelMap[values.period] + '. Recargando dashboards…', 'info');
    setTimeout(function () { location.reload(); }, 800);
  }

  // Create new tenant
  async function newTenant(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: 'Nuevo tenant',
      description: 'Provisión manual de un cliente nuevo en la plataforma.',
      fields: [
        { name: 'name', label: 'Nombre comercial', type: 'text', required: true,
          placeholder: 'Ej: Abarrotes Don Chucho',
          validate: function (v) { return (v && v.trim().length >= 2) ? null : 'Mínimo 2 caracteres'; } },
        { name: 'subdomain', label: 'Subdominio', type: 'text', required: true,
          placeholder: 'donchucho',
          validate: function (v) { return /^[a-z0-9][a-z0-9-]{1,30}$/i.test(v||'') ? null : 'Solo letras, números y guiones (2-31 chars)'; } },
        { name: 'admin_email', label: 'Email del admin', type: 'email', required: true,
          validate: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v||'') ? null : 'Email inválido'; } },
        { name: 'plan', label: 'Plan', type: 'select', required: true,
          options: [
            { value: 'trial',      label: 'Prueba gratis' },
            { value: 'starter',    label: 'Starter ($29/mo)' },
            { value: 'pro',        label: 'Pro ($99/mo)' },
            { value: 'business',   label: 'Business ($299/mo)' },
            { value: 'enterprise', label: 'Enterprise (custom)' }
          ], default: 'trial' },
        { name: 'region', label: 'Región', type: 'select', required: true,
          options: [
            { value: 'us-east', label: '🇺🇸 US-East' },
            { value: 'us-west', label: '🇺🇸 US-West' },
            { value: 'eu-west', label: '🇪🇺 EU-West' },
            { value: 'latam',   label: '🌎 LatAm' },
            { value: 'apac',    label: '🌏 APAC' }
          ], default: 'latam' }
      ],
      submitText: 'Crear tenant'
    });
    if (!values) return;
    V.lockButton(btn, 'Creando…');
    try {
      var res = await V.api('POST', '/api/owner/tenants', values);
      if (res.ok) {
        V.toast('Tenant "' + values.name + '" creado. Email enviado a ' + values.admin_email, 'success');
        // Refresh tenants table if loader exists
        if (typeof window.reloadTenantsTable === 'function') window.reloadTenantsTable();
        else setTimeout(function () { location.reload(); }, 1200);
      } else {
        V.toast('No se pudo crear: ' + res.error, 'error');
      }
    } finally {
      V.unlockButton(btn);
    }
  }

  // Command palette (Ctrl+K)
  async function commandPalette() {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: 'Paleta de comandos',
      description: 'Busca tenants, usuarios o ejecuta acciones rápidas.',
      fields: [{
        name: 'q', label: 'Comando o búsqueda', type: 'text',
        placeholder: 'tenant:donchucho · user:admin@x.com · action:deploy', required: true
      }],
      submitText: 'Ejecutar'
    });
    if (!values) return;
    var q = String(values.q || '').trim();
    if (q.indexOf('action:deploy') === 0) { triggerDeploy(); return; }
    if (q.indexOf('action:export') === 0) { exportDashboard(document.querySelector('[data-action="export-dashboard"]')); return; }
    if (q.indexOf('action:new-tenant') === 0 || q === 'new tenant') {
      newTenant(document.querySelector('[data-action="new-tenant"]')); return;
    }
    // Default: redirect to tenants search
    V.toast('Buscando: "' + q + '"…', 'info');
    var res = await V.api('GET', '/api/owner/tenants?search=' + encodeURIComponent(q));
    if (res.ok && Array.isArray(res.data) && res.data.length) {
      V.toast(res.data.length + ' resultado(s) encontrado(s) para "' + q + '"', 'success');
    } else {
      V.toast('Sin resultados para "' + q + '"', 'warn');
    }
  }

  // Notifications drawer
  async function openNotifications(btn) {
    var V = VA(); if (!V) return;
    V.lockButton(btn, '');
    var res = await V.api('GET', '/api/notifications?limit=20');
    V.unlockButton(btn);
    var items = (res.ok && res.data && (res.data.items || res.data)) || [];
    var body = '';
    if (!Array.isArray(items) || !items.length) {
      body = '<p style="padding:20px;text-align:center;color:#888">No hay notificaciones recientes.</p>';
    } else {
      body = '<div style="max-height:60vh;overflow-y:auto">' + items.map(function (n) {
        var ts = n.created_at || n.ts || '';
        return '<div style="padding:10px;border-bottom:1px solid #ddd">' +
          '<b>' + (n.title || n.type || 'Evento') + '</b>' +
          '<div style="color:#666;font-size:12px">' + (n.message || n.body || '') + '</div>' +
          '<div style="color:#999;font-size:11px;margin-top:4px">' + ts + '</div>' +
          '</div>';
      }).join('') + '</div>';
    }
    if (window.VolvixUI && window.VolvixUI.modal) {
      window.VolvixUI.modal({ title: '🔔 Notificaciones', body: body, size: 'md', dismissable: true });
    } else {
      alert(items.length + ' notificación(es). Detalle en consola.');
      console.log('[notifications]', items);
    }
    // mark as read (best-effort)
    V.api('POST', '/api/notifications/mark-read', {}).catch(function () {});
    var dot = btn.querySelector('.dot'); if (dot) dot.style.display = 'none';
  }

  // Theme toggle
  function toggleTheme(btn) {
    var V = VA();
    var html = document.documentElement;
    var current = html.getAttribute('data-vlx-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-vlx-theme', next);
    btn.textContent = next === 'dark' ? '🌙' : '☀️';
    try { localStorage.setItem('volvix_theme', next); } catch (e) {}
    if (V) V.toast('Tema: ' + (next === 'dark' ? 'oscuro' : 'claro'), 'info');
  }

  // Chart mode (MRR / ARR / Net New)
  function chartMode(btn) {
    var mode = btn.getAttribute('data-mode');
    var group = btn.closest('[data-group="mrr-mode"]');
    if (group) {
      group.querySelectorAll('[data-action="chart-mode"]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    var V = VA();
    if (V) V.toast('Modo: ' + mode.toUpperCase() + '. Recargando serie…', 'info');
    // Trigger chart reload via custom event so the existing loader can pick it up
    document.dispatchEvent(new CustomEvent('volvix:chart-mode', { detail: { mode: mode } }));
  }

  // New deploy (CI/CD)
  async function newDeploy(btn) {
    triggerDeploy(btn);
  }
  async function triggerDeploy(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: '🚀 Trigger Deploy',
      description: 'Lanzar pipeline de CI/CD. Confirma el destino y rama.',
      fields: [
        { name: 'env', label: 'Entorno destino', type: 'select', required: true,
          options: [
            { value: 'staging',    label: 'Staging' },
            { value: 'production', label: 'Producción ⚠️' }
          ], default: 'staging' },
        { name: 'branch', label: 'Rama / commit', type: 'text', required: true, default: 'main',
          validate: function (v) { return (v||'').trim() ? null : 'Requerido'; } },
        { name: 'note', label: 'Nota del release (opcional)', type: 'textarea', required: false }
      ],
      submitText: 'Lanzar deploy'
    });
    if (!values) return;
    if (values.env === 'production') {
      var ok = await V.confirmDestructive({
        title: '¿Deploy a producción?',
        message: 'Vas a desplegar la rama "' + values.branch + '" a producción. Esta acción afecta a TODOS los tenants.',
        confirmText: 'Sí, deploy a prod',
        confirmWord: 'DEPLOY'
      });
      if (!ok) return;
    }
    if (btn) V.lockButton(btn, 'Lanzando…');
    var res = await V.api('POST', '/api/admin/deploys', values);
    if (btn) V.unlockButton(btn);
    if (res.ok) {
      V.toast('Deploy lanzado: ' + values.branch + ' → ' + values.env + '. Pipeline corriendo.', 'success');
    } else {
      V.toast('Falló el trigger: ' + res.error, 'error');
    }
  }

  // Filter tenants table
  async function filterTenants(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
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
            { value: 'inactive', label: 'Inactivos' },
            { value: 'suspended', label: 'Suspendidos' }
          ] },
        { name: 'region', label: 'Región', type: 'select',
          options: [
            { value: '', label: 'Todas' },
            { value: 'us-east', label: 'US-East' },
            { value: 'us-west', label: 'US-West' },
            { value: 'eu-west', label: 'EU-West' },
            { value: 'latam', label: 'LatAm' },
            { value: 'apac', label: 'APAC' }
          ] },
        { name: 'min_mrr', label: 'MRR mínimo (USD)', type: 'number',
          validate: function (v) { return (v === '' || v == null || Number(v) >= 0) ? null : 'Debe ser ≥ 0'; } }
      ],
      submitText: 'Aplicar filtros'
    });
    if (!values) return;
    var rows = document.querySelectorAll('#adm-tenants-tbody tr');
    var visible = 0;
    rows.forEach(function (tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 6) return;
      var planText = tds[1].textContent.toLowerCase();
      var statusText = tds[4].textContent.toLowerCase();
      var regionText = tds[5].textContent.toLowerCase();
      var mrrText = tds[3].textContent.replace(/[^0-9.]/g, '');
      var ok = true;
      if (values.plan && planText.indexOf(values.plan.toLowerCase()) < 0) ok = false;
      if (values.status === 'active' && statusText.indexOf('activo') < 0) ok = false;
      if (values.status === 'inactive' && statusText.indexOf('inactivo') < 0) ok = false;
      if (values.region && regionText.indexOf(values.region.split('-')[0]) < 0) ok = false;
      if (values.min_mrr && Number(mrrText || 0) < Number(values.min_mrr)) ok = false;
      tr.style.display = ok ? '' : 'none';
      if (ok) visible++;
    });
    V.toast('Filtros aplicados: ' + visible + ' tenant(s) visible(s)', 'success');
  }

  function viewAllTenants() {
    location.href = '/volvix_owner_panel_v7.html#tenants';
  }
  function openBilling() {
    location.href = '/volvix_owner_panel_v7.html#billing';
  }

  // Edit plans
  async function editPlans(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: 'Editar planes y precios',
      description: 'Cambios afectan a NUEVAS suscripciones únicamente.',
      fields: [
        { name: 'starter_price', label: 'Starter (USD/mes)', type: 'number', required: true, default: 29,
          validate: function (v) { return Number(v) > 0 ? null : 'Debe ser > 0'; } },
        { name: 'pro_price', label: 'Pro (USD/mes)', type: 'number', required: true, default: 99,
          validate: function (v) { return Number(v) > 0 ? null : 'Debe ser > 0'; } },
        { name: 'business_price', label: 'Business (USD/mes)', type: 'number', required: true, default: 299,
          validate: function (v) { return Number(v) > 0 ? null : 'Debe ser > 0'; } },
        { name: 'trial_days', label: 'Días de trial', type: 'number', required: true, default: 14,
          validate: function (v) { var n = Number(v); return (n >= 0 && n <= 90) ? null : '0–90 días'; } }
      ],
      submitText: 'Guardar planes'
    });
    if (!values) return;
    V.lockButton(btn, 'Guardando…');
    var res = await V.api('PATCH', '/api/billing/plans', values);
    V.unlockButton(btn);
    if (res.ok) V.toast('Planes actualizados ✓', 'success');
    else V.toast('Error: ' + res.error, 'error');
  }

  // New feature flag
  async function newFlag(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: '+ Nueva feature flag',
      fields: [
        { name: 'key', label: 'Clave', type: 'text', required: true, placeholder: 'kebab-case-key',
          validate: function (v) { return /^[a-z][a-z0-9-]{2,40}$/.test(v||'') ? null : 'kebab-case 3-41 chars'; } },
        { name: 'description', label: 'Descripción', type: 'textarea', required: true },
        { name: 'rollout', label: 'Rollout (%)', type: 'number', required: true, default: 0,
          validate: function (v) { var n = Number(v); return (n >= 0 && n <= 100) ? null : '0–100'; } },
        { name: 'scope', label: 'Alcance', type: 'select', required: true,
          options: [
            { value: 'all',         label: 'Todos los tenants' },
            { value: 'enterprise',  label: 'Solo Enterprise' },
            { value: 'staging',     label: 'Solo staging' },
            { value: 'canary',      label: 'Canary (5 tenants)' }
          ], default: 'all' },
        { name: 'enabled', label: 'Activa al crear', type: 'switch', default: false }
      ],
      submitText: 'Crear flag'
    });
    if (!values) return;
    V.lockButton(btn, 'Creando…');
    var res = await V.api('POST', '/api/admin/feature-flags', values);
    V.unlockButton(btn);
    if (res.ok) {
      V.toast('Flag "' + values.key + '" creada', 'success');
      setTimeout(function () { location.reload(); }, 800);
    } else {
      V.toast('Error: ' + res.error, 'error');
    }
  }

  // Bulk email
  async function bulkEmail(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: '📨 Email masivo a admins',
      description: 'Será enviado a todos los administradores de cada tenant.',
      fields: [
        { name: 'subject', label: 'Asunto', type: 'text', required: true,
          validate: function (v) { return (v||'').trim().length >= 5 ? null : 'Mínimo 5 caracteres'; } },
        { name: 'body', label: 'Cuerpo del mensaje (HTML/markdown)', type: 'textarea', required: true,
          validate: function (v) { return (v||'').trim().length >= 20 ? null : 'Mínimo 20 caracteres'; } },
        { name: 'audience', label: 'Audiencia', type: 'select', required: true,
          options: [
            { value: 'all_admins',     label: 'Todos los admins (847)' },
            { value: 'enterprise',     label: 'Solo Enterprise (102)' },
            { value: 'business_pro',   label: 'Business + Pro (364)' },
            { value: 'trial',          label: 'Solo Trial (88)' }
          ], default: 'all_admins' }
      ],
      submitText: 'Enviar campaña'
    });
    if (!values) return;
    var ok = await V.confirmAction({
      title: 'Confirmar envío',
      message: 'Vas a enviar "' + values.subject + '" a la audiencia "' + values.audience + '". ¿Continuar?',
      confirmText: 'Enviar ahora'
    });
    if (!ok) return;
    V.lockButton(btn, 'Enviando…');
    var res = await V.api('POST', '/api/admin/email-campaigns', values);
    V.unlockButton(btn);
    if (res.ok) V.toast('Campaña en cola. Recipients: ' + (res.data && res.data.recipients || '—'), 'success');
    else V.toast('Error: ' + res.error, 'error');
  }

  // Apply credit
  async function applyCredit(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: '💸 Aplicar crédito a tenant',
      fields: [
        { name: 'tenant_id', label: 'Tenant ID o subdominio', type: 'text', required: true },
        { name: 'amount', label: 'Monto (USD)', type: 'number', required: true,
          validate: function (v) { return Number(v) > 0 ? null : 'Debe ser > 0'; } },
        { name: 'reason', label: 'Motivo (interno)', type: 'select', required: true,
          options: [
            { value: 'goodwill',     label: 'Good-will / Soporte' },
            { value: 'sla_breach',   label: 'SLA breach' },
            { value: 'billing_error',label: 'Error de facturación' },
            { value: 'promo',        label: 'Promoción' }
          ] },
        { name: 'note', label: 'Nota visible al cliente', type: 'textarea', required: false }
      ],
      submitText: 'Aplicar crédito'
    });
    if (!values) return;
    V.lockButton(btn, 'Aplicando…');
    var res = await V.api('POST', '/api/billing/credits', values);
    V.unlockButton(btn);
    if (res.ok) V.toast('Crédito de $' + values.amount + ' aplicado a ' + values.tenant_id, 'success');
    else V.toast('Error: ' + res.error, 'error');
  }

  // Restart workers
  async function restartWorkers(btn) {
    var V = VA(); if (!V) return;
    var ok = await V.confirmDestructive({
      title: 'Reiniciar workers',
      message: 'Los workers de la cola se reiniciarán. Trabajos en curso se reintentan. ¿Continuar?',
      confirmText: 'Sí, reiniciar'
    });
    if (!ok) return;
    V.lockButton(btn, 'Reiniciando…');
    var res = await V.api('POST', '/api/admin/workers/restart', { confirm: true });
    V.unlockButton(btn);
    if (res.ok) V.toast('Workers reiniciados. ' + (res.data && res.data.count || 0) + ' instancias.', 'success');
    else V.toast('Error: ' + res.error, 'error');
  }

  // Generate executive report
  async function generateReport(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: '📊 Generar reporte ejecutivo',
      fields: [
        { name: 'period', label: 'Periodo', type: 'select', required: true,
          options: [
            { value: 'last_month',   label: 'Mes pasado' },
            { value: 'this_quarter', label: 'Este trimestre' },
            { value: 'ytd',          label: 'Año en curso' },
            { value: 'last_year',    label: 'Año anterior' }
          ], default: 'last_month' },
        { name: 'format', label: 'Formato', type: 'select', required: true,
          options: [
            { value: 'pdf', label: 'PDF (presentación)' },
            { value: 'csv', label: 'CSV (datos crudos)' },
            { value: 'xlsx', label: 'Excel' }
          ], default: 'pdf' }
      ],
      submitText: 'Generar'
    });
    if (!values) return;
    V.lockButton(btn, 'Generando…');
    var res = await V.api('POST', '/api/admin/reports/executive', values);
    V.unlockButton(btn);
    if (res.ok) {
      var url = res.data && (res.data.url || res.data.download_url);
      if (url) {
        V.toast('Reporte listo. Descargando…', 'success');
        var a = document.createElement('a'); a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
      } else {
        V.toast('Reporte en cola — recibirás un email al terminar', 'info');
      }
    } else {
      V.toast('Error: ' + res.error, 'error');
    }
  }

  // Maintenance mode
  async function maintenanceMode(btn) {
    var V = VA(); if (!V) return;
    var values = await V.openFormModal({
      title: '🛟 Modo mantenimiento',
      description: 'Activa un banner global y opcionalmente bloquea el acceso a la app.',
      fields: [
        { name: 'enabled', label: 'Activar mantenimiento', type: 'switch', default: true },
        { name: 'message', label: 'Mensaje al usuario', type: 'textarea', required: true,
          default: 'Estamos haciendo mejoras. Volveremos en breve.',
          validate: function (v) { return (v||'').trim().length >= 10 ? null : 'Mínimo 10 caracteres'; } },
        { name: 'block', label: 'Bloquear acceso (no solo banner)', type: 'switch', default: false },
        { name: 'eta_minutes', label: 'ETA (minutos, opcional)', type: 'number',
          validate: function (v) { return (v === '' || v == null || Number(v) >= 0) ? null : 'Debe ser ≥ 0'; } }
      ],
      submitText: 'Aplicar'
    });
    if (!values) return;
    if (values.block) {
      var ok = await V.confirmDestructive({
        title: '¿Bloquear acceso a la app?',
        message: 'Todos los tenants verán pantalla de mantenimiento. ¿Continuar?',
        confirmWord: 'BLOCK'
      });
      if (!ok) return;
    }
    V.lockButton(btn, 'Aplicando…');
    var res = await V.api('POST', '/api/admin/maintenance', values);
    V.unlockButton(btn);
    if (res.ok) V.toast('Modo mantenimiento ' + (values.enabled ? 'ACTIVO' : 'desactivado'), 'success');
    else V.toast('Error: ' + res.error, 'error');
  }

  // Kill switch (emergency P0)
  async function killSwitch(btn) {
    var V = VA(); if (!V) return;
    var ok = await V.confirmDestructive({
      title: '🚨 Kill switch (P0)',
      message: 'Apaga TODOS los servicios non-critical en EMERGENCIA. Solo auth + payments siguen vivos. Acción reversible solo por escalamiento.',
      confirmText: 'KILL ALL',
      confirmWord: 'KILL'
    });
    if (!ok) return;
    var values = await V.openFormModal({
      title: 'Razón del kill switch',
      fields: [
        { name: 'reason', label: 'Motivo (irá al runbook)', type: 'textarea', required: true,
          validate: function (v) { return (v||'').trim().length >= 20 ? null : 'Mínimo 20 caracteres'; } },
        { name: 'pager', label: 'Notificar on-call', type: 'switch', default: true }
      ],
      submitText: 'Activar kill switch'
    });
    if (!values) return;
    V.lockButton(btn, 'EJECUTANDO…');
    var res = await V.api('POST', '/api/admin/kill-switch', values);
    V.unlockButton(btn);
    if (res.ok) V.toast('🚨 Kill switch ACTIVO. On-call notificado.', 'error');
    else V.toast('Error crítico: ' + res.error + ' — escalando manualmente', 'error');
  }

  // ---------- ROUTER ----------
  var ACTIONS = {
    'export-dashboard': exportDashboard,
    'period-picker':    periodPicker,
    'new-tenant':       newTenant,
    'command-palette':  commandPalette,
    'open-notifications': openNotifications,
    'toggle-theme':     toggleTheme,
    'chart-mode':       chartMode,
    'new-deploy':       newDeploy,
    'filter-tenants':   filterTenants,
    'view-all-tenants': viewAllTenants,
    'open-billing':     openBilling,
    'edit-plans':       editPlans,
    'new-flag':         newFlag,
    'bulk-email':       bulkEmail,
    'apply-credit':     applyCredit,
    'trigger-deploy':   triggerDeploy,
    'restart-workers':  restartWorkers,
    'generate-report':  generateReport,
    'maintenance-mode': maintenanceMode,
    'kill-switch':      killSwitch
  };

  ready(function () {
    // Restore saved theme
    try {
      var saved = localStorage.getItem('volvix_theme');
      if (saved) document.documentElement.setAttribute('data-vlx-theme', saved);
    } catch (e) {}

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      // Skip if any other handler already took it (rare with capture)
      var name = btn.getAttribute('data-action');
      var fn = ACTIONS[name];
      if (!fn) return;
      e.preventDefault();
      try { fn(btn); } catch (err) {
        if (window.VolvixAdmin) window.VolvixAdmin.toast('Error: ' + err.message, 'error');
        console.error('[admin-saas-actions]', name, err);
      }
    }, false);

    // Keyboard shortcut: Ctrl/Cmd + K opens command palette
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        commandPalette();
      }
    });
  });
})();
