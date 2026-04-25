/* ============================================================
   VOLVIX · Sync Status Widget
   ============================================================
   Widget flotante esquina inferior-derecha que muestra:
   - Punto de color: verde (online) / rojo (offline) / ámbar (syncing)
   - Contador de operaciones pendientes
   - Panel desplegable con detalle
   - Botón manual "Sincronizar ahora"

   Se auto-inyecta al cargar. No requiere HTML adicional.
   Depende de: volvix-api.js + volvix-sync.js (en ese orden)

   Uso:
     <script src="/volvix-api.js"></script>
     <script src="/volvix-sync.js"></script>
     <script src="/volvix-sync-widget.js"></script>
============================================================ */
(function () {
  'use strict';

  // =========================================================
  // CSS (inyectado en <head> una sola vez)
  // =========================================================
  const CSS = `
    .vlx-widget {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 9998;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      background: rgba(18, 18, 18, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #fff;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.10);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      font: 500 12px/1 'Inter', -apple-system, system-ui, sans-serif;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .vlx-widget:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
    }
    .vlx-widget:active {
      transform: translateY(0);
    }
    .vlx-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background 0.3s;
    }
    .vlx-dot.online  { background: #22C55E; box-shadow: 0 0 6px rgba(34,197,94,0.7); }
    .vlx-dot.offline { background: #EF4444; box-shadow: 0 0 6px rgba(239,68,68,0.7); }
    .vlx-dot.syncing {
      background: #FBBF24;
      box-shadow: 0 0 6px rgba(251,191,36,0.7);
      animation: vlx-pulse 0.9s ease-in-out infinite;
    }
    @keyframes vlx-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    .vlx-label {
      font-size: 11.5px;
      white-space: nowrap;
      color: #E5E7EB;
    }
    .vlx-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: #EA580C;
      color: #fff;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
    }

    /* ── Panel desplegable ── */
    .vlx-panel {
      position: fixed;
      bottom: 54px;
      right: 14px;
      z-index: 9997;
      width: 260px;
      background: #121212;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 14px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
      font: 13px/1.5 'Inter', -apple-system, system-ui, sans-serif;
      color: #E5E7EB;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .vlx-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .vlx-panel-head {
      padding: 12px 14px 8px;
      font-size: 11px;
      font-weight: 700;
      color: #9CA3AF;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .vlx-panel-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 14px;
      font-size: 12.5px;
    }
    .vlx-panel-row + .vlx-panel-row {
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .vlx-panel-label {
      color: #9CA3AF;
    }
    .vlx-panel-val {
      font-weight: 600;
      color: #F9FAFB;
    }
    .vlx-panel-val.green  { color: #22C55E; }
    .vlx-panel-val.red    { color: #EF4444; }
    .vlx-panel-val.amber  { color: #FBBF24; }
    .vlx-panel-footer {
      padding: 10px 14px;
      border-top: 1px solid rgba(255,255,255,0.07);
      display: flex;
      gap: 8px;
    }
    .vlx-panel-btn {
      flex: 1;
      padding: 8px;
      border: none;
      border-radius: 8px;
      font: 600 12px/1 'Inter', system-ui, sans-serif;
      cursor: pointer;
      transition: opacity 0.15s, filter 0.15s;
    }
    .vlx-panel-btn:hover  { filter: brightness(1.1); }
    .vlx-panel-btn:active { filter: brightness(0.9); }
    .vlx-panel-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      filter: none;
    }
    .vlx-btn-sync {
      background: #FBBF24;
      color: #000;
    }
    .vlx-btn-clear {
      background: rgba(255,255,255,0.08);
      color: #D1D5DB;
    }

    /* ── Ocultar en impresión ── */
    @media print {
      .vlx-widget, .vlx-panel { display: none !important; }
    }
  `;

  // =========================================================
  // HTML DEL WIDGET Y EL PANEL
  // =========================================================
  const WIDGET_HTML = `
    <div class="vlx-dot online" id="vlxDot"></div>
    <span class="vlx-label" id="vlxLabel">Online</span>
  `;

  const PANEL_HTML = `
    <div class="vlx-panel-head">Sincronización · Volvix</div>
    <div class="vlx-panel-row">
      <span class="vlx-panel-label">Conexión</span>
      <span class="vlx-panel-val" id="vlxPConn">—</span>
    </div>
    <div class="vlx-panel-row">
      <span class="vlx-panel-label">Pendientes</span>
      <span class="vlx-panel-val" id="vlxPPending">—</span>
    </div>
    <div class="vlx-panel-row">
      <span class="vlx-panel-label">Última sync</span>
      <span class="vlx-panel-val" id="vlxPLast">—</span>
    </div>
    <div class="vlx-panel-row">
      <span class="vlx-panel-label">Estado</span>
      <span class="vlx-panel-val" id="vlxPState">—</span>
    </div>
    <div class="vlx-panel-footer">
      <button class="vlx-panel-btn vlx-btn-sync" id="vlxBtnSync">↻ Sincronizar</button>
      <button class="vlx-panel-btn vlx-btn-clear" id="vlxBtnClear">Limpiar</button>
    </div>
  `;

  // =========================================================
  // HELPERS
  // =========================================================
  function fmtTime(ts) {
    if (!ts) return 'Nunca';
    const d = new Date(ts);
    const tz = window.VOLVIX_REGION?.timezone || 'America/Monterrey';
    const locale = window.VOLVIX_REGION?.locale || 'es-MX';
    return d.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // =========================================================
  // INICIALIZACIÓN
  // =========================================================
  function init() {
    const sync = window.volvix?.sync;
    if (!sync) {
      setTimeout(init, 80);
      return;
    }

    // Inyectar CSS
    if (!document.getElementById('vlx-widget-css')) {
      const style = document.createElement('style');
      style.id = 'vlx-widget-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // Crear widget
    let widget = document.getElementById('vlx-widget');
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'vlx-widget';
      widget.className = 'vlx-widget';
      widget.setAttribute('aria-label', 'Estado de sincronización');
      widget.setAttribute('role', 'status');
      widget.innerHTML = WIDGET_HTML;
      document.body.appendChild(widget);
    }

    // Crear panel
    let panel = document.getElementById('vlx-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'vlx-panel';
      panel.className = 'vlx-panel';
      panel.innerHTML = PANEL_HTML;
      document.body.appendChild(panel);
    }

    // ── Referencias a elementos ──
    const dot    = document.getElementById('vlxDot');
    const label  = document.getElementById('vlxLabel');
    const pConn  = document.getElementById('vlxPConn');
    const pPend  = document.getElementById('vlxPPending');
    const pLast  = document.getElementById('vlxPLast');
    const pState = document.getElementById('vlxPState');
    const btnSync  = document.getElementById('vlxBtnSync');
    const btnClear = document.getElementById('vlxBtnClear');

    // ── Toggle panel ──
    let panelOpen = false;
    function togglePanel() {
      panelOpen = !panelOpen;
      if (panelOpen) {
        panel.classList.add('open');
        refreshPanel();
      } else {
        panel.classList.remove('open');
      }
    }
    widget.addEventListener('click', togglePanel);

    // Cerrar panel si click fuera
    document.addEventListener('click', (e) => {
      if (panelOpen && !widget.contains(e.target) && !panel.contains(e.target)) {
        panelOpen = false;
        panel.classList.remove('open');
      }
    });

    // ── Botón sincronizar ──
    btnSync.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btnSync.disabled) return;
      btnSync.disabled = true;
      btnSync.textContent = '↻ Sincronizando...';
      try {
        await sync.syncNow();
      } finally {
        btnSync.disabled = false;
        btnSync.textContent = '↻ Sincronizar';
        refreshPanel();
      }
    });

    // ── Botón limpiar (con confirmación) ──
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      const pending = sync.pendingCount();
      const msg = pending > 0
        ? `¿Limpiar cola? Perderás ${pending} operación(es) pendiente(s) sin sincronizar.`
        : '¿Limpiar datos locales de sincronización?';
      if (confirm(msg)) {
        sync.clear();
        refreshWidget();
        refreshPanel();
      }
    });

    // ── Render del widget (pill) ──
    function refreshWidget() {
      const stats = sync.stats();
      const pending = stats.pending;

      // Dot
      dot.className = 'vlx-dot';
      if (stats.syncing) {
        dot.classList.add('syncing');
      } else if (stats.online) {
        dot.classList.add('online');
      } else {
        dot.classList.add('offline');
      }

      // Label + badge
      let labelHTML;
      if (stats.syncing) {
        labelHTML = 'Sincronizando'
          + (pending > 0 ? ` <span class="vlx-badge">${pending}</span>` : '');
      } else if (!stats.online) {
        labelHTML = 'Offline'
          + (pending > 0 ? ` <span class="vlx-badge">${pending}</span>` : '');
      } else if (pending > 0) {
        labelHTML = 'Pendientes <span class="vlx-badge">' + pending + '</span>';
      } else {
        labelHTML = 'Online';
      }
      label.innerHTML = labelHTML;
    }

    // ── Render del panel (detalle) ──
    function refreshPanel() {
      if (!panelOpen) return;
      const stats = sync.stats();

      // Conexión
      if (stats.online) {
        pConn.textContent = '✓ Online';
        pConn.className = 'vlx-panel-val green';
      } else {
        pConn.textContent = '✗ Offline';
        pConn.className = 'vlx-panel-val red';
      }

      // Pendientes
      pPend.textContent = stats.pending;
      pPend.className = 'vlx-panel-val' + (stats.pending > 0 ? ' amber' : ' green');

      // Última sync
      pLast.textContent = fmtTime(stats.lastSync);
      pLast.className = 'vlx-panel-val';

      // Estado
      if (stats.syncing) {
        pState.textContent = 'Sincronizando';
        pState.className = 'vlx-panel-val amber';
      } else if (stats.online && stats.pending === 0) {
        pState.textContent = 'Al día ✓';
        pState.className = 'vlx-panel-val green';
      } else if (stats.online && stats.pending > 0) {
        pState.textContent = 'Esperando retry';
        pState.className = 'vlx-panel-val amber';
      } else {
        pState.textContent = 'Sin conexión';
        pState.className = 'vlx-panel-val red';
      }
    }

    // ── Suscribirse a eventos del sync engine ──
    sync.on('connection:change', () => { refreshWidget(); refreshPanel(); });
    sync.on('queue:added',       () => { refreshWidget(); refreshPanel(); });
    sync.on('sync:start',        () => { refreshWidget(); refreshPanel(); });
    sync.on('sync:end',          () => { refreshWidget(); refreshPanel(); });
    sync.on('op:synced',         () => { refreshWidget(); refreshPanel(); });

    // Refresco periódico (fallback por si algún evento se pierde)
    setInterval(() => { refreshWidget(); if (panelOpen) refreshPanel(); }, 5000);

    // Render inicial
    refreshWidget();
  }

  // =========================================================
  // ARRANCAR (esperar DOM + dependencias)
  // =========================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();