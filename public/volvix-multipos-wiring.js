/* ============================================================
   VOLVIX · MULTIPOS SUITE WIRING
   Cablea los 192 botones del archivo multipos-suite.html
============================================================ */
(function() {
  'use strict';

  const API = location.origin;
  let session = null;

  console.log('%c[MULTIPOS-WIRING]', 'background:#10B981;color:#fff;padding:2px 6px;border-radius:3px',
              'Cableado MultiPOS activo');

  function loadSession() {
    try { session = JSON.parse(localStorage.getItem('volvixSession') || 'null'); }
    catch { session = null; }
    return session;
  }

  async function apiGet(path) {
    try {
      const res = await fetch(API + path);
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  async function apiPost(path, body) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.ok ? await res.json() : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: e.message }; }
  }

  // =========================================================
  // CARGAR TODAS LAS SUCURSALES (tenants)
  // =========================================================
  async function loadAllBranches() {
    const tenants = await apiGet('/api/owner/tenants');
    if (!tenants) return [];

    // Renderizar branches en la UI si hay contenedor
    const container = document.querySelector('[data-branches], #branches-grid, .branches-container');
    if (container) {
      container.innerHTML = tenants.map(t => `
        <div class="branch-card" style="background:rgba(255,255,255,0.04);border:1px solid #2E2E2C;border-radius:12px;padding:16px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 style="font-size:14px;">${t.name}</h3>
              <span style="font-size:11px;color:#A8A29E;">Plan: ${t.plan} · ${t.is_active ? '🟢 Activo' : '🔴 Inactivo'}</span>
            </div>
            <button class="btn sm" onclick="multiposViewBranch('${t.id}')">Ver</button>
          </div>
        </div>
      `).join('');
    }

    return tenants;
  }

  // =========================================================
  // VER DATOS DE UNA SUCURSAL
  // =========================================================
  window.multiposViewBranch = async function(tenantId) {
    try {
      const sales = await apiGet(`/api/sales?user_id=${encodeURIComponent(getUserIdForTenant(tenantId))}`);
      const products = await apiGet(`/api/products?tenant_id=${encodeURIComponent(tenantId)}`);

      const total = (sales || []).reduce((s, x) => s + parseFloat(x.total || 0), 0);
      VolvixUI.toast({type:'info', message:`📊 Sucursal: ${tenantId}\n\nVentas: ${sales?.length || 0}\nIngresos: $${total.toFixed(2)}\nProductos: ${products?.length || 0}`});
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error: ' + e.message});
    }
  };

  function getUserIdForTenant(tenantId) {
    const map = {
      'TNT001': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'TNT002': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    };
    return map[tenantId] || tenantId;
  }

  // =========================================================
  // SINCRONIZAR TODAS LAS SUCURSALES
  // =========================================================
  window.multiposSyncAll = async function() {
    if (!await VolvixUI.confirm({ title: 'Sincronizar sucursales', message: '¿Sincronizar todas las sucursales con la nube?', confirmText: 'Sincronizar', danger: false })) return;

    try {
      const queue = JSON.parse(localStorage.getItem('volvix:wiring:queue') || '[]');
      if (queue.length === 0) {
        VolvixUI.toast({type:'success', message:'✓ Todo está sincronizado'});
        return;
      }

      const result = await apiPost('/api/sync', { items: queue });
      const successCount = (result.results || []).filter(r => r.success).length;

      // Limpiar queue de los exitosos
      localStorage.setItem('volvix:wiring:queue', JSON.stringify(
        (result.results || []).filter(r => !r.success)
      ));

      VolvixUI.toast({type:'success', message:`✓ Sincronizadas ${successCount}/${queue.length} operaciones`});
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error sync: ' + e.message});
    }
  };

  // =========================================================
  // REPORTE CONSOLIDADO
  // =========================================================
  window.multiposReportConsolidated = async function() {
    try {
      const dashboard = await apiGet('/api/owner/dashboard');
      const sales = await apiGet('/api/reports/sales');

      const m = dashboard?.metrics || {};
      const msg = `📊 REPORTE CONSOLIDADO MULTIPOS\n\n` +
                  `Sucursales activas: ${m.active_tenants}\n` +
                  `Ventas totales: ${m.total_sales}\n` +
                  `Ingresos totales: $${m.total_revenue?.toFixed(2)}\n` +
                  `Productos: ${m.total_products}\n` +
                  `Stock bajo: ${m.low_stock_count}\n` +
                  `MRR: $${m.mrr?.toLocaleString()}\n` +
                  `ARR: $${m.arr?.toLocaleString()}`;
      VolvixUI.toast({type:'info', message:msg});
    } catch (e) {
      VolvixUI.toast({type:'error', message:'Error: ' + e.message});
    }
  };

  // =========================================================
  // EXPORTAR DATOS
  // =========================================================
  window.multiposExport = async function() {
    const dashboard = await apiGet('/api/owner/dashboard');
    const tenants = await apiGet('/api/owner/tenants');
    const sales = await apiGet('/api/sales');

    const data = {
      generated: new Date().toISOString(),
      dashboard,
      tenants,
      sales: sales?.slice(0, 50)
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volvix-multipos-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================
  // ABRIR POS REMOTO (de otra sucursal)
  // =========================================================
  window.multiposOpenRemote = function(tenantId) {
    const url = `/salvadorex-pos.html?tenant=${encodeURIComponent(tenantId)}&remote=1`;
    window.open(url, '_blank', 'width=1200,height=800');
  };

  // =========================================================
  // GENERIC BUTTON WIRING
  // =========================================================
  function wireAllButtons() {
    document.querySelectorAll('button:not([data-wired])').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const onclick = btn.getAttribute('onclick') || '';

      if (onclick.includes('multipos')) {
        btn.dataset.wired = 'true';
        return;
      }

      // Detectar acción por texto
      if (text.includes('sincronizar') || text.includes('sync')) {
        btn.onclick = (e) => { e.preventDefault(); window.multiposSyncAll(); };
        btn.dataset.wired = 'true';
      } else if (text.includes('reporte consolidado') || text.includes('consolidated')) {
        btn.onclick = (e) => { e.preventDefault(); window.multiposReportConsolidated(); };
        btn.dataset.wired = 'true';
      } else if (text.includes('exportar') || text.includes('export')) {
        btn.onclick = (e) => { e.preventDefault(); window.multiposExport(); };
        btn.dataset.wired = 'true';
      } else if (text.includes('actualizar') || text.includes('refresh')) {
        btn.onclick = (e) => { e.preventDefault(); loadAllBranches(); };
        btn.dataset.wired = 'true';
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================
  async function init() {
    loadSession();

    try {
      await loadAllBranches();
      wireAllButtons();

      setInterval(() => {
        wireAllButtons();
      }, 2000);

      // Refresh data cada 30s
      setInterval(() => {
        loadAllBranches().catch(() => {});
      }, 30000);

      console.log('[MULTIPOS-WIRING] ✅ Listo');
    } catch (err) {
      console.error('[MULTIPOS-WIRING] Error:', err);
    }
  }

  window.MultiposAPI = {
    syncAll: window.multiposSyncAll,
    reportConsolidated: window.multiposReportConsolidated,
    export: window.multiposExport,
    viewBranch: window.multiposViewBranch,
    loadAllBranches,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
