/**
 * volvix-cs-wiring.js
 * Volvix POS - Customer Success Wiring Module
 * Agent-41 / Ronda 8 Fibonacci
 *
 * Provides:
 *  - NPS surveys (Net Promoter Score)
 *  - CSAT (Customer Satisfaction)
 *  - Onboarding progress per customer
 *  - Health score per tenant
 *  - Churn risk indicators
 *  - Engagement metrics
 *  - Feature adoption tracking
 *  - Auto-emails based on behavior
 *  - window.CSAPI public surface
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Config ─────────────────────────────
  const CONFIG = {
    storageKey: 'volvix_cs_state_v1',
    npsCooldownDays: 90,
    csatCooldownDays: 14,
    healthRecalcMs: 60_000,
    churnThresholds: { low: 70, medium: 50, high: 30 },
    engagementWindowDays: 30,
    onboardingSteps: [
      'account_created',
      'company_profile',
      'first_product',
      'first_sale',
      'invite_team',
      'connect_payments',
      'configure_taxes',
      'first_report_viewed',
      'mobile_app_installed',
      'subscription_active',
    ],
    featureCatalog: [
      'pos_basic', 'pos_advanced', 'inventory', 'reports',
      'multi_branch', 'ecommerce', 'kitchen_display', 'loyalty',
      'gift_cards', 'promotions', 'analytics_pro', 'api_access',
    ],
    emailTemplates: {
      welcome:           { subject: 'Bienvenido a Volvix POS', delayMin: 0 },
      onboarding_nudge:  { subject: 'Continúa configurando tu Volvix', delayMin: 60 },
      stuck_step:        { subject: 'Te ayudamos a continuar', delayMin: 1440 },
      low_engagement:    { subject: 'Te extrañamos en Volvix', delayMin: 4320 },
      churn_warning:     { subject: 'Hablemos de tu cuenta Volvix', delayMin: 60 },
      nps_request:       { subject: '¿Qué tan probable es que recomiendes Volvix?', delayMin: 0 },
      csat_request:      { subject: 'Tu opinión sobre tu última experiencia', delayMin: 30 },
      feature_unused:    { subject: 'Funciones que aún no exploras', delayMin: 10080 },
      health_critical:   { subject: 'Reunión gratis con tu Customer Success Manager', delayMin: 0 },
    },
  };

  const DAY = 86_400_000;
  const now = () => Date.now();
  const daysAgo = (ts) => (now() - ts) / DAY;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const uid = () => 'cs_' + Math.random().toString(36).slice(2, 10) + now().toString(36);

  // ───────────────────────────── Storage ─────────────────────────────
  const Store = {
    load() {
      try {
        const raw = (global.localStorage && global.localStorage.getItem(CONFIG.storageKey)) || null;
        return raw ? JSON.parse(raw) : Store._fresh();
      } catch (e) { return Store._fresh(); }
    },
    save(state) {
      try {
        if (global.localStorage) global.localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
      } catch (e) { /* quota */ }
    },
    _fresh() {
      return {
        tenants: {},
        nps: [],
        csat: [],
        events: [],
        emails: [],
        lastHealthRun: 0,
      };
    },
  };

  let STATE = Store.load();
  const persist = () => Store.save(STATE);

  // ───────────────────────────── Tenants ─────────────────────────────
  function ensureTenant(tenantId, meta = {}) {
    if (!STATE.tenants[tenantId]) {
      STATE.tenants[tenantId] = {
        id: tenantId,
        createdAt: now(),
        plan: meta.plan || 'trial',
        seats: meta.seats || 1,
        country: meta.country || 'MX',
        owner: meta.owner || null,
        onboarding: { step: 0, completed: [], lastTouch: now(), startedAt: now() },
        adoption: {},
        engagement: { logins: [], actions: [], sessions: 0, lastSeen: now() },
        health: { score: 50, churnRisk: 'medium', lastEval: 0, breakdown: {} },
        npsLast: 0,
        csatLast: 0,
        notes: [],
      };
      persist();
    }
    return STATE.tenants[tenantId];
  }

  // ───────────────────────────── Events / Engagement ─────────────────
  function trackEvent(tenantId, name, payload = {}) {
    ensureTenant(tenantId);
    const ev = { id: uid(), tenantId, name, payload, ts: now() };
    STATE.events.push(ev);
    if (STATE.events.length > 5000) STATE.events.splice(0, STATE.events.length - 5000);

    const t = STATE.tenants[tenantId];
    t.engagement.actions.push(ev.ts);
    t.engagement.lastSeen = ev.ts;
    if (name === 'login') t.engagement.logins.push(ev.ts);
    if (name === 'session_start') t.engagement.sessions++;

    // Trim engagement windows
    const cutoff = now() - CONFIG.engagementWindowDays * DAY;
    t.engagement.actions = t.engagement.actions.filter(ts => ts >= cutoff);
    t.engagement.logins  = t.engagement.logins.filter(ts => ts >= cutoff);

    // Auto behaviour hooks
    behaviorHooks(tenantId, ev);
    persist();
    return ev;
  }

  function engagementMetrics(tenantId) {
    const t = ensureTenant(tenantId);
    const cutoff = now() - CONFIG.engagementWindowDays * DAY;
    const logins = t.engagement.logins.filter(ts => ts >= cutoff).length;
    const actions = t.engagement.actions.filter(ts => ts >= cutoff).length;
    const dau = new Set(
      t.engagement.actions
        .filter(ts => ts >= now() - DAY)
        .map(ts => new Date(ts).toDateString())
    ).size;
    const wau = new Set(
      t.engagement.actions
        .filter(ts => ts >= now() - 7 * DAY)
        .map(ts => new Date(ts).toDateString())
    ).size;
    const mau = new Set(
      t.engagement.actions
        .map(ts => new Date(ts).toDateString())
    ).size;
    return {
      tenantId,
      logins30d: logins,
      actions30d: actions,
      sessions: t.engagement.sessions,
      lastSeenDaysAgo: Math.round(daysAgo(t.engagement.lastSeen)),
      dau, wau, mau,
      stickiness: wau ? +(dau / wau).toFixed(2) : 0,
    };
  }

  // ───────────────────────────── Onboarding ─────────────────────────
  function onboardingComplete(tenantId, stepName) {
    const t = ensureTenant(tenantId);
    if (!CONFIG.onboardingSteps.includes(stepName)) return null;
    if (!t.onboarding.completed.includes(stepName)) {
      t.onboarding.completed.push(stepName);
      t.onboarding.step = t.onboarding.completed.length;
      t.onboarding.lastTouch = now();
      trackEvent(tenantId, 'onboarding_step', { step: stepName });
      if (t.onboarding.completed.length === CONFIG.onboardingSteps.length) {
        trackEvent(tenantId, 'onboarding_complete', {});
      }
    }
    persist();
    return onboardingProgress(tenantId);
  }

  function onboardingProgress(tenantId) {
    const t = ensureTenant(tenantId);
    const total = CONFIG.onboardingSteps.length;
    const done = t.onboarding.completed.length;
    const pct = Math.round((done / total) * 100);
    const remaining = CONFIG.onboardingSteps.filter(s => !t.onboarding.completed.includes(s));
    const stalledDays = Math.round(daysAgo(t.onboarding.lastTouch));
    return {
      tenantId,
      step: done,
      total,
      pct,
      completed: t.onboarding.completed.slice(),
      remaining,
      stalledDays,
      stalled: stalledDays > 3 && done < total,
    };
  }

  // ───────────────────────────── Feature Adoption ───────────────────
  function adoptionMark(tenantId, feature) {
    const t = ensureTenant(tenantId);
    if (!CONFIG.featureCatalog.includes(feature)) return null;
    if (!t.adoption[feature]) {
      t.adoption[feature] = { firstUse: now(), uses: 0 };
    }
    t.adoption[feature].uses++;
    t.adoption[feature].lastUse = now();
    persist();
    return t.adoption[feature];
  }

  function adoptionReport(tenantId) {
    const t = ensureTenant(tenantId);
    const used = Object.keys(t.adoption);
    const unused = CONFIG.featureCatalog.filter(f => !used.includes(f));
    return {
      tenantId,
      adopted: used,
      unused,
      adoptionRate: +(used.length / CONFIG.featureCatalog.length).toFixed(2),
      detail: t.adoption,
    };
  }

  // ───────────────────────────── NPS ─────────────────────────────────
  function npsSubmit(tenantId, score, comment = '', userId = null) {
    ensureTenant(tenantId);
    score = clamp(parseInt(score, 10) || 0, 0, 10);
    const category = score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';
    const entry = { id: uid(), tenantId, userId, score, comment, category, ts: now() };
    STATE.nps.push(entry);
    STATE.tenants[tenantId].npsLast = now();
    trackEvent(tenantId, 'nps_submitted', { score, category });
    persist();
    return entry;
  }

  function npsEligible(tenantId) {
    const t = ensureTenant(tenantId);
    return daysAgo(t.npsLast || 0) >= CONFIG.npsCooldownDays;
  }

  function npsScore(tenantId = null) {
    const list = tenantId
      ? STATE.nps.filter(n => n.tenantId === tenantId)
      : STATE.nps.slice();
    if (!list.length) return { count: 0, score: 0, promoters: 0, passives: 0, detractors: 0 };
    const promoters  = list.filter(n => n.category === 'promoter').length;
    const passives   = list.filter(n => n.category === 'passive').length;
    const detractors = list.filter(n => n.category === 'detractor').length;
    const score = Math.round(((promoters - detractors) / list.length) * 100);
    return { count: list.length, score, promoters, passives, detractors };
  }

  // ───────────────────────────── CSAT ────────────────────────────────
  function csatSubmit(tenantId, rating, context = '', userId = null) {
    ensureTenant(tenantId);
    rating = clamp(parseInt(rating, 10) || 0, 1, 5);
    const entry = { id: uid(), tenantId, userId, rating, context, ts: now() };
    STATE.csat.push(entry);
    STATE.tenants[tenantId].csatLast = now();
    trackEvent(tenantId, 'csat_submitted', { rating, context });
    persist();
    return entry;
  }

  function csatEligible(tenantId) {
    const t = ensureTenant(tenantId);
    return daysAgo(t.csatLast || 0) >= CONFIG.csatCooldownDays;
  }

  function csatScore(tenantId = null) {
    const list = tenantId
      ? STATE.csat.filter(c => c.tenantId === tenantId)
      : STATE.csat.slice();
    if (!list.length) return { count: 0, csat: 0, avg: 0 };
    const satisfied = list.filter(c => c.rating >= 4).length;
    const csat = Math.round((satisfied / list.length) * 100);
    const avg = +(list.reduce((s, c) => s + c.rating, 0) / list.length).toFixed(2);
    return { count: list.length, csat, avg };
  }

  // ───────────────────────────── Health Score ────────────────────────
  function computeHealth(tenantId) {
    const t = ensureTenant(tenantId);
    const eng  = engagementMetrics(tenantId);
    const onb  = onboardingProgress(tenantId);
    const adp  = adoptionReport(tenantId);
    const nps  = npsScore(tenantId);
    const csat = csatScore(tenantId);

    // Sub-scores 0..100
    const sLogin   = clamp(eng.logins30d * 5, 0, 100);
    const sActions = clamp(eng.actions30d / 5, 0, 100);
    const sOnb     = onb.pct;
    const sAdopt   = Math.round(adp.adoptionRate * 100);
    const sNps     = nps.count ? clamp(nps.score + 50, 0, 100) : 50;
    const sCsat    = csat.count ? csat.csat : 60;
    const sRecency = clamp(100 - eng.lastSeenDaysAgo * 5, 0, 100);
    const sBilling = t.plan === 'trial' ? 40 : t.plan === 'paid' ? 90 : 70;

    const breakdown = {
      login: sLogin, actions: sActions, onboarding: sOnb, adoption: sAdopt,
      nps: sNps, csat: sCsat, recency: sRecency, billing: sBilling,
    };
    const weights = {
      login: 0.10, actions: 0.15, onboarding: 0.15, adoption: 0.15,
      nps: 0.10, csat: 0.10, recency: 0.15, billing: 0.10,
    };
    let score = 0;
    for (const k in breakdown) score += breakdown[k] * weights[k];
    score = Math.round(score);

    let churnRisk = 'low';
    if (score < CONFIG.churnThresholds.high)        churnRisk = 'critical';
    else if (score < CONFIG.churnThresholds.medium) churnRisk = 'high';
    else if (score < CONFIG.churnThresholds.low)    churnRisk = 'medium';

    t.health = { score, churnRisk, lastEval: now(), breakdown };
    persist();
    return t.health;
  }

  function healthScore(tenantId) {
    const t = ensureTenant(tenantId);
    if (now() - t.health.lastEval > CONFIG.healthRecalcMs) computeHealth(tenantId);
    return t.health;
  }

  // ───────────────────────────── Churn Risk ──────────────────────────
  function churnIndicators(tenantId) {
    const t = ensureTenant(tenantId);
    const eng = engagementMetrics(tenantId);
    const onb = onboardingProgress(tenantId);
    const h = healthScore(tenantId);
    const flags = [];
    if (eng.lastSeenDaysAgo > 14) flags.push('inactive_14d');
    if (eng.logins30d < 2)        flags.push('low_logins');
    if (onb.stalled)              flags.push('onboarding_stalled');
    if (h.score < 40)             flags.push('health_critical');
    const recentDetractor = STATE.nps
      .filter(n => n.tenantId === tenantId && n.category === 'detractor')
      .some(n => daysAgo(n.ts) < 60);
    if (recentDetractor) flags.push('recent_detractor');
    const lowCsat = STATE.csat
      .filter(c => c.tenantId === tenantId && c.rating <= 2)
      .some(c => daysAgo(c.ts) < 30);
    if (lowCsat) flags.push('recent_low_csat');
    return { tenantId, churnRisk: h.churnRisk, score: h.score, flags };
  }

  // ───────────────────────────── Email Engine ────────────────────────
  function queueEmail(tenantId, template, extra = {}) {
    if (!CONFIG.emailTemplates[template]) return null;
    const tpl = CONFIG.emailTemplates[template];
    const t = ensureTenant(tenantId);
    // De-dupe last 24h
    const dup = STATE.emails.find(e =>
      e.tenantId === tenantId &&
      e.template === template &&
      now() - e.queuedAt < DAY
    );
    if (dup) return dup;
    const email = {
      id: uid(),
      tenantId,
      to: t.owner || extra.to || null,
      template,
      subject: tpl.subject,
      sendAt: now() + tpl.delayMin * 60_000,
      queuedAt: now(),
      sent: false,
      data: extra,
    };
    STATE.emails.push(email);
    persist();
    return email;
  }

  function flushEmails() {
    const due = STATE.emails.filter(e => !e.sent && e.sendAt <= now());
    due.forEach(e => {
      e.sent = true;
      e.sentAt = now();
      // Hook for actual transport
      if (typeof CSAPI._mailer === 'function') {
        try { CSAPI._mailer(e); } catch (err) { e.error = String(err); }
      }
    });
    persist();
    return due.length;
  }

  function behaviorHooks(tenantId, ev) {
    const t = STATE.tenants[tenantId];
    if (!t) return;
    if (ev.name === 'signup' || ev.name === 'tenant_created') {
      queueEmail(tenantId, 'welcome');
    }
    if (ev.name === 'onboarding_step') {
      const onb = onboardingProgress(tenantId);
      if (onb.stalled) queueEmail(tenantId, 'stuck_step', { step: onb.remaining[0] });
    }
    if (ev.name === 'login') {
      const eng = engagementMetrics(tenantId);
      if (eng.logins30d <= 2 && daysAgo(t.createdAt) > 14) {
        queueEmail(tenantId, 'low_engagement');
      }
    }
    if (ev.name === 'feature_used') {
      const adp = adoptionReport(tenantId);
      if (adp.unused.length > 6 && daysAgo(t.createdAt) > 30) {
        queueEmail(tenantId, 'feature_unused', { suggest: adp.unused.slice(0, 3) });
      }
    }
  }

  // Periodic sweep: recompute health and trigger lifecycle emails
  function sweep() {
    const ids = Object.keys(STATE.tenants);
    ids.forEach(id => {
      const h = computeHealth(id);
      const ind = churnIndicators(id);
      if (ind.churnRisk === 'critical') queueEmail(id, 'health_critical', { flags: ind.flags });
      else if (ind.churnRisk === 'high') queueEmail(id, 'churn_warning', { flags: ind.flags });
      if (npsEligible(id))  queueEmail(id, 'nps_request');
      if (csatEligible(id) && Math.random() < 0.2) queueEmail(id, 'csat_request');
    });
    flushEmails();
    STATE.lastHealthRun = now();
    persist();
  }

  // ───────────────────────────── Reporting ───────────────────────────
  function tenantSummary(tenantId) {
    const t = ensureTenant(tenantId);
    return {
      tenant: { id: t.id, plan: t.plan, country: t.country, ageDays: Math.round(daysAgo(t.createdAt)) },
      onboarding: onboardingProgress(tenantId),
      engagement: engagementMetrics(tenantId),
      adoption: adoptionReport(tenantId),
      health: healthScore(tenantId),
      churn: churnIndicators(tenantId),
      nps: npsScore(tenantId),
      csat: csatScore(tenantId),
    };
  }

  function globalDashboard() {
    const tenants = Object.values(STATE.tenants);
    const buckets = { low: 0, medium: 0, high: 0, critical: 0 };
    tenants.forEach(t => { buckets[healthScore(t.id).churnRisk]++; });
    return {
      tenants: tenants.length,
      nps: npsScore(),
      csat: csatScore(),
      churnBuckets: buckets,
      emailsQueued: STATE.emails.filter(e => !e.sent).length,
      emailsSent: STATE.emails.filter(e => e.sent).length,
      events: STATE.events.length,
      lastHealthRun: STATE.lastHealthRun,
    };
  }

  function exportData() {
    return JSON.parse(JSON.stringify(STATE));
  }

  function importData(json) {
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      STATE = Object.assign(Store._fresh(), obj);
      persist();
      return true;
    } catch (e) { return false; }
  }

  function reset() {
    STATE = Store._fresh();
    persist();
    return true;
  }

  // ───────────────────────────── Survey UI helper ────────────────────
  function renderNpsWidget(tenantId, mountId) {
    if (typeof document === 'undefined') return null;
    const mount = document.getElementById(mountId);
    if (!mount) return null;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'font-family:system-ui;padding:12px;border:1px solid #ddd;border-radius:8px;max-width:420px';
    wrap.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px">¿Qué tan probable es que recomiendes Volvix POS?</div>' +
      '<div id="nps-row" style="display:flex;gap:4px;flex-wrap:wrap"></div>' +
      '<textarea id="nps-comment" placeholder="Comentario (opcional)" style="width:100%;margin-top:8px;min-height:60px"></textarea>' +
      '<button id="nps-send" style="margin-top:8px;padding:6px 12px">Enviar</button>';
    mount.innerHTML = '';
    mount.appendChild(wrap);
    let chosen = null;
    const row = wrap.querySelector('#nps-row');
    for (let i = 0; i <= 10; i++) {
      const b = document.createElement('button');
      b.textContent = i;
      b.style.cssText = 'flex:1;min-width:32px;padding:6px';
      b.addEventListener('click', () => {
        chosen = i;
        row.querySelectorAll('button').forEach(x => x.style.background = '');
        b.style.background = '#7cf';
      });
      row.appendChild(b);
    }
    wrap.querySelector('#nps-send').addEventListener('click', () => {
      if (chosen === null) return;
      npsSubmit(tenantId, chosen, wrap.querySelector('#nps-comment').value);
      mount.innerHTML = '<div style="padding:12px">¡Gracias por tu feedback!</div>';
    });
    return wrap;
  }

  // ───────────────────────────── Public API ──────────────────────────
  const CSAPI = {
    config: CONFIG,
    // tenants
    ensureTenant,
    tenantSummary,
    listTenants: () => Object.values(STATE.tenants),
    // events
    track: trackEvent,
    // onboarding
    onboardingComplete,
    onboardingProgress,
    // adoption
    featureUsed: (id, f) => { adoptionMark(id, f); return trackEvent(id, 'feature_used', { feature: f }); },
    adoptionReport,
    // surveys
    nps: { submit: npsSubmit, score: npsScore, eligible: npsEligible, render: renderNpsWidget },
    csat: { submit: csatSubmit, score: csatScore, eligible: csatEligible },
    // health & churn
    healthScore,
    computeHealth,
    churnIndicators,
    engagementMetrics,
    // emails
    queueEmail,
    flushEmails,
    setMailer(fn) { CSAPI._mailer = fn; },
    _mailer: null,
    // ops
    sweep,
    dashboard: globalDashboard,
    exportData,
    importData,
    reset,
    version: '1.0.0',
  };

  global.CSAPI = CSAPI;

  // Auto sweep every minute in browser
  if (typeof global.setInterval === 'function') {
    global.setInterval(sweep, CONFIG.healthRecalcMs);
  }

})(typeof window !== 'undefined' ? window : globalThis);
