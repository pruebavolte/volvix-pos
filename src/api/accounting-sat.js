// api/accounting-sat.js — R18 Contabilidad SAT México automática
// Registra handlers en el objeto `handlers` global compartido (mismo patrón que crm-advanced.js / qr-payments.js).
// Endpoints:
//   GET  /api/accounting/journal
//   POST /api/accounting/expenses
//   GET  /api/accounting/balance-sheet
//   GET  /api/accounting/income-statement
//   POST /api/accounting/cfdi-import
//   POST /api/accounting/contabilidad-electronica/generate

'use strict';

function registerAccountingSAT(ctx) {
  const handlers   = ctx.handlers;
  const sendJSON   = ctx.sendJSON;
  const sendError  = ctx.sendError;
  const requireAuth = ctx.requireAuth || (h => h);
  const dbQuery    = ctx.dbQuery || ctx.query || (ctx.db && ctx.db.query.bind(ctx.db)) || (ctx.pool && ctx.pool.query.bind(ctx.pool));

  if (!handlers || typeof handlers !== 'object') throw new Error('R18: handlers map missing');
  if (!dbQuery) throw new Error('R18: dbQuery not provided');

  const tenantOf = req => (req && req.user && (req.user.tenant_id || req.user.tenantId)) || 0;
  const escXml   = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // GET /api/accounting/journal?from=&to=&cuenta=&sale_id=&expense_id=
  handlers['GET /api/accounting/journal'] = requireAuth(async (req, res) => {
    try {
      const tenant = tenantOf(req);
      const q = req.query || {};
      const where = ['tenant_id = $1']; const args = [tenant];
      if (q.from)       { args.push(q.from);               where.push(`fecha >= $${args.length}`); }
      if (q.to)         { args.push(q.to);                 where.push(`fecha <= $${args.length}`); }
      if (q.cuenta)     { args.push(q.cuenta);             where.push(`cuenta = $${args.length}`); }
      if (q.sale_id)    { args.push(Number(q.sale_id));    where.push(`sale_id = $${args.length}`); }
      if (q.expense_id) { args.push(Number(q.expense_id)); where.push(`expense_id = $${args.length}`); }
      const sql = `SELECT * FROM accounting_journal WHERE ${where.join(' AND ')} ORDER BY fecha DESC, id DESC LIMIT 500`;
      const r = await dbQuery(sql, args);
      const rows = r.rows || r;
      sendJSON(res, { ok: true, rows, count: rows.length });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/accounting/expenses — registra gasto + asiento doble automático
  handlers['POST /api/accounting/expenses'] = requireAuth(async (req, res) => {
    try {
      const tenant = tenantOf(req);
      const b = req.body || {};
      const subtotal = Number(b.monto || 0);
      const iva = Number(b.iva != null ? b.iva : Math.round(subtotal * 0.16 * 100) / 100);
      const total = Number(b.total != null ? b.total : (subtotal + iva));
      const fecha = b.fecha || new Date().toISOString().slice(0,10);
      const cuenta = b.cuenta_contable || '601.01';
      const ins = await dbQuery(
        `INSERT INTO expenses (tenant_id, fecha, descripcion, monto, iva, total, rfc_emisor, razon_social_emisor, deducible, categoria, cuenta_contable, metodo_pago, forma_pago, cfdi_uuid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [tenant, fecha, b.descripcion || 'Gasto', subtotal, iva, total, b.rfc_emisor || null, b.razon_social_emisor || null,
         b.deducible !== false, b.categoria || null, cuenta, b.metodo_pago || 'PUE', b.forma_pago || '03', b.cfdi_uuid || null]
      );
      const exp = (ins.rows || ins)[0];
      const poliza = `E-${String(fecha).slice(0,7)}-${String(exp.id).padStart(5,'0')}`;
      const concepto = `Gasto: ${exp.descripcion}`;
      await dbQuery(
        `INSERT INTO accounting_journal (tenant_id, fecha, poliza, tipo_poliza, concepto, cuenta, debe, haber, expense_id, cfdi_uuid, origen)
         VALUES ($1,$2,$3,'E',$4,$5,$6,0,$7,$8,'auto_expense'),
                ($1,$2,$3,'E',$4,'118.01',$9,0,$7,$8,'auto_expense'),
                ($1,$2,$3,'E',$4,'102.01',0,$10,$7,$8,'auto_expense')`,
        [tenant, fecha, poliza, concepto, cuenta, subtotal, exp.id, exp.cfdi_uuid, iva, total]
      );
      sendJSON(res, { ok: true, expense: exp, poliza });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/accounting/balance-sheet?as_of=YYYY-MM-DD
  handlers['GET /api/accounting/balance-sheet'] = requireAuth(async (req, res) => {
    try {
      const tenant = tenantOf(req);
      const asOf = (req.query && req.query.as_of) || new Date().toISOString().slice(0,10);
      const r = await dbQuery(
        `SELECT j.cuenta, a.nombre, a.naturaleza,
                SUM(j.debe) AS total_debe, SUM(j.haber) AS total_haber,
                SUM(j.debe) - SUM(j.haber) AS saldo
         FROM accounting_journal j
         LEFT JOIN accounting_accounts a ON a.codigo = j.cuenta AND (a.tenant_id = $1 OR a.tenant_id = 0)
         WHERE j.tenant_id = $1 AND j.fecha <= $2
         GROUP BY j.cuenta, a.nombre, a.naturaleza
         ORDER BY j.cuenta`,
        [tenant, asOf]
      );
      const rows = r.rows || r;
      const activo  = rows.filter(x => String(x.cuenta||'').startsWith('1')).reduce((s,x) => s + Number(x.saldo||0), 0);
      const pasivo  = rows.filter(x => String(x.cuenta||'').startsWith('2')).reduce((s,x) => s + Number(-x.saldo||0), 0);
      const capital = rows.filter(x => String(x.cuenta||'').startsWith('3')).reduce((s,x) => s + Number(-x.saldo||0), 0);
      sendJSON(res, {
        ok: true, as_of: asOf,
        totales: { activo, pasivo, capital, ecuacion_ok: Math.abs(activo - (pasivo + capital)) < 0.5 },
        cuentas: rows
      });
    } catch (err) { sendError(res, err); }
  });

  // GET /api/accounting/income-statement?from=&to=
  handlers['GET /api/accounting/income-statement'] = requireAuth(async (req, res) => {
    try {
      const tenant = tenantOf(req);
      const from = (req.query && req.query.from) || new Date().toISOString().slice(0,7) + '-01';
      const to   = (req.query && req.query.to)   || new Date().toISOString().slice(0,10);
      const r = await dbQuery(
        `SELECT j.cuenta, a.nombre, SUM(j.debe) AS debe, SUM(j.haber) AS haber
         FROM accounting_journal j
         LEFT JOIN accounting_accounts a ON a.codigo = j.cuenta AND (a.tenant_id = $1 OR a.tenant_id = 0)
         WHERE j.tenant_id = $1 AND j.fecha BETWEEN $2 AND $3
         GROUP BY j.cuenta, a.nombre
         ORDER BY j.cuenta`,
        [tenant, from, to]
      );
      const rows = r.rows || r;
      const ingresos = rows.filter(x => String(x.cuenta||'').startsWith('4')).reduce((s,x) => s + Number(x.haber||0) - Number(x.debe||0), 0);
      const costos   = rows.filter(x => String(x.cuenta||'').startsWith('5')).reduce((s,x) => s + Number(x.debe||0)  - Number(x.haber||0), 0);
      const gastos   = rows.filter(x => String(x.cuenta||'').startsWith('6')).reduce((s,x) => s + Number(x.debe||0)  - Number(x.haber||0), 0);
      const utilidad_bruta = ingresos - costos;
      const utilidad_operativa = utilidad_bruta - gastos;
      const isr = Math.max(0, utilidad_operativa) * 0.30;  // ISR PM 30%
      const utilidad_neta = utilidad_operativa - isr;
      sendJSON(res, {
        ok: true, periodo: { from, to },
        ingresos, costos, gastos, utilidad_bruta, utilidad_operativa,
        isr_estimado: isr, utilidad_neta, detalle: rows
      });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/accounting/cfdi-import { xml } -> parsea CFDI 4.0 proveedor, crea expense + asiento (601/118 vs 201)
  handlers['POST /api/accounting/cfdi-import'] = requireAuth(async (req, res) => {
    try {
      const tenant = tenantOf(req);
      const xml = (req.body && req.body.xml) || '';
      if (!xml || typeof xml !== 'string') return sendJSON(res, { ok: false, error: 'xml_required' }, 400);
      const attr = (rx) => { const m = xml.match(rx); return m ? m[1] : null; };
      const uuid       = attr(/UUID="([^"]+)"/i);
      const fecha      = (attr(/Fecha="([^"]+)"/i) || '').slice(0,10) || new Date().toISOString().slice(0,10);
      const subTotal   = Number(attr(/SubTotal="([^"]+)"/i) || 0);
      const total      = Number(attr(/Total="([^"]+)"/i) || subTotal * 1.16);
      const iva        = Math.round((total - subTotal) * 100) / 100;
      const rfc        = attr(/<cfdi:Emisor[^>]*Rfc="([^"]+)"/i) || attr(/Rfc="([^"]+)"/i);
      const razon      = attr(/<cfdi:Emisor[^>]*Nombre="([^"]+)"/i);
      const metodoPago = attr(/MetodoPago="([^"]+)"/i) || 'PUE';
      const formaPago  = attr(/FormaPago="([^"]+)"/i) || '03';
      const concepto   = attr(/<cfdi:Concepto[^>]*Descripcion="([^"]+)"/i) || 'CFDI importado';
      if (!uuid) return sendJSON(res, { ok: false, error: 'uuid_no_encontrado' }, 400);
      const ins = await dbQuery(
        `INSERT INTO expenses (tenant_id, fecha, descripcion, monto, iva, total, rfc_emisor, razon_social_emisor, deducible, categoria, cuenta_contable, metodo_pago, forma_pago, cfdi_uuid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'cfdi','601.01',$9,$10,$11)
         ON CONFLICT (tenant_id, cfdi_uuid) DO UPDATE SET total = EXCLUDED.total RETURNING *`,
        [tenant, fecha, concepto, subTotal, iva, total, rfc, razon, metodoPago, formaPago, uuid]
      );
      const exp = (ins.rows || ins)[0];
      const poliza = `E-${fecha.slice(0,7)}-CFDI-${String(exp.id).padStart(5,'0')}`;
      await dbQuery(
        `INSERT INTO accounting_journal (tenant_id, fecha, poliza, tipo_poliza, concepto, cuenta, debe, haber, expense_id, cfdi_uuid, origen)
         VALUES ($1,$2,$3,'E',$4,'601.01',$5,0,$6,$7,'cfdi_import'),
                ($1,$2,$3,'E',$4,'118.01',$8,0,$6,$7,'cfdi_import'),
                ($1,$2,$3,'E',$4,'201.01',0,$9,$6,$7,'cfdi_import')`,
        [tenant, fecha, poliza, `CFDI ${uuid} - ${concepto}`, subTotal, exp.id, uuid, iva, total]
      );
      sendJSON(res, { ok: true, expense: exp, uuid, poliza, parsed: { subtotal: subTotal, iva, total, rfc_emisor: rfc } });
    } catch (err) { sendError(res, err); }
  });

  // POST /api/accounting/contabilidad-electronica/generate?period=YYYY-MM
  // Genera 3 XML SAT Anexo 24 RMF: Catálogo (CT), Balanza (BN), Pólizas (PL)
  handlers['POST /api/accounting/contabilidad-electronica/generate'] = requireAuth(async (req, res) => {
    try {
      const tenant = tenantOf(req);
      const period = (req.query && req.query.period) || (req.body && req.body.period) || new Date().toISOString().slice(0,7);
      const [anio, mes] = String(period).split('-');
      if (!anio || !mes) return sendJSON(res, { ok: false, error: 'period_YYYY-MM_required' }, 400);
      const from = `${anio}-${mes}-01`;
      const to   = `${anio}-${mes}-31`;
      const rfcContrib = (req.body && req.body.rfc) || 'XAXX010101000';

      const accs = await dbQuery(
        `SELECT codigo, codigo_agrupador_sat, nombre, naturaleza, nivel
         FROM accounting_accounts WHERE (tenant_id=$1 OR tenant_id=0) AND activa=TRUE ORDER BY codigo`, [tenant]);
      const bal  = await dbQuery(
        `SELECT cuenta, SUM(debe) AS debe, SUM(haber) AS haber
         FROM accounting_journal WHERE tenant_id=$1 AND fecha BETWEEN $2 AND $3
         GROUP BY cuenta ORDER BY cuenta`, [tenant, from, to]);
      const pol  = await dbQuery(
        `SELECT id, fecha, poliza, tipo_poliza, concepto, cuenta, debe, haber, cfdi_uuid
         FROM accounting_journal WHERE tenant_id=$1 AND fecha BETWEEN $2 AND $3
         ORDER BY fecha, id`, [tenant, from, to]);

      const headerCat = `<?xml version="1.0" encoding="UTF-8"?>\n<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" Version="1.3" RFC="${escXml(rfcContrib)}" Mes="${escXml(mes)}" Anio="${escXml(anio)}">`;
      const ctas = (accs.rows || accs).map(a =>
        `  <catalogocuentas:Ctas CodAgrup="${escXml(a.codigo_agrupador_sat)}" NumCta="${escXml(a.codigo)}" Desc="${escXml(a.nombre)}" Nivel="${escXml(a.nivel)}" Natur="${a.naturaleza === 'deudora' ? 'D' : 'A'}"/>`
      ).join('\n');
      const xmlCatalogo = `${headerCat}\n${ctas}\n</catalogocuentas:Catalogo>`;

      const headerBal = `<?xml version="1.0" encoding="UTF-8"?>\n<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" Version="1.3" RFC="${escXml(rfcContrib)}" Mes="${escXml(mes)}" Anio="${escXml(anio)}" TipoEnvio="N">`;
      const ctasBal = (bal.rows || bal).map(c =>
        `  <BCE:Ctas NumCta="${escXml(c.cuenta)}" SaldoIni="0" Debe="${Number(c.debe||0).toFixed(2)}" Haber="${Number(c.haber||0).toFixed(2)}" SaldoFin="${(Number(c.debe||0)-Number(c.haber||0)).toFixed(2)}"/>`
      ).join('\n');
      const xmlBalanza = `${headerBal}\n${ctasBal}\n</BCE:Balanza>`;

      const polRows = pol.rows || pol;
      const grouped = {};
      polRows.forEach(p => {
        const k = p.poliza || `D-${p.id}`;
        grouped[k] = grouped[k] || { fecha: p.fecha, concepto: p.concepto, lineas: [] };
        grouped[k].lineas.push(p);
      });
      const headerPol = `<?xml version="1.0" encoding="UTF-8"?>\n<PLZ:Polizas xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo" Version="1.3" RFC="${escXml(rfcContrib)}" Mes="${escXml(mes)}" Anio="${escXml(anio)}" TipoSolicitud="AF">`;
      const xmlPolizas = headerPol + '\n' + Object.entries(grouped).map(([numId, p]) => {
        const lineas = p.lineas.map(l => {
          const open = `    <PLZ:Transaccion NumCta="${escXml(l.cuenta)}" DesEnc="${escXml(l.concepto)}" Concepto="${escXml(l.concepto)}" Debe="${Number(l.debe||0).toFixed(2)}" Haber="${Number(l.haber||0).toFixed(2)}"`;
          if (l.cfdi_uuid) {
            return `${open}>\n      <PLZ:CompNal UUID_CFDI="${escXml(l.cfdi_uuid)}" RFC="${escXml(rfcContrib)}" MontoTotal="${Number((l.debe||0)+(l.haber||0)).toFixed(2)}"/>\n    </PLZ:Transaccion>`;
          }
          return `${open}/>`;
        }).join('\n');
        return `  <PLZ:Poliza NumUnIdenPol="${escXml(numId)}" Fecha="${escXml(p.fecha)}" Concepto="${escXml(p.concepto)}">\n${lineas}\n  </PLZ:Poliza>`;
      }).join('\n') + '\n</PLZ:Polizas>';

      sendJSON(res, {
        ok: true, period, rfc: rfcContrib,
        files: {
          [`${rfcContrib}${anio}${mes}CT.xml`]: xmlCatalogo,
          [`${rfcContrib}${anio}${mes}BN.xml`]: xmlBalanza,
          [`${rfcContrib}${anio}${mes}PL.xml`]: xmlPolizas
        },
        counts: {
          cuentas: (accs.rows||accs).length,
          balanza: (bal.rows||bal).length,
          polizas: Object.keys(grouped).length,
          transacciones: polRows.length
        }
      });
    } catch (err) { sendError(res, err); }
  });
}

module.exports = { registerAccountingSAT };
