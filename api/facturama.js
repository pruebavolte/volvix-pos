'use strict';

/**
 * VOLVIX POS · Facturama Multi-Emisor
 *
 * Cada tenant (negocio: restaurante, panadería, etc.) sube SU PROPIO CSD
 * (Certificado de Sello Digital) + .key + password. Cuando emite una factura,
 * el sistema usa la credencial del tenant para timbrar a nombre de SU RFC.
 *
 * También expone un portal público (/autofactura.html) donde el cliente FINAL
 * del negocio puede auto-facturar metiendo datos del ticket + sus datos
 * fiscales (estilo OXXO/McDonalds/Walmart).
 *
 * Endpoints (montados desde api/index.js vía handleFacturama):
 *
 *   Negocio (auth):
 *     POST   /api/facturama/onboard            sube CSD/key/password al PAC
 *     GET    /api/facturama/credentials        estado del CSD del tenant
 *     POST   /api/facturama/issue              emite CFDI desde un ticket
 *     GET    /api/facturama/invoices           lista CFDIs emitidos
 *     POST   /api/facturama/cancel/:id         cancela CFDI por id local
 *     GET    /api/facturama/invoice/:id        descarga PDF/XML
 *
 *   Cliente final (público, sin auth):
 *     GET    /api/public/autofactura/lookup    lookup de ticket por id+folio
 *     POST   /api/public/autofactura/issue     auto-factura
 *
 *   Plataforma (superadmin):
 *     POST   /api/facturama/platform/issue     factura a un cliente nuestro (B2B)
 *
 * Tablas requeridas:
 *   tenant_facturama_credentials (tenant_id, rfc, legal_name, fiscal_regime,
 *     zip_code, facturama_csd_id, default_serie, next_folio, active)
 *   cfdi_invoices (id, tenant_id, ticket_id, customer_rfc, customer_name,
 *     uuid_sat, total, pdf_url, xml_url, status, facturama_id, issued_at)
 */

const FACTURAMA_BASE_PROD = 'https://api.facturama.mx';
const FACTURAMA_BASE_SANDBOX = 'https://apisandbox.facturama.mx';

function facturamaBase() {
  // FACTURAMA_ENV = 'sandbox' | 'production' (default production cuando hay creds)
  const env = (process.env.FACTURAMA_ENV || 'production').toLowerCase();
  return env === 'sandbox' ? FACTURAMA_BASE_SANDBOX : FACTURAMA_BASE_PROD;
}

function platformAuthHeader() {
  // Credencial Multiemisor de la PLATAFORMA (única para todo el SaaS)
  const user = (process.env.FACTURAMA_USER || process.env.PAC_API_USER || '').trim();
  const pass = (process.env.FACTURAMA_PASSWORD || process.env.PAC_API_PASSWORD || '').trim();
  if (!user || !pass) return null;
  const b64 = Buffer.from(user + ':' + pass).toString('base64');
  return 'Basic ' + b64;
}

function isConfigured() {
  return !!platformAuthHeader();
}

function readBody(req, maxBytes) {
  const max = maxBytes || (10 * 1024 * 1024); // 10 MB para PFX upload
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      chunks.push(c);
      total += c.length;
      if (total > max) { req.destroy(); reject(new Error('payload_too_large')); }
    });
    req.on('end', () => {
      if (!total) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); }
      catch (_) { resolve({ _raw: raw }); }
    });
    req.on('error', reject);
  });
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error((label || 'request') + ' timeout ' + ms + 'ms')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

async function fapi(path, opts) {
  const auth = platformAuthHeader();
  if (!auth) throw new Error('facturama_not_configured');
  const o = opts || {};
  const url = facturamaBase() + path;
  const headers = Object.assign({
    'Authorization': auth,
    'Accept': 'application/json'
  }, o.headers || {});
  if (o.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const init = { method: o.method || 'GET', headers };
  if (o.body) init.body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
  const r = await withTimeout(fetch(url, init), 30000, 'facturama ' + path);
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = { _raw: text }; }
  return { ok: r.ok, status: r.status, body: json };
}

