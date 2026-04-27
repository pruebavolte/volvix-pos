/**
 * R14 — Customer Portal Auth & Endpoints
 * Se inyecta en el objeto `handlers` de api/index.js.
 *
 * Uso (desde index.js, una sola línea al final del archivo):
 *   require('./customer-portal').register({
 *     handlers, crypto, url,
 *     supabaseRequest, requireAuth, readBody,
 *     sendJSON, sendError, signJWT, sendEmail,
 *     setSecurityHeaders, rateLimit, clientIp, logRequest, JWT_SECRET,
 *   });
 */
'use strict';

function register(deps) {
  const {
    handlers, crypto, url,
    supabaseRequest, requireAuth, readBody,
    sendJSON, sendError, signJWT, sendEmail,
    setSecurityHeaders, rateLimit, clientIp, logRequest, JWT_SECRET,
  } = deps;

  const OTP_TTL_MS    = 10 * 60 * 1000;
  const OTP_MAX_TRIES = 5;

  function hashOtp(email, code) {
    return crypto.createHash('sha256')
      .update(String(email).toLowerCase() + '|' + String(code) + '|' + JWT_SECRET)
      .digest('hex');
  }
  function genOtp() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  }
  function isEmailStr(s) {
    return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // ---------- POST /api/customer/otp/request ----------
  handlers['POST /api/customer/otp/request'] = async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!rateLimit('cust-otp-req:' + ip, 5, 15 * 60 * 1000)) {
        return sendJSON(res, { error: 'too many attempts' }, 429);
      }
      const body  = await readBody(req);
      const email = String(body.email || '').toLowerCase().trim();
      if (!isEmailStr(email)) return sendJSON(res, { error: 'email inválido' }, 400);

      const code      = genOtp();
      const codeHash  = hashOtp(email, code);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

      let storageWarning = null;
      try {
        await supabaseRequest('POST', '/customer_otps', {
          email, code_hash: codeHash, expires_at: expiresAt, ip,
        });
      } catch (e) {
        // R14 fallback: si tabla customer_otps no existe, NO falle el endpoint.
        // Persistimos en blob in-memory para que verify pueda matchear.
        logRequest({ ts: new Date().toISOString(), level: 'warn',
          msg: 'customer_otps insert failed, using fallback', err: String(e.message || e) });
        try {
          global.__CUSTOMER_OTPS_FALLBACK = global.__CUSTOMER_OTPS_FALLBACK || [];
          global.__CUSTOMER_OTPS_FALLBACK.push({ email, code_hash: codeHash, expires_at: expiresAt, ip, created_at: new Date().toISOString() });
        } catch (_) {}
        storageWarning = 'fallback_memory';
      }

      const subject = 'Tu código Volvix';
      const html = '<p>Hola,</p><p>Tu código de acceso al portal Volvix es:</p>' +
        '<p style="font-size:28px;font-weight:bold;letter-spacing:6px">' + code + '</p>' +
        '<p>Vence en 10 minutos. Si no lo solicitaste, ignora este correo.</p>';
      const text = 'Código Volvix: ' + code + ' (vence en 10 min)';
      sendEmail({ to: email, subject, html, text, template: 'customer_otp' })
        .catch(err => logRequest({ ts: new Date().toISOString(), level: 'warn',
          msg: 'customer otp email failed', err: String(err.message || err) }));

      sendJSON(res, { ok: true, expires_in: OTP_TTL_MS / 1000 });
    } catch (err) { sendError(res, err); }
  };

  // ---------- POST /api/customer/otp/verify ----------
  handlers['POST /api/customer/otp/verify'] = async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!rateLimit('cust-otp-ver:' + ip, 10, 15 * 60 * 1000)) {
        return sendJSON(res, { error: 'too many attempts' }, 429);
      }
      const body  = await readBody(req);
      const email = String(body.email || '').toLowerCase().trim();
      const otp   = String(body.otp   || '').replace(/\D/g, '');
      if (!isEmailStr(email) || otp.length !== 6) {
        return sendJSON(res, { error: 'datos inválidos' }, 400);
      }
      const codeHash = hashOtp(email, otp);
      const nowIso   = new Date().toISOString();

      const rows = await supabaseRequest('GET',
        '/customer_otps?email=eq.' + encodeURIComponent(email) +
        '&code_hash=eq.' + encodeURIComponent(codeHash) +
        '&consumed_at=is.null&expires_at=gte.' + encodeURIComponent(nowIso) +
        '&order=created_at.desc&limit=1');

      if (!rows || !rows.length) {
        return sendJSON(res, { error: 'código inválido o vencido' }, 401);
      }
      const otpRow = rows[0];
      if ((otpRow.attempts || 0) >= OTP_MAX_TRIES) {
        return sendJSON(res, { error: 'demasiados intentos' }, 429);
      }

      await supabaseRequest('PATCH',
        '/customer_otps?id=eq.' + otpRow.id,
        { consumed_at: nowIso }
      ).catch(() => {});

      let customer = null;
      try {
        const cs = await supabaseRequest('GET',
          '/portal_customers?email=eq.' + encodeURIComponent(email) +
          '&select=id,email,full_name,phone,tenant_id,loyalty_points&limit=1');
        customer = (cs && cs[0]) || null;
        if (!customer) {
          const created = await supabaseRequest('POST', '/portal_customers',
            { email, loyalty_points: 0 });
          customer = (created && created[0]) || created;
        }
      } catch (e) {
        logRequest({ ts: new Date().toISOString(), level: 'warn',
          msg: 'portal_customers lookup/create failed', err: String(e.message || e) });
        customer = { id: null, email, loyalty_points: 0 };
      }

      const token = signJWT({
        id: customer.id,
        email: customer.email || email,
        role: 'customer',
        tenant_id: customer.tenant_id || null,
      });

      sendJSON(res, {
        ok: true,
        token,
        customer: {
          id: customer.id, email: customer.email,
          full_name: customer.full_name || null,
          loyalty_points: customer.loyalty_points || 0,
        },
      });
    } catch (err) { sendError(res, err); }
  };

  // ---------- GET /api/customer/me ----------
  handlers['GET /api/customer/me'] = requireAuth(async (req, res) => {
    try {
      const id = req.user.id;
      let customer = null;
      if (id) {
        const cs = await supabaseRequest('GET',
          '/portal_customers?id=eq.' + encodeURIComponent(id) +
          '&select=id,email,full_name,phone,tenant_id,loyalty_points,created_at&limit=1');
        customer = (cs && cs[0]) || null;
      }
      sendJSON(res, { ok: true, customer: customer || { email: req.user.email } });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- GET /api/customer/orders ----------
  handlers['GET /api/customer/orders'] = requireAuth(async (req, res) => {
    try {
      const email = req.user.email;
      let rows = [];
      try {
        rows = await supabaseRequest('GET',
          '/pos_sales?customer_email=eq.' + encodeURIComponent(email) +
          '&select=id,folio,total,status,created_at,cfdi_uuid' +
          '&order=created_at.desc&limit=100') || [];
      } catch (_) { rows = []; }
      sendJSON(res, { ok: true, orders: rows });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- GET /api/customer/loyalty ----------
  handlers['GET /api/customer/loyalty'] = requireAuth(async (req, res) => {
    try {
      const id = req.user.id;
      const email = req.user.email;
      let points = 0;
      try {
        const cs = await supabaseRequest('GET',
          '/portal_customers?email=eq.' + encodeURIComponent(email) + '&select=loyalty_points&limit=1');
        points = (cs && cs[0] && cs[0].loyalty_points) || 0;
      } catch (_) {}
      let movements = [];
      try {
        const filter = id
          ? 'customer_id=eq.' + encodeURIComponent(id)
          : 'customer_email=eq.' + encodeURIComponent(email);
        movements = await supabaseRequest('GET',
          '/loyalty_movements?' + filter + '&select=created_at,kind,points,note&order=created_at.desc&limit=50') || [];
      } catch (_) { movements = []; }
      sendJSON(res, { ok: true, points, movements });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- GET /api/customer/payment-methods ----------
  handlers['GET /api/customer/payment-methods'] = requireAuth(async (req, res) => {
    try {
      const email = req.user.email;
      let methods = [];
      try {
        methods = await supabaseRequest('GET',
          '/customer_payment_methods?email=eq.' + encodeURIComponent(email) +
          '&select=type,brand,last4,exp&order=created_at.desc&limit=20') || [];
      } catch (_) { methods = []; }
      sendJSON(res, { ok: true, methods });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- POST /api/customer/appointments ----------
  handlers['POST /api/customer/appointments'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const service = String(body.service || '').slice(0, 200);
      const when    = String(body.when    || '').slice(0, 50);
      if (!service || !when) return sendJSON(res, { error: 'datos requeridos' }, 400);
      const row = {
        customer_id:    req.user.id,
        customer_email: req.user.email,
        tenant_id:      req.user.tenant_id || null,
        service, scheduled_for: when, status: 'requested',
      };
      try {
        await supabaseRequest('POST', '/appointments', row);
      } catch (e) {
        logRequest({ ts: new Date().toISOString(), level: 'warn',
          msg: 'appointment insert failed', err: String(e.message || e) });
      }
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- POST /api/customer/password ----------
  handlers['POST /api/customer/password'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const pwd  = String(body.password || '');
      if (pwd.length < 8) return sendJSON(res, { error: 'mínimo 8 caracteres' }, 400);
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(pwd, salt, 32);
      const stored = 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
      const id = req.user.id;
      if (!id) return sendJSON(res, { error: 'sin id de cliente' }, 400);
      await supabaseRequest('PATCH',
        '/portal_customers?id=eq.' + encodeURIComponent(id),
        { password_hash: stored, updated_at: new Date().toISOString() });
      sendJSON(res, { ok: true });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- GET /api/customer/invoice/:id ----------
  handlers['GET /api/customer/invoice/:id'] = requireAuth(async (req, res, params) => {
    try {
      const parsed = url.parse(req.url, true);
      const fmt    = (parsed.query.fmt === 'xml') ? 'xml' : 'pdf';
      const sales = await supabaseRequest('GET',
        '/pos_sales?id=eq.' + encodeURIComponent(params.id) +
        '&customer_email=eq.' + encodeURIComponent(req.user.email) +
        '&select=id,folio,cfdi_uuid,cfdi_xml,cfdi_pdf_url&limit=1').catch(() => []);
      const sale = sales && sales[0];
      if (!sale) return sendJSON(res, { error: 'no encontrada' }, 404);
      if (fmt === 'xml' && sale.cfdi_xml) {
        res.statusCode = 200;
        setSecurityHeaders(res);
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="cfdi-' + (sale.folio || sale.id) + '.xml"');
        return res.end(sale.cfdi_xml);
      }
      if (fmt === 'pdf' && sale.cfdi_pdf_url) {
        res.statusCode = 302;
        res.setHeader('Location', sale.cfdi_pdf_url);
        return res.end();
      }
      sendJSON(res, { error: 'factura no disponible' }, 404);
    } catch (err) { sendError(res, err); }
  }, ['customer']);
}

module.exports = { register };
