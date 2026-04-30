/**
 * VOLVIX POS · Transactional Email via Resend
 * --------------------------------------------
 * Routes:
 *   POST /api/email/send            (auth)   generic
 *   POST /api/email/otp             (public, rate-limited) registration OTP
 *   POST /api/email/welcome         (auth)   welcome email
 *   POST /api/email/receipt         (auth)   sale receipt
 *   POST /api/email/cfdi            (auth)   CFDI XML+PDF
 *   POST /api/email/password-reset  (public) reset link
 *   POST /api/email/test            (auth)   send test email
 *   GET  /api/email/health          (public) provider status
 *
 * Resend env: RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME
 * If RESEND_API_KEY missing → returns 200 { mock: true } and logs to email_log.
 */

'use strict';

let templates = null;
try { templates = require('./email-templates'); } catch (_) { templates = null; }

const RESEND_API = 'https://api.resend.com/emails';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@volvix.com';
const FROM_NAME  = process.env.RESEND_FROM_NAME  || 'Volvix POS';
const FROM_HEADER = `${FROM_NAME} <${FROM_EMAIL}>`;

const BRAND = {
  amber: '#FBBF24',
  navy:  '#0F172A',
  navy2: '#1E293B',
  text:  '#0F172A',
  muted: '#64748B',
  bg:    '#F8FAFC',
  card:  '#FFFFFF',
  border:'#E2E8F0',
  font:  "'Inter','Segoe UI',Helvetica,Arial,sans-serif",
};

// ---- in-memory OTP rate limiter ------------------------------------------
const otpHits = new Map();      // ip -> [timestamps]
const OTP_WINDOW_MS = 10 * 60 * 1000;
const OTP_MAX = 3;

function rateLimitOk(ip) {
  const now = Date.now();
  const arr = (otpHits.get(ip) || []).filter(t => now - t < OTP_WINDOW_MS);
  if (arr.length >= OTP_MAX) { otpHits.set(ip, arr); return false; }
  arr.push(now); otpHits.set(ip, arr);
  // opportunistic cleanup
  if (otpHits.size > 5000) {
    for (const [k, v] of otpHits) {
      if (!v.length || now - v[v.length - 1] > OTP_WINDOW_MS) otpHits.delete(k);
    }
  }
  return true;
}

