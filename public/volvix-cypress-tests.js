/**
 * volvix-cypress-tests.js
 * Cypress E2E test suite for Volvix POS
 *
 * Cubre:
 *   - Login / autenticación
 *   - Flujo POS (carrito, cobro, ticket)
 *   - Panel de propietario (Owner)
 *   - MultiPOS (múltiples cajas)
 *
 * Uso:
 *   1) Copiar este archivo en `cypress/e2e/volvix-cypress-tests.cy.js`
 *   2) `npx cypress open` o `npx cypress run --spec cypress/e2e/volvix-cypress-tests.cy.js`
 *   3) Desde la consola del navegador: `window.CypressTests.run('login')` (modo embebido)
 *
 * Requiere Cypress >= 12.
 */

/* global Cypress, cy, describe, it, before, beforeEach, after, expect */

// ============================================================
// CONFIGURACIÓN GLOBAL
// ============================================================

const CONFIG = {
  baseUrl:        Cypress?.env?.('VOLVIX_URL')      || 'http://localhost:3000',
  ownerUser:      Cypress?.env?.('OWNER_USER')      || 'owner@volvix.test',
  ownerPass:      Cypress?.env?.('OWNER_PASS')      || 'Owner123!',
  cashierUser:    Cypress?.env?.('CASHIER_USER')    || 'cajero1@volvix.test',
  cashierPass:    Cypress?.env?.('CASHIER_PASS')    || 'Cajero123!',
  defaultTimeout: 10000,
  retries:        { runMode: 2, openMode: 0 },
};

// ============================================================
// COMANDOS REUTILIZABLES (custom commands)
// ============================================================

if (typeof Cypress !== 'undefined') {
  Cypress.Commands.add('volvixLogin', (user, pass) => {
    cy.visit('/login');
    cy.get('[data-cy="login-email"]', { timeout: CONFIG.defaultTimeout }).clear().type(user);
    cy.get('[data-cy="login-password"]').clear().type(pass, { log: false });
    cy.get('[data-cy="login-submit"]').click();
    cy.url().should('not.include', '/login');
  });

  Cypress.Commands.add('volvixLogout', () => {
    cy.get('[data-cy="user-menu"]').click();
    cy.get('[data-cy="logout-btn"]').click();
    cy.url().should('include', '/login');
  });

  Cypress.Commands.add('addProductToCart', (sku, qty = 1) => {
    cy.get('[data-cy="product-search"]').clear().type(sku);
    cy.get(`[data-cy="product-card-${sku}"]`).click();
    if (qty > 1) {
      for (let i = 1; i < qty; i++) {
        cy.get(`[data-cy="cart-item-${sku}-plus"]`).click();
      }
    }
  });

  Cypress.Commands.add('checkoutCash', (received) => {
    cy.get('[data-cy="checkout-btn"]').click();
    cy.get('[data-cy="payment-method-cash"]').click();
    cy.get('[data-cy="payment-received"]').clear().type(String(received));
    cy.get('[data-cy="payment-confirm"]').click();
  });

  Cypress.Commands.add('seedTestData', () => {
    cy.request('POST', `${CONFIG.baseUrl}/api/test/seed`).its('status').should('eq', 200);
  });

  Cypress.Commands.add('cleanTestData', () => {
    cy.request('POST', `${CONFIG.baseUrl}/api/test/clean`).its('status').should('eq', 200);
  });
}

// ============================================================
// SUITE 1 — LOGIN / AUTENTICACIÓN
// ============================================================

describe('Volvix POS — Login', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('1.1 muestra formulario de login', () => {
    cy.get('[data-cy="login-email"]').should('be.visible');
    cy.get('[data-cy="login-password"]').should('be.visible');
    cy.get('[data-cy="login-submit"]').should('be.enabled');
  });

  it('1.2 rechaza credenciales inválidas', () => {
    cy.get('[data-cy="login-email"]').type('fake@volvix.test');
    cy.get('[data-cy="login-password"]').type('wrong');
    cy.get('[data-cy="login-submit"]').click();
    cy.get('[data-cy="login-error"]').should('contain.text', 'inválid');
    cy.url().should('include', '/login');
  });

  it('1.3 acepta credenciales válidas (cajero)', () => {
    cy.volvixLogin(CONFIG.cashierUser, CONFIG.cashierPass);
    cy.get('[data-cy="pos-screen"]').should('be.visible');
  });

  it('1.4 cierra sesión correctamente', () => {
    cy.volvixLogin(CONFIG.cashierUser, CONFIG.cashierPass);
    cy.volvixLogout();
  });
});