/* ---------- helpers de tenant credentials ---------- */

async function getTenantCreds(supabaseRequest, tenantId) {
  if (!tenantId) return null;
  try {
    const rows = await supabaseRequest('GET',
      '/tenant_facturama_credentials?tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&select=*&limit=1');
    return Array.isArray(rows) && rows[0] || null;
  } catch (_) { return null; }
}

async function nextFolio(supabaseRequest, tenantId) {
  // Optimistic: lee, suma 1, escribe. En concurrencia alta hay que usar RPC con UPDATE RETURNING.
  const cred = await getTenantCreds(supabaseRequest, tenantId);
  const folio = (cred && cred.next_folio) || 1;
  try {
    await supabaseRequest('PATCH',
      '/tenant_facturama_credentials?tenant_id=eq.' + encodeURIComponent(tenantId),
      { next_folio: folio + 1 });
  } catch (_) {}
  return { folio: String(folio), serie: (cred && cred.default_serie) || 'A' };
}

/* ---------- handlers ---------- */

async function handleOnboard(req, res, ctx) {
  const { sendJson, supabaseRequest, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'no_auth' });
  const tenantId = user.tenant_id || user.company_id;
  if (!tenantId) return sendJson(res, 400, { ok: false, error: 'no_tenant' });

  const body = await readBody(req);
  // body: { rfc, legal_name, fiscal_regime, zip_code, csd_b64, key_b64, password, sandbox? }
  const required = ['rfc', 'legal_name', 'fiscal_regime', 'zip_code', 'csd_b64', 'key_b64', 'password'];
  for (const k of required) {
    if (!body[k]) return sendJson(res, 400, { ok: false, error: 'missing_field', field: k });
  }
  const rfc = String(body.rfc).trim().toUpperCase();
  if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_rfc', field: 'rfc' });
  }

  if (!isConfigured()) {
    // Persistir creds del tenant igual (el timbrado fallará hasta que el dueño
    // del SaaS configure FACTURAMA_USER + PASSWORD en Vercel)
    await persistTenantCreds(supabaseRequest, tenantId, body, null);
    return sendJson(res, 200, {
      ok: true, persisted: true, csd_uploaded: false,
      note: 'CSD guardado localmente. Falta configurar FACTURAMA_USER/PASSWORD en la plataforma para timbrar.'
    });
  }

  // Subir CSD a Facturama via /api/csd
  const r = await fapi('/api/csd', {
    method: 'POST',
    body: {
      Rfc: rfc,
      Certificate: body.csd_b64,    // base64 del .cer
      PrivateKey: body.key_b64,     // base64 del .key
      PrivateKeyPassword: body.password
    }
  });
  if (!r.ok) {
    return sendJson(res, 502, {
      ok: false, error: 'csd_upload_failed',
      detail: r.body && (r.body.Message || r.body.message || r.body._raw) || ('http_' + r.status)
    });
  }
  const csdId = r.body && (r.body.Id || r.body.id) || null;
  await persistTenantCreds(supabaseRequest, tenantId, body, csdId);
  return sendJson(res, 200, { ok: true, csd_id: csdId, persisted: true });
}

async function persistTenantCreds(supabaseRequest, tenantId, body, csdId) {
  const row = {
    tenant_id: tenantId,
    rfc: String(body.rfc).trim().toUpperCase(),
    legal_name: String(body.legal_name).trim().slice(0, 250),
    fiscal_regime: String(body.fiscal_regime).trim(),
    zip_code: String(body.zip_code).trim(),
    facturama_csd_id: csdId || null,
    default_serie: String(body.default_serie || 'A').trim().slice(0, 25),
    next_folio: Number(body.next_folio) || 1,
    active: !!csdId,
    updated_at: new Date().toISOString()
  };
  // Upsert via supabase: try PATCH first, fallback to POST
  try {
    const existing = await supabaseRequest('GET',
      '/tenant_facturama_credentials?tenant_id=eq.' + encodeURIComponent(tenantId) + '&select=tenant_id&limit=1');
    if (Array.isArray(existing) && existing.length) {
      await supabaseRequest('PATCH',
        '/tenant_facturama_credentials?tenant_id=eq.' + encodeURIComponent(tenantId), row);
    } else {
      await supabaseRequest('POST', '/tenant_facturama_credentials', row);
    }
  } catch (e) {
    // Tabla no existe → ignorar silenciosamente, devolver al caller
    throw new Error('persist_failed: ' + (e.message || e));
  }
}

