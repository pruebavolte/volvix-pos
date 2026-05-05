/* volvix-indexeddb-wiring.js
 * IndexedDB wrapper offline-first con sync hacia Supabase.
 * Expone window.IDB con API: open, put, get, getAll, query, delete, clear,
 * bulkPut, count, sync, pendingOps, flush, onChange.
 *
 * Stores principales:
 *  - productos    (keyPath: id)
 *  - clientes     (keyPath: id)
 *  - ventas       (keyPath: id)
 *  - venta_items  (keyPath: id, index: venta_id)
 *  - inventario   (keyPath: id, index: producto_id)
 *  - usuarios     (keyPath: id)
 *  - cajas        (keyPath: id)
 *  - movimientos  (keyPath: id, index: caja_id)
 *  - outbox       (keyPath: id, autoIncrement) -> ops pendientes de sync
 *  - meta         (keyPath: key) -> last_sync, device_id, etc.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'volvix_pos';
  const DB_VERSION = 3;

  const STORES = {
    productos:    { keyPath: 'id', indexes: [['sku','sku',{unique:false}], ['nombre','nombre',{unique:false}]] },
    clientes:     { keyPath: 'id', indexes: [['rfc','rfc',{unique:false}], ['nombre','nombre',{unique:false}]] },
    ventas:       { keyPath: 'id', indexes: [['fecha','fecha',{unique:false}], ['caja_id','caja_id',{unique:false}]] },
    venta_items:  { keyPath: 'id', indexes: [['venta_id','venta_id',{unique:false}], ['producto_id','producto_id',{unique:false}]] },
    inventario:   { keyPath: 'id', indexes: [['producto_id','producto_id',{unique:false}]] },
    usuarios:     { keyPath: 'id', indexes: [['email','email',{unique:true}]] },
    cajas:        { keyPath: 'id', indexes: [] },
    movimientos:  { keyPath: 'id', indexes: [['caja_id','caja_id',{unique:false}], ['fecha','fecha',{unique:false}]] },
    outbox:       { keyPath: 'id', autoIncrement: true, indexes: [['store','store',{unique:false}], ['ts','ts',{unique:false}]] },
    meta:         { keyPath: 'key', indexes: [] }
  };

  let _db = null;
  let _opening = null;
  const _listeners = new Map(); // store -> Set<fn>

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0, v = c==='x'? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  function emit(store, change) {
    const set = _listeners.get(store);
    if (!set) return;
    set.forEach(fn => { try { fn(change); } catch(e){ console.warn('[IDB] listener err', e);} });
  }

  function onChange(store, fn) {
    if (!_listeners.has(store)) _listeners.set(store, new Set());
    _listeners.get(store).add(fn);
    return () => _listeners.get(store).delete(fn);
  }

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_opening) return _opening;
    _opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        Object.entries(STORES).forEach(([name, def]) => {
          let store;
          if (!db.objectStoreNames.contains(name)) {
            const opts = {};
            if (def.keyPath) opts.keyPath = def.keyPath;
            if (def.autoIncrement) opts.autoIncrement = true;
            store = db.createObjectStore(name, opts);
          } else {
            store = req.transaction.objectStore(name);
          }
          (def.indexes || []).forEach(([idxName, keyPath, opts]) => {
            if (!store.indexNames.contains(idxName)) {
              store.createIndex(idxName, keyPath, opts || {});
            }
          });
        });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => console.warn('[IDB] open blocked');
    });
    return _opening;
  }

  function tx(stores, mode='readonly') {
    return open().then(db => {
      const t = db.transaction(stores, mode);
      return { t, stores: (Array.isArray(stores)?stores:[stores]).reduce((acc,s)=>{ acc[s]=t.objectStore(s); return acc; },{}) };
    });
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(store, value, opts={}) {
    if (!value.id && STORES[store]?.keyPath === 'id') value.id = uuid();
    value.updated_at = new Date().toISOString();
    const { t, stores } = await tx([store, 'outbox'], 'readwrite');
    stores[store].put(value);
    if (!opts.skipOutbox && store !== 'outbox' && store !== 'meta') {
      stores.outbox.put({ store, op: 'upsert', payload: value, ts: Date.now() });
    }
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    emit(store, { op: 'upsert', value });
    return value;
  }

  async function bulkPut(store, values, opts={}) {
    if (!Array.isArray(values) || !values.length) return [];
    const { t, stores } = await tx([store, 'outbox'], 'readwrite');
    const out = [];
    for (const v of values) {
      if (!v.id && STORES[store]?.keyPath === 'id') v.id = uuid();
      v.updated_at = v.updated_at || new Date().toISOString();
      stores[store].put(v);
      if (!opts.skipOutbox) stores.outbox.put({ store, op: 'upsert', payload: v, ts: Date.now() });
      out.push(v);
    }
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    emit(store, { op: 'bulk', count: out.length });
    return out;
  }

  async function get(store, key) {
    const { stores } = await tx(store);
    return reqP(stores[store].get(key));
  }

  async function getAll(store, { limit, index, range } = {}) {
    const { stores } = await tx(store);
    const src = index ? stores[store].index(index) : stores[store];
    return reqP(src.getAll(range || null, limit || undefined));
  }

  async function count(store, { index, range } = {}) {
    const { stores } = await tx(store);
    const src = index ? stores[store].index(index) : stores[store];
    return reqP(src.count(range || null));
  }

  async function remove(store, key, opts={}) {
    const { t, stores } = await tx([store, 'outbox'], 'readwrite');
    stores[store].delete(key);
    if (!opts.skipOutbox && store !== 'outbox' && store !== 'meta') {
      stores.outbox.put({ store, op: 'delete', payload: { id: key }, ts: Date.now() });
    }
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    emit(store, { op: 'delete', key });
  }

  async function clear(store) {
    const { t, stores } = await tx(store, 'readwrite');
    stores[store].clear();
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    emit(store, { op: 'clear' });
  }

  // Query con filtro JS sobre cursor (para casos sin index puro)
  async function query(store, predicate, { limit, index } = {}) {
    const { stores } = await tx(store);
    const src = index ? stores[store].index(index) : stores[store];
    return new Promise((resolve, reject) => {
      const out = [];
      const req = src.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        try {
          if (!predicate || predicate(cur.value)) out.push(cur.value);
        } catch(e) { /* skip */ }
        if (limit && out.length >= limit) return resolve(out);
        cur.continue();
      };
    });
  }

  async function meta(key, value) {
    if (value === undefined) {
      const r = await get('meta', key);
      return r ? r.value : null;
    }
    const { t, stores } = await tx('meta', 'readwrite');
    stores.meta.put({ key, value });
    await new Promise(res => { t.oncomplete = res; });
    return value;
  }

  async function pendingOps() {
    return getAll('outbox');
  }

  // ── Sync con Supabase (requiere window.supabase ya inicializado) ──
  async function flush({ batch = 50 } = {}) {
    const sb = global.supabase;
    if (!sb) return { ok: false, reason: 'no-supabase' };
    if (!global.navigator?.onLine) return { ok: false, reason: 'offline' };

    const ops = await getAll('outbox', { limit: batch });
    if (!ops.length) return { ok: true, flushed: 0 };

    let flushed = 0;
    const errors = [];

    for (const op of ops) {
      try {
        if (op.op === 'upsert') {
          const { error } = await sb.from(op.store).upsert(op.payload);
          if (error) throw error;
        } else if (op.op === 'delete') {
          const { error } = await sb.from(op.store).delete().eq('id', op.payload.id);
          if (error) throw error;
        }
        const { t, stores } = await tx('outbox', 'readwrite');
        stores.outbox.delete(op.id);
        await new Promise(r => { t.oncomplete = r; });
        flushed++;
      } catch (e) {
        errors.push({ op, err: e.message || String(e) });
        if (errors.length >= 5) break; // backoff
      }
    }
    return { ok: errors.length === 0, flushed, errors };
  }

  async function pull(store, { since } = {}) {
    const sb = global.supabase;
    if (!sb) return { ok: false, reason: 'no-supabase' };
    const lastSync = since || (await meta(`last_sync_${store}`)) || '1970-01-01T00:00:00Z';
    let q = sb.from(store).select('*').gt('updated_at', lastSync).order('updated_at', { ascending: true }).limit(500);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    if (data && data.length) {
      await bulkPut(store, data, { skipOutbox: true });
      const max = data.reduce((m,r) => r.updated_at > m ? r.updated_at : m, lastSync);
      await meta(`last_sync_${store}`, max);
    }
    return { ok: true, pulled: data?.length || 0 };
  }

  async function sync(stores = ['productos','clientes','ventas','venta_items','inventario','cajas','movimientos']) {
    const result = { push: null, pull: {} };
    result.push = await flush({ batch: 200 });
    for (const s of stores) {
      result.pull[s] = await pull(s);
    }
    await meta('last_sync_at', new Date().toISOString());
    return result;
  }

  // Auto-flush al recuperar conexión
  if (global.addEventListener) {
    global.addEventListener('online', () => {
      flush().catch(e => console.warn('[IDB] flush online err', e));
    });
  }

  // Periodic background sync (cada 60s si hay red)
  let _syncTimer = null;
  function startAutoSync(intervalMs = 60000) {
    stopAutoSync();
    _syncTimer = setInterval(() => {
      if (!global.navigator?.onLine) return;
      flush().catch(()=>{});
    }, intervalMs);
  }
  function stopAutoSync() {
    if (_syncTimer) clearInterval(_syncTimer);
    _syncTimer = null;
  }

  async function deviceId() {
    let id = await meta('device_id');
    if (!id) { id = uuid(); await meta('device_id', id); }
    return id;
  }

  async function stats() {
    const out = {};
    for (const s of Object.keys(STORES)) {
      try { out[s] = await count(s); } catch { out[s] = -1; }
    }
    out.pending = await count('outbox');
    out.last_sync = await meta('last_sync_at');
    return out;
  }

  async function exportAll() {
    const dump = { version: DB_VERSION, ts: new Date().toISOString(), data: {} };
    for (const s of Object.keys(STORES)) {
      if (s === 'outbox') continue;
      dump.data[s] = await getAll(s);
    }
    return dump;
  }

  async function importAll(dump) {
    if (!dump || !dump.data) throw new Error('dump inválido');
    for (const [s, rows] of Object.entries(dump.data)) {
      if (!STORES[s]) continue;
      await bulkPut(s, rows, { skipOutbox: true });
    }
    return { ok: true };
  }

  async function reset() {
    return new Promise((resolve, reject) => {
      if (_db) { try { _db.close(); } catch{} _db = null; _opening = null; }
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      req.onblocked = () => console.warn('[IDB] reset blocked');
    });
  }

  global.IDB = {
    open, put, bulkPut, get, getAll, count, query,
    delete: remove, remove, clear,
    meta, pendingOps, flush, pull, sync,
    onChange, startAutoSync, stopAutoSync,
    deviceId, stats, exportAll, importAll, reset,
    uuid, STORES, DB_NAME, DB_VERSION
  };

  // Auto-open silencioso
  open().then(() => {
    console.log('[IDB] ready', DB_NAME, 'v'+DB_VERSION);
  }).catch(e => console.error('[IDB] open failed', e));

})(typeof window !== 'undefined' ? window : globalThis);
