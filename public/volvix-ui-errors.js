/**
 * volvix-ui-errors.js
 * Error handling UI module for Volvix POS.
 * Provides: global try/catch, error pages (404/500/maintenance),
 * retry mechanism, bug reporting.
 * Exposes: window.ErrorHandler
 */
(function (global) {
  'use strict';

  const CONFIG = {
    reportEndpoint: '/api/errors/report',
    maxRetries: 3,
    retryBaseDelay: 800,
    retryMaxDelay: 8000,
    storageKey: 'volvix_error_log',
    maxStoredErrors: 50,
    maintenanceFlag: 'volvix_maintenance_mode',
    appName: 'Volvix POS',
    version: '3.4.0'
  };

  const ErrorHandler = {
    _listeners: [],
    _initialized: false,

    init() {
      if (this._initialized) return;
      this._initialized = true;
      this._installGlobalHandlers();
      this._injectStyles();
      this._checkMaintenance();
      console.info('[ErrorHandler] initialized v' + CONFIG.version);
    },

    _installGlobalHandlers() {
      window.addEventListener('error', (ev) => {
        this.handle({
          type: 'window.error',
          message: ev.message,
          source: ev.filename,
          line: ev.lineno,
          col: ev.colno,
          stack: ev.error && ev.error.stack
        });
      });

      window.addEventListener('unhandledrejection', (ev) => {
        const reason = ev.reason || {};
        this.handle({
          type: 'unhandledrejection',
          message: reason.message || String(reason),
          stack: reason.stack
        });
      });

      // Wrap fetch for network errors
      // 2026-05-06 fix: NO mostrar overlay 404 bloqueante para llamadas /api/* —
      // los endpoints API que devuelven 404 son recursos especificos (producto,
      // cliente, etc.) y la UI los maneja localmente; solo el shell HTML/navegacion
      // amerita un overlay 'Pagina no encontrada'. Lo mismo para 5xx/503: dejar que
      // el caller decida si mostrar el overlay (un 5xx en /api/products no debe
      // bloquear todo el POS si la pantalla puede degradar).
      // 2026-05-09 fix: lista de URLs de BACKGROUND que NUNCA deben mostrar el
      // modal global "Algo salió mal" — son polling/telemetry que reintentan solos.
      // Antes el modal interrumpía la UI cuando estos endpoints fallaban.
      const BACKGROUND_PATHS = [
        '/api/events/poll', '/api/events/emit',
        '/api/observability', '/api/log/client', '/api/analytics',
        '/api/sync/', '/api/health', '/api/heartbeat',
        '/api/push/subscribe', '/api/push/unsubscribe',
      ];
      const _fetch = window.fetch;
      if (_fetch) {
        window.fetch = (...args) => {
          return _fetch.apply(window, args).then((res) => {
            if (!res.ok) {
              const url = String(args[0] || '');
              const isApi = url.indexOf('/api/') !== -1 || url.indexOf('/api?') !== -1;
              const isBg = BACKGROUND_PATHS.some(p => url.indexOf(p) !== -1);
              if (!isApi && !isBg) {
                if (res.status === 404) ErrorHandler.show404({ url: args[0] });
                else if (res.status >= 500) ErrorHandler.show500({ url: args[0], status: res.status });
                else if (res.status === 503) ErrorHandler.showMaintenance();
              }
            }
            return res;
          }).catch((err) => {
            // 2026-05-09: solo log a Sentry/console; NO modal por errores de fetch
            // (offline, timeouts, etc. ya tienen su propio banner offline)
            try { ErrorHandler.handle({ type: 'fetch', message: err.message, stack: err.stack }); } catch (_) {}
            throw err;
          });
        };
      }
    },

    handle(err) {
      const entry = {
        ...err,
        userAgent: navigator.userAgent,
        url: location.href,
        timestamp: new Date().toISOString(),
        app: CONFIG.appName,
        version: CONFIG.version
      };
      this._store(entry);
      this._notifyListeners(entry);
      console.error('[ErrorHandler]', entry);
      return entry;
    },

    _store(entry) {
      try {
        const log = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
        log.push(entry);
        while (log.length > CONFIG.maxStoredErrors) log.shift();
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(log));
      } catch (e) { /* storage full / unavailable */ }
    },

    getLog() {
      try { return JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]'); }
      catch (e) { return []; }
    },

    clearLog() { localStorage.removeItem(CONFIG.storageKey); },

    onError(fn) { if (typeof fn === 'function') this._listeners.push(fn); },

    _notifyListeners(entry) {
      this._listeners.forEach((fn) => { try { fn(entry); } catch (_) {} });
    },

    /** Run a function safely; report any thrown error. */
    safe(fn, fallback) {
      return (...args) => {
        try { return fn.apply(this, args); }
        catch (e) {
          this.handle({ type: 'safe', message: e.message, stack: e.stack });
          return typeof fallback === 'function' ? fallback(e) : fallback;
        }
      };
    },

    /** Retry an async fn with exponential backoff. */
    async retry(asyncFn, options = {}) {
      const max = options.maxRetries || CONFIG.maxRetries;
      const base = options.baseDelay || CONFIG.retryBaseDelay;
      const cap = options.maxDelay || CONFIG.retryMaxDelay;
      let attempt = 0, lastErr;
      while (attempt < max) {
        try {
          return await asyncFn(attempt);
        } catch (e) {
          lastErr = e;
          attempt++;
          if (attempt >= max) break;
          const delay = Math.min(cap, base * Math.pow(2, attempt - 1));
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      this.handle({ type: 'retry-exhausted', message: lastErr && lastErr.message, stack: lastErr && lastErr.stack, attempts: attempt });
      throw lastErr;
    },

    show404(ctx = {}) { this._renderPage('404', 'Pagina no encontrada', `La ruta solicitada no existe.${ctx.url ? ' (' + ctx.url + ')' : ''}`); },
    show500(ctx = {}) { this._renderPage('500', 'Error interno del servidor', `Algo salio mal.${ctx.status ? ' Codigo: ' + ctx.status : ''}`); },
    showMaintenance() { this._renderPage('maint', 'En mantenimiento', 'Volvix POS esta en mantenimiento. Vuelve en unos minutos.'); },

    _renderPage(kind, title, msg) {
      const existing = document.getElementById('volvix-err-overlay');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'volvix-err-overlay';
      el.className = 'volvix-err volvix-err-' + kind;
      el.innerHTML = `
        <div class="volvix-err-box">
          <div class="volvix-err-code">${kind.toUpperCase()}</div>
          <h1>${title}</h1>
          <p>${msg}</p>
          <div class="volvix-err-actions">
            <button data-act="retry">Reintentar</button>
            <button data-act="home">Inicio</button>
            <button data-act="report">Reportar bug</button>
            <button data-act="close">Cerrar</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('[data-act="retry"]').onclick = () => location.reload();
      el.querySelector('[data-act="home"]').onclick = () => { location.href = '/'; };
      el.querySelector('[data-act="report"]').onclick = () => this.openReportDialog();
      el.querySelector('[data-act="close"]').onclick = () => el.remove();
    },

    openReportDialog(prefill = {}) {
      const existing = document.getElementById('volvix-bug-dlg');
      if (existing) existing.remove();
      const dlg = document.createElement('div');
      dlg.id = 'volvix-bug-dlg';
      dlg.className = 'volvix-err';
      dlg.innerHTML = `
        <div class="volvix-err-box">
          <h2>Reportar bug</h2>
          <textarea id="volvix-bug-msg" placeholder="Describe que estabas haciendo..." rows="5"></textarea>
          <label><input type="checkbox" id="volvix-bug-log" checked> Incluir log de errores</label>
          <div class="volvix-err-actions">
            <button data-act="send">Enviar</button>
            <button data-act="cancel">Cancelar</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
      if (prefill.message) dlg.querySelector('#volvix-bug-msg').value = prefill.message;
      dlg.querySelector('[data-act="cancel"]').onclick = () => dlg.remove();
      dlg.querySelector('[data-act="send"]').onclick = async () => {
        const msg = dlg.querySelector('#volvix-bug-msg').value;
        const includeLog = dlg.querySelector('#volvix-bug-log').checked;
        await this.reportBug({ message: msg, includeLog });
        dlg.remove();
        VolvixUI.toast({type:'success', message:'Reporte enviado. Gracias.'});
      };
    },

    async reportBug(payload = {}) {
      const body = {
        message: payload.message || '',
        log: payload.includeLog ? this.getLog() : [],
        url: location.href,
        userAgent: navigator.userAgent,
        version: CONFIG.version,
        timestamp: new Date().toISOString()
      };
      try {
        await fetch(CONFIG.reportEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        return { ok: true };
      } catch (e) {
        this.handle({ type: 'report-failed', message: e.message });
        return { ok: false, error: e.message };
      }
    },

    _checkMaintenance() {
      if (localStorage.getItem(CONFIG.maintenanceFlag) === '1') this.showMaintenance();
    },

    setMaintenance(on) {
      if (on) localStorage.setItem(CONFIG.maintenanceFlag, '1');
      else localStorage.removeItem(CONFIG.maintenanceFlag);
    },

    _injectStyles() {
      if (document.getElementById('volvix-err-styles')) return;
      const s = document.createElement('style');
      s.id = 'volvix-err-styles';
      s.textContent = `
        .volvix-err{position:fixed;inset:0;background:rgba(15,20,30,.92);
          display:flex;align-items:center;justify-content:center;
          z-index:99999;font-family:system-ui,sans-serif;color:#fff}
        .volvix-err-box{background:#1c2230;border:1px solid #2c3447;
          padding:32px;border-radius:12px;max-width:480px;width:90%;
          text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)}
        .volvix-err-code{font-size:64px;font-weight:800;color:#ff5566;
          letter-spacing:2px;margin-bottom:8px}
        .volvix-err-maint .volvix-err-code{color:#ffaa33}
        .volvix-err-box h1,.volvix-err-box h2{margin:8px 0 12px}
        .volvix-err-box p{color:#aab;margin-bottom:20px}
        .volvix-err-box textarea{width:100%;background:#0f1420;
          border:1px solid #2c3447;color:#fff;padding:8px;border-radius:6px;
          font-family:inherit;margin-bottom:8px}
        .volvix-err-box label{display:block;text-align:left;
          font-size:13px;color:#aab;margin-bottom:12px}
        .volvix-err-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
        .volvix-err-actions button{padding:8px 16px;border-radius:6px;
          border:0;background:#3b82f6;color:#fff;cursor:pointer;font-weight:600}
        .volvix-err-actions button:hover{background:#2563eb}
      `;
      document.head.appendChild(s);
    }
  };

  global.ErrorHandler = ErrorHandler;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ErrorHandler.init());
  } else {
    ErrorHandler.init();
  }
})(window);