async function handleCredentials(req, res, ctx) {
  const { sendJson, supabaseRequest, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'no_auth' });
  const tenantId = user.tenant_id || user.company_id;
  const cred = await getTenantCreds(supabaseRequest, tenantId);
  if (!cred) return sendJson(res, 200, { ok: true, configured: false });
  // No exponer csd_id ni passwords
  return sendJson(res, 200, {
    ok: true,
    configured: !!cred.active,
    rfc: cred.rfc,
    legal_name: cred.legal_name,
    fiscal_regime: cred.fiscal_regime,
    zip_code: cred.zip_code,
    default_serie: cred.default_serie,
    next_folio: cred.next_folio
  });
}

async function buildIssuePayload(supabaseRequest, tenantId, body) {
  const cred = await getTenantCreds(supabaseRequest, tenantId);
  if (!cred || !cred.active) throw new Error('tenant_not_onboarded');

  const { folio, serie } = await nextFolio(supabaseRequest, tenantId);
  const items = (body.items || []).map(it => {
    const qty = Number(it.quantity || 1);
    const unitPrice = Number(it.unit_price || 0);
    const subtotal = Math.round((qty * unitPrice) * 100) / 100;
    const taxRate = it.tax_rate != null ? Number(it.tax_rate) : 0.16;
    const taxBase = subtotal;
    const taxTotal = Math.round((taxBase * taxRate) * 100) / 100;
    const total = Math.round((subtotal + taxTotal) * 100) / 100;
    return {
      ProductCode: String(it.product_code || '01010101'),
      Description: String(it.description || '').slice(0, 1000),
      UnitCode: String(it.unit_code || 'E48'), // E48 = unidad de servicio; 'H87' = pieza
      Unit: it.unit || 'Unidad',
      Quantity: qty,
      UnitPrice: unitPrice,
      Subtotal: subtotal,
      TaxObject: '02',
      Taxes: [{
        Name: 'IVA',
        Base: taxBase,
        Rate: taxRate,
        IsRetention: false,
        Total: taxTotal
      }],
      Total: total
    };
  });

  return {
    Serie: serie,
    Folio: folio,
    CfdiType: 'I',                // I = Ingreso
    NameId: 1,
    PaymentForm: String(body.payment_form || '03'),    // 03 = transferencia
    PaymentMethod: String(body.payment_method || 'PUE'), // PUE = pago en una exhibición
    Currency: String(body.currency || 'MXN'),
    ExpeditionPlace: String(body.expedition_place || cred.zip_code),
    Issuer: {
      Rfc: cred.rfc,
      Name: cred.legal_name,
      FiscalRegime: cred.fiscal_regime
    },
    Receiver: {
      Rfc: String(body.customer_rfc || '').toUpperCase().trim(),
      Name: String(body.customer_name || '').trim(),
      CfdiUse: String(body.cfdi_use || 'G03'),  // G03 = gastos en general
      FiscalRegime: String(body.customer_fiscal_regime || '616'),
      TaxZipCode: String(body.customer_zip || cred.zip_code)
    },
    Items: items
  };
}

