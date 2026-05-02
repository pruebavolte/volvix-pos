/**
 * volvix-airtable-wiring.js
 * Airtable integration layer for Volvix.
 * Exposes window.AirtableAPI with bases / tables / records CRUD + sync.
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    baseUrl: 'https://api.airtable.com/v0',
    metaUrl: 'https://api.airtable.com/v0/meta',
    timeout: 20000,
    pageSize: 100,
    retries: 3,
    retryDelay: 800,
    syncIntervalMs: 60_000,
  };

  const state = {
    apiKey: null,
    baseId: null,
    cache: new Map(),       // key: `${baseId}:${table}` -> { records, ts }
    syncTimers: new Map(),  // key -> intervalId
    listeners: new Map(),   // key -> Set<fn>
    inflight: new Map(),    // dedupe concurrent fetches
  };

  // ────────────────── helpers ──────────────────
  function log(...args) {
    if (global.AIRTABLE_DEBUG) console.log('[AirtableAPI]', ...args);
  }

  function err(msg, extra) {
    const e = new Error(msg);
    if (extra) e.detail = extra;
    return e;
  }

  function requireAuth() {
    if (!state.apiKey) throw err('AirtableAPI: missing API key. Call configure({apiKey,baseId}) first.');
  }

  function buildHeaders(extra = {}) {
    requireAuth();
    return Object.assign({
      'Authorization': `Bearer ${state.apiKey}`,
      'Content-Type': 'application/json',
    }, extra);
  }

  function encodePath(seg) {
    return encodeURIComponent(seg);
  }

  function qs(params) {
    if (!params) return '';
    const parts = [];
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      if (Array.isArray(v)) {
        v.forEach((item, i) => parts.push(`${encodeURIComponent(k)}[${i}]=${encodeURIComponent(item)}`));
      } else if (typeof v === 'object') {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(JSON.stringify(v))}`);
      } else {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function fetchWithRetry(url, opts = {}, attempt = 0) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULTS.timeout);
    try {
      const res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
      clearTimeout(timer);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < DEFAULTS.retries) {
          const wait = DEFAULTS.retryDelay * Math.pow(2, attempt);
          log('retry', res.status, 'in', wait, 'ms');
          await delay(wait);
          return fetchWithRetry(url, opts, attempt + 1);
        }
      }
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!res.ok) throw err(`Airtable HTTP ${res.status}`, data);
      return data;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw err('Airtable request timed out');
      throw e;
    }
  }

  function cacheKey(baseId, table) {
    return `${baseId || state.baseId}:${table}`;
  }

  function emit(key, payload) {
    const set = state.listeners.get(key);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.error('[AirtableAPI listener]', e); }
    }
  }

  // ────────────────── meta: bases & tables ──────────────────
  async function listBases() {
    return fetchWithRetry(`${DEFAULTS.metaUrl}/bases`, { headers: buildHeaders() });
  }

  async function listTables(baseId) {
    const id = baseId || state.baseId;
    if (!id) throw err('listTables: baseId required');
    return fetchWithRetry(`${DEFAULTS.metaUrl}/bases/${encodePath(id)}/tables`, { headers: buildHeaders() });
  }

  async function createTable(baseId, schema) {
    const id = baseId || state.baseId;
    return fetchWithRetry(`${DEFAULTS.metaUrl}/bases/${encodePath(id)}/tables`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(schema),
    });
  }

  // ────────────────── records: CRUD ──────────────────
  async function listRecords(table, params = {}, baseId) {
    const id = baseId || state.baseId;
    if (!id) throw err('listRecords: baseId required');
    const dedupe = `list:${id}:${table}:${JSON.stringify(params)}`;
    if (state.inflight.has(dedupe)) return state.inflight.get(dedupe);
    const promise = (async () => {
      const out = [];
      let offset;
      do {
        const url = `${DEFAULTS.baseUrl}/${encodePath(id)}/${encodePath(table)}${qs(Object.assign({ pageSize: DEFAULTS.pageSize }, params, offset ? { offset } : {}))}`;
        const page = await fetchWithRetry(url, { headers: buildHeaders() });
        out.push(...(page.records || []));
        offset = page.offset;
      } while (offset);
      return out;
    })();
    state.inflight.set(dedupe, promise);
    try { return await promise; } finally { state.inflight.delete(dedupe); }
  }

  async function getRecord(table, recordId, baseId) {
    const id = baseId || state.baseId;
    return fetchWithRetry(`${DEFAULTS.baseUrl}/${encodePath(id)}/${encodePath(table)}/${encodePath(recordId)}`, {
      headers: buildHeaders(),
    });
  }

  async function createRecords(table, records, baseId) {
    const id = baseId || state.baseId;
    const arr = Array.isArray(records) ? records : [records];
    const chunks = [];
    for (let i = 0; i < arr.length; i += 10) chunks.push(arr.slice(i, i + 10));
    const results = [];
    for (const chunk of chunks) {
      const body = JSON.stringify({
        records: chunk.map(r => r.fields ? r : { fields: r }),
        typecast: true,
      });
      const data = await fetchWithRetry(`${DEFAULTS.baseUrl}/${encodePath(id)}/${encodePath(table)}`, {
        method: 'POST', headers: buildHeaders(), body,
      });
      results.push(...(data.records || []));
    }
    invalidateCache(id, table);
    emit(cacheKey(id, table), { type: 'create', records: results });
    return results;
  }

  async function updateRecords(table, records, baseId, { replace = false } = {}) {
    const id = baseId || state.baseId;
    const arr = Array.isArray(records) ? records : [records];
    const chunks = [];
    for (let i = 0; i < arr.length; i += 10) chunks.push(arr.slice(i, i + 10));
    const method = replace ? 'PUT' : 'PATCH';
    const results = [];
    for (const chunk of chunks) {
      const body = JSON.stringify({ records: chunk, typecast: true });
      const data = await fetchWithRetry(`${DEFAULTS.baseUrl}/${encodePath(id)}/${encodePath(table)}`, {
        method, headers: buildHeaders(), body,
      });
      results.push(...(data.records || []));
    }
    invalidateCache(id, table);
    emit(cacheKey(id, table), { type: 'update', records: results });
    return results;
  }

  async function deleteRecords(table, recordIds, baseId) {
    const id = baseId || state.baseId;
    const arr = Array.isArray(recordIds) ? recordIds : [recordIds];
    const out = [];
    for (let i = 0; i < arr.length; i += 10) {
      const chunk = arr.slice(i, i + 10);
      const url = `${DEFAULTS.baseUrl}/${encodePath(id)}/${encodePath(table)}${qs({ records: chunk })}`;
      const data = await fetchWithRetry(url, { method: 'DELETE', headers: buildHeaders() });
      out.push(...(data.records || []));
    }
    invalidateCache(id, table);
    emit(cacheKey(id, table), { type: 'delete', ids: arr });
    return out;
  }

  async function upsertRecords(table, records, keyFields, baseId) {
    const id = baseId || state.baseId;
    const body = JSON.stringify({
      performUpsert: { fieldsToMergeOn: keyFields },
      records: (Array.isArray(records) ? records : [records]).map(r => r.fields ? r : { fields: r }),
      typecast: true,
    });
    const data = await fetchWithRetry(`${DEFAULTS.baseUrl}/${encodePath(id)}/${encodePath(table)}`, {
      method: 'PATCH', headers: buildHeaders(), body,
    });
    invalidateCache(id, table);
    emit(cacheKey(id, table), { type: 'upsert', records: data.records || [] });
    return data;
  }

  // ────────────────── cache & sync ──────────────────
  function invalidateCache(baseId, table) {
    if (!table) {
      state.cache.clear();
      return;
    }
    state.cache.delete(cacheKey(baseId, table));
  }

  function getCached(table, baseId) {
    const entry = state.cache.get(cacheKey(baseId, table));
    return entry ? entry.records : null;
  }

  async function syncTable(table, params = {}, baseId) {
    const key = cacheKey(baseId, table);
    const records = await listRecords(table, params, baseId);
    state.cache.set(key, { records, ts: Date.now() });
    emit(key, { type: 'sync', records });
    return records;
  }

  function startSync(table, params = {}, baseId, intervalMs = DEFAULTS.syncIntervalMs) {
    const key = cacheKey(baseId, table);
    stopSync(table, baseId);
    syncTable(table, params, baseId).catch(e => console.error('[AirtableAPI sync]', e));
    const tid = setInterval(() => {
      syncTable(table, params, baseId).catch(e => console.error('[AirtableAPI sync]', e));
    }, intervalMs);
    state.syncTimers.set(key, tid);
    return key;
  }

  function stopSync(table, baseId) {
    const key = cacheKey(baseId, table);
    const t = state.syncTimers.get(key);
    if (t) { clearInterval(t); state.syncTimers.delete(key); }
  }

  function stopAllSync() {
    for (const t of state.syncTimers.values()) clearInterval(t);
    state.syncTimers.clear();
  }

  function on(table, fn, baseId) {
    const key = cacheKey(baseId, table);
    if (!state.listeners.has(key)) state.listeners.set(key, new Set());
    state.listeners.get(key).add(fn);
    return () => off(table, fn, baseId);
  }

  function off(table, fn, baseId) {
    const key = cacheKey(baseId, table);
    const set = state.listeners.get(key);
    if (set) set.delete(fn);
  }

  // ────────────────── config & ping ──────────────────
  function configure(opts = {}) {
    if (opts.apiKey) state.apiKey = opts.apiKey;
    if (opts.baseId) state.baseId = opts.baseId;
    if (opts.timeout) DEFAULTS.timeout = opts.timeout;
    if (opts.pageSize) DEFAULTS.pageSize = opts.pageSize;
    if (opts.syncIntervalMs) DEFAULTS.syncIntervalMs = opts.syncIntervalMs;
    log('configured', { baseId: state.baseId, hasKey: !!state.apiKey });
    return { ok: true };
  }

  async function ping() {
    try {
      await listBases();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message, detail: e.detail };
    }
  }

  function getState() {
    return {
      baseId: state.baseId,
      hasKey: !!state.apiKey,
      cachedTables: [...state.cache.keys()],
      syncing: [...state.syncTimers.keys()],
    };
  }

  // ────────────────── public surface ──────────────────
  const AirtableAPI = {
    configure,
    ping,
    getState,
    // meta
    listBases,
    listTables,
    createTable,
    // records
    listRecords,
    getRecord,
    createRecords,
    updateRecords,
    deleteRecords,
    upsertRecords,
    // cache & sync
    syncTable,
    startSync,
    stopSync,
    stopAllSync,
    invalidateCache,
    getCached,
    on,
    off,
  };

  global.AirtableAPI = AirtableAPI;
  log('window.AirtableAPI ready');
})(typeof window !== 'undefined' ? window : globalThis);
