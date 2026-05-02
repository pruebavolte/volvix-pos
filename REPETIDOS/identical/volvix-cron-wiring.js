/* ============================================================================
 * volvix-cron-wiring.js
 * ----------------------------------------------------------------------------
 * Cron-like scheduler client-side para Volvix POS.
 * Soporta patrones:
 *   - interval:<ms>           Ejecuta cada N milisegundos
 *   - daily:HH:MM             Ejecuta diariamente a la hora HH:MM
 *   - weekly:DOW:HH:MM        DOW = 0..6 (0 = domingo)
 *   - monthly:DD:HH:MM        DD = 1..31 (si el mes no tiene ese día se omite)
 *   - once:<timestamp>        Ejecuta una sola vez en el timestamp indicado
 *
 * Tareas built-in: corte automático, backup, reports.
 * Persiste history de ejecuciones en localStorage.
 *
 * API global expuesta en window.CronAPI:
 *   schedule(name, pattern, fn, opts)
 *   unschedule(name)
 *   listJobs()
 *   runNow(name)
 *   getHistory(name?)
 *   clearHistory(name?)
 *   pause(name) / resume(name)
 *   start() / stop()
 * ==========================================================================*/
(function (root) {
  'use strict';

  // -------------------------------------------------------------------------
  // Constantes y estado
  // -------------------------------------------------------------------------
  var STORAGE_HISTORY_KEY = 'volvix.cron.history.v1';
  var STORAGE_JOBS_KEY    = 'volvix.cron.jobs.v1';
  var TICK_MS             = 30 * 1000;   // chequeo cada 30s
  var MAX_HISTORY_PER_JOB = 200;
  var LOG_PREFIX          = '[CronAPI]';

  var jobs        = Object.create(null);   // name -> jobObj
  var history     = Object.create(null);   // name -> [entries]
  var tickHandle  = null;
  var started     = false;

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------
  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.log.apply(console, args);
    } catch (_) { /* ignore */ }
  }

  function warn() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.warn.apply(console, args);
    } catch (_) { /* ignore */ }
  }

  function nowISO() { return new Date().toISOString(); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function safeJSONParse(s, fallback) {
    try { return JSON.parse(s); } catch (_) { return fallback; }
  }

  function loadHistory() {
    if (typeof localStorage === 'undefined') return;
    var raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return;
    var data = safeJSONParse(raw, null);
    if (data && typeof data === 'object') {
      history = data;
    }
  }

  function persistHistory() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      warn('No pude persistir history:', e && e.message);
    }
  }

  function pushHistory(name, entry) {
    if (!history[name]) history[name] = [];
    history[name].push(entry);
    if (history[name].length > MAX_HISTORY_PER_JOB) {
      history[name] = history[name].slice(-MAX_HISTORY_PER_JOB);
    }
    persistHistory();
  }

  // -------------------------------------------------------------------------
  // Parser de patrones
  // -------------------------------------------------------------------------
  function parsePattern(pattern) {
    if (typeof pattern !== 'string') {
      throw new Error('Pattern debe ser string');
    }
    var p = pattern.trim().toLowerCase();
    var parts = p.split(':');
    var kind = parts[0];

    if (kind === 'interval') {
      var ms = parseInt(parts[1], 10);
      if (!isFinite(ms) || ms < 1000) {
        throw new Error('interval requiere ms >= 1000');
      }
      return { kind: 'interval', ms: ms };
    }
    if (kind === 'daily') {
      var hd = parseInt(parts[1], 10);
      var md = parseInt(parts[2], 10);
      if (!validHM(hd, md)) throw new Error('daily HH:MM invalido');
      return { kind: 'daily', hour: hd, minute: md };
    }
    if (kind === 'weekly') {
      var dow = parseInt(parts[1], 10);
      var hw = parseInt(parts[2], 10);
      var mw = parseInt(parts[3], 10);
      if (!(dow >= 0 && dow <= 6)) throw new Error('weekly DOW invalido');
      if (!validHM(hw, mw)) throw new Error('weekly HH:MM invalido');
      return { kind: 'weekly', dow: dow, hour: hw, minute: mw };
    }
    if (kind === 'monthly') {
      var dd = parseInt(parts[1], 10);
      var hm = parseInt(parts[2], 10);
      var mm = parseInt(parts[3], 10);
      if (!(dd >= 1 && dd <= 31)) throw new Error('monthly DD invalido');
      if (!validHM(hm, mm)) throw new Error('monthly HH:MM invalido');
      return { kind: 'monthly', day: dd, hour: hm, minute: mm };
    }
    if (kind === 'once') {
      var ts = parseInt(parts[1], 10);
      if (!isFinite(ts)) throw new Error('once requiere timestamp');
      return { kind: 'once', at: ts };
    }
    throw new Error('Patron desconocido: ' + pattern);
  }

  function validHM(h, m) {
    return (h >= 0 && h <= 23 && m >= 0 && m <= 59);
  }

  // -------------------------------------------------------------------------
  // Calcular siguiente ejecución
  // -------------------------------------------------------------------------
  function computeNextRun(parsed, fromTs) {
    var base = fromTs || Date.now();
    var d    = new Date(base);

    if (parsed.kind === 'interval') {
      return base + parsed.ms;
    }
    if (parsed.kind === 'once') {
      return parsed.at;
    }
    if (parsed.kind === 'daily') {
      var nd = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                        parsed.hour, parsed.minute, 0, 0);
      if (nd.getTime() <= base) nd.setDate(nd.getDate() + 1);
      return nd.getTime();
    }
    if (parsed.kind === 'weekly') {
      var nw = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                        parsed.hour, parsed.minute, 0, 0);
      var diff = (parsed.dow - nw.getDay() + 7) % 7;
      nw.setDate(nw.getDate() + diff);
      if (nw.getTime() <= base) nw.setDate(nw.getDate() + 7);
      return nw.getTime();
    }
    if (parsed.kind === 'monthly') {
      var year  = d.getFullYear();
      var month = d.getMonth();
      for (var i = 0; i < 14; i++) {
        var lastDay = new Date(year, month + 1, 0).getDate();
        if (parsed.day <= lastDay) {
          var cand = new Date(year, month, parsed.day,
                              parsed.hour, parsed.minute, 0, 0);
          if (cand.getTime() > base) return cand.getTime();
        }
        month++;
        if (month > 11) { month = 0; year++; }
      }
      return base + 365 * 24 * 3600 * 1000;
    }
    return base + 60000;
  }

  // -------------------------------------------------------------------------
  // Ejecución de un job
  // -------------------------------------------------------------------------
  function executeJob(job, reason) {
    if (!job) return;
    if (job.running) {
      warn('Job ya ejecutandose, skip:', job.name);
      return;
    }
    job.running = true;
    var startedAt = Date.now();
    var entry = {
      name:    job.name,
      startedAt: startedAt,
      startedISO: new Date(startedAt).toISOString(),
      reason:  reason || 'scheduled',
      ok:      null,
      durationMs: 0,
      error:   null,
      result:  null
    };

    log('Ejecutando', job.name, '(' + entry.reason + ')');

    var done = function (ok, result, err) {
      entry.ok         = !!ok;
      entry.durationMs = Date.now() - startedAt;
      entry.result     = (typeof result === 'string') ? result : null;
      entry.error      = err ? String(err && err.message || err) : null;
      job.lastRun      = startedAt;
      job.lastOk       = entry.ok;
      job.runCount     = (job.runCount || 0) + 1;
      job.running      = false;
      pushHistory(job.name, entry);
      if (job.parsed.kind !== 'once') {
        job.nextRun = computeNextRun(job.parsed, Date.now());
      } else {
        job.nextRun = null;
        job.disabled = true;
      }
    };

    try {
      var ret = job.fn({
        name: job.name,
        reason: entry.reason,
        runCount: (job.runCount || 0) + 1
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(function (r) { done(true, r, null); },
                 function (e) { done(false, null, e); });
      } else {
        done(true, ret, null);
      }
    } catch (e) {
      done(false, null, e);
    }
  }

  // -------------------------------------------------------------------------
  // Tick principal
  // -------------------------------------------------------------------------
  function tick() {
    var now = Date.now();
    Object.keys(jobs).forEach(function (name) {
      var job = jobs[name];
      if (!job || job.disabled || job.paused) return;
      if (job.nextRun && now >= job.nextRun) {
        executeJob(job, 'tick');
      }
    });
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------
  function schedule(name, pattern, fn, opts) {
    if (!name || typeof name !== 'string') {
      throw new Error('schedule requiere name string');
    }
    if (typeof fn !== 'function') {
      throw new Error('schedule requiere fn callable');
    }
    var parsed = parsePattern(pattern);
    var job = {
      name:    name,
      pattern: pattern,
      parsed:  parsed,
      fn:      fn,
      opts:    opts || {},
      created: Date.now(),
      nextRun: computeNextRun(parsed, Date.now()),
      lastRun: null,
      lastOk:  null,
      runCount: 0,
      running: false,
      paused:  false,
      disabled: false
    };
    jobs[name] = job;
    log('Job registrado:', name, '|', pattern,
        '| next:', new Date(job.nextRun).toISOString());
    return job;
  }

  function unschedule(name) {
    if (jobs[name]) {
      delete jobs[name];
      log('Job removido:', name);
      return true;
    }
    return false;
  }

  function listJobs() {
    return Object.keys(jobs).map(function (n) {
      var j = jobs[n];
      return {
        name:     j.name,
        pattern:  j.pattern,
        nextRun:  j.nextRun,
        nextRunISO: j.nextRun ? new Date(j.nextRun).toISOString() : null,
        lastRun:  j.lastRun,
        lastRunISO: j.lastRun ? new Date(j.lastRun).toISOString() : null,
        lastOk:   j.lastOk,
        runCount: j.runCount,
        paused:   j.paused,
        disabled: j.disabled,
        running:  j.running
      };
    });
  }

  function runNow(name) {
    var job = jobs[name];
    if (!job) {
      warn('runNow: job no existe:', name);
      return false;
    }
    executeJob(job, 'manual');
    return true;
  }

  function getHistory(name) {
    if (name) return (history[name] || []).slice();
    var copy = {};
    Object.keys(history).forEach(function (k) { copy[k] = history[k].slice(); });
    return copy;
  }

  function clearHistory(name) {
    if (name) { delete history[name]; }
    else      { history = Object.create(null); }
    persistHistory();
  }

  function pause(name) {
    if (jobs[name]) { jobs[name].paused = true; return true; }
    return false;
  }
  function resume(name) {
    if (jobs[name]) {
      jobs[name].paused = false;
      jobs[name].nextRun = computeNextRun(jobs[name].parsed, Date.now());
      return true;
    }
    return false;
  }

  function start() {
    if (started) return;
    started = true;
    tickHandle = setInterval(tick, TICK_MS);
    setTimeout(tick, 1000);
    log('Scheduler iniciado (tick=' + TICK_MS + 'ms)');
  }

  function stop() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    started = false;
    log('Scheduler detenido');
  }

  // -------------------------------------------------------------------------
  // Tareas built-in (Volvix POS)
  // -------------------------------------------------------------------------
  function builtinCorteAutomatico(ctx) {
    log('[corte] Ejecutando corte automatico de caja...');
    try {
      if (root.VolvixPOS && typeof root.VolvixPOS.corteCaja === 'function') {
        return root.VolvixPOS.corteCaja({ source: 'cron', ctx: ctx });
      }
    } catch (e) { warn('corte falló:', e && e.message); }
    return 'corte-noop';
  }

  function builtinBackup(ctx) {
    log('[backup] Generando snapshot localStorage...');
    var snap = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('volvix.') === 0) snap[k] = localStorage.getItem(k);
      }
      var stamp = new Date().toISOString().replace(/[:.]/g, '-');
      localStorage.setItem('volvix.backup.' + stamp, JSON.stringify(snap));
      return 'backup-ok:' + stamp;
    } catch (e) {
      warn('backup falló:', e && e.message);
      throw e;
    }
  }

  function builtinReports(ctx) {
    log('[reports] Compilando reporte diario...');
    try {
      if (root.VolvixPOS && typeof root.VolvixPOS.generarReporte === 'function') {
        return root.VolvixPOS.generarReporte({ tipo: 'diario', source: 'cron' });
      }
    } catch (e) { warn('reporte falló:', e && e.message); }
    return 'report-stub';
  }

  function registerBuiltins() {
    if (!jobs['volvix.corte.diario']) {
      schedule('volvix.corte.diario', 'daily:23:30', builtinCorteAutomatico);
    }
    if (!jobs['volvix.backup.cada6h']) {
      schedule('volvix.backup.cada6h', 'interval:' + (6 * 3600 * 1000), builtinBackup);
    }
    if (!jobs['volvix.reports.semanal']) {
      schedule('volvix.reports.semanal', 'weekly:1:08:00', builtinReports);
    }
  }

  // -------------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------------
  loadHistory();

  var CronAPI = {
    schedule:     schedule,
    unschedule:   unschedule,
    listJobs:     listJobs,
    runNow:       runNow,
    getHistory:   getHistory,
    clearHistory: clearHistory,
    pause:        pause,
    resume:       resume,
    start:        start,
    stop:         stop,
    _builtins: {
      corte:   builtinCorteAutomatico,
      backup:  builtinBackup,
      reports: builtinReports
    },
    _internal: {
      parsePattern:    parsePattern,
      computeNextRun:  computeNextRun
    },
    version: '1.0.0'
  };

  root.CronAPI = CronAPI;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        registerBuiltins();
        start();
      });
    } else {
      registerBuiltins();
      start();
    }
  } else {
    registerBuiltins();
    start();
  }

  log('volvix-cron-wiring.js cargado, version', CronAPI.version);
})(typeof window !== 'undefined' ? window : this);
