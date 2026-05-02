/* ============================================================================
 * volvix-marketing-wiring.js
 * Agent-62 R9 Volvix — Marketing Campaigns Wiring
 * SMS / WhatsApp / Email blast, scheduling, A/B subject testing,
 * open/click tracking, ROI per campaign, coupon generation, landing pages.
 * Exposes: window.MarketingAPI
 * ========================================================================== */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------
  const LS_KEY = 'volvix_marketing_v1';
  const _now = () => new Date().toISOString();
  const _uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  function _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('[MKT] load fail', e); }
    return {
      campaigns: [],
      contacts: [],
      segments: [],
      coupons: [],
      landings: [],
      events: [],   // open/click/conversion events
      schedules: [],
      abTests: [],
      sends: []     // per-recipient send records
    };
  }
  function _save(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { console.error('[MKT] save fail', e); }
  }
  let STATE = _load();

  // ---------------------------------------------------------------------------
  // Event bus
  // ---------------------------------------------------------------------------
  const _listeners = {};
  function on(evt, cb) { (_listeners[evt] = _listeners[evt] || []).push(cb); }
  function emit(evt, payload) {
    (_listeners[evt] || []).forEach((cb) => { try { cb(payload); } catch (e) { console.error(e); } });
    (_listeners['*'] || []).forEach((cb) => { try { cb({ evt, payload }); } catch (e) { console.error(e); } });
  }

  // ---------------------------------------------------------------------------
  // Contacts & Segments
  // ---------------------------------------------------------------------------
  function addContact({ name, phone, email, whatsapp, tags = [], meta = {} }) {
    const c = {
      id: _uid('ct'),
      name: name || '',
      phone: phone || '',
      email: email || '',
      whatsapp: whatsapp || phone || '',
      tags,
      meta,
      createdAt: _now(),
      optOut: { sms: false, email: false, whatsapp: false }
    };
    STATE.contacts.push(c); _save(STATE); emit('contact:added', c);
    return c;
  }
  function listContacts(filter = {}) {
    return STATE.contacts.filter((c) => {
      if (filter.tag && !c.tags.includes(filter.tag)) return false;
      if (filter.channel === 'sms' && !c.phone) return false;
      if (filter.channel === 'email' && !c.email) return false;
      if (filter.channel === 'whatsapp' && !c.whatsapp) return false;
      return true;
    });
  }
  function optOut(contactId, channel) {
    const c = STATE.contacts.find((x) => x.id === contactId);
    if (!c) return null;
    c.optOut[channel] = true; _save(STATE); emit('contact:optout', { contactId, channel });
    return c;
  }
  function createSegment({ name, rule }) {
    const s = { id: _uid('sg'), name, rule, createdAt: _now() };
    STATE.segments.push(s); _save(STATE); return s;
  }
  function resolveSegment(segmentId) {
    const s = STATE.segments.find((x) => x.id === segmentId);
    if (!s) return [];
    const r = s.rule || {};
    return STATE.contacts.filter((c) => {
      if (r.tag && !c.tags.includes(r.tag)) return false;
      if (r.hasEmail && !c.email) return false;
      if (r.hasPhone && !c.phone) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Coupons
  // ---------------------------------------------------------------------------
  function generateCoupon({ campaignId = null, discount = 10, type = 'percent', prefix = 'VOLVIX', expiresInDays = 30, maxUses = 1 }) {
    const code = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const cp = {
      id: _uid('cp'),
      code,
      campaignId,
      discount,
      type,           // percent | fixed
      maxUses,
      uses: 0,
      createdAt: _now(),
      expiresAt: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
      active: true
    };
    STATE.coupons.push(cp); _save(STATE); emit('coupon:created', cp);
    return cp;
  }
  function redeemCoupon(code, { orderTotal = 0 } = {}) {
    const cp = STATE.coupons.find((x) => x.code === code);
    if (!cp || !cp.active) return { ok: false, error: 'invalid' };
    if (new Date(cp.expiresAt) < new Date()) return { ok: false, error: 'expired' };
    if (cp.uses >= cp.maxUses) return { ok: false, error: 'maxed' };
    cp.uses++; if (cp.uses >= cp.maxUses) cp.active = false;
    const discountAmt = cp.type === 'percent' ? orderTotal * (cp.discount / 100) : cp.discount;
    _save(STATE); emit('coupon:redeemed', { code, discountAmt });
    return { ok: true, discountAmt, finalTotal: Math.max(0, orderTotal - discountAmt), coupon: cp };
  }
  function listCoupons(campaignId) {
    return campaignId ? STATE.coupons.filter((c) => c.campaignId === campaignId) : STATE.coupons.slice();
  }

  // ---------------------------------------------------------------------------
  // Landing Pages
  // ---------------------------------------------------------------------------
  function createLanding({ campaignId = null, slug, title, html, fields = ['email'] }) {
    const lp = {
      id: _uid('lp'),
      campaignId, slug, title, html, fields,
      url: `/lp/${slug}`,
      visits: 0, conversions: 0,
      createdAt: _now()
    };
    STATE.landings.push(lp); _save(STATE); return lp;
  }
  function trackLandingVisit(slug, { source = 'direct', utm = {} } = {}) {
    const lp = STATE.landings.find((x) => x.slug === slug);
    if (!lp) return null;
    lp.visits++;
    STATE.events.push({ id: _uid('ev'), type: 'landing:visit', landingId: lp.id, campaignId: lp.campaignId, source, utm, ts: _now() });
    _save(STATE); emit('landing:visit', { slug, source });
    return lp;
  }
  function trackLandingConversion(slug, payload = {}) {
    const lp = STATE.landings.find((x) => x.slug === slug);
    if (!lp) return null;
    lp.conversions++;
    STATE.events.push({ id: _uid('ev'), type: 'landing:conversion', landingId: lp.id, campaignId: lp.campaignId, payload, ts: _now() });
    _save(STATE); emit('landing:conversion', { slug, payload });
    return lp;
  }

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------
  function createCampaign({
    name, channel,                // 'sms' | 'email' | 'whatsapp'
    subject = '', body = '',
    segmentId = null, contactIds = null,
    couponId = null, landingSlug = null,
    cost = 0, expectedRevenuePerConversion = 0
  }) {
    if (!['sms', 'email', 'whatsapp'].includes(channel)) {
      throw new Error('Invalid channel: ' + channel);
    }
    const cmp = {
      id: _uid('cmp'),
      name, channel,
      subject, body,
      segmentId, contactIds,
      couponId, landingSlug,
      cost, expectedRevenuePerConversion,
      status: 'draft', // draft | scheduled | sending | sent | cancelled
      createdAt: _now(),
      sentAt: null,
      stats: { sent: 0, delivered: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 }
    };
    STATE.campaigns.push(cmp); _save(STATE); emit('campaign:created', cmp);
    return cmp;
  }

  function _resolveRecipients(cmp) {
    let pool = [];
    if (cmp.contactIds && cmp.contactIds.length) {
      pool = STATE.contacts.filter((c) => cmp.contactIds.includes(c.id));
    } else if (cmp.segmentId) {
      pool = resolveSegment(cmp.segmentId);
    } else {
      pool = STATE.contacts.slice();
    }
    return pool.filter((c) => !c.optOut[cmp.channel])
               .filter((c) => {
                 if (cmp.channel === 'email') return !!c.email;
                 if (cmp.channel === 'sms') return !!c.phone;
                 if (cmp.channel === 'whatsapp') return !!c.whatsapp;
                 return false;
               });
  }

  // Mock providers — in real system replace with Twilio/SendGrid/WhatsApp Cloud API
  const _providers = {
    sms:      async (to, body)         => ({ ok: Math.random() > 0.05, providerId: _uid('sms'), to, body }),
    email:    async (to, subject, body) => ({ ok: Math.random() > 0.03, providerId: _uid('em'),  to, subject, body }),
    whatsapp: async (to, body)         => ({ ok: Math.random() > 0.04, providerId: _uid('wa'),  to, body })
  };

  function _renderTemplate(tpl, contact, extras = {}) {
    return (tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (k in extras) return extras[k];
      if (k in contact) return contact[k];
      if (contact.meta && k in contact.meta) return contact.meta[k];
      return '';
    });
  }

  function _trackingLinks(cmp, contactId) {
    const base = (typeof location !== 'undefined' ? location.origin : '');
    return {
      open:  `${base}/mkt/o/${cmp.id}/${contactId}.gif`,
      click: `${base}/mkt/c/${cmp.id}/${contactId}?to=`
    };
  }

  async function sendCampaign(campaignId, { abVariant = null } = {}) {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId);
    if (!cmp) throw new Error('campaign not found');
    if (cmp.status === 'sent') return { ok: false, error: 'already sent' };
    cmp.status = 'sending'; _save(STATE); emit('campaign:sending', cmp);

    const recipients = _resolveRecipients(cmp);
    const subject = abVariant?.subject || cmp.subject;
    const body    = abVariant?.body    || cmp.body;
    const coupon  = cmp.couponId ? STATE.coupons.find((c) => c.id === cmp.couponId) : null;

    let delivered = 0;
    for (const c of recipients) {
      const tr = _trackingLinks(cmp, c.id);
      const renderedBody = _renderTemplate(body, c, {
        coupon: coupon ? coupon.code : '',
        landing: cmp.landingSlug ? `${(typeof location!=='undefined'?location.origin:'')}/lp/${encodeURIComponent(cmp.landingSlug)}?cid=${encodeURIComponent(cmp.id)}&u=${encodeURIComponent(c.id)}` : '',
        track_open: tr.open,
        track_click: tr.click
      });
      const renderedSubject = _renderTemplate(subject, c);

      let res;
      try {
        if (cmp.channel === 'email')        res = await _providers.email(c.email, renderedSubject, renderedBody);
        else if (cmp.channel === 'sms')     res = await _providers.sms(c.phone, renderedBody);
        else if (cmp.channel === 'whatsapp')res = await _providers.whatsapp(c.whatsapp, renderedBody);
      } catch (e) { res = { ok: false, error: e.message }; }

      const sendRec = {
        id: _uid('sd'), campaignId: cmp.id, contactId: c.id, channel: cmp.channel,
        ok: !!res?.ok, providerId: res?.providerId || null,
        abVariantId: abVariant?.id || null, ts: _now()
      };
      STATE.sends.push(sendRec);
      cmp.stats.sent++;
      if (res?.ok) { delivered++; cmp.stats.delivered++; }
    }

    cmp.status = 'sent'; cmp.sentAt = _now(); _save(STATE);
    emit('campaign:sent', { campaignId: cmp.id, delivered, total: recipients.length });
    return { ok: true, sent: cmp.stats.sent, delivered };
  }

  // ---------------------------------------------------------------------------
  // Tracking (opens / clicks / conversions)
  // ---------------------------------------------------------------------------
  function trackOpen(campaignId, contactId) {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId); if (!cmp) return null;
    cmp.stats.opens++;
    STATE.events.push({ id: _uid('ev'), type: 'open', campaignId, contactId, ts: _now() });
    _save(STATE); emit('track:open', { campaignId, contactId });
    return cmp.stats.opens;
  }
  function trackClick(campaignId, contactId, url = '') {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId); if (!cmp) return null;
    cmp.stats.clicks++;
    STATE.events.push({ id: _uid('ev'), type: 'click', campaignId, contactId, url, ts: _now() });
    _save(STATE); emit('track:click', { campaignId, contactId, url });
    return cmp.stats.clicks;
  }
  function trackConversion(campaignId, { contactId = null, revenue = 0, orderId = null } = {}) {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId); if (!cmp) return null;
    cmp.stats.conversions++;
    cmp.stats.revenue += Number(revenue) || 0;
    STATE.events.push({ id: _uid('ev'), type: 'conversion', campaignId, contactId, revenue, orderId, ts: _now() });
    _save(STATE); emit('track:conversion', { campaignId, contactId, revenue });
    return cmp.stats;
  }

  // ---------------------------------------------------------------------------
  // ROI / Reporting
  // ---------------------------------------------------------------------------
  function campaignROI(campaignId) {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId);
    if (!cmp) return null;
    const s = cmp.stats;
    const cost = Number(cmp.cost) || 0;
    const revenue = s.revenue || (s.conversions * (cmp.expectedRevenuePerConversion || 0));
    const profit = revenue - cost;
    const roi = cost > 0 ? (profit / cost) * 100 : null;
    return {
      campaignId, name: cmp.name, channel: cmp.channel,
      sent: s.sent, delivered: s.delivered,
      opens: s.opens, clicks: s.clicks, conversions: s.conversions,
      openRate:  s.delivered ? +(s.opens   / s.delivered * 100).toFixed(2) : 0,
      clickRate: s.delivered ? +(s.clicks  / s.delivered * 100).toFixed(2) : 0,
      convRate:  s.delivered ? +(s.conversions / s.delivered * 100).toFixed(2) : 0,
      cost, revenue, profit,
      roi: roi !== null ? +roi.toFixed(2) : null
    };
  }
  function reportAll() {
    return STATE.campaigns.map((c) => campaignROI(c.id));
  }

  // ---------------------------------------------------------------------------
  // A/B testing (subject lines mainly)
  // ---------------------------------------------------------------------------
  function createABTest({ campaignId, variants, splitPct = 50, metric = 'opens' }) {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId);
    if (!cmp) throw new Error('campaign not found');
    if (!Array.isArray(variants) || variants.length < 2) throw new Error('need >=2 variants');
    const test = {
      id: _uid('ab'),
      campaignId,
      variants: variants.map((v) => ({ id: _uid('var'), ...v, sent: 0, opens: 0, clicks: 0, conversions: 0 })),
      splitPct, metric, status: 'pending', winnerId: null, createdAt: _now()
    };
    STATE.abTests.push(test); _save(STATE); return test;
  }
  async function runABTest(testId) {
    const test = STATE.abTests.find((x) => x.id === testId);
    if (!test) throw new Error('ab test not found');
    const cmp = STATE.campaigns.find((x) => x.id === test.campaignId);
    const recipients = _resolveRecipients(cmp);
    test.status = 'running';
    for (let i = 0; i < recipients.length; i++) {
      const variant = test.variants[i % test.variants.length];
      // simulate per-variant send by directly calling sendCampaign logic for one contact
      const tr = _trackingLinks(cmp, recipients[i].id);
      const body = _renderTemplate(variant.body || cmp.body, recipients[i], { track_open: tr.open, track_click: tr.click });
      const subject = _renderTemplate(variant.subject || cmp.subject, recipients[i]);
      let res;
      if (cmp.channel === 'email')         res = await _providers.email(recipients[i].email, subject, body);
      else if (cmp.channel === 'sms')      res = await _providers.sms(recipients[i].phone, body);
      else if (cmp.channel === 'whatsapp') res = await _providers.whatsapp(recipients[i].whatsapp, body);
      variant.sent++;
      STATE.sends.push({ id: _uid('sd'), campaignId: cmp.id, contactId: recipients[i].id, abVariantId: variant.id, ok: !!res?.ok, ts: _now() });
    }
    test.status = 'sent'; _save(STATE); emit('ab:sent', { testId });
    return test;
  }
  function declareABWinner(testId) {
    const test = STATE.abTests.find((x) => x.id === testId);
    if (!test) return null;
    const sorted = test.variants.slice().sort((a, b) => (b[test.metric] || 0) - (a[test.metric] || 0));
    test.winnerId = sorted[0].id; test.status = 'completed'; _save(STATE);
    emit('ab:winner', { testId, winnerId: test.winnerId });
    return sorted[0];
  }

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------
  const _timers = {};
  function scheduleCampaign(campaignId, whenISO) {
    const cmp = STATE.campaigns.find((x) => x.id === campaignId);
    if (!cmp) throw new Error('campaign not found');
    const when = new Date(whenISO).getTime();
    const delay = Math.max(0, when - Date.now());
    const sch = { id: _uid('sch'), campaignId, runAt: whenISO, status: 'scheduled', createdAt: _now() };
    STATE.schedules.push(sch); cmp.status = 'scheduled'; _save(STATE);
    _timers[sch.id] = setTimeout(async () => {
      sch.status = 'firing'; _save(STATE);
      try { await sendCampaign(campaignId); sch.status = 'done'; }
      catch (e) { sch.status = 'error'; sch.error = e.message; }
      _save(STATE);
    }, delay);
    emit('campaign:scheduled', sch);
    return sch;
  }
  function cancelSchedule(scheduleId) {
    const sch = STATE.schedules.find((x) => x.id === scheduleId);
    if (!sch) return null;
    if (_timers[scheduleId]) { clearTimeout(_timers[scheduleId]); delete _timers[scheduleId]; }
    sch.status = 'cancelled';
    const cmp = STATE.campaigns.find((c) => c.id === sch.campaignId);
    if (cmp && cmp.status === 'scheduled') cmp.status = 'draft';
    _save(STATE); emit('campaign:cancelled', sch);
    return sch;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function reset() { STATE = { campaigns:[], contacts:[], segments:[], coupons:[], landings:[], events:[], schedules:[], abTests:[], sends:[] }; _save(STATE); }
  function dump() { return JSON.parse(JSON.stringify(STATE)); }
  function importData(data) { STATE = Object.assign(STATE, data || {}); _save(STATE); }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const MarketingAPI = {
    // contacts/segments
    addContact, listContacts, optOut, createSegment, resolveSegment,
    // coupons
    generateCoupon, redeemCoupon, listCoupons,
    // landings
    createLanding, trackLandingVisit, trackLandingConversion,
    // campaigns
    createCampaign, sendCampaign,
    // tracking
    trackOpen, trackClick, trackConversion,
    // reports
    campaignROI, reportAll,
    // a/b
    createABTest, runABTest, declareABWinner,
    // scheduling
    scheduleCampaign, cancelSchedule,
    // events
    on, emit,
    // misc
    reset, dump, importData,
    _state: () => STATE,
    version: '1.0.0'
  };

  global.MarketingAPI = MarketingAPI;
  console.log('[MarketingAPI] ready v' + MarketingAPI.version);
})(typeof window !== 'undefined' ? window : globalThis);
