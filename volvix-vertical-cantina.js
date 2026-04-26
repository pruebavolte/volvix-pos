/**
 * volvix-vertical-cantina.js
 * Vertical POS para Cantinas / Pulquerías / Bares de barrio.
 *
 * Funciones clave:
 *  - Gestión de barras (barra principal, barra de pulques, terraza).
 *  - Mesas con estado (libre / ocupada / por cobrar / reservada).
 *  - Sistema de fichas / vales (cover, consumo mínimo, fichas para baño).
 *  - Antojitos / botana (curados, tlacoyos, sopes, chicharrón, etc.).
 *  - Control estricto de edad (Ley Seca / verificación de INE).
 *  - Horarios de venta de alcohol y modo "ley seca" temporal.
 *  - Tab abierto por mesa con consumo mínimo y propina sugerida.
 *
 * API: window.CantinaAPI
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Catálogo base
  // ─────────────────────────────────────────────────────────────
  const BARRAS = [
    { id: 'BAR-PRINC', nombre: 'Barra Principal', capacidad: 12, tipo: 'mixta' },
    { id: 'BAR-PULQ',  nombre: 'Barra de Pulques', capacidad: 8,  tipo: 'pulque' },
    { id: 'BAR-TERR',  nombre: 'Terraza',          capacidad: 20, tipo: 'mixta' },
  ];

  const CATALOGO = {
    pulques: [
      { sku: 'PUL-NAT',  nombre: 'Pulque Natural 1L',     precio: 70,  edadMin: 18, alcohol: true  },
      { sku: 'PUL-AVN',  nombre: 'Curado de Avena 1L',    precio: 90,  edadMin: 18, alcohol: true  },
      { sku: 'PUL-FRE',  nombre: 'Curado de Fresa 1L',    precio: 95,  edadMin: 18, alcohol: true  },
      { sku: 'PUL-APIO', nombre: 'Curado de Apio 1L',     precio: 95,  edadMin: 18, alcohol: true  },
      { sku: 'PUL-NUEZ', nombre: 'Curado de Nuez 1L',     precio: 110, edadMin: 18, alcohol: true  },
    ],
    cervezas: [
      { sku: 'CER-CAG',  nombre: 'Caguama Victoria',      precio: 75,  edadMin: 18, alcohol: true  },
      { sku: 'CER-IND',  nombre: 'Indio 355ml',           precio: 35,  edadMin: 18, alcohol: true  },
      { sku: 'CER-MOD',  nombre: 'Modelo Especial',       precio: 40,  edadMin: 18, alcohol: true  },
      { sku: 'MICH',     nombre: 'Michelada Cubana',      precio: 65,  edadMin: 18, alcohol: true  },
    ],
    destilados: [
      { sku: 'MEZ-CAB',  nombre: 'Mezcal Caballito',      precio: 60,  edadMin: 18, alcohol: true  },
      { sku: 'TEQ-CAB',  nombre: 'Tequila Caballito',     precio: 55,  edadMin: 18, alcohol: true  },
      { sku: 'CHARRO',   nombre: 'Charrito (mezcal+sangrita)', precio: 80, edadMin: 18, alcohol: true },
    ],
    antojitos: [
      { sku: 'TLAC',     nombre: 'Tlacoyo de Frijol',     precio: 35,  edadMin: 0,  alcohol: false },
      { sku: 'SOPE',     nombre: 'Sope Surtido',          precio: 40,  edadMin: 0,  alcohol: false },
      { sku: 'CHICH',    nombre: 'Chicharrón en Salsa Verde', precio: 75, edadMin: 0, alcohol: false },
      { sku: 'QUESO',    nombre: 'Queso Fundido',         precio: 95,  edadMin: 0,  alcohol: false },
      { sku: 'CACAH',    nombre: 'Cacahuates Botana',     precio: 25,  edadMin: 0,  alcohol: false },
      { sku: 'CHALU',    nombre: 'Chalupas (3 pzas)',     precio: 55,  edadMin: 0,  alcohol: false },
    ],
    fichas: [
      { sku: 'FICHA-BANO',  nombre: 'Ficha Baño',         precio: 10,  edadMin: 0,  alcohol: false },
      { sku: 'COVER',       nombre: 'Cover Música Viva',  precio: 50,  edadMin: 0,  alcohol: false },
      { sku: 'VALE-50',     nombre: 'Vale Consumo $50',   precio: 50,  edadMin: 0,  alcohol: false },
    ],
  };

  // ─────────────────────────────────────────────────────────────
  // Estado en memoria
  // ─────────────────────────────────────────────────────────────
  const state = {
    mesas: {},        // mesaId -> { barra, estado, tab, abiertaEn, edadVerificada }
    tabsCerradas: [], // historial
    leySeca: false,   // si true, bloquea venta de alcohol
    horarioVenta: { inicio: 11, fin: 2 }, // 11:00 a 02:00 del día siguiente
    consumoMinimo: 80, // por persona
    propinaSugerida: 0.10,
  };

  // Inicializa mesas (10 mesas distribuidas)
  function _seedMesas() {
    const distrib = [
      ['M-01','BAR-PRINC'],['M-02','BAR-PRINC'],['M-03','BAR-PRINC'],['M-04','BAR-PRINC'],
      ['M-05','BAR-PULQ'], ['M-06','BAR-PULQ'], ['M-07','BAR-PULQ'],
      ['M-08','BAR-TERR'], ['M-09','BAR-TERR'], ['M-10','BAR-TERR'],
    ];
    distrib.forEach(([id, barra]) => {
      state.mesas[id] = {
        id, barra, estado: 'libre',
        tab: null, abiertaEn: null, edadVerificada: false, comensales: 0,
      };
    });
  }
  _seedMesas();

  // ─────────────────────────────────────────────────────────────
  // Utilidades internas
  // ─────────────────────────────────────────────────────────────
  function _findItem(sku) {
    for (const cat of Object.keys(CATALOGO)) {
      const it = CATALOGO[cat].find(p => p.sku === sku);
      if (it) return { ...it, categoria: cat };
    }
    return null;
  }

  function _enHorario() {
    const h = new Date().getHours();
    const { inicio, fin } = state.horarioVenta;
    if (inicio < fin) return h >= inicio && h < fin;
    return h >= inicio || h < fin; // cruza medianoche
  }

  function _calcEdad(fechaNacISO) {
    const n = new Date(fechaNacISO);
    if (isNaN(n)) return -1;
    const hoy = new Date();
    let e = hoy.getFullYear() - n.getFullYear();
    const m = hoy.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
    return e;
  }

  function _newTab(mesaId, comensales) {
    return {
      mesaId, comensales, items: [], abiertaEn: new Date().toISOString(),
      cover: false, descuento: 0,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────────────────────

  function abrirMesa(mesaId, comensales, ineVerificada) {
    const mesa = state.mesas[mesaId];
    if (!mesa) return { ok: false, error: 'Mesa inexistente' };
    if (mesa.estado !== 'libre') return { ok: false, error: 'Mesa no disponible' };
    if (!comensales || comensales < 1) return { ok: false, error: 'Comensales inválidos' };

    mesa.estado = 'ocupada';
    mesa.comensales = comensales;
    mesa.edadVerificada = !!ineVerificada;
    mesa.abiertaEn = new Date().toISOString();
    mesa.tab = _newTab(mesaId, comensales);
    return { ok: true, mesa };
  }

  function verificarEdadINE(mesaId, fechaNacISO) {
    const mesa = state.mesas[mesaId];
    if (!mesa) return { ok: false, error: 'Mesa inexistente' };
    const edad = _calcEdad(fechaNacISO);
    if (edad < 18) {
      mesa.edadVerificada = false;
      return { ok: false, edad, error: 'Menor de edad — alcohol bloqueado' };
    }
    mesa.edadVerificada = true;
    return { ok: true, edad };
  }

  function agregarItem(mesaId, sku, cantidad = 1) {
    const mesa = state.mesas[mesaId];
    if (!mesa || !mesa.tab) return { ok: false, error: 'Mesa sin tab abierta' };
    const item = _findItem(sku);
    if (!item) return { ok: false, error: 'SKU no existe' };

    if (item.alcohol) {
      if (state.leySeca) return { ok: false, error: 'LEY SECA activa — no se vende alcohol' };
      if (!_enHorario())  return { ok: false, error: 'Fuera de horario de venta de alcohol' };
      if (!mesa.edadVerificada) return { ok: false, error: 'INE no verificada en esta mesa' };
    }

    mesa.tab.items.push({ ...item, cantidad, ts: Date.now() });
    return { ok: true, item, total: _totalTab(mesa.tab) };
  }

  function quitarItem(mesaId, idx) {
    const mesa = state.mesas[mesaId];
    if (!mesa || !mesa.tab) return { ok: false, error: 'Mesa sin tab' };
    if (idx < 0 || idx >= mesa.tab.items.length) return { ok: false, error: 'Índice inválido' };
    const removed = mesa.tab.items.splice(idx, 1)[0];
    return { ok: true, removed };
  }

  function _totalTab(tab) {
    return tab.items.reduce((s, it) => s + it.precio * it.cantidad, 0);
  }

  function cobrarMesa(mesaId, opts = {}) {
    const mesa = state.mesas[mesaId];
    if (!mesa || !mesa.tab) return { ok: false, error: 'Mesa sin tab' };
    const tab = mesa.tab;
    const subtotal = _totalTab(tab);
    const minimo = state.consumoMinimo * tab.comensales;
    const ajusteMinimo = Math.max(0, minimo - subtotal);
    const baseConMinimo = subtotal + ajusteMinimo;
    const descuento = (opts.descuentoPct || 0) * baseConMinimo;
    const neto = baseConMinimo - descuento;
    const propina = (opts.propinaPct ?? state.propinaSugerida) * neto;
    const total = neto + propina;

    const ticket = {
      mesaId, barra: mesa.barra, comensales: tab.comensales,
      items: tab.items, subtotal, ajusteMinimo, descuento, propina, total,
      cerradaEn: new Date().toISOString(), metodo: opts.metodo || 'efectivo',
    };
    state.tabsCerradas.push(ticket);

    mesa.estado = 'libre';
    mesa.tab = null; mesa.abiertaEn = null;
    mesa.edadVerificada = false; mesa.comensales = 0;
    return { ok: true, ticket };
  }

  function venderFicha(sku, cantidad = 1) {
    const it = _findItem(sku);
    if (!it || it.categoria !== 'fichas') return { ok: false, error: 'No es una ficha válida' };
    return { ok: true, ticket: { sku, nombre: it.nombre, total: it.precio * cantidad, ts: Date.now() } };
  }

  function activarLeySeca(activa) { state.leySeca = !!activa; return { ok: true, leySeca: state.leySeca }; }

  function configurarHorario(inicio, fin) {
    if (inicio < 0 || inicio > 23 || fin < 0 || fin > 23) return { ok: false, error: 'Horas inválidas' };
    state.horarioVenta = { inicio, fin };
    return { ok: true, horario: state.horarioVenta };
  }

  function estadoBarras() {
    return BARRAS.map(b => {
      const mesas = Object.values(state.mesas).filter(m => m.barra === b.id);
      const ocupadas = mesas.filter(m => m.estado === 'ocupada').length;
      return { ...b, mesas: mesas.length, ocupadas, libres: mesas.length - ocupadas };
    });
  }

  function resumenDia() {
    const tickets = state.tabsCerradas;
    const ventas = tickets.reduce((s, t) => s + t.total, 0);
    const propinas = tickets.reduce((s, t) => s + t.propina, 0);
    const porBarra = {};
    tickets.forEach(t => { porBarra[t.barra] = (porBarra[t.barra] || 0) + t.total; });
    return { tickets: tickets.length, ventas, propinas, porBarra };
  }

  function listarMesas() { return Object.values(state.mesas); }
  function listarCatalogo() { return CATALOGO; }
  function verTab(mesaId) {
    const m = state.mesas[mesaId];
    if (!m || !m.tab) return null;
    return { ...m.tab, total: _totalTab(m.tab) };
  }

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────
  global.CantinaAPI = {
    abrirMesa, cobrarMesa, agregarItem, quitarItem, verTab,
    verificarEdadINE, venderFicha,
    activarLeySeca, configurarHorario,
    estadoBarras, resumenDia, listarMesas, listarCatalogo,
    _state: state, // debug
  };

  if (typeof console !== 'undefined') {
    console.log('[Volvix Cantina] CantinaAPI lista —', BARRAS.length, 'barras,', Object.keys(state.mesas).length, 'mesas');
  }
})(typeof window !== 'undefined' ? window : globalThis);
