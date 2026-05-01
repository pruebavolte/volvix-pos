// api/email-drips.js
// Email Drip Campaigns — series automatizadas tipo welcome / abandoned-cart / re-engagement.
//
// Endpoints expuestos via register({ handlers, ... }):
//   POST /api/drips/enroll        body { user_id, email, drip_name, context? }
//   POST /api/drips/unenroll      body { user_id, drip_name }
//   GET  /api/drips/subscriptions (admin) lista enrollments
//   GET  /api/drips/series        (admin) lista series y pasos
//   POST /api/cron/drips-tick     (cron-driven) cada hora — envía siguiente paso si toca
//
// Tablas SQL esperadas:
//
// CREATE TABLE drip_subscriptions (
//   id BIGSERIAL PRIMARY KEY,
//   user_id TEXT,
//   email TEXT NOT NULL,
//   drip_name TEXT NOT NULL,            -- welcome | abandoned-cart | re-engagement
//   current_step INT DEFAULT 0,
//   status TEXT DEFAULT 'active',       -- active | completed | unsubscribed | failed
//   context JSONB DEFAULT '{}'::jsonb,  -- {name, cart_value, last_login, etc.}
//   enrolled_at TIMESTAMPTZ DEFAULT NOW(),
//   next_send_at TIMESTAMPTZ,
//   last_sent_at TIMESTAMPTZ,
//   completed_at TIMESTAMPTZ,
//   UNIQUE (email, drip_name)
// );
// CREATE INDEX idx_drips_status_next ON drip_subscriptions(status, next_send_at);
// CREATE INDEX idx_drips_email ON drip_subscriptions(email);
//
// CREATE TABLE drip_events (
//   id BIGSERIAL PRIMARY KEY,
//   subscription_id BIGINT REFERENCES drip_subscriptions(id) ON DELETE CASCADE,
//   step INT,
//   event_type TEXT,                    -- sent | failed | skipped
//   data JSONB,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

'use strict';

// ============= DRIP SERIES DEFINITIONS =============
// delay_hours = horas desde enrollment para ESTE step (acumulativo absoluto desde enroll)
const DRIP_SERIES = {
  'welcome': {
    description: 'Bienvenida 5 emails en 14 días',
    steps: [
      {
        delay_hours: 0,
        subject: 'Bienvenido a Volvix POS',
        html: '<h2>Hola {{name}},</h2><p>Bienvenido a Volvix POS. En los próximos días te compartiremos los tips para sacar máximo provecho a tu sistema.</p><p><a href="{{base_url}}/mis-modulos.html">Ir a mi panel</a></p>',
      },
      {
        delay_hours: 48,
        subject: '5 cosas que puedes hacer hoy en Volvix',
        html: '<h2>{{name}}, 5 quick wins</h2><ol><li>Importa tu inventario</li><li>Configura impresoras</li><li>Crea tu primer corte de caja</li><li>Habilita pagos</li><li>Invita a tu equipo</li></ol>',
      },
      {
        delay_hours: 144,
        subject: 'Domina el POS en 10 minutos',
        html: '<h2>Tutorial rápido</h2><p>Ve nuestro video walkthrough y aprende los atajos que usan los pros.</p><p><a href="{{base_url}}/INDICE-TUTORIALES.html">Ver tutoriales</a></p>',
      },
      {
        delay_hours: 240,
        subject: 'Tu negocio merece reportes inteligentes',
        html: '<h2>Reportes que sí mueven el negocio</h2><p>Conoce los reportes BI integrados, forecasting y dashboards en tiempo real.</p>',
      },
      {
        delay_hours: 336,
        subject: '¿Cómo te va con Volvix? Queremos saber',
        html: '<h2>{{name}}, hablemos</h2><p>Después de 14 días, ¿qué te ha parecido? Tu feedback nos ayuda a mejorar.</p><p><a href="{{base_url}}/feedback">Cuéntanos</a></p>',
      },
    ],
  },
  'abandoned-cart': {
    description: 'Carrito abandonado 2 emails',
    steps: [
      {
        delay_hours: 1,
        subject: 'Olvidaste algo en tu carrito',
        html: '<h2>{{name}}, dejaste {{cart_value}} pendiente</h2><p>Tu carrito sigue ahí. Completa tu compra antes de que se agoten los productos.</p><p><a href="{{base_url}}/cart">Volver al carrito</a></p>',
      },
      {
        delay_hours: 24,
        subject: '10% de descuento si terminas tu compra hoy',
        html: '<h2>Última oportunidad</h2><p>Usa el código <strong>CART10</strong> para 10% off en tu carrito pendiente. Válido 24h.</p><p><a href="{{base_url}}/cart">Aplicar descuento</a></p>',
      },
    ],
  },
  're-engagement': {
    description: 'Reactivación inactivos 3 emails',
    steps: [
      {
        delay_hours: 0,
        subject: 'Te extrañamos en Volvix',
        html: '<h2>{{name}}, ya no te vemos</h2><p>Hace tiempo que no entras. ¿Todo bien? Aquí están las novedades que te perdiste.</p>',
      },
      {
        delay_hours: 168,
        subject: 'Mira lo nuevo: 20+ módulos agregados',
        html: '<h2>Volvix evolucionó</h2><p>Multipos, KDS, marketplace, AI assistant y más. Todo listo para tu negocio.</p><p><a href="{{base_url}}/mis-modulos.html">Explora</a></p>',
      },
      {
        delay_hours: 336,
        subject: '¿Cancelamos tu cuenta?',
        html: '<h2>{{name}}, decisión tuya</h2><p>Si ya no usarás Volvix, no hay problema. Pero si quieres seguir, regresa hoy y te damos un mes gratis.</p><p><a href="{{base_url}}/login.html">Volver</a></p>',
      },
    ],
  },
};

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

