/* ============================================================================
 * volvix-reminders-wiring.js
 * Sistema de recordatorios para Volvix POS
 * - Crear recordatorios con título, fecha, prioridad, notas
 * - Snooze (posponer)
 * - Recurring (diario, semanal, mensual)
 * - Link a customer / product
 * - Notificaciones (Web Notifications API + toast in-app)
 * - UI con tabs: today / upcoming / done
 * - API expuesta en window.RemindersAPI
 * ========================================================================== */

(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------
  const STORAGE_KEY = 'volvix.reminders.v1';
  const SETTINGS_KEY = 'volvix.reminders.settings.v1';

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[Reminders] load fail', e);
      return [];
    }
  }

  function saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('[Reminders] save fail', e);
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : { soundEnabled: true, browserNotif: true };
    } catch (e) {
      return { soundEnabled: true, browserNotif: true };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // -------------------------------------------------------------------------
  // Model
  // -------------------------------------------------------------------------
  let reminders = loadAll();
  let settings = loadSettings();
  const listeners = [];

  function uid() {
    return 'rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function emit(event, payload) {
    listeners.forEach(fn => {
      try { fn(event, payload); } catch (e) { console.error(e); }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------
  function createReminder(input) {
    const r = {
      id: uid(),
      title: String(input.title || 'Sin título').trim(),
      notes: String(input.notes || ''),
      dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : new Date(Date.now() + 3600e3).toISOString(),
      priority: ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal',
      recurring: ['none', 'daily', 'weekly', 'monthly'].includes(input.recurring) ? input.recurring : 'none',
      customerId: input.customerId || null,
      productId: input.productId || null,
      done: false,
      doneAt: null,
      snoozedUntil: null,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    reminders.push(r);
    saveAll(reminders);
    emit('create', r);
    renderUI();
    return r;
  }

  function updateReminder(id, patch) {
    const r = reminders.find(x => x.id === id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    saveAll(reminders);
    emit('update', r);
    renderUI();
    return r;
  }

  function deleteReminder(id) {
    const i = reminders.findIndex(x => x.id === id);
    if (i < 0) return false;
    const [r] = reminders.splice(i, 1);
    saveAll(reminders);
    emit('delete', r);
    renderUI();
    return true;
  }

  function markDone(id) {
    const r = reminders.find(x => x.id === id);
    if (!r) return null;
    r.done = true;
    r.doneAt = new Date().toISOString();
    r.updatedAt = r.doneAt;
    // Si es recurrente, crear el siguiente
    if (r.recurring && r.recurring !== 'none') {
      const next = nextOccurrence(new Date(r.dueAt), r.recurring);
      createReminder({
        title: r.title,
        notes: r.notes,
        dueAt: next.toISOString(),
        priority: r.priority,
        recurring: r.recurring,
        customerId: r.customerId,
        productId: r.productId
      });
    }
    saveAll(reminders);
    emit('done', r);
    renderUI();
    return r;
  }

  function snooze(id, minutes) {
    const r = reminders.find(x => x.id === id);
    if (!r) return null;
    const until = new Date(Date.now() + minutes * 60000);
    r.snoozedUntil = until.toISOString();
    r.dueAt = until.toISOString();
    r.notified = false;
    r.updatedAt = new Date().toISOString();
    saveAll(reminders);
    emit('snooze', r);
    renderUI();
    return r;
  }

  function nextOccurrence(from, recurring) {
    const d = new Date(from);
    if (recurring === 'daily') d.setDate(d.getDate() + 1);
    else if (recurring === 'weekly') d.setDate(d.getDate() + 7);
    else if (recurring === 'monthly') d.setMonth(d.getMonth() + 1);
    return d;
  }

  function listReminders(filter) {
    filter = filter || {};
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    return reminders.filter(r => {
      if (filter.tab === 'today') {
        if (r.done) return false;
        const t = new Date(r.dueAt).getTime();
        return t >= startOfDay.getTime() && t <= endOfDay.getTime();
      }
      if (filter.tab === 'upcoming') {
        if (r.done) return false;
        return new Date(r.dueAt).getTime() > endOfDay.getTime();
      }
      if (filter.tab === 'done') return r.done;
      if (filter.customerId) return r.customerId === filter.customerId;
      if (filter.productId) return r.productId === filter.productId;
      return true;
    }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  }

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  function ensureNotifPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  }

  function fireNotification(r) {
    // Browser notification
    if (settings.browserNotif && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification('Recordatorio: ' + r.title, {
          body: r.notes || ('Vence: ' + new Date(r.dueAt).toLocaleString()),
          tag: r.id,
          requireInteraction: r.priority === 'urgent'
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (e) { /* ignore */ }
    }
    // Toast in-app
    showToast(r);
    // Sound
    if (settings.soundEnabled) playBeep(r.priority);
    r.notified = true;
    saveAll(reminders);
    emit('notify', r);
  }

  function playBeep(priority) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = priority === 'urgent' ? 880 : 660;
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
      setTimeout(() => ctx.close(), 400);
    } catch (e) { /* ignore */ }
  }

  function showToast(r) {
    let host = document.getElementById('vlx-rem-toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'vlx-rem-toasts';
      host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;font-family:system-ui,sans-serif';
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    const colors = { low: '#64748b', normal: '#0ea5e9', high: '#f59e0b', urgent: '#ef4444' };
    t.style.cssText = `background:#fff;border-left:4px solid ${colors[r.priority] || '#0ea5e9'};box-shadow:0 8px 24px rgba(0,0,0,.15);padding:12px 16px;border-radius:6px;min-width:280px;max-width:360px;cursor:pointer`;
    t.innerHTML = `<div style="font-weight:600;color:#0f172a;margin-bottom:4px">${escapeHtml(r.title)}</div>
      <div style="font-size:12px;color:#475569">${escapeHtml(r.notes || new Date(r.dueAt).toLocaleString())}</div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button data-act="done" style="flex:1;padding:4px 8px;border:1px solid #10b981;background:#10b981;color:#fff;border-radius:4px;font-size:11px;cursor:pointer">Hecho</button>
        <button data-act="snooze" style="flex:1;padding:4px 8px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:4px;font-size:11px;cursor:pointer">Snooze 10m</button>
        <button data-act="close" style="padding:4px 8px;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:4px;font-size:11px;cursor:pointer">x</button>
      </div>`;
    t.addEventListener('click', e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'done') { markDone(r.id); t.remove(); }
      else if (act === 'snooze') { snooze(r.id, 10); t.remove(); }
      else if (act === 'close') { t.remove(); }
    });
    host.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 12000);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // -------------------------------------------------------------------------
  // Scheduler tick
  // -------------------------------------------------------------------------
  function tick() {
    const now = Date.now();
    reminders.forEach(r => {
      if (r.done || r.notified) return;
      if (new Date(r.dueAt).getTime() <= now) {
        fireNotification(r);
      }
    });
  }
  setInterval(tick, 30000);
  setTimeout(tick, 1500);

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  let currentTab = 'today';

  function mountUI(containerId) {
    const id = containerId || 'vlx-reminders-panel';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div style="font-family:system-ui,sans-serif;border:1px solid #e2e8f0;border-radius:8px;background:#fff;max-width:480px">
        <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
          <strong style="color:#0f172a">Recordatorios</strong>
          <button id="vlx-rem-new" style="padding:6px 12px;border:none;background:#0ea5e9;color:#fff;border-radius:4px;cursor:pointer;font-size:12px">+ Nuevo</button>
        </div>
        <div id="vlx-rem-tabs" style="display:flex;border-bottom:1px solid #e2e8f0">
          ${['today', 'upcoming', 'done'].map(t => `<button data-tab="${t}" style="flex:1;padding:8px;border:none;background:${t === currentTab ? '#f1f5f9' : '#fff'};cursor:pointer;font-size:12px;font-weight:${t === currentTab ? '600' : '400'};border-bottom:2px solid ${t === currentTab ? '#0ea5e9' : 'transparent'}">${t === 'today' ? 'Hoy' : t === 'upcoming' ? 'Próximos' : 'Hechos'}</button>`).join('')}
        </div>
        <div id="vlx-rem-list" style="max-height:400px;overflow-y:auto"></div>
      </div>`;
    el.querySelectorAll('#vlx-rem-tabs button').forEach(b => {
      b.addEventListener('click', () => { currentTab = b.getAttribute('data-tab'); renderUI(); });
    });
    el.querySelector('#vlx-rem-new').addEventListener('click', openCreateForm);
    renderUI();
  }

  function renderUI() {
    const list = document.getElementById('vlx-rem-list');
    if (!list) return;
    const items = listReminders({ tab: currentTab });
    if (!items.length) {
      list.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">Sin recordatorios</div>`;
      return;
    }
    const colors = { low: '#64748b', normal: '#0ea5e9', high: '#f59e0b', urgent: '#ef4444' };
    list.innerHTML = items.map(r => `
      <div style="padding:10px 16px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:flex-start">
        <span style="width:8px;height:8px;border-radius:50%;background:${colors[r.priority]};margin-top:6px;flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;color:#0f172a;font-size:13px;${r.done ? 'text-decoration:line-through;color:#94a3b8' : ''}">${escapeHtml(r.title)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${new Date(r.dueAt).toLocaleString()}${r.recurring !== 'none' ? ' · ' + r.recurring : ''}${r.customerId ? ' · cliente:' + r.customerId : ''}${r.productId ? ' · prod:' + r.productId : ''}</div>
          ${r.notes ? `<div style="font-size:11px;color:#475569;margin-top:4px">${escapeHtml(r.notes)}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${!r.done ? `<button data-act="done" data-id="${r.id}" title="Hecho" style="padding:2px 6px;border:1px solid #10b981;background:#fff;color:#10b981;border-radius:4px;cursor:pointer;font-size:11px">v</button>
          <button data-act="snooze" data-id="${r.id}" title="Snooze 1h" style="padding:2px 6px;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:4px;cursor:pointer;font-size:11px">z</button>` : ''}
          <button data-act="del" data-id="${r.id}" title="Borrar" style="padding:2px 6px;border:1px solid #ef4444;background:#fff;color:#ef4444;border-radius:4px;cursor:pointer;font-size:11px">x</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('button[data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const act = b.getAttribute('data-act');
        if (act === 'done') markDone(id);
        else if (act === 'snooze') snooze(id, 60);
        else if (act === 'del') deleteReminder(id);
      });
    });
  }

  function openCreateForm() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    const defaultDue = new Date(Date.now() + 3600e3).toISOString().slice(0, 16);
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:20px;width:380px;max-width:90vw">
        <h3 style="margin:0 0 12px;color:#0f172a;font-size:16px">Nuevo recordatorio</h3>
        <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px">Título</label>
        <input id="vrf-title" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;margin-bottom:10px;box-sizing:border-box">
        <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px">Fecha/hora</label>
        <input id="vrf-due" type="datetime-local" value="${defaultDue}" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;margin-bottom:10px;box-sizing:border-box">
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <div style="flex:1">
            <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px">Prioridad</label>
            <select id="vrf-prio" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px">
              <option value="low">Baja</option><option value="normal" selected>Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
            </select>
          </div>
          <div style="flex:1">
            <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px">Repetir</label>
            <select id="vrf-rec" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px">
              <option value="none">No</option><option value="daily">Diario</option><option value="weekly">Semanal</option><option value="monthly">Mensual</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <input id="vrf-cust" placeholder="Customer ID (opt)" style="flex:1;padding:6px;border:1px solid #cbd5e1;border-radius:4px;box-sizing:border-box">
          <input id="vrf-prod" placeholder="Product ID (opt)" style="flex:1;padding:6px;border:1px solid #cbd5e1;border-radius:4px;box-sizing:border-box">
        </div>
        <label style="display:block;font-size:12px;color:#475569;margin-bottom:4px">Notas</label>
        <textarea id="vrf-notes" rows="3" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;margin-bottom:12px;box-sizing:border-box;resize:vertical"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="vrf-cancel" style="padding:6px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:4px;cursor:pointer">Cancelar</button>
          <button id="vrf-save" style="padding:6px 14px;border:none;background:#0ea5e9;color:#fff;border-radius:4px;cursor:pointer">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#vrf-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#vrf-save').onclick = () => {
      const title = overlay.querySelector('#vrf-title').value.trim();
      if (!title) { VolvixUI.toast({type:'error', message:'Título requerido'}); return; }
      createReminder({
        title,
        dueAt: new Date(overlay.querySelector('#vrf-due').value).toISOString(),
        priority: overlay.querySelector('#vrf-prio').value,
        recurring: overlay.querySelector('#vrf-rec').value,
        customerId: overlay.querySelector('#vrf-cust').value.trim() || null,
        productId: overlay.querySelector('#vrf-prod').value.trim() || null,
        notes: overlay.querySelector('#vrf-notes').value
      });
      overlay.remove();
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  const RemindersAPI = {
    create: createReminder,
    update: updateReminder,
    delete: deleteReminder,
    markDone,
    snooze,
    list: listReminders,
    get: id => reminders.find(r => r.id === id) || null,
    onChange,
    mountUI,
    requestPermission: ensureNotifPermission,
    setSettings: s => { settings = Object.assign(settings, s); saveSettings(settings); },
    getSettings: () => Object.assign({}, settings),
    _all: () => reminders.slice(),
    _reset: () => { reminders = []; saveAll(reminders); renderUI(); }
  };

  global.RemindersAPI = RemindersAPI;

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureNotifPermission());
  } else {
    ensureNotifPermission();
  }

  console.log('[Volvix Reminders] wired. window.RemindersAPI ready.');
})(window);
