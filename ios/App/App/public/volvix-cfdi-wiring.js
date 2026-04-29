/**
 * volvix-cfdi-wiring.js
 * Cliente front-end para integración CFDI 4.0 (México).
 * Expone Volvix.cfdi.{generar, cancelar, consultarEstatus} y validadores.
 *
 * Requiere que window.Volvix.api (volvix-api.js) provea fetchAuth o equivalente.
 * Si no existe, cae a fetch() simple con header Authorization tomado de localStorage.
 */
(function (global) {
  'use strict';

  const Volvix = global.Volvix = global.Volvix || {};

  // ─── Validadores SAT ──────────────────────────────────────────────────────
  // RFC: 3-4 letras + 6 dígitos (YYMMDD) + 3 alfanum homoclave
  const RFC_PERSONA_FISICA = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;
  const RFC_PERSONA_MORAL  = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
  const RFC_GENERICO_NAC   = 'XAXX010101000';
  const RFC_GENERICO_EXT   = 'XEXX010101000';

  // Códigos postales México: 5 dígitos
  const CP_REGEX = /^[0-9]{5}$/;

  // Régimen fiscal SAT (catálogo c_RegimenFiscal). Subconjunto frecuente.
  const REGIMENES_VALIDOS = new Set([
    '601','603','605','606','607','608','610','611','612','614','615','616',
    '620','621','622','623','624','625','626','628','629','630'
  ]);

  // Usos CFDI v4.0 (catálogo c_UsoCFDI)
  const USOS_CFDI_VALIDOS = new Set([
    'G01','G02','G03','I01','I02','I03','I04','I05','I06','I07','I08',
    'D01','D02','D03','D04','D05','D06','D07','D08','D09','D10',
    'S01','CP01','CN01'
  ]);

  function validarRFC(rfc) {
    if (typeof rfc !== 'string') return { ok: false, error: 'RFC debe ser string' };
    const r = rfc.toUpperCase().trim();
    if (r === RFC_GENERICO_NAC || r === RFC_GENERICO_EXT) return { ok: true, rfc: r, tipo: 'generico' };
    if (RFC_PERSONA_MORAL.test(r))  return { ok: true, rfc: r, tipo: 'moral' };
    if (RFC_PERSONA_FISICA.test(r)) return { ok: true, rfc: r, tipo: 'fisica' };
    return { ok: false, error: 'RFC con formato inválido' };
  }

  function validarCP(cp) {
    if (typeof cp !== 'string') cp = String(cp || '');
    if (!CP_REGEX.test(cp)) return { ok: false, error: 'Código postal debe ser 5 dígitos' };
    return { ok: true, cp };
  }

  function validarRegimen(regimen) {
    const r = String(regimen || '').trim();
    if (!REGIMENES_VALIDOS.has(r)) return { ok: false, error: `Régimen fiscal '${r}' no reconocido` };
    return { ok: true, regimen: r };
  }

  function validarUsoCFDI(uso) {
    const u = String(uso || '').trim().toUpperCase();
    if (!USOS_CFDI_VALIDOS.has(u)) return { ok: false, error: `Uso CFDI '${u}' no válido` };
    return { ok: true, uso: u };
  }

  function validarReceptor(receptor) {
    if (!receptor || typeof receptor !== 'object') return { ok: false, error: 'Receptor requerido' };
    const errs = [];
    const rfc = validarRFC(receptor.rfc);          if (!rfc.ok) errs.push('rfc: ' + rfc.error);
    const cp  = validarCP(receptor.codigo_postal); if (!cp.ok)  errs.push('codigo_postal: ' + cp.error);
    const reg = validarRegimen(receptor.regimen_fiscal); if (!reg.ok) errs.push('regimen_fiscal: ' + reg.error);
    const uso = validarUsoCFDI(receptor.uso_cfdi); if (!uso.ok) errs.push('uso_cfdi: ' + uso.error);
    if (!receptor.razon_social || String(receptor.razon_social).trim().length < 2) {
      errs.push('razon_social: requerida');
    }
    if (errs.length) return { ok: false, errors: errs };
    return { ok: true };
  }

  // ─── Helper HTTP ──────────────────────────────────────────────────────────
  async function callApi(method, path, body) {
    const session = JSON.parse(localStorage.getItem('volvix_session') || 'null');
    const token = session?.access_token || '';
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (_) { /* sin body */ }
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.details = data?.details;
      throw err;
    }
    return data;
  }

  // ─── API CFDI ─────────────────────────────────────────────────────────────
  const cfdi = {
    validators: { validarRFC, validarCP, validarRegimen, validarUsoCFDI, validarReceptor },

    /**
     * Genera CFDI 4.0 a partir de una venta existente.
     * @param {string} saleId UUID de la venta.
     * @param {object} [receptor] Datos receptor; si se omite el back usa los del cliente.
     * @returns {Promise<{uuid, xml, pdf_url, sello, certificado_no, fecha_timbrado}>}
     */
    async generar(saleId, receptor) {
      if (!saleId) throw new Error('saleId requerido');
      if (receptor) {
        const v = validarReceptor(receptor);
        if (!v.ok) {
          const e = new Error('Receptor inválido');
          e.details = v.errors || [v.error];
          throw e;
        }
      }
      return callApi('POST', '/api/invoices/cfdi', { sale_id: saleId, receptor });
    },

    /**
     * Cancela un CFDI ante el SAT.
     * @param {string} uuid UUID SAT del CFDI a cancelar.
     * @param {string} motivo Clave de motivo (01, 02, 03, 04).
     * @param {string} [folioSustitucion] UUID que sustituye (sólo motivo 01).
     */
    async cancelar(uuid, motivo, folioSustitucion) {
      if (!uuid) throw new Error('uuid requerido');
      const motivosValidos = new Set(['01','02','03','04']);
      if (!motivosValidos.has(String(motivo))) {
        throw new Error("motivo debe ser '01','02','03' o '04'");
      }
      if (motivo === '01' && !folioSustitucion) {
        throw new Error('motivo 01 requiere folioSustitucion');
      }
      return callApi('POST', '/api/invoices/cfdi/cancel', {
        uuid, motivo, folio_sustitucion: folioSustitucion || null
      });
    },

    /**
     * Consulta el estatus actual del CFDI ante el SAT.
     * @param {string} uuid
     */
    async consultarEstatus(uuid) {
      if (!uuid) throw new Error('uuid requerido');
      return callApi('GET', `/api/invoices/cfdi/${encodeURIComponent(uuid)}/status`);
    }
  };

  Volvix.cfdi = cfdi;
})(typeof window !== 'undefined' ? window : globalThis);
