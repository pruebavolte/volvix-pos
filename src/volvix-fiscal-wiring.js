/**
 * volvix-fiscal-wiring.js
 * Sistema Fiscal SAT México - Volvix POS
 * CFDI 4.0 / Complemento Pagos 2.0 / Retenciones / RFC / ZIP XMLs
 * Expone: window.FiscalAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // 1. CONSTANTES SAT
  // ============================================================
  const SAT = {
    VERSION_CFDI: '4.0',
    VERSION_PAGO: '2.0',
    VERSION_RET:  '2.0',
    USOS_CFDI: {
      G01: 'Adquisición de mercancías',
      G02: 'Devoluciones, descuentos o bonificaciones',
      G03: 'Gastos en general',
      I01: 'Construcciones',
      I02: 'Mobiliario y equipo de oficina',
      I03: 'Equipo de transporte',
      I04: 'Equipo de cómputo',
      I05: 'Dados, troqueles, moldes, matrices',
      I06: 'Comunicaciones telefónicas',
      I07: 'Comunicaciones satelitales',
      I08: 'Otra maquinaria y equipo',
      D01: 'Honorarios médicos, dentales y gastos hospitalarios',
      D02: 'Gastos médicos por incapacidad o discapacidad',
      D03: 'Gastos funerales',
      D04: 'Donativos',
      D05: 'Intereses reales por créditos hipotecarios',
      D06: 'Aportaciones voluntarias al SAR',
      D07: 'Primas por seguros de gastos médicos',
      D08: 'Gastos de transportación escolar obligatoria',
      D09: 'Depósitos en cuentas para el ahorro',
      D10: 'Pagos por servicios educativos',
      S01: 'Sin efectos fiscales',
      CP01: 'Pagos',
      CN01: 'Nómina'
    },
    REGIMENES: {
      '601': 'General de Ley Personas Morales',
      '603': 'Personas Morales con Fines no Lucrativos',
      '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
      '606': 'Arrendamiento',
      '607': 'Régimen de Enajenación o Adquisición de Bienes',
      '608': 'Demás ingresos',
      '610': 'Residentes en el Extranjero',
      '611': 'Ingresos por Dividendos',
      '612': 'Personas Físicas con Actividades Empresariales',
      '614': 'Ingresos por intereses',
      '615': 'Régimen de los ingresos por obtención de premios',
      '616': 'Sin obligaciones fiscales',
      '620': 'Sociedades Cooperativas de Producción',
      '621': 'Incorporación Fiscal',
      '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
      '623': 'Opcional para Grupos de Sociedades',
      '624': 'Coordinados',
      '625': 'Plataformas Tecnológicas',
      '626': 'Régimen Simplificado de Confianza'
    },
    FORMAS_PAGO: {
      '01':'Efectivo','02':'Cheque nominativo','03':'Transferencia electrónica',
      '04':'Tarjeta de crédito','05':'Monedero electrónico','06':'Dinero electrónico',
      '08':'Vales de despensa','12':'Dación en pago','13':'Pago por subrogación',
      '14':'Pago por consignación','15':'Condonación','17':'Compensación',
      '23':'Novación','24':'Confusión','25':'Remisión de deuda','26':'Prescripción',
      '27':'A satisfacción del acreedor','28':'Tarjeta de débito','29':'Tarjeta de servicios',
      '30':'Aplicación de anticipos','31':'Intermediario pagos','99':'Por definir'
    },
    METODOS_PAGO: { PUE: 'Pago en una exhibición', PPD: 'Pago en parcialidades o diferido' },
    MONEDAS: ['MXN','USD','EUR','CAD','GBP','JPY','XXX'],
    IMPUESTOS: {
      '001': { nombre: 'ISR', tasas: [0.0125, 0.10, 0.20, 0.30] },
      '002': { nombre: 'IVA', tasas: [0.00, 0.08, 0.16] },
      '003': { nombre: 'IEPS', tasas: [0.03, 0.06, 0.07, 0.08, 0.09, 0.265, 0.30, 0.53, 1.60] }
    }
  };

  // ============================================================
  // 2. VALIDADOR RFC (Persona Física y Moral)
  // ============================================================
  function validarRFC(rfc) {
    if (!rfc || typeof rfc !== 'string') return { valido: false, error: 'RFC vacío' };
    rfc = rfc.toUpperCase().trim().replace(/[\s-]/g, '');
    const PF = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
    const PM = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
    const GENERICO_NAC = 'XAXX010101000';
    const GENERICO_EXT = 'XEXX010101000';
    if (rfc === GENERICO_NAC) return { valido: true, tipo: 'generico_nacional', rfc };
    if (rfc === GENERICO_EXT) return { valido: true, tipo: 'generico_extranjero', rfc };
    let tipo = null;
    if (PF.test(rfc)) tipo = 'fisica';
    else if (PM.test(rfc)) tipo = 'moral';
    else return { valido: false, error: 'Formato RFC inválido' };
    const fechaStr = tipo === 'fisica' ? rfc.substr(4, 6) : rfc.substr(3, 6);
    const yy = parseInt(fechaStr.substr(0,2),10);
    const mm = parseInt(fechaStr.substr(2,2),10);
    const dd = parseInt(fechaStr.substr(4,2),10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { valido: false, error: 'Fecha inválida' };
    return { valido: true, tipo, rfc, fecha: `${yy}-${mm}-${dd}` };
  }

  function calcularDigitoVerificadorRFC(rfc) {
    const tabla = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';
    rfc = rfc.toUpperCase().padStart(12, ' ');
    let suma = 0;
    for (let i = 0; i < 12; i++) suma += tabla.indexOf(rfc[i]) * (13 - i);
    const r = 11 - (suma % 11);
    if (r === 11) return '0';
    if (r === 10) return 'A';
    return r.toString();
  }

  // ============================================================
  // 3. CÁLCULO DE IMPUESTOS Y RETENCIONES
  // ============================================================
  function calcularImpuestos(conceptos) {
    let subtotal = 0, ivaTrasladado = 0, iepsTrasladado = 0;
    let isrRetenido = 0, ivaRetenido = 0;
    const detalles = [];
    for (const c of conceptos) {
      const importe = round2(c.cantidad * c.valorUnitario);
      const descuento = round2(c.descuento || 0);
      const base = round2(importe - descuento);
      subtotal += importe;
      const det = { descripcion: c.descripcion, base, traslados: [], retenciones: [] };
      if (c.iva != null) {
        const iva = round2(base * c.iva);
        ivaTrasladado += iva;
        det.traslados.push({ impuesto: '002', tasa: c.iva, importe: iva });
      }
      if (c.ieps != null) {
        const ieps = round2(base * c.ieps);
        iepsTrasladado += ieps;
        det.traslados.push({ impuesto: '003', tasa: c.ieps, importe: ieps });
      }
      if (c.retIsr != null) {
        const r = round2(base * c.retIsr);
        isrRetenido += r;
        det.retenciones.push({ impuesto: '001', tasa: c.retIsr, importe: r });
      }
      if (c.retIva != null) {
        const r = round2(base * c.retIva);
        ivaRetenido += r;
        det.retenciones.push({ impuesto: '002', tasa: c.retIva, importe: r });
      }
      detalles.push(det);
    }
    const totalTraslados = round2(ivaTrasladado + iepsTrasladado);
    const totalRetenciones = round2(isrRetenido + ivaRetenido);
    const total = round2(subtotal + totalTraslados - totalRetenciones);
    return {
      subtotal: round2(subtotal),
      ivaTrasladado: round2(ivaTrasladado),
      iepsTrasladado: round2(iepsTrasladado),
      isrRetenido: round2(isrRetenido),
      ivaRetenido: round2(ivaRetenido),
      totalTraslados, totalRetenciones, total, detalles
    };
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  // ============================================================
  // 4. GENERADOR XML CFDI 4.0
  // ============================================================
  function generarCFDI(datos) {
    const v = validarDatosCFDI(datos);
    if (!v.valido) throw new Error('CFDI inválido: ' + v.errores.join(', '));
    const imp = calcularImpuestos(datos.conceptos);
    const fecha = (datos.fecha || new Date().toISOString()).slice(0, 19);
    const folio = datos.folio || generarFolio();
    const serie = datos.serie || 'A';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" ';
    xml += 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ';
    xml += `Version="${SAT.VERSION_CFDI}" Serie="${serie}" Folio="${folio}" `;
    xml += `Fecha="${fecha}" FormaPago="${datos.formaPago}" `;
    xml += `SubTotal="${imp.subtotal.toFixed(2)}" Moneda="${datos.moneda || 'MXN'}" `;
    xml += `Total="${imp.total.toFixed(2)}" TipoDeComprobante="${datos.tipo || 'I'}" `;
    xml += `MetodoPago="${datos.metodoPago}" LugarExpedicion="${datos.codigoPostal}" `;
    xml += `Exportacion="${datos.exportacion || '01'}">\n`;

    xml += `  <cfdi:Emisor Rfc="${datos.emisor.rfc}" Nombre="${esc(datos.emisor.nombre)}" RegimenFiscal="${datos.emisor.regimen}"/>\n`;
    xml += `  <cfdi:Receptor Rfc="${datos.receptor.rfc}" Nombre="${esc(datos.receptor.nombre)}" `;
    xml += `DomicilioFiscalReceptor="${datos.receptor.codigoPostal}" `;
    xml += `RegimenFiscalReceptor="${datos.receptor.regimen}" UsoCFDI="${datos.receptor.usoCFDI}"/>\n`;

    xml += '  <cfdi:Conceptos>\n';
    for (let i = 0; i < datos.conceptos.length; i++) {
      const c = datos.conceptos[i];
      const d = imp.detalles[i];
      xml += `    <cfdi:Concepto ClaveProdServ="${c.claveProdServ}" Cantidad="${c.cantidad}" `;
      xml += `ClaveUnidad="${c.claveUnidad}" Descripcion="${esc(c.descripcion)}" `;
      xml += `ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${(c.cantidad*c.valorUnitario).toFixed(2)}" `;
      xml += `ObjetoImp="${c.objetoImp || '02'}">\n`;
      if (d.traslados.length || d.retenciones.length) {
        xml += '      <cfdi:Impuestos>\n';
        if (d.traslados.length) {
          xml += '        <cfdi:Traslados>\n';
          for (const t of d.traslados)
            xml += `          <cfdi:Traslado Base="${d.base.toFixed(2)}" Impuesto="${t.impuesto}" TipoFactor="Tasa" TasaOCuota="${t.tasa.toFixed(6)}" Importe="${t.importe.toFixed(2)}"/>\n`;
          xml += '        </cfdi:Traslados>\n';
        }
        if (d.retenciones.length) {
          xml += '        <cfdi:Retenciones>\n';
          for (const r of d.retenciones)
            xml += `          <cfdi:Retencion Base="${d.base.toFixed(2)}" Impuesto="${r.impuesto}" TipoFactor="Tasa" TasaOCuota="${r.tasa.toFixed(6)}" Importe="${r.importe.toFixed(2)}"/>\n`;
          xml += '        </cfdi:Retenciones>\n';
        }
        xml += '      </cfdi:Impuestos>\n';
      }
      xml += '    </cfdi:Concepto>\n';
    }
    xml += '  </cfdi:Conceptos>\n';

    if (imp.totalTraslados || imp.totalRetenciones) {
      xml += `  <cfdi:Impuestos TotalImpuestosTrasladados="${imp.totalTraslados.toFixed(2)}" TotalImpuestosRetenidos="${imp.totalRetenciones.toFixed(2)}"/>\n`;
    }
    xml += '</cfdi:Comprobante>\n';
    return { xml, folio, serie, total: imp.total, impuestos: imp };
  }

  function validarDatosCFDI(d) {
    const errores = [];
    if (!d) errores.push('datos vacíos');
    else {
      if (!d.emisor || !validarRFC(d.emisor.rfc).valido) errores.push('RFC emisor inválido');
      if (!d.receptor || !validarRFC(d.receptor.rfc).valido) errores.push('RFC receptor inválido');
      if (!d.conceptos || !d.conceptos.length) errores.push('sin conceptos');
      if (!d.formaPago || !SAT.FORMAS_PAGO[d.formaPago]) errores.push('formaPago inválida');
      if (!d.metodoPago || !SAT.METODOS_PAGO[d.metodoPago]) errores.push('metodoPago inválido');
      if (!d.codigoPostal || !/^\d{5}$/.test(d.codigoPostal)) errores.push('CP emisor inválido');
    }
    return { valido: errores.length === 0, errores };
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }

  function generarFolio() {
    return Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2,4).toUpperCase();
  }

  // ============================================================
  // 5. COMPLEMENTO DE PAGOS 2.0
  // ============================================================
  function generarComplementoPago(pago) {
    const fecha = (pago.fechaPago || new Date().toISOString()).slice(0, 19);
    let xml = `<pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="${SAT.VERSION_PAGO}">\n`;
    const totalMon = pago.docs.reduce((s, d) => s + d.importePagado, 0);
    xml += `  <pago20:Totales MontoTotalPagos="${totalMon.toFixed(2)}"`;
    if (pago.totalIvaTrasladado) xml += ` TotalTrasladosBaseIVA16="${pago.baseIva16.toFixed(2)}" TotalTrasladosImpuestoIVA16="${pago.totalIvaTrasladado.toFixed(2)}"`;
    xml += '/>\n';
    xml += `  <pago20:Pago FechaPago="${fecha}" FormaDePagoP="${pago.formaPago}" MonedaP="${pago.moneda || 'MXN'}" `;
    xml += `Monto="${pago.monto.toFixed(2)}"`;
    if (pago.tipoCambio) xml += ` TipoCambioP="${pago.tipoCambio}"`;
    xml += '>\n';
    for (const d of pago.docs) {
      xml += `    <pago20:DoctoRelacionado IdDocumento="${d.uuid}" `;
      xml += `Serie="${d.serie}" Folio="${d.folio}" MonedaDR="${d.moneda || 'MXN'}" `;
      xml += `NumParcialidad="${d.numParcialidad || 1}" `;
      xml += `ImpSaldoAnt="${d.saldoAnterior.toFixed(2)}" `;
      xml += `ImpPagado="${d.importePagado.toFixed(2)}" `;
      xml += `ImpSaldoInsoluto="${(d.saldoAnterior - d.importePagado).toFixed(2)}" `;
      xml += `ObjetoImpDR="${d.objetoImp || '02'}"/>\n`;
    }
    xml += '  </pago20:Pago>\n';
    xml += '</pago20:Pagos>\n';
    return xml;
  }

  // ============================================================
  // 6. RETENCIONES (CFDI Retenciones e Información de Pagos 2.0)
  // ============================================================
  function generarRetencion(ret) {
    const fecha = (ret.fecha || new Date().toISOString()).slice(0, 19);
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<retenciones:Retenciones xmlns:retenciones="http://www.sat.gob.mx/esquemas/retencionpago/2" `;
    xml += `Version="${SAT.VERSION_RET}" FolioInt="${ret.folio}" `;
    xml += `Sello="" NumCert="" Cert="" `;
    xml += `FechaExp="${fecha}" CveRetenc="${ret.claveRetencion}">\n`;
    xml += `  <retenciones:Emisor RfcE="${ret.emisor.rfc}" NomDenRazSocE="${esc(ret.emisor.nombre)}" RegimenFiscalE="${ret.emisor.regimen}"/>\n`;
    xml += `  <retenciones:Receptor Nacionalidad="${ret.receptor.nacionalidad || 'Nacional'}">\n`;
    xml += `    <retenciones:Nacional RfcR="${ret.receptor.rfc}" NomDenRazSocR="${esc(ret.receptor.nombre)}" `;
    xml += `CURPR="${ret.receptor.curp || ''}"/>\n`;
    xml += '  </retenciones:Receptor>\n';
    xml += `  <retenciones:Periodo MesIni="${ret.mesInicial}" MesFin="${ret.mesFinal}" Ejercicio="${ret.ejercicio}"/>\n`;
    xml += `  <retenciones:Totales MontoTotOperacion="${ret.montoTotal.toFixed(2)}" `;
    xml += `MontoTotGrav="${ret.montoGravado.toFixed(2)}" `;
    xml += `MontoTotExent="${ret.montoExento.toFixed(2)}" `;
    xml += `MontoTotRet="${ret.montoRetenido.toFixed(2)}">\n`;
    for (const i of (ret.impuestosRetenidos || [])) {
      xml += `    <retenciones:ImpRetenidos BaseRet="${i.base.toFixed(2)}" `;
      xml += `ImpuestoRet="${i.impuesto}" montoRet="${i.monto.toFixed(2)}" TipoPagoRet="${i.tipoPago}"/>\n`;
    }
    xml += '  </retenciones:Totales>\n';
    xml += '</retenciones:Retenciones>\n';
    return xml;
  }

  // ============================================================
  // 7. DESCARGA ZIP DE XMLs (sin dependencia, ZIP store puro)
  // ============================================================
  function descargarZIPxmls(archivos, nombreZip) {
    if (!archivos || !archivos.length) throw new Error('Sin archivos');
    const zipBytes = construirZIP(archivos);
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreZip || `cfdis_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, nombre: a.download, size: zipBytes.length };
  }

  // CRC32 table
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function construirZIP(archivos) {
    const enc = new TextEncoder();
    const localParts = [], centralParts = [];
    let offset = 0;
    for (const f of archivos) {
      const nameBytes = enc.encode(f.nombre);
      const dataBytes = enc.encode(f.contenido);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;
      // Local file header
      const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(dataBytes, 30 + nameBytes.length);
      localParts.push(local);
      // Central directory
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length;
    }
    const centralOffset = offset;
    let centralSize = 0;
    centralParts.forEach(c => centralSize += c.length);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, archivos.length, true);
    ev.setUint16(10, archivos.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    const total = offset + centralSize + 22;
    const out = new Uint8Array(total);
    let p = 0;
    for (const x of localParts) { out.set(x, p); p += x.length; }
    for (const x of centralParts) { out.set(x, p); p += x.length; }
    out.set(end, p);
    return out;
  }

  // ============================================================
  // 8. UTILIDADES ADICIONALES
  // ============================================================
  function timbrarMock(xml) {
    const uuid = generarUUID();
    const fechaTimbrado = new Date().toISOString().slice(0, 19);
    const sello = btoa(xml.substr(0, 64)).substr(0, 64);
    const tfd = `<tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaTimbrado}" SelloCFD="${sello}" NoCertificadoSAT="00001000000500000000"/>`;
    return { uuid, fechaTimbrado, xmlTimbrado: xml.replace('</cfdi:Comprobante>', `<cfdi:Complemento>${tfd}</cfdi:Complemento></cfdi:Comprobante>`) };
  }

  function generarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }).toUpperCase();
  }

  function cancelarCFDI(uuid, motivo) {
    const motivos = { '01':'Errores con relación','02':'Errores sin relación','03':'No se llevó a cabo la operación','04':'Operación nominativa relacionada con factura global' };
    if (!motivos[motivo]) throw new Error('Motivo cancelación inválido');
    return { uuid, motivo, descripcion: motivos[motivo], fecha: new Date().toISOString(), estatus: 'pendiente_cancelacion' };
  }

  function reporteFiscal(cfdis, periodo) {
    const r = { periodo, total: 0, subtotal: 0, iva: 0, retenciones: 0, count: cfdis.length, porUso: {}, porFormaPago: {} };
    for (const c of cfdis) {
      r.total += c.total || 0;
      r.subtotal += c.subtotal || 0;
      r.iva += c.iva || 0;
      r.retenciones += c.retenciones || 0;
      r.porUso[c.usoCFDI] = (r.porUso[c.usoCFDI] || 0) + 1;
      r.porFormaPago[c.formaPago] = (r.porFormaPago[c.formaPago] || 0) + 1;
    }
    ['total','subtotal','iva','retenciones'].forEach(k => r[k] = round2(r[k]));
    return r;
  }

  // ============================================================
  // 9. EXPORT API GLOBAL
  // ============================================================
  global.FiscalAPI = {
    SAT,
    validarRFC,
    calcularDigitoVerificadorRFC,
    calcularImpuestos,
    generarCFDI,
    generarComplementoPago,
    generarRetencion,
    descargarZIPxmls,
    timbrarMock,
    generarUUID,
    cancelarCFDI,
    reporteFiscal,
    version: '1.0.0'
  };

  if (typeof console !== 'undefined') console.log('[FiscalAPI] cargada v1.0.0 - CFDI 4.0 listo');
})(typeof window !== 'undefined' ? window : this);
