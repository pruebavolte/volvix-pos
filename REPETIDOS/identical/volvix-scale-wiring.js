/**
 * volvix-scale-wiring.js
 * Volvix POS — Báscula (Scale) Integration Module
 * Agent-52 R9
 *
 * Provee integración con básculas digitales vía Web Serial API,
 * con fallback a modo mock para desarrollo. Soporta productos por peso,
 * conversión de unidades (kg, g, lb, oz), tara, y se integra con
 * el carrito (cart) global del POS.
 *
 * API pública: window.ScaleAPI
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────────────────────────
  // Configuración por defecto
  // ───────────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
    protocol: 'generic',     // 'generic' | 'toledo' | 'cas' | 'ohaus'
    pollIntervalMs: 250,
    stableThresholdGrams: 2, // tolerancia para considerar peso estable
    stableSamples: 4,        // muestras consecutivas para "estable"
    mockEnabled: !('serial' in (global.navigator || {})),
    autoTareOnZero: true,
    minWeightGrams: 5,
  };

  // Factores de conversión a gramos (unidad base interna)
  const UNIT_FACTORS = {
    g:  1,
    kg: 1000,
    lb: 453.59237,
    oz: 28.349523125,
    mg: 0.001,
  };

  // ───────────────────────────────────────────────────────────────
  // Estado interno
  // ───────────────────────────────────────────────────────────────
  const state = {
    config: { ...DEFAULT_CONFIG },
    port: null,
    reader: null,
    writer: null,
    connected: false,
    mockMode: false,
    mockTimer: null,
    mockBaseGrams: 0,
    tareGrams: 0,
    lastRawGrams: 0,
    lastNetGrams: 0,
    stableBuffer: [],
    isStable: false,
    listeners: { reading: [], stable: [], status: [], error: [] },
    currentProduct: null, // producto por peso seleccionado
  };

  // ───────────────────────────────────────────────────────────────
  // Utilidades de conversión
  // ───────────────────────────────────────────────────────────────
  function toGrams(value, unit) {
    const f = UNIT_FACTORS[unit];
    if (f === undefined) throw new Error('Unidad desconocida: ' + unit);
    return value * f;
  }

  function fromGrams(grams, unit) {
    const f = UNIT_FACTORS[unit];
    if (f === undefined) throw new Error('Unidad desconocida: ' + unit);
    return grams / f;
  }

  function convert(value, fromUnit, toUnit) {
    return fromGrams(toGrams(value, fromUnit), toUnit);
  }

  function formatWeight(grams, unit, decimals) {
    const v = fromGrams(grams, unit || 'kg');
    const d = decimals != null ? decimals : (unit === 'g' || unit === 'mg' ? 0 : 3);
    return v.toFixed(d) + ' ' + (unit || 'kg');
  }

  // ───────────────────────────────────────────────────────────────
  // Eventos
  // ───────────────────────────────────────────────────────────────
  function on(event, cb) {
    if (!state.listeners[event]) state.listeners[event] = [];
    state.listeners[event].push(cb);
    return () => off(event, cb);
  }

  function off(event, cb) {
    const arr = state.listeners[event];
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  }

  function emit(event, payload) {
    const arr = state.listeners[event] || [];
    for (const cb of arr) {
      try { cb(payload); } catch (e) { console.error('[ScaleAPI] listener error:', e); }
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Parsers de protocolo
  // ───────────────────────────────────────────────────────────────
  function parseGeneric(line) {
    // Formatos comunes: "ST,GS,+0.235kg" / "  0.235 kg" / "12.34 lb"
    const m = String(line).match(/([+-]?\d+(?:\.\d+)?)\s*(kg|g|lb|oz|mg)?/i);
    if (!m) return null;
    const val = parseFloat(m[1]);
    const unit = (m[2] || 'kg').toLowerCase();
    return { grams: toGrams(val, unit), raw: line };
  }

  function parseToledo(line) {
    // Toledo continuous: <STX>SWA<peso 6 dígitos><tara 6 dígitos><CR>
    const m = String(line).match(/(\d{6})/);
    if (!m) return null;
    const grams = parseInt(m[1], 10) / 10; // décimas de gramo
    return { grams, raw: line };
  }

  function parse(line) {
    switch (state.config.protocol) {
      case 'toledo': return parseToledo(line);
      case 'cas':
      case 'ohaus':
      case 'generic':
      default:       return parseGeneric(line);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Web Serial: conexión real
  // ───────────────────────────────────────────────────────────────
  async function connect(opts) {
    state.config = { ...state.config, ...(opts || {}) };

    if (state.config.mockMode || !('serial' in navigator)) {
      return startMock();
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate:    state.config.baudRate,
        dataBits:    state.config.dataBits,
        stopBits:    state.config.stopBits,
        parity:      state.config.parity,
        flowControl: state.config.flowControl,
      });
      state.port = port;
      state.connected = true;
      state.mockMode = false;
      emit('status', { connected: true, mock: false });
      readLoop();
      return { ok: true, mock: false };
    } catch (err) {
      emit('error', { where: 'connect', error: err.message });
      // fallback a mock si el usuario cancela
      return startMock();
    }
  }

  async function readLoop() {
    if (!state.port) return;
    const decoder = new TextDecoderStream();
    state.port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    state.reader = reader;
    let buf = '';
    try {
      while (state.connected) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let idx;
        while ((idx = buf.search(/[\r\n]/)) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line) handleRaw(line);
        }
      }
    } catch (err) {
      emit('error', { where: 'readLoop', error: err.message });
    }
  }

  async function disconnect() {
    state.connected = false;
    stopMock();
    try { if (state.reader) await state.reader.cancel(); } catch (_) {}
    try { if (state.port)   await state.port.close();    } catch (_) {}
    state.reader = null;
    state.port = null;
    emit('status', { connected: false });
  }

  // ───────────────────────────────────────────────────────────────
  // Mock mode (desarrollo / sin hardware)
  // ───────────────────────────────────────────────────────────────
  function startMock() {
    stopMock();
    state.mockMode = true;
    state.connected = true;
    state.mockBaseGrams = 0;
    emit('status', { connected: true, mock: true });
    state.mockTimer = setInterval(() => {
      // simular ligero ruido alrededor del peso base
      const noise = (Math.random() - 0.5) * 1.5;
      const grams = Math.max(0, state.mockBaseGrams + noise);
      handleRaw('ST,GS,+' + (grams / 1000).toFixed(3) + 'kg');
    }, state.config.pollIntervalMs);
    return { ok: true, mock: true };
  }

  function stopMock() {
    if (state.mockTimer) { clearInterval(state.mockTimer); state.mockTimer = null; }
    state.mockMode = false;
  }

  function mockSetWeight(value, unit) {
    state.mockBaseGrams = toGrams(value, unit || 'g');
  }

  // ───────────────────────────────────────────────────────────────
  // Procesamiento de lecturas
  // ───────────────────────────────────────────────────────────────
  function handleRaw(line) {
    const parsed = parse(line);
    if (!parsed) return;
    const raw = parsed.grams;
    const net = Math.max(0, raw - state.tareGrams);
    state.lastRawGrams = raw;
    state.lastNetGrams = net;

    // detección de estabilidad
    state.stableBuffer.push(net);
    if (state.stableBuffer.length > state.config.stableSamples) state.stableBuffer.shift();
    const wasStable = state.isStable;
    state.isStable = isStableBuffer();

    const reading = {
      grams: net,
      rawGrams: raw,
      tareGrams: state.tareGrams,
      stable: state.isStable,
      kg: net / 1000,
      lb: fromGrams(net, 'lb'),
      oz: fromGrams(net, 'oz'),
      timestamp: Date.now(),
    };

    emit('reading', reading);
    if (state.isStable && !wasStable && net >= state.config.minWeightGrams) {
      emit('stable', reading);
    }
  }

  function isStableBuffer() {
    if (state.stableBuffer.length < state.config.stableSamples) return false;
    const min = Math.min(...state.stableBuffer);
    const max = Math.max(...state.stableBuffer);
    return (max - min) <= state.config.stableThresholdGrams;
  }

  // ───────────────────────────────────────────────────────────────
  // Tara / cero
  // ───────────────────────────────────────────────────────────────
  function tare() {
    state.tareGrams = state.lastRawGrams;
    state.stableBuffer = [];
    emit('status', { tareGrams: state.tareGrams, action: 'tare' });
    return state.tareGrams;
  }

  function zero() {
    state.tareGrams = 0;
    state.stableBuffer = [];
    emit('status', { tareGrams: 0, action: 'zero' });
  }

  function getReading() {
    return {
      grams: state.lastNetGrams,
      rawGrams: state.lastRawGrams,
      tareGrams: state.tareGrams,
      stable: state.isStable,
      kg: state.lastNetGrams / 1000,
      lb: fromGrams(state.lastNetGrams, 'lb'),
    };
  }

  // ───────────────────────────────────────────────────────────────
  // Productos por peso + integración con cart
  // ───────────────────────────────────────────────────────────────
  /**
   * product = {
   *   id, name,
   *   pricePerUnit: number,    // ej. 89.50
   *   priceUnit: 'kg'|'g'|'lb' // unidad de venta
   * }
   */
  function selectProduct(product) {
    if (!product || product.pricePerUnit == null || !product.priceUnit) {
      throw new Error('Producto inválido para báscula');
    }
    state.currentProduct = product;
    emit('status', { action: 'product-selected', product });
  }

  function clearProduct() {
    state.currentProduct = null;
  }

  function calculatePrice(product, grams) {
    if (!product) return 0;
    const qtyInPriceUnit = fromGrams(grams, product.priceUnit);
    return Math.round(qtyInPriceUnit * product.pricePerUnit * 100) / 100;
  }

  /**
   * Agrega el peso actual al carrito como línea.
   * Busca window.cart.addItem (estándar Volvix POS).
   */
  function addToCart(opts) {
    opts = opts || {};
    const product = opts.product || state.currentProduct;
    if (!product) throw new Error('No hay producto por peso seleccionado');

    const grams = opts.grams != null ? opts.grams : state.lastNetGrams;
    if (grams < state.config.minWeightGrams) {
      throw new Error('Peso insuficiente (< ' + state.config.minWeightGrams + ' g)');
    }

    const price = calculatePrice(product, grams);
    const qty = fromGrams(grams, product.priceUnit);

    const line = {
      id: product.id,
      name: product.name,
      quantity: Number(qty.toFixed(3)),
      unit: product.priceUnit,
      pricePerUnit: product.pricePerUnit,
      total: price,
      weighted: true,
      grams,
      timestamp: Date.now(),
    };

    const cart = global.cart || global.Cart || global.VolvixCart;
    if (cart && typeof cart.addItem === 'function') {
      cart.addItem(line);
    } else if (cart && typeof cart.add === 'function') {
      cart.add(line);
    } else {
      // fallback: evento global para que el POS lo capture
      const ev = new CustomEvent('volvix:cart:add', { detail: line });
      global.dispatchEvent(ev);
    }

    emit('status', { action: 'added-to-cart', line });
    return line;
  }

  /**
   * Espera a que el peso se estabilice y agrega al carrito automáticamente.
   * Devuelve una Promise.
   */
  function waitStableAndAdd(opts, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        off('stable', handler);
        reject(new Error('Timeout esperando peso estable'));
      }, timeoutMs);
      const handler = (reading) => {
        clearTimeout(t);
        off('stable', handler);
        try {
          const line = addToCart({ ...(opts || {}), grams: reading.grams });
          resolve(line);
        } catch (e) { reject(e); }
      };
      on('stable', handler);
    });
  }

  // ───────────────────────────────────────────────────────────────
  // API pública
  // ───────────────────────────────────────────────────────────────
  const ScaleAPI = {
    // conexión
    connect,
    disconnect,
    isConnected: () => state.connected,
    isMock:      () => state.mockMode,

    // mock controls
    mock: {
      setWeight: mockSetWeight,
      enable: () => { state.config.mockEnabled = true; return startMock(); },
      stop: stopMock,
    },

    // lectura
    getReading,
    tare,
    zero,

    // productos & cart
    selectProduct,
    clearProduct,
    calculatePrice,
    addToCart,
    waitStableAndAdd,

    // utilidades
    convert,
    toGrams,
    fromGrams,
    formatWeight,
    UNIT_FACTORS: { ...UNIT_FACTORS },

    // eventos
    on, off,

    // config
    configure: (opts) => { state.config = { ...state.config, ...(opts || {}) }; },
    getConfig: () => ({ ...state.config }),

    // versión
    version: '1.0.0',
    agent: 'Agent-52 R9',
  };

  global.ScaleAPI = ScaleAPI;

  // Auto-init si el host lo solicita
  if (global.VOLVIX_SCALE_AUTOSTART) {
    ScaleAPI.connect().catch((e) => console.warn('[ScaleAPI] autostart:', e));
  }

})(typeof window !== 'undefined' ? window : globalThis);