async function handleIssue(req, res, ctx) {
  const { sendJson, supabaseRequest, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'no_auth' });
  const tenantId = user.tenant_id || user.company_id;
  if (!tenantId) return sendJson(res, 400, { ok: false, error: 'no_tenant' });

  const body = await readBody(req);
  let payload;
  try { payload = await buildIssuePayload(supabaseRequest, tenantId, body); }
  catch (e) {
    if (String(e.message || e).includes('tenant_not_onboarded')) {
      return sendJson(res, 400, { ok: false, error: 'tenant_not_onboarded', help: 'Sube tu CSD primero en /api/facturama/onboard' });
    }
    return sendJson(res, 500, { ok: false, error: 'build_payload_failed', detail: String(e.message || e) });
  }

  if (!isConfigured()) {
    // Mock mode: persistir intent pero NO timbrar
    const mockId = 'MOCK-' + Date.now();
    await persistInvoice(supabaseRequest, tenantId, body, payload, { id: mockId, uuid: mockId, mock: true });
    return sendJson(res, 200, { ok: true, mock: true, invoice_id: mockId, note: 'Plataforma sin Facturama configurado.' });
  }

  // Endpoint Multiemisor: /api/2/cfdis crea CFDI con el CSD asociado al RFC del Issuer.
  const r = await fapi('/api/2/cfdis', { method: 'POST', body: payload });
  if (!r.ok) {
    const detail = r.body && (r.body.Message || r.body.message) || JSON.stringify(r.body || {}).slice(0, 500);
    return sendJson(res, 502, { ok: false, error: 'facturama_rejected', http: r.status, detail });
  }
  const fid = r.body && (r.body.Id || r.body.id);
  const uuid = (r.body && r.body.Complement && r.body.Complement.TaxStamp && r.body.Complement.TaxStamp.Uuid)
            || (r.body && r.body.Uuid) || null;
  await persistInvoice(supabaseRequest, tenantId, body, payload, { id: fid, uuid });
  return sendJson(res, 200, {
    ok: true, invoice_id: fid, uuid: uuid,
    pdf_url: '/api/facturama/invoice/' + encodeURIComponent(fid) + '?format=pdf',
    xml_url: '/api/facturama/invoice/' + encodeURIComponent(fid) + '?format=xml'
  });
}

async function persistInvoice(supabaseRequest, tenantId, body, payload, result) {
  try {
    await supabaseRequest('POST', '/cfdi_invoices', {
      tenant_id: tenantId,
      ticket_id: body.ticket_id || null,
      customer_rfc: payload.Receiver.Rfc,
      customer_name: payload.Receiver.Name,
      customer_email: body.customer_email || null,
      series: payload.Serie,
      folio: payload.Folio,
      uuid_sat: result.uuid || null,
      total: payload.Items.reduce((s, it) => s + Number(it.Total || 0), 0),
      facturama_id: result.id || null,
      status: result.mock ? 'mock' : 'issued',
      issued_at: new Date().toISOString()
    });
  } catch (_) { /* tabla pendiente, ignorar */ }
}

async function handleListInvoices(req, res, ctx) {
  const { sendJson, supabaseRequest, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'no_auth' });
  const tenantId = user.tenant_id || user.company_id;
  try {
    const rows = await supabaseRequest('GET',
      '/cfdi_invoices?tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&select=id,ticket_id,customer_rfc,customer_name,series,folio,uuid_sat,total,status,issued_at' +
      '&order=issued_at.desc&limit=200');
    sendJson(res, 200, { ok: true, items: Array.isArray(rows) ? rows : [] });
  } catch (_) { sendJson(res, 200, { ok: true, items: [], note: 'tabla_pendiente' }); }
}

async function handleDownloadInvoice(req, res, ctx, parsedUrl, fid) {
  const { sendJson, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'no_auth' });
  const format = (parsedUrl.query && parsedUrl.query.format) || 'pdf';
  if (!['pdf', 'xml', 'html'].includes(format)) return sendJson(res, 400, { ok: false, error: 'bad_format' });
  if (!isConfigured()) return sendJson(res, 503, { ok: false, error: 'facturama_not_configured' });
  const r = await fapi('/Cfdi/' + format + '/issuedLite/' + encodeURIComponent(fid));
  if (!r.ok) return sendJson(res, 502, { ok: false, error: 'download_failed', http: r.status });
  // Facturama devuelve { Content: base64, ContentEncoding, ContentType }
  const b64 = r.body && (r.body.Content || r.body.content);
  if (!b64) return sendJson(res, 502, { ok: false, error: 'empty_response' });
  const buf = Buffer.from(b64, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', format === 'xml' ? 'application/xml' : (format === 'pdf' ? 'application/pdf' : 'text/html'));
  res.setHeader('Content-Disposition', 'attachment; filename="' + fid + '.' + format + '"');
  res.end(buf);
}

