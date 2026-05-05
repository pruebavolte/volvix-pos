'use strict';

/**
 * labels.js — Volvix POS batch label printing.
 *
 * Adds the missing batch endpoint that complements the existing
 * /api/label-templates CRUD (in api/index.js) and the per-job
 * /api/printer/raw audit endpoint.
 *
 *   POST /api/labels/print
 *     body: {
 *       products:   [{ sku, name, price, qty, barcode? }, ...],
 *       format:     'zpl' | 'escpos' | 'pdf' | 'html'   (default 'pdf'),
 *       template_id?: <uuid>     // optional label_templates row
 *     }
 *     - 'zpl'    → text/plain ZPL II commands (Zebra)
 *     - 'escpos' → application/json with base64 ESC/POS payload (thermal)
 *     - 'pdf'    → text/html auto-print (uses pdf-export.js shell pattern)
 *     - 'html'   → text/html (no auto-print)
 *
 *   GET  /api/labels/preview?format=zpl&sku=...&name=...&price=...&qty=1
 *     same encoders, single product, useful para debug del bridge.
 *
 * Exported: async function handleLabels(req, res, parsedUrl, ctx)
 *   ctx = { supabaseRequest, getAuthUser, sendJson, IS_PROD }
 *   (mismo shape que pasa api/index.js a los demás módulos)
 */

const url = require('url');

// ---------- helpers ----------

function send(_ctx, res, status, body) {
  // NB: api/index.js' sendJSON signature is (res, data, status) — different from
  // the (res, status, body) shape used by some sibling modules. To stay correct
  // regardless of ctx wiring, write the response directly here.
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendText(res, status, contentType, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType + '; charset=utf-8');
  res.end(text);
}

async function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1024 * 1024) { buf = ''; req.destroy(); } });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtMXN(n) {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
    }).format(v);
  } catch { return '$' + v.toFixed(2); }
}

function asciiClean(s) {
  return String(s == null ? '' : s).replace(/[^\x20-\x7E]/g, '').slice(0, 40);
}

function clampInt(n, min, max, def) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

function normalizeProducts(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const p of arr.slice(0, 500)) {
    if (!p || typeof p !== 'object') continue;
    const sku = asciiClean(p.sku || p.code || p.barcode || '');
    const name = String(p.name || p.title || '').slice(0, 80);
    const price = Number(p.price);
    const qty = clampInt(p.qty || p.quantity || 1, 1, 1000, 1);
    const barcode = asciiClean(p.barcode || p.sku || p.code || '');
    if (!sku && !name) continue;
    out.push({ sku, name, price: Number.isFinite(price) ? price : null, qty, barcode });
  }
  return out;
}

// ---------- encoders ----------

/**
 * ZPL II per-label block. Caller repeats per qty.
 * Default canvas ~ 50mm x 30mm @ 8 dpmm = 400 x 240 dots.
 */
function buildZpl(products) {
  const out = [];
  for (const p of products) {
    for (let i = 0; i < p.qty; i++) {
      const lines = [];
      lines.push('^XA');                                     // start
      lines.push('^PW400^LL240^LH0,0');                      // width/length/origin
      lines.push('^CI28');                                    // utf-8
      lines.push('^FO20,15^A0N,28,28^FD' + zplEscape(p.name || '').slice(0, 30) + '^FS');
      if (p.price !== null && p.price !== undefined) {
        lines.push('^FO20,55^A0N,38,38^FD' + zplEscape(fmtMXN(p.price)) + '^FS');
      }
      if (p.barcode) {
        lines.push('^FO20,110^BY2,3,60');
        lines.push('^BCN,60,Y,N,N^FD' + zplEscape(p.barcode) + '^FS');
      } else if (p.sku) {
        lines.push('^FO20,180^A0N,20,20^FDSKU: ' + zplEscape(p.sku) + '^FS');
      }
      lines.push('^XZ');                                      // end
      out.push(lines.join('\n'));
    }
  }
  return out.join('\n');
}

function zplEscape(s) {
  // Caret (^), tilde (~) y delimitador (,) son tokens ZPL.
  return String(s == null ? '' : s).replace(/[\^~]/g, ' ');
}

/**
 * ESC/POS para impresoras térmicas tipo Epson/Star.
 * Devuelve buffer crudo en string (luego se base64 en el response).
 */
function buildEscPos(products) {
  const ESC = '\x1B', GS = '\x1D';
  const init = ESC + '@';
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const bold = ESC + 'E' + '\x01';
  const noBold = ESC + 'E' + '\x00';
  const dblOn = GS + '!' + '\x11';
  const dblOff = GS + '!' + '\x00';
  const cut = GS + 'V' + '\x01';
  const lf = '\n';

  let raw = init;
  for (const p of products) {
    for (let i = 0; i < p.qty; i++) {
      raw += center + bold + dblOn + (p.name || '').slice(0, 32) + lf + dblOff + noBold;
      if (p.price !== null && p.price !== undefined) {
        raw += center + bold + fmtMXN(p.price) + lf + noBold;
      }
      if (p.barcode) {
        const v = asciiClean(p.barcode).slice(0, 32);
        raw += left + GS + 'h' + '\x50';                    // height 80 dots
        raw += GS + 'w' + '\x02';                           // width module 2
        raw += GS + 'k' + '\x49' + String.fromCharCode(v.length) + v + lf; // CODE128
      } else if (p.sku) {
        raw += left + 'SKU: ' + p.sku + lf;
      }
      raw += lf;
    }
  }
  raw += lf + cut;
  return raw;
}