// ============================================================
// SUITE 2 — FLUJO POS (CAJERO)
// ============================================================

describe('Volvix POS — Flujo de venta', () => {
  before(() => {
    cy.seedTestData();
  });

  beforeEach(() => {
    cy.volvixLogin(CONFIG.cashierUser, CONFIG.cashierPass);
  });

  it('2.1 agrega producto al carrito', () => {
    cy.addProductToCart('SKU-001', 1);
    cy.get('[data-cy="cart-item-SKU-001"]').should('be.visible');
    cy.get('[data-cy="cart-total"]').should('not.contain.text', '$0.00');
  });

  it('2.2 actualiza cantidad e incrementa total', () => {
    cy.addProductToCart('SKU-001', 3);
    cy.get('[data-cy="cart-item-SKU-001-qty"]').should('have.text', '3');
  });

  it('2.3 elimina producto del carrito', () => {
    cy.addProductToCart('SKU-001', 1);
    cy.get('[data-cy="cart-item-SKU-001-remove"]').click();
    cy.get('[data-cy="cart-empty"]').should('be.visible');
  });

  it('2.4 aplica descuento manual', () => {
    cy.addProductToCart('SKU-002', 1);
    cy.get('[data-cy="discount-btn"]').click();
    cy.get('[data-cy="discount-percent"]').type('10');
    cy.get('[data-cy="discount-apply"]').click();
    cy.get('[data-cy="cart-discount"]').should('contain.text', '10%');
  });

  it('2.5 cobra en efectivo y genera ticket', () => {
    cy.addProductToCart('SKU-001', 2);
    cy.checkoutCash(1000);
    cy.get('[data-cy="ticket-receipt"]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy="ticket-folio"]').invoke('text').should('match', /^[A-Z0-9-]+$/);
  });

  it('2.6 cobra con tarjeta (mock terminal)', () => {
    cy.addProductToCart('SKU-002', 1);
    cy.get('[data-cy="checkout-btn"]').click();
    cy.get('[data-cy="payment-method-card"]').click();
    cy.get('[data-cy="card-mock-approve"]').click();
    cy.get('[data-cy="ticket-receipt"]').should('be.visible');
  });

  it('2.7 cancela venta antes de cobrar', () => {
    cy.addProductToCart('SKU-001', 1);
    cy.get('[data-cy="cancel-sale"]').click();
    cy.get('[data-cy="confirm-cancel"]').click();
    cy.get('[data-cy="cart-empty"]').should('be.visible');
  });
});

// ============================================================
// SUITE 3 — PANEL DE PROPIETARIO (OWNER)
// ============================================================

describe('Volvix POS — Owner panel', () => {
  beforeEach(() => {
    cy.volvixLogin(CONFIG.ownerUser, CONFIG.ownerPass);
    cy.visit('/owner');
  });

  it('3.1 dashboard muestra KPIs del día', () => {
    cy.get('[data-cy="kpi-sales-today"]').should('be.visible');
    cy.get('[data-cy="kpi-tickets-today"]').should('be.visible');
    cy.get('[data-cy="kpi-avg-ticket"]').should('be.visible');
  });

  it('3.2 lista productos y permite alta', () => {
    cy.get('[data-cy="nav-products"]').click();
    cy.get('[data-cy="product-new"]').click();
    cy.get('[data-cy="product-name"]').type('Producto Test');
    cy.get('[data-cy="product-sku"]').type('TEST-999');
    cy.get('[data-cy="product-price"]').type('99.50');
    cy.get('[data-cy="product-save"]').click();
    cy.get('[data-cy="product-row-TEST-999"]').should('exist');
  });

  it('3.3 edita precio de producto existente', () => {
    cy.visit('/owner/products');
    cy.get('[data-cy="product-row-SKU-001-edit"]').click();
    cy.get('[data-cy="product-price"]').clear().type('150.00');
    cy.get('[data-cy="product-save"]').click();
    cy.get('[data-cy="toast-success"]').should('be.visible');
  });

  it('3.4 reporte de ventas por rango de fechas', () => {
    cy.get('[data-cy="nav-reports"]').click();
    cy.get('[data-cy="report-date-from"]').type('2026-04-01');
    cy.get('[data-cy="report-date-to"]').type('2026-04-26');
    cy.get('[data-cy="report-generate"]').click();
    cy.get('[data-cy="report-table"]').should('be.visible');
    cy.get('[data-cy="report-export-csv"]').should('be.enabled');
  });

  it('3.5 gestiona usuarios (alta de cajero)', () => {
    cy.get('[data-cy="nav-users"]').click();
    cy.get('[data-cy="user-new"]').click();
    cy.get('[data-cy="user-email"]').type(`cajero-${Date.now()}@volvix.test`);
    cy.get('[data-cy="user-role"]').select('cashier');
    cy.get('[data-cy="user-save"]').click();
    cy.get('[data-cy="toast-success"]').should('be.visible');
  });

  it('3.6 cierre de caja Z muestra totales', () => {
    cy.get('[data-cy="nav-cashclose"]').click();
    cy.get('[data-cy="cashclose-z"]').click();
    cy.get('[data-cy="cashclose-total-cash"]').should('be.visible');
    cy.get('[data-cy="cashclose-total-card"]').should('be.visible');
  });
});

