// api/referrals.js
// Programa de referidos — código por usuario + tracking + comisión.
//
// Endpoints expuestos via register({ handlers, ... }):
//   GET  /api/referrals/me          (auth) → { code, link, stats, referrals }
//   POST /api/referrals/track       (público) body { ref, email, user_id? }
//   POST /api/referrals/convert     (auth admin) body { referral_id, commission }
//   GET  /api/referrals/leaderboard (admin)
//
// Tabla esperada: referrals
//   columns: id (uuid), referrer_user_id (uuid), referred_user_id (uuid|null),
//            referred_email (text|null), status (text default 'pending'),
//            commission_earned (numeric default 0),
//            signed_up_at (timestamptz|null), converted_at (timestamptz|null),
//            created_at (timestamptz default now())

'use strict';

const crypto = require('crypto');

function send(res, payload, status, helpers) {
  if (helpers && typeof helpers.sendJSON === 'function') {
    return helpers.sendJSON(res, payload, status || 200);
  }
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

function clientIpFrom(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return ['admin', 'superadmin', 'owner'].includes(role);
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Genera un código humano (8 chars) determinista a partir del user_id
function codeForUser(userId) {
  const h = crypto.createHash('sha256').update('volvix-ref|' + String(userId || '')).digest('hex');
  return h.slice(0, 8).toUpperCase();
}

function register(deps) {
  const {
    handlers,
    supabaseRequest,
    readBody,
    requireAuth,
    sendJSON,
    sendError,
    rateLimit,
  } = deps || {};

  if (!handlers) throw new Error('referrals: handlers required');

  const helpers = { sendJSON, sendError, readBody };
  const auth = requireAuth || ((fn) => fn);

  function buildLink(userId) {
    const base = process.env.PUBLIC_BASE_URL || 'https://volvix-pos.vercel.app';
    return base + '/registro.html?ref=' + encodeURIComponent(userId);
  }

  // ---------- GET /api/referrals/me ----------
  handlers['GET /api/referrals/me'] = auth(async (req, res) => {
    try {
      const u = req.user || {};
      const userId = u.id || u.user_id || u.email;
      if (!userId) return send(res, { ok: false, error: 'no_user' }, 401, helpers);

      let rows = [];
      if (typeof supabaseRequest === 'function') {
        try {
          rows = await supabaseRequest(
            'GET',
            '/referrals?referrer_user_id=eq.' + encodeURIComponent(userId) +
            '&select=*&order=created_at.desc&limit=200'
          );
        } catch (_) { rows = []; }
      }
      if (!Array.isArray(rows)) rows = [];
      const stats = {
        total: rows.length,
        signed_up: rows.filter((r) => r.signed_up_at).length,
        converted: rows.filter((r) => String(r.status) === 'converted').length,
        commission_earned: rows.reduce((s, r) => s + (Number(r.commission_earned) || 0), 0),
      };

      return send(res, {
        ok: true,
        code: codeForUser(userId),
        link: buildLink(userId),
        stats,
        referrals: rows,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // ---------- POST /api/referrals/track (PUBLIC) ----------
  handlers['POST /api/referrals/track'] = async (req, res) => {
    try {
      const ip = clientIpFrom(req);
      if (typeof rateLimit === 'function' && !rateLimit('ref:track:' + ip, 20, 60 * 1000)) {
        return send(res, { ok: false, error: 'rate_limited' }, 429, helpers);
      }
      const body = await readBodySafe(req, helpers);
      const ref = String((body && body.ref) || '').trim();
      const email = String((body && body.email) || '').trim().toLowerCase();
      const referredUserId = (body && body.user_id) ? String(body.user_id) : null;

      if (!ref) return send(res, { ok: false, error: 'ref_required' }, 400, helpers);
      if (email && !isValidEmail(email)) {
        return send(res, { ok: false, error: 'invalid_email' }, 400, helpers);
      }

      const row = {
        referrer_user_id: ref,
        referred_user_id: referredUserId,
        referred_email: email || null,
        status: referredUserId ? 'signed_up' : 'pending',
        signed_up_at: referredUserId ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      };

      let saved = null;
      if (typeof supabaseRequest === 'function') {
        try {
          const r = await supabaseRequest('POST', '/referrals', row, {
            headers: { Prefer: 'return=representation' },
          });
          saved = Array.isArray(r) ? r[0] : r;
        } catch (e) {
          return send(res, { ok: false, error: 'save_failed' }, 500, helpers);
        }
      }
      return send(res, { ok: true, id: saved && saved.id || null }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // ---------- POST /api/referrals/convert (ADMIN) ----------
  handlers['POST /api/referrals/convert'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const body = await readBodySafe(req, helpers);
      const id = (body && body.referral_id) ? String(body.referral_id) : null;
      const commission = Math.max(0, Number((body && body.commission) || 0));
      if (!id) return send(res, { ok: false, error: 'referral_id_required' }, 400, helpers);
      if (typeof supabaseRequest === 'function') {
        try {
          await supabaseRequest(
            'PATCH',
            '/referrals?id=eq.' + encodeURIComponent(id),
            {
              status: 'converted',
              commission_earned: commission,
              converted_at: new Date().toISOString(),
            }
          );
        } catch (e) {
          return send(res, { ok: false, error: 'patch_failed' }, 500, helpers);
        }
      }
      return send(res, { ok: true, id, commission }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // ---------- GET /api/referrals/leaderboard (ADMIN) ----------
  handlers['GET /api/referrals/leaderboard'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      let rows = [];
      if (typeof supabaseRequest === 'function') {
        try {
          rows = await supabaseRequest(
            'GET',
            '/referrals?select=referrer_user_id,status,commission_earned&limit=10000'
          );
        } catch (_) { rows = []; }
      }
      if (!Array.isArray(rows)) rows = [];
      const agg = {};
      for (const r of rows) {
        const key = r.referrer_user_id || 'unknown';
        if (!agg[key]) agg[key] = { user_id: key, total: 0, converted: 0, commission: 0 };
        agg[key].total++;
        if (String(r.status) === 'converted') agg[key].converted++;
        agg[key].commission += Number(r.commission_earned) || 0;
      }
      const board = Object.values(agg).sort((a, b) => b.commission - a.commission).slice(0, 100);
      return send(res, { ok: true, leaderboard: board }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  return [
    'GET /api/referrals/me',
    'POST /api/referrals/track',
    'POST /api/referrals/convert',
    'GET /api/referrals/leaderboard',
  ];
}

module.exports = { register, codeForUser };
