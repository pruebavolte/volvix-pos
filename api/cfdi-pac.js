// api/cfdi-pac.js
// CFDI 4.0 (Mexican electronic invoicing) module for Volvix POS
// Provider-agnostic PAC integration (Facturama, SW Sapien, FormasDigitales, FinkOk, Solucion Factible)

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const PAC_PROVIDER = process.env.PAC_PROVIDER || 'facturama';
const PAC_API_URL = process.env.PAC_API_URL;
const PAC_API_USER = process.env.PAC_API_USER;
const PAC_API_PASSWORD = process.env.PAC_API_PASSWORD;

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  return _sb;
}

// ---------- helpers ----------

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function pacConfigured() {
  return !!(PAC_API_URL && PAC_API_USER && PAC_API_PASSWORD);
}

function pacNotConfiguredResponse(res) {
  return json(res, 503, {
    error: 'PAC no configurado',
    code: 'PAC_NOT_CONFIGURED',
    help: 'Agrega PAC_API_URL, PAC_API_USER, PAC_API_PASSWORD en Vercel'
  });
}

function xmlEscape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function r2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function r2s(n) {
  return r2(n).toFixed(2);
}

function nowIsoLocal() {
  // CFDI 4.0 expects local time without timezone (yyyy-MM-ddTHH:mm:ss)
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mockUuid() {
  return `MOCK-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// ---------- SAT canonical catalogs (subset) ----------

const SAT_USO_CFDI = [
  { clave: 'G01', descripcion: 'Adquisicion de mercancias' },
  { clave: 'G02', descripcion: 'Devoluciones, descuentos o bonificaciones' },
  { clave: 'G03', descripcion: 'Gastos en general' },
  { clave: 'I01', descripcion: 'Construcciones' },
  { clave: 'I02', descripcion: 'Mobiliario y equipo de oficina por inversiones' },
  { clave: 'I03', descripcion: 'Equipo de transporte' },
  { clave: 'I04', descripcion: 'Equipo de computo y accesorios' },
  { clave: 'I05', descripcion: 'Dados, troqueles, moldes, matrices y herramental' },
  { clave: 'I06', descripcion: 'Comunicaciones telefonicas' },
  { clave: 'I07', descripcion: 'Comunicaciones satelitales' },
  { clave: 'I08', descripcion: 'Otra maquinaria y equipo' },
  { clave: 'D01', descripcion: 'Honorarios medicos, dentales y gastos hospitalarios' },
  { clave: 'D02', descripcion: 'Gastos medicos por incapacidad o discapacidad' },
  { clave: 'D03', descripcion: 'Gastos funerales' },
  { clave: 'D04', descripcion: 'Donativos' },
  { clave: 'D05', descripcion: 'Intereses reales efectivamente pagados por creditos hipotecarios' },
  { clave: 'D06', descripcion: 'Aportaciones voluntarias al SAR' },
  { clave: 'D07', descripcion: 'Primas por seguros de gastos medicos' },
  { clave: 'D08', descripcion: 'Gastos de transportacion escolar obligatoria' },
  { clave: 'D09', descripcion: 'Depositos en cuentas para el ahorro, primas planes de pensiones' },
  { clave: 'D10', descripcion: 'Pagos por servicios educativos (colegiaturas)' },
  { clave: 'S01', descripcion: 'Sin efectos fiscales' },
  { clave: 'CP01', descripcion: 'Pagos' },
  { clave: 'CN01', descripcion: 'Nomina' }
];

const SAT_REGIMEN_FISCAL = [
  { clave: '601', descripcion: 'General de Ley Personas Morales' },
  { clave: '603', descripcion: 'Personas Morales con Fines no Lucrativos' },
  { clave: '605', descripcion: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { clave: '606', descripcion: 'Arrendamiento' },
  { clave: '607', descripcion: 'Regimen de Enajenacion o Adquisicion de Bienes' },
  { clave: '608', descripcion: 'Demas ingresos' },
  { clave: '610', descripcion: 'Residentes en el Extranjero sin Establecimiento Permanente en Mexico' },
  { clave: '611', descripcion: 'Ingresos por Dividendos (socios y accionistas)' },
  { clave: '612', descripcion: 'Personas Fisicas con Actividades Empresariales y Profesionales' },
  { clave: '614', descripcion: 'Ingresos por intereses' },
  { clave: '615', descripcion: 'Regimen de los ingresos por obtencion de premios' },
  { clave: '616', descripcion: 'Sin obligaciones fiscales' },
  { clave: '620', descripcion: 'Sociedades Cooperativas de Produccion' },
  { clave: '621', descripcion: 'Incorporacion Fiscal' },
  { clave: '622', descripcion: 'Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras' },
  { clave: '623', descripcion: 'Opcional para Grupos de Sociedades' },
  { clave: '624', descripcion: 'Coordinados' },
  { clave: '625', descripcion: 'Regimen de las Actividades Empresariales con ingresos a traves de Plataformas Tecnologicas' },
  { clave: '626', descripcion: 'Regimen Simplificado de Confianza' }
];

const SAT_MONEDAS = [
  { clave: 'MXN', descripcion: 'Peso Mexicano' },
  { clave: 'USD', descripcion: 'Dolar americano' },
  { clave: 'EUR', descripcion: 'Euro' },
  { clave: 'XXX', descripcion: 'Los codigos asignados para las transacciones en que intervenga ninguna moneda' }
];

const SAT_UNIDADES = [
  { clave: 'H87', descripcion: 'Pieza' },
  { clave: 'EA', descripcion: 'Elemento' },
  { clave: 'E48', descripcion: 'Unidad de servicio' },
  { clave: 'ACT', descripcion: 'Actividad' },
  { clave: 'KGM', descripcion: 'Kilogramo' },
  { clave: 'GRM', descripcion: 'Gramo' },
  { clave: 'LTR', descripcion: 'Litro' },
  { clave: 'MTR', descripcion: 'Metro' },
  { clave: 'XBX', descripcion: 'Caja' },
  { clave: 'XPK', descripcion: 'Paquete' }
];

const SAT_CLAVES_PROD_SERV_COMUNES = [
  { clave: '01010101', descripcion: 'No existe en el catalogo' },
  { clave: '50202306', descripcion: 'Comidas y bebidas preparadas' },
  { clave: '50192100', descripcion: 'Productos de panaderia' },
  { clave: '50202301', descripcion: 'Bebidas no alcoholicas' },
  { clave: '90101501', descripcion: 'Servicio de restaurante' },
  { clave: '78181500', descripcion: 'Servicios de mantenimiento' },
  { clave: '81112200', descripcion: 'Servicios de software' }
];

// ---------- CFDI XML builder ----------

function buildCfdiXml(payload) {
  const {
    serie = 'A',
    folio,
    fecha,
    formaPago,
    metodoPago,
    moneda = 'MXN',
    tipoCambio = '1',
    lugarExpedicion,
    emisor,
    receptor,
    conceptos,
    subtotal,
    descuento,
    total,
    impuestosTrasladados,
    totalImpuestosTrasladados
  } = payload;

  const conceptosXml = conceptos.map(c => {
    const importe = r2(Number(c.cantidad) * Number(c.valorUnitario));
    const baseIva = c.descuento ? r2(importe - Number(c.descuento)) : importe;
    const iva = r2(baseIva * 0.16);
    return `    <cfdi:Concepto ClaveProdServ="${xmlEscape(c.claveProdServ || '01010101')}" NoIdentificacion="${xmlEscape(c.noIdentificacion || c.sku || '')}" Cantidad="${r2s(c.cantidad)}" ClaveUnidad="${xmlEscape(c.claveUnidad || 'H87')}" Unidad="${xmlEscape(c.unidad || 'Pieza')}" Descripcion="${xmlEscape(c.descripcion)}" ValorUnitario="${r2s(c.valorUnitario)}" Importe="${r2s(importe)}"${c.descuento ? ` Descuento="${r2s(c.descuento)}"` : ''} ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${r2s(baseIva)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${r2s(iva)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
  }).join('\n');

  const trasladosXml = impuestosTrasladados.map(t =>
    `      <cfdi:Traslado Base="${r2s(t.base)}" Impuesto="${xmlEscape(t.impuesto)}" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${r2s(t.importe)}"/>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" Serie="${xmlEscape(serie)}" Folio="${xmlEscape(folio)}" Fecha="${xmlEscape(fecha)}" FormaPago="${xmlEscape(formaPago)}" SubTotal="${r2s(subtotal)}"${descuento ? ` Descuento="${r2s(descuento)}"` : ''} Moneda="${xmlEscape(moneda)}" TipoCambio="${xmlEscape(tipoCambio)}" Total="${r2s(total)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="${xmlEscape(metodoPago)}" LugarExpedicion="${xmlEscape(lugarExpedicion)}">
  <cfdi:Emisor Rfc="${xmlEscape(emisor.rfc)}" Nombre="${xmlEscape(emisor.razonSocial)}" RegimenFiscal="${xmlEscape(emisor.regimenFiscal)}"/>
  <cfdi:Receptor Rfc="${xmlEscape(receptor.rfc)}" Nombre="${xmlEscape(receptor.razonSocial)}" DomicilioFiscalReceptor="${xmlEscape(receptor.cp)}" RegimenFiscalReceptor="${xmlEscape(receptor.regimenFiscal)}" UsoCFDI="${xmlEscape(receptor.usoCfdi)}"/>
  <cfdi:Conceptos>
${conceptosXml}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${r2s(totalImpuestosTrasladados)}">
    <cfdi:Traslados>
${trasladosXml}
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>`;

  return xml;
}

// ---------- amount calculation ----------

function calcAmounts(items) {
  let subtotal = 0;
  let totalIva = 0;
  let descuentoTotal = 0;
  const conceptos = [];
  const trasladosMap = new Map();

  for (const it of items) {
    const cantidad = Number(it.cantidad ?? it.qty ?? it.quantity ?? 1);
    const valorUnitario = Number(it.valorUnitario ?? it.unit_price ?? it.price ?? 0);
    const descuento = Number(it.descuento ?? it.discount ?? 0);
    const importe = r2(cantidad * valorUnitario);
    const base = r2(importe - descuento);
    const iva = r2(base * 0.16);

    subtotal = r2(subtotal + importe);
    descuentoTotal = r2(descuentoTotal + descuento);
    totalIva = r2(totalIva + iva);

    const key = '002';
    const cur = trasladosMap.get(key) || { impuesto: '002', base: 0, importe: 0 };
    cur.base = r2(cur.base + base);
    cur.importe = r2(cur.importe + iva);
    trasladosMap.set(key, cur);

    conceptos.push({
      claveProdServ: it.claveProdServ || it.clave_prod_serv || '01010101',
      noIdentificacion: it.sku || it.noIdentificacion || it.product_id || '',
      cantidad,
      claveUnidad: it.claveUnidad || it.clave_unidad || 'H87',
      unidad: it.unidad || it.unit || 'Pieza',
      descripcion: it.descripcion || it.description || it.name || it.product_name || 'Producto',
      valorUnitario,
      descuento: descuento || undefined
    });
  }

  const total = r2(subtotal - descuentoTotal + totalIva);

  return {
    subtotal,
    descuento: descuentoTotal,
    totalIva,
    total,
    conceptos,
    trasladados: Array.from(trasladosMap.values())
  };
}

// ---------- DB ----------

async function ensureCfdiTables() {
  // Tables expected to be pre-created via SQL migration; this is best-effort and silent on RPC absence.
  try {
    await sb().rpc('execute_sql', {
      query: `CREATE TABLE IF NOT EXISTS cfdi_stamps (
        id uuid default gen_random_uuid() primary key,
        tenant_id text,
        sale_id text,
        uuid text unique,
        xml_url text,
        pdf_url text,
        qr_url text,
        status text default 'stamped',
        stamped_at timestamptz default now(),
        cancelled_at timestamptz,
        customer_rfc text,
        total numeric,
        currency text default 'MXN',
        raw_response jsonb,
        meta jsonb
      );
      CREATE TABLE IF NOT EXISTS cfdi_mock (
        id uuid default gen_random_uuid() primary key,
        tenant_id text,
        sale_id text,
        uuid text,
        customer_rfc text,
        total numeric,
        payload jsonb,
        created_at timestamptz default now()
      );
      CREATE TABLE IF NOT EXISTS cfdi_public_links (
        id uuid default gen_random_uuid() primary key,
        token text unique,
        tenant_id text,
        sale_id text,
        expires_at timestamptz,
        used boolean default false,
        created_at timestamptz default now()
      );`
    });
  } catch { /* ignore */ }
}

async function loadSaleWithItems(saleId) {
  const { data: sale, error: e1 } = await sb()
    .from('pos_sales').select('*').eq('id', saleId).maybeSingle();
  if (e1 || !sale) return { sale: null, items: [] };
  const { data: items } = await sb()
    .from('sale_items').select('*').eq('sale_id', saleId);
  return { sale, items: items || [] };
}

async function loadBillingConfig(tenantId) {
  const { data } = await sb()
    .from('billing_configs').select('*').eq('tenant_id', tenantId).eq('enabled', true).maybeSingle();
  return data;
}

// ---------- PAC adapter ----------

async function pacRequest(path, method = 'POST', body = null) {
  const url = `${PAC_API_URL.replace(/\/$/, '')}${path}`;
  const auth = Buffer.from(`${PAC_API_USER}:${PAC_API_PASSWORD}`).toString('base64');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json'
    }
  };
  if (body) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: resp.ok, status: resp.status, body: parsed };
}

