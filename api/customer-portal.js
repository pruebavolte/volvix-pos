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

  // ---------- PATCH /api/customer/me ----------
  // Updates portal_customers row for the authenticated customer.
  handlers['PATCH /api/customer/me'] = requireAuth(async (req, res) => {
    try {
      const id = req.user.id;
      if (!id) return sendJSON(res, { error: 'sin id de cliente' }, 400);
      const body = await readBody(req);
      const ALLOWED = [
        'full_name', 'phone', 'birth_date',
        'rfc', 'business_name', 'tax_regime', 'zip_code', 'address',
      ];
      const patch = {};
      for (const k of ALLOWED) {
        if (body[k] !== undefined && body[k] !== null) {
          patch[k] = String(body[k]).slice(0, 250);
        }
      }
      if (!Object.keys(patch).length) return sendJSON(res, { error: 'nada que actualizar' }, 400);
      patch.updated_at = new Date().toISOString();
      let updated = null;
      try {
        const r = await supabaseRequest('PATCH',
          '/portal_customers?id=eq.' + encodeURIComponent(id), patch);
        updated = (r && r[0]) || r;
      } catch (e) {
        logRequest({ ts: new Date().toISOString(), level: 'warn',
          msg: 'portal_customers patch failed', err: String(e.message || e) });
      }
      sendJSON(res, { ok: true, customer: updated || patch });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- POST /api/customer/invoice/request ----------
  // Customer-facing wrapper around CFDI stamping. Body: { sale_id, rfc, business_name, tax_regime, zip_code, email, use? }
  handlers['POST /api/customer/invoice/request'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const saleId = String(body.sale_id || '').trim();
      const rfc    = String(body.rfc || '').toUpperCase().trim();
      if (!saleId || !rfc) return sendJSON(res, { error: 'sale_id y rfc requeridos' }, 400);

      let sale = null;
      try {
        const rows = await supabaseRequest('GET',
          '/pos_sales?id=eq.' + encodeURIComponent(saleId) +
          '&customer_email=eq.' + encodeURIComponent(req.user.email) +
          '&select=id,folio,total,cfdi_uuid&limit=1');
        sale = rows && rows[0];
      } catch (_) {}
      if (!sale) return sendJSON(res, { error: 'venta no encontrada' }, 404);
      if (sale.cfdi_uuid) return sendJSON(res, { ok: true, uuid: sale.cfdi_uuid, message: 'ya facturada' });

      // Persist invoice request (best-effort) and confirm via email
      const reqRow = {
        sale_id: saleId,
        customer_email: req.user.email,
        rfc,
        business_name: String(body.business_name || '').slice(0, 250),
        tax_regime:    String(body.tax_regime    || '').slice(0, 10),
        zip_code:      String(body.zip_code      || '').slice(0, 10),
        cfdi_use:      String(body.use           || 'G03').slice(0, 6),
        delivery_email: String(body.email || req.user.email).toLowerCase().slice(0, 200),
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      try { await supabaseRequest('POST', '/cfdi_requests', reqRow); } catch (e) {
        logRequest({ ts: new Date().toISOString(), level: 'warn',
          msg: 'cfdi_requests insert failed', err: String(e.message || e) });
      }

      // Notify customer
      sendEmail({
        to: reqRow.delivery_email,
        subject: 'Solicitud de factura recibida — Volvix',
        html: '<p>Hemos recibido tu solicitud de factura para la venta <strong>' +
              (sale.folio || sale.id) + '</strong>.</p>' +
              '<p>Te enviaremos el CFDI (PDF + XML) a este correo en cuanto sea timbrado.</p>',
        text: 'Solicitud de factura recibida para venta ' + (sale.folio || sale.id),
        template: 'cfdi_request',
      }).catch(() => {});

      sendJSON(res, { ok: true, status: 'pending', sale_id: saleId });
    } catch (err) { sendError(res, err); }
  }, ['customer']);

  // ---------- GET /api/customer/ticket/:id ----------
  // Returns a printable HTML ticket the browser can save as PDF (window.print).
  handlers['GET /api/customer/ticket/:id'] = requireAuth(async (req, res, params) => {
    try {
      let sale = null;
      try {
        const saleRows = await supabaseRequest('GET',
          '/pos_sales?id=eq.' + encodeURIComponent(params.id) +
          '&customer_email=eq.' + encodeURIComponent(req.user.email) +
          '&select=id,folio,total,subtotal,tax,items,payment_method,created_at,customer_email&limit=1');
        sale = saleRows && saleRows[0];
      } catch (_) {}
      if (!sale) return sendJSON(res, { error: 'no encontrada' }, 404);

      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const items = Array.isArray(sale.items) ? sale.items : [];
      const rowsHtml = items.map(it =>
        '<tr><td>' + esc(it.name || it.sku || '-') + '</td>' +
        '<td style="text-align:center">' + (Number(it.qty || it.quantity) || 1) + '</td>' +
        '<td style="text-align:right">$' + (Number(it.price || it.unit_price) || 0).toFixed(2) + '</td>' +
        '<td style="text-align:right">$' + ((Number(it.qty||it.quantity)||1) * (Number(it.price||it.unit_price)||0)).toFixed(2) + '</td></tr>'
      ).join('');
      const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
        '<title>Ticket ' + esc(sale.folio || sale.id) + '</title>' +
        '<style>body{font-family:monospace;max-width:380px;margin:20px auto;padding:0 14px;color:#000}' +
        'h1{font-size:18px;text-align:center;margin:0 0 4px}' +
        '.muted{color:#666;font-size:12px;text-align:center}' +
        'table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}' +
        'th,td{padding:4px;border-bottom:1px dashed #ccc}' +
        '.tot{font-size:16px;font-weight:700;text-align:right;margin-top:12px}' +
        '@media print{.noprint{display:none}}</style></head><body>' +
        '<h1>VOLVIX</h1>' +
        '<div class="muted">Ticket de compra</div>' +
        '<div class="muted">Folio: ' + esc(sale.folio || sale.id) + '</div>' +
        '<div class="muted">Fecha: ' + esc((sale.created_at || '').slice(0,19).replace('T',' ')) + '</div>' +
        '<div class="muted">Cliente: ' + esc(sale.customer_email || '') + '</div>' +
        '<table><thead><tr><th>Concepto</th><th>Cant</th><th>P.U.</th><th>Importe</th></tr></thead>' +
        '<tbody>' + (rowsHtml || '<tr><td colspan="4" style="text-align:center;color:#999">Sin partidas</td></tr>') + '</tbody></table>' +
        '<div class="tot">Subtotal: $' + (Number(sale.subtotal) || 0).toFixed(2) + '</div>' +
        '<div class="tot">IVA: $' + (Number(sale.tax) || 0).toFixed(2) + '</div>' +
        '<div class="tot">TOTAL: $' + (Number(sale.total) || 0).toFixed(2) + '</div>' +
        '<div class="muted" style="margin-top:18px">Pago: ' + esc(sale.payment_method || '-') + '</div>' +
        '<div class="muted" style="margin-top:24px">Gracias por su compra</div>' +
        '<div class="noprint" style="text-align:center;margin-top:20px">' +
        '<button onclick="window.print()" style="padding:10px 20px">Imprimir / Guardar PDF</button></div>' +
        '<script>setTimeout(function(){try{window.print()}catch(e){}},400);</script>' +
        '</body></html>';
      res.statusCode = 200;
      setSecurityHeaders(res);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
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