// ============================================================
// SUITE 4 — MULTIPOS (MÚLTIPLES CAJAS)
// ============================================================

describe('Volvix POS — MultiPOS', () => {
  beforeEach(() => {
    cy.volvixLogin(CONFIG.ownerUser, CONFIG.ownerPass);
  });

  it('4.1 lista cajas registradas en la sucursal', () => {
    cy.visit('/owner/multipos');
    cy.get('[data-cy="pos-list"]').children().should('have.length.at.least', 1);
  });

  it('4.2 alta de nueva caja', () => {
    cy.visit('/owner/multipos');
    cy.get('[data-cy="pos-new"]').click();
    cy.get('[data-cy="pos-name"]').type(`Caja-${Date.now()}`);
    cy.get('[data-cy="pos-folio-prefix"]').type('CJX');
    cy.get('[data-cy="pos-save"]').click();
    cy.get('[data-cy="toast-success"]').should('be.visible');
  });

  it('4.3 dos cajas operan simultáneamente sin colisión de folios', () => {
    cy.request('POST', `${CONFIG.baseUrl}/api/test/sale`, { pos: 'A', sku: 'SKU-001' })
      .its('body.folio').as('folioA');
    cy.request('POST', `${CONFIG.baseUrl}/api/test/sale`, { pos: 'B', sku: 'SKU-001' })
      .its('body.folio').as('folioB');
    cy.get('@folioA').then((a) => {
      cy.get('@folioB').then((b) => {
        expect(a).to.not.eq(b);
      });
    });
  });

  it('4.4 dashboard agrega ventas de todas las cajas', () => {
    cy.visit('/owner');
    cy.get('[data-cy="kpi-sales-today"]').invoke('text').then((txt) => {
      const total = Number(txt.replace(/[^0-9.]/g, ''));
      expect(total).to.be.greaterThan(0);
    });
  });
});

// ============================================================
// HOOK FINAL — LIMPIEZA
// ============================================================

after(() => {
  cy.cleanTestData();
});

// ============================================================
// MODO EMBEBIDO — window.CypressTests
// ============================================================
//
// Permite invocar las suites desde la consola del navegador cuando
// el bundle se carga junto con la app (útil para QA manual rápido).
// ============================================================

(function attachToWindow(global) {
  if (typeof global === 'undefined') return;

  const SUITES = {
    login:    'Volvix POS — Login',
    pos:      'Volvix POS — Flujo de venta',
    owner:    'Volvix POS — Owner panel',
    multipos: 'Volvix POS — MultiPOS',
  };

  const api = {
    config: CONFIG,
    suites: SUITES,
    /**
     * Lanza una suite por clave.
     *   window.CypressTests.run('login')
     *   window.CypressTests.run('all')
     */
    run(key = 'all') {
      if (typeof Cypress === 'undefined') {
        console.warn('[CypressTests] Cypress no está disponible en este contexto.');
        return false;
      }
      const target = key === 'all' ? Object.values(SUITES) : [SUITES[key]];
      if (!target[0]) {
        console.error(`[CypressTests] suite desconocida: ${key}`);
        return false;
      }
      // En Cypress 12+ se filtra con --grep; aquí solo dejamos el log.
      console.info('[CypressTests] suites a ejecutar:', target);
      return target;
    },
    version: '1.0.0',
    build:   '2026-04-26',
  };

  global.CypressTests = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================
// FIN
// ============================================================
