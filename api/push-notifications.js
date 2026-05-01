// api/push-notifications.js
// Web Push subscriptions (mock VAPID, listo para producción).
//
// Endpoints expuestos via register(handlers, deps):
//   POST   /api/push/subscribe              body { endpoint, keys: { p256dh, auth } }
//   POST   /api/push/send                   body { title, body, url? }   (admin)
//   DELETE /api/push/unsubscribe/:endpoint
//   GET    /api/push/subscriptions          (admin)
//
// Tabla esperada en Supabase: push_subscriptions
//   columns: id (uuid), tenant_id (uuid), user_id (uuid|null),
//            endpoint (text, unique), p256dh (text), auth (text),
//            active (bool default true), created_at (timestamptz default now())

'use strict';

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : (def === undefined ? 0 : def);
}

function send(res, payload, status, helpers) {
  if (helpers && typeof helpers.sendJSON === 'function') return helpers.sendJSON(res, payload, status || 200);
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readBodySafe(req, helpers) {
  if (helpers && typeof helpers.readBody === 'function') return helpers.readBody(req);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ============ STORE ============

function makeStore(supabaseRequest) {
  if (typeof supabaseRequest === 'function') {
    return {
      async addSubscription(row) {
        try {
          // Upsert por endpoint para evitar duplicados
          const existing = await supabaseRequest('GET', `/push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}&select=id&limit=1`);
          if (Array.isArray(existing) && existing.length) {
            await supabaseRequest('PATCH', `/push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`, {
              active: true, p256dh: row.p256dh, auth: row.auth
            });
            return { ok: true, updated: true };
          }
          await supabaseRequest('POST', '/push_subscriptions', row);
          return { ok: true, created: true };
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) };
        }
      },
      async removeSubscription(endpoint) {
        try {
          await supabaseRequest('PATCH', `/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { active: false });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) };
        }
      },
      async listActive(limit) {
        const lim = Math.min(Math.max(num(limit, 500), 1), 5000);
        try {
          const rows = await supabaseRequest('GET', `/push_subscriptions?active=eq.true&select=*&limit=${lim}`);
          return Array.isArray(rows) ? rows : [];
        } catch (e) {
          return { _error: String(e && e.message || e) };
        }
      },
    };
  }
  // Fallback en-memoria
  const subs = new Map();
  return {
    async addSubscription(row) {
      subs.set(row.endpoint, Object.assign({}, row, { active: true, created_at: new Date().toISOString() }));
      return { ok: true };
    },
    async removeSubscription(endpoint) {
      const s = subs.get(endpoint);
      if (s) { s.active = false; }
      return { ok: !!s };
    },
    async listActive() {
      return Array.from(subs.values()).filter((s) => s.active !== false);
    },
  };
}

// ============ WEB PUSH (mock — listo para integrar `web-push` cuando haya VAPID real) ============

async function sendWebPush(sub, payload) {
  // En producción: const webpush = require('web-push'); webpush.setVapidDetails(...); webpush.sendNotification(sub, JSON.stringify(payload));
  // Mock: solo loguea. No falla.
  if (!sub || !sub.endpoint) return { ok: false, error: 'no_endpoint' };
  if (typeof sub.endpoint === 'string' && sub.endpoint.indexOf('mock://') === 0) {
    return { ok: true, mock: true };
  }
  // Si hay un módulo `web-push` instalado y VAPID configurado, intentamos usarlo
  try {
    let webpush;
    try { webpush = require('web-push'); } catch (_) { webpush = null; }
    if (webpush && process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@volvix.com',
        process.env.VAPID_PUBLIC,
        process.env.VAPID_PRIVATE
      );
      const wpSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh || (sub.keys && sub.keys.p256dh), auth: sub.auth || (sub.keys && sub.keys.auth) },
      };
      await webpush.sendNotification(wpSub, JSON.stringify(payload));
      return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
  return { ok: true, mock: true, reason: 'vapid_not_configured' };
}

// ============ HANDLERS ============

function buildHandlers(deps) {
  deps = deps || {};
  const helpers = { sendJSON: deps.sendJSON, sendError: deps.sendError, readBody: deps.readBody };
  const requireAuth = deps.requireAuth || ((fn) => fn);
  const store = makeStore(deps.supabaseRequest);

  // POST /api/push/subscribe  — público (un usuario logueado se suscribe)
  const postSubscribe = async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const endpoint = body && body.endpoint;
      if (!endpoint || typeof endpoint !== 'string') {
        return send(res, { ok: false, error: 'endpoint_required' }, 400, helpers);
      }
      const keys = (body && body.keys) || {};
      const tenantId = (req.user && req.user.tenant_id) || null;
      const userId = (req.user && req.user.id) || null;
      const row = {
        tenant_id: tenantId,
        user_id: userId,
        endpoint: endpoint,
        p256dh: keys.p256dh || null,
        auth: keys.auth || null,
        active: true,
      };
      const r = await store.addSubscription(row);
      if (!r.ok) return send(res, { ok: false, error: r.error || 'store_failed' }, 500, helpers);
      return send(res, { ok: true, created: !!r.created, updated: !!r.updated }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // POST /api/push/send  — admin only
  const postSend = requireAuth(async (req, res) => {
    try {
      // Solo admins pueden enviar a todos
      const role = req.user && req.user.role;
      if (role && !['admin', 'owner', 'platform_owner'].includes(String(role))) {
        return send(res, { ok: false, error: 'forbidden' }, 403, helpers);
      }
      const body = await readBodySafe(req, helpers);
      const title = (body && body.title) || 'Volvix';
      const text = (body && body.body) || '';
      const url = (body && body.url) || '/';
      const subs = await store.listActive(body && body.limit);
      if (subs && subs._error) return send(res, { ok: false, error: subs._error }, 500, helpers);
      const payload = { title: String(title).slice(0, 120), body: String(text).slice(0, 500), url: String(url).slice(0, 500) };
      let sent = 0, failed = 0;
      for (const s of subs) {
        const r = await sendWebPush(s, payload);
        if (r.ok) sent++; else failed++;
      }
      return send(res, { ok: true, sent, failed, total: subs.length }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // DELETE /api/push/unsubscribe/:endpoint
  const delUnsubscribe = async (req, res, params) => {
    try {
      const ep = params && params.endpoint;
      if (!ep) return send(res, { ok: false, error: 'endpoint_required' }, 400, helpers);
      const r = await store.removeSubscription(decodeURIComponent(ep));
      if (!r.ok) return send(res, { ok: false, error: r.error || 'not_found' }, 404, helpers);
      return send(res, { ok: true }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // GET /api/push/subscriptions — admin
  const getSubs = requireAuth(async (req, res) => {
    try {
      const role = req.user && req.user.role;
      if (role && !['admin', 'owner', 'platform_owner'].includes(String(role))) {
        return send(res, { ok: false, error: 'forbidden' }, 403, helpers);
      }
      const rows = await store.listActive(500);
      if (rows && rows._error) return send(res, { ok: false, error: rows._error }, 500, helpers);
      return send(res, Array.isArray(rows) ? rows : [], 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  return {
    'POST /api/push/subscribe':              postSubscribe,
    'POST /api/push/send':                   postSend,
    'DELETE /api/push/unsubscribe/:endpoint': delUnsubscribe,
    'GET /api/push/subscriptions':           getSubs,
  };
}

function register(handlers, deps) {
  const own = buildHandlers(deps || {});
  for (const k of Object.keys(own)) {
    if (!handlers[k]) handlers[k] = own[k];
  }
  return Object.keys(own);
}

module.exports = { register, buildHandlers, sendWebPush };
