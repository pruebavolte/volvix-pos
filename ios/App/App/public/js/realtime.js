// Volvix POS — Supabase Realtime client (R14)
// Namespace: window.Volvix.realtime
// Carga el cliente Supabase JS via CDN (ESM) y expone:
//   - Volvix.realtime.subscribeSales(tenantId, cb)
//   - Volvix.realtime.subscribePresence(tenantId)
//   - Volvix.realtime.broadcastNotification(tenantId, payload)
//
// SOLO usa la anon key (NUNCA service key en cliente). La anon key se obtiene
// del endpoint /api/config/public que el servidor expone explícitamente.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── Toast UI mínimo ───────────────────────────────────────────────────────────
function ensureToastContainer() {
  let c = document.getElementById('volvix-toast-container');
  if (c) return c;
  c = document.createElement('div');
  c.id = 'volvix-toast-container';
  c.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'z-index:99999',
    'display:flex', 'flex-direction:column', 'gap:8px',
    'pointer-events:none', 'font-family:system-ui,sans-serif',
  ].join(';');
  document.body.appendChild(c);
  return c;
}

function showToast(text, kind = 'info', ms = 4000) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  const colors = {
    info:    { bg: '#1e293b', fg: '#fff',  bd: '#3b82f6' },
    success: { bg: '#064e3b', fg: '#fff',  bd: '#10b981' },
    warn:    { bg: '#78350f', fg: '#fff',  bd: '#f59e0b' },
    error:   { bg: '#7f1d1d', fg: '#fff',  bd: '#ef4444' },
  }[kind] || { bg: '#1e293b', fg: '#fff', bd: '#3b82f6' };

  el.style.cssText = [
    `background:${colors.bg}`, `color:${colors.fg}`,
    `border-left:4px solid ${colors.bd}`,
    'padding:12px 16px', 'border-radius:8px', 'min-width:240px', 'max-width:360px',
    'box-shadow:0 8px 24px rgba(0,0,0,.25)', 'pointer-events:auto',
    'font-size:14px', 'line-height:1.4',
    'transform:translateX(120%)', 'transition:transform .25s ease',
  ].join(';');
  el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    el.style.transform = 'translateX(120%)';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ─── Bootstrap del cliente Supabase ────────────────────────────────────────────
let _client = null;
let _clientPromise = null;

async function fetchPublicConfig() {
  const r = await fetch('/api/config/public', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`/api/config/public ${r.status}`);
  const cfg = await r.json();
  if (!cfg.supabase_url || !cfg.supabase_anon_key) {
    throw new Error('Config pública incompleta');
  }
  // Hard guard: nunca aceptar una service key en el cliente
  // (las service keys tienen role:"service_role" en el JWT)
  try {
    const payload = JSON.parse(atob(cfg.supabase_anon_key.split('.')[1]));
    if (payload.role && payload.role !== 'anon') {
      throw new Error(`Key inválida: role=${payload.role} (debe ser anon)`);
    }
  } catch (e) {
    if (String(e.message).startsWith('Key inválida')) throw e;
    // si no se puede decodificar, igual seguimos: lo importante es que el server jamás mande service
  }
  return cfg;
}

async function getClient() {
  if (_client) return _client;
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    const cfg = await fetchPublicConfig();
    _client = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
    return _client;
  })();
  return _clientPromise;
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Suscripción a ventas en tiempo real para un tenant.
 * Otros cajeros del mismo tenant verán cuando entra una venta nueva.
 *
 * @param {string} tenantId - UUID del tenant
 * @param {(payload:{event:string,new:object,old:object}) => void} cb
 * @returns {Promise<{unsubscribe:()=>void}>}
 */