async function handleCancel(req, res, ctx, fid) {
  const { sendJson, supabaseRequest, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'no_auth' });
  const tenantId = user.tenant_id || user.company_id;
  const body = await readBody(req);
  const motive = String(body.motive || '02'); // 02 = comprobantes emitidos con errores sin relacion
  if (!isConfigured()) return sendJson(res, 503, { ok: false, error: 'facturama_not_configured' });
  const r = await fapi('/api/cfdi/' + encodeURIComponent(fid) + '?type=issuedLite&motive=' + motive, { method: 'DELETE' });
  if (!r.ok) return sendJson(res, 502, { ok: false, error: 'cancel_failed', http: r.status, detail: r.body });
  try {
    await supabaseRequest('PATCH',
      '/cfdi_invoices?facturama_id=eq.' + encodeURIComponent(fid) +
      '&tenant_id=eq.' + encodeURIComponent(tenantId),
      { status: 'cancelled', cancelled_at: new Date().toISOString() });
  } catch (_) {}
  sendJson(res, 200, { ok: true, cancelled: true });
}

/* ---------- Auto-factura pública (sin auth) ----------
 * 2026-05 audit B-11:
 *  (a) Rate-limit por IP (10/15min) para impedir enumeration de tickets.
 *  (b) El cliente debe demostrar conocimiento del ticket: requiere también
 *      ?email=<email del ticket> O ?total=<monto exacto> en el lookup. Si
 *      falla la verificación, devolvemos 404 genérico (no leak de existencia).
 */
const __autofacturaRateBuckets = new Map();
function __autofacturaRateLimit(ip, max, windowMs) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  let entry = __autofacturaRateBuckets.get(key);
  if (!entry || (now - entry.start) > windowMs) {
    entry = { start: now, count: 0 };
    __autofacturaRateBuckets.set(key, entry);
  }
  entry.count++;
  if (__autofacturaRateBuckets.size > 5000) {
    // GC simple
    for (const [k, v] of __autofacturaRateBuckets.entries()) {
      if ((now - v.start) > windowMs) __autofacturaRateBuckets.delete(k);
    }
  }
  return entry.count <= max;
}
function __ipOf(req) {
  return (req.headers && (req.headers['x-forwarded-for'] || '').split(',')[0].trim())
    || (req.connection && req.connection.remoteAddress) || 'unknown';
}

