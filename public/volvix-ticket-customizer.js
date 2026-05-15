/**
 * volvix-ticket-customizer.js — Personalización del ticket EN VIVO
 *
 * Inspirado en Eleventa: el usuario ve la previa del ticket SIEMPRE,
 * sin presionar botones. Mientras modifica los datos personalizados
 * (nombre del negocio, dirección, teléfono, RFC, logo, líneas
 * adicionales del header/footer), el preview cambia INSTANTÁNEAMENTE.
 *
 * Inspirado también en facturas DIAN/SAT modernas:
 *   - Logo + datos vendedor
 *   - Denominación (TICKET / FACTURA)
 *   - Folio
 *   - Código de barras del folio
 *   - Fecha + hora
 *   - Datos del cliente (opcional)
 *   - Forma de pago + medio
 *   - Vendedor / cajero
 *   - Tabla items (Cant, Detalle, Total)
 *   - Total grande
 *   - Detalle impuestos (IVA + base + impuesto)
 *   - Forma de pago referenciada (efectivo, MP, etc.)
 *   - Recibido + Cambio
 *   - Calidad contribuyente (Régimen)
 *   - Autorización fiscal (CFDI/DIAN)
 *   - QR del UUID SAT / CUFE
 *   - Mensaje de agradecimiento
 *   - Líneas adicionales del footer
 *
 * Settings persistentes en localStorage:
 *   volvix_ticket_config = { headerLines, footerLines, logoBase64,
 *                             showLogo, showBarcode, showQR, showTaxes,
 *                             showPayment, paperWidth, fontSize, ... }
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'volvix_ticket_config';

  // Default config
  const DEFAULT_CONFIG = {
    // Header
    showLogo: true,
    logoBase64: null,            // base64 image
    businessName: 'Mi Negocio',
    headerLines: [               // líneas adicionales antes de items
      'Dirección 123 Col. Colonia',
      'Tel: (555) 123-4567',
      'RFC: XXXX010101XX0'
    ],
    showFolio: true,
    showBarcode: true,           // code 128 del folio
    showQR: false,                // QR (solo CFDI)
    showDate: true,
    showCashier: true,
    showCustomer: true,           // cliente

    // Items table
    showItemCode: false,          // mostrar código del producto
    showItemTaxes: false,         // tasa de IVA por item

    // Totals
    showSubtotal: true,
    showDiscount: true,
    showTax: false,               // discriminación impuestos (IVA)
    showTip: true,

    // Payment
    showPaymentMethod: true,
    showPaymentDetail: true,      // EFECTIVO/MP/SPEI breakdown si Mixto
    showReceivedChange: true,     // recibido + cambio

    // Fiscal
    showRegimen: false,           // "RESPONSABLE DE IVA"
    showAuth: false,              // autorización DIAN/SAT
    showUUID: false,              // CUFE / UUID SAT
    showCSFEsAuth: false,         // datos del CFDI

    // Footer
    footerLines: [
      '¡Gracias por su compra!',
      'www.volvix.app'
    ],

    // Format
    paperWidth: 32,               // 32 chars (58mm) o 48 (80mm)
    fontSize: 11,                 // px en preview
    bold: false,
    centerHeader: true,
    centerFooter: true,

    // Sound + behavior
    autoOpenDrawer: true,
    soundOnPrint: false
  };

  let _config = null;
  let _onChangeCallbacks = [];

  function loadConfig() {
    if (_config) return _config;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      _config = Object.assign({}, DEFAULT_CONFIG, saved);
      // Asegurar arrays
      if (!Array.isArray(_config.headerLines)) _config.headerLines = DEFAULT_CONFIG.headerLines.slice();
      if (!Array.isArray(_config.footerLines)) _config.footerLines = DEFAULT_CONFIG.footerLines.slice();
    } catch (e) {
      _config = Object.assign({}, DEFAULT_CONFIG);
    }
    return _config;
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
    } catch (_) {}
    _onChangeCallbacks.forEach((cb) => { try { cb(_config); } catch (_) {} });
  }

  function setConfig(key, value) {
    loadConfig();
    _config[key] = value;
    saveConfig();
  }

  function getConfig() {
    return loadConfig();
  }

  function onChange(callback) {
    if (typeof callback === 'function') _onChangeCallbacks.push(callback);
  }

  /**
   * Generate sample ticket data for preview
   */
  function getSampleData() {
    return {
      folio: '00012345',
      date: new Date().toLocaleDateString('es-MX'),
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      cashier: 'Cajero 1',
      customer: 'Público en general',
      items: [
        { qty: 1, code: '001', name: 'Agua Ciel 600ml', price: 7.00, total: 7.00, tax: 0 },
        { qty: 1, code: '002', name: 'Coca Cola Light', price: 8.00, total: 8.00, tax: 0 },
        { qty: 1, code: '003', name: 'Coca Sprite', price: 8.00, total: 8.00, tax: 0 },
        { qty: 1, code: '004', name: '1Kg Tomate', price: 10.00, total: 10.00, tax: 0 }
      ],
      subtotal: 33.00,
      tax: 0,
      discount: 0,
      tip: 0,
      total: 33.00,
      payment: { method: 'EFECTIVO', received: 50.00, change: 17.00 },
      itemsCount: 4,
      regimen: '626 - Régimen Simplificado de Confianza',
      uuid: null,
      authorization: null
    };
  }

  /**
   * Render del ticket como ESC/POS plain text (para enviar a impresora)
   * width = caracteres por línea (32 = 58mm, 48 = 80mm)
   */
  function renderText(data, cfg) {
    cfg = cfg || loadConfig();
    data = data || getSampleData();
    const w = cfg.paperWidth || 32;
    const lines = [];
    const pad = (s, total, side) => {
      s = String(s || '');
      if (s.length >= total) return s.slice(0, total);
      const diff = total - s.length;
      if (side === 'right') return ' '.repeat(diff) + s;
      if (side === 'center') return ' '.repeat(Math.floor(diff / 2)) + s + ' '.repeat(Math.ceil(diff / 2));
      return s + ' '.repeat(diff);
    };
    const center = (s) => pad(s, w, 'center');
    const right = (s) => pad(s, w, 'right');
    const sep = '-'.repeat(w);
    const dsep = '='.repeat(w);
    const fmt$ = (n) => '$' + Number(n || 0).toFixed(2);

    // ─── LOGO (texto grande / ASCII si Generic/Text-Only) ───
    // 2026-05-15: showLogo activa un "header magnificado" con doble tamaño visual
    // (en ESC/POS real será GS!17; aquí en texto ponemos *** alrededor del nombre).
    if (cfg.showLogo && cfg.businessName) {
      lines.push(center('*** ' + cfg.businessName.toUpperCase() + ' ***'));
      lines.push('');
    }

    // ─── HEADER ───
    if (cfg.businessName && !cfg.showLogo) {
      // Si showLogo está off, el nombre va normal arriba
      lines.push(cfg.centerHeader ? center(cfg.businessName.toUpperCase()) : cfg.businessName.toUpperCase());
    }
    (cfg.headerLines || []).forEach((l) => {
      if (l) lines.push(cfg.centerHeader ? center(l) : l);
    });
    lines.push('');

    // ─── INFO TICKET ───
    if (cfg.showFolio && data.folio) {
      lines.push(center('TICKET No. ' + data.folio));
    }
    // ─── BARCODE (representación ASCII para Generic/Text-Only) ───
    // 2026-05-15: showBarcode renderiza el folio como texto con barras |||
    // (la versión RAW ESC/POS real está en print-raw IPC con GS k)
    if (cfg.showBarcode && data.folio) {
      const code = String(data.folio);
      lines.push(center('|' + '||'.repeat(Math.min(code.length, 14)) + '|'));
      lines.push(center('[' + code + ']'));
    }
    // ─── QR (representación texto para Generic/Text-Only) ───
    // 2026-05-15: showQR imprime el contenido como URL/JSON; en RAW ESC/POS
    // real usa GS ( k para QR Code (modelo 2)
    if (cfg.showQR && data.folio) {
      const qrUrl = (data.qrUrl || 'https://volvix.app/t/' + data.folio);
      lines.push(center('[QR]'));
      lines.push(center(qrUrl));
    }
    if (cfg.showDate) {
      lines.push(pad('Fecha: ' + data.date, w / 2) + pad('Hora: ' + data.time, w / 2, 'right'));
    }
    if (cfg.showCashier && data.cashier) {
      lines.push('Cajero: ' + data.cashier);
    }
    if (cfg.showCustomer && data.customer) {
      lines.push('Cliente: ' + data.customer);
    }
    lines.push(sep);

    // ─── ITEMS ───
    lines.push(pad('Cant', 5) + pad('Descripción', w - 13) + right('Importe'));
    lines.push(sep);
    (data.items || []).forEach((it) => {
      const qty = String(it.qty || 1);
      const name = String(it.name || '');
      const total = fmt$(it.total);
      // Si nombre demasiado largo, partir en 2 líneas
      const maxNameW = w - 5 - 1 - total.length - 1;
      if (name.length <= maxNameW) {
        lines.push(pad(qty, 5) + pad(name, maxNameW) + ' ' + total);
      } else {
        lines.push(pad(qty, 5) + name.slice(0, maxNameW));
        lines.push(' '.repeat(5) + pad(name.slice(maxNameW), w - 5 - total.length - 1) + ' ' + total);
      }
      if (cfg.showItemCode && it.code) {
        lines.push(' '.repeat(5) + 'Código: ' + it.code);
      }
    });
    lines.push(sep);

    // ─── TOTALES ───
    if (cfg.showSubtotal && data.subtotal !== data.total) {
      lines.push(pad('Subtotal:', w - 10) + right(fmt$(data.subtotal)));
    }
    if (cfg.showDiscount && data.discount > 0) {
      lines.push(pad('Descuento:', w - 10) + right('-' + fmt$(data.discount)));
    }
    if (cfg.showTip && data.tip > 0) {
      lines.push(pad('Propina:', w - 10) + right(fmt$(data.tip)));
    }
    if (cfg.showTax && data.tax > 0) {
      lines.push(pad('IVA 16%:', w - 10) + right(fmt$(data.tax)));
    }
    lines.push('');
    // Total grande (sin doble ancho en monospace, pero centrado)
    lines.push(center('TOTAL: ' + fmt$(data.total)));
    if (data.itemsCount) {
      lines.push(center('No. Artículos: ' + data.itemsCount));
    }
    lines.push('');

    // ─── PAGO ───
    if (cfg.showPaymentMethod && data.payment) {
      lines.push('Forma de pago: ' + data.payment.method);
      if (cfg.showReceivedChange && data.payment.received != null) {
        lines.push(pad('Recibido:', w - 12) + right(fmt$(data.payment.received)));
        lines.push(pad('Cambio:', w - 12) + right(fmt$(data.payment.change)));
      }
    }

    // ─── IMPUESTOS DETALLE ───
    if (cfg.showTax && data.tax > 0) {
      lines.push(sep);
      lines.push(center('DETALLE DE IMPUESTOS'));
      lines.push(pad('TARIFA', 12) + pad('BASE', 10) + right('IMPUESTO'));
      lines.push('IVA 16%      ' + pad(fmt$(data.subtotal), 10) + right(fmt$(data.tax)));
    }

    // ─── FISCAL ───
    if (cfg.showRegimen && data.regimen) {
      lines.push(sep);
      lines.push(center(data.regimen));
    }
    if (cfg.showAuth && data.authorization) {
      lines.push(sep);
      lines.push(center(data.authorization));
    }
    if (cfg.showUUID && data.uuid) {
      lines.push(sep);
      lines.push(center('UUID:'));
      lines.push(center(data.uuid));
    }

    // ─── FOOTER ───
    lines.push('');
    (cfg.footerLines || []).forEach((l) => {
      if (l) lines.push(cfg.centerFooter ? center(l) : l);
    });

    return lines.join('\n');
  }

  /**
   * Render del ticket como HTML para previa
   */
  function renderHTML(data, cfg) {
    cfg = cfg || loadConfig();
    data = data || getSampleData();
    const text = renderText(data, cfg);
    // Convertir a HTML monospace
    const styled = text
      .split('\n')
      .map((l) => {
        // Detectar líneas con TOTAL para hacerlas bold y grandes
        if (/TOTAL:?\s*\$/.test(l)) {
          return '<div style="font-weight:bold;font-size:' + (cfg.fontSize * 1.3) + 'px;line-height:1.2;text-align:center">' + l.replace(/ /g, '&nbsp;') + '</div>';
        }
        return '<div>' + (l.replace(/ /g, '&nbsp;') || '&nbsp;') + '</div>';
      })
      .join('');
    return styled;
  }

  global.VolvixTicketCustomizer = {
    loadConfig,
    saveConfig,
    setConfig,
    getConfig,
    onChange,
    renderText,
    renderHTML,
    getSampleData,
    DEFAULT_CONFIG
  };

  // Auto-load
  loadConfig();
})(typeof window !== 'undefined' ? window : globalThis);
