/**
 * volvix-tax-wiring.js
 * Volvix POS - Advanced Tax Engine
 * Agent-30 / Ronda 8 Fibonacci
 *
 * Features:
 *  1. Multiple VAT rates (16%, 8%, 0%, exempt)
 *  2. IEPS (special products excise tax)
 *  3. ISR for services (income tax retention)
 *  4. Automatic calculation
 *  5. Per-product tax rate overrides
 *  6. Fiscal reporting
 *  7. Country-configurable
 *  8. CFDI compatible (Mexico)
 *  9. Medical fees (honorarios médicos) special handling
 * 10. Public window.TaxAPI surface
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. COUNTRY PROFILES
  // ─────────────────────────────────────────────────────────────
  const COUNTRY_PROFILES = {
    MX: {
      name: 'México',
      currency: 'MXN',
      vatRates: {
        general: 0.16,
        border: 0.08,
        zero: 0.0,
        exempt: null
      },
      iepsRates: {
        cigarrillos: 0.16,
        cigarros_puros: 0.304,
        bebidas_alcoholicas_low: 0.265,   // ≤14° GL
        bebidas_alcoholicas_mid: 0.30,    // >14° y ≤20° GL
        bebidas_alcoholicas_high: 0.53,   // >20° GL
        bebidas_saborizadas: 0.0,         // cuota fija por litro, ver cuotaPorLitro
        bebidas_energetizantes: 0.25,
        comida_chatarra: 0.08,
        combustibles_magna: 0.0,
        plaguicidas: 0.09
      },
      iepsCuotaPorLitro: {
        bebidas_saborizadas: 1.5026   // MXN/L 2024
      },
      isrRates: {
        honorarios: 0.10,                 // ISR retención por honorarios
        arrendamiento: 0.10,
        servicios_profesionales: 0.10
      },
      ivaRetencion: {
        honorarios: 2 / 3,                // 10.6667% efectivo (2/3 de 16)
        fletes: 0.04,
        servicios_profesionales: 2 / 3
      },
      cfdiUsage: [
        'G01', 'G02', 'G03',
        'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08',
        'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10',
        'P01', 'S01', 'CP01', 'CN01'
      ],
      cfdiPaymentMethod: ['PUE', 'PPD'],
      cfdiTipoComprobante: ['I', 'E', 'T', 'N', 'P']
    },
    US: {
      name: 'United States',
      currency: 'USD',
      salesTaxByState: {
        CA: 0.0725, TX: 0.0625, NY: 0.04, FL: 0.06, WA: 0.065,
        OR: 0.0, MT: 0.0, NH: 0.0, DE: 0.0, AK: 0.0
      },
      isrRates: {},
      vatRates: { general: 0 },
      iepsRates: {},
      ivaRetencion: {}
    },
    AR: {
      name: 'Argentina',
      currency: 'ARS',
      vatRates: {
        general: 0.21,
        reduced: 0.105,
        zero: 0.0,
        exempt: null
      },
      iibb: 0.03,
      isrRates: { ganancias: 0.06 },
      ivaRetencion: {},
      iepsRates: {}
    },
    CO: {
      name: 'Colombia',
      currency: 'COP',
      vatRates: {
        general: 0.19,
        reduced: 0.05,
        zero: 0.0,
        exempt: null
      },
      retefuente: 0.025,
      isrRates: {},
      ivaRetencion: {},
      iepsRates: {}
    },
    ES: {
      name: 'España',
      currency: 'EUR',
      vatRates: {
        general: 0.21,
        reduced: 0.10,
        super_reduced: 0.04,
        zero: 0.0,
        exempt: null
      },
      isrRates: { profesionales: 0.15 },
      ivaRetencion: {},
      iepsRates: {}
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. STATE
  // ─────────────────────────────────────────────────────────────
  const state = {
    country: 'MX',
    pricesIncludeTax: false,
    rounding: 2,
    transactions: [],
    productCatalog: new Map(),
    customRules: []
  };

  // ─────────────────────────────────────────────────────────────
  // 3. CORE HELPERS
  // ─────────────────────────────────────────────────────────────
  function round(n, dec) {
    dec = dec == null ? state.rounding : dec;
    const f = Math.pow(10, dec);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function getProfile(country) {
    const p = COUNTRY_PROFILES[country || state.country];
    if (!p) throw new Error('Country profile not found: ' + country);
    return p;
  }

  function uuid() {
    return 'tx-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. PRODUCT CATALOG
  // ─────────────────────────────────────────────────────────────
  function registerProduct(p) {
    if (!p || !p.sku) throw new Error('Product requires sku');
    const def = {
      sku: p.sku,
      name: p.name || p.sku,
      price: +p.price || 0,
      vatType: p.vatType || 'general',           // general|border|zero|exempt|reduced...
      iepsType: p.iepsType || null,              // key from iepsRates
      iepsCuotaLitros: p.iepsCuotaLitros || 0,   // for cuota-por-litro IEPS
      isrType: p.isrType || null,                // honorarios|arrendamiento|...
      withholding: !!p.withholding,
      cfdiClaveProdServ: p.cfdiClaveProdServ || '01010101',
      cfdiClaveUnidad: p.cfdiClaveUnidad || 'H87',
      isService: !!p.isService,
      isMedical: !!p.isMedical,
      country: p.country || state.country
    };
    state.productCatalog.set(def.sku, def);
    return def;
  }

  function getProduct(sku) {
    return state.productCatalog.get(sku) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. RATE RESOLVERS
  // ─────────────────────────────────────────────────────────────
  function resolveVatRate(product, country) {
    const profile = getProfile(country);
    const type = product.vatType || 'general';
    if (type === 'exempt') return { rate: null, exempt: true, type };
    const rate = profile.vatRates[type];
    if (rate == null && type !== 'exempt') {
      return { rate: profile.vatRates.general || 0, type: 'general' };
    }
    return { rate: rate || 0, type };
  }

  function resolveIepsRate(product, country) {
    const profile = getProfile(country);
    if (!product.iepsType) return { rate: 0, cuota: 0, type: null };
    const rate = profile.iepsRates[product.iepsType] || 0;
    const cuotaTbl = profile.iepsCuotaPorLitro || {};
    const cuota = cuotaTbl[product.iepsType] || 0;
    return { rate, cuota, type: product.iepsType };
  }

  function resolveIsrRate(product, country) {
    const profile = getProfile(country);
    if (!product.isrType) return { rate: 0, type: null };
    return {
      rate: profile.isrRates[product.isrType] || 0,
      type: product.isrType
    };
  }

  function resolveIvaRetencion(product, country) {
    const profile = getProfile(country);
    if (!product.withholding || !product.isrType) return { rate: 0 };
    const tbl = profile.ivaRetencion || {};
    const factor = tbl[product.isrType] || 0;
    const vat = resolveVatRate(product, country);
    if (factor <= 0 || !vat.rate) return { rate: 0 };
    // factor expressed as fraction of VAT (e.g. 2/3) OR direct rate (0.04)
    if (factor < 1 && factor > 0 && product.isrType === 'fletes') {
      return { rate: factor };
    }
    return { rate: round(vat.rate * factor, 6) };
  }

  // ─────────────────────────────────────────────────────────────
  // 6. LINE CALCULATION
  // ─────────────────────────────────────────────────────────────
  function calcLine(line, opts) {
    opts = opts || {};
    const country = opts.country || state.country;
    let product;
    if (line.sku && state.productCatalog.has(line.sku)) {
      product = Object.assign({}, getProduct(line.sku), line.overrides || {});
      if (line.price != null) product.price = +line.price;
    } else {
      product = {
        sku: line.sku || 'CUSTOM',
        name: line.name || 'Item',
        price: +line.price || 0,
        vatType: line.vatType || 'general',
        iepsType: line.iepsType || null,
        iepsCuotaLitros: line.iepsCuotaLitros || 0,
        isrType: line.isrType || null,
        withholding: !!line.withholding,
        isService: !!line.isService,
        isMedical: !!line.isMedical
      };
    }

    const qty = +line.quantity || 1;
    const discount = +line.discount || 0;
    const pricesIncludeTax = opts.pricesIncludeTax != null
      ? opts.pricesIncludeTax
      : state.pricesIncludeTax;

    const vat = resolveVatRate(product, country);
    const ieps = resolveIepsRate(product, country);
    const isr = resolveIsrRate(product, country);
    const ivaRet = resolveIvaRetencion(product, country);

    let unitPrice = product.price;
    let subtotal, iepsAmount, vatAmount;

    if (pricesIncludeTax) {
      // back out taxes from gross
      const totalRate = (vat.rate || 0) + (ieps.rate || 0);
      const gross = (unitPrice * qty) - discount;
      subtotal = gross / (1 + totalRate);
      iepsAmount = subtotal * (ieps.rate || 0);
      vatAmount = vat.exempt ? 0 : subtotal * (vat.rate || 0);
    } else {
      subtotal = (unitPrice * qty) - discount;
      iepsAmount = subtotal * (ieps.rate || 0);
      // cuota fija por litro (e.g. saborizadas)
      if (ieps.cuota && product.iepsCuotaLitros) {
        iepsAmount += ieps.cuota * product.iepsCuotaLitros * qty;
      }
      const baseVat = subtotal + iepsAmount;
      vatAmount = vat.exempt ? 0 : baseVat * (vat.rate || 0);
    }

    // Medical services: VAT 0%, ISR retention applies if billed by individual
    if (product.isMedical) {
      vatAmount = 0;
      vat.type = 'exempt-medical';
      vat.exempt = true;
    }

    const isrAmount = subtotal * (isr.rate || 0);
    const ivaRetAmount = vatAmount * (ivaRet.rate || 0);

    const total = subtotal + iepsAmount + vatAmount - isrAmount - ivaRetAmount;

    return {
      sku: product.sku,
      name: product.name,
      quantity: qty,
      unitPrice: round(unitPrice),
      discount: round(discount),
      subtotal: round(subtotal),
      ieps: { type: ieps.type, rate: ieps.rate, amount: round(iepsAmount) },
      vat: {
        type: vat.type, rate: vat.rate, exempt: !!vat.exempt,
        amount: round(vatAmount)
      },
      isrRetention: { type: isr.type, rate: isr.rate, amount: round(isrAmount) },
      vatRetention: { rate: ivaRet.rate, amount: round(ivaRetAmount) },
      total: round(total)
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 7. TRANSACTION CALCULATION
  // ─────────────────────────────────────────────────────────────
  function calcTransaction(tx, opts) {
    opts = opts || {};
    const country = opts.country || tx.country || state.country;
    const lines = (tx.lines || []).map(l => calcLine(l, { country: country, pricesIncludeTax: opts.pricesIncludeTax }));

    const totals = lines.reduce((acc, l) => {
      acc.subtotal += l.subtotal;
      acc.discount += l.discount;
      acc.ieps += l.ieps.amount;
      acc.vat += l.vat.amount;
      acc.isrRetention += l.isrRetention.amount;
      acc.vatRetention += l.vatRetention.amount;
      acc.total += l.total;
      return acc;
    }, { subtotal: 0, discount: 0, ieps: 0, vat: 0, isrRetention: 0, vatRetention: 0, total: 0 });

    Object.keys(totals).forEach(k => totals[k] = round(totals[k]));

    return {
      id: tx.id || uuid(),
      country: country,
      currency: getProfile(country).currency,
      timestamp: tx.timestamp || new Date().toISOString(),
      customer: tx.customer || null,
      lines: lines,
      totals: totals
    };
  }

  function recordTransaction(tx) {
    const result = calcTransaction(tx);
    state.transactions.push(result);
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // 8. CFDI (MEXICO)
  // ─────────────────────────────────────────────────────────────
  function buildCFDI(tx, fiscalData) {
    if ((tx.country || state.country) !== 'MX') {
      throw new Error('CFDI only applies to Mexico');
    }
    fiscalData = fiscalData || {};
    const profile = getProfile('MX');
    const usoCFDI = fiscalData.usoCFDI || 'G03';
    if (!profile.cfdiUsage.includes(usoCFDI)) {
      throw new Error('Invalid Uso CFDI: ' + usoCFDI);
    }
    const metodoPago = fiscalData.metodoPago || 'PUE';
    const tipoComprobante = fiscalData.tipoComprobante || 'I';

    const conceptos = tx.lines.map((l, i) => ({
      ClaveProdServ: (getProduct(l.sku) || {}).cfdiClaveProdServ || '01010101',
      NoIdentificacion: l.sku,
      Cantidad: l.quantity,
      ClaveUnidad: (getProduct(l.sku) || {}).cfdiClaveUnidad || 'H87',
      Descripcion: l.name,
      ValorUnitario: l.unitPrice,
      Importe: round(l.unitPrice * l.quantity),
      Descuento: l.discount,
      Impuestos: {
        Traslados: [
          l.vat.exempt ? null : {
            Base: l.subtotal,
            Impuesto: '002',           // 002 = IVA
            TipoFactor: l.vat.rate === 0 ? 'Tasa' : 'Tasa',
            TasaOCuota: l.vat.rate.toFixed(6),
            Importe: l.vat.amount
          },
          l.ieps.amount > 0 ? {
            Base: l.subtotal,
            Impuesto: '003',           // 003 = IEPS
            TipoFactor: 'Tasa',
            TasaOCuota: (l.ieps.rate || 0).toFixed(6),
            Importe: l.ieps.amount
          } : null
        ].filter(Boolean),
        Retenciones: [
          l.isrRetention.amount > 0 ? {
            Impuesto: '001',           // 001 = ISR
            Importe: l.isrRetention.amount
          } : null,
          l.vatRetention.amount > 0 ? {
            Impuesto: '002',
            Importe: l.vatRetention.amount
          } : null
        ].filter(Boolean)
      }
    }));

    return {
      Version: '4.0',
      Serie: fiscalData.serie || 'A',
      Folio: fiscalData.folio || tx.id,
      Fecha: tx.timestamp,
      FormaPago: fiscalData.formaPago || '01',
      MetodoPago: metodoPago,
      TipoDeComprobante: tipoComprobante,
      Moneda: tx.currency,
      SubTotal: tx.totals.subtotal,
      Descuento: tx.totals.discount,
      Total: tx.totals.total,
      LugarExpedicion: fiscalData.codigoPostal || '00000',
      Emisor: fiscalData.emisor || { Rfc: 'XAXX010101000', Nombre: 'EMISOR', RegimenFiscal: '601' },
      Receptor: Object.assign({
        Rfc: 'XAXX010101000',
        Nombre: 'PUBLICO EN GENERAL',
        DomicilioFiscalReceptor: '00000',
        RegimenFiscalReceptor: '616',
        UsoCFDI: usoCFDI
      }, fiscalData.receptor || {}),
      Conceptos: conceptos,
      Impuestos: {
        TotalImpuestosTrasladados: tx.totals.vat + tx.totals.ieps,
        TotalImpuestosRetenidos: tx.totals.isrRetention + tx.totals.vatRetention
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 9. FISCAL REPORTING
  // ─────────────────────────────────────────────────────────────
  function reportRange(fromISO, toISO, country) {
    const from = new Date(fromISO).getTime();
    const to = new Date(toISO).getTime();
    const filtered = state.transactions.filter(t => {
      const ts = new Date(t.timestamp).getTime();
      return ts >= from && ts <= to && (!country || t.country === country);
    });

    const agg = {
      count: filtered.length,
      subtotal: 0, discount: 0, vat: 0, ieps: 0,
      isrRetention: 0, vatRetention: 0, total: 0,
      vatByRate: {}, iepsByType: {}
    };

    filtered.forEach(tx => {
      agg.subtotal += tx.totals.subtotal;
      agg.discount += tx.totals.discount;
      agg.vat += tx.totals.vat;
      agg.ieps += tx.totals.ieps;
      agg.isrRetention += tx.totals.isrRetention;
      agg.vatRetention += tx.totals.vatRetention;
      agg.total += tx.totals.total;
      tx.lines.forEach(l => {
        const rk = l.vat.exempt ? 'exempt' : (l.vat.rate * 100).toFixed(2) + '%';
        agg.vatByRate[rk] = (agg.vatByRate[rk] || 0) + l.vat.amount;
        if (l.ieps.amount > 0) {
          const ik = l.ieps.type || 'other';
          agg.iepsByType[ik] = (agg.iepsByType[ik] || 0) + l.ieps.amount;
        }
      });
    });

    Object.keys(agg).forEach(k => {
      if (typeof agg[k] === 'number') agg[k] = round(agg[k]);
    });
    Object.keys(agg.vatByRate).forEach(k => agg.vatByRate[k] = round(agg.vatByRate[k]));
    Object.keys(agg.iepsByType).forEach(k => agg.iepsByType[k] = round(agg.iepsByType[k]));

    return {
      from: fromISO, to: toISO, country: country || 'ALL',
      generated: new Date().toISOString(),
      summary: agg,
      transactionIds: filtered.map(t => t.id)
    };
  }

  function reportMonthlyDIOT(year, month) {
    // Declaración Informativa de Operaciones con Terceros (México)
    const from = new Date(year, month - 1, 1).toISOString();
    const to = new Date(year, month, 0, 23, 59, 59).toISOString();
    const r = reportRange(from, to, 'MX');
    r.report = 'DIOT';
    return r;
  }

  function reportMedicalFees(fromISO, toISO) {
    const from = new Date(fromISO).getTime();
    const to = new Date(toISO).getTime();
    const items = [];
    state.transactions.forEach(tx => {
      const ts = new Date(tx.timestamp).getTime();
      if (ts < from || ts > to) return;
      tx.lines.forEach(l => {
        const p = getProduct(l.sku);
        if (p && p.isMedical) {
          items.push({
            txId: tx.id, date: tx.timestamp,
            patient: tx.customer ? tx.customer.name : null,
            description: l.name, amount: l.subtotal,
            isrRetained: l.isrRetention.amount
          });
        }
      });
    });
    return {
      report: 'HONORARIOS_MEDICOS',
      from: fromISO, to: toISO,
      count: items.length,
      total: round(items.reduce((s, i) => s + i.amount, 0)),
      isrTotal: round(items.reduce((s, i) => s + i.isrRetained, 0)),
      items: items
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 10. CUSTOM RULES
  // ─────────────────────────────────────────────────────────────
  function addCustomRule(name, fn) {
    if (typeof fn !== 'function') throw new Error('Rule must be function');
    state.customRules.push({ name: name, fn: fn });
  }

  function applyCustomRules(tx) {
    state.customRules.forEach(r => {
      try { r.fn(tx); } catch (e) { console.warn('Rule', r.name, 'failed:', e); }
    });
    return tx;
  }

  // ─────────────────────────────────────────────────────────────
  // 11. CONFIG
  // ─────────────────────────────────────────────────────────────
  function configure(cfg) {
    cfg = cfg || {};
    if (cfg.country) {
      if (!COUNTRY_PROFILES[cfg.country]) throw new Error('Unknown country: ' + cfg.country);
      state.country = cfg.country;
    }
    if (cfg.pricesIncludeTax != null) state.pricesIncludeTax = !!cfg.pricesIncludeTax;
    if (cfg.rounding != null) state.rounding = +cfg.rounding;
    return getConfig();
  }

  function getConfig() {
    return {
      country: state.country,
      profile: getProfile(state.country).name,
      currency: getProfile(state.country).currency,
      pricesIncludeTax: state.pricesIncludeTax,
      rounding: state.rounding,
      productCount: state.productCatalog.size,
      transactionCount: state.transactions.length
    };
  }

  function listCountries() {
    return Object.keys(COUNTRY_PROFILES).map(k => ({
      code: k, name: COUNTRY_PROFILES[k].name, currency: COUNTRY_PROFILES[k].currency
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // 12. PUBLIC API
  // ─────────────────────────────────────────────────────────────
  const TaxAPI = {
    version: '1.0.0-fib8-agent30',

    // config
    configure: configure,
    getConfig: getConfig,
    listCountries: listCountries,
    getCountryProfile: function (c) { return getProfile(c); },

    // catalog
    registerProduct: registerProduct,
    getProduct: getProduct,
    listProducts: function () { return Array.from(state.productCatalog.values()); },
    removeProduct: function (sku) { return state.productCatalog.delete(sku); },

    // calculation
    calcLine: calcLine,
    calcTransaction: calcTransaction,
    recordTransaction: function (tx) {
      const r = recordTransaction(tx);
      applyCustomRules(r);
      return r;
    },

    // CFDI
    buildCFDI: buildCFDI,

    // reporting
    reportRange: reportRange,
    reportMonthlyDIOT: reportMonthlyDIOT,
    reportMedicalFees: reportMedicalFees,
    listTransactions: function () { return state.transactions.slice(); },
    clearTransactions: function () { state.transactions = []; },

    // custom rules
    addCustomRule: addCustomRule,

    // rate inspection
    resolveVatRate: resolveVatRate,
    resolveIepsRate: resolveIepsRate,
    resolveIsrRate: resolveIsrRate,

    // utils
    round: round,
    _state: state,
    _profiles: COUNTRY_PROFILES
  };

  // ─────────────────────────────────────────────────────────────
  // 13. INSTALL
  // ─────────────────────────────────────────────────────────────
  if (typeof global !== 'undefined') {
    global.TaxAPI = TaxAPI;
    global.VolvixTax = TaxAPI;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaxAPI;
  }

  // ─────────────────────────────────────────────────────────────
  // 14. SELF-TEST (only in browser console)
  // ─────────────────────────────────────────────────────────────
  TaxAPI.selfTest = function () {
    configure({ country: 'MX', pricesIncludeTax: false });
    registerProduct({ sku: 'PAN-001', name: 'Pan', price: 20, vatType: 'zero' });
    registerProduct({ sku: 'REF-001', name: 'Refresco 600ml', price: 18, vatType: 'general', iepsType: 'bebidas_saborizadas', iepsCuotaLitros: 0.6 });
    registerProduct({ sku: 'CIG-001', name: 'Cigarros', price: 70, vatType: 'general', iepsType: 'cigarrillos' });
    registerProduct({ sku: 'HON-MED', name: 'Consulta médica', price: 800, vatType: 'exempt', isService: true, isMedical: true, isrType: 'honorarios', withholding: true });
    registerProduct({ sku: 'SRV-001', name: 'Honorarios contables', price: 5000, vatType: 'general', isService: true, isrType: 'honorarios', withholding: true });

    const tx = TaxAPI.recordTransaction({
      customer: { rfc: 'XAXX010101000', name: 'Cliente Demo' },
      lines: [
        { sku: 'PAN-001', quantity: 3 },
        { sku: 'REF-001', quantity: 2 },
        { sku: 'CIG-001', quantity: 1 },
        { sku: 'HON-MED', quantity: 1 },
        { sku: 'SRV-001', quantity: 1 }
      ]
    });
    return { config: getConfig(), transaction: tx };
  };

  if (typeof console !== 'undefined') {
    console.log('[VolvixTax] tax engine ready - country:', state.country,
      '- window.TaxAPI exposed');
  }
})(typeof window !== 'undefined' ? window : globalThis);
