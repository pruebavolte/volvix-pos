/**
 * R17 — QR PAYMENTS (CoDi MX / SPEI MX / PIX BR)
 * Se inyecta en el objeto `handlers` de api/index.js.
 *
 * Uso (desde index.js, una sola línea):
 *   require('./qr-payments').register({
 *     handlers, crypto,
 *     supabaseRequest, requireAuth, readBody,
 *     sendJSON, sendError, isUuid,
 *   });
 *
 * Endpoints provistos:
 *   POST /api/qr/codi/generate         body: {amount, sale_id?}
 *   POST /api/qr/spei/generate         body: {amount, sale_id?}
 *   POST /api/qr/pix/generate          body: {amount, sale_id?}
 *   GET  /api/qr/payments/:id/status   polling (id = uuid del qr_payment o sale_id)
 *   POST /api/qr/webhook               header X-QR-Webhook-Secret + body {ref, status}
 *
 * Integración bancaria: si las env vars (CODI_BANK_API_KEY, SPEI_CLABE, PIX_KEY)
 * están vacías, retorna mock con `placeholder: true` — UX sigue funcionando.
 */
'use strict';

function register(deps) {
  const {
    handlers, crypto,
    supabaseRequest, requireAuth, readBody,
    sendJSON, sendError, isUuid,
  } = deps;

  const CODI_MERCHANT_ID   = (process.env.CODI_MERCHANT_ID || '').trim();
  const CODI_BANK_API_KEY  = (process.env.CODI_BANK_API_KEY || '').trim();
  const SPEI_CLABE         = (process.env.SPEI_CLABE || '').trim();
  const SPEI_BENEFICIARY   = (process.env.SPEI_BENEFICIARY || 'VOLVIX POS').trim();
  const PIX_KEY            = (process.env.PIX_KEY || '').trim();
  const PIX_MERCHANT_NAME  = (process.env.PIX_MERCHANT_NAME || 'VOLVIX').trim();
  const PIX_MERCHANT_CITY  = (process.env.PIX_MERCHANT_CITY || 'SAO PAULO').trim();
  const QR_WEBHOOK_SECRET  = (process.env.QR_WEBHOOK_SECRET || '').trim();

  // ───────── QR SVG generator (placeholder visual estable basado en hash) ─────────
  // Para producción real, reemplazar con `qrcode` npm package que sigue ISO/IEC 18004.
  function qrSvgBase64(text) {
    const sz = 25;
    const bits = [];
    const h = crypto.createHash('sha256').update(String(text)).digest();
    for (let i = 0; i < sz * sz; i++) bits.push((h[i % h.length] >> (i % 8)) & 1);
    let rects = '';
    const cell = 8;
    for (let y = 0; y < sz; y++) {
      for (let x = 0; x < sz; x++) {
        if (bits[y * sz + x]) {
          rects += `<rect x="${x*cell}" y="${y*cell}" width="${cell}" height="${cell}" fill="#000"/>`;
        }
      }
    }
    const w = sz * cell;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">` +
      `<rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  }

  // ───────── EMV helpers (PIX BR-Code) ─────────
  function crc16ccitt(s) {
    let crc = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  function emvTLV(id, value) {
    const v = String(value || '');
    return id + String(v.length).padStart(2, '0') + v;
  }

  // ───────── Builders por tipo ─────────
  function buildCodiString({ amount, sale_id, ref }) {
    const merchant = CODI_MERCHANT_ID || 'PLACEHOLDER';
    const a = Number(amount).toFixed(2);
    return `CoDi|v=1.0|bid=${merchant}|amt=${a}|cur=MXN|ref=${ref}|sid=${sale_id || ''}`;
  }
  function buildSpeiString({ amount, sale_id, ref }) {
    const clabe = SPEI_CLABE || '000000000000000000';
    const a = Number(amount).toFixed(2);
    return `SPEI|clabe=${clabe}|ben=${SPEI_BENEFICIARY}|amt=${a}|cur=MXN|ref=${ref}|sid=${sale_id || ''}`;
  }
  function buildPixString({ amount, ref }) {
    const key = PIX_KEY || 'placeholder@volvix.com';
    const a = Number(amount).toFixed(2);
    const merch = (PIX_MERCHANT_NAME || 'VOLVIX').slice(0, 25);
    const city  = (PIX_MERCHANT_CITY || 'SAO PAULO').slice(0, 15);
    const txid  = String(ref || 'VOLVIX').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || 'VOLVIX';
    const gui = emvTLV('00', 'br.gov.bcb.pix') + emvTLV('01', key);
    const merchantAcc = emvTLV('26', gui);
    const addData = emvTLV('05', txid);
    let payload =
      emvTLV('00', '01') +              // Payload Format Indicator
      emvTLV('01', '12') +              // Point of Initiation (12 = static reusable)
      merchantAcc +
      emvTLV('52', '0000') +            // Merchant Category Code
      emvTLV('53', '986') +             // Currency BRL (ISO 4217)
      emvTLV('54', a) +                 // Amount
      emvTLV('58', 'BR') +              // Country
      emvTLV('59', merch) +             // Merchant name
      emvTLV('60', city)  +             // Merchant city
      emvTLV('62', addData);
    payload += '6304';                  // CRC tag + length
    return payload + crc16ccitt(payload);
  }

  async function persistQrPayment(row) {
    try {
      const inserted = await supabaseRequest('POST', '/qr_payments', row);
      return Array.isArray(inserted) ? inserted[0] : inserted;
    } catch (e) {
      // Tabla puede no existir aún → mock para no romper UX
      return Object.assign(
        { id: 'mock-' + Date.now(), persisted: false, warning: 'qr_payments_table_missing' },
        row
      );
    }
  }

  function validateAmount(body) {
    const amount = Number(body && body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: { error: 'amount_invalid', message: 'amount debe ser > 0' } };
    }
    return { amount, sale_id: (body && body.sale_id) || null };
  }

  // ───────── POST /api/qr/codi/generate ─────────
  handlers['POST /api/qr/codi/generate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const v = validateAmount(body);
      if (v.error) return sendJSON(res, v.error, 400);
      const ref = 'CDI' + Date.now().toString(36).toUpperCase();
      const qrData = buildCodiString({ amount: v.amount, sale_id: v.sale_id, ref });
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min CoDi spec
      const saved = await persistQrPayment({
        sale_id: v.sale_id, type: 'codi', amount: v.amount, qr_data: qrData,
        status: 'pending', expires_at: expires,
      });
      sendJSON(res, {
        ok: true, id: saved.id, type: 'codi',
        qr_string: qrData, qr_image: qrSvgBase64(qrData),
        amount: v.amount, currency: 'MXN', ref, expires_at: expires,
        placeholder: !CODI_BANK_API_KEY,
        bank_integration: CODI_BANK_API_KEY ? 'configured' : 'mock',
      });
    } catch (err) { sendError(res, err); }
  });

  // ───────── POST /api/qr/spei/generate ─────────
  handlers['POST /api/qr/spei/generate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const v = validateAmount(body);
      if (v.error) return sendJSON(res, v.error, 400);
      const ref = 'SPEI' + Date.now().toString(36).toUpperCase();
      const qrData = buildSpeiString({ amount: v.amount, sale_id: v.sale_id, ref });
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const saved = await persistQrPayment({
        sale_id: v.sale_id, type: 'spei', amount: v.amount, qr_data: qrData,
        status: 'pending', expires_at: expires,
      });
      sendJSON(res, {
        ok: true, id: saved.id, type: 'spei',
        qr_string: qrData, qr_image: qrSvgBase64(qrData),
        clabe: SPEI_CLABE || null, beneficiary: SPEI_BENEFICIARY,
        amount: v.amount, currency: 'MXN', ref, expires_at: expires,
        placeholder: !SPEI_CLABE,
      });
    } catch (err) { sendError(res, err); }
  });

  // ───────── POST /api/qr/pix/generate ─────────
  handlers['POST /api/qr/pix/generate'] = requireAuth(async (req, res) => {
    try {
      const body = await readBody(req);
      const v = validateAmount(body);
      if (v.error) return sendJSON(res, v.error, 400);
      const ref = 'PIX' + Date.now().toString(36).toUpperCase();
      const qrData = buildPixString({ amount: v.amount, ref });
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const saved = await persistQrPayment({
        sale_id: v.sale_id, type: 'pix', amount: v.amount, qr_data: qrData,
        status: 'pending', expires_at: expires,
      });
      sendJSON(res, {
        ok: true, id: saved.id, type: 'pix',
        qr_string: qrData, qr_image: qrSvgBase64(qrData),
        pix_key: PIX_KEY || null,
        amount: v.amount, currency: 'BRL', ref, expires_at: expires,
        placeholder: !PIX_KEY,
      });
    } catch (err) { sendError(res, err); }
  });

  // ───────── GET /api/qr/payments/:id/status ─────────
  handlers['GET /api/qr/payments/:id/status'] = requireAuth(async (req, res, params) => {
    try {
      const id = String((params && params.id) || '');
      if (!id) return sendJSON(res, { error: 'id_required' }, 400);

      let rows;
      try {
        if (typeof isUuid === 'function' && isUuid(id)) {
          rows = await supabaseRequest('GET', `/qr_payments?id=eq.${id}&select=*&limit=1`);
        } else {
          rows = await supabaseRequest('GET',
            `/qr_payments?sale_id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        }
      } catch (_) {
        return sendJSON(res, { id, status: 'pending', warning: 'qr_payments_table_missing' });
      }

      if (!rows || !rows.length) {
        return sendJSON(res, { error: 'not_found', resource: 'qr_payment', id }, 404);
      }
      const r = rows[0];
      // Auto-expirar si pasó el TTL y sigue pending
      if (r.expires_at && new Date(r.expires_at).getTime() < Date.now() && r.status === 'pending') {
        try { await supabaseRequest('PATCH', `/qr_payments?id=eq.${r.id}`, { status: 'expired' }); } catch (_) {}
        r.status = 'expired';
      }
      sendJSON(res, {
        id: r.id, sale_id: r.sale_id, type: r.type, amount: r.amount,
        status: r.status, paid_at: r.paid_at || null, expires_at: r.expires_at,
      });
    } catch (err) { sendError(res, err); }
  });

  // ───────── POST /api/qr/webhook ─────────
  // Endpoint para que el banco/PSP confirme pago. NO requiere JWT (usa secret header).
  handlers['POST /api/qr/webhook'] = async (req, res) => {
    try {
      const provided = String((req.headers['x-qr-webhook-secret'] || '')).trim();
      if (!QR_WEBHOOK_SECRET || provided !== QR_WEBHOOK_SECRET) {
        return sendJSON(res, { error: 'unauthorized' }, 401);
      }
      const body = await readBody(req);
      const ref = String((body && body.ref) || '').trim();
      const status = String((body && body.status) || 'paid').trim();
      if (!ref) return sendJSON(res, { error: 'ref_required' }, 400);

      try {
        await supabaseRequest('PATCH',
          `/qr_payments?qr_data=ilike.*${encodeURIComponent('ref=' + ref)}*`,
          { status, paid_at: status === 'paid' ? new Date().toISOString() : null });
      } catch (_) {}
      sendJSON(res, { received: true, ref, status });
    } catch (err) { sendError(res, err); }
  };
}

module.exports = { register };
