// api/gdpr.js
// LFPDPPP / GDPR — derechos ARCO + portabilidad + supresión.
//
// Endpoints expuestos via register(handlers, deps):
//   POST /api/gdpr/request                 — alta de solicitud + envio OTP
//   POST /api/gdpr/verify                  — verificacion del OTP
//   GET  /api/gdpr/request/:ticket_id/data — export ACCESS / PORTABILITY
//   POST /api/gdpr/request/:ticket_id/erase — supresion (anonimiza, no borra)
//
// Tabla destino: gdpr_requests (ver schema en bloque SQL al pie).

'use strict';

const crypto = require('crypto');

const TABLE = 'gdpr_requests';
const OTP_TTL_MS = 60 * 60 * 1000; // 60 min

const LEGAL_BASIS = {
  access:      'Art.15 GDPR / Art.23 LFPDPPP — Derecho de Acceso (ARCO-A)',
  portability: 'Art.20 GDPR — Portabilidad de datos',
  erasure:     'Art.17 GDPR / Art.25 LFPDPPP — Derecho al Olvido / Cancelacion (ARCO-C)',
};

function genTicket() {
  return 'GDPR-' + Date.now().toString(36).toUpperCase() +
         '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function genOtp() {
  // 6 digitos numericos
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Anonimiza un email de forma deterministica para logs sin filtrar PII
function anonEmail(email) {
  const h = crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 12);
  return 'anon-' + h + '@deleted.local';
}

