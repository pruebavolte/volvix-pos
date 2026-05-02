/* ============================================================================
 * volvix-crm-wiring.js
 * Volvix CRM - Customer Relationship Management Module
 * Pipeline de ventas, leads, opportunities, tasks, email sequences,
 * segmentación, RFM analysis, customer journey.
 * Exposes: window.CRMAPI
 * ==========================================================================*/
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // Storage helpers
  // -------------------------------------------------------------------------
  const NS = 'volvix.crm.';
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem(NS + k); return v ? JSON.parse(v) : d; }
      catch (_) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (_) {}
    },
    del(k) { try { localStorage.removeItem(NS + k); } catch (_) {} }
  };

  const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
  const now = () => new Date().toISOString();
  const daysBetween = (a, b) =>
    Math.floor((new Date(b) - new Date(a)) / 86400000);

  // -------------------------------------------------------------------------
  // Event Bus
  // -------------------------------------------------------------------------
  const bus = {
    listeners: {},
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    off(ev, fn) {
      if (!this.listeners[ev]) return;
      this.listeners[ev] = this.listeners[ev].filter(f => f !== fn);
    },
    emit(ev, payload) {
      (this.listeners[ev] || []).forEach(fn => {
        try { fn(payload); } catch (e) { console.error('[CRM bus]', e); }
      });
    }
  };

  // -------------------------------------------------------------------------
  // Pipeline configuration
  // -------------------------------------------------------------------------
  const DEFAULT_STAGES = [
    { id: 'new',         name: 'Nuevo',          probability: 5,   order: 1 },
    { id: 'contacted',   name: 'Contactado',     probability: 15,  order: 2 },
    { id: 'qualified',   name: 'Calificado',     probability: 30,  order: 3 },
    { id: 'proposal',    name: 'Propuesta',      probability: 55,  order: 4 },
    { id: 'negotiation', name: 'Negociación',    probability: 75,  order: 5 },
    { id: 'won',         name: 'Ganado',         probability: 100, order: 6 },
    { id: 'lost',        name: 'Perdido',        probability: 0,   order: 7 }
  ];

  function getStages() { return store.get('stages', DEFAULT_STAGES); }
  function setStages(stages) { store.set('stages', stages); bus.emit('stages.changed', stages); }
  function stageById(id) { return getStages().find(s => s.id === id); }

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------
  function listLeads(filter) {
    const all = store.get('leads', []);
    if (!filter) return all;
    return all.filter(l => {
      if (filter.status && l.status !== filter.status) return false;
      if (filter.source && l.source !== filter.source) return false;
      if (filter.owner  && l.owner  !== filter.owner)  return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const blob = [l.name, l.email, l.phone, l.company].join(' ').toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }

  function createLead(data) {
    const lead = {
      id: uid('lead'),
      name: data.name || 'Sin nombre',
      email: data.email || '',
      phone: data.phone || '',
      company: data.company || '',
      source: data.source || 'manual',
      status: data.status || 'new',
      score: typeof data.score === 'number' ? data.score : 0,
      owner: data.owner || null,
      tags: data.tags || [],
      notes: data.notes || '',
      createdAt: now(),
      updatedAt: now(),
      lastContactAt: null
    };
    const leads = store.get('leads', []);
    leads.push(lead);
    store.set('leads', leads);
    logActivity(lead.id, 'lead', 'created', { name: lead.name });
    bus.emit('lead.created', lead);
    return lead;
  }

  function updateLead(id, patch) {
    const leads = store.get('leads', []);
    const i = leads.findIndex(l => l.id === id);
    if (i < 0) return null;
    leads[i] = { ...leads[i], ...patch, updatedAt: now() };
    store.set('leads', leads);
    bus.emit('lead.updated', leads[i]);
    return leads[i];
  }

  function deleteLead(id) {
    const leads = store.get('leads', []).filter(l => l.id !== id);
    store.set('leads', leads);
    bus.emit('lead.deleted', { id });
    return true;
  }

  function convertLeadToOpportunity(leadId, oppData) {
    const lead = listLeads().find(l => l.id === leadId);
    if (!lead) return null;
    const opp = createOpportunity({
      ...oppData,
      leadId,
      contactName: lead.name,
      contactEmail: lead.email,
      company: lead.company
    });
    updateLead(leadId, { status: 'converted' });
    logActivity(leadId, 'lead', 'converted', { opportunityId: opp.id });
    return opp;
  }

  // -------------------------------------------------------------------------
  // Opportunities
  // -------------------------------------------------------------------------
  function listOpportunities(filter) {
    const all = store.get('opportunities', []);
    if (!filter) return all;
    return all.filter(o => {
      if (filter.stage && o.stage !== filter.stage) return false;
      if (filter.owner && o.owner !== filter.owner) return false;
      if (filter.minAmount && o.amount < filter.minAmount) return false;
      if (filter.maxAmount && o.amount > filter.maxAmount) return false;
      return true;
    });
  }

  function createOpportunity(data) {
    const stage = data.stage || 'new';
    const stageMeta = stageById(stage) || DEFAULT_STAGES[0];
    const opp = {
      id: uid('opp'),
      title: data.title || 'Nueva oportunidad',
      leadId: data.leadId || null,
      contactName: data.contactName || '',
      contactEmail: data.contactEmail || '',
      company: data.company || '',
      amount: Number(data.amount) || 0,
      currency: data.currency || 'MXN',
      stage,
      probability: stageMeta.probability,
      expectedCloseDate: data.expectedCloseDate || null,
      owner: data.owner || null,
      products: data.products || [],
      notes: data.notes || '',
      createdAt: now(),
      updatedAt: now(),
      stageHistory: [{ stage, at: now() }]
    };
    const opps = store.get('opportunities', []);
    opps.push(opp);
    store.set('opportunities', opps);
    logActivity(opp.id, 'opportunity', 'created', { title: opp.title, amount: opp.amount });
    bus.emit('opportunity.created', opp);
    return opp;
  }

  function moveOpportunity(id, newStage) {
    const opps = store.get('opportunities', []);
    const i = opps.findIndex(o => o.id === id);
    if (i < 0) return null;
    const stageMeta = stageById(newStage);
    if (!stageMeta) return null;
    opps[i].stage = newStage;
    opps[i].probability = stageMeta.probability;
    opps[i].updatedAt = now();
    opps[i].stageHistory = opps[i].stageHistory || [];
    opps[i].stageHistory.push({ stage: newStage, at: now() });
    if (newStage === 'won') opps[i].closedAt = now();
    if (newStage === 'lost') opps[i].closedAt = now();
    store.set('opportunities', opps);
    logActivity(id, 'opportunity', 'stage.moved', { stage: newStage });
    bus.emit('opportunity.moved', opps[i]);
    return opps[i];
  }

  function updateOpportunity(id, patch) {
    const opps = store.get('opportunities', []);
    const i = opps.findIndex(o => o.id === id);
    if (i < 0) return null;
    opps[i] = { ...opps[i], ...patch, updatedAt: now() };
    store.set('opportunities', opps);
    bus.emit('opportunity.updated', opps[i]);
    return opps[i];
  }

  function pipelineSummary() {
    const opps = listOpportunities();
    const stages = getStages();
    const summary = stages.map(s => {
      const stageOpps = opps.filter(o => o.stage === s.id);
      const total = stageOpps.reduce((a, o) => a + (o.amount || 0), 0);
      const weighted = stageOpps.reduce(
        (a, o) => a + (o.amount || 0) * (s.probability / 100), 0);
      return {
        stage: s.id, name: s.name, count: stageOpps.length,
        total, weighted: Math.round(weighted)
      };
    });
    const totalPipeline = summary.reduce((a, s) => a + s.total, 0);
    const weightedPipeline = summary.reduce((a, s) => a + s.weighted, 0);
    return { stages: summary, totalPipeline, weightedPipeline };
  }

  // -------------------------------------------------------------------------
  // Tasks & Follow-ups
  // -------------------------------------------------------------------------
  function listTasks(filter) {
    const all = store.get('tasks', []);
    if (!filter) return all;
    return all.filter(t => {
      if (filter.status && t.status !== filter.status) return false;
      if (filter.owner  && t.owner  !== filter.owner)  return false;
      if (filter.relatedTo && t.relatedTo !== filter.relatedTo) return false;
      if (filter.overdue) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) >= new Date()) return false;
        if (t.status === 'done') return false;
      }
      return true;
    });
  }

  function createTask(data) {
    const task = {
      id: uid('task'),
      title: data.title || 'Tarea',
      description: data.description || '',
      type: data.type || 'follow-up',
      status: data.status || 'pending',
      priority: data.priority || 'normal',
      relatedTo: data.relatedTo || null,
      relatedType: data.relatedType || null,
      owner: data.owner || null,
      dueDate: data.dueDate || null,
      createdAt: now(),
      completedAt: null
    };
    const tasks = store.get('tasks', []);
    tasks.push(task);
    store.set('tasks', tasks);
    bus.emit('task.created', task);
    return task;
  }

  function completeTask(id, outcome) {
    const tasks = store.get('tasks', []);
    const i = tasks.findIndex(t => t.id === id);
    if (i < 0) return null;
    tasks[i].status = 'done';
    tasks[i].completedAt = now();
    tasks[i].outcome = outcome || null;
    store.set('tasks', tasks);
    if (tasks[i].relatedTo) {
      logActivity(tasks[i].relatedTo, tasks[i].relatedType || 'unknown',
        'task.completed', { title: tasks[i].title, outcome });
    }
    bus.emit('task.completed', tasks[i]);
    return tasks[i];
  }

  function scheduleFollowUp(relatedTo, relatedType, daysFromNow, note) {
    const due = new Date(Date.now() + daysFromNow * 86400000).toISOString();
    return createTask({
      title: 'Follow-up: ' + (note || 'seguimiento'),
      type: 'follow-up',
      relatedTo, relatedType,
      dueDate: due,
      description: note || ''
    });
  }

  // -------------------------------------------------------------------------
  // Email Sequences
  // -------------------------------------------------------------------------
  function listSequences() { return store.get('sequences', []); }

  function createSequence(data) {
    const seq = {
      id: uid('seq'),
      name: data.name || 'Secuencia',
      description: data.description || '',
      steps: (data.steps || []).map((s, idx) => ({
        order: idx + 1,
        delayDays: s.delayDays || 0,
        subject: s.subject || '',
        body: s.body || '',
        type: s.type || 'email'
      })),
      active: data.active !== false,
      createdAt: now()
    };
    const seqs = listSequences();
    seqs.push(seq);
    store.set('sequences', seqs);
    bus.emit('sequence.created', seq);
    return seq;
  }

  function enrollInSequence(sequenceId, contactId, contactType) {
    const seq = listSequences().find(s => s.id === sequenceId);
    if (!seq) return null;
    const enrollment = {
      id: uid('enr'),
      sequenceId, contactId, contactType,
      currentStep: 0,
      status: 'active',
      enrolledAt: now(),
      nextSendAt: now(),
      history: []
    };
    const enrollments = store.get('enrollments', []);
    enrollments.push(enrollment);
    store.set('enrollments', enrollments);

    seq.steps.forEach((step, idx) => {
      scheduleFollowUp(contactId, contactType, step.delayDays,
        `[Sequence ${seq.name}] Step ${idx + 1}: ${step.subject}`);
    });
    bus.emit('sequence.enrolled', enrollment);
    return enrollment;
  }

  function processSequenceStep(enrollmentId) {
    const enrollments = store.get('enrollments', []);
    const i = enrollments.findIndex(e => e.id === enrollmentId);
    if (i < 0) return null;
    const enr = enrollments[i];
    const seq = listSequences().find(s => s.id === enr.sequenceId);
    if (!seq) return null;
    const step = seq.steps[enr.currentStep];
    if (!step) {
      enr.status = 'completed';
      store.set('enrollments', enrollments);
      return enr;
    }
    enr.history.push({ step: enr.currentStep, sentAt: now(), subject: step.subject });
    enr.currentStep += 1;
    if (enr.currentStep >= seq.steps.length) enr.status = 'completed';
    else {
      const next = seq.steps[enr.currentStep];
      enr.nextSendAt = new Date(Date.now() + next.delayDays * 86400000).toISOString();
    }
    store.set('enrollments', enrollments);
    return enr;
  }

  // -------------------------------------------------------------------------
  // Customers (post-conversion) & Segmentation
  // -------------------------------------------------------------------------
  function listCustomers() { return store.get('customers', []); }

  function upsertCustomer(data) {
    const customers = listCustomers();
    let c = customers.find(x => x.email === data.email && data.email);
    if (c) {
      Object.assign(c, data, { updatedAt: now() });
    } else {
      c = {
        id: uid('cus'),
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        company: data.company || '',
        tags: data.tags || [],
        purchases: data.purchases || [],
        totalSpent: data.totalSpent || 0,
        firstPurchaseAt: data.firstPurchaseAt || null,
        lastPurchaseAt: data.lastPurchaseAt || null,
        createdAt: now(),
        updatedAt: now()
      };
      customers.push(c);
    }
    store.set('customers', customers);
    bus.emit('customer.upserted', c);
    return c;
  }

  function recordPurchase(customerId, purchase) {
    const customers = listCustomers();
    const i = customers.findIndex(c => c.id === customerId);
    if (i < 0) return null;
    const p = {
      id: uid('pur'),
      amount: Number(purchase.amount) || 0,
      currency: purchase.currency || 'MXN',
      items: purchase.items || [],
      at: purchase.at || now()
    };
    customers[i].purchases.push(p);
    customers[i].totalSpent += p.amount;
    customers[i].lastPurchaseAt = p.at;
    if (!customers[i].firstPurchaseAt) customers[i].firstPurchaseAt = p.at;
    customers[i].updatedAt = now();
    store.set('customers', customers);
    bus.emit('customer.purchase', { customer: customers[i], purchase: p });
    return customers[i];
  }

  function segment(criteria) {
    const customers = listCustomers();
    return customers.filter(c => {
      if (criteria.minSpent && c.totalSpent < criteria.minSpent) return false;
      if (criteria.maxSpent && c.totalSpent > criteria.maxSpent) return false;
      if (criteria.minPurchases && c.purchases.length < criteria.minPurchases) return false;
      if (criteria.tags && !criteria.tags.every(t => c.tags.includes(t))) return false;
      if (criteria.activeWithinDays && c.lastPurchaseAt) {
        const d = daysBetween(c.lastPurchaseAt, now());
        if (d > criteria.activeWithinDays) return false;
      }
      if (criteria.inactiveAtLeastDays && c.lastPurchaseAt) {
        const d = daysBetween(c.lastPurchaseAt, now());
        if (d < criteria.inactiveAtLeastDays) return false;
      }
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // RFM Analysis
  // -------------------------------------------------------------------------
  function rfmAnalysis() {
    const customers = listCustomers().filter(c => c.purchases.length > 0);
    if (!customers.length) return { customers: [], segments: {} };

    const today = new Date();
    const enriched = customers.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      recency: c.lastPurchaseAt ? daysBetween(c.lastPurchaseAt, today) : 9999,
      frequency: c.purchases.length,
      monetary: c.totalSpent
    }));

    const quintile = (vals, v, reverse) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const idx = sorted.findIndex(x => x >= v);
      const pct = idx / Math.max(1, sorted.length - 1);
      const q = Math.min(5, Math.max(1, Math.ceil(pct * 5) || 1));
      return reverse ? 6 - q : q;
    };

    const recencies = enriched.map(e => e.recency);
    const frequencies = enriched.map(e => e.frequency);
    const monetaries = enriched.map(e => e.monetary);

    enriched.forEach(e => {
      e.R = quintile(recencies, e.recency, true);
      e.F = quintile(frequencies, e.frequency, false);
      e.M = quintile(monetaries, e.monetary, false);
      e.score = `${e.R}${e.F}${e.M}`;
      e.segment = classifyRFM(e.R, e.F, e.M);
    });

    const segments = {};
    enriched.forEach(e => {
      segments[e.segment] = (segments[e.segment] || 0) + 1;
    });
    return { customers: enriched, segments };
  }

  function classifyRFM(R, F, M) {
    if (R >= 4 && F >= 4 && M >= 4) return 'Champions';
    if (R >= 3 && F >= 4) return 'Loyal Customers';
    if (R >= 4 && F <= 2) return 'New Customers';
    if (R >= 4 && M >= 4) return 'Big Spenders';
    if (R <= 2 && F >= 4 && M >= 4) return 'Cant Lose Them';
    if (R <= 2 && F >= 3) return 'At Risk';
    if (R <= 2 && F <= 2 && M <= 2) return 'Lost';
    if (R >= 3 && F <= 2 && M <= 2) return 'Promising';
    return 'Need Attention';
  }

  // -------------------------------------------------------------------------
  // Customer Journey & Activity Log
  // -------------------------------------------------------------------------
  function logActivity(entityId, entityType, action, meta) {
    const log = store.get('activities', []);
    const entry = {
      id: uid('act'),
      entityId, entityType, action,
      meta: meta || {},
      at: now()
    };
    log.push(entry);
    if (log.length > 5000) log.splice(0, log.length - 5000);
    store.set('activities', log);
    bus.emit('activity.logged', entry);
    return entry;
  }

  function getJourney(entityId) {
    return store.get('activities', [])
      .filter(a => a.entityId === entityId)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  function customerJourney(customerId) {
    const customer = listCustomers().find(c => c.id === customerId);
    if (!customer) return null;
    const acts = getJourney(customerId);
    const purchases = (customer.purchases || []).map(p => ({
      type: 'purchase', at: p.at, amount: p.amount, items: p.items
    }));
    const tasks = listTasks({ relatedTo: customerId }).map(t => ({
      type: 'task', at: t.createdAt, title: t.title, status: t.status
    }));
    const timeline = [...acts, ...purchases, ...tasks]
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    return { customer, timeline };
  }

  // -------------------------------------------------------------------------
  // Lead Scoring
  // -------------------------------------------------------------------------
  function recalcLeadScore(leadId) {
    const lead = listLeads().find(l => l.id === leadId);
    if (!lead) return 0;
    let score = 0;
    if (lead.email) score += 10;
    if (lead.phone) score += 10;
    if (lead.company) score += 15;
    const acts = getJourney(leadId);
    score += Math.min(40, acts.length * 3);
    if (lead.lastContactAt) {
      const d = daysBetween(lead.lastContactAt, now());
      if (d < 7) score += 25;
      else if (d < 30) score += 10;
    }
    score = Math.min(100, score);
    updateLead(leadId, { score });
    return score;
  }

  // -------------------------------------------------------------------------
  // Dashboard / KPIs
  // -------------------------------------------------------------------------
  function dashboard() {
    const leads = listLeads();
    const opps = listOpportunities();
    const won = opps.filter(o => o.stage === 'won');
    const lost = opps.filter(o => o.stage === 'lost');
    const open = opps.filter(o => o.stage !== 'won' && o.stage !== 'lost');
    const tasks = listTasks();
    const overdue = listTasks({ overdue: true });
    const closeRate = (won.length + lost.length) > 0
      ? (won.length / (won.length + lost.length)) * 100 : 0;
    const wonAmount = won.reduce((a, o) => a + (o.amount || 0), 0);
    const avgDeal = won.length ? wonAmount / won.length : 0;
    return {
      leads: { total: leads.length, new: leads.filter(l => l.status === 'new').length },
      opportunities: { total: opps.length, open: open.length, won: won.length, lost: lost.length },
      revenue: { won: wonAmount, avgDealSize: Math.round(avgDeal) },
      closeRate: Math.round(closeRate * 10) / 10,
      tasks: { total: tasks.length, pending: tasks.filter(t => t.status === 'pending').length, overdue: overdue.length },
      pipeline: pipelineSummary()
    };
  }

  // -------------------------------------------------------------------------
  // Import / Export
  // -------------------------------------------------------------------------
  function exportAll() {
    return {
      version: 1,
      exportedAt: now(),
      stages: getStages(),
      leads: listLeads(),
      opportunities: listOpportunities(),
      tasks: listTasks(),
      customers: listCustomers(),
      sequences: listSequences(),
      enrollments: store.get('enrollments', []),
      activities: store.get('activities', [])
    };
  }

  function importAll(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.stages)        store.set('stages', data.stages);
    if (data.leads)         store.set('leads', data.leads);
    if (data.opportunities) store.set('opportunities', data.opportunities);
    if (data.tasks)         store.set('tasks', data.tasks);
    if (data.customers)     store.set('customers', data.customers);
    if (data.sequences)     store.set('sequences', data.sequences);
    if (data.enrollments)   store.set('enrollments', data.enrollments);
    if (data.activities)    store.set('activities', data.activities);
    bus.emit('crm.imported', { at: now() });
    return true;
  }

  function reset() {
    ['stages','leads','opportunities','tasks','customers',
     'sequences','enrollments','activities'].forEach(k => store.del(k));
    bus.emit('crm.reset', {});
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  const CRMAPI = {
    // Pipeline
    getStages, setStages, stageById,
    // Leads
    listLeads, createLead, updateLead, deleteLead,
    convertLeadToOpportunity, recalcLeadScore,
    // Opportunities
    listOpportunities, createOpportunity, updateOpportunity,
    moveOpportunity, pipelineSummary,
    // Tasks
    listTasks, createTask, completeTask, scheduleFollowUp,
    // Sequences
    listSequences, createSequence, enrollInSequence, processSequenceStep,
    // Customers / Segmentation
    listCustomers, upsertCustomer, recordPurchase, segment,
    // RFM
    rfmAnalysis, classifyRFM,
    // Journey
    logActivity, getJourney, customerJourney,
    // Dashboard
    dashboard,
    // I/O
    exportAll, importAll, reset,
    // Events
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    // Meta
    version: '1.0.0',
    moduleName: 'volvix-crm'
  };

  global.CRMAPI = CRMAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = CRMAPI;

  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('volvix:crm:ready', { detail: { api: CRMAPI } }));
  }
  console.log('[Volvix CRM] ready - window.CRMAPI v' + CRMAPI.version);
})(typeof window !== 'undefined' ? window : globalThis);
