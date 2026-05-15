/* ============================================================
   VOLVIX · Cobro Modal v1 — State + Actions + Validators
   ============================================================
   Se carga con: <script src="/volvix-cobro-state.js"></script>
   (antes del </body> de salvadorex-pos.html)

   Responsabilidades:
   - Modelo de datos para el modal de cobro (state)
   - Acciones puras estilo reducer (mutan el state recibido)
   - Validadores (RFC, CP, email, WhatsApp, tarjeta)
   - Catálogos SAT (regímenes, usos CFDI, formas de pago)
   - Formatters de moneda / teléfono
   - Cliente API para /api/cobro y /api/fx/banxico

   Stack: JS vanilla puro. NO React, NO TypeScript, NO frameworks.

   Expone:
     window.VolvixCobro.createState(initialTicket)
     window.VolvixCobro.actions.*
     window.VolvixCobro.validators.*
     window.VolvixCobro.satCatalogs.*
     window.VolvixCobro.formatters.*
     window.VolvixCobro.api.*
============================================================ */
(function () {
  'use strict';

  // =========================================================
  // UTILIDADES INTERNAS
  // =========================================================

  /** Redondeo seguro a 2 decimales evitando errores de coma flotante. */
  function round2(n) {
    if (!isFinite(n)) return 0;
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  /** Genera un UUID v4. Fallback si crypto.randomUUID no existe. */
  function uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback básico (solo si runtime no soporta randomUUID)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Suma segura de montos. */
  function sumAmounts(arr) {
    var total = 0;
    for (var i = 0; i < arr.length; i++) {
      total += Number(arr[i]) || 0;
    }
    return round2(total);
  }

  // =========================================================
  // 1. STATE — createState(initialTicket)
  // =========================================================

  /**
   * Crea el state inicial del modal de cobro.
   * @param {Object} initialTicket — { ticketId, subtotal, customerId?, customer? }
   * @returns {Object} state con getters computados
   */
  function createState(initialTicket) {
    initialTicket = initialTicket || {};

    var state = {
      ticketId: initialTicket.ticketId || null,
      customerId: initialTicket.customerId || null,
      customer: initialTicket.customer || null,
      subtotal: round2(initialTicket.subtotal || 0),
      discount: {
        amount: 0,
        reason: '',
        authorizedBy: null,
      },
      tip: {
        amount: 0,
        percent: null,
      },
      rounding: {
        amount: 0,
        destination: null, // 'DONATION' | 'TIP' | null
      },
      payments: [], // [{ id, method, amount, details }]
      cfdi: null,   // null | { rfc, razonSocial, codigoPostal, regimenFiscal, usoCfdi, formaPago, metodoPago }
      delivery: {
        method: 'PRINT', // 'PRINT' | 'EMAIL' | 'WHATSAPP' | 'NONE'
        target: null,
      },
      notes: '',

      // ----- Getters computados -----

      /** Total a cobrar: subtotal - discount + tip + rounding */
      getTotal: function () {
        var total = state.subtotal
          - (Number(state.discount.amount) || 0)
          + (Number(state.tip.amount) || 0)
          + (Number(state.rounding.amount) || 0);
        return round2(Math.max(0, total));
      },

      /** Suma de pagos registrados */
      getPaid: function () {
        return sumAmounts(state.payments.map(function (p) { return p.amount; }));
      },

      /** Cuánto falta cobrar (>= 0) */
      getMissing: function () {
        var miss = state.getTotal() - state.getPaid();
        return round2(Math.max(0, miss));
      },

      /** Cambio a devolver (>= 0). Solo aplica si hay efectivo. */
      getChange: function () {
        var hasCash = state.payments.some(function (p) { return p.method === 'EFECTIVO'; });
        if (!hasCash) return 0;
        var change = state.getPaid() - state.getTotal();
        return round2(Math.max(0, change));
      },

      /** ¿Se puede completar el cobro? */
      getCanComplete: function () {
        if (state.payments.length === 0) return false;
        if (state.getTotal() <= 0) return false;
        return state.getPaid() >= state.getTotal() - 0.005; // tolerancia de medio centavo
      },
    };

    return state;
  }

  // =========================================================
  // 2. ACTIONS — métodos puros estilo reducer
  // =========================================================

  var actions = {
    /**
     * Agrega un pago al state. Si es EFECTIVO y ya existe, SUMA al existente.
     * @param {Object} state
     * @param {string} method — uno de los payment_method_type del enum
     * @param {number} amount
     * @param {Object} [details] — {cardLast4, cardBrand, authCode, terminalId, bankOrigin, reference, valeProvider, valeFolio, usdAmount, usdRate, ...}
     * @returns {Object} state mutado
     */
    addPayment: function (state, method, amount, details) {
      amount = round2(amount);
      if (!method || amount <= 0) return state;

      if (method === 'EFECTIVO') {
        // Consolidar efectivo en una sola fila
        var existing = state.payments.find(function (p) { return p.method === 'EFECTIVO'; });
        if (existing) {
          existing.amount = round2(existing.amount + amount);
          if (details) existing.details = Object.assign({}, existing.details || {}, details);
          return state;
        }
      }

      state.payments.push({
        id: uuid(),
        method: method,
        amount: amount,
        details: details || {},
      });
      return state;
    },

    /**
     * Modifica un pago existente por id.
     * @param {Object} state
     * @param {string} id
     * @param {Object} patch — { method?, amount?, details? }
     */
    updatePayment: function (state, id, patch) {
      var row = state.payments.find(function (p) { return p.id === id; });
      if (!row || !patch) return state;
      if (typeof patch.method === 'string') row.method = patch.method;
      if (patch.amount != null) row.amount = round2(patch.amount);
      if (patch.details) row.details = Object.assign({}, row.details || {}, patch.details);
      return state;
    },

    /**
     * Elimina un pago por id.
     */
    removePayment: function (state, id) {
      state.payments = state.payments.filter(function (p) { return p.id !== id; });
      return state;
    },

    /**
     * Fija propina como porcentaje del subtotal.
     * @param {number} percent — 0, 10, 15, 20, etc.
     */
    setTipPercent: function (state, percent) {
      var p = Number(percent) || 0;
      if (p < 0) p = 0;
      if (p > 100) p = 100;
      state.tip.percent = p;
      state.tip.amount = round2(state.subtotal * (p / 100));
      return state;
    },

    /**
     * Fija propina como monto custom. Limpia el porcentaje.
     */
    setTipAmount: function (state, amount) {
      var a = round2(Math.max(0, Number(amount) || 0));
      state.tip.amount = a;
      state.tip.percent = null;
      return state;
    },

    /**
     * Aplica descuento. Si excede 50% del subtotal, requiere authorizedBy.
     * @param {Object} state
     * @param {number} amount
     * @param {string} reason
     * @param {string|null} [authorizedBy] — user_id del autorizador
     * @throws {Error} si la validación falla
     */
    setDiscount: function (state, amount, reason, authorizedBy) {
      var a = round2(Number(amount) || 0);
      if (a < 0) throw new Error('El descuento no puede ser negativo');
      if (a === 0) {
        state.discount = { amount: 0, reason: '', authorizedBy: null };
        return state;
      }
      if (a > state.subtotal) {
        throw new Error('El descuento no puede ser mayor al subtotal');
      }
      var maxFree = state.subtotal * 0.5;
      if (a > maxFree && !authorizedBy) {
        throw new Error('Descuentos mayores al 50% requieren autorización del gerente');
      }
      state.discount = {
        amount: a,
        reason: reason || '',
        authorizedBy: authorizedBy || null,
      };
      return state;
    },

    /**
     * Fija redondeo (típicamente para donación o propina).
     * @param {number} amount
     * @param {string} destination — 'DONATION' | 'TIP' | null
     */
    setRounding: function (state, amount, destination) {
      var a = round2(Math.max(0, Number(amount) || 0));
      state.rounding = {
        amount: a,
        destination: a > 0 ? (destination || null) : null,
      };
      return state;
    },

    /**
     * Setea cliente. Si tiene RFC, autopopula sección CFDI.
     */
    setCustomer: function (state, customer) {
      if (!customer) {
        state.customerId = null;
        state.customer = null;
        return state;
      }
      state.customerId = customer.id || null;
      state.customer = customer;

      if (customer.rfc && validators.isValidRFC(customer.rfc)) {
        state.cfdi = {
          rfc: customer.rfc.toUpperCase(),
          razonSocial: customer.razon_social || customer.razonSocial || customer.name || '',
          codigoPostal: customer.codigo_postal || customer.codigoPostal || '',
          regimenFiscal: customer.regimen_fiscal || customer.regimenFiscal || '',
          usoCfdi: customer.uso_cfdi_default || customer.usoCfdi || 'G03',
          formaPago: state.cfdi && state.cfdi.formaPago ? state.cfdi.formaPago : '99',
          metodoPago: state.cfdi && state.cfdi.metodoPago ? state.cfdi.metodoPago : 'PUE',
        };
      }
      return state;
    },

    /**
     * Setea o limpia datos de CFDI.
     * @param {Object|null} data
     */
    setCFDI: function (state, data) {
      if (data === null) {
        state.cfdi = null;
        return state;
      }
      state.cfdi = {
        rfc: (data.rfc || '').toUpperCase(),
        razonSocial: data.razonSocial || '',
        codigoPostal: data.codigoPostal || '',
        regimenFiscal: data.regimenFiscal || '',
        usoCfdi: data.usoCfdi || 'G03',
        formaPago: data.formaPago || '99',
        metodoPago: data.metodoPago || 'PUE',
      };
      return state;
    },

    /**
     * Setea método y destino de entrega del ticket.
     * @param {string} method — 'PRINT' | 'EMAIL' | 'WHATSAPP' | 'NONE'
     * @param {string|null} target — email, teléfono E.164, o null
     * @throws {Error} si el target no es válido para el método
     */
    setDelivery: function (state, method, target) {
      method = method || 'PRINT';
      var valid = ['PRINT', 'EMAIL', 'WHATSAPP', 'NONE'];
      if (valid.indexOf(method) < 0) {
        throw new Error('Método de entrega inválido: ' + method);
      }
      if (method === 'EMAIL') {
        if (!target || !validators.isValidEmail(target)) {
          throw new Error('Email inválido para entrega');
        }
      } else if (method === 'WHATSAPP') {
        if (!target || !validators.isValidWhatsApp(target)) {
          throw new Error('Número de WhatsApp inválido (debe ser +52 + 10 dígitos)');
        }
      }
      state.delivery = {
        method: method,
        target: (method === 'PRINT' || method === 'NONE') ? null : target,
      };
      return state;
    },

    /**
     * Setea notas/comentario libre del cobro.
     */
    setNotes: function (state, text) {
      state.notes = String(text || '').slice(0, 500); // hard limit 500 chars
      return state;
    },
  };

  // =========================================================
  // 3. VALIDATORS
  // =========================================================

  var validators = {
    /**
     * Valida un RFC mexicano (PF: 13 chars, PM: 12 chars).
     * Acepta genéricos XAXX010101000 (nacional) y XEXX010101000 (extranjero).
     */
    isValidRFC: function (rfc) {
      if (!rfc || typeof rfc !== 'string') return false;
      var r = rfc.trim().toUpperCase();
      if (r === 'XAXX010101000' || r === 'XEXX010101000') return true;
      return /^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/.test(r);
    },

    /** Código Postal mexicano: exactamente 5 dígitos. */
    isValidCP: function (cp) {
      if (!cp) return false;
      return /^\d{5}$/.test(String(cp).trim());
    },

    /** Email — regex estándar (RFC 5322 simplificado). */
    isValidEmail: function (email) {
      if (!email || typeof email !== 'string') return false;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    },

    /**
     * WhatsApp E.164 México: +52 + 10 dígitos.
     * Acepta con o sin espacios; también acepta "521" (formato móvil WhatsApp).
     */
    isValidWhatsApp: function (phone) {
      if (!phone || typeof phone !== 'string') return false;
      var clean = phone.replace(/[\s\-()]/g, '');
      // +52 + 10 dígitos  ó  +521 + 10 dígitos (WhatsApp mobile prefix)
      return /^\+521?\d{10}$/.test(clean);
    },

    /**
     * Detecta la marca de la tarjeta a partir del BIN o los últimos 4.
     * Heurística por primer dígito (suficiente para UI; el procesador da la verdad).
     * @param {string} bin — primeros 4-6 dígitos o solo last4 (menos preciso)
     * @returns {string|null} "VISA" | "MASTERCARD" | "AMEX" | "CARNET" | null
     */
    getCardBrand: function (bin) {
      if (!bin) return null;
      var s = String(bin).replace(/\D/g, '');
      if (s.length === 0) return null;

      // Por BIN (primeros dígitos) — más confiable
      if (/^4/.test(s)) return 'VISA';
      if (/^5[1-5]/.test(s)) return 'MASTERCARD';
      if (/^2(2[2-9]|[3-6]|7[01]|720)/.test(s)) return 'MASTERCARD';
      if (/^3[47]/.test(s)) return 'AMEX';
      if (/^(5078|6275|6550)/.test(s)) return 'CARNET'; // BINs comunes Carnet MX

      // Fallback por primer dígito (solo last4)
      if (s.length <= 4) {
        var first = s.charAt(0);
        if (first === '4') return 'VISA';
        if (first === '5') return 'MASTERCARD';
        if (first === '3') return 'AMEX';
        if (first === '6') return 'CARNET';
      }
      return null;
    },
  };

  // =========================================================
  // 4. SAT CATALOGS
  // =========================================================

  var satCatalogs = {
    /**
     * Top 12 regímenes fiscales SAT (c_RegimenFiscal).
     * persona: 'F' = Física, 'M' = Moral, 'FM' = ambas.
     */
    regimenes: [
      { codigo: '601', nombre: 'General de Ley Personas Morales', persona: 'M' },
      { codigo: '603', nombre: 'Personas Morales con Fines no Lucrativos', persona: 'M' },
      { codigo: '605', nombre: 'Sueldos y Salarios e Ingresos Asimilados', persona: 'F' },
      { codigo: '606', nombre: 'Arrendamiento', persona: 'F' },
      { codigo: '608', nombre: 'Demás ingresos', persona: 'F' },
      { codigo: '612', nombre: 'Personas Físicas con Actividades Empresariales y Profesionales', persona: 'F' },
      { codigo: '614', nombre: 'Ingresos por intereses', persona: 'F' },
      { codigo: '616', nombre: 'Sin obligaciones fiscales', persona: 'F' },
      { codigo: '621', nombre: 'Incorporación Fiscal', persona: 'F' },
      { codigo: '625', nombre: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', persona: 'F' },
      { codigo: '626', nombre: 'Régimen Simplificado de Confianza (RESICO PF)', persona: 'F' },
      { codigo: '620', nombre: 'Sociedades Cooperativas de Producción', persona: 'M' },
    ],

    /**
     * Top 15 usos CFDI (c_UsoCFDI).
     * personas: array con qué tipos de personas pueden usarlo ('F'=Física, 'M'=Moral).
     */
    usosCfdi: [
      { codigo: 'G01', nombre: 'Adquisición de mercancías', personas: ['F', 'M'] },
      { codigo: 'G02', nombre: 'Devoluciones, descuentos o bonificaciones', personas: ['F', 'M'] },
      { codigo: 'G03', nombre: 'Gastos en general', personas: ['F', 'M'] },
      { codigo: 'I01', nombre: 'Construcciones', personas: ['F', 'M'] },
      { codigo: 'I02', nombre: 'Mobiliario y equipo de oficina por inversiones', personas: ['F', 'M'] },
      { codigo: 'I03', nombre: 'Equipo de transporte', personas: ['F', 'M'] },
      { codigo: 'I04', nombre: 'Equipo de cómputo y accesorios', personas: ['F', 'M'] },
      { codigo: 'I08', nombre: 'Otra maquinaria y equipo', personas: ['F', 'M'] },
      { codigo: 'D01', nombre: 'Honorarios médicos, dentales y gastos hospitalarios', personas: ['F'] },
      { codigo: 'D02', nombre: 'Gastos médicos por incapacidad o discapacidad', personas: ['F'] },
      { codigo: 'D03', nombre: 'Gastos funerales', personas: ['F'] },
      { codigo: 'D04', nombre: 'Donativos', personas: ['F'] },
      { codigo: 'D10', nombre: 'Pagos por servicios educativos (colegiaturas)', personas: ['F'] },
      { codigo: 'CP01', nombre: 'Pagos', personas: ['F', 'M'] },
      { codigo: 'S01', nombre: 'Sin efectos fiscales', personas: ['F', 'M'] },
    ],

    /**
     * Formas de pago SAT (c_FormaPago).
     */
    formasPago: [
      { codigo: '01', nombre: 'Efectivo' },
      { codigo: '02', nombre: 'Cheque nominativo' },
      { codigo: '03', nombre: 'Transferencia electrónica de fondos (SPEI)' },
      { codigo: '04', nombre: 'Tarjeta de crédito' },
      { codigo: '05', nombre: 'Monedero electrónico' },
      { codigo: '06', nombre: 'Dinero electrónico' },
      { codigo: '08', nombre: 'Vales de despensa' },
      { codigo: '12', nombre: 'Dación en pago' },
      { codigo: '13', nombre: 'Pago por subrogación' },
      { codigo: '14', nombre: 'Pago por consignación' },
      { codigo: '15', nombre: 'Condonación' },
      { codigo: '17', nombre: 'Compensación' },
      { codigo: '23', nombre: 'Novación' },
      { codigo: '24', nombre: 'Confusión' },
      { codigo: '25', nombre: 'Remisión de deuda' },
      { codigo: '26', nombre: 'Prescripción o caducidad' },
      { codigo: '27', nombre: 'A satisfacción del acreedor' },
      { codigo: '28', nombre: 'Tarjeta de débito' },
      { codigo: '29', nombre: 'Tarjeta de servicios' },
      { codigo: '30', nombre: 'Aplicación de anticipos' },
      { codigo: '31', nombre: 'Intermediario pagos' },
      { codigo: '99', nombre: 'Por definir' },
    ],

    /**
     * Mapea un payment_method_type (enum interno) → código c_FormaPago SAT.
     * @param {string} method
     * @returns {string} código SAT (default '99')
     */
    mapMethodToFormaPago: function (method) {
      var map = {
        EFECTIVO: '01',
        CHEQUE: '02',
        SPEI: '03',
        TRANSFERENCIA_INTL: '03',
        TARJETA_CREDITO: '04',
        CODI: '05',
        MONEDERO_ELECTRONICO: '05',
        MERCADO_PAGO: '06',
        VALE_DESPENSA: '08',
        VALE_RESTAURANTE: '08',
        TARJETA_DEBITO: '28',
        CLIP: '04', // Clip procesa principalmente tarjetas; el ticket real refleja crédito/débito
        USD_EFECTIVO: '01',
        CREDITO_CLIENTE: '99',
        MIXTO: '99',
        OTRO: '99',
      };
      return map[method] || '99';
    },
  };

  // =========================================================
  // 5. FORMATTERS
  // =========================================================

  var formatters = {
    /**
     * Formatea un número como moneda. Default MXN.
     * @param {number} num
     * @param {string} [currency='MXN']
     */
    formatCurrency: function (num, currency) {
      currency = currency || 'MXN';
      var n = Number(num);
      if (!isFinite(n)) n = 0;
      try {
        return new Intl.NumberFormat('es-MX', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
      } catch (e) {
        // Fallback básico
        var sign = n < 0 ? '-' : '';
        var abs = Math.abs(n).toFixed(2);
        var parts = abs.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return sign + '$' + parts.join('.');
      }
    },

    /**
     * Parsea string monetario → número.
     * Quita $, comas, espacios, símbolos de moneda.
     */
    parseCurrency: function (str) {
      if (typeof str === 'number') return round2(str);
      if (!str) return 0;
      var clean = String(str).replace(/[^\d.\-]/g, '');
      var n = parseFloat(clean);
      return isNaN(n) ? 0 : round2(n);
    },

    /**
     * Formatea un número telefónico mexicano a "+52 55 1234 5678".
     * Acepta "5512345678", "+525512345678", "+52 55 1234 5678", etc.
     */
    formatPhone: function (phone) {
      if (!phone) return '';
      var clean = String(phone).replace(/\D/g, '');
      // Si viene sin lada país, asumimos México (52)
      if (clean.length === 10) clean = '52' + clean;
      // Si trae el "1" móvil de WhatsApp (521), lo conservamos pero formateamos igual
      if (clean.length === 13 && clean.substring(0, 3) === '521') {
        return '+52 1 ' + clean.substring(3, 5) + ' ' + clean.substring(5, 9) + ' ' + clean.substring(9, 13);
      }
      if (clean.length === 12 && clean.substring(0, 2) === '52') {
        return '+52 ' + clean.substring(2, 4) + ' ' + clean.substring(4, 8) + ' ' + clean.substring(8, 12);
      }
      // Otro país o longitud rara: devolver con + por delante
      return '+' + clean;
    },
  };

  // =========================================================
  // 6. API CLIENT
  // =========================================================

  var FX_CACHE_KEY = 'volvix:fx:usd-mxn';
  var FX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

  function getSessionToken() {
    try {
      var raw = localStorage.getItem('volvix:session');
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.token ? s.token : null;
    } catch (e) {
      return null;
    }
  }

  function getTenantId() {
    try {
      var raw = localStorage.getItem('volvix:session');
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.tenant_id ? s.tenant_id : null;
    } catch (e) {
      return null;
    }
  }

  var api = {
    /**
     * Envía el cobro completo al backend.
     * Estructura del payload alineada con tablas sales / payments / cfdi_invoices.
     *
     * TODO(backend): endpoint POST /api/cobro debe:
     *   1. Insertar fila en `sales` (con tip, discount, rounding, etc.)
     *   2. Insertar N filas en `payments` (una por state.payments[])
     *   3. Si state.cfdi != null → enqueue en cola CFDI (cfdi_invoices status='pending')
     *   4. Si state.delivery != PRINT → encolar envío (email/whatsapp)
     *   5. Devolver { ok, sale_id, cfdi_pending }
     *
     * @param {Object} state — state completo del cobro
     * @returns {Promise<{ok:boolean, sale_id?:string, cfdi_pending?:boolean, error?:string}>}
     */
    submitCobro: function (state) {
      if (!state) {
        return Promise.resolve({ ok: false, error: 'state vacío' });
      }
      if (!state.getCanComplete()) {
        return Promise.resolve({ ok: false, error: 'El cobro no está completo (faltan pagos)' });
      }

      var token = getSessionToken();
      var tenantId = getTenantId();

      // Payload limpio (sin getters, sin funciones)
      var payload = {
        tenant_id: tenantId,
        ticket_id: state.ticketId,
        customer_id: state.customerId,
        subtotal: state.subtotal,
        discount: state.discount,
        tip: state.tip,
        rounding: state.rounding,
        total: state.getTotal(),
        paid: state.getPaid(),
        change: state.getChange(),
        payments: state.payments.map(function (p) {
          return {
            id: p.id,
            method: p.method,
            amount: p.amount,
            details: p.details || {},
            sat_forma_pago: satCatalogs.mapMethodToFormaPago(p.method),
          };
        }),
        payment_methods_summary: state.payments.length > 1 ? 'MIXTO' : (state.payments[0] && state.payments[0].method) || null,
        cfdi: state.cfdi,
        delivery: state.delivery,
        notes: state.notes,
        device_id: localStorage.getItem('volvix:device_id') || null,
        app_version: (window.VOLVIX_VERSION) || 'v1',
        client_timestamp: new Date().toISOString(),
      };

      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      return fetch('/api/cobro', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (wrap) {
          if (!wrap.ok) {
            return {
              ok: false,
              error: (wrap.data && wrap.data.error) || 'Error HTTP ' + wrap.status,
            };
          }
          return {
            ok: true,
            sale_id: wrap.data.sale_id || null,
            cfdi_pending: !!wrap.data.cfdi_pending,
            data: wrap.data,
          };
        })
        .catch(function (err) {
          return {
            ok: false,
            error: (err && err.message) || 'Error de red',
            offline: true,
            // TODO(sync): si offline, push a sync_queue local para reintentar
            // El backend ya tiene tabla sync_queue para esto.
          };
        });
    },

    /**
     * Obtiene el tipo de cambio USD→MXN del día.
     * Cache localStorage por 1 hora.
     *
     * TODO(backend): endpoint GET /api/fx/banxico debe:
     *   - Llamar a SIE API de Banxico (serie SF43718, tipo de cambio FIX)
     *   - Devolver { rate: 17.85, date: '2026-05-14', source: 'banxico' }
     *
     * @returns {Promise<{rate:number, date:string, source:string, cached?:boolean}>}
     */
    getExchangeRate: function () {
      // Revisar cache
      try {
        var cached = localStorage.getItem(FX_CACHE_KEY);
        if (cached) {
          var parsed = JSON.parse(cached);
          if (parsed && parsed.timestamp && (Date.now() - parsed.timestamp) < FX_CACHE_TTL_MS) {
            return Promise.resolve({
              rate: parsed.rate,
              date: parsed.date,
              source: parsed.source || 'banxico',
              cached: true,
            });
          }
        }
      } catch (e) { /* ignorar cache corrupto */ }

      return fetch('/api/fx/banxico')
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          var result = {
            rate: Number(data.rate) || 0,
            date: data.date || new Date().toISOString().slice(0, 10),
            source: data.source || 'banxico',
          };
          // Guardar en cache
          try {
            localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
              rate: result.rate,
              date: result.date,
              source: result.source,
              timestamp: Date.now(),
            }));
          } catch (e) { /* localStorage lleno o bloqueado */ }
          return result;
        })
        .catch(function (err) {
          // Fallback razonable si el endpoint falla
          // TODO: el valor de fallback debería venir de config remota, no hardcoded
          return {
            rate: 17.50,
            date: new Date().toISOString().slice(0, 10),
            source: 'fallback',
            error: (err && err.message) || 'Error obteniendo TC',
          };
        });
    },
  };

  // =========================================================
  // EXPOSICIÓN GLOBAL
  // =========================================================

  window.VolvixCobro = {
    version: '1.0.0',
    createState: createState,
    actions: actions,
    validators: validators,
    satCatalogs: satCatalogs,
    formatters: formatters,
    api: api,
    // Utilidades internas (expuestas para testing/debug)
    _utils: {
      round2: round2,
      uuid: uuid,
    },
  };

  // Señal de carga (otros módulos pueden escuchar)
  try {
    window.dispatchEvent(new CustomEvent('volvix:cobro-state:ready', {
      detail: { version: '1.0.0' },
    }));
  } catch (e) { /* CustomEvent no soportado en runtimes muy viejos */ }

})();
