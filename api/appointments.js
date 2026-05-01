/**
 * VOLVIX · api/appointments.js — Appointment booking system (real DB-backed).
 *
 * Endpoints:
 *   POST   /api/appointments                       public-create / staff-create
 *   GET    /api/appointments                       admin list (?status=upcoming|past|all, date, staff_id)
 *   GET    /api/appointments/availability          public (?date=YYYY-MM-DD&service_id&staff_id)
 *   POST   /api/appointments/:id/confirm           admin
 *   POST   /api/appointments/:id/cancel            staff/customer
 *   POST   /api/appointments/:id/reschedule        admin/customer
 *   POST   /api/appointments/:id/check-in          admin
 *   POST   /api/appointments/:id/no-show           admin
 *   POST   /api/waitlist                           public  — request slot when busy
 *   GET    /api/waitlist                           admin
 *
 * Reminder cron: scanReminders() — call from api/cron-jobs.js every 15 min.
 *
 * DB tables (Postgres / Supabase):
 *
 *   create table if not exists pos_appointments (
 *     id            uuid primary key default gen_random_uuid(),
 *     tenant_id     uuid,
 *     service_id    uuid not null,
 *     staff_id      uuid,                  -- nullable = "any"
 *     customer_name text not null,
 *     customer_phone text,
 *     customer_email text,
 *     starts_at     timestamptz not null,
 *     ends_at       timestamptz not null,
 *     duration_min  int not null,
 *     price_snap    numeric(10,2),
 *     status        text not null default 'pending',
 *                   -- pending|confirmed|checked_in|completed|cancelled|no_show
 *     notes         text,
 *     reminder_sent_at timestamptz,
 *     created_at    timestamptz default now(),
 *     updated_at    timestamptz default now()
 *   );
 *   create index if not exists ix_appt_tenant_starts on pos_appointments(tenant_id, starts_at);
 *   create index if not exists ix_appt_staff_starts on pos_appointments(staff_id, starts_at);
 *   create index if not exists ix_appt_status on pos_appointments(status);
 *
 *   create table if not exists pos_waitlist (
 *     id            uuid primary key default gen_random_uuid(),
 *     tenant_id     uuid,
 *     service_id    uuid,
 *     staff_id      uuid,
 *     customer_name text not null,
 *     customer_phone text,
 *     customer_email text,
 *     desired_date  date,
 *     desired_time  text,
 *     status        text not null default 'waiting',  -- waiting|notified|booked|expired
 *     created_at    timestamptz default now(),
 *     notified_at   timestamptz
 *   );
 */
'use strict';

const url = require('url');

// ---------- helpers ----------
const MAX_BODY = 64 * 1024;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const VALID_STATUSES = new Set([
  'pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'
]);

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

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h * 60) + (m || 0);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function overlap(aS, aE, bS, bE) { return aS < bE && bS < aE; }

function tenantOf(req) {
  return (req && req.user && req.user.tenant_id) || null;
}

function isStaff(req) {
  const r = (req && req.user && req.user.role) || '';
  return ['admin', 'owner', 'superadmin', 'staff', 'manager'].includes(r);
}

