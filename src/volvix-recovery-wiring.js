/* ============================================================
   Volvix POS — Recovery Wiring (FIX-N5-C1)
   Agent R10e-C / Nivel 5 — Recovery total tras suspensión / Windows update / caché corrupta
   ------------------------------------------------------------
   Detecta:
     - Resume tras suspensión (gap > 5 min entre heartbeats)
     - IndexedDB corrupto / inaccesible
     - Caché corrupta o desactualizada
     - Reinicio chrome por Windows update
   Recupera:
     - JWT (heartbeat + refresh)
     - IndexedDB (re-init + fallback localStorage)
     - Carrito server-side (R8b)
     - Products cache (sw.js FORCE_REFRESH)
     - Offline queue (sw.js TRIGGER_SYNC)
     - Event stream (reconexion)
   ============================================================ */
(function () {
  'use strict';

  // No re-cargar si ya existe
  if (window.VolvixRecovery) return;

  // ─── Constantes ───────────────────────────────────────────
  const HEARTBEAT_INTERVAL_MS = 30000;          // 30s
  const SUSPENSION_GAP_MS     = 5 * 60 * 1000;  // 5 min
  const HEARTBEAT_KEY         = 'volvix_recovery_heartbeat';
  const BOOT_KEY              = 'volvix_recovery_boot_ts';
  const LAST_VERSION_KEY      = 'volvix_recovery_last_chrome_version';
  const CART_BACKUP_KEY       = 'volvix_recovery_cart_backup';
  const SESSION_BACKUP_KEY    = 'volvix_recovery_session_backup';

  // ─── Storage helpers (LS no-throw) ────────────────────────
  const safeLS = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };

  // ─── UI feedback (toast simple, no choca con el resto) ───
  function toast(msg, kind) {
    try {
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.style.cssText = [
        'position:fixed', 'right:16px', 'top:16px', 'z-index:99999',
        'padding:10px 14px', 'border-radius:8px',
        'font:13px/1.3 system-ui,-apple-system,Segoe UI,sans-serif',
        'box-shadow:0 4px 12px rgba(0,0,0,.18)',
        'background:' + (kind === 'error' ? '#b91c1c' : kind === 'warn' ? '#b45309' : '#0f766e'),
        'color:#fff', 'max-width:340px'
      ].join(';');
      el.textContent = '[Recovery] ' + msg;
      document.body && document.body.appendChild(el);
      setTimeout(() => el.remove(), 5000);
    } catch (_) { /* DOM no listo — silencioso */ }
  }

  function progressUI(steps) {
    // steps = [{label, status: 'pending'|'ok'|'error'}, ...]
    try {
      let panel = document.getElementById('volvix-recovery-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'volvix-recovery-panel';
        panel.style.cssText = [
          'position:fixed', 'left:16px', 'bottom:16px', 'z-index:99998',
          'background:#0b1020', 'color:#e7eaf6',
          'border:1px solid #2a3454', 'border-radius:10px',
          'padding:12px 14px', 'font:13px system-ui,-apple-system,Segoe UI,sans-serif',
          'min-width:260px', 'max-width:340px',
          'box-shadow:0 6px 18px rgba(0,0,0,.35)'
        ].join(';');
        document.body && document.body.appendChild(panel);
      }
      panel.innerHTML =
        '<div style="font-weight:600;margin-bottom:6px">Recuperación post-suspensión</div>' +
        steps.map(s =>
          '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">' +
            '<span>' + escapeHTML(s.label) + '</span>' +
            '<span>' + (s.status === 'ok' ? 'OK' : s.status === 'error' ? 'ERR' : '...') + '</span>' +
          '</div>'
        ).join('');
    } catch (_) {}
  }

  function dismissProgressUI() {
    try {
      const panel = document.getElementById('volvix-recovery-panel');
      if (panel) setTimeout(() => panel.remove(), 1800);
    } catch (_) {}
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ─── Probe IndexedDB integrity ────────────────────────────
  async function probeIndexedDB() {
    if (!('indexedDB' in window)) return { ok: false, reason: 'no-idb-support' };
    return new Promise(resolve => {
      let done = false;
      const fail = (reason) => { if (!done) { done = true; resolve({ ok: false, reason }); } };
      const timer = setTimeout(() => fail('timeout'), 4000);
      try {
        const req = indexedDB.open('volvix-recovery-probe', 1);
        req.onerror = () => { clearTimeout(timer); fail('open-error'); };
        req.onblocked = () => { clearTimeout(timer); fail('blocked'); };
        req.onupgradeneeded = (e) => {
          try { e.target.result.createObjectStore('probe', { keyPath: 'id' }); }
          catch (_) {}
        };
        req.onsuccess = (e) => {
          clearTimeout(timer);
          try {
            const db = e.target.result;
            db.close();
            if (!done) { done = true; resolve({ ok: true }); }
          } catch (err) { fail('close-error'); }
        };
      } catch (err) { clearTimeout(timer); fail('throw:' + err.message); }
    });
  }

  // ─── Heartbeat (suspension detector) ─────────────────────
  function writeHeartbeat() {
    safeLS.set(HEARTBEAT_KEY, String(Date.now()));
  }

  // ─── Public API ───────────────────────────────────────────
  window.VolvixRecovery = {
    lastSuspensionAt: null,
    lastRecoveryAt: null,
    inProgress: false,

    /**
     * Detecta si el navegador resumió desde suspensión
     * comparando el último heartbeat con Date.now().
     */
    async detectResumeFromSuspension() {
      const last = parseInt(safeLS.get(HEARTBEAT_KEY) || '0', 10);
      const now  = Date.now();
      writeHeartbeat();
      if (!last) return false;
      const gap = now - last;
      if (gap > SUSPENSION_GAP_MS) {
        this.lastSuspensionAt = now;
        console.warn('[Recovery] Suspensión detectada — gap:', Math.round(gap / 1000), 's');
        if (!this.inProgress) {
          // No await — corre en background
          this.fullRecovery().catch(err =>
            console.error('[Recovery] fullRecovery failed:', err)
          );
        }
        return true;
      }
      return false;
    },

    /**
     * Recovery total: 6 pasos con feedback UI.
     */
    async fullRecovery() {
      if (this.inProgress) return { ok: false, reason: 'already-running' };
      this.inProgress = true;
      const steps = [
        { label: '1) Verificar JWT',           status: 'pending' },
        { label: '2) Verificar IndexedDB',     status: 'pending' },
        { label: '3) Sincronizar carrito',     status: 'pending' },
        { label: '4) Refrescar productos',     status: 'pending' },
        { label: '5) Procesar cola offline',   status: 'pending' },
        { label: '6) Reconectar event stream', status: 'pending' }
      ];
      progressUI(steps);

      // 1) JWT heartbeat
      try {
        if (window.VolvixAuth && typeof window.VolvixAuth.heartbeat === 'function') {
          await window.VolvixAuth.heartbeat();
        } else {
          // Fallback: ping /api/me con token actual
          const token = safeLS.get('jwt') || safeLS.get('volvix_jwt');
          if (token) {
            const r = await fetch('/api/me', {
              headers: { 'Authorization': 'Bearer ' + token },
              cache: 'no-store'
            });
            if (!r.ok && r.status === 401) throw new Error('jwt-expired');
          }
        }
        steps[0].status = 'ok';
      } catch (err) {
        steps[0].status = 'error';
        console.warn('[Recovery] JWT step failed:', err.message);
        // Si JWT expiró, marca para que app principal redirija a login
        safeLS.set('volvix_recovery_needs_login', '1');
      }
      progressUI(steps);

      // 2) IndexedDB integrity
      try {
        const probe = await probeIndexedDB();
        if (!probe.ok) {
          console.warn('[Recovery] IDB falla:', probe.reason);
          await this.indexedDBRecovery();
        }
        steps[1].status = 'ok';
      } catch (err) {
        steps[1].status = 'error';
        console.error('[Recovery] IDB step:', err);
      }
      progressUI(steps);

      // 3) Carrito server-side (R8b)
      try {
        if (window.VolvixCart && typeof window.VolvixCart.syncFromServer === 'function') {
          await window.VolvixCart.syncFromServer();
        } else {
          // Backup local del carrito por si la sync falla
          const cart = safeLS.get('volvix_cart') || safeLS.get('cart');
          if (cart) safeLS.set(CART_BACKUP_KEY, cart);
        }
        steps[2].status = 'ok';
      } catch (err) {
        steps[2].status = 'error';
        console.warn('[Recovery] Cart sync:', err.message);
      }
      progressUI(steps);

      // 4) Refresh products via SW (FORCE_REFRESH)
      try {
        await this._postToSW('FORCE_REFRESH', { scope: 'products' });
        steps[3].status = 'ok';
      } catch (err) {
        steps[3].status = 'error';
        console.warn('[Recovery] Products refresh:', err.message);
      }
      progressUI(steps);

      // 5) Offline queue
      try {
        await this._postToSW('TRIGGER_SYNC', {});
        steps[4].status = 'ok';
      } catch (err) {
        steps[4].status = 'error';
        console.warn('[Recovery] Sync queue:', err.message);
      }
      progressUI(steps);

      // 6) Event stream reconnect
      try {
        if (window.VolvixEventStream && typeof window.VolvixEventStream.reconnect === 'function') {
          window.VolvixEventStream.reconnect();
        } else if (window.EventSource && window._volvixSSE) {
          try { window._volvixSSE.close(); } catch (_) {}
          window._volvixSSE = null;
          // App principal lo reabrirá en su próximo tick
        }
        steps[5].status = 'ok';
      } catch (err) {
        steps[5].status = 'error';
        console.warn('[Recovery] Event stream:', err.message);
      }
      progressUI(steps);

      this.lastRecoveryAt = Date.now();
      this.inProgress = false;
      const errors = steps.filter(s => s.status === 'error').length;
      if (errors === 0) {
        toast('Sistema recuperado correctamente', 'ok');
      } else if (errors >= 3) {
        toast('Recovery con ' + errors + ' errores — revisa estado', 'error');
        // Si demasiados errores, ofrece recovery total
        setTimeout(() => this.corruptedCacheRecovery(), 1500);
      } else {
        toast('Recovery parcial (' + errors + ' fallos)', 'warn');
      }
      dismissProgressUI();
      return { ok: errors === 0, errors, steps };
    },

    /**
     * Recovery agresivo: limpia caches y recarga.
     */
    async corruptedCacheRecovery() {
      const yes = window.confirm(
        'Sistema detectó datos corruptos o desactualizados.\n\n' +
        'Limpiar todo y recargar?\n\n' +
        '(Tu carrito y productos se re-sincronizarán desde el servidor)'
      );
      if (!yes) return { ok: false, reason: 'user-cancelled' };

      try {
        // 1) Backup carrito a LS por si el reload pierde IDB
        try {
          const cart = safeLS.get('volvix_cart') || safeLS.get('cart');
          if (cart) safeLS.set(CART_BACKUP_KEY, cart);
        } catch (_) {}

        // 2) Limpia todos los caches del SW
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }

        // 3) Avisa al SW por si hay uno controlando
        try { await this._postToSW('CLEAR_CACHE', {}); } catch (_) {}

        // 4) Drop IndexedDB volvix-* si está accesible
        try {
          if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            await Promise.all(
              (dbs || [])
                .filter(d => d.name && /^volvix/i.test(d.name))
                .map(d => new Promise(res => {
                  const req = indexedDB.deleteDatabase(d.name);
                  req.onsuccess = req.onerror = req.onblocked = () => res();
                }))
            );
          }
        } catch (_) {}

        // 5) Reload duro
        location.reload();
        return { ok: true };
      } catch (err) {
        console.error('[Recovery] corruptedCacheRecovery fatal:', err);
        location.reload();
        return { ok: false, error: err.message };
      }
    },

    /**
     * Si IndexedDB no responde, intenta restaurar desde localStorage.
     * Si tampoco hay LS, deja sesión limpia.
     */
    async indexedDBRecovery() {
      const cart = safeLS.get(CART_BACKUP_KEY) || safeLS.get('volvix_cart');
      const session = safeLS.get(SESSION_BACKUP_KEY) || safeLS.get('volvix_session');

      // Restaura globals si la app los espera
      try {
        if (cart && window.VolvixCart && typeof window.VolvixCart.restoreFromBackup === 'function') {
          await window.VolvixCart.restoreFromBackup(cart);
        }
        if (session && window.VolvixAuth && typeof window.VolvixAuth.restoreFromBackup === 'function') {
          await window.VolvixAuth.restoreFromBackup(session);
        }
      } catch (err) {
        console.warn('[Recovery] IDB restore from LS:', err.message);
      }

      if (!cart && !session) {
        console.info('[Recovery] No hay backup en LS — sesión limpia');
      }
      return { ok: true, restored: { cart: !!cart, session: !!session } };
    },

    /**
     * Detecta si Chrome se reinició (típico tras update de Windows o navegador).
     * Usa boot timestamp en LS y lo compara con performance.timeOrigin.
     */
    checkWindowsUpdate() {
      try {
        const lastBoot = parseInt(safeLS.get(BOOT_KEY) || '0', 10);
        const lastVer  = safeLS.get(LAST_VERSION_KEY) || '';
        const currVer  = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || '';
        // performance.timeOrigin es ms desde el epoch del momento que el contexto inició
        const bootTs   = (performance && performance.timeOrigin) ? Math.floor(performance.timeOrigin) : Date.now();

        let updated = false;
        if (lastVer && currVer && lastVer !== currVer) {
          console.warn('[Recovery] Chrome version cambió:', lastVer, '→', currVer);
          updated = true;
        }
        // Si el lastBoot está antes del bootTs por más de 1h, es reboot
        if (lastBoot && (bootTs - lastBoot) > 60 * 60 * 1000) {
          console.warn('[Recovery] Reboot detectado (gap >1h)');
          updated = true;
        }

        safeLS.set(BOOT_KEY, String(bootTs));
        if (currVer) safeLS.set(LAST_VERSION_KEY, currVer);

        if (updated) {
          toast('Sistema reiniciado — verificando estado', 'warn');
          if (!this.inProgress) {
            this.fullRecovery().catch(err =>
              console.error('[Recovery] post-reboot recovery:', err)
            );
          }
        }
        return { updated, lastVer, currVer };
      } catch (err) {
        console.warn('[Recovery] checkWindowsUpdate:', err.message);
        return { updated: false, error: err.message };
      }
    },

    /**
     * Helper: post message al service worker activo.
     */
    async _postToSW(type, payload) {
      if (!('serviceWorker' in navigator)) throw new Error('no-sw-support');
      const reg = await navigator.serviceWorker.ready;
      const sw  = (navigator.serviceWorker.controller) || reg.active;
      if (!sw) throw new Error('no-active-sw');
      return new Promise((resolve, reject) => {
        const ch = new MessageChannel();
        const tmr = setTimeout(() => reject(new Error('sw-timeout')), 5000);
        ch.port1.onmessage = (e) => { clearTimeout(tmr); resolve(e.data); };
        try {
          sw.postMessage({ type, payload }, [ch.port2]);
          // Algunos handlers no responden — resolvemos en 800ms si no hay reply
          setTimeout(() => { clearTimeout(tmr); resolve({ ok: true, type }); }, 800);
        } catch (err) { clearTimeout(tmr); reject(err); }
      });
    }
  };

  // ─── Bootstrap ────────────────────────────────────────────
  // Heartbeat inicial + loop cada 30s
  writeHeartbeat();
  setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Detección inicial al cargar
  window.VolvixRecovery.detectResumeFromSuspension();
  window.VolvixRecovery.checkWindowsUpdate();

  // Loop de detección
  setInterval(() => {
    window.VolvixRecovery.detectResumeFromSuspension();
  }, HEARTBEAT_INTERVAL_MS);

  // Visibility change (tab vuelve a foreground)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      window.VolvixRecovery.detectResumeFromSuspension();
    }
  });

  // Online/offline transitions
  window.addEventListener('online', () => {
    console.info('[Recovery] online — disparando sync');
    window.VolvixRecovery._postToSW('TRIGGER_SYNC', {}).catch(() => {});
  });

  console.info('[VolvixRecovery] wiring activo — heartbeat cada', HEARTBEAT_INTERVAL_MS, 'ms');
})();
