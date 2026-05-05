/**
 * VOLVIX · api/services-catalog.js — Services & Staff catalog (real DB-backed).
 *
 * Endpoints:
 *   GET    /api/services           public  — catalog (?category)
 *   POST   /api/services           admin   — create service
 *   PATCH  /api/services/:id       admin
 *   DELETE /api/services/:id       admin
 *   GET    /api/staff              public  — list staff (?service_id filters by capability)
 *   POST   /api/staff              admin   — create staff member
 *   PATCH  /api/staff/:id          admin
 *   DELETE /api/staff/:id          admin
 *
 * DB tables (Postgres / Supabase):
 *
 *   create table if not exists pos_services (
 *     id          uuid primary key default gen_random_uuid(),
 *     tenant_id   uuid,
 *     name        text not null,
 *     duration_minutes int not null default 30,
 *     price       numeric(10,2) not null default 0,
 *     category    text,
 *     description text,
 *     color       text default '#3b82f6',
 *     active      boolean default true,
 *     created_at  timestamptz default now(),
 *     updated_at  timestamptz default now()
 *   );
 *   create index if not exists ix_svc_tenant on pos_services(tenant_id);
 *   create index if not exists ix_svc_category on pos_services(category);
 *
 *   create table if not exists pos_staff (
 *     id          uuid primary key default gen_random_uuid(),
 *     tenant_id   uuid,
 *     user_id     uuid,                       -- optional link to pos_users
 *     name        text not null,
 *     email       text,
 *     phone       text,
 *     photo_url   text,
 *     services_offered jsonb default '[]'::jsonb,  -- array of service ids
 *     schedule    jsonb default '{}'::jsonb,
 *                 -- {"mon":[{"start":"09:00","end":"18:00"}], ...}
 *     active      boolean default true,
 *     created_at  timestamptz default now(),
 *     updated_at  timestamptz default now()
 *   );
 *   create index if not exists ix_staff_tenant on pos_staff(tenant_id);
 */
'use strict';

