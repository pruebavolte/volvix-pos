/**
 * volvix-accounting-wiring.js
 * Sistema Contable Volvix POS - Agent-59 R9
 * Contabilidad básica: catálogo de cuentas, asientos, balances, reportes fiscales
 * window.AccountingAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // 1. CATÁLOGO DE CUENTAS (Plan Contable General)
  // ============================================================
  const CHART_OF_ACCOUNTS = {
    // ACTIVOS (1xxx)
    '1000': { name: 'Activos', type: 'ACTIVO', nature: 'DEUDORA', parent: null, level: 1 },
    '1100': { name: 'Activo Circulante', type: 'ACTIVO', nature: 'DEUDORA', parent: '1000', level: 2 },
    '1101': { name: 'Caja', type: 'ACTIVO', nature: 'DEUDORA', parent: '1100', level: 3 },
    '1102': { name: 'Bancos', type: 'ACTIVO', nature: 'DEUDORA', parent: '1100', level: 3 },
    '1103': { name: 'Cuentas por Cobrar', type: 'ACTIVO', nature: 'DEUDORA', parent: '1100', level: 3 },
    '1104': { name: 'Inventario de Mercancías', type: 'ACTIVO', nature: 'DEUDORA', parent: '1100', level: 3 },
    '1105': { name: 'IVA Acreditable', type: 'ACTIVO', nature: 'DEUDORA', parent: '1100', level: 3 },
    '1200': { name: 'Activo Fijo', type: 'ACTIVO', nature: 'DEUDORA', parent: '1000', level: 2 },
    '1201': { name: 'Mobiliario y Equipo', type: 'ACTIVO', nature: 'DEUDORA', parent: '1200', level: 3 },
    '1202': { name: 'Equipo de Cómputo', type: 'ACTIVO', nature: 'DEUDORA', parent: '1200', level: 3 },
    '1203': { name: 'Depreciación Acumulada', type: 'ACTIVO', nature: 'ACREEDORA', parent: '1200', level: 3 },

    // PASIVOS (2xxx)
    '2000': { name: 'Pasivos', type: 'PASIVO', nature: 'ACREEDORA', parent: null, level: 1 },
    '2100': { name: 'Pasivo Circulante', type: 'PASIVO', nature: 'ACREEDORA', parent: '2000', level: 2 },
    '2101': { name: 'Proveedores', type: 'PASIVO', nature: 'ACREEDORA', parent: '2100', level: 3 },
    '2102': { name: 'Acreedores Diversos', type: 'PASIVO', nature: 'ACREEDORA', parent: '2100', level: 3 },
    '2103': { name: 'IVA por Pagar', type: 'PASIVO', nature: 'ACREEDORA', parent: '2100', level: 3 },
    '2104': { name: 'ISR por Pagar', type: 'PASIVO', nature: 'ACREEDORA', parent: '2100', level: 3 },
    '2105': { name: 'Sueldos por Pagar', type: 'PASIVO', nature: 'ACREEDORA', parent: '2100', level: 3 },
    '2200': { name: 'Pasivo Largo Plazo', type: 'PASIVO', nature: 'ACREEDORA', parent: '2000', level: 2 },
    '2201': { name: 'Préstamos Bancarios LP', type: 'PASIVO', nature: 'ACREEDORA', parent: '2200', level: 3 },

    // CAPITAL (3xxx)
    '3000': { name: 'Capital', type: 'CAPITAL', nature: 'ACREEDORA', parent: null, level: 1 },
    '3001': { name: 'Capital Social', type: 'CAPITAL', nature: 'ACREEDORA', parent: '3000', level: 2 },
    '3002': { name: 'Utilidades Retenidas', type: 'CAPITAL', nature: 'ACREEDORA', parent: '3000', level: 2 },
    '3003': { name: 'Utilidad del Ejercicio', type: 'CAPITAL', nature: 'ACREEDORA', parent: '3000', level: 2 },

    // INGRESOS (4xxx)
    '4000': { name: 'Ingresos', type: 'INGRESO', nature: 'ACREEDORA', parent: null, level: 1 },
    '4001': { name: 'Ventas', type: 'INGRESO', nature: 'ACREEDORA', parent: '4000', level: 2 },
    '4002': { name: 'Devoluciones sobre Ventas', type: 'INGRESO', nature: 'DEUDORA', parent: '4000', level: 2 },
    '4003': { name: 'Otros Ingresos', type: 'INGRESO', nature: 'ACREEDORA', parent: '4000', level: 2 },

    // COSTOS Y GASTOS (5xxx)
    '5000': { name: 'Costos y Gastos', type: 'GASTO', nature: 'DEUDORA', parent: null, level: 1 },
    '5001': { name: 'Costo de Ventas', type: 'GASTO', nature: 'DEUDORA', parent: '5000', level: 2 },
    '5100': { name: 'Gastos de Operación', type: 'GASTO', nature: 'DEUDORA', parent: '5000', level: 2 },
    '5101': { name: 'Sueldos y Salarios', type: 'GASTO', nature: 'DEUDORA', parent: '5100', level: 3 },
    '5102': { name: 'Renta', type: 'GASTO', nature: 'DEUDORA', parent: '5100', level: 3 },
    '5103': { name: 'Servicios (Luz, Agua, Internet)', type: 'GASTO', nature: 'DEUDORA', parent: '5100', level: 3 },
    '5104': { name: 'Papelería', type: 'GASTO', nature: 'DEUDORA', parent: '5100', level: 3 },
    '5105': { name: 'Comisiones Bancarias', type: 'GASTO', nature: 'DEUDORA', parent: '5100', level: 3 },
    '5106': { name: 'Depreciaciones', type: 'GASTO', nature: 'DEUDORA', parent: '5100', level: 3 },
    '5200': { name: 'Gastos Financieros', type: 'GASTO', nature: 'DEUDORA', parent: '5000', level: 2 },
    '5201': { name: 'Intereses Pagados', type: 'GASTO', nature: 'DEUDORA', parent: '5200', level: 3 }
  };

  // ============================================================
  // 2. ESTADO INTERNO (LocalStorage-backed)
  // ============================================================
  const STORAGE_KEY = 'volvix_accounting_v1';
  const _state = {
    journal: [],          // asientos contables
    nextEntryId: 1,
    fiscalYear: new Date().getFullYear(),
    bankReconciliations: [],
    closedPeriods: []
  };

  function _persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); }
    catch (e) { console.warn('[Accounting] Persist failed:', e); }
  }
  function _restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(_state, JSON.parse(raw));
    } catch (e) { console.warn('[Accounting] Restore failed:', e); }
  }
  _restore();

  // ============================================================
  // 3. UTILIDADES
  // ============================================================
  function _round(n) { return Math.round((+n + Number.EPSILON) * 100) / 100; }
  function _isoDate(d) { return (d ? new Date(d) : new Date()).toISOString().slice(0, 10); }
  function _validateAccount(code) {
    if (!CHART_OF_ACCOUNTS[code]) throw new Error(`Cuenta inexistente: ${code}`);
    return CHART_OF_ACCOUNTS[code];
  }
  function _inPeriod(dateStr, from, to) {
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
  }

  // ============================================================
  // 4. ASIENTOS CONTABLES (Journal Entries)
  // ============================================================
  /**
   * Crea un asiento contable balanceado.
   * @param {Object} entry { date, concept, lines: [{account, debit, credit, description}] }
   */
  function createJournalEntry(entry) {
    if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 2)
      throw new Error('Asiento requiere al menos 2 líneas (partida doble)');

    let totalDebit = 0, totalCredit = 0;
    const lines = entry.lines.map((l, i) => {
      _validateAccount(l.account);
      const debit = _round(l.debit || 0);
      const credit = _round(l.credit || 0);
      if (debit > 0 && credit > 0) throw new Error(`Línea ${i}: no puede tener cargo y abono simultáneos`);
      if (debit === 0 && credit === 0) throw new Error(`Línea ${i}: monto requerido`);
      totalDebit = _round(totalDebit + debit);
      totalCredit = _round(totalCredit + credit);
      return {
        account: l.account,
        accountName: CHART_OF_ACCOUNTS[l.account].name,
        debit, credit,
        description: l.description || ''
      };
    });

    if (totalDebit !== totalCredit)
      throw new Error(`Asiento descuadrado: Cargos ${totalDebit} ≠ Abonos ${totalCredit}`);

    const je = {
      id: _state.nextEntryId++,
      date: _isoDate(entry.date),
      concept: entry.concept || 'Sin concepto',
      reference: entry.reference || '',
      lines,
      totalDebit, totalCredit,
      createdAt: new Date().toISOString(),
      void: false
    };
    _state.journal.push(je);
    _persist();
    return je;
  }

  function voidJournalEntry(id, reason) {
    const je = _state.journal.find(x => x.id === id);
    if (!je) throw new Error(`Asiento ${id} no encontrado`);
    je.void = true;
    je.voidReason = reason || '';
    je.voidedAt = new Date().toISOString();
    _persist();
    return je;
  }

  function listJournal(filter) {
    filter = filter || {};
    return _state.journal.filter(je =>
      !je.void &&
      _inPeriod(je.date, filter.from, filter.to) &&
      (!filter.account || je.lines.some(l => l.account === filter.account))
    );
  }

  // ============================================================
  // 5. LIBRO MAYOR (General Ledger)
  // ============================================================
  function getLedger(accountCode, opts) {
    opts = opts || {};
    _validateAccount(accountCode);
    const entries = [];
    let balance = 0;
    const acc = CHART_OF_ACCOUNTS[accountCode];

    listJournal({ from: opts.from, to: opts.to })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .forEach(je => {
        je.lines.filter(l => l.account === accountCode).forEach(l => {
          if (acc.nature === 'DEUDORA') balance = _round(balance + l.debit - l.credit);
          else                          balance = _round(balance + l.credit - l.debit);
          entries.push({
            entryId: je.id, date: je.date, concept: je.concept,
            debit: l.debit, credit: l.credit, balance
          });
        });
      });
    return { account: accountCode, name: acc.name, nature: acc.nature, entries, finalBalance: balance };
  }

  function getAccountBalance(accountCode, opts) {
    return getLedger(accountCode, opts).finalBalance;
  }

  // Saldo agregado incluyendo subcuentas
  function getAggregatedBalance(parentCode, opts) {
    const children = Object.keys(CHART_OF_ACCOUNTS)
      .filter(c => CHART_OF_ACCOUNTS[c].parent === parentCode);
    let total = getAccountBalance(parentCode, opts);
    children.forEach(c => { total = _round(total + getAggregatedBalance(c, opts)); });
    return total;
  }

  // ============================================================
  // 6. BALANZA DE COMPROBACIÓN
  // ============================================================
  function trialBalance(opts) {
    opts = opts || {};
    const rows = [];
    let totalDebit = 0, totalCredit = 0;

    Object.keys(CHART_OF_ACCOUNTS).forEach(code => {
      const acc = CHART_OF_ACCOUNTS[code];
      if (acc.level < 3) return; // solo cuentas de detalle
      let debit = 0, credit = 0;
      listJournal({ from: opts.from, to: opts.to, account: code }).forEach(je => {
        je.lines.filter(l => l.account === code).forEach(l => {
          debit = _round(debit + l.debit);
          credit = _round(credit + l.credit);
        });
      });
      if (debit === 0 && credit === 0) return;
      const balance = acc.nature === 'DEUDORA' ? _round(debit - credit) : _round(credit - debit);
      rows.push({ code, name: acc.name, type: acc.type, debit, credit, balance });
      totalDebit = _round(totalDebit + debit);
      totalCredit = _round(totalCredit + credit);
    });
    return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
  }

  // ============================================================
  // 7. BALANCE GENERAL (Estado de Situación Financiera)
  // ============================================================
  function balanceSheet(opts) {
    opts = opts || {};
    const at = opts.at || _isoDate();
    const period = { to: at };

    const activos = {
      circulante: {
        caja:        getAccountBalance('1101', period),
        bancos:      getAccountBalance('1102', period),
        clientes:    getAccountBalance('1103', period),
        inventario:  getAccountBalance('1104', period),
        ivaAcred:    getAccountBalance('1105', period)
      },
      fijo: {
        mobiliario:   getAccountBalance('1201', period),
        computo:      getAccountBalance('1202', period),
        depreciacion: -Math.abs(getAccountBalance('1203', period))
      }
    };
    const totalCirculante = _round(Object.values(activos.circulante).reduce((a, b) => a + b, 0));
    const totalFijo = _round(Object.values(activos.fijo).reduce((a, b) => a + b, 0));
    const totalActivo = _round(totalCirculante + totalFijo);

    const pasivos = {
      circulante: {
        proveedores: getAccountBalance('2101', period),
        acreedores:  getAccountBalance('2102', period),
        ivaPagar:    getAccountBalance('2103', period),
        isrPagar:    getAccountBalance('2104', period),
        sueldos:     getAccountBalance('2105', period)
      },
      largoPlazo: {
        prestamos: getAccountBalance('2201', period)
      }
    };
    const totalPasivoCirc = _round(Object.values(pasivos.circulante).reduce((a, b) => a + b, 0));
    const totalPasivoLP = _round(Object.values(pasivos.largoPlazo).reduce((a, b) => a + b, 0));
    const totalPasivo = _round(totalPasivoCirc + totalPasivoLP);

    const utilidadEjercicio = incomeStatement({ to: at }).utilidadNeta;
    const capital = {
      capitalSocial:   getAccountBalance('3001', period),
      utilRetenidas:   getAccountBalance('3002', period),
      utilEjercicio:   utilidadEjercicio
    };
    const totalCapital = _round(Object.values(capital).reduce((a, b) => a + b, 0));

    return {
      fecha: at,
      activos: { ...activos, totalCirculante, totalFijo, totalActivo },
      pasivos: { ...pasivos, totalPasivoCirc, totalPasivoLP, totalPasivo },
      capital: { ...capital, totalCapital },
      totalPasivoCapital: _round(totalPasivo + totalCapital),
      cuadrado: _round(totalActivo - totalPasivo - totalCapital) === 0
    };
  }

  // ============================================================
  // 8. ESTADO DE RESULTADOS (Income Statement)
  // ============================================================
  function incomeStatement(opts) {
    opts = opts || {};
    const period = { from: opts.from, to: opts.to || _isoDate() };

    const ventas             = getAccountBalance('4001', period);
    const devoluciones       = getAccountBalance('4002', period);
    const otrosIngresos      = getAccountBalance('4003', period);
    const ventasNetas        = _round(ventas - devoluciones);

    const costoVentas        = getAccountBalance('5001', period);
    const utilidadBruta      = _round(ventasNetas - costoVentas);

    const sueldos            = getAccountBalance('5101', period);
    const renta              = getAccountBalance('5102', period);
    const servicios          = getAccountBalance('5103', period);
    const papeleria          = getAccountBalance('5104', period);
    const comisiones         = getAccountBalance('5105', period);
    const depreciaciones     = getAccountBalance('5106', period);
    const totalGastosOper    = _round(sueldos + renta + servicios + papeleria + comisiones + depreciaciones);

    const utilidadOperacion  = _round(utilidadBruta - totalGastosOper);

    const intereses          = getAccountBalance('5201', period);
    const utilidadAntesImp   = _round(utilidadOperacion + otrosIngresos - intereses);

    const tasaISR = opts.tasaISR != null ? opts.tasaISR : 0.30;
    const isr = utilidadAntesImp > 0 ? _round(utilidadAntesImp * tasaISR) : 0;
    const utilidadNeta = _round(utilidadAntesImp - isr);

    return {
      periodo: period,
      ingresos: { ventas, devoluciones, ventasNetas, otrosIngresos },
      costoVentas,
      utilidadBruta,
      gastosOperacion: { sueldos, renta, servicios, papeleria, comisiones, depreciaciones, total: totalGastosOper },
      utilidadOperacion,
      gastosFinancieros: { intereses },
      utilidadAntesImp,
      isr,
      utilidadNeta,
      margenes: {
        bruto:    ventasNetas ? _round(utilidadBruta / ventasNetas * 100) : 0,
        operativo: ventasNetas ? _round(utilidadOperacion / ventasNetas * 100) : 0,
        neto:     ventasNetas ? _round(utilidadNeta / ventasNetas * 100) : 0
      }
    };
  }

  // ============================================================
  // 9. CONCILIACIÓN BANCARIA
  // ============================================================
  function bankReconciliation(input) {
    /*
      input: {
        bankAccount: '1102',
        statementDate: 'YYYY-MM-DD',
        statementBalance: number,        // saldo según banco
        bankTransactions: [{ date, amount, type:'CARGO'|'ABONO', desc, reference }]
      }
    */
    if (!input || !input.bankAccount) throw new Error('bankAccount requerido');
    _validateAccount(input.bankAccount);

    const bookBalance = getAccountBalance(input.bankAccount, { to: input.statementDate });
    const bookEntries = listJournal({ to: input.statementDate, account: input.bankAccount });

    const bankTx = (input.bankTransactions || []).map(t => ({ ...t, matched: false }));
    const matched = [];
    const unmatchedBook = [];

    bookEntries.forEach(je => {
      je.lines.filter(l => l.account === input.bankAccount).forEach(l => {
        const amount = l.debit || -l.credit;
        const found = bankTx.find(b => !b.matched &&
          _round(b.type === 'ABONO' ? b.amount : -b.amount) === _round(amount) &&
          Math.abs(new Date(b.date) - new Date(je.date)) < 7 * 86400000);
        if (found) {
          found.matched = true;
          matched.push({ entryId: je.id, date: je.date, amount, bankRef: found.reference });
        } else {
          unmatchedBook.push({ entryId: je.id, date: je.date, amount, concept: je.concept });
        }
      });
    });
    const unmatchedBank = bankTx.filter(b => !b.matched);

    const adjustments = unmatchedBank.reduce((s, b) => s + (b.type === 'ABONO' ? b.amount : -b.amount), 0);
    const reconciledBalance = _round(bookBalance + adjustments);
    const difference = _round(input.statementBalance - reconciledBalance);

    const recon = {
      id: _state.bankReconciliations.length + 1,
      date: _isoDate(),
      bankAccount: input.bankAccount,
      statementDate: input.statementDate,
      statementBalance: input.statementBalance,
      bookBalance,
      matched, unmatchedBook, unmatchedBank,
      adjustments: _round(adjustments),
      reconciledBalance,
      difference,
      isReconciled: Math.abs(difference) < 0.01
    };
    _state.bankReconciliations.push(recon);
    _persist();
    return recon;
  }

  // ============================================================
  // 10. REPORTES FISCALES (México - SAT)
  // ============================================================
  function vatReport(opts) {
    opts = opts || {};
    const period = { from: opts.from, to: opts.to || _isoDate() };
    const ivaAcred = getAccountBalance('1105', period);   // IVA pagado en compras
    const ivaTrasl = getAccountBalance('2103', period);   // IVA cobrado en ventas
    const saldoFavor = ivaAcred > ivaTrasl ? _round(ivaAcred - ivaTrasl) : 0;
    const ivaPagar   = ivaTrasl > ivaAcred ? _round(ivaTrasl - ivaAcred) : 0;
    return {
      periodo: period,
      ivaTrasladado: ivaTrasl,
      ivaAcreditable: ivaAcred,
      ivaPorPagar: ivaPagar,
      saldoAFavor: saldoFavor,
      tipo: ivaPagar > 0 ? 'POR_PAGAR' : 'A_FAVOR'
    };
  }

  function isrReport(opts) {
    opts = opts || {};
    const inc = incomeStatement(opts);
    const tasa = opts.tasaISR != null ? opts.tasaISR : 0.30;
    return {
      periodo: inc.periodo,
      ingresosAcumulables: _round(inc.ingresos.ventasNetas + inc.ingresos.otrosIngresos),
      deduccionesAutorizadas: _round(inc.costoVentas + inc.gastosOperacion.total + inc.gastosFinancieros.intereses),
      utilidadFiscal: inc.utilidadAntesImp,
      tasa,
      isrCausado: inc.isr,
      pagoProvisional: _round(inc.isr / 12)
    };
  }

  function fiscalSummary(opts) {
    return {
      iva: vatReport(opts),
      isr: isrReport(opts),
      generadoEn: new Date().toISOString()
    };
  }

  // ============================================================
  // 11. CIERRE DE PERIODO
  // ============================================================
  function closePeriod(periodEnd) {
    const inc = incomeStatement({ to: periodEnd });
    // Asiento de cierre: traspasar utilidad neta a Utilidades Retenidas
    const lines = [];
    if (inc.utilidadNeta > 0) {
      lines.push({ account: '3003', debit: inc.utilidadNeta, credit: 0, description: 'Cierre del ejercicio' });
      lines.push({ account: '3002', debit: 0, credit: inc.utilidadNeta, description: 'Traspaso a utilidades retenidas' });
    } else if (inc.utilidadNeta < 0) {
      lines.push({ account: '3002', debit: -inc.utilidadNeta, credit: 0, description: 'Pérdida del ejercicio' });
      lines.push({ account: '3003', debit: 0, credit: -inc.utilidadNeta, description: 'Cierre del ejercicio' });
    }
    let entry = null;
    if (lines.length) {
      entry = createJournalEntry({
        date: periodEnd,
        concept: `Cierre de periodo ${periodEnd}`,
        reference: 'CIERRE',
        lines
      });
    }
    _state.closedPeriods.push({ periodEnd, closedAt: new Date().toISOString(), entryId: entry ? entry.id : null });
    _persist();
    return { period: periodEnd, utilidad: inc.utilidadNeta, entry };
  }

  // ============================================================
  // 12. INTEGRACIÓN CON POS (auto-asientos por venta)
  // ============================================================
  function recordSaleFromPOS(sale) {
    /* sale: { date, total, subtotal, iva, costoMercancia, paymentMethod:'EFECTIVO'|'TARJETA' } */
    const cuentaCobro = sale.paymentMethod === 'EFECTIVO' ? '1101' : '1102';
    const lines = [
      { account: cuentaCobro, debit: sale.total, credit: 0, description: 'Cobro de venta' },
      { account: '4001',      debit: 0, credit: sale.subtotal, description: 'Venta' },
      { account: '2103',      debit: 0, credit: sale.iva,      description: 'IVA trasladado' }
    ];
    const venta = createJournalEntry({
      date: sale.date, concept: 'Venta POS', reference: sale.reference || '', lines
    });
    let costo = null;
    if (sale.costoMercancia > 0) {
      costo = createJournalEntry({
        date: sale.date, concept: 'Costo de venta POS', reference: sale.reference || '',
        lines: [
          { account: '5001', debit: sale.costoMercancia, credit: 0, description: 'Costo de venta' },
          { account: '1104', debit: 0, credit: sale.costoMercancia, description: 'Salida de inventario' }
        ]
      });
    }
    return { venta, costo };
  }

  // ============================================================
  // 13. EXPORTAR / IMPORTAR
  // ============================================================
  function exportData() { return JSON.stringify(_state, null, 2); }
  function importData(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    Object.assign(_state, data);
    _persist();
    return true;
  }
  function reset() {
    _state.journal = [];
    _state.nextEntryId = 1;
    _state.bankReconciliations = [];
    _state.closedPeriods = [];
    _persist();
  }

  // ============================================================
  // 14. API PÚBLICA
  // ============================================================
  const AccountingAPI = {
    // Catálogo
    getChartOfAccounts: () => CHART_OF_ACCOUNTS,
    getAccount: code => CHART_OF_ACCOUNTS[code] || null,
    // Asientos
    createJournalEntry,
    voidJournalEntry,
    listJournal,
    // Mayor
    getLedger,
    getAccountBalance,
    getAggregatedBalance,
    // Reportes
    trialBalance,
    balanceSheet,
    incomeStatement,
    // Bancos
    bankReconciliation,
    listReconciliations: () => _state.bankReconciliations.slice(),
    // Fiscales
    vatReport,
    isrReport,
    fiscalSummary,
    // Cierre
    closePeriod,
    listClosedPeriods: () => _state.closedPeriods.slice(),
    // POS
    recordSaleFromPOS,
    // Datos
    exportData, importData, reset,
    // Metadata
    version: '1.0.0',
    agent: 'Agent-59 R9 Volvix'
  };

  global.AccountingAPI = AccountingAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AccountingAPI;

  console.log('[Volvix Accounting] Cargado v1.0.0 — window.AccountingAPI listo');
})(typeof window !== 'undefined' ? window : globalThis);