async function handleAutofacturaLookup(req, res, ctx, parsedUrl) {
  const { sendJson, supabaseRequest } = ctx;
  // Rate-limit estricto: 10 lookups por IP cada 15 min
  if (!__autofacturaRateLimit(__ipOf(req), 10, 15 * 60 * 1000)) {
    return sendJson(res, 429, { ok: false, error: 'rate_limited', retry_after_seconds: 900 });
  }
  const q = parsedUrl.query || {};
  const tenantId = String(q.tenant || '').slice(0, 80);
  const ticketId = String(q.ticket || '').slice(0, 80);
  // El usuario DEBE proveer al menos uno de: email O total (monto exacto)
  // como prueba de propiedad del ticket. Sin esto el endpoint es enumerable.
  const verifyEmail = String(q.email || '').toLowerCase().trim();
  const verifyTotal = q.total != null ? String(q.total).trim() : '';
  if (!tenantId || !ticketId) return sendJson(res, 400, { ok: false, error: 'missing_params', need: ['tenant', 'ticket'] });
  if (!verifyEmail && !verifyTotal) {
    return sendJson(res, 400, { ok: false, error: 'verification_required',
      message: 'Provee email o total del ticket para verificar propiedad.', need_one_of: ['email', 'total'] });
  }
  try {
    // 1. ¿El ticket pertenece a ese tenant?
    const sales = await supabaseRequest('GET',
      '/pos_sales?tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&id=eq.' + encodeURIComponent(ticketId) +
      '&select=id,total,subtotal,tax,date,items,customer_email&limit=1');
    if (!Array.isArray(sales) || !sales[0]) return sendJson(res, 404, { ok: false, error: 'ticket_not_found' });
    const sale = sales[0];

    // 1b. Verificación de propiedad: email O total exacto deben coincidir.
    let owns = false;
    if (verifyEmail && sale.customer_email && String(sale.customer_email).toLowerCase().trim() === verifyEmail) {
      owns = true;
    }
    if (!owns && verifyTotal) {
      const expected = Math.round(Number(sale.total || 0) * 100);
      const got = Math.round(Number(verifyTotal) * 100);
      if (expected > 0 && expected === got) owns = true;
    }
    if (!owns) {
      // 404 genérico — no revelamos que el ticket existe pero la verificación falla
      return sendJson(res, 404, { ok: false, error: 'ticket_not_found' });
    }

    // 2. ¿Ya tiene CFDI emitido?
    const existing = await supabaseRequest('GET',
      '/cfdi_invoices?ticket_id=eq.' + encodeURIComponent(ticketId) +
      '&tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&status=neq.cancelled&select=id,uuid_sat,facturama_id&limit=1').catch(() => []);
    if (Array.isArray(existing) && existing[0]) {
      return sendJson(res, 409, { ok: false, error: 'already_invoiced', uuid_sat: existing[0].uuid_sat });
    }

    // 3. ¿El tenant tiene CSD activo?
    const cred = await getTenantCreds(supabaseRequest, tenantId);
    if (!cred || !cred.active) return sendJson(res, 503, { ok: false, error: 'tenant_not_onboarded' });

    sendJson(res, 200, {
      ok: true,
      ticket: { id: sale.id, total: sale.total, subtotal: sale.subtotal, tax: sale.tax, date: sale.date },
      issuer: { rfc: cred.rfc, legal_name: cred.legal_name }
    });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: 'lookup_failed' });
  }
}

