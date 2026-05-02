/**
 * volvix-workflow-onboarding.js
 * Workflow de Onboarding para nuevos tenants en Volvix POS.
 * Expone window.OnboardingWorkflow.
 *
 * Etapas:
 *   1. setupCompany       - Datos fiscales y de la empresa
 *   2. createFirstStaff   - Primer usuario administrador / cajero
 *   3. addInitialProducts - Carga inicial de catalogo
 *   4. firstSale          - Venta demo guiada
 *   5. training           - Modulo de capacitacion interactivo
 *   6. certification      - Examen y emision de certificado
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_onboarding_state_v1';
  const STAGES = [
    'setupCompany',
    'createFirstStaff',
    'addInitialProducts',
    'firstSale',
    'training',
    'certification'
  ];

  // ---------- utilidades ----------
  function nowIso() { return new Date().toISOString(); }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function log(msg, data) {
    try { console.log('[Onboarding] ' + msg, data || ''); } catch (e) {}
  }
  function emit(name, payload) {
    try {
      const ev = new CustomEvent('onboarding:' + name, { detail: payload });
      window.dispatchEvent(ev);
    } catch (e) { log('emit fallo', e); }
  }
  function persist(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { log('persist fallo', e); }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---------- estado ----------
  function defaultState(tenantId) {
    return {
      tenantId: tenantId || uid('tenant'),
      startedAt: nowIso(),
      finishedAt: null,
      currentStage: STAGES[0],
      progress: 0,
      stages: {
        setupCompany:       { status: 'pending', data: null, completedAt: null },
        createFirstStaff:   { status: 'pending', data: null, completedAt: null },
        addInitialProducts: { status: 'pending', data: [],   completedAt: null },
        firstSale:          { status: 'pending', data: null, completedAt: null },
        training:           { status: 'pending', data: { modulesDone: [], score: 0 }, completedAt: null },
        certification:      { status: 'pending', data: null, completedAt: null }
      },
      certificate: null,
      auditLog: []
    };
  }

  function audit(state, action, detail) {
    state.auditLog.push({ at: nowIso(), action: action, detail: detail || null });
    if (state.auditLog.length > 500) state.auditLog.shift();
  }

  function recalcProgress(state) {
    const total = STAGES.length;
    const done = STAGES.filter(s => state.stages[s].status === 'done').length;
    state.progress = Math.round((done / total) * 100);
    return state.progress;
  }

  // ---------- validadores ----------
  function validateCompany(c) {
    if (!c || typeof c !== 'object') throw new Error('company requerido');
    if (!c.legalName || c.legalName.length < 3) throw new Error('legalName invalido');
    if (!c.rfc || !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(c.rfc)) throw new Error('RFC invalido');
    if (!c.address || c.address.length < 5) throw new Error('address invalida');
    if (!c.currency) c.currency = 'MXN';
    if (!c.timezone) c.timezone = 'America/Mexico_City';
    return c;
  }
  function validateStaff(s) {
    if (!s || !s.name || s.name.length < 2) throw new Error('staff.name requerido');
    if (!s.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) throw new Error('staff.email invalido');
    if (!s.role) s.role = 'admin';
    if (!s.password || s.password.length < 8) throw new Error('password >=8 caracteres');
    return s;
  }
  function validateProduct(p) {
    if (!p || !p.sku || !p.name) throw new Error('producto requiere sku y name');
    if (typeof p.price !== 'number' || p.price < 0) throw new Error('price invalido');
    if (typeof p.stock !== 'number' || p.stock < 0) p.stock = 0;
    if (!p.taxRate && p.taxRate !== 0) p.taxRate = 0.16;
    return p;
  }

  // ---------- stage runners ----------
  function runSetupCompany(state, payload) {
    const data = validateCompany(deepClone(payload));
    state.stages.setupCompany.data = data;
    state.stages.setupCompany.status = 'done';
    state.stages.setupCompany.completedAt = nowIso();
    state.currentStage = 'createFirstStaff';
    audit(state, 'setupCompany.done', { rfc: data.rfc });
    emit('stageDone', { stage: 'setupCompany', data: data });
    return data;
  }

  function runCreateFirstStaff(state, payload) {
    if (state.stages.setupCompany.status !== 'done') throw new Error('setupCompany debe completarse primero');
    const staff = validateStaff(deepClone(payload));
    staff.id = uid('usr');
    staff.createdAt = nowIso();
    delete staff.password; // no persistir plano
    state.stages.createFirstStaff.data = staff;
    state.stages.createFirstStaff.status = 'done';
    state.stages.createFirstStaff.completedAt = nowIso();
    state.currentStage = 'addInitialProducts';
    audit(state, 'createFirstStaff.done', { email: staff.email });
    emit('stageDone', { stage: 'createFirstStaff', data: staff });
    return staff;
  }

  function runAddInitialProducts(state, productsPayload) {
    if (state.stages.createFirstStaff.status !== 'done') throw new Error('Falta primer staff');
    if (!Array.isArray(productsPayload) || productsPayload.length < 1)
      throw new Error('Debe agregar al menos 1 producto inicial');
    const products = productsPayload.map(p => {
      const v = validateProduct(deepClone(p));
      v.id = uid('prod');
      v.createdAt = nowIso();
      return v;
    });
    state.stages.addInitialProducts.data = products;
    state.stages.addInitialProducts.status = 'done';
    state.stages.addInitialProducts.completedAt = nowIso();
    state.currentStage = 'firstSale';
    audit(state, 'addInitialProducts.done', { count: products.length });
    emit('stageDone', { stage: 'addInitialProducts', data: products });
    return products;
  }

  function runFirstSale(state, salePayload) {
    if (state.stages.addInitialProducts.status !== 'done') throw new Error('Falta catalogo inicial');
    const catalog = state.stages.addInitialProducts.data;
    if (!salePayload || !Array.isArray(salePayload.items) || !salePayload.items.length)
      throw new Error('venta requiere items');
    let subtotal = 0, tax = 0;
    const items = salePayload.items.map(it => {
      const prod = catalog.find(p => p.sku === it.sku || p.id === it.productId);
      if (!prod) throw new Error('producto no en catalogo: ' + (it.sku || it.productId));
      const qty = Math.max(1, Number(it.qty) || 1);
      const lineSub = prod.price * qty;
      const lineTax = lineSub * (prod.taxRate || 0);
      subtotal += lineSub;
      tax += lineTax;
      return { sku: prod.sku, name: prod.name, qty: qty, unitPrice: prod.price, subtotal: lineSub, tax: lineTax };
    });
    const sale = {
      id: uid('sale'),
      at: nowIso(),
      items: items,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((subtotal + tax) * 100) / 100,
      payment: salePayload.payment || { method: 'cash' },
      cashier: state.stages.createFirstStaff.data && state.stages.createFirstStaff.data.email
    };
    state.stages.firstSale.data = sale;
    state.stages.firstSale.status = 'done';
    state.stages.firstSale.completedAt = nowIso();
    state.currentStage = 'training';
    audit(state, 'firstSale.done', { total: sale.total });
    emit('stageDone', { stage: 'firstSale', data: sale });
    return sale;
  }

  const TRAINING_MODULES = [
    { id: 'pos_basics',     title: 'Operacion basica del POS',   minScore: 70 },
    { id: 'inventory',      title: 'Inventario y stock',         minScore: 70 },
    { id: 'cash_closing',   title: 'Cierre de caja',             minScore: 80 },
    { id: 'tax_invoicing',  title: 'Facturacion CFDI 4.0',       minScore: 80 },
    { id: 'reports',        title: 'Reportes y analitica',       minScore: 60 }
  ];

  function runTraining(state, moduleResult) {
    if (state.stages.firstSale.status !== 'done') throw new Error('Completa primera venta antes del training');
    if (!moduleResult || !moduleResult.moduleId || typeof moduleResult.score !== 'number')
      throw new Error('moduleResult requiere moduleId y score');
    const mod = TRAINING_MODULES.find(m => m.id === moduleResult.moduleId);
    if (!mod) throw new Error('modulo desconocido: ' + moduleResult.moduleId);
    if (moduleResult.score < mod.minScore)
      throw new Error('Score insuficiente para ' + mod.id + ' (min ' + mod.minScore + ')');

    const tdata = state.stages.training.data;
    if (!tdata.modulesDone.find(m => m.id === mod.id)) {
      tdata.modulesDone.push({ id: mod.id, score: moduleResult.score, at: nowIso() });
    }
    tdata.score = Math.round(
      tdata.modulesDone.reduce((a, m) => a + m.score, 0) / tdata.modulesDone.length
    );
    audit(state, 'training.module', { moduleId: mod.id, score: moduleResult.score });

    if (tdata.modulesDone.length === TRAINING_MODULES.length) {
      state.stages.training.status = 'done';
      state.stages.training.completedAt = nowIso();
      state.currentStage = 'certification';
      emit('stageDone', { stage: 'training', data: tdata });
    } else {
      emit('stageProgress', { stage: 'training', done: tdata.modulesDone.length, total: TRAINING_MODULES.length });
    }
    return tdata;
  }

  function runCertification(state, examPayload) {
    if (state.stages.training.status !== 'done') throw new Error('Completa todos los modulos antes de certificar');
    if (!examPayload || typeof examPayload.score !== 'number')
      throw new Error('exam requiere score');
    if (examPayload.score < 80) {
      audit(state, 'certification.failed', { score: examPayload.score });
      throw new Error('Examen reprobado: minimo 80, obtuvo ' + examPayload.score);
    }
    const cert = {
      id: uid('cert'),
      tenantId: state.tenantId,
      issuedTo: state.stages.createFirstStaff.data.email,
      company: state.stages.setupCompany.data.legalName,
      score: examPayload.score,
      issuedAt: nowIso(),
      hash: btoa(state.tenantId + ':' + examPayload.score + ':' + nowIso()).slice(0, 32)
    };
    state.certificate = cert;
    state.stages.certification.data = cert;
    state.stages.certification.status = 'done';
    state.stages.certification.completedAt = nowIso();
    state.finishedAt = nowIso();
    audit(state, 'certification.done', { certId: cert.id });
    emit('stageDone', { stage: 'certification', data: cert });
    emit('completed', { tenantId: state.tenantId, certificate: cert });
    return cert;
  }

  // ---------- API publica ----------
  const OnboardingWorkflow = {
    STAGES: STAGES.slice(),
    TRAINING_MODULES: deepClone(TRAINING_MODULES),

    start: function (tenantId) {
      const existing = restore();
      const state = (existing && (!tenantId || existing.tenantId === tenantId))
        ? existing
        : defaultState(tenantId);
      audit(state, 'workflow.start');
      persist(state);
      emit('started', { tenantId: state.tenantId });
      return deepClone(state);
    },

    getState: function () {
      const s = restore() || defaultState();
      recalcProgress(s);
      return deepClone(s);
    },

    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      emit('reset', {});
      return true;
    },

    runStage: function (stageName, payload) {
      const state = restore() || defaultState();
      let result;
      switch (stageName) {
        case 'setupCompany':       result = runSetupCompany(state, payload); break;
        case 'createFirstStaff':   result = runCreateFirstStaff(state, payload); break;
        case 'addInitialProducts': result = runAddInitialProducts(state, payload); break;
        case 'firstSale':          result = runFirstSale(state, payload); break;
        case 'training':           result = runTraining(state, payload); break;
        case 'certification':      result = runCertification(state, payload); break;
        default: throw new Error('stage desconocida: ' + stageName);
      }
      recalcProgress(state);
      persist(state);
      return { result: result, state: deepClone(state) };
    },

    next: function (payload) {
      const s = restore() || defaultState();
      return this.runStage(s.currentStage, payload);
    },

    isComplete: function () {
      const s = restore();
      return !!(s && s.stages.certification.status === 'done');
    },

    getCertificate: function () {
      const s = restore();
      return s && s.certificate ? deepClone(s.certificate) : null;
    },

    exportReport: function () {
      const s = restore() || defaultState();
      recalcProgress(s);
      return {
        tenantId: s.tenantId,
        progress: s.progress,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        currentStage: s.currentStage,
        stages: Object.keys(s.stages).map(k => ({
          name: k,
          status: s.stages[k].status,
          completedAt: s.stages[k].completedAt
        })),
        certificate: s.certificate
      };
    },

    on: function (eventName, handler) {
      const full = 'onboarding:' + eventName;
      window.addEventListener(full, handler);
      return function off() { window.removeEventListener(full, handler); };
    },

    _internal: { defaultState: defaultState, validateCompany: validateCompany, validateProduct: validateProduct }
  };

  global.OnboardingWorkflow = OnboardingWorkflow;
  log('OnboardingWorkflow listo. Stages:', STAGES);
})(typeof window !== 'undefined' ? window : this);
