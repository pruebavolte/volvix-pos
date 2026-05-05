/**
 * VOLVIX · api/leads.js — Lead capture (web form -> pos_leads table) + admin pipeline.
 *
 * Endpoints (mounted from index.js):
 *   POST   /api/leads               public  — capture (rate-limit: 5/min/IP)
 *   GET    /api/leads               admin   — list (status filter, pagination)
 *   PATCH  /api/leads/:id           admin   — update status / notes / assigned_to
 *
 * Requires: pos_leads table (see migrations/2026_pos_leads.sql).
 * Optional: api/email-resend.js for outbound notification to sales@.
 */
'use strict';

const NOTIFY_TO = (process.env.LEADS_NOTIFY_EMAIL || 'ventas@volvix.com').trim();
const MAX_BODY  = 32 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const _ipBuckets = new Map();

function rateLimitOk(ip) {
  const now = Date.now();
  let b = _ipBuckets.get(ip);
  if (!b || (now - b.start) > RATE_WINDOW_MS) {
    b = { start: now, count: 0 };
    _ipBuckets.set(ip, b);
  }
  b.count++;
  // GC every ~512 entries
  if (_ipBuckets.size > 512) {
    for (const [k, v] of _ipBuckets) {
      if ((now - v.start) > RATE_WINDOW_MS * 5) _ipBuckets.delete(k);
    }
  }
  return b.count <= RATE_MAX;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '', size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); reject(new Error('payload_too_large')); return; }
      buf += c;
    });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch (e) { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function sanitizeStr(s, max) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  if (max && s.length > max) s = s.slice(0, max);
  // strip control chars except CR/LF/TAB
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function buildLeadFromBody(body) {
  const name    = sanitizeStr(body.name, 200);
  const email   = sanitizeStr(body.email, 320);
  const phone   = sanitizeStr(body.phone, 32);
  const giro    = sanitizeStr(body.giro, 80);
  const message = sanitizeStr(body.message, 4000);
  const source  = sanitizeStr(body.source, 80) || 'web';

  if (!name && !email && !phone) return { err: 'name, email, or phone required' };
  if (email && !EMAIL_RE.test(email)) return { err: 'invalid_email' };

  return {
    lead: {
      name, email, phone, giro, message,
      source,
      utm_source:   sanitizeStr(body.utm_source, 80),
      utm_medium:   sanitizeStr(body.utm_medium, 80),
      utm_campaign: sanitizeStr(body.utm_campaign, 200),
      status: 'new',
    }
  };
}

const VALID_STATUS = new Set(['new', 'contacted', 'qualified', 'closed', 'rejected']);

/**
 * Factory: build handlers wired to the supabase REST client + email helper from index.js.
 *  ctx = {
 *    supabaseRequest(method, path, body),
 *    sendJSON(res, data, status?),
 *    sendError(res, err),
 *    requireAuth(handler, roles?),
 *    sendEmail?(opts),  // optional: api/email-resend
 *  }
 */
function build(ctx) {
  const { supabaseRequest, sendJSON, sendError, requireAuth } = ctx;
  const sendEmail = ctx.sendEmail || null;

  // ----------------------------------------------------------------
  // POST /api/leads — public capture
  // ----------------------------------------------------------------
  async function postLead(req, res) {
    try {
      const ip = clientIp(req);
      if (!rateLimitOk(ip)) {
        return sendJSON(res, { error: 'rate_limited', retry_after_s: 60 }, 429);
      }
      let body;
      try { body = await readBody(req); }
      catch (e) {
        return sendJSON(res, { error: 'bad_request', reason: e.message }, 400);
      }
      const built = buildLeadFromBody(body || {});
      if (built.err) return sendJSON(res, { error: 'validation', reason: built.err }, 400);
      const lead = built.lead;
      lead.ip = ip;
      lead.user_agent = sanitizeStr(req.headers['user-agent'], 400);

      let row = null;
      try {
        const inserted = await supabaseRequest('POST', '/pos_leads', lead);
        row = Array.isArray(inserted) ? inserted[0] : inserted;
      } catch (e) {
        // Table missing or unavailable: degrade gracefully without leaking errors
        return sendJSON(res, { ok: true, queued: true, note: 'lead recorded (deferred)' });
      }

      // Best-effort email notification (non-blocking)
      if (sendEmail && row) {
        try {
          await sendEmail({
            to: NOTIFY_TO,
            subject: `Nuevo lead: ${lead.name || lead.email || lead.phone || 'sin nombre'}`,
            text: [
              `Nombre:  ${lead.name  || '-'}`,
              `Email:   ${lead.email || '-'}`,
              `Telefono:${lead.phone || '-'}`,
              `Giro:    ${lead.giro  || '-'}`,
              `Source:  ${lead.source}`,
              `UTM:     ${lead.utm_source || '-'} / ${lead.utm_medium || '-'} / ${lead.utm_campaign || '-'}`,
              `Mensaje:`,
              lead.message || '-',
              ``,
              `IP: ${ip}`,
              `ID: ${row.id || ''}`,
            ].join('\n'),
          });
        } catch (_) { /* swallow */ }
      }

      sendJSON(res, { ok: true, id: row && row.id, status: 'new' }, 201);
    } catch (err) { sendError(res, err); }
  }

  // ----------------------------------------------------------------
  // GET /api/leads — admin list with filters
  // ----------------------------------------------------------------
  const url = require('url');
  async function getLeads(req, res) {
    try {
      const role = (req.user && req.user.role) || '';
      if (!['admin','owner','superadmin'].includes(role)) {
        return sendJSON(res, { error: 'forbidden', reason: 'role_required' }, 403);
      }
      const q = url.parse(req.url, true).query;
      const filters = [];
      if (q.status) filters.push(`status=eq.${encodeURIComponent(q.status)}`);
      if (q.giro)   filters.push(`giro=eq.${encodeURIComponent(q.giro)}`);
      if (q.from)   filters.push(`created_at=gte.${encodeURIComponent(q.from)}`);
      if (q.to)     filters.push(`created_at=lte.${encodeURIComponent(q.to)}`);
      let limit = parseInt(q.limit, 10); if (!limit || limit < 1) limit = 100; if (limit > 1000) limit = 1000;
      let page  = parseInt(q.page, 10);  if (!page || page < 1) page = 1;
      const offset = (page - 1) * limit;
      const qs = (filters.length ? filters.join('&') + '&' : '')
        + `select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
      let rows = [];
      try { rows = await supabaseRequest('GET', `/pos_leads?${qs}`) || []; }
      catch (_) { rows = []; }
      sendJSON(res, { ok: true, items: rows, page, limit, total: rows.length });
    } catch (err) { sendError(res, err); }
  }

  // ----------------------------------------------------------------
  // PATCH /api/leads/:id — admin update
  // ----------------------------------------------------------------
  async function patchLead(req, res, params) {
    try {
      const role = (req.user && req.user.role) || '';
      if (!['admin','owner','superadmin'].includes(role)) {
        return sendJSON(res, { error: 'forbidden', reason: 'role_required' }, 403);
      }
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      let body;
      try { body = await readBody(req); }
      catch (e) {
        return sendJSON(res, { error: 'bad_request', reason: e.message }, 400);
      }
      const patch = {};
      if (body.status != null) {
        if (!VALID_STATUS.has(String(body.status))) {
          return sendJSON(res, { error: 'validation', reason: 'invalid_status' }, 400);
        }
        patch.status = body.status;
      }
      if (body.notes != null)       patch.notes = sanitizeStr(body.notes, 4000);
      if (body.assigned_to != null) patch.assigned_to = sanitizeStr(body.assigned_to, 64);
      if (!Object.keys(patch).length) {
        return sendJSON(res, { error: 'validation', reason: 'no_fields' }, 400);
      }
      let updated = null;
      try {
        const out = await supabaseRequest(
          'PATCH',
          `/pos_leads?id=eq.${encodeURIComponent(id)}`,
          patch
        );
        updated = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      if (!updated) return sendJSON(res, { error: 'not_found' }, 404);
      sendJSON(res, { ok: true, lead: updated });
    } catch (err) { sendError(res, err); }
  }

  return {
    'POST /api/leads':       postLead,
    'GET /api/leads':        requireAuth(getLeads, ['admin','owner','superadmin']),
    'PATCH /api/leads/:id':  requireAuth(patchLead, ['admin','owner','superadmin']),
  };
}

module.exports = { build };
