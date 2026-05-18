/* ============================================================
 * volvix-hubspot-wiring.js
 * HubSpot CRM integration: contacts, deals, companies, sync sales
 * Exposes: window.HubspotAPI
 * ============================================================ */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const STORAGE_KEY = 'volvix_hubspot_state_v1';
  const QUEUE_KEY = 'volvix_hubspot_queue_v1';
  const DEFAULT_BASE = 'https://api.hubapi.com';

  // ---------- Internal state ----------
  const state = {
    apiKey: null,
    portalId: null,
    baseUrl: DEFAULT_BASE,
    connected: false,
    lastSync: null,
    contacts: [],
    deals: [],
    companies: [],
    listeners: {},
    rateLimit: { remaining: 100, resetAt: 0 },
  };

  // ---------- Persistence ----------
  function saveState() {
    try {
      const snap = {
        apiKey: state.apiKey,
        portalId: state.portalId,
        baseUrl: state.baseUrl,
        lastSync: state.lastSync,
        contacts: state.contacts,
        deals: state.deals,
        companies: state.companies,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch (e) { console.warn('[Hubspot] saveState failed', e); }
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw);
      Object.assign(state, snap);
    } catch (e) { console.warn('[Hubspot] loadState failed', e); }
  }
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
    catch (e) { console.warn('[Hubspot] saveQueue failed', e); }
  }

  // ---------- Event bus ----------
  function on(event, cb) {
    (state.listeners[event] = state.listeners[event] || []).push(cb);
  }
  function off(event, cb) {
    if (!state.listeners[event]) return;
    state.listeners[event] = state.listeners[event].filter(f => f !== cb);
  }
  function emit(event, payload) {
    (state.listeners[event] || []).forEach(cb => {
      try { cb(payload); } catch (e) { console.error('[Hubspot] listener error', e); }
    });
  }

  // ---------- HTTP helper ----------
  async function http(method, path, body) {
    if (!state.apiKey) throw new Error('HubSpot API key not configured');
    const url = state.baseUrl + path;
    const headers = {
      'Authorization': 'Bearer ' + state.apiKey,
      'Content-Type': 'application/json',
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      try {
        const r = await fetch(url, opts);
        const remaining = r.headers.get('X-HubSpot-RateLimit-Remaining');
        if (remaining != null) state.rateLimit.remaining = parseInt(remaining, 10);
        if (r.status === 429) {
          await sleep(1000 * attempt);
          continue;
        }
        if (!r.ok) {
          const text = await r.text();
          throw new Error('HubSpot ' + r.status + ': ' + text);
        }
        if (r.status === 204) return null;
        return await r.json();
      } catch (err) {
        if (attempt >= 3) throw err;
        await sleep(500 * attempt);
      }
    }
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Configuration ----------
  function configure({ apiKey, portalId, baseUrl } = {}) {
    if (apiKey) state.apiKey = apiKey;
    if (portalId) state.portalId = portalId;
    if (baseUrl) state.baseUrl = baseUrl;
    saveState();
    emit('configured', { portalId: state.portalId });
    return { ok: true };
  }
  async function connect() {
    try {
      await http('GET', '/crm/v3/owners?limit=1');
      state.connected = true;
      emit('connected', {});
      saveState();
      return { ok: true };
    } catch (e) {
      state.connected = false;
      emit('disconnected', { error: e.message });
      return { ok: false, error: e.message };
    }
  }
  function disconnect() {
    state.connected = false;
    state.apiKey = null;
    saveState();
    emit('disconnected', {});
  }

  // ---------- Contacts ----------
  async function listContacts(limit = 100) {
    const data = await http('GET', `/crm/v3/objects/contacts?limit=${limit}`);
    state.contacts = data.results || [];
    saveState();
    emit('contacts:loaded', state.contacts);
    return state.contacts;
  }
  async function getContact(id) {
    return http('GET', `/crm/v3/objects/contacts/${id}`);
  }
  async function createContact(props) {
    const body = { properties: props };
    const r = await http('POST', '/crm/v3/objects/contacts', body);
    state.contacts.push(r);
    emit('contact:created', r);
    saveState();
    return r;
  }
  async function updateContact(id, props) {
    const r = await http('PATCH', `/crm/v3/objects/contacts/${id}`, { properties: props });
    emit('contact:updated', r);
    return r;
  }
  async function deleteContact(id) {
    await http('DELETE', `/crm/v3/objects/contacts/${id}`);
    state.contacts = state.contacts.filter(c => c.id !== id);
    saveState();
    emit('contact:deleted', { id });
    return { ok: true };
  }
  async function searchContacts(query) {
    const body = {
      query,
      limit: 50,
      properties: ['firstname', 'lastname', 'email', 'phone', 'company'],
    };
    return http('POST', '/crm/v3/objects/contacts/search', body);
  }

  // ---------- Companies ----------
  async function listCompanies(limit = 100) {
    const data = await http('GET', `/crm/v3/objects/companies?limit=${limit}`);
    state.companies = data.results || [];
    saveState();
    emit('companies:loaded', state.companies);
    return state.companies;
  }
  async function getCompany(id) {
    return http('GET', `/crm/v3/objects/companies/${id}`);
  }
  async function createCompany(props) {
    const r = await http('POST', '/crm/v3/objects/companies', { properties: props });
    state.companies.push(r);
    saveState();
    emit('company:created', r);
    return r;
  }
  async function updateCompany(id, props) {
    return http('PATCH', `/crm/v3/objects/companies/${id}`, { properties: props });
  }
  async function deleteCompany(id) {
    await http('DELETE', `/crm/v3/objects/companies/${id}`);
    state.companies = state.companies.filter(c => c.id !== id);
    saveState();
    return { ok: true };
  }

  // ---------- Deals ----------
  async function listDeals(limit = 100) {
    const data = await http('GET', `/crm/v3/objects/deals?limit=${limit}`);
    state.deals = data.results || [];
    saveState();
    emit('deals:loaded', state.deals);
    return state.deals;
  }
  async function getDeal(id) {
    return http('GET', `/crm/v3/objects/deals/${id}`);
  }
  async function createDeal(props) {
    const r = await http('POST', '/crm/v3/objects/deals', { properties: props });
    state.deals.push(r);
    saveState();
    emit('deal:created', r);
    return r;
  }
  async function updateDeal(id, props) {
    return http('PATCH', `/crm/v3/objects/deals/${id}`, { properties: props });
  }
  async function moveDealStage(id, stage) {
    return updateDeal(id, { dealstage: stage });
  }
  async function deleteDeal(id) {
    await http('DELETE', `/crm/v3/objects/deals/${id}`);
    state.deals = state.deals.filter(d => d.id !== id);
    saveState();
    return { ok: true };
  }

  // ---------- Associations ----------
  async function associateContactToCompany(contactId, companyId) {
    const path = `/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`;
    return http('PUT', path);
  }
  async function associateDealToContact(dealId, contactId) {
    const path = `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`;
    return http('PUT', path);
  }

  // ---------- POS sale -> HubSpot deal ----------
  async function syncSale(sale) {
    if (!sale || !sale.id) throw new Error('sale.id required');
    const props = {
      dealname: sale.name || ('POS Sale ' + sale.id),
      amount: String(sale.total || 0),
      pipeline: sale.pipeline || 'default',
      dealstage: sale.stage || 'closedwon',
      closedate: sale.closeDate || new Date().toISOString(),
      volvix_sale_id: String(sale.id),
      volvix_payment_method: sale.paymentMethod || 'cash',
      volvix_items_count: String((sale.items || []).length),
    };
    let deal;
    try {
      deal = await createDeal(props);
    } catch (e) {
      enqueue({ type: 'sale', sale, error: e.message, ts: Date.now() });
      throw e;
    }
    if (sale.contactId) {
      try { await associateDealToContact(deal.id, sale.contactId); }
      catch (e) { console.warn('[Hubspot] associate failed', e.message); }
    }
    emit('sale:synced', { sale, deal });
    return deal;
  }

  async function syncSalesBatch(sales) {
    const results = [];
    for (const s of sales) {
      try { results.push({ ok: true, deal: await syncSale(s) }); }
      catch (e) { results.push({ ok: false, error: e.message, sale: s }); }
    }
    state.lastSync = new Date().toISOString();
    saveState();
    emit('sales:batch-synced', { count: results.length, results });
    return results;
  }

  // ---------- Offline queue ----------
  function enqueue(item) {
    const q = loadQueue();
    q.push(item);
    saveQueue(q);
    emit('queue:added', { size: q.length });
  }
  async function flushQueue() {
    const q = loadQueue();
    if (!q.length) return { flushed: 0 };
    const remaining = [];
    let flushed = 0;
    for (const item of q) {
      try {
        if (item.type === 'sale') await syncSale(item.sale);
        flushed++;
      } catch {
        remaining.push(item);
      }
    }
    saveQueue(remaining);
    emit('queue:flushed', { flushed, remaining: remaining.length });
    return { flushed, remaining: remaining.length };
  }

  // ---------- Pipelines / metadata ----------
  async function getPipelines() {
    return http('GET', '/crm/v3/pipelines/deals');
  }
  async function getOwners() {
    return http('GET', '/crm/v3/owners');
  }

  // ---------- Reports ----------
  function summary() {
    const totalAmount = state.deals.reduce((s, d) => {
      const a = parseFloat((d.properties && d.properties.amount) || 0);
      return s + (isNaN(a) ? 0 : a);
    }, 0);
    return {
      contacts: state.contacts.length,
      companies: state.companies.length,
      deals: state.deals.length,
      totalAmount,
      lastSync: state.lastSync,
      connected: state.connected,
      queue: loadQueue().length,
    };
  }

  // ---------- Init ----------
  loadState();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flushQueue().catch(() => {}));
  }

  // ---------- Public API ----------
  const HubspotAPI = {
    VERSION,
    configure, connect, disconnect,
    on, off,
    listContacts, getContact, createContact, updateContact, deleteContact, searchContacts,
    listCompanies, getCompany, createCompany, updateCompany, deleteCompany,
    listDeals, getDeal, createDeal, updateDeal, moveDealStage, deleteDeal,
    associateContactToCompany, associateDealToContact,
    syncSale, syncSalesBatch,
    enqueue, flushQueue,
    getPipelines, getOwners,
    summary,
    _state: () => ({ ...state }),
  };

  global.HubspotAPI = HubspotAPI;
  emit('ready', { version: VERSION });
})(typeof window !== 'undefined' ? window : globalThis);
