/**
 * volvix-whatsapp-wiring.js
 * WhatsApp Business API mock para Volvix POS.
 * Expone window.WhatsAppAPI con envío de mensajes, plantillas y recibos digitales.
 *
 * No realiza llamadas reales a la Cloud API de Meta: simula latencia, IDs y
 * estados de entrega para integraciones de UI y pruebas.
 */
(function (global) {
  'use strict';

  // ───────────────────────────── Config ─────────────────────────────
  const CONFIG = {
    apiVersion: 'v19.0',
    phoneNumberId: '1234567890',
    businessAccountId: 'BA_VOLVIX_001',
    displayName: 'Volvix POS',
    defaultCountryCode: '+503',
    simulatedLatencyMs: [180, 650],
    failureRate: 0.02,
    storageKey: 'volvix_wa_log_v1'
  };

  // ─────────────────────────── Utilidades ───────────────────────────
  function uid(prefix) {
    return (prefix || 'wamid') + '.' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizePhone(raw) {
    if (!raw) throw new Error('phone requerido');
    let p = String(raw).replace(/[^\d+]/g, '');
    if (!p.startsWith('+')) {
      if (p.length <= 8) p = CONFIG.defaultCountryCode + p;
      else p = '+' + p;
    }
    if (p.replace(/\D/g, '').length < 8) {
      throw new Error('phone inválido: ' + raw);
    }
    return p;
  }

  function fmtMoney(n, currency) {
    const v = Number(n || 0);
    const c = currency || 'USD';
    return c + ' ' + v.toFixed(2);
  }

  // ─────────────────────────── Storage ──────────────────────────────
  const Log = {
    read: function () {
      try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        return raw ? JSON.parse(raw) : [];
      } catch (e) { return []; }
    },
    write: function (arr) {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(arr.slice(-500))); }
      catch (e) { /* quota */ }
    },
    push: function (entry) {
      const arr = Log.read();
      arr.push(entry);
      Log.write(arr);
      return entry;
    },
    clear: function () { Log.write([]); }
  };

  // ───────────────────── Plantillas (templates) ─────────────────────
  const TEMPLATES = {
    welcome: {
      name: 'welcome',
      language: 'es_SV',
      body: 'Hola {{1}}, bienvenido a Volvix POS. Tu cuenta está activa.'
    },
    order_confirmation: {
      name: 'order_confirmation',
      language: 'es_SV',
      body: 'Pedido #{{1}} confirmado por {{2}}. Total: {{3}}. Gracias por tu compra.'
    },
    receipt: {
      name: 'receipt',
      language: 'es_SV',
      body: 'Recibo digital #{{1}} - Total {{2}}. Descarga: {{3}}'
    },
    payment_reminder: {
      name: 'payment_reminder',
      language: 'es_SV',
      body: 'Recordatorio: factura #{{1}} vence el {{2}}. Monto: {{3}}.'
    },
    shipping_update: {
      name: 'shipping_update',
      language: 'es_SV',
      body: 'Tu envío {{1}} está {{2}}. Llegada estimada: {{3}}.'
    },
    otp: {
      name: 'otp',
      language: 'es_SV',
      body: 'Tu código de verificación Volvix es {{1}}. Vence en 5 min.'
    }
  };

  function renderTemplate(tpl, vars) {
    let body = tpl.body;
    (vars || []).forEach(function (val, i) {
      body = body.replace('{{' + (i + 1) + '}}', String(val));
    });
    return body;
  }

  // ─────────────────────────── Core send ────────────────────────────
  async function dispatch(payload) {
    const latency = rand(CONFIG.simulatedLatencyMs[0], CONFIG.simulatedLatencyMs[1]);
    await delay(latency);

    const failed = Math.random() < CONFIG.failureRate;
    const messageId = uid('wamid');

    const entry = {
      id: messageId,
      to: payload.to,
      type: payload.type,
      payload: payload,
      status: failed ? 'failed' : 'sent',
      timestamp: nowIso(),
      latencyMs: latency,
      error: failed ? { code: 131026, title: 'Message undeliverable' } : null
    };

    Log.push(entry);

    if (failed) {
      const err = new Error('WhatsApp send failed: ' + entry.error.title);
      err.detail = entry;
      throw err;
    }

    // Simular transición a 'delivered' y 'read'
    setTimeout(function () { updateStatus(messageId, 'delivered'); }, rand(500, 1500));
    setTimeout(function () {
      if (Math.random() > 0.25) updateStatus(messageId, 'read');
    }, rand(2000, 6000));

    return {
      messaging_product: 'whatsapp',
      contacts: [{ input: payload.to, wa_id: payload.to.replace(/\D/g, '') }],
      messages: [{ id: messageId }]
    };
  }

  function updateStatus(messageId, status) {
    const arr = Log.read();
    const idx = arr.findIndex(function (e) { return e.id === messageId; });
    if (idx === -1) return;
    arr[idx].status = status;
    arr[idx]['ts_' + status] = nowIso();
    Log.write(arr);
    emit('status', { id: messageId, status: status });
  }

  // ───────────────────────── Event bus ──────────────────────────────
  const listeners = {};
  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return function off() {
      listeners[evt] = (listeners[evt] || []).filter(function (f) { return f !== fn; });
    };
  }
  function emit(evt, data) {
    (listeners[evt] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('[WA] listener error', e); }
    });
  }

  // ───────────────────────── Public API ─────────────────────────────
  const WhatsAppAPI = {
    config: CONFIG,
    templates: TEMPLATES,

    /** Envía un mensaje de texto plano. */
    sendText: async function (to, text, opts) {
      const phone = normalizePhone(to);
      if (!text || !String(text).trim()) throw new Error('text vacío');
      return dispatch({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: String(text), preview_url: !!(opts && opts.previewUrl) }
      });
    },

    /** Envía un mensaje basado en plantilla aprobada. */
    sendTemplate: async function (to, templateName, vars, lang) {
      const phone = normalizePhone(to);
      const tpl = TEMPLATES[templateName];
      if (!tpl) throw new Error('Plantilla desconocida: ' + templateName);
      const rendered = renderTemplate(tpl, vars || []);
      return dispatch({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: lang || tpl.language },
          components: [{
            type: 'body',
            parameters: (vars || []).map(function (v) {
              return { type: 'text', text: String(v) };
            })
          }]
        },
        _rendered: rendered
      });
    },

    /** Envía una imagen por URL. */
    sendImage: async function (to, imageUrl, caption) {
      return dispatch({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'image',
        image: { link: imageUrl, caption: caption || '' }
      });
    },

    /** Envía un documento (PDF de recibo, factura, etc). */
    sendDocument: async function (to, documentUrl, filename, caption) {
      return dispatch({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'document',
        document: {
          link: documentUrl,
          filename: filename || 'documento.pdf',
          caption: caption || ''
        }
      });
    },

    /** Envía ubicación. */
    sendLocation: async function (to, lat, lng, name, address) {
      return dispatch({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'location',
        location: {
          latitude: Number(lat),
          longitude: Number(lng),
          name: name || '',
          address: address || ''
        }
      });
    },

    /** Envía botones interactivos. */
    sendButtons: async function (to, body, buttons) {
      const btns = (buttons || []).slice(0, 3).map(function (b, i) {
        return {
          type: 'reply',
          reply: { id: b.id || ('btn_' + i), title: String(b.title).slice(0, 20) }
        };
      });
      return dispatch({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: { buttons: btns }
        }
      });
    },

    /**
     * Envía un recibo digital completo (texto + PDF opcional).
     * receipt = { number, items:[{name,qty,price}], total, currency, pdfUrl?, customerName? }
     */
    sendReceipt: async function (to, receipt) {
      if (!receipt || !receipt.number) throw new Error('receipt.number requerido');
      const currency = receipt.currency || 'USD';
      const lines = (receipt.items || []).map(function (it) {
        return '• ' + it.qty + 'x ' + it.name + ' — ' + fmtMoney(it.price * it.qty, currency);
      }).join('\n');
      const total = receipt.total != null
        ? receipt.total
        : (receipt.items || []).reduce(function (s, it) { return s + it.price * it.qty; }, 0);

      const text =
        '🧾 *Recibo Volvix POS*\n' +
        'No. ' + receipt.number + '\n' +
        (receipt.customerName ? 'Cliente: ' + receipt.customerName + '\n' : '') +
        '────────────────\n' +
        lines + '\n' +
        '────────────────\n' +
        '*Total:* ' + fmtMoney(total, currency) + '\n' +
        'Fecha: ' + new Date().toLocaleString('es-SV') + '\n\n' +
        '¡Gracias por su compra!';

      const textResp = await WhatsAppAPI.sendText(to, text);

      let docResp = null;
      if (receipt.pdfUrl) {
        docResp = await WhatsAppAPI.sendDocument(
          to,
          receipt.pdfUrl,
          'recibo-' + receipt.number + '.pdf',
          'Recibo digital #' + receipt.number
        );
      }

      const tplResp = await WhatsAppAPI.sendTemplate(
        to,
        'receipt',
        [receipt.number, fmtMoney(total, currency), receipt.pdfUrl || 'app.volvix.local']
      );

      return { text: textResp, document: docResp, template: tplResp };
    },

    /** Marca un mensaje recibido como leído (mock). */
    markAsRead: async function (messageId) {
      await delay(rand(80, 200));
      return { success: true, id: messageId };
    },

    /** Estado actual de un mensaje. */
    getStatus: function (messageId) {
      const e = Log.read().find(function (x) { return x.id === messageId; });
      return e ? e.status : 'unknown';
    },

    /** Histórico de mensajes enviados. */
    history: function (limit) {
      const arr = Log.read();
      return limit ? arr.slice(-limit) : arr;
    },

    clearHistory: function () { Log.clear(); },

    /** Suscripción a eventos: 'status', 'incoming'. */
    on: on,

    /** Simular un mensaje entrante (para pruebas de UI). */
    simulateIncoming: function (from, text) {
      const evt = {
        id: uid('wamid_in'),
        from: normalizePhone(from),
        text: text,
        timestamp: nowIso()
      };
      emit('incoming', evt);
      return evt;
    },

    /** Verificación de número (mock). */
    verifyNumber: async function (phone) {
      await delay(rand(150, 400));
      const p = normalizePhone(phone);
      return {
        input: p,
        wa_id: p.replace(/\D/g, ''),
        exists: Math.random() > 0.05,
        business: false
      };
    },

    /** Info del número de negocio configurado. */
    me: function () {
      return {
        phone_number_id: CONFIG.phoneNumberId,
        display_name: CONFIG.displayName,
        business_account_id: CONFIG.businessAccountId,
        api_version: CONFIG.apiVersion,
        verified: true
      };
    }
  };

  // Exponer
  global.WhatsAppAPI = WhatsAppAPI;

  if (global.console && global.console.info) {
    console.info('[Volvix] WhatsApp wiring listo — window.WhatsAppAPI disponible');
  }
})(typeof window !== 'undefined' ? window : this);
