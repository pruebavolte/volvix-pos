/**
 * VOLVIX VERTICAL - VINATERIA
 * Punto de Venta especializado para vinaterias, licorerias y tiendas de bebidas alcoholicas.
 *
 * Caracteristicas:
 *  - Control estricto de edad (validacion de mayoria de edad: 18+).
 *  - Horarios legales de venta de alcohol (ley seca, domingos, festivos, eventos especiales).
 *  - Calculo automatico de IEPS (Impuesto Especial sobre Produccion y Servicios) por categoria.
 *  - Precios de mayoreo automaticos por volumen (cajas, botellas, garrafas).
 *  - Registro de venta restringida con motivo si se override.
 *  - Limites por cliente (anti-revendedor).
 *  - Integracion con Volvix POS Core via window.VolvixCore.
 *
 * Expone: window.VinateriaAPI
 *
 * (c) 2026 Grupo Volvix - Todos los derechos reservados.
 */

(function (global) {
  'use strict';

  // ============================================================
  // 1. CONFIGURACION DEL VERTICAL
  // ============================================================

  const CONFIG = {
    edadMinima: 18,
    moneda: 'MXN',

    // Tasas IEPS Mexico 2026 segun graduacion alcoholica (LIEPS art. 2-I-A)
    ieps: {
      cerveza:        0.265, // hasta 14 GL
      vino:           0.265, // hasta 14 GL
      licorBajo:      0.30,  // 14 a 20 GL (vinos generosos, licores suaves)
      destilado:      0.53,  // mas de 20 GL (tequila, ron, whisky, vodka, ginebra, mezcal)
      bebidaEnergetica: 0.25
    },

    iva: 0.16,

    // Horarios legales de venta (24h). Configurable por sucursal.
    horarioVenta: {
      lunes:     { abre: '09:00', cierra: '23:00' },
      martes:    { abre: '09:00', cierra: '23:00' },
      miercoles: { abre: '09:00', cierra: '23:00' },
      jueves:    { abre: '09:00', cierra: '23:00' },
      viernes:   { abre: '09:00', cierra: '00:00' }, // 12am
      sabado:    { abre: '09:00', cierra: '00:00' },
      domingo:   { abre: '12:00', cierra: '17:00' }  // restringido
    },

    // Fechas de ley seca (formato YYYY-MM-DD). Se actualizan por jornada electoral.
    leySeca: [
      // '2026-06-07', // ejemplo: jornada electoral
    ],

    // Mayoreo: descuento aplicado automaticamente segun cantidad
    mayoreo: [
      { minUnidades: 6,  descuento: 0.05 },  // media caja
      { minUnidades: 12, descuento: 0.08 },  // caja
      { minUnidades: 24, descuento: 0.12 },  // dos cajas
      { minUnidades: 60, descuento: 0.18 }   // mayorista
    ],

    // Limite anti-revendedor por ticket (en unidades por categoria)
    limitesPorTicket: {
      destilado: 24,
      cerveza:   120,
      vino:      48
    },

    // Manager PIN para autorizar overrides (en produccion: hash + backend)
    pinSupervisor: '7777'
  };

  // ============================================================
  // 2. CATALOGO DE CATEGORIAS Y MAPEO IEPS
  // ============================================================

  const CATEGORIAS = {
    CERVEZA:           { iepsKey: 'cerveza',          requiereEdad: true,  graduacion: 'baja' },
    VINO_TINTO:        { iepsKey: 'vino',             requiereEdad: true,  graduacion: 'media' },
    VINO_BLANCO:       { iepsKey: 'vino',             requiereEdad: true,  graduacion: 'media' },
    VINO_ESPUMOSO:     { iepsKey: 'vino',             requiereEdad: true,  graduacion: 'media' },
    LICOR_SUAVE:       { iepsKey: 'licorBajo',        requiereEdad: true,  graduacion: 'media' },
    TEQUILA:           { iepsKey: 'destilado',        requiereEdad: true,  graduacion: 'alta' },
    MEZCAL:            { iepsKey: 'destilado',        requiereEdad: true,  graduacion: 'alta' },
    WHISKY:            { iepsKey: 'destilado',        requiereEdad: true,  graduacion: 'alta' },
    RON:               { iepsKey: 'destilado',        requiereEdad: true,  graduacion: 'alta' },
    VODKA:             { iepsKey: 'destilado',        requiereEdad: true,  graduacion: 'alta' },
    GINEBRA:           { iepsKey: 'destilado',        requiereEdad: true,  graduacion: 'alta' },
    BEBIDA_ENERGETICA: { iepsKey: 'bebidaEnergetica', requiereEdad: false, graduacion: 'cero' },
    REFRESCO:          { iepsKey: null,               requiereEdad: false, graduacion: 'cero' },
    BOTANA:            { iepsKey: null,               requiereEdad: false, graduacion: 'cero' }
  };

  // ============================================================
  // 3. UTILIDADES INTERNAS
  // ============================================================

  function _hoyDiaSemana() {
    const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    return dias[new Date().getDay()];
  }

  function _hhmmAhora() {
    const d = new Date();
    return d.toTimeString().slice(0, 5);
  }

  function _fechaHoyISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function _enRangoHora(actual, abre, cierra) {
    // Soporta cierre despues de medianoche ('00:00' significa 24:00)
    if (cierra === '00:00') return actual >= abre;
    return actual >= abre && actual <= cierra;
  }

  function _logAuditoria(evento, payload) {
    const entry = {
      ts: new Date().toISOString(),
      evento,
      payload
    };
    if (global.VolvixCore && typeof global.VolvixCore.audit === 'function') {
      global.VolvixCore.audit(entry);
    } else {
      // Fallback: localStorage
      try {
        const key = 'vinateria_audit';
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        arr.push(entry);
        localStorage.setItem(key, JSON.stringify(arr.slice(-500)));
      } catch (e) { /* ignore */ }
    }
  }

  // ============================================================
  // 4. VALIDACION DE EDAD
  // ============================================================

  function validarEdad(fechaNacimiento) {
    if (!fechaNacimiento) return { ok: false, motivo: 'fecha_nacimiento_requerida' };
    const fn = new Date(fechaNacimiento);
    if (isNaN(fn.getTime())) return { ok: false, motivo: 'fecha_invalida' };
    const hoy = new Date();
    let edad = hoy.getFullYear() - fn.getFullYear();
    const m = hoy.getMonth() - fn.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--;
    if (edad < CONFIG.edadMinima) {
      _logAuditoria('edad_rechazada', { edad, fechaNacimiento });
      return { ok: false, edad, motivo: 'menor_de_edad' };
    }
    return { ok: true, edad };
  }

  // ============================================================
  // 5. VALIDACION DE HORARIO LEGAL
  // ============================================================

  function puedeVenderAhora() {
    const fecha = _fechaHoyISO();
    if (CONFIG.leySeca.includes(fecha)) {
      return { ok: false, motivo: 'ley_seca', fecha };
    }
    const dia = _hoyDiaSemana();
    const horario = CONFIG.horarioVenta[dia];
    if (!horario) return { ok: false, motivo: 'sin_horario_definido' };
    const ahora = _hhmmAhora();
    if (!_enRangoHora(ahora, horario.abre, horario.cierra)) {
      return { ok: false, motivo: 'fuera_de_horario', dia, horario, ahora };
    }
    return { ok: true, dia, horario, ahora };
  }

  // ============================================================
  // 6. CALCULO DE IEPS
  // ============================================================

  function calcularIEPS(producto) {
    const cat = CATEGORIAS[producto.categoria];
    if (!cat || !cat.iepsKey) return 0;
    const tasa = CONFIG.ieps[cat.iepsKey] || 0;
    const base = (producto.precioBase || 0) * (producto.cantidad || 1);
    return +(base * tasa).toFixed(2);
  }

  // ============================================================
  // 7. PRECIO DE MAYOREO
  // ============================================================

  function calcularDescuentoMayoreo(cantidad) {
    let desc = 0;
    for (const tramo of CONFIG.mayoreo) {
      if (cantidad >= tramo.minUnidades && tramo.descuento > desc) {
        desc = tramo.descuento;
      }
    }
    return desc;
  }

  function calcularLineaProducto(producto) {
    const cat = CATEGORIAS[producto.categoria];
    if (!cat) throw new Error('categoria_desconocida: ' + producto.categoria);

    const cantidad   = producto.cantidad || 1;
    const precioBase = producto.precioBase || 0;
    const subtotal   = precioBase * cantidad;

    const descMayoreoPct = calcularDescuentoMayoreo(cantidad);
    const descMayoreo    = +(subtotal * descMayoreoPct).toFixed(2);
    const baseDespDesc   = subtotal - descMayoreo;

    const ieps = cat.iepsKey ? +(baseDespDesc * CONFIG.ieps[cat.iepsKey]).toFixed(2) : 0;
    const iva  = +((baseDespDesc + ieps) * CONFIG.iva).toFixed(2);
    const total = +(baseDespDesc + ieps + iva).toFixed(2);

    return {
      sku: producto.sku,
      nombre: producto.nombre,
      categoria: producto.categoria,
      cantidad,
      precioBase,
      subtotal: +subtotal.toFixed(2),
      descMayoreoPct,
      descMayoreo,
      ieps,
      iva,
      total
    };
  }

  // ============================================================
  // 8. VALIDACION DE LIMITES ANTI-REVENDEDOR
  // ============================================================

  function validarLimites(carrito) {
    const acumulado = {};
    for (const item of carrito) {
      const cat = CATEGORIAS[item.categoria];
      if (!cat) continue;
      const key = cat.iepsKey;
      if (!key) continue;
      acumulado[key] = (acumulado[key] || 0) + (item.cantidad || 0);
    }
    for (const [key, total] of Object.entries(acumulado)) {
      const limite = CONFIG.limitesPorTicket[key];
      if (limite && total > limite) {
        return { ok: false, motivo: 'limite_excedido', categoria: key, total, limite };
      }
    }
    return { ok: true };
  }

  // ============================================================
  // 9. PROCESAMIENTO DE VENTA COMPLETA
  // ============================================================

  function procesarVenta(payload) {
    // payload: { carrito: [...], cliente: {fechaNacimiento}, override: {pin, motivo} }
    const carrito = payload.carrito || [];
    const cliente = payload.cliente || {};
    const override = payload.override || null;

    // 9.1 Hay alcohol?
    const tieneAlcohol = carrito.some(it => {
      const c = CATEGORIAS[it.categoria];
      return c && c.requiereEdad;
    });

    // 9.2 Horario
    const horario = puedeVenderAhora();
    if (tieneAlcohol && !horario.ok) {
      if (!(override && override.pin === CONFIG.pinSupervisor)) {
        _logAuditoria('venta_rechazada_horario', horario);
        return { ok: false, motivo: 'horario', detalle: horario };
      }
      _logAuditoria('override_horario', { motivo: override.motivo });
    }

    // 9.3 Edad
    if (tieneAlcohol) {
      const edad = validarEdad(cliente.fechaNacimiento);
      if (!edad.ok) {
        _logAuditoria('venta_rechazada_edad', edad);
        return { ok: false, motivo: 'edad', detalle: edad };
      }
    }

    // 9.4 Limites
    const lim = validarLimites(carrito);
    if (!lim.ok) {
      if (!(override && override.pin === CONFIG.pinSupervisor)) {
        _logAuditoria('venta_rechazada_limite', lim);
        return { ok: false, motivo: 'limite', detalle: lim };
      }
      _logAuditoria('override_limite', { motivo: override.motivo, lim });
    }

    // 9.5 Calculo
    const lineas = carrito.map(calcularLineaProducto);
    const totales = lineas.reduce((acc, l) => {
      acc.subtotal     += l.subtotal;
      acc.descMayoreo  += l.descMayoreo;
      acc.ieps         += l.ieps;
      acc.iva          += l.iva;
      acc.total        += l.total;
      return acc;
    }, { subtotal: 0, descMayoreo: 0, ieps: 0, iva: 0, total: 0 });

    Object.keys(totales).forEach(k => totales[k] = +totales[k].toFixed(2));

    const ticket = {
      id: 'VIN-' + Date.now(),
      ts: new Date().toISOString(),
      lineas,
      totales,
      cliente: cliente.fechaNacimiento ? { verificado: true } : null,
      tieneAlcohol
    };

    _logAuditoria('venta_aprobada', { id: ticket.id, total: totales.total });
    return { ok: true, ticket };
  }

  // ============================================================
  // 10. EXPORTACION DE LA API
  // ============================================================

  const VinateriaAPI = {
    version: '1.0.0',
    vertical: 'vinateria',
    config: CONFIG,
    categorias: CATEGORIAS,

    // Validaciones
    validarEdad,
    puedeVenderAhora,
    validarLimites,

    // Calculos
    calcularIEPS,
    calcularDescuentoMayoreo,
    calcularLineaProducto,

    // Venta
    procesarVenta,

    // Configuracion en runtime
    setLeySeca(fechas) {
      if (Array.isArray(fechas)) CONFIG.leySeca = fechas.slice();
      _logAuditoria('config_leySeca', { fechas: CONFIG.leySeca });
    },
    setHorario(dia, abre, cierra) {
      if (CONFIG.horarioVenta[dia]) {
        CONFIG.horarioVenta[dia] = { abre, cierra };
        _logAuditoria('config_horario', { dia, abre, cierra });
      }
    },
    setPinSupervisor(pin) {
      CONFIG.pinSupervisor = String(pin);
    },

    // Diagnostico
    estado() {
      return {
        version: this.version,
        horario: puedeVenderAhora(),
        leySecaConfigurada: CONFIG.leySeca.length,
        categoriasSoportadas: Object.keys(CATEGORIAS).length
      };
    }
  };

  // Registrar en window y opcionalmente en VolvixCore
  global.VinateriaAPI = VinateriaAPI;
  if (global.VolvixCore && typeof global.VolvixCore.registerVertical === 'function') {
    global.VolvixCore.registerVertical('vinateria', VinateriaAPI);
  }

  if (typeof console !== 'undefined') {
    console.log('[Volvix] Vertical Vinateria cargado v' + VinateriaAPI.version);
  }

})(typeof window !== 'undefined' ? window : globalThis);
