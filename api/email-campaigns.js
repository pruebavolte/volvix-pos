// api/email-campaigns.js
// Email Marketing — Campañas con segmentación, schedule, stats.
//
// Endpoints expuestos via register({ handlers, ... }):
//   POST /api/campaigns/create            (admin) crea campaña con segmentación
//   POST /api/campaigns/:id/send-now      (admin) envía a target inmediatamente
//   POST /api/campaigns/:id/schedule      (admin) agenda envío futuro
//   GET  /api/campaigns                   (admin) lista campañas
//   GET  /api/campaigns/:id/stats         (admin) opens/clicks/bounces
//   GET  /api/campaigns/track/open        (público) pixel 1x1 tracker
//   GET  /api/campaigns/track/click       (público) redirect tracker
//
// Tablas SQL esperadas:
//
// CREATE TABLE email_campaigns (
//   id BIGSERIAL PRIMARY KEY,
//   tenant_id TEXT,
//   name TEXT NOT NULL,
//   subject TEXT NOT NULL,
//   html TEXT NOT NULL,
//   text TEXT,
//   template TEXT,
//   segment JSONB DEFAULT '{}'::jsonb,   -- {giro, plan, last_login_days, min_purchase_value}
//   status TEXT DEFAULT 'draft',          -- draft | scheduled | sending | sent | failed
//   scheduled_at TIMESTAMPTZ,
//   sent_at TIMESTAMPTZ,
//   total_targets INT DEFAULT 0,
//   total_sent INT DEFAULT 0,
//   total_failed INT DEFAULT 0,
//   created_by TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   updated_at TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX idx_campaigns_status ON email_campaigns(status);
// CREATE INDEX idx_campaigns_scheduled ON email_campaigns(scheduled_at);
//
// CREATE TABLE email_campaign_events (
//   id BIGSERIAL PRIMARY KEY,
//   campaign_id BIGINT REFERENCES email_campaigns(id) ON DELETE CASCADE,
//   recipient_email TEXT,
//   event_type TEXT,                       -- sent | open | click | bounce | unsubscribe
//   event_data JSONB,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
// CREATE INDEX idx_campaign_events_cid ON email_campaign_events(campaign_id);
// CREATE INDEX idx_campaign_events_type ON email_campaign_events(event_type);

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
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  return ['admin', 'superadmin', 'owner'].includes(role);
}

function trackToken(campaignId, email, secret) {
  return crypto.createHash('sha256')
    .update(String(campaignId) + '|' + String(email).toLowerCase() + '|' + String(secret || 'volvix-campaigns'))
    .digest('hex')
    .slice(0, 20);
}

// Construye query Supabase a partir de segment {giro, plan, last_login_days, min_purchase_value}
async function resolveSegmentTargets(segment, supabaseRequest) {
  if (typeof supabaseRequest !== 'function') return [];
  const seg = segment || {};
  const filters = [];
  if (seg.giro) filters.push('giro=eq.' + encodeURIComponent(String(seg.giro)));
  if (seg.plan) filters.push('plan=eq.' + encodeURIComponent(String(seg.plan)));
  if (seg.last_login_days != null) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - Number(seg.last_login_days));
    filters.push('last_login=gte.' + encodeURIComponent(d.toISOString()));
  }
  if (seg.min_purchase_value != null) {
    filters.push('total_purchases=gte.' + encodeURIComponent(String(Number(seg.min_purchase_value))));
  }
  filters.push('email=not.is.null');
  filters.push('marketing_opt_in=eq.true');
  const qs = '/pos_users?select=email,name,giro,plan' +
    (filters.length ? '&' + filters.join('&') : '') +
    '&limit=10000';
  try {
    const rows = await supabaseRequest('GET', qs);
    return Array.isArray(rows) ? rows.filter((r) => isValidEmail(r && r.email)) : [];
  } catch (_) {
    // fallback: si la tabla difiere, intentar newsletter_subscribers
    try {
      const rows2 = await supabaseRequest(
        'GET',
        '/newsletter_subscribers?status=eq.active&select=email,name&limit=10000'
      );
      return Array.isArray(rows2) ? rows2.filter((r) => isValidEmail(r && r.email)) : [];
    } catch (_) { return []; }
  }
}

function pixelGif() {
  return Buffer.from(
    'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    'base64'
  );
}

function injectTracking(html, campaignId, email, baseUrl, secret) {
  const token = trackToken(campaignId, email, secret);
  const openPx = baseUrl + '/api/campaigns/track/open?cid=' + campaignId +
    '&e=' + encodeURIComponent(email) + '&t=' + token;
  const tracked = String(html).replace(/href="(https?:\/\/[^"]+)"/g, (m, u) => {
    const wrap = baseUrl + '/api/campaigns/track/click?cid=' + campaignId +
      '&e=' + encodeURIComponent(email) + '&t=' + token +
      '&u=' + encodeURIComponent(u);
    return 'href="' + wrap + '"';
  });
  return tracked + '<img src="' + openPx + '" width="1" height="1" alt="" style="display:none">';
}

