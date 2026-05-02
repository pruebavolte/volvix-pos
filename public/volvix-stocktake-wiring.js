/**
 * volvix-stocktake-wiring.js
 * Inventory count / stocktake module for Volvix POS.
 *
 * Features:
 *   - Cycle counts (full / partial / ABC)
 *   - Blind count mode (counters don't see expected qty)
 *   - Stock freeze during active count (blocks sales/transfers)
 *   - Discrepancy detection and adjustment workflow
 *   - Multi-counter support with recount on variance
 *   - Audit trail for every adjustment
 *
 * Exposes: window.StocktakeAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  // Storage & constants
  // ─────────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix.stocktake.v1';
  const FREEZE_KEY = 'volvix.stocktake.freeze.v1';
  const AUDIT_KEY = 'volvix.stocktake.audit.v1';

  const STATUS = Object.freeze({
    DRAFT: 'draft',
    IN_PROGRESS: 'in_progress',
    REVIEW: 'review',
    ADJUSTED: 'adjusted',
    CANCELLED: 'cancelled',
    CLOSED: 'closed'
  });

  const TYPES = Object.freeze({
    FULL: 'full',
    PARTIAL: 'partial',
    ABC_A: 'abc_a',
    ABC_B: 'abc_b',
    ABC_C: 'abc_c',
    SPOT: 'spot'
  });

  const VARIANCE_THRESHOLD = 0.02; // 2% triggers recount
  const RECOUNT_LIMIT = 3;

  // ─────────────────────────────────────────────────────────────────────
  // Persistence helpers
  // ─────────────────────────────────────────────────────────────────────
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('[Stocktake] load error', key, e);
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Stocktake] save error', key, e);
      return false;
    }
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return new Date().toISOString();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Audit trail
  // ─────────────────────────────────────────────────────────────────────
  function audit(event, payload) {
    const log = load(AUDIT_KEY, []);
    log.push({ id: uid('aud'), at: now(), event, payload });
    if (log.length > 5000) log.splice(0, log.length - 5000);
    save(AUDIT_KEY, log);
  }

  function getAudit(filter) {
    const log = load(AUDIT_KEY, []);
    if (!filter) return log.slice();
    return log.filter(l =>
      (!filter.event || l.event === filter.event) &&
      (!filter.cycleId || (l.payload && l.payload.cycleId === filter.cycleId))
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Stock freeze (blocks sales/transfers on items being counted)
  // ─────────────────────────────────────────────────────────────────────
  function getFreezes() {
    return load(FREEZE_KEY, {});
  }

  function freezeItems(cycleId, skus) {
    const freezes = getFreezes();
    skus.forEach(sku => {
      if (!freezes[sku]) freezes[sku] = [];
      if (!freezes[sku].includes(cycleId)) freezes[sku].push(cycleId);
    });
    save(FREEZE_KEY, freezes);
    audit('freeze', { cycleId, skus });
  }

  function unfreezeCycle(cycleId) {
    const freezes = getFreezes();
    Object.keys(freezes).forEach(sku => {
      freezes[sku] = freezes[sku].filter(c => c !== cycleId);
      if (!freezes[sku].length) delete freezes[sku];
    });
    save(FREEZE_KEY, freezes);
    audit('unfreeze', { cycleId });
  }

  function isFrozen(sku) {
    const freezes = getFreezes();
    return !!(freezes[sku] && freezes[sku].length);
  }

  function frozenCyclesFor(sku) {
    const freezes = getFreezes();
    return (freezes[sku] || []).slice();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Inventory snapshot helpers (depend on host POS InventoryAPI if present)
  // ─────────────────────────────────────────────────────────────────────
  function inv() {
    return global.InventoryAPI || {
      getStock: (sku) => 0,
      adjustStock: (sku, delta, reason) => true,
      listSkus: () => []
    };
  }

  function snapshotStock(skus) {
    const out = {};
    skus.forEach(sku => { out[sku] = inv().getStock(sku) || 0; });
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Cycle CRUD
  // ─────────────────────────────────────────────────────────────────────
  function loadCycles() { return load(STORAGE_KEY, []); }
  function saveCycles(c) { return save(STORAGE_KEY, c); }

  function createCycle(opts) {
    opts = opts || {};
    const type = opts.type || TYPES.PARTIAL;
    const skus = Array.isArray(opts.skus) && opts.skus.length
      ? opts.skus.slice()
      : (type === TYPES.FULL ? inv().listSkus() : []);
    if (!skus.length) throw new Error('Stocktake: no SKUs to count');

    const cycle = {
      id: uid('cyc'),
      type,
      status: STATUS.DRAFT,
      blind: opts.blind !== false,
      createdAt: now(),
      createdBy: opts.user || 'system',
      location: opts.location || 'main',
      note: opts.note || '',
      skus,
      expected: snapshotStock(skus),
      counts: {},        // sku -> [{counter, qty, at, round}]
      finalCounts: {},   // sku -> qty
      variances: {},     // sku -> {expected, counted, delta, pct}
      adjustments: {},   // sku -> {applied, at, by, delta}
      recountRound: 1
    };

    const cycles = loadCycles();
    cycles.push(cycle);
    saveCycles(cycles);
    audit('cycle.create', { cycleId: cycle.id, type, count: skus.length });
    return cycle;
  }

  function getCycle(id) {
    return loadCycles().find(c => c.id === id) || null;
  }

  function listCycles(filter) {
    const all = loadCycles();
    if (!filter) return all;
    return all.filter(c =>
      (!filter.status || c.status === filter.status) &&
      (!filter.type || c.type === filter.type) &&
      (!filter.location || c.location === filter.location)
    );
  }

  function updateCycle(cycle) {
    const cycles = loadCycles();
    const idx = cycles.findIndex(c => c.id === cycle.id);
    if (idx < 0) throw new Error('Cycle not found: ' + cycle.id);
    cycles[idx] = cycle;
    saveCycles(cycles);
    return cycle;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow
  // ─────────────────────────────────────────────────────────────────────
  function startCycle(cycleId) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    if (c.status !== STATUS.DRAFT) throw new Error('Cycle not in draft');
    c.status = STATUS.IN_PROGRESS;
    c.startedAt = now();
    freezeItems(c.id, c.skus);
    updateCycle(c);
    audit('cycle.start', { cycleId: c.id });
    return c;
  }

  function submitCount(cycleId, sku, qty, counter) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    if (c.status !== STATUS.IN_PROGRESS) throw new Error('Cycle not active');
    if (!c.skus.includes(sku)) throw new Error('SKU not in cycle');
    qty = Number(qty);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('Invalid qty');

    if (!c.counts[sku]) c.counts[sku] = [];
    c.counts[sku].push({
      counter: counter || 'anon',
      qty,
      at: now(),
      round: c.recountRound
    });
    updateCycle(c);
    audit('count.submit', { cycleId: c.id, sku, qty, round: c.recountRound });
    return c.counts[sku];
  }

  function getExpectedForCounter(cycleId, sku) {
    const c = getCycle(cycleId);
    if (!c) return null;
    // blind mode hides expected from counter
    return c.blind ? null : c.expected[sku];
  }

  function computeVariances(cycleId) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    const variances = {};
    const finals = {};

    c.skus.forEach(sku => {
      const rounds = c.counts[sku] || [];
      const last = rounds.filter(r => r.round === c.recountRound);
      if (!last.length) return;

      // average if multiple counters in the same round
      const avg = last.reduce((s, r) => s + r.qty, 0) / last.length;
      const counted = Math.round(avg * 1000) / 1000;
      const expected = c.expected[sku] || 0;
      const delta = counted - expected;
      const pct = expected === 0 ? (counted === 0 ? 0 : 1) : Math.abs(delta) / expected;

      finals[sku] = counted;
      if (Math.abs(delta) > 0) {
        variances[sku] = { expected, counted, delta, pct };
      }
    });

    c.finalCounts = finals;
    c.variances = variances;
    updateCycle(c);
    return variances;
  }

  function needsRecount(cycleId) {
    const c = getCycle(cycleId);
    if (!c) return [];
    return Object.keys(c.variances).filter(sku => {
      const v = c.variances[sku];
      return v.pct > VARIANCE_THRESHOLD && c.recountRound < RECOUNT_LIMIT;
    });
  }

  function startRecount(cycleId) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    if (c.recountRound >= RECOUNT_LIMIT) throw new Error('Recount limit reached');
    c.recountRound += 1;
    updateCycle(c);
    audit('cycle.recount', { cycleId: c.id, round: c.recountRound });
    return c;
  }

  function moveToReview(cycleId) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    computeVariances(c.id);
    c.status = STATUS.REVIEW;
    updateCycle(c);
    audit('cycle.review', { cycleId: c.id, variances: Object.keys(c.variances).length });
    return c;
  }

  function applyAdjustments(cycleId, user) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    if (c.status !== STATUS.REVIEW) throw new Error('Cycle must be in review');

    const applied = {};
    Object.keys(c.variances).forEach(sku => {
      const v = c.variances[sku];
      const ok = inv().adjustStock(sku, v.delta, 'stocktake:' + c.id);
      applied[sku] = {
        applied: !!ok,
        at: now(),
        by: user || 'system',
        delta: v.delta
      };
    });
    c.adjustments = applied;
    c.status = STATUS.ADJUSTED;
    c.adjustedAt = now();
    updateCycle(c);
    audit('cycle.adjust', { cycleId: c.id, count: Object.keys(applied).length });
    return applied;
  }

  function closeCycle(cycleId) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    if (c.status !== STATUS.ADJUSTED && c.status !== STATUS.CANCELLED) {
      throw new Error('Cycle must be adjusted or cancelled before close');
    }
    unfreezeCycle(c.id);
    c.status = STATUS.CLOSED;
    c.closedAt = now();
    updateCycle(c);
    audit('cycle.close', { cycleId: c.id });
    return c;
  }

  function cancelCycle(cycleId, reason) {
    const c = getCycle(cycleId);
    if (!c) throw new Error('Cycle not found');
    unfreezeCycle(c.id);
    c.status = STATUS.CANCELLED;
    c.cancelledAt = now();
    c.cancelReason = reason || '';
    updateCycle(c);
    audit('cycle.cancel', { cycleId: c.id, reason });
    return c;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reporting
  // ─────────────────────────────────────────────────────────────────────
  function summary(cycleId) {
    const c = getCycle(cycleId);
    if (!c) return null;
    const totalSkus = c.skus.length;
    const counted = Object.keys(c.finalCounts).length;
    const varianceSkus = Object.keys(c.variances).length;
    const totalDelta = Object.values(c.variances).reduce((s, v) => s + v.delta, 0);
    return {
      id: c.id, status: c.status, type: c.type, blind: c.blind,
      round: c.recountRound, totalSkus, counted, varianceSkus, totalDelta,
      createdAt: c.createdAt, startedAt: c.startedAt,
      adjustedAt: c.adjustedAt, closedAt: c.closedAt
    };
  }

  function exportReport(cycleId) {
    const c = getCycle(cycleId);
    if (!c) return null;
    return {
      summary: summary(cycleId),
      lines: c.skus.map(sku => ({
        sku,
        expected: c.expected[sku] || 0,
        counted: c.finalCounts[sku] != null ? c.finalCounts[sku] : null,
        variance: c.variances[sku] ? c.variances[sku].delta : 0,
        adjusted: c.adjustments[sku] ? c.adjustments[sku].applied : false
      }))
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────
  global.StocktakeAPI = {
    STATUS, TYPES,
    // cycle lifecycle
    createCycle, startCycle, moveToReview,
    applyAdjustments, closeCycle, cancelCycle,
    // counting
    submitCount, getExpectedForCounter,
    computeVariances, needsRecount, startRecount,
    // freeze
    isFrozen, frozenCyclesFor,
    // queries
    getCycle, listCycles, summary, exportReport,
    // audit
    getAudit
  };

  console.log('[Stocktake] window.StocktakeAPI ready');
})(typeof window !== 'undefined' ? window : this);