async function pacStamp(xml) {
  const { ok, status, body } = await pacRequest('/cfdi/stamp', 'POST', { xml });
  if (!ok) {
    const err = new Error(body?.message || body?.error || `PAC stamp failed (${status})`);
    err.pacStatus = status;
    err.pacBody = body;
    throw err;
  }
  // Normalize across providers
  return {
    uuid: body.uuid || body.UUID || body.timbre?.uuid || body.Complemento?.TimbreFiscalDigital?.UUID,
    xml: body.xml || body.cfdi || body.signedXml,
    xmlUrl: body.xml_url || body.xmlUrl,
    pdfUrl: body.pdf_url || body.pdfUrl,
    qrUrl: body.qr_url || body.qrUrl,
    selloSat: body.selloSAT || body.sello_sat,
    fechaTimbrado: body.fechaTimbrado || body.fecha_timbrado,
    raw: body
  };
}

async function pacCancel(uuid, motivo, folioSustitucion, rfcEmisor) {
  const payload = { uuid, motivo, folio_sustitucion: folioSustitucion, rfc_emisor: rfcEmisor };
  const { ok, status, body } = await pacRequest('/cfdi/cancel', 'POST', payload);
  if (!ok) {
    const err = new Error(body?.message || body?.error || `PAC cancel failed (${status})`);
    err.pacStatus = status;
    err.pacBody = body;
    throw err;
  }
  return body;
}