function getIp(req) {
  const xf = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

// ---- helpers --------------------------------------------------------------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|h[1-6]|li|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) { req.destroy(); resolve({}); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function isEmail(s) { return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

// ---- shared shell ---------------------------------------------------------
function shell(title, inner, preheader = '') {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.font};color:${BRAND.text};">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.card};border-radius:14px;overflow:hidden;border:1px solid ${BRAND.border};">
      <tr><td style="background:${BRAND.navy};padding:22px 28px;" align="left">
        <div style="font-family:${BRAND.font};font-weight:700;font-size:20px;color:${BRAND.amber};letter-spacing:.4px;">VOLVIX <span style="color:#fff;font-weight:500;">POS</span></div>
      </td></tr>
      <tr><td style="padding:32px 28px;font-size:15px;line-height:1.6;color:${BRAND.text};">${inner}</td></tr>
      <tr><td style="padding:18px 28px;background:${BRAND.bg};border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.muted};" align="center">
        &copy; ${new Date().getFullYear()} Volvix POS &middot; Punto de venta inteligente
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function btn(label, href) {
  return `<a href="${esc(href)}" style="display:inline-block;background:${BRAND.amber};color:${BRAND.navy};font-weight:700;text-decoration:none;padding:13px 24px;border-radius:10px;font-family:${BRAND.font};">${esc(label)}</a>`;
}

// ---- templates ------------------------------------------------------------
function tplOtp(code, name) {
  const greeting = name ? `Hola ${esc(name)},` : 'Hola,';
  const html = shell('Tu codigo de verificacion', `
    <h1 style="margin:0 0 14px;font-size:22px;color:${BRAND.navy};">Codigo de verificacion</h1>
    <p style="margin:0 0 18px;">${greeting} usa el siguiente codigo para verificar tu cuenta en Volvix POS.</p>
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;background:${BRAND.navy};color:${BRAND.amber};font-family:'Courier New',monospace;font-weight:700;font-size:34px;letter-spacing:10px;padding:18px 28px;border-radius:12px;border:2px solid ${BRAND.amber};">${esc(code)}</div>
    </div>
    <p style="margin:0 0 8px;color:${BRAND.muted};font-size:13px;">Este codigo expira en <strong>10 minutos</strong>.</p>
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:12px;">Si no solicitaste este codigo, ignora este mensaje.</p>
  `, `Tu codigo Volvix: ${code}`);
  return { subject: 'Tu codigo de verificacion - Volvix POS', html };
}

function tplWelcome(tenantName, loginUrl) {
  const html = shell('Bienvenido a Volvix POS', `
    <h1 style="margin:0 0 12px;font-size:24px;color:${BRAND.navy};">Bienvenido, ${esc(tenantName || '')}</h1>
    <p style="margin:0 0 14px;">Tu cuenta en <strong>Volvix POS</strong> esta lista. Empieza a vender, gestionar inventario y emitir CFDI desde un solo lugar.</p>
    <div style="margin:28px 0;text-align:center;">${btn('Entrar al panel', loginUrl || 'https://volvix.com/login')}</div>
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">Si tienes dudas, responde este correo. Estamos para ayudarte.</p>
  `, 'Tu cuenta Volvix POS esta lista');
  return { subject: 'Bienvenido a Volvix POS', html };
}

function tplReceipt(sale, items, tenantName) {
  const total = Number(sale?.total || 0);
  const folio = esc(sale?.folio || sale?.id || '');
  const date = sale?.created_at ? new Date(sale.created_at).toLocaleString('es-MX') : new Date().toLocaleString('es-MX');
  const rows = (items || []).map(it => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid ${BRAND.border};">${esc(it.name || it.product_name || it.sku || '-')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid ${BRAND.border};text-align:center;">${esc(it.qty || it.quantity || 1)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid ${BRAND.border};text-align:right;">$${Number(it.price || it.unit_price || 0).toFixed(2)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid ${BRAND.border};text-align:right;font-weight:600;">$${Number(it.subtotal || (Number(it.qty || 1) * Number(it.price || 0))).toFixed(2)}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="padding:14px;text-align:center;color:${BRAND.muted};">(sin partidas)</td></tr>`;
  const html = shell('Tu recibo de venta', `
    <h1 style="margin:0 0 6px;font-size:22px;color:${BRAND.navy};">Gracias por tu compra</h1>
    <p style="margin:0 0 6px;color:${BRAND.muted};">Folio <strong style="color:${BRAND.text};">${folio}</strong> &middot; ${esc(date)}</p>
    ${tenantName ? `<p style="margin:0 0 16px;color:${BRAND.muted};">${esc(tenantName)}</p>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">
      <thead><tr style="background:${BRAND.bg};">
        <th align="left"   style="padding:10px 8px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Articulo</th>
        <th align="center" style="padding:10px 8px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Cant</th>
        <th align="right"  style="padding:10px 8px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Precio</th>
        <th align="right"  style="padding:10px 8px;font-size:12px;color:${BRAND.muted};text-transform:uppercase;">Subtotal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" style="padding:14px 8px;text-align:right;font-weight:700;">Total</td>
        <td style="padding:14px 8px;text-align:right;font-weight:800;color:${BRAND.navy};font-size:18px;">$${total.toFixed(2)}</td></tr></tfoot>
    </table>
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;text-align:center;">Gracias por preferir ${esc(tenantName || 'nuestro negocio')}. Vuelve pronto.</p>
  `, `Recibo ${folio} - Total $${total.toFixed(2)}`);
  return { subject: `Recibo de venta ${folio}`, html };
}

function tplCfdi(saleId) {
  const html = shell('Tu factura CFDI', `
    <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND.navy};">Factura CFDI emitida</h1>
    <p style="margin:0 0 12px;">Adjuntamos tu CFDI (XML y PDF) correspondiente a la venta <strong>${esc(saleId || '')}</strong>.</p>
    <p style="margin:0 0 12px;color:${BRAND.muted};">Conserva ambos archivos para tu contabilidad. El XML es el comprobante fiscal valido ante el SAT.</p>
    <p style="margin:18px 0 0;color:${BRAND.muted};font-size:13px;">Si necesitas reemision o cancelacion, responde este correo.</p>
  `, 'Tu CFDI esta listo');
  return { subject: `CFDI ${saleId || ''}`.trim(), html };
}

function tplPasswordReset(resetToken) {
  const url = `https://volvix.com/reset?token=${encodeURIComponent(resetToken || '')}`;
  const html = shell('Restablece tu contrasena', `
    <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND.navy};">Restablecer contrasena</h1>
    <p style="margin:0 0 14px;">Recibimos una solicitud para restablecer tu contrasena. Haz clic en el boton para crear una nueva.</p>
    <div style="margin:24px 0;text-align:center;">${btn('Restablecer contrasena', url)}</div>
    <p style="margin:0 0 8px;color:${BRAND.muted};font-size:13px;">Este enlace expira en 60 minutos. Si no solicitaste el cambio, ignora este correo.</p>
    <p style="margin:14px 0 0;color:${BRAND.muted};font-size:11px;word-break:break-all;">${esc(url)}</p>
  `, 'Restablece tu contrasena Volvix POS');
  return { subject: 'Restablece tu contrasena - Volvix POS', html };
}

function tplTest() {
  const html = shell('Test - Volvix POS', `
    <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND.navy};">Email de prueba</h1>
    <p style="margin:0 0 12px;">Si recibes este mensaje, la integracion con Resend esta funcionando correctamente.</p>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">Enviado desde <strong>${esc(FROM_HEADER)}</strong> a las ${esc(new Date().toISOString())}.</p>
  `, 'Test Resend OK');
  return { subject: 'Test - Volvix POS Resend', html };
}

// ---- log to supabase ------------------------------------------------------
async function logEmail(supabaseRequest, row) {
  if (typeof supabaseRequest !== 'function') return;
  try {
    await supabaseRequest('POST', '/email_log', {
      recipient: row.recipient || null,
      subject:   row.subject   || null,
      type:      row.type      || null,
      status:    row.status    || null,
      provider_id: row.provider_id || null,
      error:     row.error     || null,
      tenant_id: row.tenant_id || null,
      meta:      row.meta      || null,
    });
  } catch (_) { /* never block the user on logging */ }
}

// ---- Resend client --------------------------------------------------------
async function resendSend(payload) {
  const r = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!r.ok) { const err = new Error((json && (json.message || json.error)) || `Resend ${r.status}`); err.status = r.status; err.body = json; throw err; }
  return json || {};
}

/**
 * Send an email through Resend or mock-respond when not configured.
 * Always logs to email_log.
 */
async function sendEmail(ctx, opts) {
  const { supabaseRequest } = ctx || {};
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const baseLog = {
    recipient: Array.isArray(opts.to) ? opts.to.join(',') : opts.to,
    subject: opts.subject,
    type: opts.type || 'generic',
    tenant_id: opts.tenant_id || null,
    meta: opts.meta || null,
  };

  if (!RESEND_KEY) {
    await logEmail(supabaseRequest, { ...baseLog, status: 'mock', provider_id: null, error: null });
    return {
      ok: true, mock: true,
      configured: false,
      would_have_sent: { to: opts.to, subject: opts.subject },
      message: 'Email no configurado. Agrega RESEND_API_KEY en Vercel env vars.',
    };
  }

  const payload = {
    from: opts.from || FROM_HEADER,
    to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text || htmlToText(opts.html),
  };
  if (opts.reply_to)    payload.reply_to    = opts.reply_to;
  if (opts.cc)          payload.cc          = opts.cc;
  if (opts.bcc)         payload.bcc         = opts.bcc;
  if (opts.tags)        payload.tags        = opts.tags;
  if (opts.attachments) payload.attachments = opts.attachments;

  try {
    const res = await resendSend(payload);
    await logEmail(supabaseRequest, { ...baseLog, status: 'sent', provider_id: res.id || null });
    return { ok: true, mock: false, id: res.id || null };
  } catch (err) {
    await logEmail(supabaseRequest, { ...baseLog, status: 'error', error: String(err.message || err) });
    return { ok: false, mock: false, error: String(err.message || err), status: err.status || 502, body: err.body || null };
  }
}

// ---- url->attachment fetch (CFDI) ----------------------------------------
async function fetchAttachment(url, filename) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar ${filename}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { filename, content: buf.toString('base64') };
}

// ---- ROUTE HANDLER --------------------------------------------------------
module.exports = async function handleEmail(req, res, parsedUrl, ctx) {
  const { supabaseRequest, getAuthUser, sendJson } = ctx || {};
  const path = parsedUrl?.pathname || '';
  if (!path.startsWith('/api/email')) return false;

  const send = (code, body) => (typeof sendJson === 'function')
    ? sendJson(res, code, body)
    : (res.statusCode = code, res.setHeader('Content-Type','application/json'), res.end(JSON.stringify(body)));

  const requireAuth = async () => {
    if (typeof getAuthUser !== 'function') return null;
    try { return await getAuthUser(req); } catch { return null; }
  };

  // ---- GET /api/email/health ---------------------------------------------
  if (req.method === 'GET' && path === '/api/email/health') {
    send(200, {
      ok: true,
      configured: !!RESEND_KEY,
      from_email: FROM_EMAIL,
      from_name: FROM_NAME,
    });
    return true;
  }

  // ---- POST /api/email/otp (public, rate-limited) -------------------------
  if (req.method === 'POST' && path === '/api/email/otp') {
    const ip = getIp(req);
    if (!rateLimitOk(ip)) {
      send(429, { ok: false, error: 'Demasiadas solicitudes. Intenta de nuevo en 10 minutos.' });
      return true;
    }
    const body = await readJson(req);
    const to = String(body.to || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    if (!isEmail(to))   { send(400, { ok: false, error: 'Email destinatario invalido' }); return true; }
    if (!/^\d{4,8}$/.test(code)) { send(400, { ok: false, error: 'Codigo OTP invalido (4-8 digitos)' }); return true; }
    const t = tplOtp(code, body.name);
    const r = await sendEmail(ctx, { to, subject: t.subject, html: t.html, type: 'otp', meta: { ip } });
    send(r.ok ? 200 : (r.status || 502), r);
    return true;
  }

  // ---- POST /api/email/password-reset (public) ---------------------------
  if (req.method === 'POST' && path === '/api/email/password-reset') {
    const body = await readJson(req);
    const to = String(body.to || '').trim().toLowerCase();
    const token = String(body.reset_token || '').trim();
    if (!isEmail(to)) { send(400, { ok: false, error: 'Email destinatario invalido' }); return true; }
    if (!token)       { send(400, { ok: false, error: 'reset_token requerido' });        return true; }
    const t = tplPasswordReset(token);
    const r = await sendEmail(ctx, { to, subject: t.subject, html: t.html, type: 'password_reset' });
    send(r.ok ? 200 : (r.status || 502), r);
    return true;
  }

  // ----- routes from here on require auth ---------------------------------
  if (path === '/api/email/send' ||
      path === '/api/email/welcome' ||
      path === '/api/email/receipt' ||
      path === '/api/email/cfdi' ||
      path === '/api/email/test') {
    const user = await requireAuth();
    if (!user) { send(401, { ok: false, error: 'No autorizado' }); return true; }

    const body = await readJson(req);

    // ---- POST /api/email/send -------------------------------------------
    if (req.method === 'POST' && path === '/api/email/send') {
      const to = body.to;
      if (!to || (Array.isArray(to) ? !to.every(isEmail) : !isEmail(to))) {
        send(400, { ok: false, error: 'Destinatario invalido' }); return true;
      }
      if (!body.subject || !body.html) { send(400, { ok: false, error: 'subject y html son requeridos' }); return true; }
      const r = await sendEmail(ctx, {
        to, subject: body.subject, html: body.html, text: body.text,
        from: body.from, reply_to: body.reply_to, tags: body.tags,
        type: 'generic', tenant_id: user.tenant_id || user.company_id || null,
      });
      send(r.ok ? 200 : (r.status || 502), r); return true;
    }

    // ---- POST /api/email/welcome ----------------------------------------
    if (req.method === 'POST' && path === '/api/email/welcome') {
      const to = String(body.to || '').trim().toLowerCase();
      if (!isEmail(to)) { send(400, { ok: false, error: 'Email invalido' }); return true; }
      const t = tplWelcome(body.tenant_name || 'usuario', body.login_url);
      const r = await sendEmail(ctx, { to, subject: t.subject, html: t.html, type: 'welcome',
        tenant_id: user.tenant_id || user.company_id || null });
      send(r.ok ? 200 : (r.status || 502), r); return true;
    }

    // ---- POST /api/email/receipt ----------------------------------------
    if (req.method === 'POST' && path === '/api/email/receipt') {
      const to = String(body.to || '').trim().toLowerCase();
      const saleId = String(body.sale_id || '').trim();
      const tenantId = String(body.tenant_id || user.tenant_id || user.company_id || '').trim();
      if (!isEmail(to)) { send(400, { ok: false, error: 'Email invalido' }); return true; }
      if (!saleId)      { send(400, { ok: false, error: 'sale_id requerido' }); return true; }

      let sale = null, items = [], tenantName = null;
      try {
        if (typeof supabaseRequest === 'function') {
          const filter = tenantId ? `&tenant_id=eq.${encodeURIComponent(tenantId)}` : '';
          const sales = await supabaseRequest('GET', `/pos_sales?id=eq.${encodeURIComponent(saleId)}${filter}&limit=1`);
          sale = Array.isArray(sales) && sales[0] ? sales[0] : null;
          if (!sale) { send(404, { ok: false, error: 'Venta no encontrada' }); return true; }
          items = await supabaseRequest('GET', `/pos_sale_items?sale_id=eq.${encodeURIComponent(saleId)}`) || [];
          if (tenantId) {
            const co = await supabaseRequest('GET', `/pos_companies?id=eq.${encodeURIComponent(tenantId)}&select=name&limit=1`);
            tenantName = Array.isArray(co) && co[0] ? co[0].name : null;
          }
        }
      } catch (e) { /* fall through, render with what we have */ }

      const t = tplReceipt(sale || { id: saleId }, items, tenantName);
      const r = await sendEmail(ctx, { to, subject: t.subject, html: t.html, type: 'receipt', tenant_id: tenantId || null,
        meta: { sale_id: saleId } });
      send(r.ok ? 200 : (r.status || 502), r); return true;
    }

    // ---- POST /api/email/cfdi -------------------------------------------
    if (req.method === 'POST' && path === '/api/email/cfdi') {
      const to = String(body.to || '').trim().toLowerCase();
      const saleId = String(body.sale_id || '').trim();
      if (!isEmail(to)) { send(400, { ok: false, error: 'Email invalido' }); return true; }
      if (!body.xml_url || !body.pdf_url) { send(400, { ok: false, error: 'xml_url y pdf_url son requeridos' }); return true; }

      const attachments = [];
      try {
        attachments.push(await fetchAttachment(body.xml_url, `CFDI-${saleId || 'factura'}.xml`));
        attachments.push(await fetchAttachment(body.pdf_url, `CFDI-${saleId || 'factura'}.pdf`));
      } catch (e) {
        send(502, { ok: false, error: 'No se pudieron descargar los archivos CFDI', detail: String(e.message || e) });
        return true;
      }
      const t = tplCfdi(saleId);
      const r = await sendEmail(ctx, { to, subject: t.subject, html: t.html, type: 'cfdi',
        tenant_id: user.tenant_id || user.company_id || null,
        meta: { sale_id: saleId }, attachments });
      send(r.ok ? 200 : (r.status || 502), r); return true;
    }

    // ---- POST /api/email/test -------------------------------------------
    if (req.method === 'POST' && path === '/api/email/test') {
      const to = String(body.to || user.email || '').trim().toLowerCase();
      if (!isEmail(to)) { send(400, { ok: false, error: 'Email invalido' }); return true; }
      const t = tplTest();
      const r = await sendEmail(ctx, { to, subject: t.subject, html: t.html, type: 'test' });
      send(r.ok ? 200 : (r.status || 502), r); return true;
    }
  }

  // not handled
  return false;
};

// expose for tests / re-use
module.exports.templates = { tplOtp, tplWelcome, tplReceipt, tplCfdi, tplPasswordReset, tplTest };
module.exports.sendEmail = sendEmail;

/* ---------------------------------------------------------------------------
 * SQL — run once in Supabase (kept as a comment for ops):
 *
 * CREATE TABLE IF NOT EXISTS email_log (
 *   id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
 *   recipient   text,
 *   subject     text,
 *   type        text,
 *   status      text,
 *   provider_id text,
 *   error       text,
 *   sent_at     timestamptz DEFAULT now(),
 *   tenant_id   text,
 *   meta        jsonb
 * );
 * CREATE INDEX IF NOT EXISTS email_log_sent_at_idx  ON email_log(sent_at DESC);
 * CREATE INDEX IF NOT EXISTS email_log_recipient_idx ON email_log(recipient);
 * CREATE INDEX IF NOT EXISTS email_log_tenant_idx   ON email_log(tenant_id);
 * ------------------------------------------------------------------------- */
