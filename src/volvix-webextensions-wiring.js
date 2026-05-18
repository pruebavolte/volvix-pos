/**
 * volvix-webextensions-wiring.js
 * Browser WebExtensions API wiring layer for Volvix POS
 *
 * Provides:
 *   - Detection of Chrome / Firefox / Edge extensions APIs
 *   - Detection of well-known installed extensions (probe-based)
 *   - Bidirectional messaging (sendMessage / onMessage)
 *   - External connect ports for streaming
 *   - Storage bridge (extension <-> page)
 *   - Permissions / commands inspection
 *
 * Exposes: window.WebExtensions
 */
(function (root) {
    'use strict';

    // ──────────────────────────────────────────────────────────────────────
    // Browser detection
    // ──────────────────────────────────────────────────────────────────────
    function detectBrowser() {
        var ua = (navigator.userAgent || '').toLowerCase();
        var vendor = (navigator.vendor || '').toLowerCase();
        var info = {
            isChrome: false,
            isFirefox: false,
            isEdge: false,
            isOpera: false,
            isBrave: false,
            isSafari: false,
            engine: 'unknown',
            version: null
        };
        if (ua.indexOf('edg/') !== -1) { info.isEdge = true; info.engine = 'blink'; }
        else if (ua.indexOf('opr/') !== -1 || ua.indexOf('opera') !== -1) { info.isOpera = true; info.engine = 'blink'; }
        else if (ua.indexOf('firefox') !== -1) { info.isFirefox = true; info.engine = 'gecko'; }
        else if (ua.indexOf('chrome') !== -1 && vendor.indexOf('google') !== -1) { info.isChrome = true; info.engine = 'blink'; }
        else if (ua.indexOf('safari') !== -1) { info.isSafari = true; info.engine = 'webkit'; }

        // Brave detection (async API exists on navigator)
        if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
            info.isBrave = true;
        }

        var m = ua.match(/(chrome|firefox|edg|opr|safari)\/([\d.]+)/);
        if (m) info.version = m[2];
        return info;
    }

    var BROWSER = detectBrowser();

    // ──────────────────────────────────────────────────────────────────────
    // API surface detection
    // ──────────────────────────────────────────────────────────────────────
    function detectExtensionsAPI() {
        var api = {
            chromeRuntime: typeof chrome !== 'undefined' && chrome.runtime ? true : false,
            browserRuntime: typeof browser !== 'undefined' && browser.runtime ? true : false,
            webNavigation: false,
            storage: false,
            messaging: false
        };
        try {
            if (typeof chrome !== 'undefined') {
                api.webNavigation = !!chrome.webNavigation;
                api.storage = !!chrome.storage;
                api.messaging = !!(chrome.runtime && chrome.runtime.sendMessage);
            }
            if (typeof browser !== 'undefined' && !api.messaging) {
                api.messaging = !!(browser.runtime && browser.runtime.sendMessage);
            }
        } catch (e) { /* sandbox may throw */ }
        return api;
    }

    var API = detectExtensionsAPI();

    // ──────────────────────────────────────────────────────────────────────
    // Known extension registry (probe by extension ID for Chromium / public key for FF)
    // ──────────────────────────────────────────────────────────────────────
    var KNOWN_EXTENSIONS = {
        chromium: {
            'cjpalhdlnbpafiamejdnhcphjbkeiagm': { name: 'uBlock Origin', category: 'adblock' },
            'gighmmpiobklfepjocnamgkkbiglidom': { name: 'AdBlock', category: 'adblock' },
            'aapbdbdomjkkjkaonfhkkikfgjllcleb': { name: 'Google Translate', category: 'translate' },
            'nkbihfbeogaeaoehlefnkodbefgpgknn': { name: 'MetaMask', category: 'wallet' },
            'fhbjgbiflinjbdggehcddcbncdddomop': { name: 'Postman Interceptor', category: 'devtools' },
            'lmhkpmbekcpmknklioeibfkpmmfibljd': { name: 'Redux DevTools', category: 'devtools' },
            'fmkadmapgofadopljbjfkapdkoienihi': { name: 'React Developer Tools', category: 'devtools' },
            'nhdogjmejiglipccpnnnanhbledajbpd': { name: 'Vue.js DevTools', category: 'devtools' },
            'bhghoamapcdpbohphigoooaddinpkbai': { name: 'Authenticator', category: 'security' },
            'dbepggeogbaibhgnhhndojpepiihcmeb': { name: 'Vimium', category: 'productivity' },
            'gcbommkclmclpchllfjekcdonpmejbdp': { name: 'HTTPS Everywhere', category: 'security' },
            'pkehgijcmpdhfbdbbnkijodmdjhbjlgp': { name: 'Privacy Badger', category: 'privacy' }
        },
        firefox: {
            'uBlock0@raymondhill.net': { name: 'uBlock Origin', category: 'adblock' },
            '{446900e4-71c2-419f-a6a7-df9c091e268b}': { name: 'Bitwarden', category: 'security' },
            'jid1-MnnxcxisBPnSXQ@jetpack': { name: 'Privacy Badger', category: 'privacy' }
        }
    };

    // ──────────────────────────────────────────────────────────────────────
    // Extension probing
    // ──────────────────────────────────────────────────────────────────────
    function probeChromiumExtension(extId, resourcePath, timeoutMs) {
        timeoutMs = timeoutMs || 1500;
        return new Promise(function (resolve) {
            if (!extId) return resolve({ id: extId, installed: false, reason: 'no-id' });
            var url = 'chrome-extension://' + extId + '/' + (resourcePath || 'manifest.json');
            var img = new Image();
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                resolve({ id: extId, installed: false, reason: 'timeout' });
            }, timeoutMs);

            img.onload = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve({ id: extId, installed: true });
            };
            img.onerror = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                // onerror may also fire for "loaded but not an image" — try fetch fallback
                fetch(url, { method: 'GET', mode: 'no-cors' })
                    .then(function () { resolve({ id: extId, installed: true, via: 'fetch' }); })
                    .catch(function () { resolve({ id: extId, installed: false, reason: 'not-found' }); });
            };
            img.src = url;
        });
    }

    function detectInstalledExtensions(opts) {
        opts = opts || {};
        var ids = Object.keys(KNOWN_EXTENSIONS.chromium);
        var promises = ids.map(function (id) {
            var meta = KNOWN_EXTENSIONS.chromium[id];
            return probeChromiumExtension(id, meta.probeResource || 'icons/icon128.png', opts.timeout)
                .then(function (r) {
                    return Object.assign({}, meta, r);
                });
        });
        return Promise.all(promises).then(function (results) {
            return results.filter(function (r) { return r.installed; });
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Messaging
    // ──────────────────────────────────────────────────────────────────────
    function sendMessageToExtension(extId, message, opts) {
        opts = opts || {};
        return new Promise(function (resolve, reject) {
            try {
                var rt = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage)
                    ? chrome.runtime
                    : (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage)
                        ? browser.runtime
                        : null;
                if (!rt) return reject(new Error('runtime.sendMessage not available'));

                var cb = function (response) {
                    var lastErr = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) || null;
                    if (lastErr) return reject(new Error(lastErr.message || String(lastErr)));
                    resolve(response);
                };

                if (extId) rt.sendMessage(extId, message, opts, cb);
                else rt.sendMessage(message, opts, cb);
            } catch (e) { reject(e); }
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // External connect ports
    // ──────────────────────────────────────────────────────────────────────
    function connectExtension(extId, name) {
        var rt = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connect)
            ? chrome.runtime
            : (typeof browser !== 'undefined' && browser.runtime && browser.runtime.connect)
                ? browser.runtime
                : null;
        if (!rt) throw new Error('runtime.connect not available');
        var port = rt.connect(extId, { name: name || 'volvix-port' });
        var listeners = { message: [], disconnect: [] };
        port.onMessage.addListener(function (m) { listeners.message.forEach(function (fn) { try { fn(m); } catch (e) {} }); });
        port.onDisconnect.addListener(function () { listeners.disconnect.forEach(function (fn) { try { fn(); } catch (e) {} }); });
        return {
            postMessage: function (m) { port.postMessage(m); },
            on: function (ev, fn) { if (listeners[ev]) listeners[ev].push(fn); },
            disconnect: function () { try { port.disconnect(); } catch (e) {} },
            raw: port
        };
    }

    // ──────────────────────────────────────────────────────────────────────
    // Inbound messaging from extensions
    // ──────────────────────────────────────────────────────────────────────
    var _inboundListeners = [];
    function onExtensionMessage(fn) {
        if (typeof fn !== 'function') return function () {};
        _inboundListeners.push(fn);
        return function unsubscribe() {
            var i = _inboundListeners.indexOf(fn);
            if (i !== -1) _inboundListeners.splice(i, 1);
        };
    }
    window.addEventListener('message', function (ev) {
        if (!ev.data || typeof ev.data !== 'object') return;
        if (ev.data.__volvix_ext_channel !== true) return;
        _inboundListeners.forEach(function (fn) {
            try { fn(ev.data.payload, ev.data.from || null, ev); } catch (e) {}
        });
    }, false);

    // ──────────────────────────────────────────────────────────────────────
    // Storage bridge (best-effort; extension must expose its own bridge)
    // ──────────────────────────────────────────────────────────────────────
    function storageGet(extId, keys) {
        return sendMessageToExtension(extId, { __volvix: true, op: 'storage.get', keys: keys });
    }
    function storageSet(extId, items) {
        return sendMessageToExtension(extId, { __volvix: true, op: 'storage.set', items: items });
    }
    function storageRemove(extId, keys) {
        return sendMessageToExtension(extId, { __volvix: true, op: 'storage.remove', keys: keys });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Permissions / commands inspection
    // ──────────────────────────────────────────────────────────────────────
    function listSelfPermissions() {
        return new Promise(function (resolve) {
            try {
                if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.getAll) {
                    chrome.permissions.getAll(function (p) { resolve(p || {}); });
                } else if (typeof browser !== 'undefined' && browser.permissions && browser.permissions.getAll) {
                    browser.permissions.getAll().then(resolve, function () { resolve({}); });
                } else resolve(null);
            } catch (e) { resolve(null); }
        });
    }
    function listSelfCommands() {
        return new Promise(function (resolve) {
            try {
                if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.getAll) {
                    chrome.commands.getAll(function (c) { resolve(c || []); });
                } else if (typeof browser !== 'undefined' && browser.commands && browser.commands.getAll) {
                    browser.commands.getAll().then(resolve, function () { resolve([]); });
                } else resolve(null);
            } catch (e) { resolve(null); }
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // High-level scan
    // ──────────────────────────────────────────────────────────────────────
    function scan(opts) {
        opts = opts || {};
        return detectInstalledExtensions(opts).then(function (installed) {
            return {
                browser: BROWSER,
                api: API,
                installed: installed,
                detectedAt: new Date().toISOString()
            };
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Diagnostics
    // ──────────────────────────────────────────────────────────────────────
    function diagnostics() {
        return {
            browser: BROWSER,
            api: API,
            inboundListeners: _inboundListeners.length,
            knownChromiumIds: Object.keys(KNOWN_EXTENSIONS.chromium).length,
            knownFirefoxIds: Object.keys(KNOWN_EXTENSIONS.firefox).length,
            ts: Date.now()
        };
    }

    // ──────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────
    var WebExtensions = {
        version: '1.0.0',
        browser: BROWSER,
        api: API,
        known: KNOWN_EXTENSIONS,
        probe: probeChromiumExtension,
        detectInstalled: detectInstalledExtensions,
        sendMessage: sendMessageToExtension,
        connect: connectExtension,
        onMessage: onExtensionMessage,
        storage: {
            get: storageGet,
            set: storageSet,
            remove: storageRemove
        },
        permissions: { list: listSelfPermissions },
        commands: { list: listSelfCommands },
        scan: scan,
        diagnostics: diagnostics
    };

    root.WebExtensions = WebExtensions;
    try {
        root.dispatchEvent(new CustomEvent('volvix:webextensions-ready', { detail: diagnostics() }));
    } catch (e) {}
})(window);
