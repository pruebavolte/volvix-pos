/**
 * volvix-audit-wiring.js
 * Volvix POS — Audit Logs (Compliance / GDPR-RGPD)
 * Agent-32 · Ronda 8 Fibonacci
 *
 * Exposes window.AuditAPI with:
 *   log(action, details)         track any user action
 *   change(entity, before, after) record data changes
 *   search(query)                search/filter logs
 *   export(format)               export csv/json for auditors
 *   setRetention(days)           configure retention
 *   purge()                      apply retention
 *   gdprReport(userId)           GDPR/RGPD compliance report
 *   list(filter)                 list with filters
 *   stats()                      counters & stats
 *   clear()                      wipe (admin only)
 *   on(event, cb) / off(event, cb)
 *
 * Storage: localStorage key "volvix.audit.log.v1"
 * Critical actions are highlighted (level=critical).
 */
(function (global) {
  'use strict';

  // ----------------------------------------------------------------------- //
  // 1. Constants & configuration
  // ----------------------------------------------------------------------- //
  var STORAGE_KEY      = 'volvix.audit.log.v1';
  var CONFIG_KEY       = 'volvix.audit.config.v1';
  var SESSION_KEY      = 'volvix.audit.session.v1';
  var MAX_ENTRIES      = 50000;
  var DEFAULT_RETENTION_DAYS = 365; // GDPR default
  var VERSION          = '1.0.0';

  var LEVELS = {
    INFO:     'info',
    WARN:     'warn',
    CRITICAL: 'critical',
    SECURITY: 'security'
  };

  // Actions considered critical for compliance highlighting
  var CRITICAL_ACTIONS = [
    'user.login.failed',
    'user.password.change',
    'user.role.change',
    'user.delete',
    'user.export',
    'data.delete',
    'data.export',
    'sale.void',
    'sale.refund',
    'cash.adjust',
    'config.change',
    'permission.grant',
    'permission.revoke',
    'gdpr.request',
    'gdpr.erasure',
    'security.breach',
    'audit.purge',
    'audit.clear'
  ];

  var CATEGORIES = {
    AUTH:     'auth',
    DATA:     'data',
    SALE:     'sale',
    CONFIG:   'config',
    SECURITY: 'security',
    GDPR:     'gdpr',
    SYSTEM:   'system',
    UI:       'ui'
  };

  // ----------------------------------------------------------------------- //
  // 2. Internal state
  // ----------------------------------------------------------------------- //
  var entries     = [];
  var listeners   = {};
  var sessionId   = null;
  var clientIp    = null;
  var config      = {
    retentionDays: DEFAULT_RETENTION_DAYS,
    captureIp:     true,
    captureUA:     true,
    maxEntries:    MAX_ENTRIES,
    autoFlush:     true,
    highlightCritical: true
  };

  // ----------------------------------------------------------------------- //
  // 3. Utilities
  // ----------------------------------------------------------------------- //
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function now() { return new Date().toISOString(); }

  function safeParse(s, fallback) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  function safeStringify(o) {
    try { return JSON.stringify(o); } catch (e) { return '"<unserializable>"'; }
  }

  function deepClone(v) { return safeParse(safeStringify(v), null); }

  function diff(before, after) {
    var b = before || {}, a = after || {};
    var keys = Object.keys(b).concat(Object.keys(a));
    var seen = {}, changes = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (seen[k]) continue;
      seen[k] = 1;
      var bv = b[k], av = a[k];
      if (safeStringify(bv) !== safeStringify(av)) {
        changes[k] = { before: bv === undefined ? null : bv, after: av === undefined ? null : av };
      }
    }
    return changes;
  }

  function isCritical(action) {
    if (!action) return false;
    for (var i = 0; i < CRITICAL_ACTIONS.length; i++) {
      if (action === CRITICAL_ACTIONS[i] || action.indexOf(CRITICAL_ACTIONS[i]) === 0) return true;
    }
    return false;
  }

  function getCategory(action) {
    if (!action) return CATEGORIES.SYSTEM;
    var prefix = String(action).split('.')[0];
    if (CATEGORIES[prefix.toUpperCase()]) return CATEGORIES[prefix.toUpperCase()];
    if (prefix === 'user' || prefix === 'login' || prefix === 'logout') return CATEGORIES.AUTH;
    if (prefix === 'sale' || prefix === 'invoice' || prefix === 'cash') return CATEGORIES.SALE;
    if (prefix === 'gdpr' || prefix === 'rgpd') return CATEGORIES.GDPR;
    return CATEGORIES.SYSTEM;
  }

  function emit(event, payload) {
    var arr = listeners[event] || [];
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](payload); } catch (e) { /* swallow */ }
    }
  }

  // ----------------------------------------------------------------------- //
  // 4. Persistence
  // ----------------------------------------------------------------------- //
  function load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      entries = raw ? (safeParse(raw, []) || []) : [];
    } catch (e) { entries = []; }

    try {
      var c = global.localStorage && global.localStorage.getItem(CONFIG_KEY);
      var loaded = c ? safeParse(c, null) : null;
      if (loaded) {
        for (var k in loaded) if (loaded.hasOwnProperty(k)) config[k] = loaded[k];
      }
    } catch (e) { /* keep defaults */ }
  }

  function persist() {
    if (!config.autoFlush) return;
    try {
      if (entries.length > config.maxEntries) {
        entries = entries.slice(entries.length - config.maxEntries);
      }
      global.localStorage && global.localStorage.setItem(STORAGE_KEY, safeStringify(entries));
    } catch (e) {
      // quota exceeded — drop oldest 25%
      try {
        entries = entries.slice(Math.floor(entries.length * 0.25));
        global.localStorage.setItem(STORAGE_KEY, safeStringify(entries));
      } catch (e2) { /* give up */ }
    }
  }

  function persistConfig() {
    try {
      global.localStorage && global.localStorage.setItem(CONFIG_KEY, safeStringify(config));
    } catch (e) { /* ignore */ }
  }

  // ----------------------------------------------------------------------- //
  // 5. Session & environment
  // ----------------------------------------------------------------------- //
  function initSession() {
    try {
      var s = global.sessionStorage && global.sessionStorage.getItem(SESSION_KEY);
      if (s) { sessionId = s; return; }
      sessionId = uuid();
      global.sessionStorage && global.sessionStorage.setItem(SESSION_KEY, sessionId);
    } catch (e) {
      sessionId = uuid();
    }
  }

  function detectIp(cb) {
    if (!config.captureIp) { cb(null); return; }
    // Best-effort, never blocks. Multiple fallbacks.
    try {
      if (global.fetch) {
        var ctrl = global.AbortController ? new global.AbortController() : null;
        var t = setTimeout(function () { ctrl && ctrl.abort(); }, 1500);
        global.fetch('https://api.ipify.org?format=json', { signal: ctrl ? ctrl.signal : undefined })
          .then(function (r) { return r.json(); })
          .then(function (j) { clearTimeout(t); clientIp = j && j.ip ? j.ip : null; cb(clientIp); })
          .catch(function () { clearTimeout(t); clientIp = null; cb(null); });
        return;
      }
    } catch (e) { /* ignore */ }
    cb(null);
  }

  function getCurrentUser() {
    try {
      if (global.VolvixSession && typeof global.VolvixSession.getUser === 'function') {
        return global.VolvixSession.getUser() || { id: 'anonymous', name: 'anonymous' };
      }
      var raw = global.localStorage && global.localStorage.getItem('volvix.session.user');
      if (raw) return safeParse(raw, { id: 'anonymous', name: 'anonymous' });
    } catch (e) { /* ignore */ }
    return { id: 'anonymous', name: 'anonymous', role: 'unknown' };
  }

  // ----------------------------------------------------------------------- //
  // 6. Core: log entry creation
  // ----------------------------------------------------------------------- //
  function buildEntry(action, details, opts) {
    opts = opts || {};
    var user = getCurrentUser();
    var critical = isCritical(action) || opts.level === LEVELS.CRITICAL;
    var entry = {
      id:        uuid(),
      ts:        now(),
      epoch:     Date.now(),
      action:    action || 'unknown',
      category:  opts.category || getCategory(action),
      level:     critical ? LEVELS.CRITICAL : (opts.level || LEVELS.INFO),
      critical:  !!critical,
      message:   opts.message || '',
      user: {
        id:    user.id    || 'anonymous',
        name:  user.name  || 'anonymous',
        role:  user.role  || 'unknown',
        email: user.email || null
      },
      session:   sessionId,
      ip:        clientIp,
      ua:        config.captureUA && global.navigator ? (global.navigator.userAgent || '') : '',
      url:       global.location ? global.location.href : '',
      referrer:  global.document ? (global.document.referrer || '') : '',
      details:   details ? deepClone(details) : null,
      version:   VERSION
    };
    return entry;
  }

  function pushEntry(entry) {
    entries.push(entry);
    if (entries.length > config.maxEntries) {
      entries.splice(0, entries.length - config.maxEntries);
    }
    persist();
    emit('entry', entry);
    if (entry.critical) emit('critical', entry);
  }

  // ----------------------------------------------------------------------- //
  // 7. Public: log / change
  // ----------------------------------------------------------------------- //
  function log(action, details, opts) {
    var entry = buildEntry(action, details, opts);
    pushEntry(entry);
    return entry.id;
  }

  function change(entity, before, after, opts) {
    opts = opts || {};
    var changes = diff(before, after);
    var entry = buildEntry(opts.action || ('data.change.' + (entity || 'unknown')), {
      entity:  entity,
      before:  deepClone(before),
      after:   deepClone(after),
      changes: changes,
      changedKeys: Object.keys(changes)
    }, {
      category: CATEGORIES.DATA,
      level:    opts.level || (Object.keys(changes).length === 0 ? LEVELS.INFO : LEVELS.INFO),
      message:  opts.message || ('Changed ' + Object.keys(changes).length + ' field(s) on ' + entity)
    });
    pushEntry(entry);
    return entry.id;
  }

  // ----------------------------------------------------------------------- //
  // 8. Search / filtering
  // ----------------------------------------------------------------------- //
  function matches(entry, q) {
    if (!q) return true;
    if (typeof q === 'string') {
      var hay = (entry.action + ' ' + entry.message + ' ' + entry.user.name + ' ' +
                 entry.user.id + ' ' + safeStringify(entry.details)).toLowerCase();
      return hay.indexOf(q.toLowerCase()) !== -1;
    }
    // object filter
    if (q.action   && entry.action.indexOf(q.action) === -1) return false;
    if (q.category && entry.category !== q.category) return false;
    if (q.level    && entry.level    !== q.level)    return false;
    if (q.userId   && entry.user.id  !== q.userId)   return false;
    if (q.critical === true  && !entry.critical)     return false;
    if (q.critical === false &&  entry.critical)     return false;
    if (q.from && entry.epoch < new Date(q.from).getTime()) return false;
    if (q.to   && entry.epoch > new Date(q.to).getTime())   return false;
    if (q.text) {
      var hay2 = (entry.action + ' ' + entry.message + ' ' + safeStringify(entry.details)).toLowerCase();
      if (hay2.indexOf(String(q.text).toLowerCase()) === -1) return false;
    }
    return true;
  }

  function search(query) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      if (matches(entries[i], query)) out.push(entries[i]);
    }
    return out;
  }

  function list(filter) {
    filter = filter || {};
    var res = search(filter);
    if (filter.sort === 'asc')  res.sort(function (a, b) { return a.epoch - b.epoch; });
    else                        res.sort(function (a, b) { return b.epoch - a.epoch; });
    if (filter.limit) res = res.slice(0, filter.limit);
    if (filter.offset) res = res.slice(filter.offset);
    return res;
  }

  // ----------------------------------------------------------------------- //
  // 9. Export (CSV / JSON / NDJSON)
  // ----------------------------------------------------------------------- //
  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'string' ? v : safeStringify(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows) {
    var headers = ['id','ts','action','category','level','critical','user_id','user_name',
                   'user_role','session','ip','ua','url','message','details'];
    var lines = [headers.join(',')];
    for (var i = 0; i < rows.length; i++) {
      var e = rows[i];
      lines.push([
        csvEscape(e.id), csvEscape(e.ts), csvEscape(e.action), csvEscape(e.category),
        csvEscape(e.level), csvEscape(e.critical), csvEscape(e.user.id), csvEscape(e.user.name),
        csvEscape(e.user.role), csvEscape(e.session), csvEscape(e.ip), csvEscape(e.ua),
        csvEscape(e.url), csvEscape(e.message), csvEscape(e.details)
      ].join(','));
    }
    return lines.join('\n');
  }

  function downloadBlob(content, filename, mime) {
    try {
      var blob = new Blob([content], { type: mime });
      var url  = URL.createObjectURL(blob);
      var a    = global.document.createElement('a');
      a.href = url; a.download = filename;
      global.document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        global.document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 250);
      return true;
    } catch (e) { return false; }
  }

  function exportLogs(format, filter) {
    format = (format || 'json').toLowerCase();
    var rows = list(filter || { sort: 'asc' });
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    log('audit.export', { format: format, count: rows.length }, { level: LEVELS.CRITICAL });

    if (format === 'csv') {
      var csv = toCSV(rows);
      downloadBlob(csv, 'volvix-audit-' + stamp + '.csv', 'text/csv;charset=utf-8');
      return csv;
    }
    if (format === 'ndjson') {
      var nd = rows.map(safeStringify).join('\n');
      downloadBlob(nd, 'volvix-audit-' + stamp + '.ndjson', 'application/x-ndjson');
      return nd;
    }
    var json = safeStringify({
      exported_at: now(),
      version:     VERSION,
      count:       rows.length,
      filter:      filter || null,
      entries:     rows
    });
    downloadBlob(json, 'volvix-audit-' + stamp + '.json', 'application/json');
    return json;
  }

  // ----------------------------------------------------------------------- //
  // 10. Retention & purge
  // ----------------------------------------------------------------------- //
  function setRetention(days) {
    days = parseInt(days, 10);
    if (isNaN(days) || days < 1) days = DEFAULT_RETENTION_DAYS;
    config.retentionDays = days;
    persistConfig();
    log('audit.retention.set', { days: days }, { level: LEVELS.CRITICAL });
    return days;
  }

  function purge() {
    var cutoff = Date.now() - (config.retentionDays * 24 * 3600 * 1000);
    var before = entries.length;
    entries = entries.filter(function (e) { return e.epoch >= cutoff; });
    var removed = before - entries.length;
    persist();
    log('audit.purge', { removed: removed, retentionDays: config.retentionDays },
        { level: LEVELS.CRITICAL });
    emit('purge', { removed: removed });
    return removed;
  }

  // ----------------------------------------------------------------------- //
  // 11. GDPR / RGPD report
  // ----------------------------------------------------------------------- //
  function gdprReport(userId) {
    if (!userId) throw new Error('gdprReport: userId required');
    var rows = list({ userId: userId, sort: 'asc' });
    var byCategory = {}, byAction = {}, criticalCount = 0;
    for (var i = 0; i < rows.length; i++) {
      var e = rows[i];
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byAction[e.action]     = (byAction[e.action] || 0) + 1;
      if (e.critical) criticalCount++;
    }
    var report = {
      generated_at:  now(),
      version:       VERSION,
      regulation:    'GDPR/RGPD',
      subject:       { userId: userId },
      retentionDays: config.retentionDays,
      total:         rows.length,
      criticalCount: criticalCount,
      firstSeen:     rows.length ? rows[0].ts : null,
      lastSeen:      rows.length ? rows[rows.length - 1].ts : null,
      byCategory:    byCategory,
      byAction:      byAction,
      entries:       rows
    };
    log('gdpr.request', { userId: userId, total: rows.length }, { level: LEVELS.CRITICAL });
    return report;
  }

  function gdprErasure(userId) {
    if (!userId) throw new Error('gdprErasure: userId required');
    var before = entries.length;
    // Pseudonymise instead of full delete to preserve audit integrity
    var anonId = 'erased-' + uuid().slice(0, 8);
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].user && entries[i].user.id === userId) {
        entries[i].user = { id: anonId, name: '[ERASED]', role: 'erased', email: null };
        if (entries[i].details && typeof entries[i].details === 'object') {
          entries[i].details = { erased: true };
        }
      }
    }
    persist();
    log('gdpr.erasure', { userId: userId, replacedWith: anonId, scanned: before },
        { level: LEVELS.CRITICAL });
    return { ok: true, anonId: anonId };
  }

  // ----------------------------------------------------------------------- //
  // 12. Stats
  // ----------------------------------------------------------------------- //
  function stats() {
    var byCategory = {}, byLevel = {}, byUser = {}, criticalCount = 0;
    var minE = Infinity, maxE = -Infinity;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byLevel[e.level]       = (byLevel[e.level] || 0) + 1;
      var uid = e.user ? e.user.id : 'unknown';
      byUser[uid]            = (byUser[uid] || 0) + 1;
      if (e.critical) criticalCount++;
      if (e.epoch < minE) minE = e.epoch;
      if (e.epoch > maxE) maxE = e.epoch;
    }
    return {
      total:         entries.length,
      criticalCount: criticalCount,
      byCategory:    byCategory,
      byLevel:       byLevel,
      byUser:        byUser,
      firstEpoch:    minE === Infinity ? null : minE,
      lastEpoch:     maxE === -Infinity ? null : maxE,
      retentionDays: config.retentionDays,
      sessionId:     sessionId,
      ip:            clientIp
    };
  }

  // ----------------------------------------------------------------------- //
  // 13. Events
  // ----------------------------------------------------------------------- //
  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function off(event, cb) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(function (f) { return f !== cb; });
  }

  // ----------------------------------------------------------------------- //
  // 14. Auto-wiring (best effort, non-intrusive)
  // ----------------------------------------------------------------------- //
  function autoWire() {
    if (!global.document) return;
    try {
      // Track form submissions
      global.document.addEventListener('submit', function (ev) {
        var f = ev.target;
        if (!f || !f.tagName || f.tagName !== 'FORM') return;
        log('ui.form.submit', {
          formId:   f.id   || null,
          formName: f.name || null,
          action:   f.action || null
        }, { category: CATEGORIES.UI });
      }, true);

      // Track clicks on buttons / [data-audit]
      global.document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t) return;
        var tag = (t.tagName || '').toUpperCase();
        var auditTag = t.getAttribute && t.getAttribute('data-audit');
        if (auditTag) {
          log(auditTag, { text: t.innerText ? t.innerText.slice(0, 80) : '' },
              { category: CATEGORIES.UI });
        } else if (tag === 'BUTTON' && t.type === 'submit') {
          log('ui.button.submit', { text: t.innerText ? t.innerText.slice(0, 80) : '' },
              { category: CATEGORIES.UI });
        }
      }, true);

      // Track navigation
      global.addEventListener('hashchange', function () {
        log('ui.navigation', { url: global.location.href }, { category: CATEGORIES.UI });
      });

      // Track unload
      global.addEventListener('beforeunload', function () {
        log('session.end', { duration_ms: Date.now() - startedAt },
            { category: CATEGORIES.SYSTEM });
      });
    } catch (e) { /* ignore wiring failures */ }
  }

  // ----------------------------------------------------------------------- //
  // 15. Boot
  // ----------------------------------------------------------------------- //
  var startedAt = Date.now();
  load();
  initSession();
  detectIp(function () {
    log('session.start', { startedAt: startedAt }, { category: CATEGORIES.SYSTEM });
  });

  // ----------------------------------------------------------------------- //
  // 16. Public API
  // ----------------------------------------------------------------------- //
  var AuditAPI = {
    VERSION:       VERSION,
    LEVELS:        LEVELS,
    CATEGORIES:    CATEGORIES,
    CRITICAL_ACTIONS: CRITICAL_ACTIONS.slice(),

    log:           log,
    change:        change,
    search:        search,
    list:          list,
    export:        exportLogs,
    exportLogs:    exportLogs, // alias (export is reserved in some contexts)
    setRetention:  setRetention,
    getRetention:  function () { return config.retentionDays; },
    purge:         purge,
    gdprReport:    gdprReport,
    gdprErasure:   gdprErasure,
    stats:         stats,
    on:            on,
    off:           off,
    isCritical:    isCritical,

    getConfig: function () { return deepClone(config); },
    setConfig: function (patch) {
      if (!patch || typeof patch !== 'object') return;
      for (var k in patch) if (patch.hasOwnProperty(k)) config[k] = patch[k];
      persistConfig();
      log('audit.config.change', patch, { level: LEVELS.CRITICAL });
    },

    clear: function (confirmToken) {
      if (confirmToken !== 'CONFIRM_WIPE_AUDIT') {
        throw new Error('audit.clear requires confirmToken="CONFIRM_WIPE_AUDIT"');
      }
      var n = entries.length;
      entries = [];
      persist();
      log('audit.clear', { removed: n }, { level: LEVELS.CRITICAL });
      return n;
    },

    sessionId: function () { return sessionId; },
    ip:        function () { return clientIp; },

    // Auto-wiring control
    autoWire:  autoWire
  };

  // Auto-wire on DOMContentLoaded
  if (global.document && global.document.readyState !== 'loading') {
    autoWire();
  } else if (global.document) {
    global.document.addEventListener('DOMContentLoaded', autoWire);
  }

  global.AuditAPI = AuditAPI;
  global.VolvixAudit = AuditAPI; // namespaced alias

})(typeof window !== 'undefined' ? window : this);
