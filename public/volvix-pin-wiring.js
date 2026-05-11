/**
 * volvix-pin-wiring.js
 * PIN / Lock Screen wiring para Volvix POS
 *
 * Funciones:
 *  - Pantalla de bloqueo del cajero
 *  - PIN de 4 dígitos con numpad modal
 *  - Lockout tras 3 intentos fallidos (60s)
 *  - Switch user rápido
 *  - Idle timer auto-lock (5 min)
 *
 * API expuesta: window.PinAPI
 *   lock()           -> bloquea sesión y muestra modal
 *   unlock(pin)      -> intenta desbloquear, devuelve {ok, error?}
 *   setPin(oldPin, newPin) -> cambia PIN del usuario actual
 *   switchUser(userId)     -> bloquea y abre selector para otro usuario
 */
(function (global) {
  'use strict';

  // ==========================================================
  // Configuración
  // ==========================================================
  const CONFIG = {
    pinLength: 4,
    maxAttempts: 3,
    lockoutMs: 60 * 1000,        // 60 segundos
    idleTimeoutMs: 5 * 60 * 1000, // 5 minutos
    storageKey: 'volvix.pin.users',
    sessionKey: 'volvix.pin.session',
    eventLog: 'volvix.pin.log'
  };

  // ==========================================================
  // Estado interno
  // ==========================================================
  const state = {
    locked: false,
    currentUser: null,        // { id, name, role }
    attempts: 0,
    lockoutUntil: 0,
    idleTimer: null,
    buffer: '',
    listeners: { lock: [], unlock: [], fail: [], lockout: [], switch: [] }
  };

  // ==========================================================
  // Persistencia (localStorage con fallback in-memory)
  // ==========================================================
  const memStore = {};
  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)) ?? memStore[key] ?? null; }
      catch { return memStore[key] ?? null; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); }
      catch { memStore[key] = val; }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch {}
      delete memStore[key];
    }
  };

  function getUsers() {
    let u = store.get(CONFIG.storageKey);
    if (!u || typeof u !== 'object') {
      // Usuarios por defecto - PIN demo: admin=1234, cajero=0000
      u = {
        'admin':  { id: 'admin',  name: 'Administrador', role: 'admin',  pin: '1234' },
        'cajero': { id: 'cajero', name: 'Cajero 1',      role: 'cashier', pin: '0000' }
      };
      store.set(CONFIG.storageKey, u);
    }
    return u;
  }

  function saveUsers(u) { store.set(CONFIG.storageKey, u); }

  function getSession() { return store.get(CONFIG.sessionKey); }
  function setSession(s) { store.set(CONFIG.sessionKey, s); }

  // ==========================================================
  // Logging de auditoría
  // ==========================================================
  function logEvent(type, detail) {
    const log = store.get(CONFIG.eventLog) || [];
    log.push({ ts: Date.now(), type, detail });
    if (log.length > 200) log.splice(0, log.length - 200);
    store.set(CONFIG.eventLog, log);
  }

  // ==========================================================
  // Eventos
  // ==========================================================
  function on(evt, fn) {
    if (state.listeners[evt]) state.listeners[evt].push(fn);
  }
  function emit(evt, payload) {
    (state.listeners[evt] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error('[PinAPI]', e); }
    });
  }

  // ==========================================================
  // Idle timer
  // ==========================================================
  // 2026-05-11: el PIN lock está DESACTIVADO por defecto. El usuario lo activa
  // explícitamente desde Config → General toggle "Bloqueo PIN".
  // localStorage flag: 'volvix_pin_enabled' === 'true' → habilitado
  function isPinLockEnabled() {
    try { return localStorage.getItem('volvix_pin_enabled') === 'true'; }
    catch (_) { return false; }
  }

  function resetIdleTimer() {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    if (state.locked) return;
    // Si PIN lock está desactivado, NO programar el auto-lock idle
    if (!isPinLockEnabled()) return;
    state.idleTimer = setTimeout(() => {
      // Re-chequear al disparar (por si el usuario lo desactivó mientras tanto)
      if (!isPinLockEnabled()) return;
      console.log('[PinAPI] Idle timeout - auto lock');
      lock('idle');
    }, CONFIG.idleTimeoutMs);
  }

  function attachIdleListeners() {
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
  }

  // ==========================================================
  // UI - Estilos
  // ==========================================================
  function injectStyles() {
    if (document.getElementById('volvix-pin-styles')) return;
    const css = `
      #volvix-pin-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Segoe UI', system-ui, sans-serif; color: #e2e8f0;
        animation: vpx-fade 0.25s ease;
      }
      @keyframes vpx-fade { from { opacity: 0; } to { opacity: 1; } }
      #volvix-pin-overlay .vpx-card {
        background: #1e293b; border-radius: 16px; padding: 32px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        width: 360px; text-align: center;
      }
      #volvix-pin-overlay h2 { margin: 0 0 4px; font-size: 22px; }
      #volvix-pin-overlay .vpx-sub { color: #94a3b8; margin-bottom: 20px; font-size: 13px; }
      #volvix-pin-overlay .vpx-dots { display: flex; gap: 12px; justify-content: center; margin-bottom: 20px; }
      #volvix-pin-overlay .vpx-dot {
        width: 16px; height: 16px; border-radius: 50%;
        background: #334155; transition: background 0.15s;
      }
      #volvix-pin-overlay .vpx-dot.filled { background: #38bdf8; }
      #volvix-pin-overlay .vpx-dot.error { background: #ef4444; animation: vpx-shake 0.3s; }
      @keyframes vpx-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-6px); }
        75% { transform: translateX(6px); }
      }
      #volvix-pin-overlay .vpx-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      #volvix-pin-overlay .vpx-key {
        background: #334155; border: none; color: #f1f5f9;
        padding: 18px 0; font-size: 22px; border-radius: 10px;
        cursor: pointer; transition: background 0.1s, transform 0.05s;
      }
      #volvix-pin-overlay .vpx-key:hover { background: #475569; }
      #volvix-pin-overlay .vpx-key:active { transform: scale(0.95); }
      #volvix-pin-overlay .vpx-key.action { background: #1e40af; }
      #volvix-pin-overlay .vpx-key.action:hover { background: #2563eb; }
      #volvix-pin-overlay .vpx-msg { margin-top: 14px; min-height: 18px; font-size: 13px; color: #fbbf24; }
      #volvix-pin-overlay .vpx-msg.err { color: #ef4444; }
      #volvix-pin-overlay .vpx-switch {
        margin-top: 16px; background: transparent; border: 1px solid #475569;
        color: #94a3b8; padding: 8px 16px; border-radius: 8px; cursor: pointer;
        font-size: 12px;
      }
      #volvix-pin-overlay .vpx-switch:hover { border-color: #38bdf8; color: #38bdf8; }
      #volvix-pin-overlay .vpx-userlist {
        display: none; max-height: 200px; overflow-y: auto;
        margin-top: 12px; border-top: 1px solid #334155; padding-top: 12px;
      }
      #volvix-pin-overlay .vpx-userlist.show { display: block; }
      #volvix-pin-overlay .vpx-user-item {
        padding: 10px; background: #0f172a; border-radius: 8px;
        margin-bottom: 6px; cursor: pointer; text-align: left;
      }
      #volvix-pin-overlay .vpx-user-item:hover { background: #1e3a8a; }
    `;
    const style = document.createElement('style');
    style.id = 'volvix-pin-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ==========================================================
  // UI - Render
  // ==========================================================
  function renderOverlay() {
    let ov = document.getElementById('volvix-pin-overlay');
    if (ov) return ov;

    injectStyles();
    ov = document.createElement('div');
    ov.id = 'volvix-pin-overlay';
    const userName = state.currentUser ? state.currentUser.name : 'Sin usuario';
    ov.innerHTML = `
      <div class="vpx-card">
        <h2>Volvix POS</h2>
        <div class="vpx-sub">Ingrese PIN de <strong>${escapeHtml(userName)}</strong></div>
        <div class="vpx-dots">
          ${Array.from({length: CONFIG.pinLength}).map(() => '<div class="vpx-dot"></div>').join('')}
        </div>
        <div class="vpx-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="vpx-key" data-k="${n}">${n}</button>`).join('')}
          <button class="vpx-key action" data-k="C">C</button>
          <button class="vpx-key" data-k="0">0</button>
          <button class="vpx-key action" data-k="OK">OK</button>
        </div>
        <div class="vpx-msg" id="vpx-msg"></div>
        <button class="vpx-switch" id="vpx-switch-btn">Cambiar usuario</button>
        <div class="vpx-userlist" id="vpx-userlist"></div>
      </div>
    `;
    document.body.appendChild(ov);

    ov.querySelectorAll('.vpx-key').forEach(btn => {
      btn.addEventListener('click', () => handleKey(btn.dataset.k));
    });
    ov.querySelector('#vpx-switch-btn').addEventListener('click', toggleUserList);

    document.addEventListener('keydown', handleKeyboard);
    return ov;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function removeOverlay() {
    const ov = document.getElementById('volvix-pin-overlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', handleKeyboard);
  }

  function updateDots(errorFlash) {
    const dots = document.querySelectorAll('#volvix-pin-overlay .vpx-dot');
    dots.forEach((d, i) => {
      d.classList.toggle('filled', i < state.buffer.length);
      d.classList.toggle('error', !!errorFlash);
    });
    if (errorFlash) {
      setTimeout(() => dots.forEach(d => d.classList.remove('error')), 400);
    }
  }

  function setMsg(text, isError) {
    const m = document.getElementById('vpx-msg');
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('err', !!isError);
  }

  function toggleUserList() {
    const list = document.getElementById('vpx-userlist');
    if (!list) return;
    if (list.classList.contains('show')) {
      list.classList.remove('show');
      return;
    }
    const users = getUsers();
    list.innerHTML = Object.values(users).map(u => `
      <div class="vpx-user-item" data-uid="${escapeHtml(u.id)}">
        <strong>${escapeHtml(u.name)}</strong>
        <div style="font-size:11px;color:#64748b">${escapeHtml(u.role)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.vpx-user-item').forEach(it => {
      it.addEventListener('click', () => {
        selectUser(it.dataset.uid);
        list.classList.remove('show');
      });
    });
    list.classList.add('show');
  }

  function selectUser(uid) {
    const users = getUsers();
    const u = users[uid];
    if (!u) return;
    state.currentUser = { id: u.id, name: u.name, role: u.role };
    state.buffer = '';
    state.attempts = 0;
    removeOverlay();
    renderOverlay();
    logEvent('switch', { userId: u.id });
    emit('switch', state.currentUser);
  }

  // ==========================================================
  // Manejo de teclas
  // ==========================================================
  function handleKeyboard(e) {
    if (!state.locked) return;
    if (/^[0-9]$/.test(e.key)) handleKey(e.key);
    else if (e.key === 'Backspace') handleKey('C');
    else if (e.key === 'Enter') handleKey('OK');
  }

  function handleKey(k) {
    if (isLockedOut()) {
      const left = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
      setMsg(`Bloqueado. Espere ${left}s`, true);
      return;
    }
    if (k === 'C') {
      state.buffer = '';
      updateDots(false);
      setMsg('');
      return;
    }
    if (k === 'OK') {
      tryUnlock(state.buffer);
      return;
    }
    if (state.buffer.length >= CONFIG.pinLength) return;
    state.buffer += k;
    updateDots(false);
    if (state.buffer.length === CONFIG.pinLength) {
      setTimeout(() => tryUnlock(state.buffer), 120);
    }
  }

  function isLockedOut() {
    return state.lockoutUntil > Date.now();
  }

  // ==========================================================
  // Lógica unlock
  // ==========================================================
  function tryUnlock(pin) {
    if (!state.currentUser) {
      setMsg('Seleccione un usuario', true);
      return { ok: false, error: 'no_user' };
    }
    if (isLockedOut()) {
      const left = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
      setMsg(`Bloqueado. Espere ${left}s`, true);
      return { ok: false, error: 'lockout' };
    }
    const users = getUsers();
    const u = users[state.currentUser.id];
    if (!u) {
      setMsg('Usuario inválido', true);
      return { ok: false, error: 'no_user' };
    }
    if (String(pin) === String(u.pin)) {
      // Éxito
      state.locked = false;
      state.attempts = 0;
      state.buffer = '';
      setSession({ userId: u.id, since: Date.now() });
      logEvent('unlock', { userId: u.id });
      removeOverlay();
      resetIdleTimer();
      emit('unlock', { user: state.currentUser });
      return { ok: true };
    }
    // Falla
    state.attempts++;
    state.buffer = '';
    updateDots(true);
    logEvent('fail', { userId: u.id, attempts: state.attempts });
    emit('fail', { attempts: state.attempts });

    if (state.attempts >= CONFIG.maxAttempts) {
      state.lockoutUntil = Date.now() + CONFIG.lockoutMs;
      state.attempts = 0;
      setMsg(`Demasiados intentos. Bloqueado ${CONFIG.lockoutMs/1000}s`, true);
      logEvent('lockout', { userId: u.id });
      emit('lockout', { until: state.lockoutUntil });
      startLockoutCountdown();
    } else {
      const left = CONFIG.maxAttempts - state.attempts;
      setMsg(`PIN incorrecto. ${left} intento(s) restante(s)`, true);
    }
    return { ok: false, error: 'bad_pin' };
  }

  function startLockoutCountdown() {
    const tick = () => {
      if (!state.locked) return;
      const left = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
      if (left <= 0) {
        setMsg('Puede intentar de nuevo');
        return;
      }
      setMsg(`Bloqueado. Espere ${left}s`, true);
      setTimeout(tick, 1000);
    };
    tick();
  }

  // ==========================================================
  // API pública
  // ==========================================================
  function lock(reason) {
    if (state.locked) return;
    // 2026-05-11: bloqueo del lock cuando PIN está desactivado (excepto manual)
    if (reason !== 'manual' && !isPinLockEnabled()) {
      if (state.idleTimer) clearTimeout(state.idleTimer);
      console.log('[PinAPI] lock skipped — disabled in Config');
      return;
    }
    state.locked = true;
    state.buffer = '';
    if (state.idleTimer) clearTimeout(state.idleTimer);
    if (!state.currentUser) {
      const sess = getSession();
      if (sess && sess.userId) {
        const u = getUsers()[sess.userId];
        if (u) state.currentUser = { id: u.id, name: u.name, role: u.role };
      }
    }
    renderOverlay();
    logEvent('lock', { reason: reason || 'manual' });
    emit('lock', { reason });
  }

  function unlock(pin) {
    return tryUnlock(pin);
  }

  function setPin(oldPin, newPin) {
    if (!state.currentUser) return { ok: false, error: 'no_user' };
    if (!/^\d{4}$/.test(String(newPin))) return { ok: false, error: 'invalid_pin' };
    const users = getUsers();
    const u = users[state.currentUser.id];
    if (!u) return { ok: false, error: 'no_user' };
    if (String(u.pin) !== String(oldPin)) return { ok: false, error: 'bad_pin' };
    u.pin = String(newPin);
    saveUsers(users);
    logEvent('setPin', { userId: u.id });
    return { ok: true };
  }

  function switchUser(userId) {
    lock('switch');
    if (userId) {
      selectUser(userId);
    } else {
      setTimeout(toggleUserList, 100);
    }
  }

  // ==========================================================
  // Bootstrap
  // ==========================================================
  function init() {
    const sess = getSession();
    if (sess && sess.userId) {
      const u = getUsers()[sess.userId];
      if (u) state.currentUser = { id: u.id, name: u.name, role: u.role };
    }
    if (typeof document !== 'undefined' && document.body) {
      attachIdleListeners();
      resetIdleTimer();
    } else if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => {
        attachIdleListeners();
        resetIdleTimer();
      });
    }
    console.log('[PinAPI] inicializado. Usuario actual:', state.currentUser);
  }

  // ==========================================================
  // Exportar
  // ==========================================================
  global.PinAPI = {
    lock,
    unlock,
    setPin,
    switchUser,
    on,
    isLocked: () => state.locked,
    currentUser: () => state.currentUser ? { ...state.currentUser } : null,
    _config: CONFIG,
    _reset: () => { store.del(CONFIG.storageKey); store.del(CONFIG.sessionKey); }
  };

  init();

})(typeof window !== 'undefined' ? window : globalThis);
