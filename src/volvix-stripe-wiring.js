/**
 * volvix-stripe-wiring.js
 * Stripe integration mock for Volvix POS.
 * Exposes window.StripeAPI with charges, subscriptions, webhooks, refunds.
 *
 * NOTE: This is a MOCK module. No real network calls are made. All "Stripe"
 * responses are synthesized locally for development, demos and offline tests.
 */
(function (global) {
    'use strict';

    // ---------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------
    const CONFIG = {
        publishableKey: 'pk_test_volvix_mock_0000000000000000',
        secretKey: 'sk_test_volvix_mock_0000000000000000',
        apiVersion: '2024-06-20',
        currency: 'mxn',
        latencyMs: 180,
        failureRate: 0.0,
        webhookSecret: 'whsec_volvix_mock_secret',
        accountId: 'acct_volvix_mock'
    };

    // ---------------------------------------------------------------------
    // In-memory stores (act as Stripe-side state)
    // ---------------------------------------------------------------------
    const store = {
        customers: new Map(),
        cards: new Map(),
        charges: new Map(),
        refunds: new Map(),
        subscriptions: new Map(),
        invoices: new Map(),
        plans: new Map(),
        events: [],
        webhookEndpoints: new Map(),
        idempotencyKeys: new Map()
    };

    // Seed some plans
    [
        { id: 'plan_basic',   nickname: 'Basic',   amount: 19900,  interval: 'month' },
        { id: 'plan_pro',     nickname: 'Pro',     amount: 49900,  interval: 'month' },
        { id: 'plan_premium', nickname: 'Premium', amount: 99900,  interval: 'month' },
        { id: 'plan_yearly',  nickname: 'Yearly',  amount: 499900, interval: 'year'  }
    ].forEach(p => store.plans.set(p.id, Object.assign({
        object: 'plan',
        currency: CONFIG.currency,
        active: true,
        created: nowSec()
    }, p)));

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    function nowSec() { return Math.floor(Date.now() / 1000); }

    function rid(prefix) {
        const s = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let out = '';
        for (let i = 0; i < 24; i++) out += s[Math.floor(Math.random() * s.length)];
        return `${prefix}_${out}`;
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms == null ? CONFIG.latencyMs : ms));
    }

    function maybeFail(op) {
        if (Math.random() < CONFIG.failureRate) {
            throw stripeError('api_error', `Mock failure during ${op}`);
        }
    }

    function stripeError(type, message, code) {
        const e = new Error(message);
        e.type = type;
        e.code = code || type;
        e.raw = { type, message, code: e.code };
        return e;
    }

    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

    function emitEvent(type, data) {
        const evt = {
            id: rid('evt'),
            object: 'event',
            api_version: CONFIG.apiVersion,
            created: nowSec(),
            type,
            livemode: false,
            data: { object: clone(data) },
            pending_webhooks: store.webhookEndpoints.size,
            request: { id: rid('req'), idempotency_key: null }
        };
        store.events.push(evt);
        // Fire async to subscribed endpoints
        store.webhookEndpoints.forEach(ep => {
            if (ep.enabled_events.includes('*') || ep.enabled_events.includes(type)) {
                setTimeout(() => {
                    try { ep.handler(evt); } catch (e) { /* swallow */ }
                }, 10);
            }
        });
        return evt;
    }

    function withIdempotency(key, fn) {
        if (key && store.idempotencyKeys.has(key)) {
            return Promise.resolve(store.idempotencyKeys.get(key));
        }
        return Promise.resolve(fn()).then(res => {
            if (key) store.idempotencyKeys.set(key, res);
            return res;
        });
    }

    // ---------------------------------------------------------------------
    // Customers
    // ---------------------------------------------------------------------
    async function createCustomer(params) {
        await delay();
        maybeFail('createCustomer');
        const c = {
            id: rid('cus'),
            object: 'customer',
            created: nowSec(),
            email: params.email || null,
            name: params.name || null,
            description: params.description || null,
            metadata: params.metadata || {},
            default_source: null,
            sources: { object: 'list', data: [] },
            currency: CONFIG.currency,
            livemode: false
        };
        store.customers.set(c.id, c);
        emitEvent('customer.created', c);
        return clone(c);
    }

    async function retrieveCustomer(id) {
        await delay();
        const c = store.customers.get(id);
        if (!c) throw stripeError('invalid_request_error', `No such customer: ${id}`, 'resource_missing');
        return clone(c);
    }

    async function updateCustomer(id, params) {
        await delay();
        const c = store.customers.get(id);
        if (!c) throw stripeError('invalid_request_error', `No such customer: ${id}`, 'resource_missing');
        Object.assign(c, params);
        emitEvent('customer.updated', c);
        return clone(c);
    }

    async function attachCard(customerId, card) {
        await delay();
        const c = store.customers.get(customerId);
        if (!c) throw stripeError('invalid_request_error', `No such customer: ${customerId}`, 'resource_missing');
        const last4 = (card.number || '4242424242424242').slice(-4);
        const src = {
            id: rid('card'),
            object: 'card',
            brand: detectBrand(card.number || '4242'),
            last4,
            exp_month: card.exp_month || 12,
            exp_year: card.exp_year || (new Date().getFullYear() + 2),
            customer: customerId,
            funding: 'credit'
        };
        store.cards.set(src.id, src);
        c.sources.data.push(src);
        if (!c.default_source) c.default_source = src.id;
        emitEvent('customer.source.created', src);
        return clone(src);
    }

    function detectBrand(num) {
        if (!num) return 'Unknown';
        if (/^4/.test(num)) return 'Visa';
        if (/^5[1-5]/.test(num)) return 'MasterCard';
        if (/^3[47]/.test(num)) return 'American Express';
        if (/^6/.test(num)) return 'Discover';
        return 'Unknown';
    }

    // ---------------------------------------------------------------------
    // Charges
    // ---------------------------------------------------------------------
    async function createCharge(params, opts) {
        opts = opts || {};
        return withIdempotency(opts.idempotencyKey, async () => {
            await delay();
            maybeFail('createCharge');
            if (!params.amount || params.amount <= 0) {
                throw stripeError('invalid_request_error', 'amount must be > 0', 'parameter_invalid_integer');
            }
            // Simulated declines via test card numbers
            const srcNum = (params.source && params.source.number) || '';
            if (srcNum === '4000000000000002') {
                throw stripeError('card_error', 'Your card was declined.', 'card_declined');
            }
            if (srcNum === '4000000000009995') {
                throw stripeError('card_error', 'Your card has insufficient funds.', 'insufficient_funds');
            }
            const ch = {
                id: rid('ch'),
                object: 'charge',
                amount: params.amount,
                amount_captured: params.capture === false ? 0 : params.amount,
                amount_refunded: 0,
                captured: params.capture !== false,
                created: nowSec(),
                currency: params.currency || CONFIG.currency,
                customer: params.customer || null,
                description: params.description || null,
                disputed: false,
                livemode: false,
                metadata: params.metadata || {},
                paid: true,
                payment_method: params.source || null,
                receipt_email: params.receipt_email || null,
                refunded: false,
                refunds: { object: 'list', data: [] },
                status: 'succeeded',
                outcome: {
                    network_status: 'approved_by_network',
                    risk_level: 'normal',
                    seller_message: 'Payment complete.',
                    type: 'authorized'
                }
            };
            store.charges.set(ch.id, ch);
            emitEvent('charge.succeeded', ch);
            if (ch.captured) emitEvent('charge.captured', ch);
            return clone(ch);
        });
    }

    async function retrieveCharge(id) {
        await delay();
        const ch = store.charges.get(id);
        if (!ch) throw stripeError('invalid_request_error', `No such charge: ${id}`, 'resource_missing');
        return clone(ch);
    }

    async function captureCharge(id, params) {
        await delay();
        const ch = store.charges.get(id);
        if (!ch) throw stripeError('invalid_request_error', `No such charge: ${id}`, 'resource_missing');
        if (ch.captured) throw stripeError('invalid_request_error', 'Charge already captured', 'charge_already_captured');
        ch.captured = true;
        ch.amount_captured = (params && params.amount) || ch.amount;
        emitEvent('charge.captured', ch);
        return clone(ch);
    }

    async function listCharges(params) {
        await delay();
        params = params || {};
        let data = Array.from(store.charges.values());
        if (params.customer) data = data.filter(c => c.customer === params.customer);
        if (params.limit) data = data.slice(0, params.limit);
        return { object: 'list', has_more: false, data: clone(data) };
    }

    // ---------------------------------------------------------------------
    // Refunds
    // ---------------------------------------------------------------------
    async function createRefund(params, opts) {
        opts = opts || {};
        return withIdempotency(opts.idempotencyKey, async () => {
            await delay();
            const ch = store.charges.get(params.charge);
            if (!ch) throw stripeError('invalid_request_error', `No such charge: ${params.charge}`, 'resource_missing');
            const remaining = ch.amount - ch.amount_refunded;
            const amount = params.amount == null ? remaining : params.amount;
            if (amount <= 0 || amount > remaining) {
                throw stripeError('invalid_request_error', 'Refund amount invalid', 'amount_too_large');
            }
            const rf = {
                id: rid('re'),
                object: 'refund',
                amount,
                charge: ch.id,
                created: nowSec(),
                currency: ch.currency,
                metadata: params.metadata || {},
                reason: params.reason || null,
                status: 'succeeded'
            };
            ch.amount_refunded += amount;
            ch.refunded = ch.amount_refunded >= ch.amount;
            ch.refunds.data.push(rf);
            store.refunds.set(rf.id, rf);
            emitEvent('charge.refunded', ch);
            emitEvent('refund.created', rf);
            return clone(rf);
        });
    }

    async function listRefunds(chargeId) {
        await delay();
        const ch = store.charges.get(chargeId);
        if (!ch) throw stripeError('invalid_request_error', `No such charge: ${chargeId}`, 'resource_missing');
        return { object: 'list', has_more: false, data: clone(ch.refunds.data) };
    }

    // ---------------------------------------------------------------------
    // Subscriptions / Plans / Invoices
    // ---------------------------------------------------------------------
    async function listPlans() {
        await delay();
        return { object: 'list', data: clone(Array.from(store.plans.values())) };
    }

    function periodEnd(interval, from) {
        const d = new Date(from * 1000);
        if (interval === 'year') d.setFullYear(d.getFullYear() + 1);
        else if (interval === 'week') d.setDate(d.getDate() + 7);
        else if (interval === 'day') d.setDate(d.getDate() + 1);
        else d.setMonth(d.getMonth() + 1);
        return Math.floor(d.getTime() / 1000);
    }

    async function createSubscription(params) {
        await delay();
        const c = store.customers.get(params.customer);
        if (!c) throw stripeError('invalid_request_error', `No such customer: ${params.customer}`, 'resource_missing');
        const plan = store.plans.get(params.plan || (params.items && params.items[0] && params.items[0].plan));
        if (!plan) throw stripeError('invalid_request_error', 'Unknown plan', 'resource_missing');
        const start = nowSec();
        const sub = {
            id: rid('sub'),
            object: 'subscription',
            customer: c.id,
            status: params.trial_period_days ? 'trialing' : 'active',
            plan: clone(plan),
            items: { object: 'list', data: [{ id: rid('si'), plan: clone(plan), quantity: params.quantity || 1 }] },
            current_period_start: start,
            current_period_end: periodEnd(plan.interval, start),
            cancel_at_period_end: false,
            canceled_at: null,
            created: start,
            metadata: params.metadata || {},
            livemode: false
        };
        store.subscriptions.set(sub.id, sub);
        const inv = generateInvoice(sub);
        emitEvent('customer.subscription.created', sub);
        emitEvent('invoice.created', inv);
        emitEvent('invoice.payment_succeeded', inv);
        return clone(sub);
    }

    function generateInvoice(sub) {
        const inv = {
            id: rid('in'),
            object: 'invoice',
            customer: sub.customer,
            subscription: sub.id,
            amount_due: sub.plan.amount * (sub.items.data[0].quantity || 1),
            amount_paid: sub.plan.amount * (sub.items.data[0].quantity || 1),
            amount_remaining: 0,
            currency: sub.plan.currency,
            status: 'paid',
            paid: true,
            period_start: sub.current_period_start,
            period_end: sub.current_period_end,
            created: nowSec(),
            number: 'INV-' + Math.floor(Math.random() * 1e6),
            lines: { object: 'list', data: [{ amount: sub.plan.amount, plan: sub.plan, quantity: sub.items.data[0].quantity }] }
        };
        store.invoices.set(inv.id, inv);
        return inv;
    }

    async function cancelSubscription(id, params) {
        await delay();
        const sub = store.subscriptions.get(id);
        if (!sub) throw stripeError('invalid_request_error', `No such subscription: ${id}`, 'resource_missing');
        params = params || {};
        if (params.at_period_end) {
            sub.cancel_at_period_end = true;
            emitEvent('customer.subscription.updated', sub);
        } else {
            sub.status = 'canceled';
            sub.canceled_at = nowSec();
            emitEvent('customer.subscription.deleted', sub);
        }
        return clone(sub);
    }

    async function updateSubscription(id, params) {
        await delay();
        const sub = store.subscriptions.get(id);
        if (!sub) throw stripeError('invalid_request_error', `No such subscription: ${id}`, 'resource_missing');
        if (params.plan) {
            const np = store.plans.get(params.plan);
            if (!np) throw stripeError('invalid_request_error', 'Unknown plan', 'resource_missing');
            sub.plan = clone(np);
            sub.items.data[0].plan = clone(np);
        }
        if (params.quantity) sub.items.data[0].quantity = params.quantity;
        if (params.metadata) sub.metadata = Object.assign(sub.metadata, params.metadata);
        emitEvent('customer.subscription.updated', sub);
        return clone(sub);
    }

    async function listSubscriptions(params) {
        await delay();
        params = params || {};
        let data = Array.from(store.subscriptions.values());
        if (params.customer) data = data.filter(s => s.customer === params.customer);
        if (params.status) data = data.filter(s => s.status === params.status);
        return { object: 'list', has_more: false, data: clone(data) };
    }

    // ---------------------------------------------------------------------
    // Webhooks
    // ---------------------------------------------------------------------
    function signPayload(payload, secret) {
        // Pseudo-HMAC: deterministic but NOT cryptographically secure.
        const s = (secret || CONFIG.webhookSecret) + '|' + payload;
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        const ts = nowSec();
        return `t=${ts},v1=${Math.abs(h).toString(16).padStart(16, '0')}`;
    }

    function constructEvent(payload, signature, secret) {
        const expected = signPayload(payload, secret);
        const sigOnly = (signature || '').split(',').filter(p => p.startsWith('v1=')).join(',');
        const expOnly = expected.split(',').filter(p => p.startsWith('v1=')).join(',');
        if (sigOnly !== expOnly) {
            throw stripeError('signature_verification_error', 'Invalid signature', 'signature_invalid');
        }
        return JSON.parse(payload);
    }

    function registerWebhook(url, enabled_events, handler) {
        const ep = {
            id: rid('we'),
            object: 'webhook_endpoint',
            url,
            enabled_events: enabled_events || ['*'],
            secret: CONFIG.webhookSecret,
            handler: typeof handler === 'function' ? handler : (() => {}),
            created: nowSec(),
            status: 'enabled'
        };
        store.webhookEndpoints.set(ep.id, ep);
        return clone({ id: ep.id, url: ep.url, enabled_events: ep.enabled_events, secret: ep.secret });
    }

    function deleteWebhook(id) {
        const ok = store.webhookEndpoints.delete(id);
        return { id, deleted: ok };
    }

    function listEvents(params) {
        params = params || {};
        let data = store.events.slice();
        if (params.type) data = data.filter(e => e.type === params.type);
        if (params.limit) data = data.slice(-params.limit);
        return { object: 'list', has_more: false, data: clone(data) };
    }

    // ---------------------------------------------------------------------
    // Test helpers
    // ---------------------------------------------------------------------
    function _reset() {
        store.customers.clear();
        store.cards.clear();
        store.charges.clear();
        store.refunds.clear();
        store.subscriptions.clear();
        store.invoices.clear();
        store.events.length = 0;
        store.webhookEndpoints.clear();
        store.idempotencyKeys.clear();
    }

    function _setLatency(ms) { CONFIG.latencyMs = ms; }
    function _setFailureRate(rate) { CONFIG.failureRate = rate; }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------
    const StripeAPI = {
        version: '1.0.0-mock',
        config: CONFIG,
        customers: {
            create: createCustomer,
            retrieve: retrieveCustomer,
            update: updateCustomer,
            attachCard
        },
        charges: {
            create: createCharge,
            retrieve: retrieveCharge,
            capture: captureCharge,
            list: listCharges
        },
        refunds: {
            create: createRefund,
            list: listRefunds
        },
        plans: {
            list: listPlans
        },
        subscriptions: {
            create: createSubscription,
            update: updateSubscription,
            cancel: cancelSubscription,
            list: listSubscriptions
        },
        webhooks: {
            register: registerWebhook,
            delete: deleteWebhook,
            constructEvent,
            sign: signPayload,
            events: listEvents
        },
        _test: {
            reset: _reset,
            setLatency: _setLatency,
            setFailureRate: _setFailureRate,
            store
        }
    };

    global.StripeAPI = StripeAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = StripeAPI;
})(typeof window !== 'undefined' ? window : globalThis);