function buildHtml(products, autoPrint) {
  const cards = [];
  for (const p of products) {
    for (let i = 0; i < p.qty; i++) {
      cards.push(
        '<div class="lbl">' +
          '<div class="name">' + esc(p.name || '') + '</div>' +
          (p.price !== null && p.price !== undefined ? '<div class="price">' + esc(fmtMXN(p.price)) + '</div>' : '') +
          (p.barcode
            ? '<div class="bc">*' + esc(p.barcode) + '*</div><div class="bcnum">' + esc(p.barcode) + '</div>'
            : (p.sku ? '<div class="sku">SKU: ' + esc(p.sku) + '</div>' : '')) +
        '</div>'
      );
    }
  }
  const printScript = autoPrint
    ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});</script>'
    : '';
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<title>Etiquetas Volvix POS</title>',
    '<style>',
    '@page{size:50mm 30mm;margin:0;}',
    'body{margin:0;padding:0;font-family:system-ui,sans-serif;}',
    '.lbl{width:50mm;height:30mm;padding:1mm 2mm;box-sizing:border-box;page-break-after:always;border-bottom:1px dashed #ccc;}',
    '.lbl:last-child{page-break-after:auto;border-bottom:none;}',
    '.name{font-size:10pt;font-weight:700;line-height:1.1;overflow:hidden;}',
    '.price{font-size:14pt;font-weight:800;margin-top:1mm;}',
    '.bc{font-family:"Libre Barcode 128","Courier New",monospace;font-size:24pt;letter-spacing:1px;line-height:1;margin-top:1mm;}',
    '.bcnum{font-size:7pt;letter-spacing:1px;}',
    '.sku{font-size:8pt;color:#444;margin-top:1mm;}',
    '@media print{body{background:#fff;}.lbl{border-bottom:none;}}',
    '</style></head><body>',
    cards.join('\n') || '<p style="padding:1cm;">Sin productos</p>',
    printScript,
    '</body></html>',
  ].join('\n');
}

// ---------- routes ----------

async function handlePrint(ctx, req, res) {
  const user = ctx && typeof ctx.getAuthUser === 'function' ? ctx.getAuthUser(req) : (req.user || null);
  if (!user) return send(ctx, res, 401, { error: 'unauthorized' });

  const body = await readJsonBody(req);
  const products = normalizeProducts(body && body.products);
  if (!products.length) return send(ctx, res, 400, { error: 'products[] requerido' });

  const format = String(body.format || 'pdf').toLowerCase();

  // Optional: enrich payload with template metadata if template_id supplied
  if (body.template_id && ctx && typeof ctx.supabaseRequest === 'function') {
    try {
      const rows = await ctx.supabaseRequest(
        'GET',
        '/label_templates?id=eq.' + encodeURIComponent(body.template_id) +
          '&deleted_at=is.null&select=id,tenant_id,canvas_w,canvas_h'
      );
      if (!rows || !rows.length || (rows[0].tenant_id !== user.tenant_id && user.role !== 'superadmin')) {
        return send(ctx, res, 404, { error: 'template_not_found' });
      }
    } catch (_) { /* ignore */ }
  }

  if (format === 'zpl') {
    const zpl = buildZpl(products);
    return sendText(res, 200, 'text/plain', zpl);
  }
  if (format === 'escpos') {
    const raw = buildEscPos(products);
    const b64 = Buffer.from(raw, 'binary').toString('base64');
    return send(ctx, res, 200, {
      ok: true,
      format: 'escpos',
      encoding: 'base64',
      payload: b64,
      length: raw.length,
      hint: 'POST a /api/printer/raw o al Volvix Print Bridge en 127.0.0.1:9101',
    });
  }
  if (format === 'html') {
    return sendText(res, 200, 'text/html', buildHtml(products, false));
  }
  // default: pdf (auto-print HTML, mismo patrón que pdf-export.js)
  return sendText(res, 200, 'text/html', buildHtml(products, true));
}

async function handlePreview(ctx, req, res, parsedUrl) {
  const q = (parsedUrl && parsedUrl.query) || url.parse(req.url || '', true).query || {};
  const products = normalizeProducts([{
    sku: q.sku, name: q.name, price: q.price, qty: q.qty || 1, barcode: q.barcode || q.sku,
  }]);
  if (!products.length) return send(ctx, res, 400, { error: 'sku o name requerido' });
  const format = String(q.format || 'html').toLowerCase();
  if (format === 'zpl')    return sendText(res, 200, 'text/plain', buildZpl(products));
  if (format === 'escpos') {
    const raw = buildEscPos(products);
    return send(ctx, res, 200, { ok: true, format: 'escpos', encoding: 'base64', payload: Buffer.from(raw, 'binary').toString('base64'), length: raw.length });
  }
  return sendText(res, 200, 'text/html', buildHtml(products, false));
}

// ---------- dispatcher ----------

module.exports = async function handleLabels(req, res, parsedUrl, ctx) {
  ctx = ctx || {};
  const method = (req.method || 'GET').toUpperCase();
  const pathname = (parsedUrl && parsedUrl.pathname) || req.url || '';

  if (!pathname.startsWith('/api/labels')) return false;

  try {
    if (method === 'POST' && pathname === '/api/labels/print') {
      await handlePrint(ctx, req, res);
      return true;
    }
    if (method === 'GET' && pathname === '/api/labels/preview') {
      await handlePreview(ctx, req, res, parsedUrl);
      return true;
    }
    return false;
  } catch (e) {
    try { send(ctx, res, 500, { error: 'labels_internal_error', detail: String(e && e.message || e) }); } catch (_) {}
    return true;
  }
};

module.exports.buildZpl = buildZpl;
module.exports.buildEscPos = buildEscPos;
module.exports.buildHtml = buildHtml;