function isCronAuthorized(req) {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const hdr = req.headers && (req.headers['authorization'] || req.headers['Authorization']);
  if (!hdr || typeof hdr !== 'string') return false;
  const parts = hdr.split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return false;
  return parts[1] === expected;
}

function nextSendAt(enrolledAt, stepIdx, series) {
  const step = series.steps[stepIdx];
  if (!step) return null;
  const t = new Date(enrolledAt).getTime() + (step.delay_hours * 3600 * 1000);
  return new Date(t).toISOString();
}

function renderTemplate(html, ctx) {
  return String(html).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (ctx && ctx[k] != null) return String(ctx[k]);
    return '';
  });
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
  } = deps || {};

  if (!handlers) throw new Error('email-drips: handlers required');

  const helpers = { sendJSON, sendError, readBody };
  const auth = requireAuth || ((fn) => fn);
  const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://volvix-pos.vercel.app').replace(/\/$/, '');

  // POST /api/drips/enroll
  handlers['POST /api/drips/enroll'] = async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const user_id = body && body.user_id ? String(body.user_id).slice(0, 64) : null;
      const email = String((body && body.email) || '').trim().toLowerCase();
      const drip_name = String((body && body.drip_name) || '').trim();
      const context = (body && body.context && typeof body.context === 'object') ? body.context : {};
      if (!isValidEmail(email)) return send(res, { ok: false, error: 'invalid_email' }, 400, helpers);
      const series = DRIP_SERIES[drip_name];
      if (!series) return send(res, { ok: false, error: 'unknown_drip' }, 400, helpers);
      const now = new Date().toISOString();
      const row = {
        user_id, email, drip_name,
        current_step: 0,
        status: 'active',
        context,
        enrolled_at: now,
        next_send_at: nextSendAt(now, 0, series),
      };
      let saved = null;
      if (typeof supabaseRequest === 'function') {
        try {
          const r = await supabaseRequest(
            'POST',
            '/drip_subscriptions?on_conflict=email,drip_name',
            row,
            { headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }
          );
          saved = Array.isArray(r) ? r[0] : r;
        } catch (e) {
          return send(res, { ok: false, error: 'enroll_failed', detail: String(e && e.message || e) }, 500, helpers);
        }
      }
      return send(res, { ok: true, subscription: saved }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // POST /api/drips/unenroll
  handlers['POST /api/drips/unenroll'] = async (req, res) => {
    try {
      const body = await readBodySafe(req, helpers);
      const email = String((body && body.email) || '').trim().toLowerCase();
      const drip_name = String((body && body.drip_name) || '').trim();
      if (!isValidEmail(email)) return send(res, { ok: false, error: 'invalid_email' }, 400, helpers);
      if (typeof supabaseRequest === 'function') {
        try {
          let qs = '/drip_subscriptions?email=eq.' + encodeURIComponent(email);
          if (drip_name) qs += '&drip_name=eq.' + encodeURIComponent(drip_name);
          await supabaseRequest('PATCH', qs, {
            status: 'unsubscribed',
            completed_at: new Date().toISOString(),
          });
        } catch (_) {}
      }
      return send(res, { ok: true }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  // GET /api/drips/subscriptions
  handlers['GET /api/drips/subscriptions'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const u = new URL(req.url, 'http://localhost');
      const drip = u.searchParams.get('drip_name');
      const status = u.searchParams.get('status') || 'active';
      const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '200', 10) || 200, 1), 1000);
      let rows = [];
      if (typeof supabaseRequest === 'function') {
        try {
          let qs = '/drip_subscriptions?select=*&status=eq.' + encodeURIComponent(status) +
            '&order=enrolled_at.desc&limit=' + limit;
          if (drip) qs += '&drip_name=eq.' + encodeURIComponent(drip);
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

  // GET /api/drips/series
  handlers['GET /api/drips/series'] = auth(async (req, res) => {
    try {
      if (!isAdminUser(req.user)) return send(res, { ok: false, error: 'admin_only' }, 403, helpers);
      const out = {};
      for (const name of Object.keys(DRIP_SERIES)) {
        const s = DRIP_SERIES[name];
        out[name] = {
          description: s.description,
          step_count: s.steps.length,
          steps: s.steps.map((st, i) => ({
            index: i,
            delay_hours: st.delay_hours,
            subject: st.subject,
          })),
        };
      }
      return send(res, { ok: true, series: out }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  });

  // POST /api/cron/drips-tick — cron cada hora
  handlers['POST /api/cron/drips-tick'] = async (req, res) => {
    try {
      if (!isCronAuthorized(req)) return send(res, { ok: false, error: 'unauthorized' }, 401, helpers);
      const now = new Date().toISOString();
      let due = [];
      if (typeof supabaseRequest === 'function') {
        try {
          due = await supabaseRequest(
            'GET',
            '/drip_subscriptions?status=eq.active&next_send_at=lte.' + encodeURIComponent(now) +
            '&select=*&limit=500'
          );
        } catch (e) {
          return send(res, { ok: false, error: 'fetch_failed', detail: String(e && e.message || e) }, 500, helpers);
        }
      }
      let processed = 0, sent = 0, failed = 0, completed = 0;
      for (const sub of (Array.isArray(due) ? due : [])) {
        processed++;
        const series = DRIP_SERIES[sub.drip_name];
        if (!series) continue;
        const stepIdx = sub.current_step | 0;
        const step = series.steps[stepIdx];
        if (!step) {
          // ya pasó el último, marcar completed
          if (typeof supabaseRequest === 'function') {
            try {
              await supabaseRequest('PATCH', '/drip_subscriptions?id=eq.' + sub.id, {
                status: 'completed', completed_at: new Date().toISOString(), next_send_at: null,
              });
            } catch (_) {}
          }
          completed++;
          continue;
        }
        const ctx = Object.assign({}, sub.context || {}, {
          email: sub.email,
          base_url: baseUrl,
          name: (sub.context && sub.context.name) || '',
        });
        const html = renderTemplate(step.html, ctx);
        let okSend = false;
        if (typeof sendEmail === 'function') {
          try {
            const r = await sendEmail({
              to: sub.email,
              subject: renderTemplate(step.subject, ctx),
              html,
              template: 'drip_' + sub.drip_name + '_' + stepIdx,
            });
            okSend = !(r && r.ok === false);
          } catch (_) { okSend = false; }
        }
        const eventType = okSend ? 'sent' : 'failed';
        if (typeof supabaseRequest === 'function') {
          try {
            await supabaseRequest('POST', '/drip_events', {
              subscription_id: sub.id,
              step: stepIdx,
              event_type: eventType,
              data: null,
              created_at: new Date().toISOString(),
            });
          } catch (_) {}
        }
        if (okSend) sent++; else failed++;
        const nextStep = stepIdx + 1;
        const isLast = nextStep >= series.steps.length;
        const update = {
          current_step: nextStep,
          last_sent_at: new Date().toISOString(),
        };
        if (isLast) {
          update.status = 'completed';
          update.completed_at = new Date().toISOString();
          update.next_send_at = null;
          completed++;
        } else {
          update.next_send_at = nextSendAt(sub.enrolled_at, nextStep, series);
        }
        if (typeof supabaseRequest === 'function') {
          try {
            await supabaseRequest('PATCH', '/drip_subscriptions?id=eq.' + sub.id, update);
          } catch (_) {}
        }
      }
      return send(res, { ok: true, processed, sent, failed, completed }, 200, helpers);
    } catch (err) {
      if (sendError) return sendError(res, err);
      return send(res, { ok: false, error: String(err && err.message || err) }, 500, helpers);
    }
  };

  return [
    'POST /api/drips/enroll',
    'POST /api/drips/unenroll',
    'GET /api/drips/subscriptions',
    'GET /api/drips/series',
    'POST /api/cron/drips-tick',
  ];
}

module.exports = { register, DRIP_SERIES };
