/**
 * volvix-paypal-wiring.js
 * PayPal integration module for Volvix POS
 * Exposes window.PayPalAPI with checkout, IPN handling, and refunds.
 *
 * Dependencies (expected on window):
 *   - window.VolvixConfig.paypal = { clientId, secret, env: 'sandbox'|'live', webhookId }
 *   - window.VolvixLogger (optional)
 *   - window.VolvixOrders   (optional, order store)
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------
    // Constants & helpers
    // ------------------------------------------------------------------
    var PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js';
    var API_BASE = {
        sandbox: 'https://api-m.sandbox.paypal.com',
        live:    'https://api-m.paypal.com'
    };

    function log() {
        var args = Array.prototype.slice.call(arguments);
        if (global.VolvixLogger && typeof global.VolvixLogger.log === 'function') {
            global.VolvixLogger.log.apply(global.VolvixLogger, ['[PayPal]'].concat(args));
        } else {
            console.log.apply(console, ['[PayPal]'].concat(args));
        }
    }

    function err() {
        var args = Array.prototype.slice.call(arguments);
        if (global.VolvixLogger && typeof global.VolvixLogger.error === 'function') {
            global.VolvixLogger.error.apply(global.VolvixLogger, ['[PayPal]'].concat(args));
        } else {
            console.error.apply(console, ['[PayPal]'].concat(args));
        }
    }

    function getConfig() {
        var cfg = (global.VolvixConfig && global.VolvixConfig.paypal) || {};
        if (!cfg.clientId) throw new Error('PayPal clientId missing in VolvixConfig.paypal');
        cfg.env = cfg.env || 'sandbox';
        cfg.currency = cfg.currency || 'USD';
        return cfg;
    }

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};
        opts.headers['Accept'] = 'application/json';
        return fetch(url, opts).then(function (r) {
            return r.text().then(function (t) {
                var data = null;
                try { data = t ? JSON.parse(t) : null; } catch (_) { data = t; }
                if (!r.ok) {
                    var e = new Error('HTTP ' + r.status);
                    e.status = r.status;
                    e.body = data;
                    throw e;
                }
                return data;
            });
        });
    }

    // ------------------------------------------------------------------
    // OAuth
    // ------------------------------------------------------------------
    var _tokenCache = { token: null, exp: 0 };

    function getAccessToken() {
        var cfg = getConfig();
        var now = Date.now();
        if (_tokenCache.token && _tokenCache.exp > now + 30000) {
            return Promise.resolve(_tokenCache.token);
        }
        if (!cfg.secret) {
            return Promise.reject(new Error('PayPal secret not configured (server-only operation)'));
        }
        var basic = btoa(cfg.clientId + ':' + cfg.secret);
        return fetchJson(API_BASE[cfg.env] + '/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + basic,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        }).then(function (r) {
            _tokenCache.token = r.access_token;
            _tokenCache.exp = now + (r.expires_in * 1000);
            log('access token acquired, expires in', r.expires_in, 's');
            return r.access_token;
        });
    }

    // ------------------------------------------------------------------
    // SDK loader (client-side checkout button)
    // ------------------------------------------------------------------
    var _sdkPromise = null;

    function loadSdk() {
        if (_sdkPromise) return _sdkPromise;
        var cfg = getConfig();
        _sdkPromise = new Promise(function (resolve, reject) {
            if (global.paypal) return resolve(global.paypal);
            var s = document.createElement('script');
            s.src = PAYPAL_SDK_URL +
                '?client-id=' + encodeURIComponent(cfg.clientId) +
                '&currency=' + encodeURIComponent(cfg.currency) +
                '&intent=capture';
            s.async = true;
            s.onload  = function () { resolve(global.paypal); };
            s.onerror = function () { reject(new Error('failed to load PayPal SDK')); };
            document.head.appendChild(s);
        });
        return _sdkPromise;
    }

    // ------------------------------------------------------------------
    // Checkout button
    // ------------------------------------------------------------------
    function renderCheckoutButton(opts) {
        // opts: { container, amount, currency, description, orderId, onApprove, onError, onCancel }
        if (!opts || !opts.container) return Promise.reject(new Error('container required'));
        var amount = Number(opts.amount);
        if (!isFinite(amount) || amount <= 0) return Promise.reject(new Error('invalid amount'));
        var cfg = getConfig();
        var currency = opts.currency || cfg.currency;
        var orderId = opts.orderId || uuid();

        return loadSdk().then(function (paypal) {
            var container = typeof opts.container === 'string'
                ? document.querySelector(opts.container)
                : opts.container;
            if (!container) throw new Error('container not found');
            container.innerHTML = '';

            return paypal.Buttons({
                style: { layout: 'vertical', shape: 'rect', label: 'pay' },

                createOrder: function (data, actions) {
                    log('createOrder', orderId, amount, currency);
                    return actions.order.create({
                        intent: 'CAPTURE',
                        purchase_units: [{
                            reference_id: orderId,
                            description: opts.description || ('Volvix order ' + orderId),
                            amount: { currency_code: currency, value: amount.toFixed(2) }
                        }],
                        application_context: {
                            brand_name: 'Volvix POS',
                            user_action: 'PAY_NOW',
                            shipping_preference: 'NO_SHIPPING'
                        }
                    });
                },

                onApprove: function (data, actions) {
                    log('onApprove', data.orderID);
                    return actions.order.capture().then(function (details) {
                        log('captured', details.id, details.status);
                        if (global.VolvixOrders && typeof global.VolvixOrders.markPaid === 'function') {
                            try { global.VolvixOrders.markPaid(orderId, details); } catch (e) { err(e); }
                        }
                        if (typeof opts.onApprove === 'function') opts.onApprove(details, orderId);
                        return details;
                    });
                },

                onCancel: function (data) {
                    log('onCancel', data && data.orderID);
                    if (typeof opts.onCancel === 'function') opts.onCancel(data, orderId);
                },

                onError: function (e) {
                    err('button error', e);
                    if (typeof opts.onError === 'function') opts.onError(e, orderId);
                }
            }).render(container);
        });
    }

    // ------------------------------------------------------------------
    // Server-side: create / capture / get order
    // ------------------------------------------------------------------
    function createOrder(amount, currency, description, referenceId) {
        var cfg = getConfig();
        currency = currency || cfg.currency;
        return getAccessToken().then(function (token) {
            return fetchJson(API_BASE[cfg.env] + '/v2/checkout/orders', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    'PayPal-Request-Id': uuid()
                },
                body: JSON.stringify({
                    intent: 'CAPTURE',
                    purchase_units: [{
                        reference_id: referenceId || uuid(),
                        description: description || 'Volvix order',
                        amount: { currency_code: currency, value: Number(amount).toFixed(2) }
                    }]
                })
            });
        });
    }

    function captureOrder(paypalOrderId) {
        var cfg = getConfig();
        return getAccessToken().then(function (token) {
            return fetchJson(API_BASE[cfg.env] + '/v2/checkout/orders/' + encodeURIComponent(paypalOrderId) + '/capture', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    'PayPal-Request-Id': uuid()
                }
            });
        });
    }

    function getOrder(paypalOrderId) {
        var cfg = getConfig();
        return getAccessToken().then(function (token) {
            return fetchJson(API_BASE[cfg.env] + '/v2/checkout/orders/' + encodeURIComponent(paypalOrderId), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
        });
    }

    // ------------------------------------------------------------------
    // Refunds
    // ------------------------------------------------------------------
    function refundCapture(captureId, amount, currency, note) {
        if (!captureId) return Promise.reject(new Error('captureId required'));
        var cfg = getConfig();
        var body = {};
        if (amount != null) {
            body.amount = {
                value: Number(amount).toFixed(2),
                currency_code: currency || cfg.currency
            };
        }
        if (note) body.note_to_payer = String(note).slice(0, 255);
        return getAccessToken().then(function (token) {
            return fetchJson(API_BASE[cfg.env] + '/v2/payments/captures/' + encodeURIComponent(captureId) + '/refund', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    'PayPal-Request-Id': uuid()
                },
                body: JSON.stringify(body)
            });
        }).then(function (r) {
            log('refund ok', r.id, r.status);
            return r;
        });
    }

    function getRefund(refundId) {
        var cfg = getConfig();
        return getAccessToken().then(function (token) {
            return fetchJson(API_BASE[cfg.env] + '/v2/payments/refunds/' + encodeURIComponent(refundId), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
        });
    }

    // ------------------------------------------------------------------
    // IPN / Webhook verification + dispatch
    // ------------------------------------------------------------------
    var _webhookHandlers = {};

    function onWebhook(eventType, handler) {
        if (typeof handler !== 'function') throw new Error('handler must be function');
        if (!_webhookHandlers[eventType]) _webhookHandlers[eventType] = [];
        _webhookHandlers[eventType].push(handler);
    }

    function offWebhook(eventType, handler) {
        var arr = _webhookHandlers[eventType];
        if (!arr) return;
        var i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
    }

    /**
     * Verify webhook signature against PayPal API.
     * headers: object with the request headers as received by your server.
     * rawBody: original webhook body string.
     */
    function verifyWebhook(headers, rawBody) {
        var cfg = getConfig();
        if (!cfg.webhookId) return Promise.reject(new Error('VolvixConfig.paypal.webhookId missing'));
        var lower = {};
        Object.keys(headers || {}).forEach(function (k) { lower[k.toLowerCase()] = headers[k]; });
        var payload;
        try { payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody; }
        catch (e) { return Promise.reject(new Error('invalid webhook body')); }

        return getAccessToken().then(function (token) {
            return fetchJson(API_BASE[cfg.env] + '/v1/notifications/verify-webhook-signature', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    auth_algo:         lower['paypal-auth-algo'],
                    cert_url:          lower['paypal-cert-url'],
                    transmission_id:   lower['paypal-transmission-id'],
                    transmission_sig:  lower['paypal-transmission-sig'],
                    transmission_time: lower['paypal-transmission-time'],
                    webhook_id:        cfg.webhookId,
                    webhook_event:     payload
                })
            });
        }).then(function (r) {
            return r && r.verification_status === 'SUCCESS';
        });
    }

    /**
     * Process an incoming webhook: verify, then dispatch to handlers.
     */
    function handleWebhook(headers, rawBody) {
        return verifyWebhook(headers, rawBody).then(function (ok) {
            if (!ok) {
                err('webhook verification FAILED');
                throw new Error('invalid webhook signature');
            }
            var evt = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
            log('webhook', evt.event_type, evt.id);
            var list = (_webhookHandlers[evt.event_type] || [])
                .concat(_webhookHandlers['*'] || []);
            return Promise.all(list.map(function (h) {
                try { return Promise.resolve(h(evt)); }
                catch (e) { err('handler threw', e); return Promise.resolve(); }
            })).then(function () { return evt; });
        });
    }

    // Default handlers wired to VolvixOrders if present
    onWebhook('PAYMENT.CAPTURE.COMPLETED', function (evt) {
        var cap = evt.resource || {};
        if (global.VolvixOrders && typeof global.VolvixOrders.markPaid === 'function') {
            global.VolvixOrders.markPaid(
                (cap.custom_id || cap.invoice_id || cap.id), cap
            );
        }
    });

    onWebhook('PAYMENT.CAPTURE.REFUNDED', function (evt) {
        var ref = evt.resource || {};
        if (global.VolvixOrders && typeof global.VolvixOrders.markRefunded === 'function') {
            global.VolvixOrders.markRefunded(ref.custom_id || ref.id, ref);
        }
    });

    onWebhook('PAYMENT.CAPTURE.DENIED', function (evt) {
        var cap = evt.resource || {};
        if (global.VolvixOrders && typeof global.VolvixOrders.markFailed === 'function') {
            global.VolvixOrders.markFailed(cap.custom_id || cap.id, cap);
        }
    });

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------
    global.PayPalAPI = {
        version: '1.0.0',
        // Client-side checkout
        renderCheckoutButton: renderCheckoutButton,
        loadSdk: loadSdk,
        // Server-side orders
        createOrder: createOrder,
        captureOrder: captureOrder,
        getOrder: getOrder,
        // Refunds
        refundCapture: refundCapture,
        getRefund: getRefund,
        // Webhooks / IPN
        onWebhook: onWebhook,
        offWebhook: offWebhook,
        verifyWebhook: verifyWebhook,
        handleWebhook: handleWebhook,
        // Internals (exposed for tests)
        _getAccessToken: getAccessToken,
        _resetTokenCache: function () { _tokenCache = { token: null, exp: 0 }; }
    };

    log('PayPalAPI ready');

})(typeof window !== 'undefined' ? window : globalThis);
