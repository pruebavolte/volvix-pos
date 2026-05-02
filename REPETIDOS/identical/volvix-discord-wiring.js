/**
 * volvix-discord-wiring.js
 * Discord webhooks integration for Volvix POS.
 * Provides window.DiscordAPI for sending embeds, alerts, and reports.
 *
 * Usage:
 *   DiscordAPI.configure({ webhookUrl: 'https://discord.com/api/webhooks/...' });
 *   DiscordAPI.sendMessage('Hello world');
 *   DiscordAPI.sendEmbed({ title: 'Sale', description: '$100', color: 0x00ff00 });
 *   DiscordAPI.sendAlert('error', 'DB connection lost');
 *   DiscordAPI.sendReport('daily', { sales: 1234, orders: 56 });
 */
(function (global) {
    'use strict';

    const DEFAULT_USERNAME = 'Volvix POS';
    const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';
    const RATE_LIMIT_MS = 500;
    const MAX_RETRIES = 3;
    const MAX_QUEUE = 100;

    const COLORS = {
        info: 0x3498db,
        success: 0x2ecc71,
        warning: 0xf1c40f,
        error: 0xe74c3c,
        critical: 0x992d22,
        debug: 0x95a5a6,
        sale: 0x27ae60,
        refund: 0xe67e22
    };

    const ALERT_EMOJI = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        critical: '🚨',
        debug: '🐛'
    };

    const config = {
        webhookUrl: null,
        alertWebhookUrl: null,
        reportWebhookUrl: null,
        username: DEFAULT_USERNAME,
        avatarUrl: DEFAULT_AVATAR,
        enabled: true,
        environment: 'production'
    };

    const state = {
        queue: [],
        sending: false,
        lastSendAt: 0,
        sentCount: 0,
        failedCount: 0
    };

    function log(level, ...args) {
        if (typeof console !== 'undefined' && console[level]) {
            console[level]('[DiscordAPI]', ...args);
        }
    }

    function configure(opts) {
        if (!opts || typeof opts !== 'object') {
            throw new Error('configure() requires an options object');
        }
        Object.keys(opts).forEach(function (k) {
            if (k in config) config[k] = opts[k];
        });
        log('log', 'configured', { hasWebhook: !!config.webhookUrl, env: config.environment });
        return config;
    }

    function isConfigured(kind) {
        if (kind === 'alert') return !!(config.alertWebhookUrl || config.webhookUrl);
        if (kind === 'report') return !!(config.reportWebhookUrl || config.webhookUrl);
        return !!config.webhookUrl;
    }

    function resolveWebhook(kind) {
        if (kind === 'alert') return config.alertWebhookUrl || config.webhookUrl;
        if (kind === 'report') return config.reportWebhookUrl || config.webhookUrl;
        return config.webhookUrl;
    }

    function truncate(str, max) {
        if (!str) return '';
        str = String(str);
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    function buildPayload(content, embeds, extra) {
        const payload = {
            username: config.username,
            avatar_url: config.avatarUrl
        };
        if (content) payload.content = truncate(content, 2000);
        if (embeds && embeds.length) payload.embeds = embeds.slice(0, 10);
        if (extra && typeof extra === 'object') Object.assign(payload, extra);
        return payload;
    }

    function buildEmbed(spec) {
        const e = {};
        if (spec.title) e.title = truncate(spec.title, 256);
        if (spec.description) e.description = truncate(spec.description, 4096);
        if (spec.url) e.url = spec.url;
        if (typeof spec.color === 'number') e.color = spec.color;
        else if (typeof spec.color === 'string' && COLORS[spec.color]) e.color = COLORS[spec.color];
        if (spec.timestamp) {
            e.timestamp = spec.timestamp === true
                ? new Date().toISOString()
                : new Date(spec.timestamp).toISOString();
        }
        if (spec.footer) {
            e.footer = typeof spec.footer === 'string'
                ? { text: truncate(spec.footer, 2048) }
                : { text: truncate(spec.footer.text || '', 2048), icon_url: spec.footer.icon_url };
        }
        if (spec.author) {
            e.author = typeof spec.author === 'string'
                ? { name: truncate(spec.author, 256) }
                : {
                      name: truncate(spec.author.name || '', 256),
                      url: spec.author.url,
                      icon_url: spec.author.icon_url
                  };
        }
        if (spec.thumbnail) e.thumbnail = { url: spec.thumbnail };
        if (spec.image) e.image = { url: spec.image };
        if (Array.isArray(spec.fields)) {
            e.fields = spec.fields.slice(0, 25).map(function (f) {
                return {
                    name: truncate(f.name || '​', 256),
                    value: truncate(f.value || '​', 1024),
                    inline: !!f.inline
                };
            });
        }
        return e;
    }

    function enqueue(job) {
        if (state.queue.length >= MAX_QUEUE) {
            log('warn', 'queue full, dropping oldest');
            state.queue.shift();
        }
        state.queue.push(job);
        processQueue();
    }

    function processQueue() {
        if (state.sending || !state.queue.length) return;
        const wait = Math.max(0, RATE_LIMIT_MS - (Date.now() - state.lastSendAt));
        state.sending = true;
        setTimeout(function () {
            const job = state.queue.shift();
            sendNow(job.url, job.payload, 0)
                .then(function (res) {
                    state.sentCount++;
                    if (job.resolve) job.resolve(res);
                })
                .catch(function (err) {
                    state.failedCount++;
                    if (job.reject) job.reject(err);
                })
                .then(function () {
                    state.lastSendAt = Date.now();
                    state.sending = false;
                    processQueue();
                });
        }, wait);
    }

    function sendNow(url, payload, attempt) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (resp) {
            if (resp.status === 429 && attempt < MAX_RETRIES) {
                return resp.json().then(function (j) {
                    const retry = (j && j.retry_after ? j.retry_after : 1) * 1000;
                    return new Promise(function (r) { setTimeout(r, retry); })
                        .then(function () { return sendNow(url, payload, attempt + 1); });
                });
            }
            if (!resp.ok && attempt < MAX_RETRIES && resp.status >= 500) {
                return new Promise(function (r) { setTimeout(r, 1000 * (attempt + 1)); })
                    .then(function () { return sendNow(url, payload, attempt + 1); });
            }
            if (!resp.ok) {
                return resp.text().then(function (t) {
                    throw new Error('Discord HTTP ' + resp.status + ': ' + t);
                });
            }
            return { ok: true, status: resp.status };
        });
    }

    function dispatch(kind, payload) {
        if (!config.enabled) {
            return Promise.resolve({ ok: false, skipped: 'disabled' });
        }
        const url = resolveWebhook(kind);
        if (!url) {
            log('warn', 'no webhook for', kind);
            return Promise.resolve({ ok: false, skipped: 'no-webhook' });
        }
        return new Promise(function (resolve, reject) {
            enqueue({ url: url, payload: payload, resolve: resolve, reject: reject });
        });
    }

    function sendMessage(text, opts) {
        opts = opts || {};
        return dispatch(opts.kind || 'default', buildPayload(text, null, opts.extra));
    }

    function sendEmbed(spec, opts) {
        opts = opts || {};
        const embed = buildEmbed(spec || {});
        return dispatch(opts.kind || 'default', buildPayload(opts.content || null, [embed], opts.extra));
    }

    function sendEmbeds(specs, opts) {
        opts = opts || {};
        const embeds = (specs || []).map(buildEmbed);
        return dispatch(opts.kind || 'default', buildPayload(opts.content || null, embeds, opts.extra));
    }

    function sendAlert(level, message, details) {
        level = (level || 'info').toLowerCase();
        const emoji = ALERT_EMOJI[level] || ALERT_EMOJI.info;
        const color = COLORS[level] || COLORS.info;
        const fields = [];
        fields.push({ name: 'Environment', value: config.environment, inline: true });
        fields.push({ name: 'Level', value: level.toUpperCase(), inline: true });
        if (details && typeof details === 'object') {
            Object.keys(details).slice(0, 20).forEach(function (k) {
                fields.push({
                    name: k,
                    value: '```' + truncate(String(details[k]), 1000) + '```',
                    inline: false
                });
            });
        }
        return sendEmbed({
            title: emoji + ' ' + level.toUpperCase() + ' Alert',
            description: message,
            color: color,
            timestamp: true,
            fields: fields,
            footer: 'Volvix POS · ' + config.environment
        }, { kind: 'alert' });
    }

    function sendReport(name, data, opts) {
        opts = opts || {};
        const fields = [];
        if (data && typeof data === 'object') {
            Object.keys(data).slice(0, 25).forEach(function (k) {
                const v = data[k];
                fields.push({
                    name: k,
                    value: typeof v === 'object' ? '```json\n' + truncate(JSON.stringify(v, null, 2), 1000) + '```' : String(v),
                    inline: typeof v !== 'object'
                });
            });
        }
        return sendEmbed({
            title: '📊 Report: ' + (name || 'untitled'),
            description: opts.description || 'Generated at ' + new Date().toLocaleString(),
            color: opts.color || COLORS.info,
            timestamp: true,
            fields: fields,
            footer: 'Volvix POS Report'
        }, { kind: 'report' });
    }

    function sendSale(sale) {
        sale = sale || {};
        return sendEmbed({
            title: '💰 New Sale #' + (sale.id || '?'),
            color: COLORS.sale,
            timestamp: true,
            fields: [
                { name: 'Total', value: '$' + (sale.total || 0), inline: true },
                { name: 'Items', value: String(sale.items || 0), inline: true },
                { name: 'Payment', value: sale.payment || 'unknown', inline: true },
                { name: 'Cashier', value: sale.cashier || 'n/a', inline: true },
                { name: 'Customer', value: sale.customer || 'walk-in', inline: true }
            ],
            footer: 'Volvix POS · Sales'
        }, { kind: 'report' });
    }

    function sendError(err, context) {
        const msg = err && err.message ? err.message : String(err);
        const stack = err && err.stack ? err.stack : '';
        return sendAlert('error', msg, {
            stack: stack.split('\n').slice(0, 5).join('\n'),
            context: context ? JSON.stringify(context) : 'n/a',
            url: typeof location !== 'undefined' ? location.href : 'n/a',
            ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'
        });
    }

    function getStats() {
        return {
            sent: state.sentCount,
            failed: state.failedCount,
            queued: state.queue.length,
            sending: state.sending,
            configured: isConfigured()
        };
    }

    function flush() {
        return new Promise(function (resolve) {
            const check = function () {
                if (!state.queue.length && !state.sending) resolve(getStats());
                else setTimeout(check, 100);
            };
            check();
        });
    }

    function test() {
        return sendEmbed({
            title: '🧪 Discord Webhook Test',
            description: 'If you see this, wiring works.',
            color: COLORS.success,
            timestamp: true,
            footer: 'Volvix POS · Test'
        });
    }

    global.DiscordAPI = {
        configure: configure,
        isConfigured: isConfigured,
        sendMessage: sendMessage,
        sendEmbed: sendEmbed,
        sendEmbeds: sendEmbeds,
        sendAlert: sendAlert,
        sendReport: sendReport,
        sendSale: sendSale,
        sendError: sendError,
        getStats: getStats,
        flush: flush,
        test: test,
        COLORS: COLORS,
        _state: state,
        _config: config
    };

    log('log', 'volvix-discord-wiring loaded');
})(typeof window !== 'undefined' ? window : globalThis);