async function handleAutofacturaIssue(req, res, ctx) {
  const { sendJson, supabaseRequest } = ctx;
  // 2026-05 audit B-11: rate-limit por IP (5 emisiones por hora)
  if (!__autofacturaRateLimit('issue:' + __ipOf(req), 5, 60 * 60 * 1000)) {
    return sendJson(res, 429, { ok: false, error: 'rate_limited', retry_after_seconds: 3600 });
  }
  const body = await readBody(req);
  // body: { tenant_id, ticket_id, customer_rfc, customer_name, customer_zip,
  //         customer_cfdi_use, customer_fiscal_regime, customer_email }
  const required = ['tenant_id', 'ticket_id', 'customer_rfc', 'customer_name', 'customer_zip', 'customer_email'];
  for (const k of required) {
    if (!body[k]) return sendJson(res, 400, { ok: false, error: 'missing_field', field: k });
  }
  // El customer_email debe coincidir con el del ticket (o el lookup previo pasó la verificación
  // por total y el flow lo trae embebido). Validamos de nuevo aquí.
  // Lookup ticket → reusar items reales
  let sale;
  try {
    const sales = await supabaseRequest('GET',
      '/pos_sales?tenant_id=eq.' + encodeURIComponent(body.tenant_id) +
      '&id=eq.' + encodeURIComponent(body.ticket_id) +
      '&select=*&limit=1');
    sale = Array.isArray(sales) && sales[0];
  } catch (_) {}
  if (!sale) return sendJson(res, 404, { ok: false, error: 'ticket_not_found' });

  // 2026-05 audit B-11: validar propiedad antes de emitir CFDI ajeno.
  const claimEmail = String(body.customer_email || '').toLowerCase().trim();
  const ticketEmail = sale.customer_email ? String(sale.customer_email).toLowerCase().trim() : '';
  const claimTotal = body.expected_total != null ? Math.round(Number(body.expected_total) * 100) : null;
  const realTotal = Math.round(Number(sale.total || 0) * 100);
  let proven = false;
  if (ticketEmail && claimEmail === ticketEmail) proven = true;
  if (!proven && claimTotal != null && realTotal > 0 && claimTotal === realTotal) proven = true;
  if (!proven) {
    return sendJson(res, 403, { ok: false, error: 'ownership_verification_failed',
      message: 'El correo o el total no coinciden con el ticket. Verifica los datos.' });
  }

  // Construir items desde el ticket (sin marcar productos individuales para no exponer mucho)
  const items = (sale.items || [{ description: 'Venta general', quantity: 1, unit_price: sale.subtotal || sale.total }]).map(it => ({
    description: it.description || it.name || 'Producto',
    quantity: it.quantity || it.qty || 1,
    unit_price: it.unit_price || it.price || 0,
    product_code: it.product_code || '01010101',
    unit_code: it.unit_code || 'H87'
  }));
  const issueBody = {
    ticket_id: body.ticket_id,
    customer_rfc: body.customer_rfc,
    customer_name: body.customer_name,
    customer_zip: body.customer_zip,
    customer_email: body.customer_email,
    customer_fiscal_regime: body.customer_fiscal_regime || '616',
    cfdi_use: body.customer_cfdi_use || 'G03',
    items
  };

  // Forzar tenantId = body.tenant_id (no del JWT, porque público)
  let payload;
  try { payload = await buildIssuePayload(supabaseRequest, body.tenant_id, issueBody); }
  catch (e) {
    return sendJson(res, 503, { ok: false, error: 'tenant_not_onboarded' });
  }

  if (!isConfigured()) {
    return sendJson(res, 503, { ok: false, error: 'facturama_not_configured' });
  }
  const r = await fapi('/api/2/cfdis', { method: 'POST', body: payload });
  if (!r.ok) {
    const detail = r.body && (r.body.Message || r.body.message) || ('http_' + r.status);
    return sendJson(res, 502, { ok: false, error: 'facturama_rejected', detail });
  }
  const fid = r.body && (r.body.Id || r.body.id);
  const uuid = (r.body && r.body.Complement && r.body.Complement.TaxStamp && r.body.Complement.TaxStamp.Uuid) || null;
  await persistInvoice(supabaseRequest, body.tenant_id, issueBody, payload, { id: fid, uuid });
  sendJson(res, 200, { ok: true, uuid_sat: uuid, invoice_id: fid });
}

/* ---------- Plataforma factura a tenant (uso interno) ---------- */

async function handlePlatformIssue(req, res, ctx) {
  const { sendJson, supabaseRequest, getAuthUser } = ctx;
  const user = await getAuthUser(req);
  const role = String((user && (user.role || user.rol)) || '').toLowerCase();
  if (role !== 'superadmin' && role !== 'platform_owner') {
    return sendJson(res, 403, { ok: false, error: 'forbidden' });
  }
  if (!isConfigured()) return sendJson(res, 503, { ok: false, error: 'facturama_not_configured' });
  const body = await readBody(req);
  // Issuer = la PLATAFORMA. Necesita PLATFORM_RFC + PLATFORM_LEGAL_NAME + PLATFORM_FISCAL_REGIME + PLATFORM_ZIP env vars
  const issuer = {
    Rfc: (process.env.PLATFORM_RFC || '').trim(),
    Name: (process.env.PLATFORM_LEGAL_NAME || '').trim(),
    FiscalRegime: (process.env.PLATFORM_FISCAL_REGIME || '601').trim()
  };
  const expeditionPlace = (process.env.PLATFORM_ZIP || '').trim();
  if (!issuer.Rfc || !issuer.Name || !expeditionPlace) {
    return sendJson(res, 503, { ok: false, error: 'platform_issuer_not_configured', need: ['PLATFORM_RFC', 'PLATFORM_LEGAL_NAME', 'PLATFORM_ZIP'] });
  }
  const items = (body.items || []).map(it => ({
    ProductCode: String(it.product_code || '81111500'), // Servicios de informática
    Description: String(it.description || 'Suscripción Volvix POS').slice(0, 500),
    UnitCode: String(it.unit_code || 'E48'),
    Unit: 'Servicio',
    Quantity: Number(it.quantity || 1),
    UnitPrice: Number(it.unit_price || 0),
    Subtotal: Number(it.subtotal || it.unit_price || 0),
    TaxObject: '02',
    Taxes: [{ Name: 'IVA', Base: Number(it.subtotal || it.unit_price || 0), Rate: 0.16, IsRetention: false, Total: Number((it.subtotal || it.unit_price || 0) * 0.16) }],
    Total: Number(it.subtotal || it.unit_price || 0) * 1.16
  }));
  const payload = {
    Serie: 'PLAT',
    CfdiType: 'I',
    NameId: 1,
    PaymentForm: String(body.payment_form || '03'),
    PaymentMethod: String(body.payment_method || 'PUE'),
    Currency: 'MXN',
    ExpeditionPlace: expeditionPlace,
    Issuer: issuer,
    Receiver: {
      Rfc: String(body.customer_rfc).toUpperCase(),
      Name: String(body.customer_name),
      CfdiUse: 'G03',
      FiscalRegime: String(body.customer_fiscal_regime || '601'),
      TaxZipCode: String(body.customer_zip)
    },
    Items: items
  };
  const r = await fapi('/api/2/cfdis', { method: 'POST', body: payload });
  if (!r.ok) return sendJson(res, 502, { ok: false, error: 'facturama_rejected', detail: r.body });
  sendJson(res, 200, { ok: true, invoice: r.body });
}