async function logEvent(supabaseRequest, campaignId, email, type, data) {
  if (typeof supabaseRequest !== 'function') return;
  try {
    await supabaseRequest('POST', '/email_campaign_events', {
      campaign_id: campaignId,
      recipient_email: email,
      event_type: type,
      event_data: data || null,
      created_at: new Date().toISOString(),
    });
  } catch (_) { /* best-effort */ }
}

async function executeCampaignSend(campaign, deps) {
  const { supabaseRequest, sendEmail, baseUrl, SECRET } = deps;
  const targets = await resolveSegmentTargets(campaign.segment, supabaseRequest);
  let sent = 0, failed = 0;
  if (typeof supabaseRequest === 'function') {
    try {
      await supabaseRequest('PATCH', '/email_campaigns?id=eq.' + campaign.id, {
        status: 'sending',
        total_targets: targets.length,
      });
    } catch (_) {}
  }
  for (const r of targets) {
    const email = r.email;
    if (!isValidEmail(email)) { failed++; continue; }
    const personalizedHtml = String(campaign.html || '')
      .replace(/\{\{name\}\}/g, r.name || '')
      .replace(/\{\{email\}\}/g, email);
    const finalHtml = injectTracking(personalizedHtml, campaign.id, email, baseUrl, SECRET);
    if (typeof sendEmail === 'function') {
      try {
        const result = await sendEmail({
          to: email,
          subject: campaign.subject,
          html: finalHtml,
          text: campaign.text || null,
          template: 'campaign_' + campaign.id,
        });
        if (result && result.ok === false) { failed++; continue; }
        sent++;
        await logEvent(supabaseRequest, campaign.id, email, 'sent', null);
      } catch (_) { failed++; }
    } else {
      failed++;
    }
  }
  if (typeof supabaseRequest === 'function') {
    try {
      await supabaseRequest('PATCH', '/email_campaigns?id=eq.' + campaign.id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        total_sent: sent,
        total_failed: failed,
      });
    } catch (_) {}
  }
  return { sent, failed, total: targets.length };
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
    JWT_SECRET,
  } = deps || {};

  if (!handlers) throw new Error('email-campaigns: handlers required');

  const helpers = { sendJSON, sendError, readBody };
  const auth = requireAuth || ((fn) => fn);
  const SECRET = JWT_SECRET || process.env.JWT_SECRET || 'volvix-campaigns';
  const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://volvix-pos.vercel.app').replace(/\/$/, '');

  // POST /api/campaigns/create
  handlers['POST /api/campaigns/create'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const body = await readBodySafe(req, helpers);
      const name = String((body && body.name) || '').slice(0, 200).trim();
      const subject = String((body && body.subject) || '').slice(0, 200).trim();
      const html = String((body && body.html) || '');
      const text = (body && body.text) ? String(body.text) : null;
      const template = (body && body.template) ? String(body.template).slice(0, 60) : null;
      const segment = (body && body.segment && typeof body.segment === 'object') ? body.segment : {};
      if (!name || !subject || !html) {
        return send(res, { ok: false, error: 'name_subject_html_required' }, 400, helpers);
      }
      const row = {
        tenant_id: (req.user && req.user.tenant_id) || null,
        name, subject, html, text, template,
        segment,
        status: 'draft',
        created_by: (req.user && (req.user.email || req.user.id)) || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      let saved = null;
      if (typeof supabaseRequest === 'function') {
        try {
          const r = await supabaseRequest('POST', '/email_campaigns', row);
          saved = Array.isArray(r) ? r[0] : r;
        } catch (e) {
          return send(res, { ok: false, error: 'save_failed', detail: String(e && e.message || e) }, 500, helpers);
        }
      }
      return send(res, { ok: true, campaign: saved }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // POST /api/campaigns/:id/send-now
  handlers['POST /api/campaigns/:id/send-now'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const id = parseInt((req.params && req.params.id) || 0, 10);
      if (!id) return send(res, { ok: false, error: 'id_required' }, 400, helpers);
      let campaign = null;
      if (typeof supabaseRequest === 'function') {
        try {
          const rows = await supabaseRequest('GET', '/email_campaigns?id=eq.' + id + '&select=*&limit=1');
          campaign = Array.isArray(rows) && rows.length ? rows[0] : null;
        } catch (_) {}
      }
      if (!campaign) return send(res, { ok: false, error: 'not_found' }, 404, helpers);
      if (['sending', 'sent'].includes(campaign.status)) {
        return send(res, { ok: false, error: 'already_' + campaign.status }, 409, helpers);
      }
      const result = await executeCampaignSend(campaign, { supabaseRequest, sendEmail, baseUrl, SECRET });
      return send(res, { ok: true, ...result }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // POST /api/campaigns/:id/schedule
  handlers['POST /api/campaigns/:id/schedule'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const id = parseInt((req.params && req.params.id) || 0, 10);
      if (!id) return send(res, { ok: false, error: 'id_required' }, 400, helpers);
      const body = await readBodySafe(req, helpers);
      const scheduledAt = body && body.scheduled_at;
      const dt = scheduledAt ? new Date(scheduledAt) : null;
      if (!dt || isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
        return send(res, { ok: false, error: 'invalid_scheduled_at' }, 400, helpers);
      }
      if (typeof supabaseRequest === 'function') {
        try {
          await supabaseRequest('PATCH', '/email_campaigns?id=eq.' + id, {
            status: 'scheduled',
            scheduled_at: dt.toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          return send(res, { ok: false, error: 'update_failed' }, 500, helpers);
        }
      }
      return send(res, { ok: true, scheduled_at: dt.toISOString() }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // GET /api/campaigns
  handlers['GET /api/campaigns'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const u = new URL(req.url, 'http://localhost');
      const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '100', 10) || 100, 1), 500);
      const status = u.searchParams.get('status');
      let rows = [];
      if (typeof supabaseRequest === 'function') {
        try {
          let qs = '/email_campaigns?select=*&order=created_at.desc&limit=' + limit;
          if (status) qs += '&status=eq.' + encodeURIComponent(status);
          rows = await supabaseRequest('GET', qs);
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

  // GET /api/campaigns/:id/stats
  handlers['GET /api/campaigns/:id/stats'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const id = parseInt((req.params && req.params.id) || 0, 10);
      if (!id) return send(res, { ok: false, error: 'id_required' }, 400, helpers);
      const stats = { sent: 0, opens: 0, unique_opens: 0, clicks: 0, unique_clicks: 0, bounces: 0, unsubscribes: 0 };
      let campaign = null;
      if (typeof supabaseRequest === 'function') {
        try {
          const rows = await supabaseRequest('GET', '/email_campaigns?id=eq.' + id + '&select=*&limit=1');
          campaign = Array.isArray(rows) && rows.length ? rows[0] : null;
          const events = await supabaseRequest(
            'GET',
            '/email_campaign_events?campaign_id=eq.' + id + '&select=event_type,recipient_email&limit=100000'
          );
          const opens = new Set(), clicks = new Set();
          for (const e of (Array.isArray(events) ? events : [])) {
            if (e.event_type === 'sent') stats.sent++;
            else if (e.event_type === 'open') { stats.opens++; opens.add(e.recipient_email); }
            else if (e.event_type === 'click') { stats.clicks++; clicks.add(e.recipient_email); }
            else if (e.event_type === 'bounce') stats.bounces++;
            else if (e.event_type === 'unsubscribe') stats.unsubscribes++;
          }
          stats.unique_opens = opens.size;
          stats.unique_clicks = clicks.size;
        } catch (e) {
          return send(res, { ok: false, error: String(e && e.message || e) }, 500, helpers);
        }
      }
      const open_rate = stats.sent ? +(stats.unique_opens / stats.sent * 100).toFixed(2) : 0;
      const click_rate = stats.sent ? +(stats.unique_clicks / stats.sent * 100).toFixed(2) : 0;
      return send(res, { ok: true, campaign, stats: { ...stats, open_rate, click_rate } }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // GET /api/campaigns/track/open  (público)
  handlers['GET /api/campaigns/track/open'] = async (req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost');
      const cid = parseInt(u.searchParams.get('cid') || '0', 10);
      const email = String(u.searchParams.get('e') || '').toLowerCase();
      const token = String(u.searchParams.get('t') || '');
      if (cid && isValidEmail(email) && token === trackToken(cid, email, SECRET)) {
        await logEvent(supabaseRequest, cid, email, 'open', { ua: req.headers && req.headers['user-agent'] || '' });
      }
      const gif = pixelGif();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', gif.length);
      return res.end(gif);
    } catch (_) {
      const gif = pixelGif();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/gif');
      return res.end(gif);
    }
  };

  // GET /api/campaigns/track/click  (público)
  handlers['GET /api/campaigns/track/click'] = async (req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost');
      const cid = parseInt(u.searchParams.get('cid') || '0', 10);
      const email = String(u.searchParams.get('e') || '').toLowerCase();
      const token = String(u.searchParams.get('t') || '');
      const target = String(u.searchParams.get('u') || '');
      let safeTarget = '/';
      try {
        const tu = new URL(target);
        if (tu.protocol === 'http:' || tu.protocol === 'https:') safeTarget = tu.toString();
      } catch (_) {}
      if (cid && isValidEmail(email) && token === trackToken(cid, email, SECRET)) {
        await logEvent(supabaseRequest, cid, email, 'click', { url: safeTarget });
      }
      res.statusCode = 302;
      res.setHeader('Location', safeTarget);
      return res.end();
    } catch (_) {
      res.statusCode = 302;
      res.setHeader('Location', '/');
      return res.end();
    }
  };

  return [
    'POST /api/campaigns/create',
    'POST /api/campaigns/:id/send-now',
    'POST /api/campaigns/:id/schedule',
    'GET /api/campaigns',
    'GET /api/campaigns/:id/stats',
    'GET /api/campaigns/track/open',
    'GET /api/campaigns/track/click',
  ];
}

module.exports = { register, executeCampaignSend, resolveSegmentTargets };
