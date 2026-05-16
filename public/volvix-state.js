/**
 * volvix-state.js — AGENTE 8 (ADR-001 Fase 1)
 * Source of truth único para products / customers / sales en el cliente.
 * Backward-compatible: ambos loaders (DataLoader interno + volvix-real-data-loader.js)
 * pueden seguir mutando CATALOG/PRODUCTS_REAL/SALES/CUSTOMERS — pero todos deben llamar
 * VolvixState.setProducts/setCustomers/setSales para que los listeners disparen.
 *
 * Fase 2 (futura): refactor consumers para leer de VolvixState en lugar de globals.
 * Fase 3 (futura): eliminar globals CATALOG/PRODUCTS_REAL/etc.
 */
(function () {
  'use strict';
  if (window.VolvixState) return; // idempotente

  var _data = { products: [], customers: [], sales: [] };
  var _listeners = { products: [], customers: [], sales: [] };
  var _lastUpdated = { products: 0, customers: 0, sales: 0 };

  function _emit(kind) {
    _lastUpdated[kind] = Date.now();
    var arr = _data[kind];
    _listeners[kind].forEach(function (fn) {
      try { fn(arr); } catch (e) { console.warn('[VolvixState] listener error', kind, e); }
    });
  }

  window.VolvixState = {
    setProducts: function (arr) { _data.products = Array.isArray(arr) ? arr.slice() : []; _emit('products'); },
    setCustomers: function (arr) { _data.customers = Array.isArray(arr) ? arr.slice() : []; _emit('customers'); },
    setSales: function (arr) { _data.sales = Array.isArray(arr) ? arr.slice() : []; _emit('sales'); },

    getProducts: function () { return _data.products; },
    getCustomers: function () { return _data.customers; },
    getSales: function () { return _data.sales; },

    onProductsChange: function (fn) { if (typeof fn === 'function') _listeners.products.push(fn); },
    onCustomersChange: function (fn) { if (typeof fn === 'function') _listeners.customers.push(fn); },
    onSalesChange: function (fn) { if (typeof fn === 'function') _listeners.sales.push(fn); },

    // Mutaciones puntuales (AGENTE 7: stock decrement post-venta)
    decrementProductStock: function (productCode, qty) {
      qty = Number(qty || 0);
      if (!productCode || qty <= 0) return false;
      var changed = false;
      _data.products = _data.products.map(function (p) {
        if (p && (p.code === productCode || p.id === productCode || p.barcode === productCode)) {
          var newStock = Math.max(0, Number(p.stock || 0) - qty);
          if (newStock !== Number(p.stock || 0)) {
            changed = true;
            return Object.assign({}, p, { stock: newStock });
          }
        }
        return p;
      });
      if (changed) _emit('products');
      return changed;
    },

    lastUpdated: function (kind) { return _lastUpdated[kind] || 0; },

    // Helper para debugging
    _dump: function () {
      return {
        products: _data.products.length,
        customers: _data.customers.length,
        sales: _data.sales.length,
        lastUpdated: _lastUpdated
      };
    }
  };

  console.log('[VolvixState] ready (AGENTE 8 / ADR-001 Fase 1)');
})();
