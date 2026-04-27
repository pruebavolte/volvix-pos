/**
 * volvix-receipt-customizer-wiring.js
 * Receipt / Invoice Designer for Volvix POS
 * Drag & drop editor, header/footer, logo upload, fonts, 80mm/A4 layout, save templates.
 *
 * Exposes: window.ReceiptCustomizerAPI
 *
 * Agent-73 R9 Volvix
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'volvix_receipt_templates_v1';
  const ACTIVE_KEY = 'volvix_receipt_active_v1';

  const PAPER_PRESETS = {
    '80mm': { width: 302, height: 'auto', label: '80mm térmico', cssWidth: '80mm' },
    '58mm': { width: 220, height: 'auto', label: '58mm térmico', cssWidth: '58mm' },
    'A4':   { width: 794, height: 1123,   label: 'A4 (210x297mm)', cssWidth: '210mm' },
    'Letter': { width: 816, height: 1056, label: 'Carta (8.5x11)', cssWidth: '8.5in' }
  };

  const FONT_FAMILIES = [
    'monospace', 'Courier New', 'Consolas',
    'Arial', 'Helvetica', 'Verdana',
    'Times New Roman', 'Georgia',
    'system-ui'
  ];

  const FIELD_TYPES = [
    'logo', 'text', 'business_name', 'address', 'phone', 'rfc', 'tax_id',
    'date', 'time', 'folio', 'cashier', 'customer',
    'items_table', 'subtotal', 'tax', 'discount', 'total',
    'payment_method', 'change', 'qr_code', 'barcode',
    'footer_text', 'thanks_message', 'separator', 'spacer'
  ];

  const DEFAULT_TEMPLATE = () => ({
    id: 'tpl_' + Date.now(),
    name: 'Plantilla nueva',
    paper: '80mm',
    font: 'monospace',
    fontSize: 12,
    align: 'left',
    margin: 4,
    logo: null,
    header: [
      { id: 'h1', type: 'logo',          props: { align: 'center', maxWidth: 120 } },
      { id: 'h2', type: 'business_name', props: { align: 'center', bold: true, fontSize: 16 } },
      { id: 'h3', type: 'address',       props: { align: 'center', fontSize: 10 } },
      { id: 'h4', type: 'phone',         props: { align: 'center', fontSize: 10 } },
      { id: 'h5', type: 'separator',     props: { char: '-' } }
    ],
    body: [
      { id: 'b1', type: 'folio',       props: { label: 'Ticket #' } },
      { id: 'b2', type: 'date',        props: { format: 'DD/MM/YYYY HH:mm' } },
      { id: 'b3', type: 'cashier',     props: { label: 'Cajero:' } },
      { id: 'b4', type: 'separator',   props: { char: '-' } },
      { id: 'b5', type: 'items_table', props: { columns: ['qty','name','price','total'] } },
      { id: 'b6', type: 'separator',   props: { char: '-' } },
      { id: 'b7', type: 'subtotal',    props: { label: 'Subtotal:' } },
      { id: 'b8', type: 'tax',         props: { label: 'IVA:' } },
      { id: 'b9', type: 'total',       props: { label: 'TOTAL:', bold: true, fontSize: 14 } },
      { id: 'b10', type: 'payment_method', props: { label: 'Pago:' } }
    ],
    footer: [
      { id: 'f1', type: 'separator',       props: { char: '=' } },
      { id: 'f2', type: 'thanks_message',  props: { text: '¡Gracias por su compra!', align: 'center' } },
      { id: 'f3', type: 'qr_code',         props: { data: '', align: 'center', size: 80 } },
      { id: 'f4', type: 'footer_text',     props: { text: 'www.volvix.com', align: 'center', fontSize: 9 } }
    ]
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────
  let templates = [];
  let activeId = null;
  let designerRoot = null;
  let dragSrc = null;

  // ─────────────────────────────────────────────────────────────────────────
  // STORAGE
  // ─────────────────────────────────────────────────────────────────────────
  function loadTemplates() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      templates = raw ? JSON.parse(raw) : [];
      activeId = localStorage.getItem(ACTIVE_KEY);
      if (!templates.length) {
        const t = DEFAULT_TEMPLATE();
        templates.push(t);
        activeId = t.id;
        saveTemplates();
      }
    } catch (e) {
      console.error('[ReceiptCustomizer] load error', e);
      templates = [DEFAULT_TEMPLATE()];
      activeId = templates[0].id;
    }
  }

  function saveTemplates() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch (e) {
      console.error('[ReceiptCustomizer] save error', e);
    }
  }

  function getActive() {
    return templates.find(t => t.id === activeId) || templates[0];
  }

  function setActive(id) {
    activeId = id;
    saveTemplates();
    renderAll();
  }

  function newTemplate(name) {
    const t = DEFAULT_TEMPLATE();
    if (name) t.name = name;
    templates.push(t);
    activeId = t.id;
    saveTemplates();
    renderAll();
    return t;
  }

  function deleteTemplate(id) {
    templates = templates.filter(t => t.id !== id);
    if (activeId === id) activeId = templates[0] ? templates[0].id : null;
    if (!templates.length) newTemplate('Plantilla nueva');
    saveTemplates();
    renderAll();
  }

  function duplicateTemplate(id) {
    const src = templates.find(t => t.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 'tpl_' + Date.now();
    copy.name = src.name + ' (copia)';
    templates.push(copy);
    activeId = copy.id;
    saveTemplates();
    renderAll();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIELD MANIPULATION
  // ─────────────────────────────────────────────────────────────────────────
  function addField(zone, type) {
    const tpl = getActive();
    const field = {
      id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: type,
      props: defaultProps(type)
    };
    tpl[zone].push(field);
    saveTemplates();
    renderAll();
  }

  function defaultProps(type) {
    switch (type) {
      case 'text':           return { text: 'Texto', align: 'left', fontSize: 12 };
      case 'separator':      return { char: '-' };
      case 'spacer':         return { lines: 1 };
      case 'logo':           return { align: 'center', maxWidth: 120 };
      case 'qr_code':        return { data: '', align: 'center', size: 80 };
      case 'barcode':        return { data: '', align: 'center', height: 40 };
      case 'items_table':    return { columns: ['qty', 'name', 'price', 'total'] };
      case 'thanks_message': return { text: 'Gracias', align: 'center' };
      case 'footer_text':    return { text: '', align: 'center', fontSize: 10 };
      default:               return { label: type + ':' };
    }
  }

  function removeField(zone, id) {
    const tpl = getActive();
    tpl[zone] = tpl[zone].filter(f => f.id !== id);
    saveTemplates();
    renderAll();
  }

  function moveField(zone, fromIdx, toIdx) {
    const tpl = getActive();
    const arr = tpl[zone];
    if (toIdx < 0 || toIdx >= arr.length) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    saveTemplates();
    renderAll();
  }

  function updateFieldProp(zone, id, key, value) {
    const tpl = getActive();
    const f = tpl[zone].find(x => x.id === id);
    if (!f) return;
    f.props[key] = value;
    saveTemplates();
    renderPreview();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGO UPLOAD
  // ─────────────────────────────────────────────────────────────────────────
  function uploadLogo(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('no file'));
      if (!file.type.startsWith('image/')) return reject(new Error('not image'));
      const reader = new FileReader();
      reader.onload = () => {
        const tpl = getActive();
        tpl.logo = reader.result;
        saveTemplates();
        renderAll();
        resolve(reader.result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PREVIEW (sample data)
  // ─────────────────────────────────────────────────────────────────────────
  function sampleData() {
    return {
      business_name: 'Volvix POS',
      address: 'Av. Reforma 123, CDMX',
      phone: 'Tel: 555-123-4567',
      rfc: 'RFC: VLV120101ABC',
      tax_id: 'RFC: VLV120101ABC',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      folio: '00012345',
      cashier: 'Juan P.',
      customer: 'Público en general',
      items: [
        { qty: 2, name: 'Café Americano', price: 35.00, total: 70.00 },
        { qty: 1, name: 'Croissant',      price: 28.50, total: 28.50 },
        { qty: 3, name: 'Agua mineral',   price: 18.00, total: 54.00 }
      ],
      subtotal: 152.50,
      tax: 24.40,
      discount: 0,
      total: 176.90,
      payment_method: 'Efectivo',
      change: 23.10,
      thanks_message: '¡Gracias por su compra!'
    };
  }

  function renderField(field, data) {
    const p = field.props || {};
    const align = p.align || 'left';
    const style = `text-align:${align};font-size:${p.fontSize || 'inherit'}px;${p.bold ? 'font-weight:bold;' : ''}`;
    switch (field.type) {
      case 'logo':
        const tpl = getActive();
        return tpl.logo
          ? `<div style="${style}"><img src="${tpl.logo}" style="max-width:${p.maxWidth || 120}px"/></div>`
          : `<div style="${style};color:#aaa">[LOGO]</div>`;
      case 'text':           return `<div style="${style}">${escapeHtml(p.text || '')}</div>`;
      case 'business_name':  return `<div style="${style}">${escapeHtml(data.business_name)}</div>`;
      case 'address':        return `<div style="${style}">${escapeHtml(data.address)}</div>`;
      case 'phone':          return `<div style="${style}">${escapeHtml(data.phone)}</div>`;
      case 'rfc':
      case 'tax_id':         return `<div style="${style}">${escapeHtml(data.rfc)}</div>`;
      case 'date':           return `<div style="${style}">${data.date} ${data.time}</div>`;
      case 'folio':          return `<div style="${style}">${escapeHtml(p.label || 'Folio:')} ${data.folio}</div>`;
      case 'cashier':        return `<div style="${style}">${escapeHtml(p.label || 'Cajero:')} ${data.cashier}</div>`;
      case 'customer':       return `<div style="${style}">${escapeHtml(p.label || 'Cliente:')} ${data.customer}</div>`;
      case 'items_table':    return renderItemsTable(data.items, p.columns);
      case 'subtotal':       return rowKV(p.label || 'Subtotal:', money(data.subtotal), style);
      case 'tax':            return rowKV(p.label || 'IVA:', money(data.tax), style);
      case 'discount':       return rowKV(p.label || 'Desc:', money(data.discount), style);
      case 'total':          return rowKV(p.label || 'TOTAL:', money(data.total), style);
      case 'payment_method': return rowKV(p.label || 'Pago:', data.payment_method, style);
      case 'change':         return rowKV(p.label || 'Cambio:', money(data.change), style);
      case 'qr_code':        return `<div style="${style}"><div style="display:inline-block;width:${p.size||80}px;height:${p.size||80}px;background:#000;color:#fff;font-size:9px;line-height:${p.size||80}px">[QR]</div></div>`;
      case 'barcode':        return `<div style="${style}"><div style="display:inline-block;height:${p.height||40}px;width:160px;background:repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 4px)"></div></div>`;
      case 'thanks_message': return `<div style="${style}">${escapeHtml(p.text || data.thanks_message)}</div>`;
      case 'footer_text':    return `<div style="${style}">${escapeHtml(p.text || '')}</div>`;
      case 'separator':      return `<div style="text-align:center">${(p.char || '-').repeat(32)}</div>`;
      case 'spacer':         return `<div>${'<br/>'.repeat(p.lines || 1)}</div>`;
      default:               return `<div style="${style};color:#c00">[?${field.type}]</div>`;
    }
  }

  function renderItemsTable(items, cols) {
    cols = cols || ['qty', 'name', 'price', 'total'];
    let html = '<table style="width:100%;font-size:inherit;border-collapse:collapse"><thead><tr>';
    cols.forEach(c => html += `<th style="text-align:left;border-bottom:1px solid #000">${c}</th>`);
    html += '</tr></thead><tbody>';
    items.forEach(it => {
      html += '<tr>';
      cols.forEach(c => {
        const v = (c === 'price' || c === 'total') ? money(it[c]) : it[c];
        html += `<td>${v}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function rowKV(k, v, style) {
    return `<div style="display:flex;justify-content:space-between;${style}"><span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span></div>`;
  }

  function money(n) { return '$' + (Number(n) || 0).toFixed(2); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderTemplateHTML(tpl, data) {
    data = data || sampleData();
    const paper = PAPER_PRESETS[tpl.paper] || PAPER_PRESETS['80mm'];
    const all = [].concat(tpl.header, tpl.body, tpl.footer);
    const inner = all.map(f => renderField(f, data)).join('');
    return `<div style="width:${paper.cssWidth};font-family:${tpl.font};font-size:${tpl.fontSize}px;padding:${tpl.margin}mm;background:#fff;color:#000;text-align:${tpl.align}">${inner}</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI RENDER
  // ─────────────────────────────────────────────────────────────────────────
  function renderAll() {
    if (!designerRoot) return;
    designerRoot.innerHTML = `
      <div class="rc-toolbar"></div>
      <div class="rc-body" style="display:flex;gap:12px">
        <div class="rc-sidebar" style="width:220px"></div>
        <div class="rc-canvas" style="flex:1"></div>
        <div class="rc-preview" style="width:340px"></div>
      </div>`;
    renderToolbar();
    renderSidebar();
    renderCanvas();
    renderPreview();
  }

  function renderToolbar() {
    const tb = designerRoot.querySelector('.rc-toolbar');
    const tpl = getActive();
    const opts = templates.map(t =>
      `<option value="${t.id}" ${t.id === activeId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
    tb.innerHTML = `
      <select data-act="select-tpl">${opts}</select>
      <input data-act="rename" value="${escapeHtml(tpl.name)}" />
      <button data-act="new">+ Nueva</button>
      <button data-act="dup">Duplicar</button>
      <button data-act="del">Borrar</button>
      <button data-act="export">Exportar JSON</button>
      <button data-act="import">Importar JSON</button>
      <button data-act="print">Imprimir prueba</button>
    `;
    tb.addEventListener('change', onToolbar);
    tb.addEventListener('click', onToolbar);
  }

  function onToolbar(e) {
    const act = e.target.getAttribute('data-act');
    if (!act) return;
    const tpl = getActive();
    if (act === 'select-tpl') setActive(e.target.value);
    else if (act === 'rename') { tpl.name = e.target.value; saveTemplates(); }
    else if (act === 'new')    {
      const ui = window.VolvixUI;
      if (ui && typeof ui.form === 'function') {
        Promise.resolve(ui.form({
          title: 'Nueva plantilla de recibo',
          fields: [
            { name: 'name', label: 'Nombre', type: 'text', default: 'Nueva', required: true },
            { name: 'header', label: 'Encabezado', type: 'textarea', rows: 4, default: '' },
            { name: 'footer', label: 'Pie de página', type: 'textarea', rows: 4, default: '' },
            { name: 'logo', label: 'Logo', type: 'file', accept: 'image/*' }
          ],
          submitText: 'Crear'
        })).then(res => {
          if (!res || !res.name) return;
          const tpl = newTemplate(res.name);
          if (tpl) {
            if (res.header) tpl.header = res.header;
            if (res.footer) tpl.footer = res.footer;
            if (res.logo)   tpl.logo = res.logo;
            saveTemplates();
            renderAll();
          }
        }).catch(()=>{});
      } else {
        newTemplate(prompt('Nombre:', 'Nueva') || 'Nueva');
      }
    }
    else if (act === 'dup')    duplicateTemplate(activeId);
    else if (act === 'del')    {
      const ui = window.VolvixUI;
      if (ui && typeof ui.confirm === 'function') {
        Promise.resolve(ui.confirm({ title: 'Borrar plantilla', message: '¿Borrar plantilla?', danger: true }))
          .then(ok => { if (ok) deleteTemplate(activeId); }).catch(()=>{});
      } else {
        if (confirm('¿Borrar plantilla?')) deleteTemplate(activeId);
      }
    }
    else if (act === 'export') exportJSON();
    else if (act === 'import') importJSONPrompt();
    else if (act === 'print')  printTest();
  }

  function renderSidebar() {
    const sb = designerRoot.querySelector('.rc-sidebar');
    const tpl = getActive();
    sb.innerHTML = `
      <h4>Papel</h4>
      <select data-prop="paper">${Object.keys(PAPER_PRESETS).map(k =>
        `<option ${tpl.paper === k ? 'selected' : ''} value="${k}">${PAPER_PRESETS[k].label}</option>`).join('')}</select>
      <h4>Fuente</h4>
      <select data-prop="font">${FONT_FAMILIES.map(f =>
        `<option ${tpl.font === f ? 'selected' : ''} value="${f}">${f}</option>`).join('')}</select>
      <label>Tamaño <input type="number" data-prop="fontSize" value="${tpl.fontSize}" min="8" max="24"/></label>
      <label>Margen mm <input type="number" data-prop="margin" value="${tpl.margin}" min="0" max="20"/></label>
      <h4>Logo</h4>
      <input type="file" accept="image/*" data-act="upload-logo"/>
      ${tpl.logo ? `<img src="${tpl.logo}" style="max-width:100%;margin-top:6px"/>` : ''}
      <h4>Agregar campo</h4>
      <select data-act="add-zone">
        <option value="header">Header</option>
        <option value="body">Body</option>
        <option value="footer">Footer</option>
      </select>
      <select data-act="add-type">
        ${FIELD_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
      <button data-act="add-field">+ Agregar</button>
    `;
    sb.addEventListener('change', e => {
      const prop = e.target.getAttribute('data-prop');
      if (prop) {
        const v = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
        getActive()[prop] = v;
        saveTemplates();
        renderPreview();
      }
      if (e.target.getAttribute('data-act') === 'upload-logo') {
        uploadLogo(e.target.files[0]).catch(err => VolvixUI.toast({type:'error', message:'Error logo: ' + err.message}));
      }
    });
    sb.addEventListener('click', e => {
      if (e.target.getAttribute('data-act') === 'add-field') {
        const zone = sb.querySelector('[data-act=add-zone]').value;
        const type = sb.querySelector('[data-act=add-type]').value;
        addField(zone, type);
      }
    });
  }

  function renderCanvas() {
    const c = designerRoot.querySelector('.rc-canvas');
    const tpl = getActive();
    c.innerHTML = ['header', 'body', 'footer'].map(zone => `
      <fieldset data-zone="${zone}">
        <legend>${zone.toUpperCase()}</legend>
        <div class="rc-zone">
          ${tpl[zone].map((f, i) => renderFieldRow(f, zone, i)).join('')}
        </div>
      </fieldset>`).join('');
    c.querySelectorAll('.rc-zone').forEach(z => attachDnD(z));
    c.addEventListener('click', e => {
      const act = e.target.getAttribute('data-act');
      if (!act) return;
      const zone = e.target.closest('[data-zone]').getAttribute('data-zone');
      const id = e.target.getAttribute('data-id');
      if (act === 'remove') removeField(zone, id);
      else if (act === 'up' || act === 'down') {
        const arr = getActive()[zone];
        const idx = arr.findIndex(x => x.id === id);
        moveField(zone, idx, act === 'up' ? idx - 1 : idx + 1);
      }
    });
    c.addEventListener('input', e => {
      const id = e.target.getAttribute('data-field-id');
      const key = e.target.getAttribute('data-prop-key');
      if (!id || !key) return;
      const zone = e.target.closest('[data-zone]').getAttribute('data-zone');
      let v = e.target.value;
      if (e.target.type === 'number') v = Number(v);
      if (e.target.type === 'checkbox') v = e.target.checked;
      updateFieldProp(zone, id, key, v);
    });
  }

  function renderFieldRow(f, zone, idx) {
    const p = f.props || {};
    const propsEditable = Object.keys(p).map(k => {
      const v = p[k];
      if (typeof v === 'boolean')
        return `<label>${k}<input type="checkbox" data-field-id="${f.id}" data-prop-key="${k}" ${v ? 'checked' : ''}/></label>`;
      if (typeof v === 'number')
        return `<label>${k}<input type="number" data-field-id="${f.id}" data-prop-key="${k}" value="${v}"/></label>`;
      if (Array.isArray(v)) return `<small>${k}: [${v.join(',')}]</small>`;
      return `<label>${k}<input type="text" data-field-id="${f.id}" data-prop-key="${k}" value="${escapeHtml(v)}"/></label>`;
    }).join(' ');
    return `
      <div class="rc-row" draggable="true" data-id="${f.id}" data-idx="${idx}" style="border:1px solid #ccc;padding:4px;margin:2px 0;background:#fafafa">
        <strong>${f.type}</strong>
        <button data-act="up" data-id="${f.id}">▲</button>
        <button data-act="down" data-id="${f.id}">▼</button>
        <button data-act="remove" data-id="${f.id}">✕</button>
        <div>${propsEditable}</div>
      </div>`;
  }

  function attachDnD(zoneEl) {
    zoneEl.addEventListener('dragstart', e => {
      const row = e.target.closest('.rc-row');
      if (!row) return;
      dragSrc = { zone: zoneEl.parentElement.getAttribute('data-zone'), id: row.getAttribute('data-id'), idx: Number(row.getAttribute('data-idx')) };
      e.dataTransfer.effectAllowed = 'move';
    });
    zoneEl.addEventListener('dragover', e => { e.preventDefault(); });
    zoneEl.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc) return;
      const targetRow = e.target.closest('.rc-row');
      const targetZone = zoneEl.parentElement.getAttribute('data-zone');
      const tpl = getActive();
      // remove from src
      const srcArr = tpl[dragSrc.zone];
      const srcIdx = srcArr.findIndex(x => x.id === dragSrc.id);
      const [item] = srcArr.splice(srcIdx, 1);
      // insert in target
      const tgtArr = tpl[targetZone];
      const tgtIdx = targetRow ? Number(targetRow.getAttribute('data-idx')) : tgtArr.length;
      tgtArr.splice(tgtIdx, 0, item);
      saveTemplates();
      renderAll();
      dragSrc = null;
    });
  }

  function renderPreview() {
    const pv = designerRoot && designerRoot.querySelector('.rc-preview');
    if (!pv) return;
    pv.innerHTML = `<h4>Vista previa</h4>
      <div style="border:1px solid #999;padding:8px;background:#eee;overflow:auto;max-height:600px">
        ${renderTemplateHTML(getActive())}
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT / IMPORT / PRINT
  // ─────────────────────────────────────────────────────────────────────────
  function exportJSON() {
    const blob = new Blob([JSON.stringify(getActive(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (getActive().name || 'template') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importJSONPrompt() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const obj = JSON.parse(r.result);
          obj.id = 'tpl_' + Date.now();
          templates.push(obj);
          activeId = obj.id;
          saveTemplates(); renderAll();
        } catch (e) { VolvixUI.toast({type:'info', message:'JSON inválido'}); }
      };
      r.readAsText(file);
    };
    input.click();
  }

  function printTest(data) {
    const html = renderTemplateHTML(getActive(), data || sampleData());
    const w = window.open('', '_blank', 'width=400,height=700');
    w.document.write(`<html><head><title>Preview</title></head><body>${html}<scr` + `ipt>window.print()</scr` + `ipt></body></html>`);
    w.document.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOUNT
  // ─────────────────────────────────────────────────────────────────────────
  function mount(selectorOrEl) {
    designerRoot = typeof selectorOrEl === 'string'
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;
    if (!designerRoot) {
      designerRoot = document.createElement('div');
      designerRoot.id = 'rc-root';
      document.body.appendChild(designerRoot);
    }
    loadTemplates();
    renderAll();
    return designerRoot;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────
  global.ReceiptCustomizerAPI = {
    mount: mount,
    loadTemplates: loadTemplates,
    saveTemplates: saveTemplates,
    getTemplates: () => templates.slice(),
    getActive: getActive,
    setActive: setActive,
    newTemplate: newTemplate,
    duplicateTemplate: duplicateTemplate,
    deleteTemplate: deleteTemplate,
    addField: addField,
    removeField: removeField,
    moveField: moveField,
    updateFieldProp: updateFieldProp,
    uploadLogo: uploadLogo,
    renderHTML: (data) => renderTemplateHTML(getActive(), data),
    print: printTest,
    exportJSON: exportJSON,
    importJSON: (obj) => {
      obj.id = 'tpl_' + Date.now();
      templates.push(obj); activeId = obj.id;
      saveTemplates(); renderAll();
    },
    PAPER_PRESETS: PAPER_PRESETS,
    FONT_FAMILIES: FONT_FAMILIES,
    FIELD_TYPES: FIELD_TYPES,
    version: '1.0.0',
    agent: 'Agent-73 R9 Volvix'
  };

  // auto-init si hay #receipt-customizer
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('receipt-customizer');
      if (el) mount(el);
    });
  }

})(typeof window !== 'undefined' ? window : this);