const url = require('url');
const MAX_BODY = 64 * 1024;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '', size = 0;
    req.on('data', c => {
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

function sanitizeStr(s, max) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;
  if (max && s.length > max) s = s.slice(0, max);
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function tenantOf(req) {
  return (req && req.user && req.user.tenant_id) || null;
}

function isAdmin(req) {
  const r = (req && req.user && req.user.role) || '';
  return ['admin', 'owner', 'superadmin', 'manager'].includes(r);
}

function build(ctx) {
  const { supabaseRequest, sendJSON, sendError, requireAuth } = ctx;

  // ===================== SERVICES =====================
  async function listServices(req, res) {
    try {
      const tenantId = tenantOf(req) || (url.parse(req.url, true).query.tenant_id) || null;
      const q = url.parse(req.url, true).query;
      const filters = [];
      if (tenantId) filters.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`);
      filters.push('active=is.true');
      if (q.category) filters.push(`category=eq.${encodeURIComponent(q.category)}`);
      const qs = filters.join('&') + '&select=*&order=name.asc&limit=500';
      let items = [];
      try { items = await supabaseRequest('GET', `/pos_services?${qs}`) || []; }
      catch (_) { items = []; }
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  }

  async function createService(req, res) {
    try {
      if (!isAdmin(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      const name = sanitizeStr(body.name, 200);
      if (!name) return sendJSON(res, { error: 'validation', reason: 'name_required' }, 400);
      const dur = parseInt(body.duration_minutes, 10);
      if (!Number.isFinite(dur) || dur < 1 || dur > 8 * 60) {
        return sendJSON(res, { error: 'validation', reason: 'invalid_duration' }, 400);
      }
      const row = {
        tenant_id: tenantOf(req),
        name,
        duration_minutes: dur,
        price: Number(body.price) || 0,
        category: sanitizeStr(body.category, 80),
        description: sanitizeStr(body.description, 2000),
        color: sanitizeStr(body.color, 16) || '#3b82f6',
        active: body.active !== false,
      };
      let inserted = null;
      try {
        const out = await supabaseRequest('POST', '/pos_services', row);
        inserted = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      sendJSON(res, { ok: true, service: inserted }, 201);
    } catch (err) { sendError(res, err); }
  }

  async function patchService(req, res, params) {
    try {
      if (!isAdmin(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      const body = await readBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.name != null)        patch.name = sanitizeStr(body.name, 200);
      if (body.duration_minutes != null) {
        const d = parseInt(body.duration_minutes, 10);
        if (Number.isFinite(d) && d > 0) patch.duration_minutes = d;
      }
      if (body.price != null)       patch.price = Number(body.price) || 0;
      if (body.category != null)    patch.category = sanitizeStr(body.category, 80);
      if (body.description != null) patch.description = sanitizeStr(body.description, 2000);
      if (body.color != null)       patch.color = sanitizeStr(body.color, 16);
      if (body.active != null)      patch.active = !!body.active;
      const tenantId = tenantOf(req);
      const filt = `id=eq.${encodeURIComponent(id)}`
        + (tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '');
      let updated = null;
      try {
        const out = await supabaseRequest('PATCH', `/pos_services?${filt}`, patch);
        updated = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      if (!updated) return sendJSON(res, { error: 'not_found' }, 404);
      sendJSON(res, { ok: true, service: updated });
    } catch (err) { sendError(res, err); }
  }

  async function deleteService(req, res, params) {
    try {
      if (!isAdmin(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      const tenantId = tenantOf(req);
      const filt = `id=eq.${encodeURIComponent(id)}`
        + (tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '');
      try {
        await supabaseRequest('PATCH', `/pos_services?${filt}`,
          { active: false, updated_at: new Date().toISOString() });
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      sendJSON(res, { ok: true, deleted: true, id });
    } catch (err) { sendError(res, err); }
  }

  // ===================== STAFF =====================
  async function listStaff(req, res) {
    try {
      const q = url.parse(req.url, true).query;
      const tenantId = tenantOf(req) || q.tenant_id || null;
      const filters = [];
      if (tenantId) filters.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`);
      filters.push('active=is.true');
      const qs = filters.join('&') + '&select=*&order=name.asc&limit=500';
      let items = [];
      try { items = await supabaseRequest('GET', `/pos_staff?${qs}`) || []; }
      catch (_) { items = []; }
      if (q.service_id) {
        items = items.filter(s => {
          const so = s.services_offered;
          if (!so) return true;
          if (Array.isArray(so)) return so.length === 0 || so.includes(q.service_id);
          return true;
        });
      }
      // Strip internal fields for public consumption
      items = items.map(s => ({
        id: s.id, name: s.name, photo_url: s.photo_url,
        services_offered: s.services_offered, schedule: s.schedule,
      }));
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  }

  async function createStaff(req, res) {
    try {
      if (!isAdmin(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const body = await readBody(req);
      const name = sanitizeStr(body.name, 200);
      if (!name) return sendJSON(res, { error: 'validation', reason: 'name_required' }, 400);
      const email = sanitizeStr(body.email, 320);
      if (email && !EMAIL_RE.test(email)) {
        return sendJSON(res, { error: 'validation', reason: 'invalid_email' }, 400);
      }
      const services_offered = Array.isArray(body.services_offered)
        ? body.services_offered.filter(x => typeof x === 'string').slice(0, 100)
        : [];
      const schedule = (body.schedule && typeof body.schedule === 'object') ? body.schedule : {};
      const row = {
        tenant_id: tenantOf(req),
        user_id:   sanitizeStr(body.user_id, 64),
        name,
        email,
        phone:     sanitizeStr(body.phone, 32),
        photo_url: sanitizeStr(body.photo_url, 1000),
        services_offered,
        schedule,
        active: body.active !== false,
      };
      let inserted = null;
      try {
        const out = await supabaseRequest('POST', '/pos_staff', row);
        inserted = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      sendJSON(res, { ok: true, staff: inserted }, 201);
    } catch (err) { sendError(res, err); }
  }

  async function patchStaff(req, res, params) {
    try {
      if (!isAdmin(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      const body = await readBody(req);
      const patch = { updated_at: new Date().toISOString() };
      if (body.name != null)      patch.name = sanitizeStr(body.name, 200);
      if (body.email != null)     patch.email = sanitizeStr(body.email, 320);
      if (body.phone != null)     patch.phone = sanitizeStr(body.phone, 32);
      if (body.photo_url != null) patch.photo_url = sanitizeStr(body.photo_url, 1000);
      if (Array.isArray(body.services_offered)) {
        patch.services_offered = body.services_offered.filter(x => typeof x === 'string').slice(0, 100);
      }
      if (body.schedule && typeof body.schedule === 'object') patch.schedule = body.schedule;
      if (body.active != null)    patch.active = !!body.active;
      const tenantId = tenantOf(req);
      const filt = `id=eq.${encodeURIComponent(id)}`
        + (tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '');
      let updated = null;
      try {
        const out = await supabaseRequest('PATCH', `/pos_staff?${filt}`, patch);
        updated = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      if (!updated) return sendJSON(res, { error: 'not_found' }, 404);
      sendJSON(res, { ok: true, staff: updated });
    } catch (err) { sendError(res, err); }
  }

  async function deleteStaff(req, res, params) {
    try {
      if (!isAdmin(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      const tenantId = tenantOf(req);
      const filt = `id=eq.${encodeURIComponent(id)}`
        + (tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '');
      try {
        await supabaseRequest('PATCH', `/pos_staff?${filt}`,
          { active: false, updated_at: new Date().toISOString() });
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }
      sendJSON(res, { ok: true, deleted: true, id });
    } catch (err) { sendError(res, err); }
  }

  return {
    'GET /api/services':         listServices,
    'POST /api/services':        requireAuth(createService),
    'PATCH /api/services/:id':   requireAuth(patchService),
    'DELETE /api/services/:id':  requireAuth(deleteService),
    'GET /api/staff':            listStaff,
    'POST /api/staff':           requireAuth(createStaff),
    'PATCH /api/staff/:id':      requireAuth(patchStaff),
    'DELETE /api/staff/:id':     requireAuth(deleteStaff),
  };
}

module.exports = { build };
