/**
 * volvix-workflow-openday.js
 * Workflow de Apertura del Día para Volvix POS
 * Expone: window.OpenDayWorkflow
 *
 * Pasos:
 *   1. Check inicial de caja (estado previo / cierre anterior)
 *   2. Contar fondo inicial
 *   3. Abrir caja (registro en backend)
 *   4. Cargar productos del día (catálogo + stock)
 *   5. Validar staff disponible
 *   6. Marcar POS listo
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix.openday.state';
  const LOG_PREFIX = '[OpenDayWorkflow]';

  const STEP = Object.freeze({
    INITIAL_CHECK: 'initial_check',
    COUNT_FUND:    'count_fund',
    OPEN_CASH:     'open_cash',
    LOAD_PRODUCTS: 'load_products',
    VALIDATE_STAFF:'validate_staff',
    READY_POS:     'ready_pos',
    DONE:          'done'
  });

  const STATUS = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    OK:      'ok',
    FAILED:  'failed',
    SKIPPED: 'skipped'
  });

  const DEFAULT_CONFIG = {
    expectedFund: 1000.00,
    fundTolerance: 0.50,
    minStaffOnShift: 1,
    productsEndpoint: '/api/products/today',
    staffEndpoint:    '/api/staff/onshift',
    cashEndpoint:     '/api/cash/session',
    autoPersist: true,
    verbose: true
  };

  // ── State ────────────────────────────────────────────────────────────
  let _config = Object.assign({}, DEFAULT_CONFIG);
  let _state = createInitialState();
  let _listeners = [];

  function createInitialState() {
    return {
      startedAt: null,
      finishedAt: null,
      currentStep: null,
      steps: {
        [STEP.INITIAL_CHECK]: { status: STATUS.PENDING, data: null, error: null },
        [STEP.COUNT_FUND]:    { status: STATUS.PENDING, data: null, error: null },
        [STEP.OPEN_CASH]:     { status: STATUS.PENDING, data: null, error: null },
        [STEP.LOAD_PRODUCTS]: { status: STATUS.PENDING, data: null, error: null },
        [STEP.VALIDATE_STAFF]:{ status: STATUS.PENDING, data: null, error: null },
        [STEP.READY_POS]:     { status: STATUS.PENDING, data: null, error: null }
      },
      cashSessionId: null,
      productsCount: 0,
      staffCount: 0,
      ready: false
    };
  }

  // ── Util ─────────────────────────────────────────────────────────────
  function log(...args) {
    if (_config.verbose && typeof console !== 'undefined') {
      console.log(LOG_PREFIX, ...args);
    }
  }

  function warn(...args) {
    if (typeof console !== 'undefined') console.warn(LOG_PREFIX, ...args);
  }

  function err(...args) {
    if (typeof console !== 'undefined') console.error(LOG_PREFIX, ...args);
  }

  function emit(event, payload) {
    _listeners.forEach(fn => {
      try { fn(event, payload, _state); }
      catch (e) { err('listener error', e); }
    });
  }

  function persist() {
    if (!_config.autoPersist) return;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          state: _state,
          savedAt: new Date().toISOString()
        }));
      }
    } catch (e) {
      warn('persist failed', e);
    }
  }

  function restore() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.state) {
        _state = parsed.state;
        log('restored state from', parsed.savedAt);
        return true;
      }
    } catch (e) {
      warn('restore failed', e);
    }
    return false;
  }

  async function safeFetch(url, opts) {
    if (typeof fetch !== 'function') {
      throw new Error('fetch API not available');
    }
    const resp = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts || {}));
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} on ${url}`);
    }
    return resp.json();
  }

  function setStep(step, status, patch) {
    _state.currentStep = step;
    _state.steps[step].status = status;
    if (patch) Object.assign(_state.steps[step], patch);
    emit('step:update', { step, status });
    persist();
  }

  // ── Steps ────────────────────────────────────────────────────────────
  async function stepInitialCheck() {
    setStep(STEP.INITIAL_CHECK, STATUS.RUNNING);
    try {
      let data;
      try {
        data = await safeFetch(_config.cashEndpoint + '/last');
      } catch (e) {
        warn('cash/last unavailable, assuming clean slate');
        data = { open: false, lastClosedAt: null };
      }
      if (data.open) {
        throw new Error('Caja anterior aún abierta. Cerrar antes de iniciar día.');
      }
      setStep(STEP.INITIAL_CHECK, STATUS.OK, { data });
      return data;
    } catch (e) {
      setStep(STEP.INITIAL_CHECK, STATUS.FAILED, { error: e.message });
      throw e;
    }
  }

  async function stepCountFund(countedAmount) {
    setStep(STEP.COUNT_FUND, STATUS.RUNNING);
    try {
      if (typeof countedAmount !== 'number' || isNaN(countedAmount)) {
        throw new Error('Monto de fondo inválido');
      }
      const diff = Math.abs(countedAmount - _config.expectedFund);
      const within = diff <= _config.fundTolerance;
      const data = {
        counted: countedAmount,
        expected: _config.expectedFund,
        diff,
        withinTolerance: within
      };
      if (!within) {
        warn(`Fondo fuera de tolerancia: diff=${diff}`);
      }
      setStep(STEP.COUNT_FUND, STATUS.OK, { data });
      return data;
    } catch (e) {
      setStep(STEP.COUNT_FUND, STATUS.FAILED, { error: e.message });
      throw e;
    }
  }

  async function stepOpenCash(operatorId) {
    setStep(STEP.OPEN_CASH, STATUS.RUNNING);
    try {
      const fund = _state.steps[STEP.COUNT_FUND].data;
      if (!fund) throw new Error('Debe contarse fondo antes de abrir caja');
      let resp;
      try {
        resp = await safeFetch(_config.cashEndpoint + '/open', {
          method: 'POST',
          body: JSON.stringify({
            operatorId,
            initialFund: fund.counted,
            openedAt: new Date().toISOString()
          })
        });
      } catch (e) {
        warn('endpoint open caja falló, generando sesión local', e);
        resp = { sessionId: 'local-' + Date.now(), local: true };
      }
      _state.cashSessionId = resp.sessionId;
      setStep(STEP.OPEN_CASH, STATUS.OK, { data: resp });
      return resp;
    } catch (e) {
      setStep(STEP.OPEN_CASH, STATUS.FAILED, { error: e.message });
      throw e;
    }
  }

  async function stepLoadProducts() {
    setStep(STEP.LOAD_PRODUCTS, STATUS.RUNNING);
    try {
      let products = [];
      try {
        const data = await safeFetch(_config.productsEndpoint);
        products = Array.isArray(data) ? data : (data.products || []);
      } catch (e) {
        warn('products endpoint falló, intentando cache', e);
        if (typeof localStorage !== 'undefined') {
          const cached = localStorage.getItem('volvix.products.cache');
          if (cached) products = JSON.parse(cached);
        }
      }
      if (!products.length) throw new Error('No hay productos cargados para el día');
      _state.productsCount = products.length;
      if (typeof window !== 'undefined') window.__VOLVIX_PRODUCTS__ = products;
      setStep(STEP.LOAD_PRODUCTS, STATUS.OK, { data: { count: products.length } });
      return products;
    } catch (e) {
      setStep(STEP.LOAD_PRODUCTS, STATUS.FAILED, { error: e.message });
      throw e;
    }
  }

  async function stepValidateStaff() {
    setStep(STEP.VALIDATE_STAFF, STATUS.RUNNING);
    try {
      let staff = [];
      try {
        const data = await safeFetch(_config.staffEndpoint);
        staff = Array.isArray(data) ? data : (data.staff || []);
      } catch (e) {
        warn('staff endpoint falló', e);
      }
      if (staff.length < _config.minStaffOnShift) {
        throw new Error(`Staff insuficiente: ${staff.length}/${_config.minStaffOnShift}`);
      }
      _state.staffCount = staff.length;
      setStep(STEP.VALIDATE_STAFF, STATUS.OK, { data: { count: staff.length } });
      return staff;
    } catch (e) {
      setStep(STEP.VALIDATE_STAFF, STATUS.FAILED, { error: e.message });
      throw e;
    }
  }

  async function stepReadyPOS() {
    setStep(STEP.READY_POS, STATUS.RUNNING);
    try {
      const allOk = [
        STEP.INITIAL_CHECK, STEP.COUNT_FUND, STEP.OPEN_CASH,
        STEP.LOAD_PRODUCTS, STEP.VALIDATE_STAFF
      ].every(s => _state.steps[s].status === STATUS.OK);
      if (!allOk) throw new Error('Hay pasos previos no completados');
      _state.ready = true;
      _state.finishedAt = new Date().toISOString();
      _state.currentStep = STEP.DONE;
      setStep(STEP.READY_POS, STATUS.OK, {
        data: { sessionId: _state.cashSessionId, readyAt: _state.finishedAt }
      });
      emit('ready', { sessionId: _state.cashSessionId });
      return true;
    } catch (e) {
      setStep(STEP.READY_POS, STATUS.FAILED, { error: e.message });
      throw e;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  async function run(opts) {
    opts = opts || {};
    _state = createInitialState();
    _state.startedAt = new Date().toISOString();
    emit('start', { at: _state.startedAt });
    log('open-day workflow start');
    await stepInitialCheck();
    await stepCountFund(opts.countedFund);
    await stepOpenCash(opts.operatorId || 'unknown');
    await stepLoadProducts();
    await stepValidateStaff();
    await stepReadyPOS();
    log('open-day workflow done; sessionId=', _state.cashSessionId);
    return getState();
  }

  function configure(cfg) {
    _config = Object.assign({}, _config, cfg || {});
    return _config;
  }

  function getState() {
    return JSON.parse(JSON.stringify(_state));
  }

  function getConfig() {
    return JSON.parse(JSON.stringify(_config));
  }

  function reset() {
    _state = createInitialState();
    persist();
    emit('reset', {});
  }

  function on(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }

  function isReady() { return !!_state.ready; }

  global.OpenDayWorkflow = {
    STEP, STATUS,
    run,
    configure,
    getState,
    getConfig,
    reset,
    on,
    isReady,
    restore,
    // step-by-step manual mode
    steps: {
      initialCheck: stepInitialCheck,
      countFund:    stepCountFund,
      openCash:     stepOpenCash,
      loadProducts: stepLoadProducts,
      validateStaff:stepValidateStaff,
      readyPOS:     stepReadyPOS
    }
  };

  log('OpenDayWorkflow loaded');
})(typeof window !== 'undefined' ? window : globalThis);
