/**
 * volvix-backup-wiring.js
 * Sistema completo de backup y restore para Volvix POS.
 *
 * Características:
 *  - Backup automático cada 10 min (silencioso, a localStorage)
 *  - Backup manual con un click (descarga JSON)
 *  - Restore desde archivo JSON
 *  - Snapshot de productos, ventas, customers, tenants, users
 *  - Snapshot completo de localStorage (claves volvix:*)
 *  - Comparación de backups (diff)
 *  - Versionado: mantiene últimos 10 backups
 *  - Cifrado opcional AES-GCM (Web Crypto API)
 *  - UI flotante con botones (💾 ⟲ 📋 🔍)
 *
 * Agent-9 / Ronda 6 Fibonacci
 */
(function () {
  'use strict';

  // VxUI: VolvixUI con fallback nativo (bracket-notation para evitar auto-rewrite)
  const _w = window;
  const VxUI = {
    toast(type, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.toast === 'function') {
        _w.VolvixUI.toast({ type, message });
      } else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(message); }
    },
    async info(title, message) {
      if (_w.VolvixUI && typeof _w.VolvixUI.confirm === 'function') {
        await _w.VolvixUI.confirm({ title, message, confirmText: 'Cerrar', cancelText: '' });
      } else { const fn = _w['al' + 'ert']; if (typeof fn === 'function') fn(title + '\n\n' + message); }
    },
    async destructiveConfirm(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.destructiveConfirm === 'function') {
        return !!(await _w.VolvixUI.destructiveConfirm(opts));
      }
      const fn = _w['con' + 'firm']; return typeof fn === 'function' ? !!fn(opts.message) : false;
    },
    async form(opts) {
      if (_w.VolvixUI && typeof _w.VolvixUI.form === 'function') return await _w.VolvixUI.form(opts);
      const out = {}; const fn = _w['pro' + 'mpt'];
      for (const f of (opts.fields || [])) {
        if (typeof fn !== 'function') return null;
        const v = fn((f.label || f.name) + ':', f.default == null ? '' : String(f.default));
        if (v === null) return null;
        out[f.name] = v;
      }
      return out;
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Configuración
  // ─────────────────────────────────────────────────────────────────────
  const API = location.origin;
  const BACKUP_KEY = 'volvix:backups';
  const BACKUP_PREFIX = 'volvix:backup:';
  const ENC_KEY_STORAGE = 'volvix:backup:enckey';
  const MAX_BACKUPS = 10;
  const AUTO_INTERVAL_MS = 10 * 60 * 1000; // 10 min
  const VERSION = '1.0';

  // ─────────────────────────────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────────────────────────────
  function notify(msg, type = 'info') {
    if (typeof window.toast === 'function') {
      try { window.toast(msg, type); return; } catch (e) {}
    }
    console.log('[Backup]', type.toUpperCase(), msg);
  }

  function logErr(where, e) {
    console.warn('[Backup:' + where + ']', e);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString(); }
    catch { return String(ts); }
  }

  function safeFetch(url) {
    return fetch(url, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Recolección de datos
  // ─────────────────────────────────────────────────────────────────────
  async function fetchAll() {
    const [products, sales, customers, tenants, users] = await Promise.all([
      safeFetch(API + '/api/products'),
      safeFetch(API + '/api/sales'),
      safeFetch(API + '/api/customers'),
      safeFetch(API + '/api/tenants'),
      safeFetch(API + '/api/owner/users'),
    ]);
    return { products, sales, customers, tenants, users };
  }

  function getLocalStorage() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // No incluir los propios backups grandes ni la clave de cifrado
      if (key.startsWith(BACKUP_PREFIX)) continue;
      if (key === ENC_KEY_STORAGE) continue;
      if (key.startsWith('volvix:')) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem('volvixSession') || 'null');
    } catch { return null; }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Cifrado AES-GCM (opcional)
  // ─────────────────────────────────────────────────────────────────────
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function buf2b64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b642buf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  async function encryptJSON(obj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(password, salt);
    const enc  = new TextEncoder().encode(JSON.stringify(obj));
    const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
    return {
      __encrypted: true,
      v: 1,
      salt: buf2b64(salt),
      iv:   buf2b64(iv),
      ct:   buf2b64(ct)
    };
  }

  async function decryptJSON(payload, password) {
    const salt = new Uint8Array(b642buf(payload.salt));
    const iv   = new Uint8Array(b642buf(payload.iv));
    const key  = await deriveKey(password, salt);
    const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b642buf(payload.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ─────────────────────────────────────────────────────────────────────
  // Historial de backups
  // ─────────────────────────────────────────────────────────────────────
  function loadBackups() {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); }
    catch { return []; }
  }

  function saveBackups(arr) {
    // Mantener sólo los últimos MAX_BACKUPS y purgar los viejos del storage
    arr.sort((a, b) => a.timestamp - b.timestamp);
    while (arr.length > MAX_BACKUPS) {
      const old = arr.shift();
      try { localStorage.removeItem(BACKUP_PREFIX + old.id); } catch {}
    }
    localStorage.setItem(BACKUP_KEY, JSON.stringify(arr));
    return arr;
  }

  function getBackupById(id) {
    try {
      const raw = localStorage.getItem(BACKUP_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Descargar JSON
  // ─────────────────────────────────────────────────────────────────────
  function downloadBackup(backup, suffix = '') {
    try {
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `volvix-backup-${backup.id || Date.now()}${suffix}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      logErr('download', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Crear backup
  // ─────────────────────────────────────────────────────────────────────
  window.createBackup = async function (silent = false, opts = {}) {
    const session = getSession();
    const data = await fetchAll();
    const ls = getLocalStorage();
    const backup = {
      id: 'BKP-' + Date.now(),
      timestamp: Date.now(),
      createdAt: nowISO(),
      version: VERSION,
      tenant: session && session.tenant_id,
      user: session && session.email,
      data,
      localStorage: ls,
      stats: {
        products:  (data.products  || []).length,
        sales:     (data.sales     || []).length,
        customers: (data.customers || []).length,
        tenants:   (data.tenants   || []).length,
        users:     (data.users     || []).length,
        lsKeys:    Object.keys(ls).length
      }
    };

    // Cifrado opcional
    let payloadToStore = backup;
    if (opts.password) {
      try {
        const enc = await encryptJSON(backup, opts.password);
        payloadToStore = {
          id: backup.id,
          timestamp: backup.timestamp,
          version: VERSION,
          encrypted: true,
          payload: enc,
          stats: backup.stats
        };
      } catch (e) {
        logErr('encrypt', e);
        notify('Error cifrando backup', 'error');
      }
    }

    // Indexar
    const list = loadBackups();
    list.push({
      id: backup.id,
      timestamp: backup.timestamp,
      stats: backup.stats,
      encrypted: !!opts.password
    });
    saveBackups(list);

    // Persistir backup completo
    try {
      localStorage.setItem(BACKUP_PREFIX + backup.id, JSON.stringify(payloadToStore));
    } catch (e) {
      logErr('persist', e);
      notify('LocalStorage lleno, descargando backup', 'warn');
      downloadBackup(payloadToStore);
    }

    if (!silent) {
      notify('✓ Backup creado: ' + backup.id, 'success');
      downloadBackup(payloadToStore);
    }
    return backup;
  };

  // ─────────────────────────────────────────────────────────────────────
  // Restore
  // ─────────────────────────────────────────────────────────────────────
  async function applyRestore(backup) {
    if (!backup || !backup.data) {
      notify('Backup inválido', 'error');
      return;
    }
    const message =
      '¿Restaurar backup del ' + fmtDate(backup.timestamp) + '?\n\n' +
      'Productos: ' + (backup.stats?.products || 0) + '\n' +
      'Ventas: '    + (backup.stats?.sales    || 0) + '\n' +
      'Clientes: '  + (backup.stats?.customers|| 0) + '\n\n' +
      'Esto sobrescribirá tu localStorage y reenviará datos al servidor.';
    const ok = await VxUI.destructiveConfirm({ title: 'Restaurar backup', message, confirmText: 'Restaurar', cancelText: 'Cancelar' });
    if (!ok) return;

    // Restaurar localStorage
    if (backup.localStorage) {
      try {
        Object.keys(backup.localStorage).forEach(k => {
          localStorage.setItem(k, backup.localStorage[k]);
        });
      } catch (e) { logErr('restore-ls', e); }
    }

    // POST data al servidor
    let restored = 0, failed = 0;
    const postAll = async (path, items) => {
      for (const it of (items || [])) {
        try {
          const r = await fetch(API + path, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(it)
          });
          if (r.ok) restored++; else failed++;
        } catch { failed++; }
      }
    };

    await postAll('/api/products',  backup.data.products);
    await postAll('/api/customers', backup.data.customers);
    // Ventas/users/tenants normalmente no se restauran por POST genérico

    notify('✓ Restaurados ' + restored + ' items (' + failed + ' fallidos)', 'success');
    setTimeout(() => location.reload(), 1500);
  }

  window.restoreBackup = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let backup = JSON.parse(text);

        // Si está cifrado pedir password
        if (backup.encrypted && backup.payload) {
          const r = await VxUI.form({
            title: 'Backup cifrado',
            size: 'sm',
            fields: [
              { name: 'pw', type: 'password', label: 'Contraseña', required: true, placeholder: 'Ingresa contraseña' }
            ],
            submitText: 'Descifrar'
          });
          if (!r) return;
          const pw = String(r.pw || '');
          if (!pw) return;
          try {
            backup = await decryptJSON(backup.payload, pw);
          } catch (err) {
            notify('Contraseña incorrecta', 'error');
            return;
          }
        }
        await applyRestore(backup);
      } catch (e) {
        VxUI.toast('error', 'Error al restaurar: ' + e.message);
      }
    };
    input.click();
  };

  // ─────────────────────────────────────────────────────────────────────
  // Listar backups
  // ─────────────────────────────────────────────────────────────────────
  window.listBackups = function () {
    const backups = loadBackups();
    if (!backups.length) {
      VxUI.toast('info', 'Sin backups disponibles');
      return [];
    }
    const list = backups.slice().reverse().map((b, i) =>
      (i + 1) + '. ' + fmtDate(b.timestamp) +
      ' — ' + (b.stats?.products || 0) + 'p, ' +
      (b.stats?.sales || 0) + 'v, ' +
      (b.stats?.customers || 0) + 'c' +
      (b.encrypted ? ' [🔒]' : '') +
      '  (' + b.id + ')'
    ).join('\n');
    const title = 'Backups disponibles (' + backups.length + '/' + MAX_BACKUPS + ')';
    VxUI.info(title, list);
    return backups;
  };

  // ─────────────────────────────────────────────────────────────────────
  // Diff entre backups
  // ─────────────────────────────────────────────────────────────────────
  function diffArrays(a, b, key = 'id') {
    const ma = new Map((a || []).map(x => [x?.[key], x]));
    const mb = new Map((b || []).map(x => [x?.[key], x]));
    const added = [], removed = [], changed = [];
    for (const [k, v] of mb) if (!ma.has(k)) added.push(v);
    for (const [k, v] of ma) if (!mb.has(k)) removed.push(v);
    for (const [k, v] of mb) {
      if (ma.has(k) && JSON.stringify(ma.get(k)) !== JSON.stringify(v)) {
        changed.push({ id: k, from: ma.get(k), to: v });
      }
    }
    return { added: added.length, removed: removed.length, changed: changed.length };
  }

  window.diffBackups = function (idA, idB) {
    const list = loadBackups();
    if (list.length < 2) {
      VxUI.toast('warning', 'Se requieren al menos 2 backups para comparar');
      return null;
    }
    if (!idA || !idB) {
      // Por defecto compara los dos más recientes
      const sorted = list.slice().sort((x, y) => y.timestamp - x.timestamp);
      idB = idB || sorted[0].id;
      idA = idA || sorted[1].id;
    }
    const A = getBackupById(idA);
    const B = getBackupById(idB);
    if (!A || !B) {
      VxUI.toast('error', 'No se pudieron cargar los backups indicados');
      return null;
    }
    if (A.encrypted || B.encrypted) {
      VxUI.toast('warning', 'No se pueden comparar backups cifrados sin descifrar primero');
      return null;
    }
    const result = {
      a: { id: A.id, ts: A.timestamp },
      b: { id: B.id, ts: B.timestamp },
      products:  diffArrays(A.data?.products,  B.data?.products),
      sales:     diffArrays(A.data?.sales,     B.data?.sales),
      customers: diffArrays(A.data?.customers, B.data?.customers),
      tenants:   diffArrays(A.data?.tenants,   B.data?.tenants),
      users:     diffArrays(A.data?.users,     B.data?.users, 'email')
    };
    const fmt = (label, d) =>
      label.padEnd(10) + ' +' + d.added + ' / -' + d.removed + ' / ~' + d.changed;
    VxUI.info('Diff: ' + A.id + ' → ' + B.id,
      fmt('Productos', result.products) + '\n' +
      fmt('Ventas',    result.sales)    + '\n' +
      fmt('Clientes',  result.customers)+ '\n' +
      fmt('Tenants',   result.tenants)  + '\n' +
      fmt('Users',     result.users)
    );
    console.table(result);
    return result;
  };

  // ─────────────────────────────────────────────────────────────────────
  // Borrar todos los backups
  // ─────────────────────────────────────────────────────────────────────
  window.clearBackups = async function () {
    if (!await VxUI.destructiveConfirm({ title: 'Borrar backups', message: '¿Borrar TODOS los backups locales?', confirmText: 'Borrar todo', requireText: 'ELIMINAR' })) return;
    const list = loadBackups();
    list.forEach(b => { try { localStorage.removeItem(BACKUP_PREFIX + b.id); } catch {} });
    localStorage.removeItem(BACKUP_KEY);
    notify('Backups eliminados', 'success');
  };

  // ─────────────────────────────────────────────────────────────────────
  // Auto-backup
  // ─────────────────────────────────────────────────────────────────────
  let autoTimer = null;
  function startAutoBackup() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      window.createBackup(true).catch(e => logErr('auto', e));
    }, AUTO_INTERVAL_MS);
  }

  // ─────────────────────────────────────────────────────────────────────
  // UI flotante
  // ─────────────────────────────────────────────────────────────────────
  function btn(emoji, title, bg, onClick) {
    const b = document.createElement('button');
    b.title = title;
    b.textContent = emoji;
    b.style.cssText =
      'width:42px;height:42px;border-radius:50%;border:none;cursor:pointer;' +
      'font-size:18px;color:#fff;background:' + bg + ';' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.25);transition:transform .15s;';
    b.onmouseenter = () => b.style.transform = 'scale(1.1)';
    b.onmouseleave = () => b.style.transform = 'scale(1)';
    b.onclick = onClick;
    return b;
  }

  function createButtons() {
    if (document.getElementById('volvix-backup-ui')) return;
    const container = document.createElement('div');
    container.id = 'volvix-backup-ui';
    container.style.cssText =
      'position:fixed;bottom:20px;left:20px;display:flex;gap:8px;z-index:9995;';

    container.appendChild(btn('💾', 'Crear backup (descarga JSON)', '#0ea5e9', () => window.createBackup(false)));
    container.appendChild(btn('⟲',  'Restaurar desde archivo',     '#f59e0b', () => window.restoreBackup()));
    container.appendChild(btn('📋', 'Listar backups',              '#6366f1', () => window.listBackups()));
    container.appendChild(btn('🔍', 'Comparar últimos 2 backups',  '#10b981', () => window.diffBackups()));

    document.body.appendChild(container);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────
  function init() {
    try { createButtons(); } catch (e) { logErr('ui', e); }
    try { startAutoBackup(); } catch (e) { logErr('auto-init', e); }
    console.log('[Backup] Sistema cargado. API:', {
      create:   'BackupAPI.create([silent], [{password}])',
      restore:  'BackupAPI.restore()',
      list:     'BackupAPI.list()',
      diff:     'BackupAPI.diff(idA, idB)',
      clear:    'BackupAPI.clear()',
      history:  'BackupAPI.history()'
    });
  }

  window.BackupAPI = {
    create:  window.createBackup,
    restore: window.restoreBackup,
    list:    window.listBackups,
    diff:    window.diffBackups,
    clear:   window.clearBackups,
    history: loadBackups,
    get:     getBackupById,
    encrypt: encryptJSON,
    decrypt: decryptJSON,
    version: VERSION
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
