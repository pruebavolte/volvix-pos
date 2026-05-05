/**
 * volvix-sendgrid-wiring.js
 * SendGrid integration: transactional emails, templates, attachments, open/click tracking.
 * Exposes: window.SendGridAPI
 */
(function (global) {
  'use strict';

  const SG_BASE = 'https://api.sendgrid.com/v3';
  const STORE_KEY = 'volvix_sendgrid_cfg';
  const LOG_KEY = 'volvix_sendgrid_log';
  const MAX_LOG = 500;

  // ── Config ────────────────────────────────────────────────────────────────
  const defaultCfg = {
    apiKey: '',
    fromEmail: 'no-reply@volvix.com',
    fromName: 'Volvix POS',
    replyTo: '',
    sandbox: false,
    trackOpens: true,
    trackClicks: true,
    subscriptionTracking: false,
    ipPoolName: null,
    categories: ['volvix'],
  };

  function loadCfg() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return Object.assign({}, defaultCfg, raw ? JSON.parse(raw) : {});
    } catch (_) {
      return Object.assign({}, defaultCfg);
    }
  }

  function saveCfg(patch) {
    const cfg = Object.assign(loadCfg(), patch || {});
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    return cfg;
  }

  // ── Logging ───────────────────────────────────────────────────────────────
  function log(entry) {
    try {
      const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      arr.push(Object.assign({ ts: Date.now() }, entry));
      while (arr.length > MAX_LOG) arr.shift();
      localStorage.setItem(LOG_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function getLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); }
    catch (_) { return []; }
  }

  function clearLog() { localStorage.removeItem(LOG_KEY); }

  // ── Validation helpers ────────────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function isEmail(s) { return typeof s === 'string' && EMAIL_RE.test(s); }

  function normalizeRecipients(to) {
    if (!to) return [];
    const arr = Array.isArray(to) ? to : [to];
    return arr.map(r => typeof r === 'string' ? { email: r } : r)
      .filter(r => r && isEmail(r.email));
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  async function fileToAttachment(file, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result || '';
        const b64 = String(result).split(',')[1] || '';
        resolve({
          content: b64,
          filename: opts.filename || file.name,
          type: opts.type || file.type || 'application/octet-stream',
          disposition: opts.disposition || 'attachment',
          content_id: opts.contentId || undefined,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function textToAttachment(text, filename, mime) {
    const b64 = btoa(unescape(encodeURIComponent(text)));
    return {
      content: b64,
      filename: filename || 'note.txt',
      type: mime || 'text/plain',
      disposition: 'attachment',
    };
  }

  // ── Core request ──────────────────────────────────────────────────────────
  async function sgFetch(path, method, body) {
    const cfg = loadCfg();
    if (!cfg.apiKey) throw new Error('SendGrid API key not configured');
    const res = await fetch(SG_BASE + path, {
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      const err = new Error('SendGrid ' + res.status + ': ' + (text || res.statusText));
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return { status: res.status, headers: res.headers, data };
  }

  // ── Send transactional email ──────────────────────────────────────────────
  async function send(opts) {
    opts = opts || {};
    const cfg = loadCfg();
    const to = normalizeRecipients(opts.to);
    if (!to.length) throw new Error('At least one valid recipient required');

    const personalization = {
      to,
      cc: normalizeRecipients(opts.cc),
      bcc: normalizeRecipients(opts.bcc),
    };
    if (!personalization.cc.length) delete personalization.cc;
    if (!personalization.bcc.length) delete personalization.bcc;

    if (opts.dynamicData && typeof opts.dynamicData === 'object') {
      personalization.dynamic_template_data = opts.dynamicData;
    }
    if (opts.subject && !opts.templateId) personalization.subject = opts.subject;

    const payload = {
      personalizations: [personalization],
      from: {
        email: opts.fromEmail || cfg.fromEmail,
        name: opts.fromName || cfg.fromName,
      },
      reply_to: opts.replyTo || cfg.replyTo
        ? { email: opts.replyTo || cfg.replyTo }
        : undefined,
      categories: opts.categories || cfg.categories,
      tracking_settings: {
        open_tracking: { enable: !!cfg.trackOpens },
        click_tracking: { enable: !!cfg.trackClicks, enable_text: !!cfg.trackClicks },
        subscription_tracking: { enable: !!cfg.subscriptionTracking },
      },
      mail_settings: {
        sandbox_mode: { enable: !!cfg.sandbox },
      },
    };

    if (opts.templateId) {
      payload.template_id = opts.templateId;
    } else {
      payload.subject = opts.subject || '(no subject)';
      const content = [];
      if (opts.text) content.push({ type: 'text/plain', value: opts.text });
      if (opts.html) content.push({ type: 'text/html', value: opts.html });
      if (!content.length) content.push({ type: 'text/plain', value: '' });
      payload.content = content;
    }

    if (Array.isArray(opts.attachments) && opts.attachments.length) {
      payload.attachments = opts.attachments;
    }
    if (cfg.ipPoolName) payload.ip_pool_name = cfg.ipPoolName;
    if (opts.sendAt) payload.send_at = Math.floor(opts.sendAt / 1000);
    if (opts.customArgs) payload.custom_args = opts.customArgs;

    if (!payload.reply_to) delete payload.reply_to;

    try {
      const res = await sgFetch('/mail/send', 'POST', payload);
      const messageId = res.headers.get('X-Message-Id') || null;
      log({ kind: 'send', ok: true, to: to.map(t => t.email), subject: payload.subject || opts.templateId, messageId });
      return { ok: true, status: res.status, messageId };
    } catch (e) {
      log({ kind: 'send', ok: false, to: to.map(t => t.email), error: e.message });
      throw e;
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  async function listTemplates(generations) {
    const q = generations || 'dynamic';
    const res = await sgFetch('/templates?generations=' + encodeURIComponent(q) + '&page_size=200');
    return res.data && res.data.result ? res.data.result : [];
  }

  async function getTemplate(id) {
    const res = await sgFetch('/templates/' + encodeURIComponent(id));
    return res.data;
  }

  async function sendTemplate(templateId, to, dynamicData, extra) {
    return send(Object.assign({ templateId, to, dynamicData }, extra || {}));
  }

  // ── Tracking / stats ──────────────────────────────────────────────────────
  async function getStats(startDate, endDate, aggregatedBy) {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (aggregatedBy) params.set('aggregated_by', aggregatedBy);
    const res = await sgFetch('/stats?' + params.toString());
    return res.data;
  }

  async function getCategoryStats(category, startDate, endDate) {
    const params = new URLSearchParams();
    params.set('categories', category);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const res = await sgFetch('/categories/stats?' + params.toString());
    return res.data;
  }

  // ── Suppressions ──────────────────────────────────────────────────────────
  async function getBounces() {
    const res = await sgFetch('/suppression/bounces');
    return res.data || [];
  }

  async function deleteBounce(email) {
    return sgFetch('/suppression/bounces/' + encodeURIComponent(email), 'DELETE');
  }

  // ── Validate config (ping) ────────────────────────────────────────────────
  async function validate() {
    try {
      const res = await sgFetch('/scopes');
      return { ok: true, scopes: res.data && res.data.scopes };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Quick helpers ─────────────────────────────────────────────────────────
  async function sendReceipt(toEmail, ticket) {
    const html = '<h2>Recibo Volvix POS</h2>' +
      '<p>Ticket: <b>' + (ticket && ticket.id || '') + '</b></p>' +
      '<p>Total: <b>$' + (ticket && ticket.total || 0) + '</b></p>' +
      '<p>Gracias por su compra.</p>';
    return send({
      to: toEmail,
      subject: 'Recibo Volvix #' + (ticket && ticket.id || ''),
      html,
      categories: ['volvix', 'receipt'],
    });
  }

  async function sendAlert(toEmail, subject, message) {
    return send({
      to: toEmail,
      subject: '[ALERTA] ' + subject,
      text: message,
      html: '<pre style="font-family:ui-monospace,monospace">' +
        String(message).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) +
        '</pre>',
      categories: ['volvix', 'alert'],
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.SendGridAPI = {
    // config
    getConfig: loadCfg,
    setConfig: saveCfg,
    validate,
    // sending
    send,
    sendTemplate,
    sendReceipt,
    sendAlert,
    // attachments
    fileToAttachment,
    textToAttachment,
    // templates
    listTemplates,
    getTemplate,
    // stats / tracking
    getStats,
    getCategoryStats,
    // suppressions
    getBounces,
    deleteBounce,
    // log
    getLog,
    clearLog,
    // version
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
