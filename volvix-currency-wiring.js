/* ============================================================================
 * volvix-currency-wiring.js
 * Volvix POS — Sistema Multi-Moneda con Conversión en Tiempo Real
 * Agent-28 / Ronda 8 Fibonacci
 *
 * Características:
 *   1. Soporte para 9 monedas: MXN, USD, EUR, GBP, BRL, ARS, COP, CLP, PEN
 *   2. Tasas de cambio (mock + API opcional)
 *   3. Conversión de precios en tiempo real
 *   4. Selector de moneda (UI)
 *   5. Formato regional con Intl.NumberFormat
 *   6. Persistencia en localStorage
 *   7. Auto-actualización de tasas cada hora
 *   8. Conversor visual flotante
 *   9. API global window.CurrencyAPI
 * ==========================================================================*/

(function (global) {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. CONFIGURACIÓN GLOBAL
    // -------------------------------------------------------------------------
    const CFG = {
        STORAGE_KEY: 'volvix_currency_v1',
        RATES_KEY:   'volvix_currency_rates_v1',
        BASE:        'MXN',
        DEFAULT:     'MXN',
        REFRESH_MS:  60 * 60 * 1000,           // 1 hora
        API_URL:     'https://api.exchangerate.host/latest', // opcional
        DEBUG:       false
    };

    function log(...a) { if (CFG.DEBUG) console.log('[CurrencyAPI]', ...a); }
    function warn(...a) { console.warn('[CurrencyAPI]', ...a); }

    // -------------------------------------------------------------------------
    // 2. CATÁLOGO DE MONEDAS
    // -------------------------------------------------------------------------
    const CURRENCIES = {
        MXN: { code: 'MXN', name: 'Peso Mexicano',     symbol: '$',  locale: 'es-MX', flag: '🇲🇽' },
        USD: { code: 'USD', name: 'US Dollar',         symbol: '$',  locale: 'en-US', flag: '🇺🇸' },
        EUR: { code: 'EUR', name: 'Euro',              symbol: '€',  locale: 'es-ES', flag: '🇪🇺' },
        GBP: { code: 'GBP', name: 'British Pound',     symbol: '£',  locale: 'en-GB', flag: '🇬🇧' },
        BRL: { code: 'BRL', name: 'Real Brasileño',    symbol: 'R$', locale: 'pt-BR', flag: '🇧🇷' },
        ARS: { code: 'ARS', name: 'Peso Argentino',    symbol: '$',  locale: 'es-AR', flag: '🇦🇷' },
        COP: { code: 'COP', name: 'Peso Colombiano',   symbol: '$',  locale: 'es-CO', flag: '🇨🇴' },
        CLP: { code: 'CLP', name: 'Peso Chileno',      symbol: '$',  locale: 'es-CL', flag: '🇨🇱' },
        PEN: { code: 'PEN', name: 'Sol Peruano',       symbol: 'S/', locale: 'es-PE', flag: '🇵🇪' }
    };
    const CODES = Object.keys(CURRENCIES);

    // -------------------------------------------------------------------------
    // 3. TASAS DE CAMBIO (mock fallback, base = MXN)
    // -------------------------------------------------------------------------
    const MOCK_RATES = {
        MXN: 1.0000,
        USD: 0.0588,    // 1 MXN ≈ 0.0588 USD
        EUR: 0.0541,
        GBP: 0.0464,
        BRL: 0.2980,
        ARS: 51.500,
        COP: 234.50,
        CLP: 55.300,
        PEN: 0.2210
    };

    let currentRates    = Object.assign({}, MOCK_RATES);
    let ratesUpdatedAt  = 0;
    let ratesSource     = 'mock';

    // -------------------------------------------------------------------------
    // 4. PERSISTENCIA
    // -------------------------------------------------------------------------
    function loadSelected() {
        try {
            const raw = localStorage.getItem(CFG.STORAGE_KEY);
            if (raw && CURRENCIES[raw]) return raw;
        } catch (e) { warn('loadSelected', e); }
        return CFG.DEFAULT;
    }

    function saveSelected(code) {
        try { localStorage.setItem(CFG.STORAGE_KEY, code); }
        catch (e) { warn('saveSelected', e); }
    }

    function loadCachedRates() {
        try {
            const raw = localStorage.getItem(CFG.RATES_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (!obj || !obj.rates || !obj.updatedAt) return false;
            currentRates   = Object.assign({}, MOCK_RATES, obj.rates);
            ratesUpdatedAt = obj.updatedAt;
            ratesSource    = obj.source || 'cache';
            log('rates restored from cache', ratesSource, new Date(ratesUpdatedAt));
            return true;
        } catch (e) { warn('loadCachedRates', e); return false; }
    }

    function saveCachedRates() {
        try {
            localStorage.setItem(CFG.RATES_KEY, JSON.stringify({
                rates:     currentRates,
                updatedAt: ratesUpdatedAt,
                source:    ratesSource
            }));
        } catch (e) { warn('saveCachedRates', e); }
    }

    let selectedCurrency = loadSelected();
    loadCachedRates();

    // -------------------------------------------------------------------------
    // 5. ACTUALIZACIÓN DE TASAS (API + fallback)
    // -------------------------------------------------------------------------
    async function fetchRatesFromAPI() {
        const url = `${CFG.API_URL}?base=${CFG.BASE}&symbols=${CODES.join(',')}`;
        try {
            const r = await fetch(url, { method: 'GET' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const data = await r.json();
            if (!data || !data.rates) throw new Error('respuesta invalida');
            const next = { [CFG.BASE]: 1 };
            CODES.forEach(c => {
                if (typeof data.rates[c] === 'number') next[c] = data.rates[c];
                else if (c === CFG.BASE) next[c] = 1;
                else next[c] = MOCK_RATES[c];
            });
            currentRates   = next;
            ratesUpdatedAt = Date.now();
            ratesSource    = 'api';
            saveCachedRates();
            log('rates refreshed from API');
            emit('rates:updated', { source: 'api', rates: currentRates });
            return true;
        } catch (e) {
            warn('fetchRatesFromAPI fallo, usando mock:', e.message);
            if (ratesUpdatedAt === 0) {
                currentRates   = Object.assign({}, MOCK_RATES);
                ratesUpdatedAt = Date.now();
                ratesSource    = 'mock';
                saveCachedRates();
                emit('rates:updated', { source: 'mock', rates: currentRates });
            }
            return false;
        }
    }

    let refreshTimer = null;
    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = setInterval(fetchRatesFromAPI, CFG.REFRESH_MS);
        log('auto-refresh activado cada', CFG.REFRESH_MS / 1000, 's');
    }
    function stopAutoRefresh() {
        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }

    // -------------------------------------------------------------------------
    // 6. CONVERSIÓN
    // -------------------------------------------------------------------------
    function convert(amount, from, to) {
        if (typeof amount !== 'number' || isNaN(amount)) return 0;
        from = (from || CFG.BASE).toUpperCase();
        to   = (to   || selectedCurrency).toUpperCase();
        if (!currentRates[from] || !currentRates[to]) {
            warn('moneda desconocida', from, to);
            return amount;
        }
        if (from === to) return amount;
        const inBase = amount / currentRates[from];      // a MXN
        return inBase * currentRates[to];                // a destino
    }

    function format(amount, code) {
        code = (code || selectedCurrency).toUpperCase();
        const meta = CURRENCIES[code];
        if (!meta) return String(amount);
        try {
            return new Intl.NumberFormat(meta.locale, {
                style: 'currency',
                currency: code,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        } catch (e) {
            return `${meta.symbol}${amount.toFixed(2)} ${code}`;
        }
    }

    function convertAndFormat(amount, from, to) {
        to = to || selectedCurrency;
        return format(convert(amount, from, to), to);
    }

    // -------------------------------------------------------------------------
    // 7. EVENT BUS MÍNIMO
    // -------------------------------------------------------------------------
    const listeners = {};
    function on(evt, fn) {
        (listeners[evt] = listeners[evt] || []).push(fn);
        return () => off(evt, fn);
    }
    function off(evt, fn) {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter(f => f !== fn);
    }
    function emit(evt, payload) {
        (listeners[evt] || []).forEach(fn => {
            try { fn(payload); } catch (e) { warn('listener', evt, e); }
        });
        try {
            global.dispatchEvent(new CustomEvent('volvix:' + evt, { detail: payload }));
        } catch (_) {}
    }

    // -------------------------------------------------------------------------
    // 8. SELECTOR DE MONEDA Y RE-RENDER DE PRECIOS
    // -------------------------------------------------------------------------
    function setCurrency(code) {
        code = (code || '').toUpperCase();
        if (!CURRENCIES[code]) { warn('moneda invalida', code); return false; }
        if (code === selectedCurrency) return true;
        const prev = selectedCurrency;
        selectedCurrency = code;
        saveSelected(code);
        emit('currency:changed', { from: prev, to: code });
        rerenderPrices();
        return true;
    }

    function getCurrency() { return selectedCurrency; }
    function listCurrencies() { return CODES.map(c => Object.assign({}, CURRENCIES[c])); }
    function getRates() { return Object.assign({}, currentRates); }

    /**
     * Recorre elementos con [data-price] [data-currency] y los re-formatea
     * en la moneda seleccionada actual.
     */
    function rerenderPrices(root) {
        root = root || document;
        const nodes = root.querySelectorAll('[data-price]');
        nodes.forEach(el => {
            const raw  = parseFloat(el.getAttribute('data-price'));
            const from = (el.getAttribute('data-currency') || CFG.BASE).toUpperCase();
            if (isNaN(raw)) return;
            el.textContent = convertAndFormat(raw, from, selectedCurrency);
        });
    }

    // -------------------------------------------------------------------------
    // 9. UI: SELECTOR + CONVERSOR VISUAL FLOTANTE
    // -------------------------------------------------------------------------
    const STYLE = `
    .vx-cur-wrap{position:fixed;bottom:18px;right:18px;z-index:99999;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
    .vx-cur-toggle{background:#0f172a;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25);}
    .vx-cur-toggle:hover{background:#1e293b;}
    .vx-cur-panel{position:absolute;bottom:54px;right:0;width:300px;background:#fff;border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.18);padding:14px;display:none;}
    .vx-cur-panel.open{display:block;}
    .vx-cur-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
    .vx-cur-row select,.vx-cur-row input{flex:1;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;}
    .vx-cur-out{font-size:18px;font-weight:700;color:#0f172a;text-align:center;padding:10px;background:#f1f5f9;border-radius:10px;}
    .vx-cur-meta{font-size:11px;color:#64748b;text-align:center;margin-top:8px;}
    .vx-cur-title{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:10px;}
    `;

    function injectStyle() {
        if (document.getElementById('vx-cur-style')) return;
        const s = document.createElement('style');
        s.id = 'vx-cur-style';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    function buildOptions(selectEl, selected) {
        selectEl.innerHTML = '';
        CODES.forEach(c => {
            const meta = CURRENCIES[c];
            const opt  = document.createElement('option');
            opt.value  = c;
            opt.textContent = `${meta.flag} ${c} — ${meta.name}`;
            if (c === selected) opt.selected = true;
            selectEl.appendChild(opt);
        });
    }

    let uiRoot = null;
    function mountUI() {
        if (uiRoot || typeof document === 'undefined') return;
        injectStyle();
        uiRoot = document.createElement('div');
        uiRoot.className = 'vx-cur-wrap';
        uiRoot.innerHTML = `
            <button class="vx-cur-toggle" type="button">💱 <span class="vx-cur-cur">${selectedCurrency}</span></button>
            <div class="vx-cur-panel">
                <div class="vx-cur-title">Conversor de Moneda</div>
                <div class="vx-cur-row">
                    <input type="number" class="vx-cur-amt" value="100" min="0" step="0.01"/>
                    <select class="vx-cur-from"></select>
                </div>
                <div class="vx-cur-row">
                    <span style="font-size:18px;">→</span>
                    <select class="vx-cur-to"></select>
                </div>
                <div class="vx-cur-out">—</div>
                <div class="vx-cur-meta"></div>
            </div>
        `;
        (document.body || document.documentElement).appendChild(uiRoot);

        const toggle = uiRoot.querySelector('.vx-cur-toggle');
        const panel  = uiRoot.querySelector('.vx-cur-panel');
        const amt    = uiRoot.querySelector('.vx-cur-amt');
        const from   = uiRoot.querySelector('.vx-cur-from');
        const to     = uiRoot.querySelector('.vx-cur-to');
        const out    = uiRoot.querySelector('.vx-cur-out');
        const meta   = uiRoot.querySelector('.vx-cur-meta');
        const cur    = uiRoot.querySelector('.vx-cur-cur');

        buildOptions(from, CFG.BASE);
        buildOptions(to, selectedCurrency);

        function refresh() {
            const v = parseFloat(amt.value) || 0;
            out.textContent = convertAndFormat(v, from.value, to.value);
            const stamp = ratesUpdatedAt ? new Date(ratesUpdatedAt).toLocaleString() : 'n/d';
            meta.textContent = `Fuente: ${ratesSource} · Actualizado: ${stamp}`;
            cur.textContent = selectedCurrency;
        }

        toggle.addEventListener('click', () => panel.classList.toggle('open'));
        amt.addEventListener('input',   refresh);
        from.addEventListener('change', refresh);
        to.addEventListener('change',   () => { setCurrency(to.value); refresh(); });
        on('rates:updated',     refresh);
        on('currency:changed',  () => { buildOptions(to, selectedCurrency); refresh(); });

        refresh();
    }

    function unmountUI() {
        if (uiRoot && uiRoot.parentNode) uiRoot.parentNode.removeChild(uiRoot);
        uiRoot = null;
    }

    // -------------------------------------------------------------------------
    // 10. API PÚBLICA
    // -------------------------------------------------------------------------
    const CurrencyAPI = {
        // catálogo
        list:        listCurrencies,
        currencies:  CURRENCIES,
        codes:       () => CODES.slice(),

        // selección
        get:         getCurrency,
        set:         setCurrency,

        // tasas
        rates:       getRates,
        refresh:     fetchRatesFromAPI,
        startAuto:   startAutoRefresh,
        stopAuto:    stopAutoRefresh,
        ratesInfo:   () => ({ source: ratesSource, updatedAt: ratesUpdatedAt }),

        // conversión
        convert:           convert,
        format:            format,
        convertAndFormat:  convertAndFormat,

        // DOM
        rerender:    rerenderPrices,
        mountUI:     mountUI,
        unmountUI:   unmountUI,

        // eventos
        on:  on,
        off: off,

        // configuración
        config: CFG
    };

    global.CurrencyAPI = CurrencyAPI;

    // -------------------------------------------------------------------------
    // 11. AUTO-INIT
    // -------------------------------------------------------------------------
    function init() {
        log('init, moneda actual:', selectedCurrency);
        if (!ratesUpdatedAt) fetchRatesFromAPI();
        startAutoRefresh();
        if (typeof document !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => { mountUI(); rerenderPrices(); });
            } else {
                mountUI(); rerenderPrices();
            }
        }
        emit('ready', { currency: selectedCurrency, rates: currentRates });
    }

    init();

})(typeof window !== 'undefined' ? window : globalThis);
