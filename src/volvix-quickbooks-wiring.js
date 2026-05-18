/**
 * volvix-quickbooks-wiring.js
 * QuickBooks Online Integration Mock for Volvix POS
 * Provides: OAuth flow, sync (sales/customers/products), webhooks, reconciliation
 * Exposes: window.QuickBooksAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────
  const QB_CONFIG = {
    clientId: 'QB_MOCK_CLIENT_ID_volvix_pos',
    clientSecret: 'QB_MOCK_SECRET_xxxx',
    redirectUri: 'https://volvix.local/qb/callback',
    scope: 'com.intuit.quickbooks.accounting com.intuit.quickbooks.payment',
    environment: 'sandbox', // sandbox | production
    apiBase: 'https://sandbox-quickbooks.api.intuit.com/v3/company',
    authBase: 'https://appcenter.intuit.com/connect/oauth2',
    tokenBase: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    webhookVerifierToken: 'WHK_VERIFIER_MOCK',
    realmId: null,
    minorVersion: 65,
  };

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  const state = {
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: 0,
    connected: false,
    lastSyncAt: null,
    syncQueue: [],
    syncLog: [],
    webhookHandlers: new Map(),
    rateLimitRemaining: 500,
    rateLimitReset: Date.now() + 60000,
  };

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────
  function uid(prefix) {
    return (prefix || 'qb') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function log(level, msg, extra) {
    const entry = { ts: new Date().toISOString(), level, msg, extra: extra || null };
    state.syncLog.push(entry);
    if (state.syncLog.length > 500) state.syncLog.shift();
    if (level === 'error') console.error('[QB]', msg, extra || '');
    else console.log('[QB:' + level + ']', msg);
    return entry;
  }

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function now() { return Date.now(); }

  function ensureAuth() {
    if (!state.connected) throw new Error('QuickBooks not connected. Call connect() first.');
    if (now() >= state.tokenExpiresAt) {
      log('warn', 'Token expired, refreshing...');
      return refreshAccessToken();
    }
    return Promise.resolve(true);
  }

  // ─────────────────────────────────────────────────────────────
  // OAuth 2.0 Flow (mock)
  // ─────────────────────────────────────────────────────────────
  function buildAuthUrl(stateParam) {
    const params = new URLSearchParams({
      client_id: QB_CONFIG.clientId,
      scope: QB_CONFIG.scope,
      redirect_uri: QB_CONFIG.redirectUri,
      response_type: 'code',
      state: stateParam || uid('state'),
    });
    return QB_CONFIG.authBase + '?' + params.toString();
  }

  async function exchangeCodeForToken(authCode, realmId) {
    log('info', 'Exchanging auth code for token', { realmId: realmId });
    await delay(400);
    if (!authCode) throw new Error('Missing auth code');
    state.accessToken = 'qb_at_' + uid();
    state.refreshToken = 'qb_rt_' + uid();
    state.tokenExpiresAt = now() + 3600 * 1000;
    QB_CONFIG.realmId = realmId || 'REALM_' + uid();
    state.connected = true;
    log('info', 'OAuth complete, realm=' + QB_CONFIG.realmId);
    return {
      access_token: state.accessToken,
      refresh_token: state.refreshToken,
      expires_in: 3600,
      realmId: QB_CONFIG.realmId,
      token_type: 'bearer',
    };
  }

  async function refreshAccessToken() {
    if (!state.refreshToken) throw new Error('No refresh token');
    log('info', 'Refreshing access token');
    await delay(250);
    state.accessToken = 'qb_at_' + uid();
    state.tokenExpiresAt = now() + 3600 * 1000;
    return state.accessToken;
  }

  async function connect(opts) {
    opts = opts || {};
    const code = opts.authCode || 'MOCK_AUTH_CODE_' + uid();
    const realm = opts.realmId || ('R_' + Math.floor(Math.random() * 1e10));
    return exchangeCodeForToken(code, realm);
  }

  function disconnect() {
    state.accessToken = null;
    state.refreshToken = null;
    state.tokenExpiresAt = 0;
    state.connected = false;
    QB_CONFIG.realmId = null;
    log('info', 'Disconnected from QuickBooks');
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Mock HTTP request to QB API
  // ─────────────────────────────────────────────────────────────
  async function qbRequest(method, endpoint, body) {
    await ensureAuth();
    if (state.rateLimitRemaining <= 0 && now() < state.rateLimitReset) {
      throw new Error('Rate limit exceeded. Retry after ' + new Date(state.rateLimitReset).toISOString());
    }
    state.rateLimitRemaining--;
    await delay(150 + Math.random() * 200);
    const url = QB_CONFIG.apiBase + '/' + QB_CONFIG.realmId + endpoint;
    log('debug', method + ' ' + url);
    return {
      status: 200,
      url: url,
      data: body ? Object.assign({ Id: uid('qb'), SyncToken: '0' }, body) : { ok: true },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Customer sync
  // ─────────────────────────────────────────────────────────────
  async function syncCustomer(customer) {
    if (!customer || !customer.name) throw new Error('Customer.name required');
    const payload = {
      DisplayName: customer.name,
      PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
      PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
      BillAddr: customer.address ? {
        Line1: customer.address.line1 || '',
        City: customer.address.city || '',
        CountrySubDivisionCode: customer.address.state || '',
        PostalCode: customer.address.zip || '',
      } : undefined,
      Notes: customer.notes || '',
    };
    const res = await qbRequest('POST', '/customer', payload);
    log('info', 'Customer synced: ' + customer.name, { qbId: res.data.Id });
    return { ok: true, qbId: res.data.Id, local: customer };
  }

  async function syncCustomersBatch(list) {
    const results = [];
    for (const c of list) {
      try { results.push(await syncCustomer(c)); }
      catch (e) { results.push({ ok: false, error: e.message, local: c }); }
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Product / Item sync
  // ─────────────────────────────────────────────────────────────
  async function syncProduct(product) {
    if (!product || !product.sku || !product.name) throw new Error('Product requires sku and name');
    const payload = {
      Name: product.name,
      Sku: product.sku,
      Type: product.type || 'Inventory',
      UnitPrice: Number(product.price) || 0,
      PurchaseCost: Number(product.cost) || 0,
      QtyOnHand: Number(product.qty) || 0,
      TrackQtyOnHand: product.trackQty !== false,
      IncomeAccountRef: { value: '79', name: 'Sales of Product Income' },
      ExpenseAccountRef: { value: '80', name: 'Cost of Goods Sold' },
      AssetAccountRef: { value: '81', name: 'Inventory Asset' },
      InvStartDate: new Date().toISOString().slice(0, 10),
    };
    const res = await qbRequest('POST', '/item', payload);
    log('info', 'Product synced: ' + product.sku, { qbId: res.data.Id });
    return { ok: true, qbId: res.data.Id, local: product };
  }

  async function syncProductsBatch(list) {
    const results = [];
    for (const p of list) {
      try { results.push(await syncProduct(p)); }
      catch (e) { results.push({ ok: false, error: e.message, local: p }); }
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Sales / Invoice / SalesReceipt sync
  // ─────────────────────────────────────────────────────────────
  async function syncSale(sale) {
    if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) {
      throw new Error('Sale requires items[]');
    }
    const lines = sale.items.map(function (it, idx) {
      return {
        Id: String(idx + 1),
        LineNum: idx + 1,
        Amount: Number(it.qty || 1) * Number(it.price || 0),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: it.qbItemId || 'ITEM_UNKNOWN', name: it.name || it.sku },
          Qty: Number(it.qty || 1),
          UnitPrice: Number(it.price || 0),
          TaxCodeRef: { value: it.taxable === false ? 'NON' : 'TAX' },
        },
      };
    });
    const subtotal = lines.reduce(function (s, l) { return s + l.Amount; }, 0);
    const payload = {
      DocNumber: sale.docNumber || ('VLX-' + Date.now()),
      TxnDate: sale.date || new Date().toISOString().slice(0, 10),
      CustomerRef: sale.customerId ? { value: sale.customerId } : { value: '1', name: 'Walk-in' },
      Line: lines,
      TotalAmt: subtotal + (sale.tax || 0),
      PaymentMethodRef: { value: sale.paymentMethod === 'cash' ? '1' : '2' },
      PrivateNote: 'Synced from Volvix POS ' + (sale.id || ''),
    };
    const endpoint = sale.type === 'invoice' ? '/invoice' : '/salesreceipt';
    const res = await qbRequest('POST', endpoint, payload);
    log('info', 'Sale synced: ' + payload.DocNumber, { qbId: res.data.Id, total: payload.TotalAmt });
    return { ok: true, qbId: res.data.Id, docNumber: payload.DocNumber, local: sale };
  }

  async function syncSalesBatch(list) {
    const results = [];
    for (const s of list) {
      try { results.push(await syncSale(s)); }
      catch (e) { results.push({ ok: false, error: e.message, local: s }); }
    }
    state.lastSyncAt = new Date().toISOString();
    return results;
  }

  // ─────────────────────────────────────────────────────────────
  // Queue + auto-sync
  // ─────────────────────────────────────────────────────────────
  function enqueue(kind, payload) {
    const job = { id: uid('job'), kind: kind, payload: payload, attempts: 0, status: 'pending', enqueuedAt: now() };
    state.syncQueue.push(job);
    log('debug', 'Enqueued ' + kind, { jobId: job.id });
    return job.id;
  }

  async function processQueue(maxJobs) {
    maxJobs = maxJobs || 25;
    const processed = [];
    let i = 0;
    while (state.syncQueue.length > 0 && i < maxJobs) {
      const job = state.syncQueue.shift();
      job.attempts++;
      job.status = 'running';
      try {
        let result;
        if (job.kind === 'customer') result = await syncCustomer(job.payload);
        else if (job.kind === 'product') result = await syncProduct(job.payload);
        else if (job.kind === 'sale') result = await syncSale(job.payload);
        else throw new Error('Unknown job kind: ' + job.kind);
        job.status = 'done';
        job.result = result;
      } catch (e) {
        job.status = job.attempts < 3 ? 'pending' : 'failed';
        job.error = e.message;
        if (job.status === 'pending') state.syncQueue.push(job);
        else log('error', 'Job failed permanently', { jobId: job.id, error: e.message });
      }
      processed.push(job);
      i++;
    }
    return processed;
  }

  // ─────────────────────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────────────────────
  function verifyWebhookSignature(payload, signature) {
    // Mock HMAC-SHA256 verification
    if (!signature) return false;
    const expected = 'sha256=' + btoa(QB_CONFIG.webhookVerifierToken + JSON.stringify(payload)).slice(0, 32);
    return signature === expected || signature.startsWith('sha256=');
  }

  function onWebhook(eventName, handler) {
    if (!state.webhookHandlers.has(eventName)) state.webhookHandlers.set(eventName, []);
    state.webhookHandlers.get(eventName).push(handler);
    return function off() {
      const arr = state.webhookHandlers.get(eventName) || [];
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  async function handleWebhook(payload, signature) {
    if (!verifyWebhookSignature(payload, signature)) {
      log('error', 'Invalid webhook signature');
      return { ok: false, error: 'Invalid signature' };
    }
    const events = (payload && payload.eventNotifications) || [];
    const dispatched = [];
    for (const note of events) {
      const realmId = note.realmId;
      const entities = (note.dataChangeEvent && note.dataChangeEvent.entities) || [];
      for (const entity of entities) {
        const evName = (entity.name || 'Unknown') + '.' + (entity.operation || 'updated');
        const handlers = state.webhookHandlers.get(evName) || [];
        const generic = state.webhookHandlers.get('*') || [];
        for (const h of handlers.concat(generic)) {
          try { await h({ realmId: realmId, entity: entity }); }
          catch (e) { log('error', 'Webhook handler error', { event: evName, error: e.message }); }
        }
        dispatched.push(evName);
        log('info', 'Webhook dispatched: ' + evName, { id: entity.id });
      }
    }
    return { ok: true, dispatched: dispatched };
  }

  // ─────────────────────────────────────────────────────────────
  // Reports / Reconciliation
  // ─────────────────────────────────────────────────────────────
  async function fetchReport(reportName, params) {
    await ensureAuth();
    await delay(300);
    log('info', 'Fetched report ' + reportName, params || {});
    return {
      Header: { Time: new Date().toISOString(), ReportName: reportName },
      Rows: { Row: [] },
      params: params || {},
    };
  }

  async function reconcile(localSales) {
    const remote = await fetchReport('SalesByCustomer', { start_date: '2026-01-01' });
    const localTotal = (localSales || []).reduce(function (s, x) { return s + (x.total || 0); }, 0);
    return {
      localCount: (localSales || []).length,
      localTotal: localTotal,
      remoteReport: remote.Header.ReportName,
      timestamp: new Date().toISOString(),
      status: 'reconciled',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Status / introspection
  // ─────────────────────────────────────────────────────────────
  function status() {
    return {
      connected: state.connected,
      realmId: QB_CONFIG.realmId,
      environment: QB_CONFIG.environment,
      tokenExpiresIn: state.connected ? Math.max(0, Math.floor((state.tokenExpiresAt - now()) / 1000)) : 0,
      lastSyncAt: state.lastSyncAt,
      queueLength: state.syncQueue.length,
      rateLimitRemaining: state.rateLimitRemaining,
      logEntries: state.syncLog.length,
    };
  }

  function getLog(limit) {
    limit = limit || 50;
    return state.syncLog.slice(-limit);
  }

  function configure(overrides) {
    Object.assign(QB_CONFIG, overrides || {});
    return Object.assign({}, QB_CONFIG);
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────
  global.QuickBooksAPI = {
    // OAuth
    buildAuthUrl: buildAuthUrl,
    connect: connect,
    disconnect: disconnect,
    refreshAccessToken: refreshAccessToken,
    // Sync
    syncCustomer: syncCustomer,
    syncCustomersBatch: syncCustomersBatch,
    syncProduct: syncProduct,
    syncProductsBatch: syncProductsBatch,
    syncSale: syncSale,
    syncSalesBatch: syncSalesBatch,
    // Queue
    enqueue: enqueue,
    processQueue: processQueue,
    // Webhooks
    onWebhook: onWebhook,
    handleWebhook: handleWebhook,
    verifyWebhookSignature: verifyWebhookSignature,
    // Reports
    fetchReport: fetchReport,
    reconcile: reconcile,
    // Meta
    status: status,
    getLog: getLog,
    configure: configure,
    _state: state,
    _config: QB_CONFIG,
  };

  console.log('[QuickBooksAPI] Volvix wiring loaded. Call QuickBooksAPI.connect() to begin.');
})(typeof window !== 'undefined' ? window : globalThis);
