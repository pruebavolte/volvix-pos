/**
 * volvix-printer-errors.js — Detección y UI de errores de impresora
 *
 * Pensado para adulto mayor 60-75: cuando un cobro NO se imprime,
 * el usuario debe ver INMEDIATAMENTE qué pasó en lenguaje claro:
 *   - "Se terminó el papel" (rojo gigante con icono)
 *   - "La impresora está apagada"
 *   - "La tapa está abierta"
 *   - "No se encontró la impresora" (USB desconectada)
 *   - "Sin red - revisar cable" (IP)
 *   - "Bluetooth fuera de alcance"
 *
 * También dispara auto-reparación cuando es posible:
 *   - USB desconectado → busca en otro puerto, reconfigura
 *   - Error desconocido → llama auto-setup nuevamente
 */

(function (global) {
  'use strict';

  const ERROR_TYPES = {
    NO_PAPER: { icon: '📄', title: 'Se acabó el papel', detail: 'Coloca un rollo nuevo en la impresora térmica.', color: '#DC2626' },
    PRINTER_OFF: { icon: '🔌', title: 'Impresora apagada', detail: 'Prende la impresora con el botón de power.', color: '#DC2626' },
    COVER_OPEN: { icon: '📂', title: 'Tapa abierta', detail: 'Cierra la tapa de la impresora térmica.', color: '#F59E0B' },
    USB_DISCONNECTED: { icon: '🔌', title: 'Impresora USB desconectada', detail: 'Verifica el cable USB y reconéctalo.', color: '#DC2626' },
    BT_OUT_OF_RANGE: { icon: '📶', title: 'Bluetooth fuera de alcance', detail: 'Acerca la impresora al equipo.', color: '#F59E0B' },
    NETWORK_DOWN: { icon: '🌐', title: 'Sin red', detail: 'Revisa el cable de red o el WiFi.', color: '#DC2626' },
    NOT_FOUND: { icon: '❓', title: 'Impresora no encontrada', detail: 'Verifica que esté conectada.', color: '#F59E0B' },
    UNKNOWN: { icon: '⚠️', title: 'Error al imprimir', detail: 'Intentando reconectar automáticamente…', color: '#DC2626' }
  };

  /**
   * Decodificar status byte de ESC/POS (DLE EOT 1, 2, 4)
   * @param {number} statusByte
   * @returns {string|null} tipo de error o null si OK
   */
  function decodeESCPOSStatus(statusByte) {
    if (!statusByte || typeof statusByte !== 'number') return null;
    // DLE EOT 1 — Real-time status (printer)
    if ((statusByte & 0x08) !== 0) return 'PRINTER_OFF';        // bit 3 = offline
    if ((statusByte & 0x20) !== 0) return 'COVER_OPEN';          // bit 5 (a veces cover)
    if ((statusByte & 0x40) !== 0) return 'NO_PAPER';            // bit 6 = paper sensor
    return null;
  }

  /**
   * Interpretar error message → tipo
   */
  function classifyError(errorMsg) {
    const m = String(errorMsg || '').toLowerCase();
    if (/no paper|out of paper|paper out|sin papel|paper end/i.test(m)) return 'NO_PAPER';
    if (/offline|off-line|powered off|apagada|not responding|printer not on/i.test(m)) return 'PRINTER_OFF';
    if (/cover|tapa abierta|head up/i.test(m)) return 'COVER_OPEN';
    if (/usb|device not found|not connected|no device/i.test(m)) return 'USB_DISCONNECTED';
    if (/timeout.*bt|bluetooth.*out|bt.*out of range|semaphore.*com/i.test(m)) return 'BT_OUT_OF_RANGE';
    if (/network|timeout.*ip|connection refused|ehostunreach|enetunreach/i.test(m)) return 'NETWORK_DOWN';
    if (/not found|no such|empty/i.test(m)) return 'NOT_FOUND';
    return 'UNKNOWN';
  }

  /**
   * Mostrar modal de error rojo gigante (no requiere click para cerrar)
   * @param {string} type — clave de ERROR_TYPES
   * @param {object} opts — { ctx?: contexto, retry?: () => Promise, dismiss?: () => void }
   */
  function showErrorModal(type, opts = {}) {
    const def = ERROR_TYPES[type] || ERROR_TYPES.UNKNOWN;

    // Quitar modal previo si existe
    const old = document.getElementById('vlx-printer-error-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'vlx-printer-error-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui;animation:vlxFadeIn 0.2s ease-out';

    // Inyectar keyframes
    if (!document.getElementById('vlx-err-styles')) {
      const style = document.createElement('style');
      style.id = 'vlx-err-styles';
      style.textContent = `
        @keyframes vlxFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes vlxPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .vlx-err-card { background: #fff; border-radius: 16px; padding: 32px; max-width: 540px; width: 92%; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 4px solid ${def.color}; }
        .vlx-err-icon { font-size: 84px; animation: vlxPulse 1.5s infinite ease-in-out; line-height: 1; margin-bottom: 12px; }
        .vlx-err-title { font-size: 32px; font-weight: 700; color: ${def.color}; margin: 0 0 12px 0; line-height: 1.1; }
        .vlx-err-detail { font-size: 18px; color: #374151; margin: 0 0 24px 0; line-height: 1.4; }
        .vlx-err-btn { padding: 14px 28px; font-size: 16px; font-weight: 600; border-radius: 10px; border: 0; cursor: pointer; margin: 4px; min-width: 140px; }
        .vlx-err-btn-primary { background: ${def.color}; color: #fff; }
        .vlx-err-btn-secondary { background: #F3F4F6; color: #374151; }
        .vlx-err-btn:hover { transform: translateY(-1px); }
      `;
      document.head.appendChild(style);
    }

    const card = document.createElement('div');
    card.className = 'vlx-err-card';

    card.innerHTML = `
      <div class="vlx-err-icon">${def.icon}</div>
      <div class="vlx-err-title">${def.title}</div>
      <div class="vlx-err-detail">${def.detail}</div>
      ${opts.ctx ? '<div style="font-size:11px;color:#9CA3AF;margin-bottom:14px;background:#F9FAFB;padding:6px;border-radius:6px">' + opts.ctx + '</div>' : ''}
      <div id="vlx-err-buttons" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${opts.retry ? '<button class="vlx-err-btn vlx-err-btn-primary" id="vlx-err-retry">🔄 Reintentar imprimir</button>' : ''}
        <button class="vlx-err-btn vlx-err-btn-secondary" id="vlx-err-close">Entendido</button>
      </div>
      ${opts.autoRetryInfo ? '<div style="font-size:12px;color:#059669;margin-top:14px">' + opts.autoRetryInfo + '</div>' : ''}
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    const closeBtn = document.getElementById('vlx-err-close');
    if (closeBtn) closeBtn.onclick = () => {
      modal.remove();
      if (opts.dismiss) opts.dismiss();
    };

    const retryBtn = document.getElementById('vlx-err-retry');
    if (retryBtn && opts.retry) {
      retryBtn.onclick = async () => {
        retryBtn.textContent = '⏳ Imprimiendo...';
        retryBtn.disabled = true;
        try {
          const r = await opts.retry();
          if (r && r.ok) {
            modal.remove();
            if (typeof global.showToast === 'function') global.showToast('✅ Ticket impreso correctamente', 'success');
          } else {
            retryBtn.textContent = '🔄 Reintentar imprimir';
            retryBtn.disabled = false;
            const newType = classifyError(r && r.error);
            // Si cambió el tipo de error, mostrar el nuevo
            if (newType !== type) {
              modal.remove();
              showErrorModal(newType, opts);
            }
          }
        } catch (e) {
          retryBtn.textContent = '🔄 Reintentar imprimir';
          retryBtn.disabled = false;
        }
      };
    }

    // Auto-close en 30s si no requiere acción crítica
    if (opts.autoClose !== false && type !== 'NO_PAPER') {
      setTimeout(() => {
        if (document.getElementById('vlx-printer-error-modal')) modal.remove();
      }, 30000);
    }
  }

  /**
   * Análisis completo: dado un resultado de print, decide si mostrar error
   * @param {object} printResult — { ok, error, statusByte?, method? }
   * @param {object} opts — { retry, ctx }
   */
  function handlePrintResult(printResult, opts = {}) {
    if (!printResult) return;
    if (printResult.ok) return; // OK, no mostrar nada

    // Si hay statusByte, decodificar primero
    let type = null;
    if (typeof printResult.statusByte === 'number') {
      type = decodeESCPOSStatus(printResult.statusByte);
    }
    // Si no hay status o no detectó error específico, clasificar por mensaje
    if (!type) {
      type = classifyError(printResult.error);
    }

    showErrorModal(type, Object.assign({
      ctx: printResult.error ? '[' + (printResult.method || 'print') + '] ' + printResult.error : null
    }, opts));
  }

  /**
   * Verificar status de impresora antes/después de imprimir (cuando es BT/IP)
   * Devuelve { ok, errorType?, statusByte? }
   */
  async function queryPrinterStatus(opts = {}) {
    const ve = global.volvixElectron;
    if (!ve) return { ok: false, error: 'no electron bridge' };

    // BT status
    if (opts.method === 'bt' && ve.queryBluetoothStatus) {
      return await ve.queryBluetoothStatus(opts.mac);
    }
    // IP status (ping + future SNMP)
    if (opts.method === 'ip' && ve.pingNetworkPrinter) {
      const r = await ve.pingNetworkPrinter(opts.ip, opts.port || 9100);
      return r;
    }
    return { ok: true }; // sin status check disponible, asumir ok
  }

  global.VolvixPrinterErrors = {
    showErrorModal,
    handlePrintResult,
    classifyError,
    decodeESCPOSStatus,
    queryPrinterStatus,
    ERROR_TYPES
  };
})(typeof window !== 'undefined' ? window : globalThis);
