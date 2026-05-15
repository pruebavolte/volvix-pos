/**
 * volvix-ticket-editor.js — Editor visual del ticket con preview EN VIVO
 *
 * Inspirado en Eleventa: el usuario edita en un lado, ve el ticket
 * cambiando en tiempo real en el otro. NO requiere botón "Vista previa".
 *
 * Componente embebible:
 *   window.VolvixTicketEditor.renderInto(containerEl)
 *     → reemplaza el contenido del container con el editor + preview
 *
 * Modal full-screen:
 *   window.VolvixTicketEditor.openModal()
 *     → abre el editor como modal flotante full-screen
 */

(function (global) {
  'use strict';

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') e.innerHTML = v;
      else if (v != null) e.setAttribute(k, v);
    });
    children.flat().filter(c => c != null).forEach((c) => {
      if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
      else e.appendChild(c);
    });
    return e;
  }

  // ─── Sección Editor (lado izquierdo) ──────────────────────────────
  function buildEditorPanel(preview) {
    const C = global.VolvixTicketCustomizer;
    if (!C) {
      return el('div', { style: { padding: '20px', color: '#DC2626' } }, 'Módulo VolvixTicketCustomizer no cargado');
    }
    const cfg = C.getConfig();
    const panel = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', overflowY: 'auto' } });

    function rerender() {
      C.saveConfig();
      if (preview && preview.update) preview.update();
    }

    // Título
    panel.appendChild(el('h3', { style: { margin: '0', fontSize: '16px', color: '#0B0B0F' } }, '🎨 Personalizar ticket'));

    // ─── Impresora seleccionada (Combobox) ───
    panel.appendChild(el('div', { style: { padding: '10px', background: '#F0F9FF', borderRadius: '8px', border: '1px solid #BAE6FD' } },
      el('div', { style: { fontSize: '11px', fontWeight: '600', color: '#0369A1', marginBottom: '6px' } }, '🖨 Impresora del sistema (Windows)'),
      buildPrinterCombo()
    ));

    // ─── Modo de impresión ───
    panel.appendChild(el('div', { style: { padding: '10px', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FCD34D' } },
      el('div', { style: { fontSize: '11px', fontWeight: '600', color: '#92400E', marginBottom: '6px' } }, '⚙️ Modo de impresión'),
      buildModeSelector()
    ));

    // ─── Header del ticket ───
    panel.appendChild(buildSection('🏪 Datos del negocio',
      buildField('Nombre del negocio', 'text', cfg.businessName, (v) => { cfg.businessName = v; rerender(); }),
      buildField('Dirección', 'text', cfg.headerLines[0] || '', (v) => { cfg.headerLines[0] = v; rerender(); }),
      buildField('Teléfono', 'text', cfg.headerLines[1] || '', (v) => { cfg.headerLines[1] = v; rerender(); }),
      buildField('RFC / Identificación', 'text', cfg.headerLines[2] || '', (v) => { cfg.headerLines[2] = v; rerender(); }),
      buildField('Líneas adicionales (separar con |)', 'text', (cfg.headerLines.slice(3) || []).join('|'), (v) => {
        cfg.headerLines = cfg.headerLines.slice(0, 3).concat(v.split('|').filter(Boolean));
        rerender();
      })
    ));

    // ─── Mostrar / Ocultar campos ───
    panel.appendChild(buildSection('👁 Qué mostrar en el ticket',
      buildToggle('Logo', cfg.showLogo, (v) => { cfg.showLogo = v; rerender(); }),
      buildToggle('Folio', cfg.showFolio, (v) => { cfg.showFolio = v; rerender(); }),
      buildToggle('Código de barras del folio', cfg.showBarcode, (v) => { cfg.showBarcode = v; rerender(); }),
      buildToggle('Código QR', cfg.showQR, (v) => { cfg.showQR = v; rerender(); }),
      buildToggle('Fecha y hora', cfg.showDate, (v) => { cfg.showDate = v; rerender(); }),
      buildToggle('Cajero', cfg.showCashier, (v) => { cfg.showCashier = v; rerender(); }),
      buildToggle('Cliente', cfg.showCustomer, (v) => { cfg.showCustomer = v; rerender(); }),
      buildToggle('Código del producto', cfg.showItemCode, (v) => { cfg.showItemCode = v; rerender(); }),
      buildToggle('Subtotal', cfg.showSubtotal, (v) => { cfg.showSubtotal = v; rerender(); }),
      buildToggle('Descuento', cfg.showDiscount, (v) => { cfg.showDiscount = v; rerender(); }),
      buildToggle('Propina', cfg.showTip, (v) => { cfg.showTip = v; rerender(); }),
      buildToggle('Impuestos (IVA detallado)', cfg.showTax, (v) => { cfg.showTax = v; rerender(); }),
      buildToggle('Forma de pago', cfg.showPaymentMethod, (v) => { cfg.showPaymentMethod = v; rerender(); }),
      buildToggle('Recibido + Cambio', cfg.showReceivedChange, (v) => { cfg.showReceivedChange = v; rerender(); }),
      buildToggle('Régimen fiscal', cfg.showRegimen, (v) => { cfg.showRegimen = v; rerender(); }),
      buildToggle('Autorización fiscal', cfg.showAuth, (v) => { cfg.showAuth = v; rerender(); }),
      buildToggle('UUID/CUFE (CFDI)', cfg.showUUID, (v) => { cfg.showUUID = v; rerender(); })
    ));

    // ─── Formato ───
    panel.appendChild(buildSection('📐 Formato del papel',
      buildSelect('Ancho del papel', cfg.paperWidth, [
        { value: 32, label: '58mm (32 caracteres)' },
        { value: 48, label: '80mm (48 caracteres)' }
      ], (v) => { cfg.paperWidth = parseInt(v, 10); rerender(); }),
      buildToggle('Centrar encabezado', cfg.centerHeader, (v) => { cfg.centerHeader = v; rerender(); }),
      buildToggle('Centrar pie de página', cfg.centerFooter, (v) => { cfg.centerFooter = v; rerender(); })
    ));

    // ─── Footer ───
    panel.appendChild(buildSection('🙏 Mensaje final',
      buildField('Línea 1', 'text', cfg.footerLines[0] || '', (v) => { cfg.footerLines[0] = v; rerender(); }),
      buildField('Línea 2', 'text', cfg.footerLines[1] || '', (v) => { cfg.footerLines[1] = v; rerender(); }),
      buildField('Línea 3', 'text', cfg.footerLines[2] || '', (v) => { cfg.footerLines[2] = v; rerender(); }),
      buildField('Líneas adicionales (separar con |)', 'text', (cfg.footerLines.slice(3) || []).join('|'), (v) => {
        cfg.footerLines = cfg.footerLines.slice(0, 3).concat(v.split('|').filter(Boolean));
        rerender();
      })
    ));

    // ─── Comportamiento ───
    panel.appendChild(buildSection('🔧 Comportamiento',
      buildToggle('Abrir cajón al cobrar en efectivo', cfg.autoOpenDrawer, (v) => { cfg.autoOpenDrawer = v; rerender(); }),
      buildToggle('Sonido al imprimir', cfg.soundOnPrint, (v) => { cfg.soundOnPrint = v; rerender(); })
    ));

    // ─── Test print ───
    panel.appendChild(el('div', { style: { padding: '12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' } },
      el('button', {
        style: { width: '100%', padding: '12px', background: '#10B981', color: '#fff', border: '0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
        onClick: doTestPrint
      }, '🖨 Imprimir ticket de prueba (sin diálogo)')
    ));

    return panel;
  }

  // ─── Helpers de UI ─────────────────────────────────────────────────
  function buildSection(title, ...content) {
    return el('div', { style: { border: '1px solid #E5E7EB', borderRadius: '8px', padding: '10px', background: '#fff' } },
      el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' } }, title),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, ...content)
    );
  }
  function buildField(label, type, value, onInput) {
    return el('div',
      { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
      el('label', { style: { fontSize: '11px', color: '#6B7280' } }, label),
      el('input', {
        type: type || 'text',
        value: value == null ? '' : value,
        style: { padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px' },
        onInput: (e) => onInput(e.target.value)
      })
    );
  }
  function buildToggle(label, value, onChange) {
    const wrap = el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#374151' } });
    const cb = el('input', { type: 'checkbox', style: { cursor: 'pointer' } });
    cb.checked = !!value;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(label));
    return wrap;
  }
  function buildSelect(label, value, options, onChange) {
    const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } });
    wrap.appendChild(el('label', { style: { fontSize: '11px', color: '#6B7280' } }, label));
    const sel = el('select', {
      style: { padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: '4px', fontSize: '12px' },
      onChange: (e) => onChange(e.target.value)
    });
    options.forEach((o) => {
      const opt = el('option', { value: o.value }, o.label);
      if (String(o.value) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  // ─── Combobox de impresoras del sistema ────────────────────────────
  function buildPrinterCombo() {
    const sel = el('select', {
      style: { width: '100%', padding: '8px 10px', border: '1px solid #BAE6FD', borderRadius: '6px', fontSize: '13px', background: '#fff' },
      onChange: (e) => {
        try { localStorage.setItem('volvix_system_printer', e.target.value); } catch (_) {}
        // Toast
        if (typeof global.showToast === 'function') global.showToast('✓ Impresora guardada: ' + e.target.value, 'success', 2500);
      }
    });
    const currentSelected = (() => {
      try { return localStorage.getItem('volvix_system_printer') || ''; } catch (_) { return ''; }
    })();
    sel.appendChild(el('option', { value: '' }, '— Usar impresora default del sistema —'));

    // Llenar dinámicamente
    if (global.volvixElectron && global.volvixElectron.listSystemPrinters) {
      global.volvixElectron.listSystemPrinters().then((list) => {
        (list || []).forEach((p) => {
          const isDefault = p.isDefault ? ' (default)' : '';
          const opt = el('option', { value: p.name }, (p.displayName || p.name) + isDefault);
          if (p.name === currentSelected) opt.selected = true;
          sel.appendChild(opt);
        });
        // Botón Refresh
        const refreshBtn = el('button', {
          style: { marginTop: '6px', padding: '6px 10px', background: '#fff', border: '1px solid #BAE6FD', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', color: '#0369A1' },
          onClick: () => location.reload()
        }, '🔄 Recargar lista');
      });
    } else {
      sel.appendChild(el('option', { value: '', disabled: 'true' }, '(Solo disponible en app .exe)'));
    }
    return sel;
  }

  // ─── Selector de modo (USB / BT / IP / Auto) ──────────────────────
  function buildModeSelector() {
    const sel = el('select', {
      style: { width: '100%', padding: '8px 10px', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '13px', background: '#fff' },
      onChange: (e) => {
        try { localStorage.setItem('volvix_printer_mode', e.target.value); } catch (_) {}
      }
    });
    const current = (() => { try { return localStorage.getItem('volvix_printer_mode') || 'auto'; } catch (_) { return 'auto'; } })();
    [
      { v: 'auto', l: '🎯 Auto (decide solo)' },
      { v: 'usb', l: '🔌 USB' },
      { v: 'bluetooth', l: '📶 Bluetooth' },
      { v: 'ip', l: '🌐 IP / Red' }
    ].forEach((o) => {
      const opt = el('option', { value: o.v }, o.l);
      if (o.v === current) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  // ─── Test print ─────────────────────────────────────────────────
  async function doTestPrint() {
    const C = global.VolvixTicketCustomizer;
    const data = C.getSampleData();
    const cfg = C.getConfig();
    const text = C.renderText(data, cfg);

    if (!global.volvixElectron || !global.volvixElectron.printToSystem) {
      if (typeof global.showToast === 'function') global.showToast('⚠ Solo disponible en la app .exe', 'warning');
      return;
    }
    const printerName = (() => { try { return localStorage.getItem('volvix_system_printer') || null; } catch (_) { return null; } })();
    const html = '<!doctype html><html><body style="font-family:monospace;font-size:11px;white-space:pre-wrap;width:' + (cfg.paperWidth === 48 ? '80mm' : '58mm') + ';padding:0;margin:0">' +
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') +
      '</body></html>';
    const r = await global.volvixElectron.printToSystem({
      html: html,
      printerName: printerName || undefined,
      silent: true,
      copies: 1
    });
    if (typeof global.showToast === 'function') {
      global.showToast(r.ok ? '✅ Ticket de prueba enviado' : '⚠ Error: ' + (r.error || 'desconocido'), r.ok ? 'success' : 'error', 4000);
    }
  }

  // ─── Preview panel (lado derecho) ─────────────────────────────────
  function buildPreviewPanel() {
    const wrap = el('div', { style: { padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#F3F4F6', overflowY: 'auto' } });
    wrap.appendChild(el('div', { style: { fontSize: '12px', color: '#6B7280', marginBottom: '10px', fontWeight: '600' } }, '👁 Vista previa en vivo'));

    const paperWrap = el('div', {
      id: 'vlx-ticket-preview-paper',
      style: {
        background: '#fff',
        padding: '14px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        fontFamily: '"Courier New", "Consolas", monospace',
        fontSize: '11px',
        lineHeight: '1.3',
        color: '#000',
        whiteSpace: 'pre-wrap',
        minHeight: '300px',
        borderRadius: '2px'
      }
    });
    wrap.appendChild(paperWrap);

    function update() {
      const C = global.VolvixTicketCustomizer;
      if (!C) return;
      const cfg = C.getConfig();
      paperWrap.style.width = cfg.paperWidth === 48 ? '380px' : '280px';
      paperWrap.innerHTML = C.renderHTML(C.getSampleData(), cfg);
    }
    update();
    return { el: wrap, update };
  }

  // ─── Render principal (split editor + preview) ────────────────────
  function renderInto(container) {
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'minmax(320px, 1fr) minmax(320px, 480px)';
    container.style.gap = '14px';
    container.style.height = '100%';
    container.style.minHeight = '600px';

    const preview = buildPreviewPanel();
    const editor = buildEditorPanel(preview);

    container.appendChild(editor);
    container.appendChild(preview.el);
  }

  // ─── Modal full-screen ────────────────────────────────────────────
  function openModal() {
    const old = document.getElementById('vlx-ticket-editor-modal');
    if (old) old.remove();

    const modal = el('div', {
      id: 'vlx-ticket-editor-modal',
      style: {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', zIndex: '99999',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui'
      }
    });

    const card = el('div', {
      style: {
        background: '#F9FAFB', borderRadius: '12px', width: '95%', maxWidth: '1100px',
        height: '92vh', display: 'flex', flexDirection: 'column'
      }
    });

    // Header del modal
    card.appendChild(el('div', {
      style: { padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: '12px 12px 0 0' }
    },
      el('h2', { style: { margin: '0', fontSize: '18px' } }, '🎨 Personalización del ticket'),
      el('button', {
        style: { background: 'none', border: '0', fontSize: '28px', cursor: 'pointer', color: '#666', lineHeight: '1', padding: '0 8px' },
        onClick: () => modal.remove()
      }, '×')
    ));

    // Container del editor
    const editorContainer = el('div', { style: { flex: '1', overflow: 'hidden', padding: '14px' } });
    card.appendChild(editorContainer);

    modal.appendChild(card);
    document.body.appendChild(modal);

    renderInto(editorContainer);
  }

  global.VolvixTicketEditor = { renderInto, openModal, buildEditorPanel, buildPreviewPanel };
})(typeof window !== 'undefined' ? window : globalThis);