function readBodySafe(req, helpers) {
  if (typeof helpers.readBody === 'function') return helpers.readBody(req);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(res, payload, status, helpers) {
  if (helpers && typeof helpers.sendJSON === 'function') return helpers.sendJSON(res, payload, status || 200);
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

// Llama a Supabase via REST si supabaseRequest existe; si no, usa store en-memoria
function makeStore(supabaseRequest) {
  if (typeof supabaseRequest === 'function') {
    return {
      async insert(row) {
        const r = await supabaseRequest('POST', `/${TABLE}`, row, { Prefer: 'return=representation' });
        return Array.isArray(r) ? r[0] : r;
      },
      async findByTicket(ticket) {
        const r = await supabaseRequest('GET', `/${TABLE}?ticket_id=eq.${encodeURIComponent(ticket)}&select=*&limit=1`);
        return Array.isArray(r) && r.length ? r[0] : null;
      },
      async patchByTicket(ticket, patch) {
        return supabaseRequest('PATCH', `/${TABLE}?ticket_id=eq.${encodeURIComponent(ticket)}`, patch);
      },
    };
  }
  // Fallback en-memoria (tests / local)
  const mem = new Map();
  return {
    async insert(row) {
      const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      const created = Object.assign({ id, created_at: new Date().toISOString() }, row);
      mem.set(created.ticket_id, created);
      return created;
    },
    async findByTicket(ticket) { return mem.get(ticket) || null; },
    async patchByTicket(ticket, patch) {
      const cur = mem.get(ticket); if (!cur) return null;
      Object.assign(cur, patch); mem.set(ticket, cur);
      return cur;
    },
  };
}

// Recolecta toda la PII del usuario para ACCESS / PORTABILITY
async function exportUserData(email, supabaseRequest) {
  const out = { exported_at: new Date().toISOString(), email, sections: {} };
  if (typeof supabaseRequest !== 'function') {
    out.sections.note = 'supabaseRequest no disponible — export vacio (modo dev/test)';
    return out;
  }
  const safe = async (label, path) => {
    try { out.sections[label] = await supabaseRequest('GET', path); }
    catch (e) { out.sections[label] = { error: String(e && e.message || e) }; }
  };
  const e = encodeURIComponent(email);
  await safe('customer',     `/pos_customers?email=eq.${e}&select=*`);
  await safe('sales',        `/pos_sales?customer_email=eq.${e}&select=id,total,created_at,items&order=created_at.desc&limit=500`);
  await safe('loyalty',      `/loyalty_members?email=eq.${e}&select=*`);
  await safe('credit',       `/customer_credit?email=eq.${e}&select=*`);
  await safe('quotes',       `/quotes?email=eq.${e}&select=id,total,status,created_at`);
  await safe('subscriptions', `/subscriptions?email=eq.${e}&select=*`);
  return out;
}

// Anonimiza PII en todas las tablas que referencian al email
async function eraseUserData(email, supabaseRequest) {
  const log = [];
  if (typeof supabaseRequest !== 'function') {
    return { anonymized: false, note: 'supabaseRequest no disponible (dev/test)', log };
  }
  const anon = anonEmail(email);
  const e = encodeURIComponent(email);
  const targets = [
    { table: 'pos_customers',    qs: `?email=eq.${e}`, patch: { email: anon, name: 'ANON', phone: null, address: null } },
    { table: 'pos_sales',        qs: `?customer_email=eq.${e}`, patch: { customer_email: anon, customer_name: 'ANON' } },
    { table: 'loyalty_members',  qs: `?email=eq.${e}`, patch: { email: anon, full_name: 'ANON', phone: null } },
    { table: 'customer_credit',  qs: `?email=eq.${e}`, patch: { email: anon } },
    { table: 'quotes',           qs: `?email=eq.${e}`, patch: { email: anon, customer_name: 'ANON' } },
  ];
  for (const t of targets) {
    try {
      await supabaseRequest('PATCH', `/${t.table}${t.qs}`, t.patch);
      log.push({ table: t.table, ok: true });
    } catch (err) {
      log.push({ table: t.table, ok: false, error: String(err && err.message || err) });
    }
  }
  return { anonymized: true, anonymized_email: anon, log };
}

// Adaptador de envio de OTP. Si email-resend o sendEmail existen los usa,
// si no devuelve el otp en el response (modo dev) — el client lo pre-rellena.
async function sendOtpEmail(email, otp, ticket, deps) {
  const sender = deps.sendEmail || deps.sendMail || null;
  const subject = 'Volvix — Codigo de verificacion GDPR';
  const html =
    `<p>Recibimos tu solicitud GDPR <b>${ticket}</b>.</p>` +
    `<p>Tu codigo de verificacion es: <b style="font-size:22px">${otp}</b></p>` +
    `<p>Vence en 60 minutos. Si no fuiste tu, ignora este correo.</p>`;
  if (typeof sender === 'function') {
    try { await sender({ to: email, subject, html }); return { delivered: true }; }
    catch (err) { return { delivered: false, error: String(err && err.message || err) }; }
  }
  return { delivered: false, dev_only: true };
}

// =================  HANDLERS  =================

function buildHandlers(deps) {
  const helpers = {
    sendJSON: deps.sendJSON,
    sendError: deps.sendError,
    readBody: deps.readBody,
  };
  const store = makeStore(deps.supabaseRequest);

  // POST /api/gdpr/request
  async function postRequest(req, res) {
    try {
      const body = await readBodySafe(req, helpers);
      const type = String(body && body.type || '').toLowerCase();
      const email = String(body && body.email || '').trim().toLowerCase();
      const identification = body && body.identification || null;
      if (!['access', 'portability', 'erasure'].includes(type)) {
        return send(res, { ok: false, error: 'invalid_type', allowed: ['access','portability','erasure'] }, 400, helpers);
      }
      if (!isEmail(email)) return send(res, { ok: false, error: 'invalid_email' }, 400, helpers);

      const ticket = genTicket();
      const otp = genOtp();
      const row = {
        ticket_id: ticket,
        type,
        email,
        identification,
        status: 'pending_otp',
        legal_basis: LEGAL_BASIS[type],
        // El hash y expiracion del OTP se persisten dentro de identification.otp
        // si la columna existe; si no, en una columna ad-hoc.
      };
      const otpMeta = { otp_hash: hashOtp(otp), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString() };
      row.identification = Object.assign({}, row.identification || {}, { _otp: otpMeta });

      const created = await store.insert(row);
      const delivery = await sendOtpEmail(email, otp, ticket, deps);
      const payload = {
        ok: true,
        ticket_id: ticket,
        type,
        legal_basis: LEGAL_BASIS[type],
        otp_delivered: !!delivery.delivered,
      };
      // 2026-05 audit B-44: SOLO en dev/staging exponemos otp_dev en respuesta.
      // En prod, si SMTP falla, NO devolvemos el OTP (era bypass total).
      const _isProd = process.env.NODE_ENV === 'production';
      if (!delivery.delivered && !_isProd) payload.otp_dev = otp;
      if (!delivery.delivered && _isProd) {
        payload.email_failed = true;
        payload.message = 'No pudimos enviar el código por correo. Intenta de nuevo o contacta soporte.';
      }
      payload.created_id = created && created.id || null;
      return send(res, payload, 202, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  }

  // POST /api/gdpr/verify
  async function postVerify(req, res) {
    try {
      const body = await readBodySafe(req, helpers);
      const ticket = String(body && body.ticket_id || '').trim();
      const otp = String(body && body.otp || '').trim();
      if (!ticket || !otp) return send(res, { ok: false, error: 'ticket_id_and_otp_required' }, 400, helpers);
      const r = await store.findByTicket(ticket);
      if (!r) return send(res, { ok: false, error: 'not_found' }, 404, helpers);
      const meta = r.identification && r.identification._otp;
      if (!meta || !meta.otp_hash) return send(res, { ok: false, error: 'no_otp_on_record' }, 400, helpers);
      if (new Date(meta.otp_expires_at).getTime() < Date.now()) {
        return send(res, { ok: false, error: 'otp_expired' }, 400, helpers);
      }
      if (hashOtp(otp) !== meta.otp_hash) return send(res, { ok: false, error: 'otp_mismatch' }, 400, helpers);
      await store.patchByTicket(ticket, { status: 'verified', verified_at: new Date().toISOString() });
      return send(res, { ok: true, ticket_id: ticket, status: 'verified' }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  }

  // GET /api/gdpr/request/:ticket_id/data
  async function getData(req, res, params) {
    try {
      const ticket = params && params.ticket_id;
      if (!ticket) return send(res, { ok: false, error: 'ticket_id_required' }, 400, helpers);
      const r = await store.findByTicket(ticket);
      if (!r) return send(res, { ok: false, error: 'not_found' }, 404, helpers);
      if (r.status !== 'verified' && r.status !== 'completed') {
        return send(res, { ok: false, error: 'not_verified', status: r.status }, 403, helpers);
      }
      if (!['access', 'portability'].includes(r.type)) {
        return send(res, { ok: false, error: 'wrong_type_for_export', type: r.type }, 400, helpers);
      }
      const data = await exportUserData(r.email, deps.supabaseRequest);
      await store.patchByTicket(ticket, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        data_export: data,
      });
      return send(res, {
        ok: true,
        ticket_id: ticket,
        type: r.type,
        legal_basis: r.legal_basis || LEGAL_BASIS[r.type],
        data,
      }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  }

  // POST /api/gdpr/request/:ticket_id/erase
  async function postErase(req, res, params) {
    try {
      const ticket = params && params.ticket_id;
      if (!ticket) return send(res, { ok: false, error: 'ticket_id_required' }, 400, helpers);
      const r = await store.findByTicket(ticket);
      if (!r) return send(res, { ok: false, error: 'not_found' }, 404, helpers);
      if (r.status !== 'verified') {
        return send(res, { ok: false, error: 'not_verified', status: r.status }, 403, helpers);
      }
      if (r.type !== 'erasure') {
        return send(res, { ok: false, error: 'wrong_type_for_erasure', type: r.type }, 400, helpers);
      }
      const result = await eraseUserData(r.email, deps.supabaseRequest);
      await store.patchByTicket(ticket, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        data_export: { erasure_log: result },
      });
      return send(res, {
        ok: true,
        ticket_id: ticket,
        type: 'erasure',
        legal_basis: LEGAL_BASIS.erasure,
        result,
      }, 200, helpers);
    } catch (err) {
      if (helpers.sendError) return helpers.sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  }

  return {
    'POST /api/gdpr/request':                  postRequest,
    'POST /api/gdpr/verify':                   postVerify,
    'GET /api/gdpr/request/:ticket_id/data':   getData,
    'POST /api/gdpr/request/:ticket_id/erase': postErase,
  };
}

function register(handlers, deps) {
  const own = buildHandlers(deps || {});
  for (const k of Object.keys(own)) handlers[k] = own[k];
  return Object.keys(own);
}

module.exports = { register, buildHandlers, LEGAL_BASIS, _internal: { hashOtp, anonEmail, exportUserData, eraseUserData } };

/* SQL schema (Supabase / Postgres):

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id text UNIQUE,
  type text NOT NULL,
  email text NOT NULL,
  identification jsonb,
  status text DEFAULT 'pending_otp',
  verified_at timestamptz,
  completed_at timestamptz,
  data_export jsonb,
  legal_basis text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_email ON gdpr_requests(email);
CREATE INDEX IF NOT EXISTS idx_gdpr_status ON gdpr_requests(status);
*/
