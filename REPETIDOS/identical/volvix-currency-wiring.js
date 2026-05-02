/**
 * volvix-currency-wiring.js — R14 Multi-Currency
 * - Selector de moneda inyectable
 * - Volvix.fmt(amount, code) usando Intl.NumberFormat
 * - Cache de tasas FX, conversión cliente
 *
 * Endpoints consumidos:
 *   GET  /api/currencies
 *   GET  /api/fx/rates?base=MXN
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'volvix.currency';
  const FX_CACHE_KEY = 'volvix.fx.cache';
  const FX_TTL_MS = 6 * 60 * 60 * 1000; // 6h

  const DEFAULT_CURRENCIES = [
    { code: 'MXN', name: 'Peso Mexicano',    symbol: '$',    decimals: 2 },
    { code: 'USD', name: 'US Dollar',        symbol: 'US$',  decimals: 2 },
    { code: 'EUR', name: 'Euro',             symbol: '€',    decimals: 2 },
    { code: 'COP', name: 'Peso Colombiano',  symbol: 'COL$', decimals: 2 },
    { code: 'ARS', name: 'Peso Argentino',   symbol: 'AR$',  decimals: 2 },
    { code: 'BRL', name: 'Real Brasileño',   symbol: 'R$',   decimals: 2 },
    { code: 'GBP', name: 'Libra Esterlina',  symbol: '£',    decimals: 2 },
    { code: 'CAD', name: 'Dolar Canadiense', symbol: 'CA$',  decimals: 2 },
  ];

  const Currency = {
    list: DEFAULT_CURRENCIES.slice(),
    base: 'MXN',
    current: localStorage.getItem(STORAGE_KEY) || 'MXN',
    rates: {},
    ratesFetchedAt: 0,

    setCurrent(code) {
      code = String(code || 'MXN').toUpperCase();
      this.current = code;
      try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
      window.dispatchEvent(new CustomEvent('volvix:currency-changed', { detail: { code } }));
    },

    async loadCatalog() {
      try {
        const r = await fetch('/api/currencies');
        const j = await r.json();
        if (j && j.ok && Array.isArray(j.currencies) && j.currencies.length) {
          this.list = j.currencies;
        }
      } catch (_) { /* fallback a DEFAULT_CURRENCIES */ }
      return this.list;
    },

    async loadRates(base) {
      base = (base || this.base).toUpperCase();
      try {
        const raw = localStorage.getItem(FX_CACHE_KEY);
        if (raw) {
          const c = JSON.parse(raw);
          if (c && c.base === base && (Date.now() - c.ts) < FX_TTL_MS) {
            this.base = base; this.rates = c.rates; this.ratesFetchedAt = c.ts;
            return this.rates;
          }
        }
      } catch (_) {}
      try {
        const r = await fetch('/api/fx/rates?base=' + encodeURIComponent(base));
        const j = await r.json();
        if (j && j.ok) {
          const map = {};
          for (const row of (j.rates || [])) map[row.quote_code] = Number(row.rate);
          this.base = base; this.rates = map; this.ratesFetchedAt = Date.now();
          try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ base, rates: map, ts: Date.now() })); } catch (_) {}
        }
      } catch (_) {}
      return this.rates;
    },

    convert(amount, from, to) {
      from = (from || this.base).toUpperCase();
      to   = (to   || this.current).toUpperCase();
      if (from === to) return Number(amount);
      if (from === this.base && this.rates[to]) return Number(amount) * this.rates[to];
      if (to === this.base && this.rates[from]) return Number(amount) / this.rates[from];
      if (this.rates[from] && this.rates[to]) {
        const inBase = Number(amount) / this.rates[from];
        return inBase * this.rates[to];
      }
      return Number(amount);
    },

    fmt(amount, code) {
      code = String(code || this.current || 'MXN').toUpperCase();
      const meta = this.list.find(c => c.code === code) ||
                   DEFAULT_CURRENCIES.find(c => c.code === code) ||
                   { decimals: 2 };
      try {
        return new Intl.NumberFormat(navigator.language || 'es-MX', {
          style: 'currency',
          currency: code,
          minimumFractionDigits: meta.decimals,
          maximumFractionDigits: meta.decimals,
        }).format(Number(amount) || 0);
      } catch (_) {
        return (meta.symbol || '') + Number(amount || 0).toFixed(meta.decimals || 2);
      }
    },

    mountSelector(target) {
      const host = typeof target === 'string' ? document.querySelector(target) : target;
      if (!host) return null;
      const sel = document.createElement('select');
      sel.className = 'volvix-currency-select';
      sel.setAttribute('aria-label', 'Moneda');
      const render = () => {
        sel.innerHTML = '';
        for (const c of this.list) {
          const o = document.createElement('option');
          o.value = c.code;
          o.textContent = c.code + ' — ' + (c.symbol || '') + ' ' + (c.name || '');
          if (c.code === this.current) o.selected = true;
          sel.appendChild(o);
        }
      };
      render();
      sel.addEventListener('change', e => this.setCurrent(e.target.value));
      host.appendChild(sel);
      this.loadCatalog().then(render);
      return sel;
    },

    async init() {
      await this.loadCatalog();
      await this.loadRates(this.base);
    },
  };

  window.Volvix = window.Volvix || {};
  window.Volvix.Currency = Currency;
  window.Volvix.fmt = (amount, code) => Currency.fmt(amount, code);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Currency.init());
  } else {
    Currency.init();
  }
})();