async function pacStatus(uuid) {
  const { ok, status, body } = await pacRequest(`/cfdi/status/${encodeURIComponent(uuid)}`, 'GET');
  if (!ok) {
    const err = new Error(body?.message || body?.error || `PAC status failed (${status})`);
    err.pacStatus = status;
    throw err;
  }
  return body;
}

// ---------- handlers ----------

async function handleSatCatalogs(req, res, parsedUrl) {
  const m = parsedUrl.pathname.match(/^\/api\/cfdi\/sat-catalogs\/([^/?]+)$/);
  if (!m) return json(res, 404, { error: 'catalog not specified' });
  const catalog = decodeURIComponent(m[1]).toLowerCase();
  try {
    if (catalog === 'forma_pago') {
      const { data } = await sb().from('sat_forma_pago').select('*').order('clave');
      return json(res, 200, { catalog, items: data || [] });
    }
    if (catalog === 'metodo_pago') {
      const { data } = await sb().from('sat_metodo_pago').select('*').order('clave');
      return json(res, 200, { catalog, items: data || [] });
    }
    if (catalog === 'uso_cfdi') return json(res, 200, { catalog, items: SAT_USO_CFDI });
    if (catalog === 'regimen_fiscal') return json(res, 200, { catalog, items: SAT_REGIMEN_FISCAL });
    if (catalog === 'monedas') return json(res, 200, { catalog, items: SAT_MONEDAS });
    if (catalog === 'unidades') return json(res, 200, { catalog, items: SAT_UNIDADES });
    if (catalog === 'claves_prod_serv') return json(res, 200, { catalog, items: SAT_CLAVES_PROD_SERV_COMUNES });
    return json(res, 400, { error: 'catalog not supported', catalog });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handlePreview(req, res) {
  try {
    const body = await readBody(req);
    const { sale_id, customer_rfc, customer_razon_social, customer_regimen, customer_cp, uso_cfdi = 'G03', forma_pago = '01', metodo_pago = 'PUE' } = body;
    if (!sale_id) return json(res, 400, { error: 'sale_id required' });
    const { sale, items } = await loadSaleWithItems(sale_id);
    if (!sale) return json(res, 404, { error: 'sale not found' });
    if (!items.length) return json(res, 400, { error: 'sale has no items' });

    const cfg = sale.tenant_id ? await loadBillingConfig(sale.tenant_id) : null;

    const amounts = calcAmounts(items);
    const xml = buildCfdiXml({
      serie: cfg?.serie || 'A',
      folio: String(sale.folio || sale.id || Date.now()).slice(-8),
      fecha: nowIsoLocal(),
      formaPago: forma_pago,
      metodoPago: metodo_pago,
      moneda: 'MXN',
      tipoCambio: '1',
      lugarExpedicion: cfg?.domicilio_fiscal_cp || '00000',
      emisor: {
        rfc: cfg?.rfc || 'XAXX010101000',
        razonSocial: cfg?.razon_social || 'EMISOR DE PRUEBA',
        regimenFiscal: cfg?.regimen_fiscal || '601'
      },
      receptor: {
        rfc: customer_rfc || 'XAXX010101000',
        razonSocial: customer_razon_social || 'PUBLICO EN GENERAL',
        cp: customer_cp || cfg?.domicilio_fiscal_cp || '00000',
        regimenFiscal: customer_regimen || '616',
        usoCfdi: uso_cfdi
      },
      conceptos: amounts.conceptos,
      subtotal: amounts.subtotal,
      descuento: amounts.descuento || undefined,
      total: amounts.total,
      impuestosTrasladados: amounts.trasladados,
      totalImpuestosTrasladados: amounts.totalIva
    });

    const declaredTotal = Number(sale.total ?? sale.amount ?? 0);
    const matches = declaredTotal > 0 ? Math.abs(declaredTotal - amounts.total) < 0.05 : true;

    return json(res, 200, {
      ok: true,
      preview: true,
      xml,
      amounts: {
        subtotal: amounts.subtotal,
        descuento: amounts.descuento,
        impuestos: amounts.totalIva,
        total: amounts.total,
        sale_total: declaredTotal,
        match: matches
      }
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleStamp(req, res) {
  await ensureCfdiTables();
  try {
    const body = await readBody(req);
    const { sale_id, tenant_id, customer = {}, forma_pago = '01', metodo_pago = 'PUE' } = body;
    if (!sale_id) return json(res, 400, { error: 'sale_id required' });
    if (!tenant_id) return json(res, 400, { error: 'tenant_id required' });

    const cfg = await loadBillingConfig(tenant_id);
    const { sale, items } = await loadSaleWithItems(sale_id);
    if (!sale) return json(res, 404, { error: 'sale not found' });
    if (!items.length) return json(res, 400, { error: 'sale has no items' });

    if (!cfg) return json(res, 400, { error: 'billing_config no encontrada o deshabilitada para este tenant' });

    const amounts = calcAmounts(items);
    const xml = buildCfdiXml({
      serie: cfg.serie || 'A',
      folio: String(sale.folio || sale.id || Date.now()).slice(-8),
      fecha: nowIsoLocal(),
      formaPago: forma_pago,
      metodoPago: metodo_pago,
      moneda: 'MXN',
      tipoCambio: '1',
      lugarExpedicion: cfg.domicilio_fiscal_cp || '00000',
      emisor: {
        rfc: cfg.rfc,
        razonSocial: cfg.razon_social,
        regimenFiscal: cfg.regimen_fiscal || '601'
      },
      receptor: {
        rfc: customer.rfc || 'XAXX010101000',
        razonSocial: customer.razon_social || 'PUBLICO EN GENERAL',
        cp: customer.cp || cfg.domicilio_fiscal_cp || '00000',
        regimenFiscal: customer.regimen || '616',
        usoCfdi: customer.uso || 'G03'
      },
      conceptos: amounts.conceptos,
      subtotal: amounts.subtotal,
      descuento: amounts.descuento || undefined,
      total: amounts.total,
      impuestosTrasladados: amounts.trasladados,
      totalImpuestosTrasladados: amounts.totalIva
    });

    // ----- MOCK MODE -----
    if (!pacConfigured()) {
      const uuid = mockUuid();
      try {
        await sb().from('cfdi_mock').insert({
          tenant_id, sale_id, uuid,
          customer_rfc: customer.rfc || null,
          total: amounts.total,
          payload: { xml, amounts, customer, forma_pago, metodo_pago }
        });
        await sb().from('cfdi_stamps').insert({
          tenant_id, sale_id, uuid,
          status: 'mock',
          customer_rfc: customer.rfc || null,
          total: amounts.total,
          currency: 'MXN',
          raw_response: { mock: true },
          meta: { provider: PAC_PROVIDER, mock: true }
        });
      } catch { /* ignore insert race */ }
      return json(res, 200, {
        ok: true,
        mock: true,
        uuid,
        status: 'mock',
        xml_url: null,
        pdf_url: null,
        qr_url: null,
        amounts,
        warning: 'PAC no configurado: respuesta simulada (status=mock)'
      });
    }

    if (!cfg.csd_uploaded) {
      return json(res, 400, {
        error: 'CSD no cargado',
        code: 'CSD_REQUIRED',
        help: 'Sube tu Certificado de Sello Digital (.cer y .key) en /api/cfdi/csd/upload'
      });
    }

    // ----- REAL PAC STAMP -----
    const stamped = await pacStamp(xml);
    if (!stamped.uuid) {
      return json(res, 502, { error: 'PAC no devolvio UUID', raw: stamped.raw });
    }

    try {
      await sb().from('cfdi_stamps').insert({
        tenant_id, sale_id,
        uuid: stamped.uuid,
        xml_url: stamped.xmlUrl || null,
        pdf_url: stamped.pdfUrl || null,
        qr_url: stamped.qrUrl || null,
        status: 'stamped',
        customer_rfc: customer.rfc || null,
        total: amounts.total,
        currency: 'MXN',
        raw_response: stamped.raw,
        meta: { provider: PAC_PROVIDER, sello_sat: stamped.selloSat, fecha_timbrado: stamped.fechaTimbrado }
      });
    } catch { /* unique conflict on retry */ }

    return json(res, 200, {
      ok: true,
      uuid: stamped.uuid,
      xml_url: stamped.xmlUrl,
      pdf_url: stamped.pdfUrl,
      qr_url: stamped.qrUrl,
      status: 'stamped',
      amounts
    });
  } catch (e) {
    return json(res, 500, { error: e.message, pac: e.pacBody || null });
  }
}

async function handleCancel(req, res) {
  if (!pacConfigured()) return pacNotConfiguredResponse(res);
  try {
    const body = await readBody(req);
    const { uuid, motivo = '02', folio_sustitucion, tenant_id } = body;
    if (!uuid) return json(res, 400, { error: 'uuid required' });
    const cfg = tenant_id ? await loadBillingConfig(tenant_id) : null;
    const result = await pacCancel(uuid, motivo, folio_sustitucion, cfg?.rfc);
    await sb().from('cfdi_stamps')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), meta: { cancel_reason: motivo, folio_sustitucion } })
      .eq('uuid', uuid);
    return json(res, 200, { ok: true, uuid, status: 'cancelled', pac: result });
  } catch (e) {
    return json(res, 500, { error: e.message, pac: e.pacBody || null });
  }
}

async function handleList(req, res, parsedUrl) {
  try {
    const { tenant_id, from, to, customer_rfc } = parsedUrl.query || {};
    let q = sb().from('cfdi_stamps').select('*').order('stamped_at', { ascending: false }).limit(500);
    if (tenant_id) q = q.eq('tenant_id', tenant_id);
    if (customer_rfc) q = q.eq('customer_rfc', customer_rfc);
    if (from) q = q.gte('stamped_at', from);
    if (to) q = q.lte('stamped_at', to);
    const { data, error } = await q;
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true, items: data || [], count: (data || []).length });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleXml(req, res, uuid) {
  try {
    const { data } = await sb().from('cfdi_stamps').select('*').eq('uuid', uuid).maybeSingle();
    if (!data) return json(res, 404, { error: 'cfdi not found' });
    if (data.xml_url) {
      res.statusCode = 302;
      res.setHeader('Location', data.xml_url);
      return res.end();
    }
    const xmlInline = data.raw_response?.xml || data.raw_response?.signedXml || data.raw_response?.cfdi;
    if (xmlInline) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${uuid}.xml"`);
      return res.end(xmlInline);
    }
    return json(res, 404, { error: 'XML no disponible' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handlePdf(req, res, uuid) {
  try {
    const { data } = await sb().from('cfdi_stamps').select('*').eq('uuid', uuid).maybeSingle();
    if (!data) return json(res, 404, { error: 'cfdi not found' });
    if (data.pdf_url) {
      res.statusCode = 302;
      res.setHeader('Location', data.pdf_url);
      return res.end();
    }
    return json(res, 200, {
      ok: true,
      uuid,
      message: 'PDF no disponible directo. Solicitalo al PAC con /api/cfdi/{uuid}/regenerate-pdf o descarga el XML y genera PDF localmente.',
      qr_url: data.qr_url || `https://verificacfdi.facturaelectronica.sat.gob.mx/?id=${encodeURIComponent(uuid)}`
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleStatus(req, res, uuid) {
  if (!pacConfigured()) return pacNotConfiguredResponse(res);
  try {
    const result = await pacStatus(uuid);
    return json(res, 200, { ok: true, uuid, sat: result });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleCsdUpload(req, res) {
  try {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data') && !ct.includes('application/json')) {
      return json(res, 400, { error: 'Content-Type debe ser multipart/form-data o application/json' });
    }

    let payload = {};
    if (ct.includes('application/json')) {
      payload = await readBody(req);
    } else {
      // Minimal multipart parsing: capture filenames only (placeholder mode)
      const buf = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
      const text = buf.toString('binary');
      const cerMatch = text.match(/filename="([^"]+\.cer)"/i);
      const keyMatch = text.match(/filename="([^"]+\.key)"/i);
      const tenantMatch = text.match(/name="tenant_id"\s*\r\n\r\n([^\r\n]+)/);
      payload = {
        cer_filename: cerMatch?.[1],
        key_filename: keyMatch?.[1],
        tenant_id: tenantMatch?.[1]
      };
    }

    if (!payload.tenant_id) return json(res, 400, { error: 'tenant_id required' });

    // Placeholder: real impl encrypts .cer/.key with KMS and stores certificate metadata
    const meta = {
      cer_filename: payload.cer_filename || null,
      key_filename: payload.key_filename || null,
      uploaded_at: new Date().toISOString(),
      mock: true
    };

    await sb().from('billing_configs')
      .update({
        csd_uploaded: true,
        csd_certificate_number: payload.cer_filename ? `MOCK-${Date.now()}` : null
      })
      .eq('tenant_id', payload.tenant_id);

    return json(res, 200, {
      ok: true,
      mock: true,
      message: 'CSD registrado en modo placeholder. Para produccion implementa cifrado KMS.',
      meta
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handlePublicLink(req, res) {
  await ensureCfdiTables();
  try {
    const body = await readBody(req);
    const { sale_id, expires_hours = 72, tenant_id } = body;
    if (!sale_id) return json(res, 400, { error: 'sale_id required' });

    if (tenant_id) {
      const cfg = await loadBillingConfig(tenant_id);
      if (cfg && cfg.allow_public_invoicing === false) {
        return json(res, 403, { error: 'Auto-facturacion publica deshabilitada para este tenant' });
      }
    }

    const token = crypto.randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + Number(expires_hours) * 3600 * 1000).toISOString();

    await sb().from('cfdi_public_links').insert({
      token, tenant_id: tenant_id || null, sale_id, expires_at: expiresAt
    });

    const base = process.env.PUBLIC_BASE_URL || `https://${req.headers.host || 'volvix.com'}`;
    const url = `${base.replace(/\/$/, '')}/cfdi/auto/${token}`;

    return json(res, 200, { ok: true, token, url, expires_at: expiresAt });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleHealth(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const tenantId = url.searchParams.get('tenant_id');
    let csdUploaded = false;
    if (tenantId) {
      const cfg = await loadBillingConfig(tenantId);
      csdUploaded = !!cfg?.csd_uploaded;
    }
    const configured = pacConfigured();
    return json(res, 200, {
      ok: true,
      provider: PAC_PROVIDER,
      pac_configured: configured,
      csd_uploaded: csdUploaded,
      can_stamp: configured && csdUploaded,
      mode: configured ? 'live' : 'mock'
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

async function handleEmail(req, res, ctx) {
  try {
    const body = await readBody(req);
    const { uuid, to_email } = body;
    if (!uuid || !to_email) return json(res, 400, { error: 'uuid and to_email required' });

    const { data: stamp } = await sb().from('cfdi_stamps').select('*').eq('uuid', uuid).maybeSingle();
    if (!stamp) return json(res, 404, { error: 'cfdi not found' });

    const base = process.env.PUBLIC_BASE_URL || `http://${req.headers.host || 'localhost'}`;
    const emailUrl = `${base.replace(/\/$/, '')}/api/email/cfdi`;
    const r = await fetch(emailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid,
        to_email,
        xml_url: stamp.xml_url,
        pdf_url: stamp.pdf_url,
        total: stamp.total,
        customer_rfc: stamp.customer_rfc
      })
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return json(res, r.ok ? 200 : 502, { ok: r.ok, email: data });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

// ---------- router ----------

module.exports = async function handleCFDI(req, res, parsedUrl, ctx) {
  try {
    const path = parsedUrl.pathname;
    const method = req.method;

    // Path guard: only handle /api/cfdi/* routes.
    if (!path.startsWith('/api/cfdi')) return false;

    if (method === 'GET' && path === '/api/cfdi/health') return handleHealth(req, res);

    if (method === 'GET' && path.startsWith('/api/cfdi/sat-catalogs/')) return handleSatCatalogs(req, res, parsedUrl);

    if (method === 'POST' && path === '/api/cfdi/preview') return handlePreview(req, res);
    if (method === 'POST' && path === '/api/cfdi/stamp') return handleStamp(req, res);
    if (method === 'POST' && path === '/api/cfdi/cancel') return handleCancel(req, res);

    if (method === 'GET' && path === '/api/cfdi/list') return handleList(req, res, parsedUrl);

    if (method === 'POST' && path === '/api/cfdi/csd/upload') return handleCsdUpload(req, res);
    if (method === 'POST' && path === '/api/cfdi/public-link') return handlePublicLink(req, res);
    if (method === 'POST' && path === '/api/cfdi/email') return handleEmail(req, res, ctx);

    const uuidRoute = path.match(/^\/api\/cfdi\/([^/]+)\/(xml|pdf|status)$/);
    if (uuidRoute && method === 'GET') {
      const uuid = decodeURIComponent(uuidRoute[1]);
      const action = uuidRoute[2];
      if (action === 'xml') return handleXml(req, res, uuid);
      if (action === 'pdf') return handlePdf(req, res, uuid);
      if (action === 'status') return handleStatus(req, res, uuid);
    }

    // No matching CFDI route — let next dispatcher try
    return false;
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
