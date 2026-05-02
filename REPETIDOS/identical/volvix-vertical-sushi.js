/* volvix-vertical-sushi.js
 * Volvix POS - Vertical Sushi
 * Rolls combinados, sashimi, all-you-can-eat, pedidos especiales
 * API: window.SushiAPI
 */
(function (global) {
  'use strict';

  const IGV = 0.18;
  const AYCE_TIME_LIMIT_MIN = 90;
  const AYCE_PENALTY_PER_PIECE = 3.5;

  // ---------- Catálogo base ----------
  const ROLLS = [
    { id: 'r-cali',    nombre: 'California Roll',     piezas: 8,  precio: 24.0, tipo: 'clasico' },
    { id: 'r-phi',     nombre: 'Philadelphia Roll',   piezas: 8,  precio: 28.0, tipo: 'clasico' },
    { id: 'r-acev',    nombre: 'Acevichado Roll',     piezas: 10, precio: 32.0, tipo: 'fusion'  },
    { id: 'r-tempura', nombre: 'Tempura Roll',        piezas: 8,  precio: 30.0, tipo: 'frito'   },
    { id: 'r-dragon',  nombre: 'Dragon Roll',         piezas: 10, precio: 38.0, tipo: 'premium' },
    { id: 'r-rainbow', nombre: 'Rainbow Roll',        piezas: 10, precio: 42.0, tipo: 'premium' },
    { id: 'r-spicy',   nombre: 'Spicy Tuna Roll',     piezas: 8,  precio: 34.0, tipo: 'picante' },
    { id: 'r-salmon',  nombre: 'Salmon Skin Roll',    piezas: 8,  precio: 26.0, tipo: 'clasico' },
  ];

  const SASHIMI = [
    { id: 's-salmon', nombre: 'Sashimi Salmón',  piezas: 5, precio: 28.0 },
    { id: 's-atun',   nombre: 'Sashimi Atún',    piezas: 5, precio: 32.0 },
    { id: 's-pulpo',  nombre: 'Sashimi Pulpo',   piezas: 5, precio: 30.0 },
    { id: 's-mixto',  nombre: 'Sashimi Mixto',   piezas: 9, precio: 48.0 },
  ];

  const COMBOS = [
    { id: 'c-pareja',  nombre: 'Combo Pareja',    items: ['r-cali', 'r-phi', 's-salmon'],          precio: 75.0 },
    { id: 'c-familia', nombre: 'Combo Familia',   items: ['r-cali', 'r-phi', 'r-acev', 'r-tempura'], precio: 105.0 },
    { id: 'c-deluxe',  nombre: 'Combo Deluxe',    items: ['r-dragon', 'r-rainbow', 's-mixto'],     precio: 120.0 },
  ];

  const AYCE_PLAN = {
    id: 'ayce-std',
    nombre: 'All You Can Eat',
    precio_persona: 55.0,
    incluye: ['r-cali', 'r-phi', 'r-acev', 'r-tempura', 'r-salmon', 's-salmon'],
    tiempo_max_min: AYCE_TIME_LIMIT_MIN,
  };

  // ---------- Estado ----------
  const state = {
    pedidos: {},      // id -> pedido
    ayceMesas: {},    // mesaId -> sesion AYCE
    nextPedido: 1001,
  };

  // ---------- Utilidades ----------
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function findRoll(id)    { return ROLLS.find(r => r.id === id) || null; }
  function findSashimi(id) { return SASHIMI.find(s => s.id === id) || null; }
  function findCombo(id)   { return COMBOS.find(c => c.id === id) || null; }
  function findItem(id)    { return findRoll(id) || findSashimi(id) || findCombo(id); }

  function calcTotales(items) {
    const subtotal = items.reduce((acc, it) => acc + (it.precio * (it.cantidad || 1)), 0);
    const igv = +(subtotal * IGV).toFixed(2);
    const total = +(subtotal + igv).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), igv, total };
  }

  // ---------- Pedidos ----------
  function crearPedido(mesa, mozo) {
    const id = state.nextPedido++;
    const pedido = {
      id,
      mesa: mesa || 'barra',
      mozo: mozo || 'sin-asignar',
      items: [],
      especiales: [],
      estado: 'abierto',
      creado: new Date().toISOString(),
      totales: { subtotal: 0, igv: 0, total: 0 },
    };
    state.pedidos[id] = pedido;
    return pedido;
  }

  function agregarItem(pedidoId, itemId, cantidad) {
    const p = state.pedidos[pedidoId];
    if (!p) throw new Error('Pedido no existe: ' + pedidoId);
    if (p.estado !== 'abierto') throw new Error('Pedido cerrado');
    const base = findItem(itemId);
    if (!base) throw new Error('Item no existe: ' + itemId);
    const qty = Math.max(1, cantidad | 0);
    const existing = p.items.find(i => i.id === itemId && !i.especial);
    if (existing) {
      existing.cantidad += qty;
    } else {
      p.items.push({
        id: base.id,
        nombre: base.nombre,
        precio: base.precio,
        cantidad: qty,
        piezas: base.piezas || null,
      });
    }
    p.totales = calcTotales(p.items.concat(p.especiales));
    return p;
  }

  function quitarItem(pedidoId, itemId) {
    const p = state.pedidos[pedidoId];
    if (!p) throw new Error('Pedido no existe');
    p.items = p.items.filter(i => i.id !== itemId);
    p.totales = calcTotales(p.items.concat(p.especiales));
    return p;
  }

  // ---------- Pedidos especiales ----------
  function pedidoEspecial(pedidoId, descripcion, precio, instrucciones) {
    const p = state.pedidos[pedidoId];
    if (!p) throw new Error('Pedido no existe');
    if (!descripcion || precio == null) throw new Error('Faltan datos del especial');
    const esp = {
      id: uid('esp'),
      nombre: '[ESPECIAL] ' + descripcion,
      precio: +precio,
      cantidad: 1,
      instrucciones: instrucciones || '',
      especial: true,
    };
    p.especiales.push(esp);
    p.totales = calcTotales(p.items.concat(p.especiales));
    return esp;
  }

  // ---------- All You Can Eat ----------
  function abrirAYCE(mesaId, personas) {
    if (!mesaId) throw new Error('Mesa requerida');
    if (state.ayceMesas[mesaId] && state.ayceMesas[mesaId].estado === 'activa') {
      throw new Error('Mesa ya tiene sesion AYCE activa');
    }
    const sesion = {
      id: uid('ayce'),
      mesa: mesaId,
      personas: Math.max(1, personas | 0),
      inicio: Date.now(),
      fin: null,
      consumo: [],          // {itemId, cantidad, ts}
      desperdicio: 0,       // piezas no consumidas
      estado: 'activa',
      plan: AYCE_PLAN,
    };
    state.ayceMesas[mesaId] = sesion;
    return sesion;
  }

  function consumoAYCE(mesaId, itemId, cantidad) {
    const s = state.ayceMesas[mesaId];
    if (!s || s.estado !== 'activa') throw new Error('No hay AYCE activo');
    if (!AYCE_PLAN.incluye.includes(itemId)) {
      throw new Error('Item no incluido en AYCE: ' + itemId);
    }
    const min = (Date.now() - s.inicio) / 60000;
    if (min > AYCE_PLAN.tiempo_max_min) {
      throw new Error('Tiempo AYCE excedido');
    }
    s.consumo.push({ itemId, cantidad: cantidad | 0 || 1, ts: Date.now() });
    return s;
  }

  function reportarDesperdicio(mesaId, piezas) {
    const s = state.ayceMesas[mesaId];
    if (!s) throw new Error('No hay sesion');
    s.desperdicio += Math.max(0, piezas | 0);
    return s;
  }

  function cerrarAYCE(mesaId) {
    const s = state.ayceMesas[mesaId];
    if (!s) throw new Error('No hay sesion');
    s.fin = Date.now();
    s.estado = 'cerrada';
    const subtotalBase = s.personas * AYCE_PLAN.precio_persona;
    const penalidad = +(s.desperdicio * AYCE_PENALTY_PER_PIECE).toFixed(2);
    const subtotal = +(subtotalBase + penalidad).toFixed(2);
    const igv = +(subtotal * IGV).toFixed(2);
    const total = +(subtotal + igv).toFixed(2);
    s.totales = { subtotalBase, penalidad, subtotal, igv, total };
    s.duracionMin = +(((s.fin - s.inicio) / 60000)).toFixed(1);
    return s;
  }

  // ---------- Cierre de pedido ----------
  function cerrarPedido(pedidoId, metodoPago) {
    const p = state.pedidos[pedidoId];
    if (!p) throw new Error('Pedido no existe');
    if (p.estado !== 'abierto') throw new Error('Ya cerrado');
    p.estado = 'cerrado';
    p.cerrado = new Date().toISOString();
    p.metodoPago = metodoPago || 'efectivo';
    p.totales = calcTotales(p.items.concat(p.especiales));
    return p;
  }

  function listarPedidos(filtro) {
    const arr = Object.values(state.pedidos);
    if (!filtro) return arr;
    return arr.filter(p => {
      if (filtro.estado && p.estado !== filtro.estado) return false;
      if (filtro.mesa && p.mesa !== filtro.mesa) return false;
      return true;
    });
  }

  // ---------- Reportes ----------
  function topRolls() {
    const cuenta = {};
    Object.values(state.pedidos).forEach(p => {
      p.items.forEach(it => {
        if (findRoll(it.id)) {
          cuenta[it.id] = (cuenta[it.id] || 0) + (it.cantidad || 1);
        }
      });
    });
    return Object.entries(cuenta)
      .map(([id, qty]) => ({ id, nombre: findRoll(id).nombre, qty }))
      .sort((a, b) => b.qty - a.qty);
  }

  function resumenDia() {
    const cerrados = listarPedidos({ estado: 'cerrado' });
    const ventas = cerrados.reduce((acc, p) => acc + p.totales.total, 0);
    const ayceCerradas = Object.values(state.ayceMesas).filter(s => s.estado === 'cerrada');
    const ventasAYCE = ayceCerradas.reduce((acc, s) => acc + (s.totales ? s.totales.total : 0), 0);
    return {
      pedidos: cerrados.length,
      ventas: +ventas.toFixed(2),
      ayceSesiones: ayceCerradas.length,
      ventasAYCE: +ventasAYCE.toFixed(2),
      total: +(ventas + ventasAYCE).toFixed(2),
    };
  }

  // ---------- API pública ----------
  global.SushiAPI = {
    // catalogo
    rolls: () => ROLLS.slice(),
    sashimi: () => SASHIMI.slice(),
    combos: () => COMBOS.slice(),
    aycePlan: () => Object.assign({}, AYCE_PLAN),
    // pedidos
    crearPedido,
    agregarItem,
    quitarItem,
    pedidoEspecial,
    cerrarPedido,
    listarPedidos,
    obtenerPedido: (id) => state.pedidos[id] || null,
    // ayce
    abrirAYCE,
    consumoAYCE,
    reportarDesperdicio,
    cerrarAYCE,
    obtenerAYCE: (mesa) => state.ayceMesas[mesa] || null,
    // reportes
    topRolls,
    resumenDia,
    // utilidades
    calcTotales,
    constantes: { IGV, AYCE_TIME_LIMIT_MIN, AYCE_PENALTY_PER_PIECE },
  };

})(typeof window !== 'undefined' ? window : globalThis);