// ---------- factory ----------
function build(ctx) {
  const { supabaseRequest, sendJSON, sendError, requireAuth } = ctx;
  const sendEmail = ctx.sendEmail || null;

  // ---------- POST /api/appointments ----------
  async function postAppointment(req, res) {
    try {
      const body = await readBody(req);
      const customer_name  = sanitizeStr(body.customer_name, 200);
      const customer_phone = sanitizeStr(body.customer_phone, 32);
      const customer_email = sanitizeStr(body.customer_email, 320);
      const service_id     = sanitizeStr(body.service_id, 64);
      const staff_id       = sanitizeStr(body.staff_id, 64);
      const starts_at      = sanitizeStr(body.starts_at, 64);
      const notes          = sanitizeStr(body.notes, 2000);
      const tenantId       = tenantOf(req) || sanitizeStr(body.tenant_id, 64);

      if (!customer_name) return sendJSON(res, { error: 'validation', reason: 'customer_name_required' }, 400);
      if (!service_id)    return sendJSON(res, { error: 'validation', reason: 'service_id_required' }, 400);
      if (!starts_at)     return sendJSON(res, { error: 'validation', reason: 'starts_at_required' }, 400);
      if (customer_email && !EMAIL_RE.test(customer_email)) {
        return sendJSON(res, { error: 'validation', reason: 'invalid_email' }, 400);
      }
      const startMs = Date.parse(starts_at);
      if (!Number.isFinite(startMs)) return sendJSON(res, { error: 'validation', reason: 'invalid_starts_at' }, 400);
      if (startMs < Date.now() - 60_000) return sendJSON(res, { error: 'validation', reason: 'starts_in_past' }, 400);

      // Get service for duration/price
      let service = null;
      try {
        const filt = `id=eq.${encodeURIComponent(service_id)}`
          + (tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '')
          + '&select=*&limit=1';
        const rows = await supabaseRequest('GET', `/pos_services?${filt}`);
        service = Array.isArray(rows) ? rows[0] : null;
      } catch (_) { service = null; }
      if (!service) return sendJSON(res, { error: 'not_found', reason: 'service' }, 404);

      const duration = parseInt(service.duration_minutes, 10) || 30;
      const endMs = startMs + duration * 60_000;
      const ends_at = new Date(endMs).toISOString();

      // Conflict check (only when staff_id is set)
      if (staff_id) {
        try {
          const dayStart = new Date(startMs - 12*3600_000).toISOString();
          const dayEnd   = new Date(endMs   + 12*3600_000).toISOString();
          const filt = `staff_id=eq.${encodeURIComponent(staff_id)}`
            + `&starts_at=gte.${encodeURIComponent(dayStart)}`
            + `&starts_at=lte.${encodeURIComponent(dayEnd)}`
            + `&select=id,starts_at,ends_at,status&limit=200`;
          const others = await supabaseRequest('GET', `/pos_appointments?${filt}`) || [];
          for (const o of others) {
            if (['cancelled', 'no_show'].includes(o.status)) continue;
            const oS = Date.parse(o.starts_at), oE = Date.parse(o.ends_at);
            if (overlap(startMs, endMs, oS, oE)) {
              return sendJSON(res, { error: 'slot_taken', conflict_id: o.id }, 409);
            }
          }
        } catch (_) { /* table may be absent: continue best-effort */ }
      }

      const row = {
        tenant_id: tenantId,
        service_id, staff_id: staff_id || null,
        customer_name, customer_phone, customer_email,
        starts_at: new Date(startMs).toISOString(),
        ends_at,
        duration_min: duration,
        price_snap: Number(service.price) || null,
        status: isStaff(req) ? 'confirmed' : 'pending',
        notes,
      };
      let inserted = null;
      try {
        const out = await supabaseRequest('POST', '/pos_appointments', row);
        inserted = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { error: 'upstream', reason: 'db_error' }, 502);
      }

      // Confirmation email (best-effort)
      if (sendEmail && inserted && customer_email) {
        sendEmail({
          to: customer_email,
          subject: `Tu reservacion - ${service.name || 'Cita'}`,
          text: [
            `Hola ${customer_name},`,
            ``,
            `Tu cita ha sido ${row.status === 'confirmed' ? 'confirmada' : 'recibida'}.`,
            `Servicio: ${service.name || ''}`,
            `Fecha:    ${row.starts_at}`,
            `Duracion: ${duration} min`,
            row.price_snap ? `Precio:   $${row.price_snap}` : '',
            ``,
            `ID: ${inserted.id || ''}`,
          ].filter(Boolean).join('\n'),
        }).catch(() => {});
      }

      return sendJSON(res, { ok: true, appointment: inserted }, 201);
    } catch (err) { sendError(res, err); }
  }

  // ---------- GET /api/appointments ----------
  async function listAppointments(req, res) {
    try {
      if (!isStaff(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const tenantId = tenantOf(req);
      const q = url.parse(req.url, true).query;
      const filters = [];
      if (tenantId) filters.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`);
      const status = String(q.status || '').toLowerCase();
      const nowIso = new Date().toISOString();
      if (status === 'upcoming') {
        filters.push(`starts_at=gte.${encodeURIComponent(nowIso)}`);
        filters.push(`status=in.(pending,confirmed,checked_in)`);
      } else if (status === 'past') {
        filters.push(`starts_at=lt.${encodeURIComponent(nowIso)}`);
      } else if (status && VALID_STATUSES.has(status)) {
        filters.push(`status=eq.${status}`);
      }
      if (q.staff_id) filters.push(`staff_id=eq.${encodeURIComponent(q.staff_id)}`);
      if (q.date) {
        const dStart = new Date(q.date + 'T00:00:00').toISOString();
        const dEnd   = new Date(q.date + 'T23:59:59').toISOString();
        filters.push(`starts_at=gte.${encodeURIComponent(dStart)}`);
        filters.push(`starts_at=lte.${encodeURIComponent(dEnd)}`);
      }
      let limit = parseInt(q.limit, 10); if (!limit || limit < 1) limit = 200; if (limit > 1000) limit = 1000;
      const qs = (filters.length ? filters.join('&') + '&' : '')
        + `select=*&order=starts_at.asc&limit=${limit}`;
      let items = [];
      try { items = await supabaseRequest('GET', `/pos_appointments?${qs}`) || []; }
      catch (_) { items = []; }
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  }

  // ---------- GET /api/appointments/availability ----------
  async function availability(req, res) {
    try {
      const q = url.parse(req.url, true).query;
      if (!q.date || !q.service_id) {
        return sendJSON(res, { error: 'validation', reason: 'date_and_service_id_required' }, 400);
      }
      const tenantId = tenantOf(req) || q.tenant_id || null;

      // Service
      let service = null;
      try {
        const filt = `id=eq.${encodeURIComponent(q.service_id)}&select=*&limit=1`;
        const rows = await supabaseRequest('GET', `/pos_services?${filt}`);
        service = Array.isArray(rows) ? rows[0] : null;
      } catch (_) {}
      if (!service) return sendJSON(res, { error: 'not_found', reason: 'service' }, 404);
      const dur = parseInt(service.duration_minutes, 10) || 30;
      const date = String(q.date).slice(0, 10);

      // Determine staff(s)
      let staffIds = [];
      if (q.staff_id && q.staff_id !== 'any') staffIds = [q.staff_id];
      else {
        try {
          const sf = (tenantId ? `tenant_id=eq.${encodeURIComponent(tenantId)}&` : '')
            + 'active=is.true&select=id,services_offered,schedule&limit=200';
          const rows = await supabaseRequest('GET', `/pos_staff?${sf}`) || [];
          staffIds = rows.filter(s => {
            const so = s.services_offered;
            if (!so) return true;
            if (Array.isArray(so)) return so.length === 0 || so.includes(q.service_id);
            return true;
          }).map(s => s.id);
        } catch (_) { staffIds = []; }
      }
      if (!staffIds.length) {
        return sendJSON(res, { ok: true, date, slots: [] });
      }

      // Existing appointments for that date for those staff
      const dStart = new Date(date + 'T00:00:00').toISOString();
      const dEnd   = new Date(date + 'T23:59:59').toISOString();
      let booked = [];
      try {
        const inList = staffIds.map(id => `"${id}"`).join(',');
        const filt = `staff_id=in.(${inList})`
          + `&starts_at=gte.${encodeURIComponent(dStart)}`
          + `&starts_at=lte.${encodeURIComponent(dEnd)}`
          + `&select=staff_id,starts_at,ends_at,status&limit=500`;
        booked = await supabaseRequest('GET', `/pos_appointments?${filt}`) || [];
      } catch (_) { booked = []; }
      booked = booked.filter(a => !['cancelled', 'no_show'].includes(a.status));

      // Default window 09:00-18:00 step 15 — could be replaced by real schedule
      const dow = new Date(date + 'T12:00:00').getDay();
      const slots = [];
      const windowStart = 9 * 60, windowEnd = 18 * 60, step = 15;
      for (let cur = windowStart; cur + dur <= windowEnd; cur += step) {
        const hh = pad2(Math.floor(cur / 60)), mm = pad2(cur % 60);
        const sIso = new Date(`${date}T${hh}:${mm}:00`).getTime();
        const eIso = sIso + dur * 60000;
        const availStaff = staffIds.filter(sid => {
          return !booked.some(b =>
            b.staff_id === sid &&
            overlap(sIso, eIso, Date.parse(b.starts_at), Date.parse(b.ends_at))
          );
        });
        if (availStaff.length) {
          slots.push({
            start: `${hh}:${mm}`,
            starts_at: new Date(sIso).toISOString(),
            ends_at: new Date(eIso).toISOString(),
            available: true,
            staff_options: availStaff,
          });
        }
      }
      sendJSON(res, { ok: true, date, day_of_week: dow, duration_minutes: dur, service_id: q.service_id, slots });
    } catch (err) { sendError(res, err); }
  }

  // ---------- helpers for status updates ----------
  async function loadAppt(id, tenantId) {
    const filt = `id=eq.${encodeURIComponent(id)}`
      + (tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '')
      + '&select=*&limit=1';
    const rows = await supabaseRequest('GET', `/pos_appointments?${filt}`);
    return Array.isArray(rows) ? rows[0] : null;
  }

  async function patchAppt(id, patch) {
    const out = await supabaseRequest('PATCH',
      `/pos_appointments?id=eq.${encodeURIComponent(id)}`,
      { ...patch, updated_at: new Date().toISOString() });
    return Array.isArray(out) ? out[0] : out;
  }

  function setStatusHandler(target) {
    return async function (req, res, params) {
      try {
        if (!isStaff(req)) return sendJSON(res, { error: 'forbidden' }, 403);
        const id = params && params.id;
        if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
        const tenantId = tenantOf(req);
        const appt = await loadAppt(id, tenantId).catch(() => null);
        if (!appt) return sendJSON(res, { error: 'not_found' }, 404);
        const updated = await patchAppt(id, { status: target });
        sendJSON(res, { ok: true, appointment: updated || { ...appt, status: target } });
      } catch (err) { sendError(res, err); }
    };
  }

  // POST /api/appointments/:id/cancel — also allows customer self-cancel by id
  async function cancelAppt(req, res, params) {
    try {
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      const tenantId = tenantOf(req);
      const appt = await loadAppt(id, tenantId).catch(() => null);
      if (!appt) return sendJSON(res, { error: 'not_found' }, 404);
      const updated = await patchAppt(id, { status: 'cancelled' });

      // Notify waitlist (best-effort)
      notifyWaitlist({ supabaseRequest, sendEmail }, appt).catch(() => {});

      sendJSON(res, { ok: true, appointment: updated });
    } catch (err) { sendError(res, err); }
  }

  // POST /api/appointments/:id/reschedule
  async function rescheduleAppt(req, res, params) {
    try {
      const id = params && params.id;
      if (!id) return sendJSON(res, { error: 'bad_request', reason: 'missing_id' }, 400);
      const body = await readBody(req);
      const newStart = sanitizeStr(body.starts_at, 64);
      if (!newStart) return sendJSON(res, { error: 'validation', reason: 'starts_at_required' }, 400);
      const startMs = Date.parse(newStart);
      if (!Number.isFinite(startMs)) return sendJSON(res, { error: 'validation', reason: 'invalid_starts_at' }, 400);
      const tenantId = tenantOf(req);
      const appt = await loadAppt(id, tenantId).catch(() => null);
      if (!appt) return sendJSON(res, { error: 'not_found' }, 404);
      const dur = parseInt(appt.duration_min, 10) || 30;
      const endMs = startMs + dur * 60_000;

      // Conflict check
      if (appt.staff_id) {
        try {
          const dStart = new Date(startMs - 12*3600_000).toISOString();
          const dEnd   = new Date(endMs   + 12*3600_000).toISOString();
          const filt = `staff_id=eq.${encodeURIComponent(appt.staff_id)}`
            + `&starts_at=gte.${encodeURIComponent(dStart)}`
            + `&starts_at=lte.${encodeURIComponent(dEnd)}`
            + `&id=neq.${encodeURIComponent(id)}`
            + `&select=id,starts_at,ends_at,status&limit=200`;
          const others = await supabaseRequest('GET', `/pos_appointments?${filt}`) || [];
          for (const o of others) {
            if (['cancelled', 'no_show'].includes(o.status)) continue;
            if (overlap(startMs, endMs, Date.parse(o.starts_at), Date.parse(o.ends_at))) {
              return sendJSON(res, { error: 'slot_taken', conflict_id: o.id }, 409);
            }
          }
        } catch (_) {}
      }
      const updated = await patchAppt(id, {
        starts_at: new Date(startMs).toISOString(),
        ends_at: new Date(endMs).toISOString(),
        reminder_sent_at: null,
      });
      sendJSON(res, { ok: true, appointment: updated });
    } catch (err) { sendError(res, err); }
  }

  // ---------- waitlist ----------
  async function postWaitlist(req, res) {
    try {
      const body = await readBody(req);
      const row = {
        tenant_id: tenantOf(req) || sanitizeStr(body.tenant_id, 64),
        service_id: sanitizeStr(body.service_id, 64),
        staff_id:   sanitizeStr(body.staff_id, 64),
        customer_name:  sanitizeStr(body.customer_name, 200),
        customer_phone: sanitizeStr(body.customer_phone, 32),
        customer_email: sanitizeStr(body.customer_email, 320),
        desired_date:   sanitizeStr(body.desired_date, 16),
        desired_time:   sanitizeStr(body.desired_time, 16),
        status: 'waiting',
      };
      if (!row.customer_name) return sendJSON(res, { error: 'validation', reason: 'customer_name_required' }, 400);
      if (!row.service_id)    return sendJSON(res, { error: 'validation', reason: 'service_id_required' }, 400);
      if (row.customer_email && !EMAIL_RE.test(row.customer_email)) {
        return sendJSON(res, { error: 'validation', reason: 'invalid_email' }, 400);
      }
      let inserted = null;
      try {
        const out = await supabaseRequest('POST', '/pos_waitlist', row);
        inserted = Array.isArray(out) ? out[0] : out;
      } catch (e) {
        return sendJSON(res, { ok: true, queued: true, note: 'waitlist deferred' });
      }
      sendJSON(res, { ok: true, waitlist: inserted }, 201);
    } catch (err) { sendError(res, err); }
  }

  async function listWaitlist(req, res) {
    try {
      if (!isStaff(req)) return sendJSON(res, { error: 'forbidden' }, 403);
      const tenantId = tenantOf(req);
      const filters = [];
      if (tenantId) filters.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`);
      filters.push(`status=eq.waiting`);
      const qs = filters.join('&') + '&select=*&order=created_at.asc&limit=500';
      let items = [];
      try { items = await supabaseRequest('GET', `/pos_waitlist?${qs}`) || []; }
      catch (_) { items = []; }
      sendJSON(res, { ok: true, items, total: items.length });
    } catch (err) { sendError(res, err); }
  }

  return {
    'POST /api/appointments':                    postAppointment,
    'GET /api/appointments':                     requireAuth(listAppointments),
    'GET /api/appointments/availability':        availability,
    'POST /api/appointments/:id/confirm':        requireAuth(setStatusHandler('confirmed')),
    'POST /api/appointments/:id/cancel':         cancelAppt,
    'POST /api/appointments/:id/reschedule':     rescheduleAppt,
    'POST /api/appointments/:id/check-in':       requireAuth(setStatusHandler('checked_in')),
    'POST /api/appointments/:id/no-show':        requireAuth(setStatusHandler('no_show')),
    'POST /api/waitlist':                        postWaitlist,
    'GET /api/waitlist':                         requireAuth(listWaitlist),
  };
}

