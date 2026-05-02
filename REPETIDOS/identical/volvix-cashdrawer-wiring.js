/* ============================================================================
 * volvix-cashdrawer-wiring.js
 * Agent-51 R9 Volvix — Cash Drawer Wiring Module
 * ----------------------------------------------------------------------------
 * Simulación de apertura de cajón de dinero, log persistente de aperturas,
 * alertas de seguridad, integración con impresora ESC/POS y botón rápido.
 * Expone: window.CashDrawerAPI
 * ============================================================================
 */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. CONFIGURACIÓN
  // -------------------------------------------------------------------------
  const CONFIG = {
    storageKey: 'volvix_cashdrawer_log_v1',
    maxLogEntries: 500,
    simulationDelayMs: 350,
    securityWindowMs: 60_000,      // ventana para detectar aperturas seguidas
    suspiciousThreshold: 5,         // >=5 aperturas en 60s => alerta
    requireReasonAfter: 3,          // pedir motivo después de 3 sin venta
    escposPulsePin: 0,              // pin 2 (default) en ESC/POS
    escposOnTime: 60,               // ms ON
    escposOffTime: 120,             // ms OFF
    quickButtonId: 'volvix-cashdrawer-quick-btn',
    emoji: '💰'           // 💰
  };

  // -------------------------------------------------------------------------
  // 2. ESTADO INTERNO
  // -------------------------------------------------------------------------
  const state = {
    isOpen: false,
    lastOpenAt: null,
    openingsSinceSale: 0,
    listeners: { open: [], close: [], alert: [] },
    printer: null,                  // referencia a printer ESC/POS
    log: []
  };

  // -------------------------------------------------------------------------
  // 3. PERSISTENCIA DE LOG
  // -------------------------------------------------------------------------
  function loadLog() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(CONFIG.storageKey);
      state.log = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('[CashDrawer] no pude cargar log:', e);
      state.log = [];
    }
  }

  function persistLog() {
    try {
      if (state.log.length > CONFIG.maxLogEntries) {
        state.log = state.log.slice(-CONFIG.maxLogEntries);
      }
      global.localStorage &&
        global.localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.log));
    } catch (e) {
      console.warn('[CashDrawer] no pude persistir log:', e);
    }
  }

  function addLogEntry(entry) {
    const full = Object.assign(
      {
        ts: new Date().toISOString(),
        user: (global.VolvixSession && global.VolvixSession.user) || 'anonymous',
        terminal: (global.VolvixSession && global.VolvixSession.terminal) || 'POS-1'
      },
      entry
    );
    state.log.push(full);
    persistLog();
    return full;
  }

  // -------------------------------------------------------------------------
  // 4. ALERTAS DE SEGURIDAD
  // -------------------------------------------------------------------------
  function evaluateSecurity(reason) {
    const now = Date.now();
    const recent = state.log.filter(
      (e) => e.event === 'open' && now - new Date(e.ts).getTime() < CONFIG.securityWindowMs
    );

    const alerts = [];

    if (recent.length >= CONFIG.suspiciousThreshold) {
      alerts.push({
        level: 'high',
        code: 'RAPID_OPEN_BURST',
        message: `${recent.length} aperturas en ${CONFIG.securityWindowMs / 1000}s`
      });
    }

    if (state.openingsSinceSale >= CONFIG.requireReasonAfter && reason === 'manual') {
      alerts.push({
        level: 'medium',
        code: 'NO_SALE_REPEATED',
        message: `${state.openingsSinceSale} aperturas manuales sin venta asociada`
      });
    }

    const hour = new Date().getHours();
    if (hour < 6 || hour >= 23) {
      alerts.push({
        level: 'medium',
        code: 'OUT_OF_HOURS',
        message: `apertura a las ${hour}:00 (fuera de horario operativo)`
      });
    }

    alerts.forEach((a) => {
      addLogEntry({ event: 'alert', alert: a });
      emit('alert', a);
      console.warn(`[CashDrawer][${a.level.toUpperCase()}] ${a.code}: ${a.message}`);
    });

    return alerts;
  }

  // -------------------------------------------------------------------------
  // 5. INTEGRACIÓN ESC/POS
  // -------------------------------------------------------------------------
  function attachPrinter(printer) {
    if (!printer) {
      console.warn('[CashDrawer] printer nulo, integración deshabilitada');
      return false;
    }
    state.printer = printer;
    console.log('[CashDrawer] printer ESC/POS conectado');
    return true;
  }

  function buildPulseCommand() {
    // ESC p m t1 t2  →  0x1B 0x70 m t1 t2
    return new Uint8Array([
      0x1b,
      0x70,
      CONFIG.escposPulsePin & 0xff,
      CONFIG.escposOnTime & 0xff,
      CONFIG.escposOffTime & 0xff
    ]);
  }

  async function sendPulse() {
    const cmd = buildPulseCommand();
    if (state.printer && typeof state.printer.write === 'function') {
      try {
        await state.printer.write(cmd);
        return { ok: true, via: 'escpos' };
      } catch (e) {
        console.error('[CashDrawer] falló pulso ESC/POS:', e);
        return { ok: false, via: 'escpos', error: String(e) };
      }
    }
    // fallback simulado
    await new Promise((r) => setTimeout(r, CONFIG.simulationDelayMs));
    return { ok: true, via: 'simulated' };
  }

  // -------------------------------------------------------------------------
  // 6. EVENTOS
  // -------------------------------------------------------------------------
  function on(event, fn) {
    if (state.listeners[event] && typeof fn === 'function') {
      state.listeners[event].push(fn);
    }
  }

  function off(event, fn) {
    if (!state.listeners[event]) return;
    state.listeners[event] = state.listeners[event].filter((h) => h !== fn);
  }

  function emit(event, payload) {
    (state.listeners[event] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('[CashDrawer] listener error:', e);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 7. API PRINCIPAL
  // -------------------------------------------------------------------------
  async function open(options) {
    const opts = Object.assign(
      { reason: 'manual', saleId: null, amount: null, silent: false },
      options || {}
    );

    if (state.isOpen) {
      console.warn('[CashDrawer] ya está abierto');
      return { ok: false, error: 'ALREADY_OPEN' };
    }

    const pulse = await sendPulse();
    state.isOpen = true;
    state.lastOpenAt = Date.now();

    if (opts.reason === 'sale') {
      state.openingsSinceSale = 0;
    } else {
      state.openingsSinceSale += 1;
    }

    const entry = addLogEntry({
      event: 'open',
      reason: opts.reason,
      saleId: opts.saleId,
      amount: opts.amount,
      via: pulse.via
    });

    emit('open', entry);

    const alerts = evaluateSecurity(opts.reason);

    // auto-close lógico (físicamente lo cierra el cajero)
    setTimeout(() => close({ auto: true }), 4000);

    return { ok: pulse.ok, entry, alerts };
  }

  function close(options) {
    const opts = options || {};
    if (!state.isOpen) return { ok: false, error: 'ALREADY_CLOSED' };
    state.isOpen = false;
    const entry = addLogEntry({ event: 'close', auto: !!opts.auto });
    emit('close', entry);
    return { ok: true, entry };
  }

  function getLog(filter) {
    if (!filter) return state.log.slice();
    return state.log.filter((e) => {
      if (filter.event && e.event !== filter.event) return false;
      if (filter.since && new Date(e.ts).getTime() < filter.since) return false;
      if (filter.user && e.user !== filter.user) return false;
      return true;
    });
  }

  function clearLog() {
    state.log = [];
    persistLog();
    return { ok: true };
  }

  function stats() {
    const opens = state.log.filter((e) => e.event === 'open');
    const alerts = state.log.filter((e) => e.event === 'alert');
    const byReason = opens.reduce((acc, e) => {
      acc[e.reason] = (acc[e.reason] || 0) + 1;
      return acc;
    }, {});
    return {
      totalOpens: opens.length,
      totalAlerts: alerts.length,
      byReason,
      lastOpenAt: state.lastOpenAt,
      isOpen: state.isOpen,
      openingsSinceSale: state.openingsSinceSale
    };
  }

  // -------------------------------------------------------------------------
  // 8. BOTÓN RÁPIDO 💰
  // -------------------------------------------------------------------------
  function mountQuickButton(target) {
    if (typeof document === 'undefined') return null;
    const host = target || document.body;
    if (!host) return null;
    if (document.getElementById(CONFIG.quickButtonId)) {
      return document.getElementById(CONFIG.quickButtonId);
    }
    const btn = document.createElement('button');
    btn.id = CONFIG.quickButtonId;
    btn.type = 'button';
    btn.title = 'Abrir cajón de dinero (No-Sale)';
    btn.textContent = CONFIG.emoji + ' Cajón';
    btn.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:99999;' +
      'padding:12px 18px;font-size:16px;border:0;border-radius:10px;' +
      'background:#1f8a3b;color:#fff;cursor:pointer;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.25);font-family:system-ui,sans-serif;';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.style.opacity = '.6';
      const res = await open({ reason: 'manual' });
      if (!res.ok) {
        btn.textContent = CONFIG.emoji + ' Error';
      } else {
        btn.textContent = CONFIG.emoji + ' Abierto';
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = CONFIG.emoji + ' Cajón';
      }, 2500);
    });
    host.appendChild(btn);
    return btn;
  }

  function unmountQuickButton() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(CONFIG.quickButtonId);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // -------------------------------------------------------------------------
  // 9. INICIALIZACIÓN
  // -------------------------------------------------------------------------
  loadLog();

  const CashDrawerAPI = {
    config: CONFIG,
    open,
    close,
    attachPrinter,
    on,
    off,
    getLog,
    clearLog,
    stats,
    mountQuickButton,
    unmountQuickButton,
    isOpen: () => state.isOpen,
    _state: state // debug
  };

  global.CashDrawerAPI = CashDrawerAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CashDrawerAPI;
  }

  console.log('[CashDrawer] wiring listo. window.CashDrawerAPI disponible.');
})(typeof window !== 'undefined' ? window : globalThis);
