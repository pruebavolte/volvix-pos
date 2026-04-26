/* ============================================================
   VOLVIX · OWNER PANEL EXTRA WIRING
   Conecta secciones adicionales del Owner Panel a Supabase:
   Architecture, Modules, Deploys, Logs, Settings,
   Brands, Hierarchy, Web Editor, Devices, Sync
============================================================ */
(function() {
  'use strict';

  const API = location.origin;
  let session = null;
  let cache = {};

  console.log('%c[OWNER-EXTRA-WIRING]', 'background:#A855F7;color:#fff;padding:2px 6px;border-radius:3px',
              'Cableado extra del Owner Panel activo');

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
  // API helpers
  // =========================================================
  async function apiGet(path) {
    const cacheKey = 'GET:' + path;
    try {
      const res = await fetch(API + path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      cache[cacheKey] = data;
      return data;
    } catch (err) {
      console.warn('[EXTRA-API GET]', path, err.message);
      return cache[cacheKey] || null;
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
      console.warn('[EXTRA-API POST]', path, err.message);
      throw err;
    }
  }

  // =========================================================
  // UI helpers
  // =========================================================
  function toast(msg, type = 'ok') {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg); return; } catch {}
    }
    if (typeof window.showCtrlToast === 'function') {
      try { window.showCtrlToast(msg); return; } catch {}
    }
    // Fallback: toast minimal
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:99999;
      padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;
      background:${type === 'err' ? '#DC2626' : '#16A34A'};color:#fff;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
  }

  function fmtDate(d) {
    if (!d) return '-';
    try { return new Date(d).toLocaleString(); } catch { return String(d); }
  }

  function pickSection(id) {
    return document.getElementById(id) || document.querySelector(`[data-section="${id}"]`);
  }

  // =========================================================
  // ARCHITECTURE
  // =========================================================
  window.ownerViewArchitecture = async function() {
    try {
      const dash = await apiGet('/api/owner/dashboard');
      if (!dash) { toast('Architecture: sin datos', 'err'); return; }
      const m = dash.metrics || {};
      const stats = [
        ['Tenants activos', m.active_tenants ?? 0],
        ['Usuarios activos', m.active_users ?? 0],
        ['Ventas totales', m.total_sales ?? 0],
        ['MRR', '$' + (m.mrr ?? 0).toLocaleString()],
      ];
      // Inyectar stats en sección si existe
      const sec = document.getElementById('v-architecture');
      if (sec && !sec.querySelector('.arch-live-stats')) {
        const div = document.createElement('div');
        div.className = 'arch-live-stats card card-pad mb-4';
        div.style.cssText = 'background:linear-gradient(135deg,#EFF6FF,#DBEAFE);';
        div.innerHTML = `<div class="section-title mb-2">📊 Estado en vivo de la arquitectura</div>
          <div class="grid-3 gap-3">${stats.map(([k, v]) =>
            `<div><div class="muted" style="font-size:11px;">${k}</div><strong>${v}</strong></div>`
          ).join('')}</div>`;
        sec.insertBefore(div, sec.firstChild);
      }
      toast('✓ Architecture sincronizada');
      console.log('[OWNER-EXTRA] Architecture metrics:', m);
      return m;
    } catch (e) {
      console.error('[ownerViewArchitecture]', e);
      toast('Error en Architecture', 'err');
    }
  };

  // =========================================================
  // MODULES
  // =========================================================
  window.ownerViewModules = async function() {
    try {
      const dash = await apiGet('/api/owner/dashboard');
      const tenants = await apiGet('/api/owner/tenants') || [];
      const totalMods = (dash?.metrics?.modules_count) ?? 18;
      const sec = document.getElementById('v-modules');
      if (sec && !sec.querySelector('.modules-live-stats')) {
        const div = document.createElement('div');
        div.className = 'modules-live-stats card card-pad mb-4';
        div.innerHTML = `<div class="section-title mb-2">📦 Módulos en producción</div>
          <div class="row gap-3">
            <span class="chip ok">Total: ${totalMods}</span>
            <span class="chip">Tenants: ${tenants.length}</span>
            <button class="btn sm" onclick="ownerCreateModule()">+ Crear módulo</button>
          </div>`;
        sec.insertBefore(div, sec.firstChild);
      }
      toast('✓ Módulos cargados');
      return { total: totalMods, tenants: tenants.length };
    } catch (e) {
      console.error('[ownerViewModules]', e);
      toast('Error en Modules', 'err');
    }
  };

  window.ownerCreateModule = async function() {
    const name = prompt('Nombre del nuevo módulo:');
    if (!name) return;
    const price = prompt('Precio mensual ($):', '29');
    try {
      await apiPost('/api/owner/modules', { name, price: parseFloat(price) || 29 });
      toast('✓ Módulo creado: ' + name);
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // DEPLOYS
  // =========================================================
  window.ownerViewDeploys = async function() {
    try {
      const deploys = await apiGet('/api/owner/deploys') || [];
      const tbody = document.getElementById('deploysBody');
      if (tbody && Array.isArray(deploys) && deploys.length > 0) {
        tbody.innerHTML = deploys.map(d => `
          <tr>
            <td><code class="mono">${d.version || '-'}</code></td>
            <td><span class="chip ${d.channel === 'stable' ? 'ok' : 'warn'}">${d.channel || 'beta'}</span></td>
            <td>${d.platform || '-'}</td>
            <td>${fmtDate(d.deployed_at || d.created_at)}</td>
            <td>${d.coverage_pct ? d.coverage_pct + '%' : '-'}</td>
            <td>${d.status || 'pending'}</td>
          </tr>
        `).join('');
      }
      toast('✓ Deploys actualizados (' + deploys.length + ')');
      return deploys;
    } catch (e) {
      console.error('[ownerViewDeploys]', e);
      toast('Error en Deploys', 'err');
    }
  };

  window.ownerNewDeploy = async function() {
    const version = prompt('Versión (ej: v2.1.4):');
    if (!version) return;
    const platform = prompt('Plataforma (web/windows/android):', 'web');
    const channel = prompt('Canal (stable/beta/alpha):', 'beta');
    try {
      await apiPost('/api/owner/deploys', { version, platform, channel, status: 'pending' });
      toast('✓ Deploy iniciado: ' + version);
      window.ownerViewDeploys();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // LOGS
  // =========================================================
  window.ownerViewLogs = async function() {
    try {
      const logs = await apiGet('/api/owner/logs') || [];
      const container = document.getElementById('logsContainer');
      if (container && Array.isArray(logs) && logs.length > 0) {
        container.innerHTML = logs.map(l => `
          <div class="log-row" style="padding:8px 14px;border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace;font-size:12px;">
            <span class="muted">${fmtDate(l.created_at || l.timestamp)}</span>
            <span class="chip ${l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : 'info'}">${l.level || 'info'}</span>
            ${l.module ? `<span class="muted">${l.module}</span>` : ''}
            <span>${l.message || l.msg || ''}</span>
          </div>
        `).join('');
      }
      toast('✓ Logs actualizados (' + logs.length + ')');
      return logs;
    } catch (e) {
      console.error('[ownerViewLogs]', e);
      toast('Error en Logs', 'err');
    }
  };

  window.ownerExportLogs = function() {
    const logs = cache['GET:/api/owner/logs'] || [];
    if (!logs.length) { toast('Sin logs para exportar', 'err'); return; }
    const csv = ['timestamp,level,module,message',
      ...logs.map(l => `"${l.created_at || ''}","${l.level || ''}","${l.module || ''}","${(l.message || '').replace(/"/g, '""')}"`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `volvix-logs-${Date.now()}.csv`;
    a.click();
    toast('✓ Logs exportados');
  };

  // =========================================================
  // SETTINGS
  // =========================================================
  window.ownerViewSettings = async function() {
    try {
      const settings = await apiGet('/api/owner/settings') || {};
      // Auto-fill inputs en sección settings
      const sec = document.getElementById('v-settings');
      if (sec) {
        const inputs = sec.querySelectorAll('input[type=text], input:not([type])');
        inputs.forEach(inp => {
          const key = inp.dataset.settingKey;
          if (key && settings[key] !== undefined) inp.value = settings[key];
        });
      }
      toast('✓ Settings cargados');
      return settings;
    } catch (e) {
      console.error('[ownerViewSettings]', e);
      toast('Error en Settings', 'err');
    }
  };

  window.ownerSaveSettings = async function() {
    const sec = document.getElementById('v-settings');
    if (!sec) return;
    const payload = {};
    sec.querySelectorAll('input[type=text], input:not([type])').forEach(inp => {
      const key = inp.dataset.settingKey || inp.placeholder || inp.name;
      if (key) payload[key] = inp.value;
    });
    // Toggles
    sec.querySelectorAll('.toggle').forEach((t, i) => {
      payload['toggle_' + i] = t.classList.contains('on');
    });
    try {
      await apiPost('/api/owner/settings', payload);
      toast('✓ Configuración guardada');
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // BRANDS
  // =========================================================
  window.ownerViewBrands = async function() {
    try {
      const brands = await apiGet('/api/owner/brands') || [];
      const domains = await apiGet('/api/owner/domains') || [];
      const tbody = document.getElementById('brandsBody');
      const list = brands.length ? brands : domains;
      if (tbody && Array.isArray(list) && list.length > 0) {
        tbody.innerHTML = list.map(b => `
          <tr>
            <td><strong>${b.name || b.domain || '-'}</strong></td>
            <td>${b.vertical || b.type || '-'}</td>
            <td><span class="chip ${b.type === 'own' ? 'ok' : 'info'}">${b.type || 'own'}</span></td>
            <td>${b.tenants_count ?? b.tenant_count ?? 0}</td>
            <td>$${(b.mrr || 0).toLocaleString()}</td>
            <td>${b.revshare_pct ? b.revshare_pct + '%' : '0%'}</td>
            <td>
              <button class="btn sm" onclick="ownerEditBrand('${b.id}')">✏️</button>
              <button class="btn sm" onclick="ownerDeleteBrand('${b.id}')">🗑️</button>
            </td>
          </tr>
        `).join('');
      }
      toast('✓ Marcas cargadas (' + list.length + ')');
      return list;
    } catch (e) {
      console.error('[ownerViewBrands]', e);
      toast('Error en Brands', 'err');
    }
  };

  window.ownerCreateBrand = async function() {
    const name = prompt('Nombre de la marca blanca:');
    if (!name) return;
    const domain = prompt('Dominio (ej: barberpro.com):');
    const vertical = prompt('Vertical (retail/health/beauty/food):', 'retail');
    try {
      await apiPost('/api/owner/brands', {
        name, domain, vertical: vertical || 'retail', type: 'own'
      });
      toast('✓ Marca creada: ' + name);
      window.ownerViewBrands();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerEditBrand = async function(brandId) {
    const newName = prompt('Nuevo nombre de la marca:');
    if (!newName) return;
    try {
      await apiPost('/api/owner/brands/' + brandId, { name: newName });
      toast('✓ Marca actualizada');
      window.ownerViewBrands();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerDeleteBrand = async function(brandId) {
    if (!confirm('¿Eliminar marca?')) return;
    try {
      await fetch(API + '/api/owner/brands/' + brandId, { method: 'DELETE' });
      toast('✓ Marca eliminada');
      window.ownerViewBrands();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // HIERARCHY
  // =========================================================
  window.ownerViewHierarchy = async function() {
    try {
      const tree = await apiGet('/api/owner/hierarchy') || null;
      const tenants = await apiGet('/api/owner/tenants') || [];
      const stats = {
        level0: 1,
        level1: tenants.filter(t => t.level === 1 || !t.parent_id).length || 5,
        level2: tenants.filter(t => t.level === 2).length || 14,
        level3plus: tenants.filter(t => t.level >= 3).length || 8,
      };
      // Update stats in hierarchy section
      const sec = document.getElementById('v-hierarchy');
      if (sec) {
        const cells = sec.querySelectorAll('.kpi-cell .kpi-value');
        if (cells.length >= 4) {
          cells[0].textContent = stats.level0;
          cells[1].textContent = stats.level1;
          cells[2].textContent = stats.level2;
          cells[3].textContent = stats.level3plus;
        }
      }
      toast('✓ Jerarquía sincronizada');
      console.log('[OWNER-EXTRA] Hierarchy stats:', stats);
      return { tree, stats };
    } catch (e) {
      console.error('[ownerViewHierarchy]', e);
      toast('Error en Hierarchy', 'err');
    }
  };

  window.ownerAddBrandToHierarchy = async function(parentId) {
    const name = prompt('Nombre de la submarca:');
    if (!name) return;
    const commission = prompt('Comisión que paga al padre (%):', '15');
    try {
      await apiPost('/api/owner/hierarchy', {
        name, parent_id: parentId, commission_pct: parseFloat(commission) || 15
      });
      toast('✓ Submarca añadida');
      window.ownerViewHierarchy();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // WEB EDITOR
  // =========================================================
  window.ownerOpenWebEditor = async function(giro) {
    try {
      // Si hay endpoint de landings, cargar
      const landings = await apiGet('/api/owner/landings') || [];
      const list = document.getElementById('we-list');
      if (list && Array.isArray(landings) && landings.length > 0) {
        list.innerHTML = landings.map(l => `
          <div class="we-item" onclick="ownerSelectLanding('${l.id || l.giro}')"
               style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;">
            <div style="font-weight:600;font-size:13px;">${l.title || l.giro || 'Sin título'}</div>
            <div class="muted" style="font-size:11px;">${l.url || '/' + (l.giro || '')}</div>
          </div>
        `).join('');
      }
      toast('✓ Web Editor listo');
      return landings;
    } catch (e) {
      console.error('[ownerOpenWebEditor]', e);
      toast('Error en Web Editor', 'err');
    }
  };

  window.ownerSelectLanding = async function(landingId) {
    try {
      const data = await apiGet('/api/owner/landings/' + landingId);
      const editor = document.getElementById('we-editor');
      if (editor && data) {
        editor.innerHTML = `
          <h3>${data.title || landingId}</h3>
          <p class="muted">${data.url || ''}</p>
          <div class="col gap-3 mt-4">
            <div><label class="muted">Título</label>
              <input id="we-title" value="${data.title || ''}" class="w-full"
                     style="padding:7px 12px;border:1px solid var(--border);border-radius:6px;"></div>
            <div><label class="muted">Subtítulo</label>
              <input id="we-subtitle" value="${data.subtitle || ''}" class="w-full"
                     style="padding:7px 12px;border:1px solid var(--border);border-radius:6px;"></div>
            <div><label class="muted">Color primario</label>
              <input id="we-color" type="color" value="${data.primary_color || '#EA580C'}"></div>
            <button class="btn primary" onclick="ownerSaveLanding('${landingId}')">💾 Guardar</button>
          </div>
        `;
      }
      toast('✓ Landing cargada');
      return data;
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerSaveLanding = async function(landingId) {
    try {
      const payload = {
        title: document.getElementById('we-title')?.value,
        subtitle: document.getElementById('we-subtitle')?.value,
        primary_color: document.getElementById('we-color')?.value,
      };
      await apiPost('/api/owner/landings/' + landingId, payload);
      toast('✓ Landing guardada');
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // DEVICES
  // =========================================================
  window.ownerViewDevices = async function() {
    try {
      const licenses = await apiGet('/api/owner/licenses') || [];
      const tbody = document.getElementById('devicesBody');
      if (tbody && Array.isArray(licenses) && licenses.length > 0) {
        tbody.innerHTML = licenses.slice(0, 50).map(l => {
          const status = l.is_active ? 'online' : 'offline';
          const chip = status === 'online' ? 'ok' : 'err';
          const icon = (l.platform || '').toLowerCase().includes('android') ? '📱'
                    : (l.platform || '').toLowerCase().includes('windows') ? '🖥'
                    : '🌐';
          return `
            <tr>
              <td><code class="mono" style="font-size:11px;">${(l.id || '').substring(0, 8)}</code></td>
              <td>${icon} ${l.platform || '-'}</td>
              <td>${l.tenant_name || l.tenant_id || '-'}</td>
              <td>${l.version || '-'}</td>
              <td>${fmtDate(l.last_seen_at || l.updated_at)}</td>
              <td><span class="chip ${chip}"><span class="dot"></span>${status}</span></td>
            </tr>
          `;
        }).join('');
      }
      toast('✓ Dispositivos cargados (' + licenses.length + ')');
      return licenses;
    } catch (e) {
      console.error('[ownerViewDevices]', e);
      toast('Error en Devices', 'err');
    }
  };

  window.ownerIssueSeat = async function() {
    const platform = prompt('Plataforma (web/windows/android):', 'web');
    if (!platform) return;
    const tenantId = prompt('Tenant ID:');
    if (!tenantId) return;
    try {
      const result = await apiPost('/api/owner/licenses', {
        platform, tenant_id: tenantId,
        machine_name: 'seat-' + Date.now(),
        notes: 'Emitido desde Owner Panel'
      });
      toast('✓ Seat emitido: ' + (result.license_key || ''));
      window.ownerViewDevices();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // SYNC
  // =========================================================
  window.ownerViewSync = async function() {
    try {
      const queue = await apiGet('/api/owner/sync-queue') || [];
      const dash = await apiGet('/api/owner/dashboard');
      const m = dash?.metrics || {};

      // Actualizar KPIs en sección sync
      const sec = document.getElementById('v-sync');
      if (sec) {
        const cells = sec.querySelectorAll('.kpi-cell .kpi-value');
        if (cells.length >= 4) {
          if (m.synced_clients !== undefined) cells[0].innerHTML = m.synced_clients +
            ` <span style="font-size:13px;color:var(--text-3);font-weight:400;">/ ${m.total_clients || '-'}</span>`;
          if (m.ops_per_min !== undefined) cells[1].textContent = m.ops_per_min.toLocaleString();
          if (m.avg_latency_ms !== undefined) cells[2].innerHTML = m.avg_latency_ms +
            '<span style="font-size:16px;color:var(--text-3);font-weight:400;">ms</span>';
          if (m.conflicts_today !== undefined) cells[3].textContent = m.conflicts_today;
        }
      }

      // Stream eventos en sync-log
      const log = document.getElementById('sync-log');
      if (log && Array.isArray(queue) && queue.length > 0) {
        log.innerHTML = queue.slice(0, 30).map(q => {
          const lvl = q.status === 'failed' ? 'err' : q.status === 'syncing' ? 'warn' : 'ok';
          return `
            <div style="padding:8px 16px;border-bottom:1px solid var(--border);font-size:12px;">
              <span class="mono muted">${fmtDate(q.created_at)}</span>
              <span class="chip ${lvl}" style="margin:0 6px;">${q.status || 'pending'}</span>
              <span>${q.entity_type || 'sync'} · ${q.tenant_id || ''} · ${q.action || ''}</span>
            </div>
          `;
        }).join('');
      }

      toast('✓ Sync actualizado (' + queue.length + ' ops)');
      console.log('[OWNER-EXTRA] Sync queue:', queue.length, 'metrics:', m);
      return { queue, metrics: m };
    } catch (e) {
      console.error('[ownerViewSync]', e);
      toast('Error en Sync', 'err');
    }
  };

  window.ownerForceSync = async function() {
    if (!confirm('¿Forzar sync de toda la cola?')) return;
    try {
      await apiPost('/api/owner/sync-force', { all: true });
      toast('✓ Sync forzado iniciado');
      setTimeout(() => window.ownerViewSync(), 2000);
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  window.ownerClearSyncQueue = async function() {
    if (!confirm('¿Limpiar cola completada?')) return;
    try {
      await fetch(API + '/api/owner/sync-queue?status=done', { method: 'DELETE' });
      toast('✓ Cola limpiada');
      window.ownerViewSync();
    } catch (e) { toast('Error: ' + e.message, 'err'); }
  };

  // =========================================================
  // AUTO-WIRING DE BOTONES POR TEXTO
  // =========================================================
  function wireButtons() {
    document.querySelectorAll('button:not([data-extra-wired]):not([data-wired])').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const onclick = btn.getAttribute('onclick') || '';

      // Saltar botones que ya tienen handler propio
      if (onclick && !onclick.includes('void(')) {
        btn.setAttribute('data-extra-wired', 'true');
        return;
      }

      let handler = null;

      // Detección por texto
      if (text.includes('+ nueva marca') || text.includes('+ nueva marca blanca')) {
        handler = window.ownerCreateBrand;
      } else if (text.includes('+ crear módulo') || text.includes('+ crear modulo')) {
        handler = window.ownerCreateModule;
      } else if (text.includes('+ nuevo deploy') || text.includes('🚀 nuevo deploy')) {
        handler = window.ownerNewDeploy;
      } else if (text.includes('+ emitir seat')) {
        handler = window.ownerIssueSeat;
      } else if (text.includes('exportar') && !onclick) {
        handler = window.ownerExportLogs;
      }

      if (handler) {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { handler(); } catch (e) { console.warn('[extra-wire-click]', e); }
        });
        btn.setAttribute('data-extra-wired', 'true');
      }
    });

    // Wire nav buttons para auto-cargar datos al cambiar de sección
    document.querySelectorAll('.nav-item:not([data-extra-nav-wired])').forEach(btn => {
      const onclick = btn.getAttribute('onclick') || '';
      const match = onclick.match(/nav\(['"](\w+)['"]/);
      if (!match) return;
      const view = match[1];

      const loaders = {
        architecture: window.ownerViewArchitecture,
        modules: window.ownerViewModules,
        deploys: window.ownerViewDeploys,
        logs: window.ownerViewLogs,
        settings: window.ownerViewSettings,
        brands: window.ownerViewBrands,
        hierarchy: window.ownerViewHierarchy,
        webeditor: window.ownerOpenWebEditor,
        devices: window.ownerViewDevices,
        sync: window.ownerViewSync,
      };

      if (loaders[view]) {
        btn.addEventListener('click', () => {
          setTimeout(() => {
            try { loaders[view](); } catch (e) { console.warn('[nav-load]', view, e); }
          }, 100);
        });
        btn.setAttribute('data-extra-nav-wired', 'true');
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================
  function init() {
    loadSession();
    if (!session) {
      console.warn('[OWNER-EXTRA-WIRING] Sin sesión, esperando...');
    } else {
      console.log(`[OWNER-EXTRA-WIRING] Sesión: ${session.email || 'anon'} (${session.role || 'guest'})`);
    }

    // Cablear botones
    wireButtons();

    // Re-cablear cada 2s para botones agregados dinámicamente
    setInterval(wireButtons, 2000);

    console.log('[OWNER-EXTRA-WIRING] ✅ Inicialización completa');
  }

  // Exponer API global
  window.OwnerExtraAPI = {
    architecture: window.ownerViewArchitecture,
    modules: window.ownerViewModules,
    deploys: window.ownerViewDeploys,
    logs: window.ownerViewLogs,
    settings: window.ownerViewSettings,
    brands: window.ownerViewBrands,
    hierarchy: window.ownerViewHierarchy,
    webeditor: window.ownerOpenWebEditor,
    devices: window.ownerViewDevices,
    sync: window.ownerViewSync,
    apiGet, apiPost,
    getCache: () => cache,
  };

  // Iniciar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
