/**
 * volvix-mailchimp-wiring.js
 * Mailchimp integration for Volvix POS
 * Exposes: window.MailchimpAPI
 *
 * Capabilities:
 *  - Audience (lists) management
 *  - Subscriber/member sync from POS customers
 *  - Campaign creation, scheduling and sending
 *  - Automation (classic + customer journeys) triggers
 *  - Tags, merge fields, segments
 *  - Webhook + event tracking
 *  - Local queue with retry/backoff for offline resilience
 */

(function (global) {
  'use strict';

  const STORAGE_KEY  = 'volvix.mailchimp.config';
  const QUEUE_KEY    = 'volvix.mailchimp.queue';
  const CACHE_KEY    = 'volvix.mailchimp.cache';
  const LOG_PREFIX   = '[MailchimpAPI]';
  const DEFAULT_DC   = 'us1';
  const API_VERSION  = '3.0';
  const MAX_RETRIES  = 5;
  const BACKOFF_MS   = 1500;

  // ---------- internal state ----------
  let _config = {
    apiKey:     '',
    serverDc:   DEFAULT_DC,
    defaultListId: '',
    fromName:   'Volvix POS',
    replyTo:    '',
    enabled:    false
  };
  let _cache  = { lists: [], campaigns: [], automations: [], tags: {} };
  let _queue  = [];
  let _online = (typeof navigator !== 'undefined') ? navigator.onLine : true;

  // ---------- utilities ----------
  function log()  { try { console.log.apply(console,  [LOG_PREFIX].concat([].slice.call(arguments))); } catch(_){} }
  function warn() { try { console.warn.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch(_){} }
  function err()  { try { console.error.apply(console,[LOG_PREFIX].concat([].slice.call(arguments))); } catch(_){} }

  function md5Hex(str) {
    // tiny md5 (subscriber_hash = md5(lowercase email)). Implementation kept compact.
    function rh(n){var j,s='';for(j=0;j<=3;j++)s+=('0'+((n>>(j*8))&255).toString(16)).slice(-2);return s;}
    function ad(x,y){var l=(x&0xFFFF)+(y&0xFFFF);return(((x>>16)+(y>>16)+(l>>16))<<16)|(l&0xFFFF);}
    function rl(n,c){return(n<<c)|(n>>>(32-c));}
    function cm(q,a,b,x,s,t){return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}
    function ff(a,b,c,d,x,s,t){return cm((b&c)|((~b)&d),a,b,x,s,t);}
    function gg(a,b,c,d,x,s,t){return cm((b&d)|(c&(~d)),a,b,x,s,t);}
    function hh(a,b,c,d,x,s,t){return cm(b^c^d,a,b,x,s,t);}
    function ii(a,b,c,d,x,s,t){return cm(c^(b|(~d)),a,b,x,s,t);}
    function c2b(s){var b=[],m=(1<<8)-1,i;for(i=0;i<s.length*8;i+=8)b[i>>5]|=(s.charCodeAt(i/8)&m)<<(i%32);return b;}
    var x=c2b(unescape(encodeURIComponent(str))), len=str.length*8;
    x[len>>5]|=0x80<<((len)%32); x[(((len+64)>>>9)<<4)+14]=len;
    var a=1732584193,b=-271733879,c=-1732584194,d=271733878,i,o;
    for(i=0;i<x.length;i+=16){o=[a,b,c,d];
      a=ff(a,b,c,d,x[i],7,-680876936); d=ff(d,a,b,c,x[i+1],12,-389564586);
      c=ff(c,d,a,b,x[i+2],17,606105819); b=ff(b,c,d,a,x[i+3],22,-1044525330);
      a=ff(a,b,c,d,x[i+4],7,-176418897); d=ff(d,a,b,c,x[i+5],12,1200080426);
      c=ff(c,d,a,b,x[i+6],17,-1473231341); b=ff(b,c,d,a,x[i+7],22,-45705983);
      a=ff(a,b,c,d,x[i+8],7,1770035416); d=ff(d,a,b,c,x[i+9],12,-1958414417);
      c=ff(c,d,a,b,x[i+10],17,-42063); b=ff(b,c,d,a,x[i+11],22,-1990404162);
      a=ff(a,b,c,d,x[i+12],7,1804603682); d=ff(d,a,b,c,x[i+13],12,-40341101);
      c=ff(c,d,a,b,x[i+14],17,-1502002290); b=ff(b,c,d,a,x[i+15],22,1236535329);
      a=gg(a,b,c,d,x[i+1],5,-165796510); d=gg(d,a,b,c,x[i+6],9,-1069501632);
      c=gg(c,d,a,b,x[i+11],14,643717713); b=gg(b,c,d,a,x[i],20,-373897302);
      a=gg(a,b,c,d,x[i+5],5,-701558691); d=gg(d,a,b,c,x[i+10],9,38016083);
      c=gg(c,d,a,b,x[i+15],14,-660478335); b=gg(b,c,d,a,x[i+4],20,-405537848);
      a=gg(a,b,c,d,x[i+9],5,568446438); d=gg(d,a,b,c,x[i+14],9,-1019803690);
      c=gg(c,d,a,b,x[i+3],14,-187363961); b=gg(b,c,d,a,x[i+8],20,1163531501);
      a=gg(a,b,c,d,x[i+13],5,-1444681467); d=gg(d,a,b,c,x[i+2],9,-51403784);
      c=gg(c,d,a,b,x[i+7],14,1735328473); b=gg(b,c,d,a,x[i+12],20,-1926607734);
      a=hh(a,b,c,d,x[i+5],4,-378558); d=hh(d,a,b,c,x[i+8],11,-2022574463);
      c=hh(c,d,a,b,x[i+11],16,1839030562); b=hh(b,c,d,a,x[i+14],23,-35309556);
      a=hh(a,b,c,d,x[i+1],4,-1530992060); d=hh(d,a,b,c,x[i+4],11,1272893353);
      c=hh(c,d,a,b,x[i+7],16,-155497632); b=hh(b,c,d,a,x[i+10],23,-1094730640);
      a=hh(a,b,c,d,x[i+13],4,681279174); d=hh(d,a,b,c,x[i],11,-358537222);
      c=hh(c,d,a,b,x[i+3],16,-722521979); b=hh(b,c,d,a,x[i+6],23,76029189);
      a=hh(a,b,c,d,x[i+9],4,-640364487); d=hh(d,a,b,c,x[i+12],11,-421815835);
      c=hh(c,d,a,b,x[i+15],16,530742520); b=hh(b,c,d,a,x[i+2],23,-995338651);
      a=ii(a,b,c,d,x[i],6,-198630844); d=ii(d,a,b,c,x[i+7],10,1126891415);
      c=ii(c,d,a,b,x[i+14],15,-1416354905); b=ii(b,c,d,a,x[i+5],21,-57434055);
      a=ii(a,b,c,d,x[i+12],6,1700485571); d=ii(d,a,b,c,x[i+3],10,-1894986606);
      c=ii(c,d,a,b,x[i+10],15,-1051523); b=ii(b,c,d,a,x[i+1],21,-2054922799);
      a=ii(a,b,c,d,x[i+8],6,1873313359); d=ii(d,a,b,c,x[i+15],10,-30611744);
      c=ii(c,d,a,b,x[i+6],15,-1560198380); b=ii(b,c,d,a,x[i+13],21,1309151649);
      a=ii(a,b,c,d,x[i+4],6,-145523070); d=ii(d,a,b,c,x[i+11],10,-1120210379);
      c=ii(c,d,a,b,x[i+2],15,718787259); b=ii(b,c,d,a,x[i+9],21,-343485551);
      a=ad(a,o[0]); b=ad(b,o[1]); c=ad(c,o[2]); d=ad(d,o[3]);
    }
    return rh(a)+rh(b)+rh(c)+rh(d);
  }

  function subscriberHash(email) {
    return md5Hex(String(email || '').trim().toLowerCase());
  }

  function loadStorage() {
    try {
      const cfg = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (cfg) Object.assign(_config, cfg);
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (Array.isArray(q)) _queue = q;
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c) _cache = c;
    } catch (e) { warn('loadStorage', e); }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
      localStorage.setItem(QUEUE_KEY,   JSON.stringify(_queue));
      localStorage.setItem(CACHE_KEY,   JSON.stringify(_cache));
    } catch (e) { warn('saveStorage', e); }
  }

  function baseUrl() {
    const dc = (_config.serverDc || DEFAULT_DC).trim();
    return `https://${dc}.api.mailchimp.com/${API_VERSION}`;
  }

  function authHeader() {
    return 'Basic ' + btoa('volvix:' + (_config.apiKey || ''));
  }

  async function request(method, path, body) {
    if (!_config.enabled) throw new Error('Mailchimp disabled');
    if (!_config.apiKey)  throw new Error('Missing Mailchimp API key');
    const url = baseUrl() + path;
    const init = {
      method,
      headers: {
        'Authorization': authHeader(),
        'Content-Type':  'application/json'
      }
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await fetch(url, init);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(_) { data = { raw: text }; }
    if (!r.ok) {
      const e = new Error(`Mailchimp ${r.status}: ${(data && data.title) || r.statusText}`);
      e.status = r.status; e.detail = data;
      throw e;
    }
    return data;
  }

  async function withRetry(fn, label) {
    let attempt = 0, lastErr;
    while (attempt < MAX_RETRIES) {
      try { return await fn(); }
      catch (e) {
        lastErr = e;
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
        const wait = BACKOFF_MS * Math.pow(2, attempt);
        warn(label || 'retry', 'attempt', attempt + 1, 'in', wait, 'ms', e.message);
        await new Promise(res => setTimeout(res, wait));
        attempt++;
      }
    }
    throw lastErr;
  }

  function enqueue(op) {
    _queue.push(Object.assign({ ts: Date.now(), tries: 0 }, op));
    saveStorage();
  }

  async function flushQueue() {
    if (!_online || !_config.enabled) return;
    const pending = _queue.slice();
    _queue = [];
    saveStorage();
    for (const op of pending) {
      try {
        await request(op.method, op.path, op.body);
        log('queue ok', op.method, op.path);
      } catch (e) {
        op.tries = (op.tries || 0) + 1;
        if (op.tries < MAX_RETRIES) {
          _queue.push(op);
        } else {
          err('queue dropped after retries', op, e.message);
        }
      }
    }
    saveStorage();
  }

  // ---------- public API ----------
  const MailchimpAPI = {
    version: '1.0.0',

    configure(opts) {
      Object.assign(_config, opts || {});
      if (_config.apiKey && !opts.serverDc) {
        const dash = _config.apiKey.split('-');
        if (dash[1]) _config.serverDc = dash[1];
      }
      _config.enabled = !!_config.apiKey;
      saveStorage();
      log('configured', { dc: _config.serverDc, enabled: _config.enabled });
      return this.getConfig();
    },

    getConfig() {
      return {
        serverDc: _config.serverDc,
        defaultListId: _config.defaultListId,
        fromName: _config.fromName,
        replyTo: _config.replyTo,
        enabled: _config.enabled,
        hasKey: !!_config.apiKey
      };
    },

    async ping() {
      return withRetry(() => request('GET', '/ping'), 'ping');
    },

    // ----- Lists / Audiences -----
    async getLists(count = 50) {
      const r = await withRetry(() => request('GET', `/lists?count=${count}`), 'getLists');
      _cache.lists = r.lists || [];
      saveStorage();
      return _cache.lists;
    },

    async createList(payload) {
      return withRetry(() => request('POST', '/lists', payload), 'createList');
    },

    async getList(listId) {
      return withRetry(() => request('GET', `/lists/${listId}`), 'getList');
    },

    // ----- Members / Subscribers -----
    async upsertMember(listId, member) {
      const id = listId || _config.defaultListId;
      if (!id) throw new Error('listId required');
      if (!member || !member.email_address) throw new Error('email_address required');
      const hash = subscriberHash(member.email_address);
      const body = Object.assign({ status_if_new: 'subscribed' }, member);
      const op = { method: 'PUT', path: `/lists/${id}/members/${hash}`, body };
      if (!_online) { enqueue(op); return { queued: true, hash }; }
      try { return await withRetry(() => request(op.method, op.path, op.body), 'upsertMember'); }
      catch (e) { if (e.status >= 500 || e.message === 'Failed to fetch') { enqueue(op); return { queued: true, hash }; } throw e; }
    },

    async unsubscribe(listId, email) {
      const id = listId || _config.defaultListId;
      const hash = subscriberHash(email);
      return withRetry(() => request('PATCH', `/lists/${id}/members/${hash}`, { status: 'unsubscribed' }), 'unsubscribe');
    },

    async deleteMember(listId, email) {
      const id = listId || _config.defaultListId;
      const hash = subscriberHash(email);
      return withRetry(() => request('POST', `/lists/${id}/members/${hash}/actions/delete-permanent`), 'deleteMember');
    },

    async tagMember(listId, email, tags) {
      const id = listId || _config.defaultListId;
      const hash = subscriberHash(email);
      const body = { tags: (tags || []).map(t => typeof t === 'string' ? { name: t, status: 'active' } : t) };
      return withRetry(() => request('POST', `/lists/${id}/members/${hash}/tags`, body), 'tagMember');
    },

    // ----- POS Customer sync -----
    mapCustomer(customer) {
      return {
        email_address: customer.email,
        status_if_new: 'subscribed',
        merge_fields: {
          FNAME:   customer.firstName || customer.nombre   || '',
          LNAME:   customer.lastName  || customer.apellido || '',
          PHONE:   customer.phone     || customer.telefono || '',
          ADDRESS: customer.address   || '',
          MMERGE6: String(customer.id || customer.customerId || '')
        }
      };
    },

    async syncCustomers(customers, listId, opts) {
      opts = opts || {};
      const id = listId || _config.defaultListId;
      if (!id) throw new Error('listId required');
      const valid = (customers || []).filter(c => c && c.email);
      if (!valid.length) return { total: 0, ok: 0, failed: 0, errors: [] };
      const operations = valid.map(c => {
        const m = this.mapCustomer(c);
        return {
          method: 'PUT',
          path: `/lists/${id}/members/${subscriberHash(m.email_address)}`,
          operation_id: 'cust_' + (c.id || subscriberHash(m.email_address)),
          body: JSON.stringify(m)
        };
      });
      // Use batch endpoint when many
      if (operations.length > 20) {
        return withRetry(() => request('POST', '/batches', { operations }), 'syncCustomers.batch');
      }
      const results = { total: valid.length, ok: 0, failed: 0, errors: [] };
      for (const c of valid) {
        try { await this.upsertMember(id, this.mapCustomer(c)); results.ok++; }
        catch (e) { results.failed++; results.errors.push({ email: c.email, error: e.message }); }
      }
      return results;
    },

    // ----- Campaigns -----
    async getCampaigns(count = 25) {
      const r = await withRetry(() => request('GET', `/campaigns?count=${count}`), 'getCampaigns');
      _cache.campaigns = r.campaigns || [];
      saveStorage();
      return _cache.campaigns;
    },

    async createCampaign({ listId, subject, title, fromName, replyTo, type }) {
      const body = {
        type: type || 'regular',
        recipients: { list_id: listId || _config.defaultListId },
        settings: {
          subject_line: subject,
          title:        title || subject,
          from_name:    fromName || _config.fromName,
          reply_to:     replyTo  || _config.replyTo
        }
      };
      return withRetry(() => request('POST', '/campaigns', body), 'createCampaign');
    },

    async setCampaignContent(campaignId, html, plain) {
      const body = { html: html || '' };
      if (plain) body.plain_text = plain;
      return withRetry(() => request('PUT', `/campaigns/${campaignId}/content`, body), 'setCampaignContent');
    },

    async sendCampaign(campaignId) {
      return withRetry(() => request('POST', `/campaigns/${campaignId}/actions/send`), 'sendCampaign');
    },

    async scheduleCampaign(campaignId, scheduleTimeISO) {
      return withRetry(() => request('POST', `/campaigns/${campaignId}/actions/schedule`, {
        schedule_time: scheduleTimeISO
      }), 'scheduleCampaign');
    },

    async sendTest(campaignId, emails) {
      return withRetry(() => request('POST', `/campaigns/${campaignId}/actions/test`, {
        test_emails: emails, send_type: 'html'
      }), 'sendTest');
    },

    async deleteCampaign(campaignId) {
      return withRetry(() => request('DELETE', `/campaigns/${campaignId}`), 'deleteCampaign');
    },

    // ----- Automations -----
    async getAutomations() {
      const r = await withRetry(() => request('GET', '/automations'), 'getAutomations');
      _cache.automations = r.automations || [];
      saveStorage();
      return _cache.automations;
    },

    async startAutomation(workflowId) {
      return withRetry(() => request('POST', `/automations/${workflowId}/actions/start-all-emails`), 'startAutomation');
    },

    async pauseAutomation(workflowId) {
      return withRetry(() => request('POST', `/automations/${workflowId}/actions/pause-all-emails`), 'pauseAutomation');
    },

    async addToAutomation(workflowId, emailId, email) {
      return withRetry(() => request('POST',
        `/automations/${workflowId}/emails/${emailId}/queue`,
        { email_address: email }
      ), 'addToAutomation');
    },

    // ----- Segments -----
    async createSegment(listId, name, options) {
      const id = listId || _config.defaultListId;
      return withRetry(() => request('POST', `/lists/${id}/segments`, {
        name, options: options || { match: 'any', conditions: [] }
      }), 'createSegment');
    },

    // ----- Webhooks -----
    async registerWebhook(listId, url, events) {
      const id = listId || _config.defaultListId;
      return withRetry(() => request('POST', `/lists/${id}/webhooks`, {
        url,
        events: events || { subscribe: true, unsubscribe: true, profile: true, campaign: true },
        sources: { user: true, admin: true, api: true }
      }), 'registerWebhook');
    },

    // ----- E-commerce events (purchase tracking) -----
    async trackOrder(storeId, order) {
      return withRetry(() => request('POST', `/ecommerce/stores/${storeId}/orders`, order), 'trackOrder');
    },

    // ----- Diagnostics -----
    queueSize() { return _queue.length; },
    flushQueue,
    _internal: { subscriberHash, request }
  };

  // ---------- bootstrap ----------
  loadStorage();
  if (typeof window !== 'undefined') {
    window.addEventListener('online',  () => { _online = true;  log('online');  flushQueue(); });
    window.addEventListener('offline', () => { _online = false; log('offline'); });
  }

  global.MailchimpAPI = MailchimpAPI;
  log('ready', MailchimpAPI.version);

})(typeof window !== 'undefined' ? window : globalThis);
