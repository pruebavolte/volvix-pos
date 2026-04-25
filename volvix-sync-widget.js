/* ============================================================
   VOLVIX · Sync Status Widget
   ============================================================
   Widget flotante esquina inferior-derecha que muestra:
   - Estado de conexión (verde = online / rojo = offline)
   - Cantidad de operaciones pendientes
   - Última sincronización
   - Botón para forzar sync

   Se auto-inyecta cuando se carga el script.
============================================================ */
(function () {
  'use strict';

  function init() {
    if (!window.volvix || !window.volvix.sync) {
      setTimeout(init, 100);
      return;
    }

    const css = `
      .vlx-sync-widget {
        position: fixed;
        bottom: 14px;
        right: 14px;
        z-index: 99999;
        font: 500 12px -apple-system, 'Segoe UI', system-ui, sans-serif;
        background: rgba(18,18,18,0.92);
        backdrop-filter: blur(12px);
        color: #fff;
        padding: 8px 12px;
        border-radius: 100px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.1);
        cursor: pointer;
        transition: all 0.2s;
        user-select: none;
      }
      .vlx-sync-widget:hover { transform: translateY(-1px); background: rgba(28,28,28,0.95); }
      .vlx-sync-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #22C55E;
        box-shadow: 0 0 8px #22C55E;
      }
      .vlx-sync-dot.offline { background: #EF4444; box-shadow: 0 0 8px #EF4444; }
      .vlx-sync-dot.syncing {
        background: #FBBF24;
        box-shadow: 0 0 8px #FBBF24;
        animation: vlx-pulse 1s ease-in-out infinite;
      }
      @keyframes vlx-pulse { 50% { opacity: 0.4; } }
      .vlx-sync-text { font-size: 11px; font-weight: 500; white-space: nowrap; }
      .vlx-sync-badge {
        background: #EA580C;
        color: #fff;
        padding: 1px 6px;
        border-radius: 100px;
        font-size: 10px;
        font-weight: 700;
      }
      .vlx-sync-panel {
        position: fixed;
        bottom: 54px;
        right: 14px;
        z-index: 99998;
        background: #121212;
        color: #fff;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.1);
        font: 13px -apple-system, 'Segoe UI', system-ui, sans-serif;
        min-width: 240px;
        display: none;
      }
      .vlx-sync-panel.open { display: block; animation: vlx-slide 0.2s ease; }
      @keyframes vlx-slide { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .vlx-sync-panel h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
      .vlx-sync-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: #A8A29E; }
      .vlx-sync-row strong { color: #fff; }
      .vlx-sync-btn {
        margin-top: 10px;
        width: 100%;
        padding: 8px;
        background: #FBBF24;
        color: #000;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
      }
      .vlx-sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const widget = document.createElement('div');
    widget.className = 'vlx-sync-widget';
    widget.innerHTML = `
      <div class="vlx-sync-dot" id="vlx-dot"></div>
      <div class="vlx-sync-text" id="vlx-text">Online</div>
    `;
    document.body.appendChild(widget);

    const panel = document.createElement('div');
    panel.className = 'vlx-sync-panel';
    panel.innerHTML = `
      <h4>Estado de sincronización</h4>
      <div class="vlx-sync-row"><span>Conexión:</span><strong id="vlx-p-conn">—</strong></div>
      <div class="vlx-sync-row"><span>Pendientes:</span><strong id="vlx-p-pending">—</strong></div>
      <div class="vlx-sync-row"><span>Última sync:</span><strong id="vlx-p-last">—</strong></div>
      <div class="vlx-sync-row"><span>Estado:</span><strong id="vlx-p-state">—</strong></div>
      <button class="vlx-sync-btn" id="vlx-p-btn">Sincronizar ahora</button>
    `;
    document.body.appendChild(panel);

    widget.addEventListener('click', () => {
      panel.classList.toggle('open');
      refreshPanel();
    });

    document.getElementById('vlx-p-btn').addEventListener('click', async () => {
      const btn = document.getElementById('vlx-p-btn');
      btn.disabled = true;
      btn.textContent = 'Sincronizando...';
      await window.volvix.sync.syncNow();
      btn.disabled = false;
      btn.textContent = 'Sincronizar ahora';
      refreshPanel();
    });

    function refreshWidget() {
      const stats = window.volvix.sync.stats();
      const dot = document.getElementById('vlx-dot');
      const text = document.getElementById('vlx-text');
      dot.className = 'vlx-sync-dot' + (stats.syncing ? ' syncing' : stats.online ? '' : ' offline');
      if (stats.syncing) {
        text.innerHTML = 'Sincronizando <span class="vlx-sync-badge">' + stats.pending + '</span>';
      } else if (!stats.online) {
        if (stats.pending > 0) {
          text.innerHTML = 'Offline <span class="vlx-sync-badge">' + stats.pending + '</span>';
        } else {
          text.textContent = 'Offline';
        }
      } else if (stats.pending > 0) {
        text.innerHTML = 'Pendientes <span class="vlx-sync-badge">' + stats.pending + '</span>';
      } else {
        text.textContent = 'Online';
      }
    }

    function refreshPanel() {
      const stats = window.volvix.sync.stats();
      document.getElementById('vlx-p-conn').textContent = stats.online ? '✓ Online' : '✗ Offline';
      document.getElementById('vlx-p-pending').textContent = stats.pending;
      document.getElementById('vlx-p-last').textContent = stats.lastSync
        ? new Date(stats.lastSync).toLocaleTimeString()
        : 'Nunca';
      document.getElementById('vlx-p-state').textContent = stats.syncing
        ? 'Sincronizando' : stats.online ? 'Listo' : 'Esperando conexión';
    }

    // Suscribirse a eventos del sync
    window.volvix.sync.on('connection:change', refreshWidget);
    window.volvix.sync.on('queue:added', refreshWidget);
    window.volvix.sync.on('sync:start', refreshWidget);
    window.volvix.sync.on('sync:end', refreshWidget);
    window.volvix.sync.on('op:synced', refreshWidget);

    // Primer render
    refreshWidget();
    setInterval(refreshWidget, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