async function subscribeSales(tenantId, cb) {
  if (!tenantId) throw new Error('tenantId requerido');
  const sb = await getClient();
  const channel = sb
    .channel(`sales:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'volvix_ventas',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        try {
          const v = payload.new || {};
          const total = v.total != null ? `$${Number(v.total).toFixed(2)}` : '';
          showToast(`Nueva venta ${total}`.trim(), 'success');
        } catch (_) {}
        try { cb && cb(payload); } catch (e) { console.error('[Realtime] cb sales error', e); }
      }
    )
    .subscribe((status) => {
      console.log(`[Realtime] sales:${tenantId} → ${status}`);
    });

  return {
    unsubscribe: () => { try { sb.removeChannel(channel); } catch (_) {} },
    channel,
  };
}

/**
 * Suscripción de presencia: lista de cajeros activos de un tenant.
 * Usa el canal `presence:<tenantId>`. Auto-trackea el usuario actual leído de
 * localStorage.volvix_session (formato del /api/login).
 *
 * @param {string} tenantId
 * @param {(state:Array<{user_id:string,email:string,role:string,since:number}>)=>void} [onChange]
 * @returns {Promise<{unsubscribe:()=>void, state:()=>Array}>}
 */
async function subscribePresence(tenantId, onChange) {
  if (!tenantId) throw new Error('tenantId requerido');
  const sb = await getClient();

  let me = { user_id: 'anon', email: 'anon', role: 'guest' };
  try {
    const raw = localStorage.getItem('volvix_session');
    if (raw) {
      const s = JSON.parse(raw);
      me = {
        user_id: s.user_id || 'anon',
        email:   s.email   || 'anon',
        role:    s.role    || 'guest',
      };
    }
  } catch (_) {}

  const channel = sb.channel(`presence:${tenantId}`, {
    config: { presence: { key: me.user_id } },
  });

  function flatState() {
    const raw = channel.presenceState();
    const out = [];
    for (const k of Object.keys(raw)) {
      for (const meta of raw[k]) out.push(meta);
    }
    return out;
  }

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = flatState();
      try { onChange && onChange(state); } catch (e) { console.error('[Realtime] presence sync cb', e); }
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      for (const p of newPresences) {
        if (p.user_id !== me.user_id) showToast(`${p.email} entró`, 'info', 2500);
      }
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const p of leftPresences) {
        if (p.user_id !== me.user_id) showToast(`${p.email} salió`, 'warn', 2500);
      }
    })
    .subscribe(async (status) => {
      console.log(`[Realtime] presence:${tenantId} → ${status}`);
      if (status === 'SUBSCRIBED') {
        await channel.track({ ...me, since: Date.now() });
      }
    });

  return {
    unsubscribe: () => { try { sb.removeChannel(channel); } catch (_) {} },
    state: flatState,
    channel,
  };
}

// Cache de canales broadcast por tenant para no abrir uno nuevo cada envío
const _broadcastChannels = new Map();

/**
 * Envía un anuncio broadcast a todos los clientes del tenant.
 * Cualquier cliente que se haya suscrito al canal `broadcast:<tenantId>`
 * (vía subscribeBroadcast) lo recibirá.
 *
 * @param {string} tenantId
 * @param {object} payload - cualquier objeto serializable; típicamente {title, body, kind}
 */
async function broadcastNotification(tenantId, payload) {
  if (!tenantId) throw new Error('tenantId requerido');
  const sb = await getClient();
  let ch = _broadcastChannels.get(tenantId);
  if (!ch) {
    ch = sb.channel(`broadcast:${tenantId}`, {
      config: { broadcast: { self: false, ack: true } },
    });
    await new Promise((resolve) => {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });
    _broadcastChannels.set(tenantId, ch);
  }
  return ch.send({
    type: 'broadcast',
    event: 'notification',
    payload: { ts: Date.now(), ...payload },
  });
}

/**
 * Suscripción al canal de anuncios broadcast del tenant.
 * Muestra un toast y llama al callback opcional.
 */
async function subscribeBroadcast(tenantId, cb) {
  if (!tenantId) throw new Error('tenantId requerido');
  const sb = await getClient();
  const channel = sb
    .channel(`broadcast:${tenantId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'notification' }, ({ payload }) => {
      try {
        const title = payload?.title || 'Anuncio';
        const body  = payload?.body  || '';
        showToast(body ? `${title}: ${body}` : title, payload?.kind || 'info', 5000);
      } catch (_) {}
      try { cb && cb(payload); } catch (e) { console.error('[Realtime] cb broadcast error', e); }
    })
    .subscribe((status) => {
      console.log(`[Realtime] broadcast:${tenantId} → ${status}`);
    });
  return {
    unsubscribe: () => { try { sb.removeChannel(channel); } catch (_) {} },
    channel,
  };
}

// ─── Export al global Volvix.realtime ──────────────────────────────────────────
const api = {
  subscribeSales,
  subscribePresence,
  subscribeBroadcast,
  broadcastNotification,
  showToast,
  _getClient: getClient, // util para debugging
};

if (typeof window !== 'undefined') {
  window.Volvix = window.Volvix || {};
  window.Volvix.realtime = api;
}

export default api;
export {
  subscribeSales,
  subscribePresence,
  subscribeBroadcast,
  broadcastNotification,
  showToast,
};