/* ---------- main router ---------- */

module.exports = async function handleFacturama(req, res, parsedUrl, ctx) {
  const path = (parsedUrl && parsedUrl.pathname) || '';
  const method = req.method || 'GET';
  if (!path.startsWith('/api/facturama') && !path.startsWith('/api/public/autofactura')) return false;
  if (!ctx || typeof ctx.supabaseRequest !== 'function') return false;

  // Adaptador sendJson(res, status, body) → matches the shape of other dispatchers
  if (typeof ctx.sendJson !== 'function') {
    ctx = Object.assign({}, ctx, {
      sendJson: function (r, statusOrBody, bodyOrStatus) {
        if (typeof statusOrBody === 'number') {
          r.statusCode = statusOrBody;
          r.setHeader('Content-Type', 'application/json; charset=utf-8');
          r.end(JSON.stringify(bodyOrStatus || {}));
        } else {
          r.statusCode = bodyOrStatus || 200;
          r.setHeader('Content-Type', 'application/json; charset=utf-8');
          r.end(JSON.stringify(statusOrBody || {}));
        }
      }
    });
  }

  // Rutas
  if (method === 'POST' && path === '/api/facturama/onboard')          return handleOnboard(req, res, ctx),         true;
  if (method === 'GET'  && path === '/api/facturama/credentials')      return handleCredentials(req, res, ctx),     true;
  if (method === 'POST' && path === '/api/facturama/issue')            return handleIssue(req, res, ctx),           true;
  if (method === 'GET'  && path === '/api/facturama/invoices')         return handleListInvoices(req, res, ctx),    true;
  if (method === 'POST' && path === '/api/facturama/platform/issue')   return handlePlatformIssue(req, res, ctx),   true;

  let m;
  m = path.match(/^\/api\/facturama\/cancel\/([^/]+)$/);
  if (method === 'POST' && m) return handleCancel(req, res, ctx, decodeURIComponent(m[1])), true;
  m = path.match(/^\/api\/facturama\/invoice\/([^/]+)$/);
  if (method === 'GET' && m) return handleDownloadInvoice(req, res, ctx, parsedUrl, decodeURIComponent(m[1])), true;

  // Públicos (autofactura)
  if (method === 'GET'  && path === '/api/public/autofactura/lookup')  return handleAutofacturaLookup(req, res, ctx, parsedUrl), true;
  if (method === 'POST' && path === '/api/public/autofactura/issue')   return handleAutofacturaIssue(req, res, ctx),  true;

  return false;
};
