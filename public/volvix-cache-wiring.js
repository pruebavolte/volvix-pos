/* ============================================================================
 * volvix-cache-wiring.js
 * Volvix POS — Cache layer (Redis-like) in-memory + IndexedDB
 * Agent-33 / Ronda 8 Fibonacci
 * ----------------------------------------------------------------------------
 * Features:
 *   1. SET, GET, DEL, EXPIRE
 *   2. Automatic TTL with lazy + active expiration
 *   3. LRU eviction (configurable max entries)
 *   4. Pattern matching (KEYS pattern*)
 *   5. Local Pub/Sub
 *   6. Hit/Miss statistics
 *   7. IndexedDB persistence
 *   8. Auto-clean expired
 *   9. window.CacheAPI exposed globally
 * ==========================================================================*/

(function (global) {
  'use strict';

  // ---------------------------------------------------------------- Config --
  const CONFIG = {
    DB_NAME: 'volvix_cache_db',
    DB_VERSION: 1,
    STORE: 'cache_store',
    MAX_ENTRIES: 1000,
    AUTO_CLEAN_MS: 30_000,
    PERSIST_DEBOUNCE_MS: 750,
    DEFAULT_TTL: null, // null = no expira
    NAMESPACE: 'volvix:'
  };

  // -------------------------------------------------------------- Logging --
  const log = (...a) => console.log('%c[CacheAPI]', 'color:#0bf', ...a);
  const warn = (...a) => console.warn('[CacheAPI]', ...a);
  const err = (...a) => console.error('[CacheAPI]', ...a);

  // =========================================================================
  //  LRU MAP — orden de inserción mantiene recencia (Map preserva order)
  // =========================================================================
  class LRUMap {
    constructor(max) {
      this.max = max;
      this.map = new Map();
    }
    get size() { return this.map.size; }
    has(k) { return this.map.has(k); }
    get(k) {
      if (!this.map.has(k)) return undefined;
      const v = this.map.get(k);
      this.map.delete(k);
      this.map.set(k, v); // mover al final (más reciente)
      return v;
    }
    peek(k) { return this.map.get(k); }
    set(k, v) {
      if (this.map.has(k)) this.map.delete(k);
      this.map.set(k, v);
      this._evict();
    }
    delete(k) { return this.map.delete(k); }
    clear() { this.map.clear(); }
    keys() { return this.map.keys(); }
    entries() { return this.map.entries(); }
    _evict() {
      while (this.map.size > this.max) {
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
        PubSub.publish('__evicted__', oldest);
        Stats.evictions++;
      }
    }
  }

  // =========================================================================
  //  STATS
  // =========================================================================
  const Stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    expirations: 0,
    evictions: 0,
    persists: 0,
    restores: 0,
    started: Date.now(),
    snapshot() {
      const total = this.hits + this.misses;
      const ratio = total === 0 ? 0 : (this.hits / total);
      return {
        hits: this.hits,
        misses: this.misses,
        sets: this.sets,
        deletes: this.deletes,
        expirations: this.expirations,
        evictions: this.evictions,
        persists: this.persists,
        restores: this.restores,
        hit_ratio: Number(ratio.toFixed(4)),
        uptime_ms: Date.now() - this.started,
        size: store.size
      };
    },
    reset() {
      this.hits = this.misses = this.sets = this.deletes = 0;
      this.expirations = this.evictions = 0;
      this.persists = this.restores = 0;
      this.started = Date.now();
    }
  };

  // =========================================================================
  //  PUB / SUB local
  // =========================================================================
  const PubSub = (() => {
    const channels = new Map(); // channel -> Set<fn>
    return {
      subscribe(channel, fn) {
        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel).add(fn);
        return () => this.unsubscribe(channel, fn);
      },
      unsubscribe(channel, fn) {
        const set = channels.get(channel);
        if (set) set.delete(fn);
      },
      publish(channel, payload) {
        const set = channels.get(channel);
        if (!set) return 0;
        let count = 0;
        for (const fn of set) {
          try { fn(payload, channel); count++; }
          catch (e) { err('subscriber error', e); }
        }
        return count;
      },
      channels() { return [...channels.keys()]; },
      clear() { channels.clear(); }
    };
  })();

  // =========================================================================
  //  STORE in-memory
  // =========================================================================
  // entry shape: { value, expiresAt:number|null, createdAt:number, hits:number }
  const store = new LRUMap(CONFIG.MAX_ENTRIES);

  function _isExpired(entry) {
    return entry && entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  function _key(k) {
    return CONFIG.NAMESPACE + String(k);
  }

  function _unkey(k) {
    return k.startsWith(CONFIG.NAMESPACE) ? k.slice(CONFIG.NAMESPACE.length) : k;
  }

  // =========================================================================
  //  PATTERN MATCHING (Redis-style globs)
  //    *      cualquier secuencia
  //    ?      un solo char
  //    [abc]  set de chars
  // =========================================================================
  function patternToRegExp(pattern) {
    let re = '^';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '*') re += '.*';
      else if (c === '?') re += '.';
      else if (c === '[') {
        const end = pattern.indexOf(']', i);
        if (end === -1) re += '\\[';
        else { re += pattern.slice(i, end + 1); i = end; }
      } else if ('.+^$(){}|\\'.includes(c)) re += '\\' + c;
      else re += c;
    }
    re += '$';
    return new RegExp(re);
  }

  // =========================================================================
  //  INDEXEDDB persistencia
  // =========================================================================
  const IDB = (() => {
    let dbPromise = null;

    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        if (!global.indexedDB) {
          warn('IndexedDB no disponible — modo solo memoria');
          resolve(null);
          return;
        }
        const req = global.indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(CONFIG.STORE)) {
            db.createObjectStore(CONFIG.STORE, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { err('IDB open error', req.error); resolve(null); };
      });
      return dbPromise;
    }

    async function tx(mode) {
      const db = await open();
      if (!db) return null;
      return db.transaction(CONFIG.STORE, mode).objectStore(CONFIG.STORE);
    }

    async function putAll(records) {
      const s = await tx('readwrite');
      if (!s) return false;
      return new Promise((resolve) => {
        for (const rec of records) s.put(rec);
        s.transaction.oncomplete = () => resolve(true);
        s.transaction.onerror = () => resolve(false);
      });
    }

    async function clearAll() {
      const s = await tx('readwrite');
      if (!s) return false;
      return new Promise((resolve) => {
        s.clear();
        s.transaction.oncomplete = () => resolve(true);
        s.transaction.onerror = () => resolve(false);
      });
    }

    async function deleteOne(key) {
      const s = await tx('readwrite');
      if (!s) return false;
      return new Promise((resolve) => {
        s.delete(key);
        s.transaction.oncomplete = () => resolve(true);
        s.transaction.onerror = () => resolve(false);
      });
    }

    async function getAll() {
      const s = await tx('readonly');
      if (!s) return [];
      return new Promise((resolve) => {
        const req = s.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    }

    return { open, putAll, clearAll, deleteOne, getAll };
  })();

  // ----------------- Persistencia con debounce ------------------------------
  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, CONFIG.PERSIST_DEBOUNCE_MS);
  }

  async function persistNow() {
    persistTimer = null;
    const records = [];
    for (const [k, entry] of store.entries()) {
      if (_isExpired(entry)) continue;
      records.push({ key: k, ...entry });
    }
    await IDB.clearAll();
    await IDB.putAll(records);
    Stats.persists++;
    PubSub.publish('__persist__', records.length);
  }

  async function restoreFromIDB() {
    const records = await IDB.getAll();
    let count = 0;
    for (const r of records) {
      if (r.expiresAt !== null && r.expiresAt <= Date.now()) continue;
      store.set(r.key, {
        value: r.value,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        hits: r.hits || 0
      });
      count++;
    }
    Stats.restores += count;
    log('restaurados', count, 'registros desde IndexedDB');
    return count;
  }

  // =========================================================================
  //  AUTO-CLEAN expirados
  // =========================================================================
  function cleanExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [k, entry] of [...store.entries()]) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        store.delete(k);
        Stats.expirations++;
        removed++;
        PubSub.publish('__expired__', _unkey(k));
      }
    }
    if (removed > 0) {
      schedulePersist();
      log('auto-clean removió', removed, 'expirados');
    }
    return removed;
  }

  setInterval(cleanExpired, CONFIG.AUTO_CLEAN_MS);

  // =========================================================================
  //  API pública
  // =========================================================================
  function SET(key, value, ttlMs) {
    const k = _key(key);
    const expiresAt = (ttlMs && ttlMs > 0) ? Date.now() + ttlMs
                    : (CONFIG.DEFAULT_TTL ? Date.now() + CONFIG.DEFAULT_TTL : null);
    store.set(k, {
      value,
      expiresAt,
      createdAt: Date.now(),
      hits: 0
    });
    Stats.sets++;
    PubSub.publish('set', { key, value, ttlMs });
    PubSub.publish('key:' + key, { op: 'set', value });
    schedulePersist();
    return true;
  }

  function GET(key) {
    const k = _key(key);
    const entry = store.get(k);
    if (!entry) {
      Stats.misses++;
      PubSub.publish('miss', key);
      return undefined;
    }
    if (_isExpired(entry)) {
      store.delete(k);
      Stats.expirations++;
      Stats.misses++;
      PubSub.publish('__expired__', key);
      return undefined;
    }
    entry.hits++;
    Stats.hits++;
    PubSub.publish('hit', key);
    return entry.value;
  }

  function DEL(...keys) {
    let removed = 0;
    for (const key of keys) {
      const k = _key(key);
      if (store.delete(k)) {
        removed++;
        Stats.deletes++;
        IDB.deleteOne(k);
        PubSub.publish('del', key);
        PubSub.publish('key:' + key, { op: 'del' });
      }
    }
    return removed;
  }

  function EXPIRE(key, ttlMs) {
    const k = _key(key);
    const entry = store.peek(k);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlMs;
    schedulePersist();
    PubSub.publish('expire', { key, ttlMs });
    return true;
  }

  function TTL(key) {
    const k = _key(key);
    const entry = store.peek(k);
    if (!entry) return -2; // no existe
    if (entry.expiresAt === null) return -1; // sin expiración
    const left = entry.expiresAt - Date.now();
    return left > 0 ? left : -2;
  }

  function EXISTS(key) {
    const k = _key(key);
    const entry = store.peek(k);
    if (!entry) return false;
    if (_isExpired(entry)) { store.delete(k); return false; }
    return true;
  }

  function KEYS(pattern = '*') {
    const re = patternToRegExp(pattern);
    const out = [];
    for (const k of store.keys()) {
      const bare = _unkey(k);
      if (re.test(bare)) {
        const entry = store.peek(k);
        if (!_isExpired(entry)) out.push(bare);
      }
    }
    return out;
  }

  function FLUSH() {
    store.clear();
    IDB.clearAll();
    PubSub.publish('flush', null);
    return true;
  }

  function INCR(key, by = 1) {
    const cur = GET(key);
    const n = (typeof cur === 'number' ? cur : 0) + by;
    SET(key, n);
    return n;
  }

  function DECR(key, by = 1) { return INCR(key, -by); }

  function MGET(...keys) { return keys.map(GET); }

  function MSET(obj, ttlMs) {
    for (const k of Object.keys(obj)) SET(k, obj[k], ttlMs);
    return true;
  }

  // =========================================================================
  //  Exposición global
  // =========================================================================
  const CacheAPI = {
    // core
    SET, GET, DEL, EXPIRE, TTL, EXISTS, KEYS, FLUSH,
    INCR, DECR, MGET, MSET,
    // alias minúsculas
    set: SET, get: GET, del: DEL, expire: EXPIRE, ttl: TTL,
    exists: EXISTS, keys: KEYS, flush: FLUSH,
    incr: INCR, decr: DECR, mget: MGET, mset: MSET,
    // pubsub
    subscribe: PubSub.subscribe.bind(PubSub),
    unsubscribe: PubSub.unsubscribe.bind(PubSub),
    publish: PubSub.publish.bind(PubSub),
    channels: PubSub.channels.bind(PubSub),
    // mantenimiento
    cleanExpired,
    persistNow,
    restoreFromIDB,
    // stats
    stats: () => Stats.snapshot(),
    resetStats: () => Stats.reset(),
    // config
    config: CONFIG,
    version: '1.0.0-r8f-agent33'
  };

  global.CacheAPI = CacheAPI;

  // ---------------- bootstrap ------------------------------------------------
  (async function boot() {
    try {
      await IDB.open();
      await restoreFromIDB();
      log('listo — ', store.size, 'entradas activas');
      PubSub.publish('__ready__', { size: store.size });
    } catch (e) {
      err('boot fallo', e);
    }
  })();

  // Guardar antes de cerrar la pestaña
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try { persistNow(); } catch (_) {}
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