// ---------- waitlist notification ----------
async function notifyWaitlist(ctx, freedAppt) {
  const { supabaseRequest, sendEmail } = ctx || {};
  if (!supabaseRequest || !freedAppt) return;
  try {
    const filt = `service_id=eq.${encodeURIComponent(freedAppt.service_id)}`
      + `&status=eq.waiting&select=*&order=created_at.asc&limit=1`;
    const rows = await supabaseRequest('GET', `/pos_waitlist?${filt}`) || [];
    const target = rows[0];
    if (!target) return;
    await supabaseRequest('PATCH',
      `/pos_waitlist?id=eq.${encodeURIComponent(target.id)}`,
      { status: 'notified', notified_at: new Date().toISOString() });
    if (sendEmail && target.customer_email) {
      sendEmail({
        to: target.customer_email,
        subject: 'Hay un horario disponible',
        text: `Hola ${target.customer_name},\n\nSe libero un horario que te puede interesar:\n${freedAppt.starts_at}\n\nReserva pronto antes de que lo tomen.`,
      }).catch(() => {});
    }
  } catch (_) { /* swallow */ }
}

// ---------- reminder cron ----------
async function scanReminders(ctx) {
  const { supabaseRequest, sendEmail } = ctx || {};
  if (!supabaseRequest) return { ok: false, reason: 'no_supabase' };
  const now = Date.now();
  const in23h = new Date(now + 23 * 3600_000).toISOString();
  const in25h = new Date(now + 25 * 3600_000).toISOString();
  let candidates = [];
  try {
    const filt = `starts_at=gte.${encodeURIComponent(in23h)}`
      + `&starts_at=lte.${encodeURIComponent(in25h)}`
      + `&status=in.(pending,confirmed)`
      + `&reminder_sent_at=is.null`
      + `&select=id,customer_name,customer_email,starts_at&limit=500`;
    candidates = await supabaseRequest('GET', `/pos_appointments?${filt}`) || [];
  } catch (_) { return { ok: false, reason: 'query_failed' }; }
  let sent = 0;
  for (const a of candidates) {
    if (sendEmail && a.customer_email) {
      try {
        await sendEmail({
          to: a.customer_email,
          subject: 'Recordatorio de cita - Volvix',
          text: `Hola ${a.customer_name || ''},\n\nTe recordamos tu cita programada para ${a.starts_at}.\n\nTe esperamos.`,
        });
        sent++;
      } catch (_) { /* ignore individual send errors */ }
    }
    try {
      await supabaseRequest('PATCH',
        `/pos_appointments?id=eq.${encodeURIComponent(a.id)}`,
        { reminder_sent_at: new Date().toISOString() });
    } catch (_) {}
  }
  return { ok: true, candidates: candidates.length, sent };
}

module.exports = { build, scanReminders, notifyWaitlist };
