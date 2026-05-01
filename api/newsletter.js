// api/newsletter.js
// Newsletter subscriptions con confirmation email best-effort.
//
// Endpoints expuestos via register({ handlers, ... }):
//   POST /api/newsletter/subscribe    (público, rate-limit 3/min/IP)
//   GET  /api/newsletter/unsubscribe?token=...&email=...   (público, link email)
//   POST /api/newsletter/unsubscribe   body { email, token }
//   GET  /api/newsletter/subscribers   (admin)
//   POST /api/newsletter/send          (admin) body { subject, html, text? }
//
// Tabla esperada (ver SQL en CLAUDE.md):
//   newsletter_subscribers (id, email, name, source, giro_interest,
//                           status, unsubscribed_at, created_at)

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

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function unsubToken(email, secret) {
  return crypto.createHash('sha256')
    .update(String(email).toLowerCase() + '|' + String(secret || 'volvix-newsletter'))
    .digest('hex')
    .slice(0, 24);
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return ['admin', 'superadmin', 'owner'].includes(role);
}

function register(deps) {
  const {
    handlers,
    supabaseRequest,
    readBody,
    requireAuth,
    sendJSON,
    sendError,
    sendEmail,
    rateLimit,
    JWT_SECRET,
  } = deps || {};

  if (!handlers) throw new Error('newsletter: handlers required');

  const helpers = { sendJSON, sendError, readBody };
  const auth = requireAuth || ((fn) => fn);
  const SECRET = JWT_SECRET || process.env.JWT_SECRET || 'volvix-newsletter';

  // ---------- POST /api/newsletter/subscribe (PUBLIC) ----------
  handlers['POST /api/newsletter/subscribe'] = async (req, res) => {
    try {
      const ip = clientIpFrom(req);
      if (typeof rateLimit === 'function' && !rateLimit('newsletter:sub:' + ip, 3, 60 * 1000)) {
        return send(res, { ok: false, error: 'rate_limited' }, 429, helpers);
      }
      const body = await readBodySafe(req, helpers);
      // Honeypot: si el campo "website" o "company_url" trae algo, es bot.
      const honey = (body && (body.website || body.company_url || body.hp));
      if (honey && String(honey).length > 0) {
        // Responder 200 silenciosamente para no avisar al bot.
        return send(res, { ok: true, queued: true }, 200, helpers);
      }
      const email = String((body && body.email) || '').trim().toLowerCase();
      const name  = (body && body.name) ? String(body.name).slice(0, 120) : null;
      const source = (body && body.source) ? String(body.source).slice(0, 60) : 'web';
      const giro  = (body && body.giro_interest) ? String(body.giro_interest).slice(0, 60) : null;

      if (!isValidEmail(email)) {
        return send(res, { ok: false, error: 'invalid_email' }, 400, helpers);
      }

      const row = {
        email,
        name,
        source,
        giro_interest: giro,
        status: 'active',
        created_at: new Date().toISOString(),
      };

      let saved = null;
      let alreadyExisted = false;
      if (typeof supabaseRequest === 'function') {
        try {
          // upsert via on_conflict
          const r = await supabaseRequest(
            'POST',
            '/newsletter_subscribers?on_conflict=email',
            row,
            { headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }
          );
          saved = Array.isArray(r) ? r[0] : r;
        } catch (e) {
          // intento fallback: ver si ya existe
          try {
            const exist = await supabaseRequest(
              'GET',
              '/newsletter_subscribers?email=eq.' + encodeURIComponent(email) + '&select=*&limit=1'
            );
            if (Array.isArray(exist) && exist.length) {
              saved = exist[0];
              alreadyExisted = true;
            } else {
              throw e;
            }
          } catch (_) {
            return send(res, { ok: false, error: 'save_failed' }, 500, helpers);
          }
        }
      }

      // Best-effort confirmation email
      const token = unsubToken(email, SECRET);
      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://volvix-pos.vercel.app';
      const unsubUrl = baseUrl + '/api/newsletter/unsubscribe?email=' +
        encodeURIComponent(email) + '&token=' + token;
      if (typeof sendEmail === 'function') {
        try {
          await sendEmail({
            to: email,
            subject: 'Bienvenido al newsletter de Volvix',
            html: '<p>Hola' + (name ? ' ' + name : '') + ',</p>' +
                  '<p>Gracias por suscribirte al newsletter de Volvix. Recibirás tips de POS, marketing y noticias del producto.</p>' +
                  '<p>Si no fuiste tú, <a href="' + unsubUrl + '">cancela tu suscripción aquí</a>.</p>',
            text: 'Gracias por suscribirte al newsletter de Volvix. Si no fuiste tú: ' + unsubUrl,
          });
        } catch (_) { /* best-effort */ }
      }

      return send(res, {
        ok: true,
        already_subscribed: alreadyExisted,
        id: saved && saved.id || null,
      }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // ---------- GET /api/newsletter/unsubscribe?email&token (PUBLIC) ----------
  handlers['GET /api/newsletter/unsubscribe'] = async (req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost');
      const email = String(u.searchParams.get('email') || '').toLowerCase();
      const token = String(u.searchParams.get('token') || '');
      if (!isValidEmail(email) || !token) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('<h1>Solicitud inválida</h1>');
      }
      if (token !== unsubToken(email, SECRET)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('<h1>Token inválido</h1>');
      }
      if (typeof supabaseRequest === 'function') {
        try {
          await supabaseRequest(
            'PATCH',
            '/newsletter_subscribers?email=eq.' + encodeURIComponent(email),
            { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }
          );
        } catch (_) {}
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<!doctype html><meta charset="utf-8"><title>Suscripción cancelada</title>' +
        '<body style="font-family:system-ui;max-width:560px;margin:60px auto;text-align:center">' +
        '<h1>Suscripción cancelada</h1>' +
        '<p>Hemos cancelado tu suscripción al newsletter de Volvix. Lamentamos verte partir.</p>' +
        '<p><a href="/">Volver al inicio</a></p></body>');
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // ---------- POST /api/newsletter/unsubscribe ----------
  handlers['POST /api/newsletter/unsubscribe'] = async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const email = String((body && body.email) || '').trim().toLowerCase();
      const token = String((body && body.token) || '');
      if (!isValidEmail(email)) return send(res, { ok: false, error: 'invalid_email' }, 400, helpers);
      if (token && token !== unsubToken(email, SECRET)) {
        return send(res, { ok: false, error: 'invalid_token' }, 403, helpers);
      }
      if (typeof supabaseRequest === 'function') {
        try {
          await supabaseRequest(
            'PATCH',
            '/newsletter_subscribers?email=eq.' + encodeURIComponent(email),
            { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }
          );
        } catch (_) {}
      }
      return send(res, { ok: true }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // ---------- GET /api/newsletter/subscribers (ADMIN) ----------
  handlers['GET /api/newsletter/subscribers'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const u = new URL(req.url, 'http://localhost');
      const status = u.searchParams.get('status') || 'active';
      const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '200', 10) || 200, 1), 1000);
      let rows = [];
      if (typeof supabaseRequest === 'function') {
        try {
          rows = await supabaseRequest(
            'GET',
            '/newsletter_subscribers?status=eq.' + encodeURIComponent(status) +
            '&select=*&order=created_at.desc&limit=' + limit
          );
        } catch (e) {
          return send(res, { ok: false, error: String(e && e.message || e) }, 500, helpers);
        }
      }
      return send(res, { ok: true, rows: Array.isArray(rows) ? rows : [] }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // ---------- POST /api/newsletter/send (ADMIN broadcast) ----------
  handlers['POST /api/newsletter/send'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const body = await readBodySafe(req, helpers);
      const subject = String((body && body.subject) || '').slice(0, 200);
      const html = String((body && body.html) || '');
      const text = (body && body.text) ? String(body.text) : null;
      if (!subject || !html) return send(res, { ok: false, error: 'subject_html_required' }, 400, helpers);

      let recipients = [];
      if (typeof supabaseRequest === 'function') {
        try {
          recipients = await supabaseRequest(
            'GET',
            '/newsletter_subscribers?status=eq.active&select=email,name&limit=10000'
          );
        } catch (_) {}
      }
      let sent = 0;
      let failed = 0;
      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://volvix-pos.vercel.app';

      for (const r of (Array.isArray(recipients) ? recipients : [])) {
        const email = r && r.email;
        if (!isValidEmail(email)) { failed++; continue; }
        const token = unsubToken(email, SECRET);
        const unsubUrl = baseUrl + '/api/newsletter/unsubscribe?email=' +
          encodeURIComponent(email) + '&token=' + token;
        const finalHtml = html + '<hr><p style="font-size:12px;color:#888">' +
          '<a href="' + unsubUrl + '">Cancelar suscripción</a></p>';
        if (typeof sendEmail === 'function') {
          try {
            await sendEmail({ to: email, subject, html: finalHtml, text });
            sent++;
          } catch (_) { failed++; }
        } else {
          failed++;
        }
      }
      return send(res, { ok: true, sent, failed, total: (recipients && recipients.length) || 0 }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  return [
    'POST /api/newsletter/subscribe',
    'GET /api/newsletter/unsubscribe',
    'POST /api/newsletter/unsubscribe',
    'GET /api/newsletter/subscribers',
    'POST /api/newsletter/send',
  ];
}

module.exports = { register };
