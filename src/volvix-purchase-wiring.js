/**
 * volvix-purchase-wiring.js
 * Volvix POS - Purchase Orders & Vendor Management Module
 *
 * Provides:
 *  - Purchase Order creation/management
 *  - Goods Receipt (receiving merchandise)
 *  - Validation against PO
 *  - Three-way matching (PO / Receipt / Invoice)
 *  - Vendor payments
 *  - Aging report
 *
 * Exposes: window.PurchaseAPI
 */
(function (global) {
  'use strict';

  // ============================================================
  // Storage helpers
  // ============================================================
  const NS = 'volvix_purchase_';
  const KEYS = {
    VENDORS:   NS + 'vendors',
    POS:       NS + 'pos',
    RECEIPTS:  NS + 'receipts',
    INVOICES:  NS + 'invoices',
    PAYMENTS:  NS + 'payments',
    COUNTERS:  NS + 'counters'
  };

  function load(k, def) {
    try { return JSON.parse(localStorage.getItem(k)) || def; }
    catch (e) { return def; }
  }
  function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function nextId(prefix) {
    const counters = load(KEYS.COUNTERS, {});
    counters[prefix] = (counters[prefix] || 0) + 1;
    save(KEYS.COUNTERS, counters);
    const n = String(counters[prefix]).padStart(5, '0');
    return `${prefix}-${n}`;
  }

  function nowISO() { return new Date().toISOString(); }
  function today()  { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return Math.floor(ms / 86400000);
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  // ============================================================
  // Vendors
  // ============================================================
  function listVendors() { return load(KEYS.VENDORS, []); }

  function getVendor(id) {
    return listVendors().find(v => v.id === id) || null;
  }

  function createVendor(data) {
    if (!data || !data.name) throw new Error('Vendor name required');
    const vendors = listVendors();
    const v = {
      id:          data.id || nextId('VEN'),
      name:        data.name,
      rfc:         data.rfc || '',
      contact:     data.contact || '',
      email:       data.email || '',
      phone:       data.phone || '',
      address:     data.address || '',
      paymentTerms: data.paymentTerms || 30, // days
      currency:    data.currency || 'MXN',
      active:      true,
      createdAt:   nowISO()
    };
    vendors.push(v);
    save(KEYS.VENDORS, vendors);
    return v;
  }

  function updateVendor(id, patch) {
    const vendors = listVendors();
    const i = vendors.findIndex(v => v.id === id);
    if (i < 0) throw new Error('Vendor not found: ' + id);
    vendors[i] = Object.assign({}, vendors[i], patch, { id: vendors[i].id });
    save(KEYS.VENDORS, vendors);
    return vendors[i];
  }

  function deactivateVendor(id) {
    return updateVendor(id, { active: false });
  }

  // ============================================================
  // Purchase Orders
  // ============================================================
  // PO Status flow: draft -> sent -> partial -> received -> closed | cancelled
  function listPOs(filter) {
    const all = load(KEYS.POS, []);
    if (!filter) return all;
    return all.filter(po => {
      if (filter.status   && po.status   !== filter.status)   return false;
      if (filter.vendorId && po.vendorId !== filter.vendorId) return false;
      if (filter.from     && po.date     <  filter.from)      return false;
      if (filter.to       && po.date     >  filter.to)        return false;
      return true;
    });
  }

  function getPO(id) {
    return listPOs().find(p => p.id === id) || null;
  }

  function createPO(data) {
    if (!data || !data.vendorId) throw new Error('vendorId required');
    if (!Array.isArray(data.items) || !data.items.length)
      throw new Error('At least one line item required');
    const vendor = getVendor(data.vendorId);
    if (!vendor) throw new Error('Vendor not found: ' + data.vendorId);

    const items = data.items.map((it, idx) => ({
      lineNo:   idx + 1,
      sku:      it.sku || '',
      name:     it.name || '',
      qty:      Number(it.qty) || 0,
      qtyReceived: 0,
      unitCost: round2(it.unitCost),
      tax:      Number(it.tax) || 0,
      lineTotal: round2((Number(it.qty) || 0) * (Number(it.unitCost) || 0))
    }));

    const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
    const taxTotal = round2(items.reduce((s, i) => s + i.lineTotal * (i.tax / 100), 0));
    const total    = round2(subtotal + taxTotal);

    const po = {
      id:          nextId('PO'),
      vendorId:    vendor.id,
      vendorName:  vendor.name,
      date:        data.date || today(),
      expectedDate: data.expectedDate || '',
      currency:    data.currency || vendor.currency || 'MXN',
      paymentTerms: data.paymentTerms || vendor.paymentTerms || 30,
      notes:       data.notes || '',
      items:       items,
      subtotal:    subtotal,
      taxTotal:    taxTotal,
      total:       total,
      status:      'draft',
      receiptIds:  [],
      invoiceIds:  [],
      createdAt:   nowISO(),
      updatedAt:   nowISO()
    };

    const all = load(KEYS.POS, []);
    all.push(po);
    save(KEYS.POS, all);
    return po;
  }

  function updatePO(id, patch) {
    const all = load(KEYS.POS, []);
    const i = all.findIndex(p => p.id === id);
    if (i < 0) throw new Error('PO not found: ' + id);
    if (all[i].status !== 'draft')
      throw new Error('Only draft POs can be edited');
    all[i] = Object.assign({}, all[i], patch, {
      id: all[i].id,
      updatedAt: nowISO()
    });
    save(KEYS.POS, all);
    return all[i];
  }

  function sendPO(id) {
    const all = load(KEYS.POS, []);
    const po  = all.find(p => p.id === id);
    if (!po) throw new Error('PO not found: ' + id);
    if (po.status !== 'draft') throw new Error('PO is not draft');
    po.status    = 'sent';
    po.sentAt    = nowISO();
    po.updatedAt = nowISO();
    save(KEYS.POS, all);
    return po;
  }

  function cancelPO(id, reason) {
    const all = load(KEYS.POS, []);
    const po  = all.find(p => p.id === id);
    if (!po) throw new Error('PO not found: ' + id);
    if (['received', 'closed'].indexOf(po.status) >= 0)
      throw new Error('Cannot cancel a received/closed PO');
    po.status        = 'cancelled';
    po.cancelReason  = reason || '';
    po.cancelledAt   = nowISO();
    po.updatedAt     = nowISO();
    save(KEYS.POS, all);
    return po;
  }

  // ============================================================
  // Goods Receipt (receiving merchandise)
  // ============================================================
  function receiveGoods(poId, data) {
    const all = load(KEYS.POS, []);
    const po  = all.find(p => p.id === poId);
    if (!po) throw new Error('PO not found: ' + poId);
    if (['cancelled', 'closed'].indexOf(po.status) >= 0)
      throw new Error('PO is ' + po.status);
    if (!data || !Array.isArray(data.lines) || !data.lines.length)
      throw new Error('Receipt lines required');

    // Validate each receipt line against PO
    const validated = [];
    const issues    = [];
    data.lines.forEach(rl => {
      const poLine = po.items.find(i => i.lineNo === rl.lineNo || i.sku === rl.sku);
      if (!poLine) {
        issues.push({ sku: rl.sku, error: 'Line not found in PO' });
        return;
      }
      const remaining = poLine.qty - poLine.qtyReceived;
      const qty       = Number(rl.qty) || 0;
      if (qty <= 0) {
        issues.push({ sku: rl.sku, error: 'Qty must be > 0' });
        return;
      }
      if (qty > remaining) {
        issues.push({
          sku: poLine.sku,
          error: `Over-receipt: receiving ${qty} but only ${remaining} pending`
        });
        return;
      }
      validated.push({
        lineNo:   poLine.lineNo,
        sku:      poLine.sku,
        name:     poLine.name,
        qty:      qty,
        unitCost: poLine.unitCost,
        lineTotal: round2(qty * poLine.unitCost)
      });
    });

    if (issues.length && !data.allowPartial) {
      const err = new Error('Receipt validation failed');
      err.issues = issues;
      throw err;
    }

    // Apply receipt
    validated.forEach(rl => {
      const poLine = po.items.find(i => i.lineNo === rl.lineNo);
      poLine.qtyReceived = round2(poLine.qtyReceived + rl.qty);
    });

    const receipt = {
      id:         nextId('GR'),
      poId:       po.id,
      vendorId:   po.vendorId,
      vendorName: po.vendorName,
      date:       data.date || today(),
      lines:      validated,
      issues:     issues,
      total:      round2(validated.reduce((s, l) => s + l.lineTotal, 0)),
      reference:  data.reference || '',
      receivedBy: data.receivedBy || '',
      createdAt:  nowISO()
    };

    // Update PO status
    const fullyReceived = po.items.every(i => i.qtyReceived >= i.qty);
    po.status      = fullyReceived ? 'received' : 'partial';
    po.receiptIds.push(receipt.id);
    po.updatedAt   = nowISO();
    save(KEYS.POS, all);

    const receipts = load(KEYS.RECEIPTS, []);
    receipts.push(receipt);
    save(KEYS.RECEIPTS, receipts);

    return receipt;
  }

  function listReceipts(filter) {
    const all = load(KEYS.RECEIPTS, []);
    if (!filter) return all;
    return all.filter(r => {
      if (filter.poId     && r.poId     !== filter.poId)     return false;
      if (filter.vendorId && r.vendorId !== filter.vendorId) return false;
      return true;
    });
  }

  // ============================================================
  // Vendor Invoices + Three-Way Matching
  // ============================================================
  function registerInvoice(data) {
    if (!data || !data.poId)        throw new Error('poId required');
    if (!data.invoiceNumber)        throw new Error('invoiceNumber required');
    if (!Array.isArray(data.lines)) throw new Error('lines required');

    const po = getPO(data.poId);
    if (!po) throw new Error('PO not found: ' + data.poId);

    const lines = data.lines.map(l => ({
      lineNo:    l.lineNo,
      sku:       l.sku || '',
      qty:       Number(l.qty) || 0,
      unitCost:  round2(l.unitCost),
      lineTotal: round2((Number(l.qty) || 0) * (Number(l.unitCost) || 0))
    }));
    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
    const taxTotal = round2(Number(data.taxTotal) || subtotal * 0.16);
    const total    = round2(subtotal + taxTotal);

    const invoice = {
      id:            nextId('INV'),
      invoiceNumber: data.invoiceNumber,
      poId:          po.id,
      vendorId:      po.vendorId,
      vendorName:    po.vendorName,
      date:          data.date    || today(),
      dueDate:       data.dueDate || addDays(data.date || today(), po.paymentTerms || 30),
      lines:         lines,
      subtotal:      subtotal,
      taxTotal:      taxTotal,
      total:         total,
      paid:          0,
      balance:       total,
      status:        'pending',  // pending | matched | discrepancy | paid | partial
      matchResult:   null,
      createdAt:     nowISO()
    };

    // Three-way match
    invoice.matchResult = threeWayMatch(po.id, invoice);
    invoice.status = invoice.matchResult.matched ? 'matched' : 'discrepancy';

    const all = load(KEYS.INVOICES, []);
    all.push(invoice);
    save(KEYS.INVOICES, all);

    // Track on PO
    const pos = load(KEYS.POS, []);
    const p = pos.find(x => x.id === po.id);
    if (p) {
      p.invoiceIds = p.invoiceIds || [];
      p.invoiceIds.push(invoice.id);
      p.updatedAt = nowISO();
      save(KEYS.POS, pos);
    }

    return invoice;
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  /**
   * Three-way matching:
   * Compare PO line vs aggregated received qty vs invoice line.
   * Returns { matched, tolerance, discrepancies: [...] }
   */
  function threeWayMatch(poId, invoice) {
    const po       = getPO(poId);
    const receipts = listReceipts({ poId: poId });
    const tolerance = { qty: 0.01, price: 0.01 }; // 1%

    if (!po) return { matched: false, error: 'PO not found' };

    // Aggregate received qty per line
    const recvByLine = {};
    receipts.forEach(r => r.lines.forEach(l => {
      recvByLine[l.lineNo] = (recvByLine[l.lineNo] || 0) + l.qty;
    }));

    const discrepancies = [];
    (invoice.lines || []).forEach(invLine => {
      const poLine = po.items.find(i => i.lineNo === invLine.lineNo || i.sku === invLine.sku);
      if (!poLine) {
        discrepancies.push({ sku: invLine.sku, type: 'no-po-line' });
        return;
      }
      const receivedQty = recvByLine[poLine.lineNo] || 0;

      // Qty match: invoice <= received
      if (invLine.qty > receivedQty * (1 + tolerance.qty)) {
        discrepancies.push({
          sku:        poLine.sku,
          type:       'qty-mismatch',
          invoiced:   invLine.qty,
          received:   receivedQty,
          ordered:    poLine.qty
        });
      }
      // Price match: invoice unitCost vs PO unitCost
      const priceDiff = Math.abs(invLine.unitCost - poLine.unitCost);
      const priceTol  = poLine.unitCost * tolerance.price;
      if (priceDiff > priceTol) {
        discrepancies.push({
          sku:        poLine.sku,
          type:       'price-mismatch',
          invoiced:   invLine.unitCost,
          poPrice:    poLine.unitCost,
          difference: round2(priceDiff)
        });
      }
    });

    return {
      matched:       discrepancies.length === 0,
      tolerance:     tolerance,
      discrepancies: discrepancies,
      checkedAt:     nowISO()
    };
  }

  function approveInvoice(invoiceId) {
    const all = load(KEYS.INVOICES, []);
    const inv = all.find(i => i.id === invoiceId);
    if (!inv) throw new Error('Invoice not found: ' + invoiceId);
    if (inv.status === 'discrepancy')
      throw new Error('Cannot approve invoice with discrepancies; reconcile first');
    inv.approvedAt = nowISO();
    save(KEYS.INVOICES, all);
    return inv;
  }

  function listInvoices(filter) {
    const all = load(KEYS.INVOICES, []);
    if (!filter) return all;
    return all.filter(inv => {
      if (filter.status   && inv.status   !== filter.status)   return false;
      if (filter.vendorId && inv.vendorId !== filter.vendorId) return false;
      if (filter.poId     && inv.poId     !== filter.poId)     return false;
      return true;
    });
  }

  // ============================================================
  // Vendor Payments
  // ============================================================
  function payInvoice(invoiceId, data) {
    if (!data || !data.amount) throw new Error('amount required');
    const invs = load(KEYS.INVOICES, []);
    const inv  = invs.find(i => i.id === invoiceId);
    if (!inv) throw new Error('Invoice not found: ' + invoiceId);
    if (inv.status === 'discrepancy')
      throw new Error('Cannot pay invoice with discrepancies');

    const amount = round2(data.amount);
    if (amount <= 0)              throw new Error('Amount must be > 0');
    if (amount > inv.balance + 0.01)
      throw new Error(`Amount ${amount} exceeds balance ${inv.balance}`);

    const payment = {
      id:           nextId('PAY'),
      invoiceId:    inv.id,
      poId:         inv.poId,
      vendorId:     inv.vendorId,
      vendorName:   inv.vendorName,
      date:         data.date   || today(),
      method:       data.method || 'transfer', // transfer|cash|check|card
      reference:    data.reference || '',
      amount:       amount,
      currency:     data.currency || 'MXN',
      notes:        data.notes || '',
      createdAt:    nowISO()
    };

    inv.paid    = round2(inv.paid + amount);
    inv.balance = round2(inv.total - inv.paid);
    inv.status  = inv.balance <= 0.01 ? 'paid' : 'partial';
    save(KEYS.INVOICES, invs);

    const pays = load(KEYS.PAYMENTS, []);
    pays.push(payment);
    save(KEYS.PAYMENTS, pays);

    // Close PO if all invoices fully paid and fully received
    maybeClosePO(inv.poId);

    return payment;
  }

  function maybeClosePO(poId) {
    const pos = load(KEYS.POS, []);
    const po  = pos.find(p => p.id === poId);
    if (!po) return;
    if (po.status !== 'received') return;
    const invs = listInvoices({ poId: poId });
    if (!invs.length) return;
    const allPaid = invs.every(i => i.status === 'paid');
    if (allPaid) {
      po.status    = 'closed';
      po.closedAt  = nowISO();
      po.updatedAt = nowISO();
      save(KEYS.POS, pos);
    }
  }

  function listPayments(filter) {
    const all = load(KEYS.PAYMENTS, []);
    if (!filter) return all;
    return all.filter(p => {
      if (filter.vendorId && p.vendorId !== filter.vendorId) return false;
      if (filter.poId     && p.poId     !== filter.poId)     return false;
      if (filter.from     && p.date     <  filter.from)      return false;
      if (filter.to       && p.date     >  filter.to)        return false;
      return true;
    });
  }

  // ============================================================
  // Aging Report (accounts payable)
  // ============================================================
  function agingReport(asOf) {
    const ref = asOf || today();
    const buckets = {
      current:    { label: 'Current (0)',    min: 0,  max: 0,    invoices: [], total: 0 },
      d1_30:      { label: '1-30 days',      min: 1,  max: 30,   invoices: [], total: 0 },
      d31_60:     { label: '31-60 days',     min: 31, max: 60,   invoices: [], total: 0 },
      d61_90:     { label: '61-90 days',     min: 61, max: 90,   invoices: [], total: 0 },
      d90plus:    { label: '90+ days',       min: 91, max: 9999, invoices: [], total: 0 }
    };

    const byVendor = {};
    const open = listInvoices().filter(i =>
      i.status !== 'paid' && i.status !== 'discrepancy' && i.balance > 0
    );

    open.forEach(inv => {
      const overdue = daysBetween(inv.dueDate, ref);
      let bucket;
      if (overdue <= 0)       bucket = buckets.current;
      else if (overdue <= 30) bucket = buckets.d1_30;
      else if (overdue <= 60) bucket = buckets.d31_60;
      else if (overdue <= 90) bucket = buckets.d61_90;
      else                    bucket = buckets.d90plus;

      const entry = {
        invoiceId:     inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorId:      inv.vendorId,
        vendorName:    inv.vendorName,
        dueDate:       inv.dueDate,
        daysOverdue:   Math.max(0, overdue),
        balance:       inv.balance
      };
      bucket.invoices.push(entry);
      bucket.total = round2(bucket.total + inv.balance);

      if (!byVendor[inv.vendorId]) {
        byVendor[inv.vendorId] = {
          vendorId:   inv.vendorId,
          vendorName: inv.vendorName,
          current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0,
          total: 0
        };
      }
      const v = byVendor[inv.vendorId];
      if (overdue <= 0)       v.current = round2(v.current + inv.balance);
      else if (overdue <= 30) v.d1_30   = round2(v.d1_30   + inv.balance);
      else if (overdue <= 60) v.d31_60  = round2(v.d31_60  + inv.balance);
      else if (overdue <= 90) v.d61_90  = round2(v.d61_90  + inv.balance);
      else                    v.d90plus = round2(v.d90plus + inv.balance);
      v.total = round2(v.total + inv.balance);
    });

    const grandTotal = round2(
      buckets.current.total + buckets.d1_30.total + buckets.d31_60.total +
      buckets.d61_90.total  + buckets.d90plus.total
    );

    return {
      asOf:       ref,
      buckets:    buckets,
      byVendor:   Object.values(byVendor).sort((a, b) => b.total - a.total),
      grandTotal: grandTotal,
      generatedAt: nowISO()
    };
  }

  // ============================================================
  // Vendor summary / KPIs
  // ============================================================
  function vendorSummary(vendorId) {
    const v        = getVendor(vendorId);
    if (!v) throw new Error('Vendor not found: ' + vendorId);
    const pos      = listPOs({ vendorId: vendorId });
    const receipts = listReceipts({ vendorId: vendorId });
    const invoices = listInvoices({ vendorId: vendorId });
    const payments = listPayments({ vendorId: vendorId });

    const purchased = round2(pos.reduce((s, p) =>
      p.status === 'cancelled' ? s : s + p.total, 0));
    const invoiced  = round2(invoices.reduce((s, i) => s + i.total, 0));
    const paid      = round2(payments.reduce((s, p) => s + p.amount, 0));
    const balance   = round2(invoiced - paid);

    return {
      vendor:    v,
      counts:    {
        pos:      pos.length,
        receipts: receipts.length,
        invoices: invoices.length,
        payments: payments.length
      },
      totals:    { purchased, invoiced, paid, balance }
    };
  }

  // ============================================================
  // Reset / debug
  // ============================================================
  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    return { ok: true };
  }

  // ============================================================
  // Public API
  // ============================================================
  const PurchaseAPI = {
    // Vendors
    listVendors, getVendor, createVendor, updateVendor, deactivateVendor,
    // Purchase Orders
    listPOs, getPO, createPO, updatePO, sendPO, cancelPO,
    // Goods Receipt
    receiveGoods, listReceipts,
    // Invoices + 3-way match
    registerInvoice, threeWayMatch, approveInvoice, listInvoices,
    // Payments
    payInvoice, listPayments,
    // Reports
    agingReport, vendorSummary,
    // Utils
    resetAll,
    _version: '1.0.0'
  };

  global.PurchaseAPI = PurchaseAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PurchaseAPI;
  }
})(typeof window !== 'undefined' ? window : this);
