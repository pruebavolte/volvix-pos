/* =============================================================
   R10d-C — Volvix System Health Monitor (FIX-N4-6)
   ----------------------------------------------------------------
   Monitorea cliente-side problemas Nivel 4 (sistema/dispositivo):
     - Cuota de almacenamiento (disco lleno)
     - IndexedDB disponibilidad (modo offline)
     - Interferencia de antivirus (recursos bloqueados)
     - Page visibility (tablet/laptop suspendida)
     - Reloj desincronizado (clock drift)

   Uso: Cargar en HTMLs públicos. Auto-arranca en window.VolvixSysMon.
   No depende de auth, no muta servidor. Sólo lee + alerta.
   ============================================================= */
(function(global){
  'use strict';

  if (global.VolvixSysMon) return; // idempotente

  var LAST_ACTIVE_KEY = 'volvix_last_active';
  var IDLE_THRESHOLD_MS = 5 * 60 * 1000;   // 5 min
  var DRIFT_THRESHOLD_MS = 5 * 60 * 1000;  // 5 min
  var STORAGE_THRESHOLD_PCT = 85;
  var HOURLY_MS = 60 * 60 * 1000;

  var SysMon = {
    checks: {},
    _activeBanners: {}, // dedupe alertas por type
    _started: false,

    /* ---- Cuota de almacenamiento ---- */
    async checkStorageQuota() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          var e = await navigator.storage.estimate();
          var quota = e.quota || 0;
          var usage = e.usage || 0;
          var usedPct = quota > 0 ? (usage / quota) * 100 : 0;
          this.checks.storage = {
            ok: usedPct < STORAGE_THRESHOLD_PCT,
            usedPct: usedPct,
            used: usage,
            quota: quota,
            ts: Date.now()
          };
          if (usedPct > STORAGE_THRESHOLD_PCT) {
            this.alert(
              'storage_low',
              'Disco ' + usedPct.toFixed(0) + '% lleno. Libera espacio para evitar fallos al guardar.'
            );
          } else {
            this.dismiss('storage_low');
          }
        } else {
          this.checks.storage = { ok: true, unavailable: true };
        }
      } catch(err) {
        this.checks.storage = { ok: false, error: String(err && err.message || err) };
      }
      return this.checks.storage;
    },

    /* ---- IndexedDB disponible ---- */
    async checkIndexedDB() {
      try {
        if (!global.indexedDB) {
          this.checks.indexeddb = { ok: false, error: 'IndexedDB no soportado' };
          this.alert('indexeddb_fail', 'IndexedDB no disponible. Modo offline puede fallar.');
          return this.checks.indexeddb;
        }
        var req = indexedDB.open('volvix-sysmon-test', 1);
        await new Promise(function(resolve, reject){
          var t = setTimeout(function(){ reject(new Error('timeout')); }, 3000);
          req.onsuccess = function(){
            clearTimeout(t);
            try { req.result && req.result.close(); } catch(_){}
            resolve();
          };
          req.onerror = function(){
            clearTimeout(t);
            reject(req.error || new Error('indexedDB open fallo'));
          };
          req.onblocked = function(){
            clearTimeout(t);
            reject(new Error('indexedDB blocked'));
          };
        });
        // Cleanup test DB
        try { indexedDB.deleteDatabase('volvix-sysmon-test'); } catch(_){}
        this.checks.indexeddb = { ok: true, ts: Date.now() };
        this.dismiss('indexeddb_fail');
      } catch(e) {
        this.checks.indexeddb = { ok: false, error: String(e && e.message || e) };
        this.alert('indexeddb_fail', 'IndexedDB no funciona. Modo offline puede fallar. Revisa modo privado/incógnito.');
      }
      return this.checks.indexeddb;
    },

    /* ---- Antivirus / firewall bloqueando recursos críticos ---- */
    async checkAntivirusInterference() {
      try {
        var r = await fetch('/sw.js', { method: 'HEAD', cache: 'no-cache' });
        if (!r.ok) throw new Error('sw.js HTTP ' + r.status);
        this.checks.antivirus = { ok: true, ts: Date.now() };
        this.dismiss('antivirus_block');
      } catch(e) {
        this.checks.antivirus = { ok: false, error: String(e && e.message || e) };
        this.alert(
          'antivirus_block',
          'Antivirus o firewall puede estar bloqueando recursos. Revisa configuración o whitelist este dominio.'
        );
      }
      return this.checks.antivirus;
    },

    /* ---- Page visibility (tablet despertó) ---- */
    checkPageVisibility() {
      var self = this;
      if (this._visibilityHooked) return;
      this._visibilityHooked = true;

      try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch(_){}

      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'visible') {
          var lastActive = 0;
          try { lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10) || 0; } catch(_){}
          var idle = Date.now() - lastActive;
          if (lastActive && idle > IDLE_THRESHOLD_MS) {
            var mins = Math.round(idle / 60000);
            self.alert(
              'resumed',
              'Sistema reanudado tras ' + mins + ' min en pausa. Verifica tu sesión.'
            );
            // Dispara heartbeat R8b si existe
            if (typeof global.__volvixHeartbeat === 'function') {
              try { global.__volvixHeartbeat(); } catch(_){}
            }
          }
        }
        try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch(_){}
      });

      this.checks.visibility = { ok: true, hooked: true };
    },

    /* ---- Reloj del dispositivo desincronizado ---- */
    checkClockDrift() {
      var self = this;
      try {
        fetch('/api/health', { method: 'GET', cache: 'no-store' })
          .then(function(r){
            var serverDateHdr = r.headers.get('Date');
            if (!serverDateHdr) {
              self.checks.clock = { ok: true, unavailable: true };
              return;
            }
            var serverTs = new Date(serverDateHdr).getTime();
            if (isNaN(serverTs)) {
              self.checks.clock = { ok: true, unavailable: true };
              return;
            }
            var drift = Math.abs(Date.now() - serverTs);
            self.checks.clock = {
              ok: drift < DRIFT_THRESHOLD_MS,
              drift: drift,
              ts: Date.now()
            };
            if (drift > DRIFT_THRESHOLD_MS) {
              var mins = Math.round(drift / 60000);
              self.alert(
                'clock_drift',
                'Reloj del dispositivo difiere ' + mins + ' min del servidor. Sincroniza tu hora para evitar errores de auth.'
              );
            } else {
              self.dismiss('clock_drift');
            }
          })
          .catch(function(err){
            self.checks.clock = { ok: false, error: String(err && err.message || err) };
          });
      } catch(err) {
        self.checks.clock = { ok: false, error: String(err && err.message || err) };
      }
    },

    /* ---- UI de alerta ---- */
    alert(type, msg) {
      try { console.warn('[VolvixSysMon] ' + type + ': ' + msg); } catch(_){}
      if (this._activeBanners[type]) return; // ya mostrado

      // No crear DOM si está oculto / no body aún
      if (typeof document === 'undefined' || !document.body) return;

      var banner = document.createElement('div');
      banner.className = 'volvix-sysmon-banner volvix-sysmon-' + type;
      banner.setAttribute('role', 'alert');
      banner.dataset.type = type;

      var strong = document.createElement('strong');
      strong.textContent = 'Sistema: ';

      var text = document.createElement('span');
      text.textContent = ' ' + msg;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Cerrar alerta');
      btn.textContent = '×';
      var self = this;
      btn.addEventListener('click', function(){
        self.dismiss(type);
      });

      banner.appendChild(strong);
      banner.appendChild(text);
      banner.appendChild(btn);
      document.body.appendChild(banner);

      this._activeBanners[type] = banner;
    },

    dismiss(type) {
      var b = this._activeBanners[type];
      if (b && b.parentElement) {
        try { b.parentElement.removeChild(b); } catch(_){}
      }
      delete this._activeBanners[type];
    },

    /* ---- Ejecutar todos los checks ---- */
    async runAll() {
      try {
        await Promise.all([
          this.checkStorageQuota(),
          this.checkIndexedDB(),
          this.checkAntivirusInterference()
        ]);
      } catch(_){}
      this.checkPageVisibility();
      this.checkClockDrift();
      this.checks._lastRun = Date.now();
      // Notifica a listeners (status-page.html)
      try {
        var ev = new CustomEvent('volvix-sysmon-update', { detail: this.checks });
        document.dispatchEvent(ev);
      } catch(_){}
      return this.checks;
    },

    /* ---- Auto-arranque ---- */
    autoStart() {
      if (this._started) return;
      this._started = true;
      var self = this;
      var run = function(){
        self.runAll();
        // Heart-beat horario
        if (!self._interval) {
          self._interval = setInterval(function(){ self.runAll(); }, HOURLY_MS);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
      } else {
        run();
      }
    }
  };

  global.VolvixSysMon = SysMon;

  // Auto-start
  try { SysMon.autoStart(); } catch(_){}
})(typeof window !== 'undefined' ? window : this);
