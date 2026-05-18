/* ============================================================================
 * volvix-ocr-wiring.js
 * Volvix POS — OCR de tickets / recibos (R17)
 *
 * Public API:
 *   Volvix.ocr.scanReceipt(imageFile)   -> {raw, total, date, rfc, items}
 *   Volvix.ocr.parseMexicanTicket(text) -> structured data
 *   Volvix.ocr.openScannerUI(targetEl)  -> renderiza input file + preview + form
 *   Volvix.ocr.createPurchaseFromOcr(parsed) -> POST /api/purchases/from-ocr
 *
 * Engine: Tesseract.js v5 desde CDN (lang spa+eng).
 * Detecta formato ticket MX: "TOTAL $XX.XX", "RFC: XXXXXX", DD/MM/YYYY.
 * ========================================================================== */
(function (global) {
  'use strict';

  const Volvix = global.Volvix = global.Volvix || {};
  const ns = Volvix.ocr = Volvix.ocr || {};

  const CDN_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const state = { scriptLoaded: null, worker: null };

  function loadScript(url) {
    if (state.scriptLoaded) return state.scriptLoaded;
    state.scriptLoaded = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(s);
    });
    return state.scriptLoaded;
  }

  async function ensureWorker() {
    await loadScript(CDN_TESSERACT);
    if (state.worker) return state.worker;
    // Tesseract v5 usa createWorker async
    state.worker = await global.Tesseract.createWorker(['spa', 'eng']);
    return state.worker;
  }

  /* ---------- parser ---------- */
  function parseMexicanTicket(text) {
    const out = { raw: text, total: null, date: null, rfc: null, items: [] };
    if (!text) return out;

    // TOTAL $XX.XX  | TOTAL: 123.45 | TOTAL MXN 99.00
    const mTotal = text.match(/TOTAL[^\d\-]{0,8}\$?\s*([0-9]{1,6}(?:[.,][0-9]{2}))/i);
    if (mTotal) out.total = Number(mTotal[1].replace(',', '.'));

    // RFC: 13 chars persona fisica / 12 moral
    const mRfc = text.match(/RFC[:\s]+([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i);
    if (mRfc) out.rfc = mRfc[1].toUpperCase();

    // fecha DD/MM/YYYY o DD-MM-YYYY
    const mDate = text.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})\b/);
    if (mDate) {
      const yy = mDate[3].length === 2 ? '20' + mDate[3] : mDate[3];
      out.date = `${yy}-${mDate[2]}-${mDate[1]}`;
    }

    // items: lineas que tengan descripcion + precio
    const lines = text.split(/\r?\n/);
    for (const ln of lines) {
      const m = ln.match(/^\s*(.+?)\s+\$?\s*([0-9]+[.,][0-9]{2})\s*$/);
      if (m && !/TOTAL|SUBTOTAL|IVA|CAMBIO|EFECTIVO/i.test(m[1])) {
        out.items.push({ desc: m[1].trim(), price: Number(m[2].replace(',', '.')) });
      }
    }
    return out;
  }
  ns.parseMexicanTicket = parseMexicanTicket;

  /* ---------- OCR ---------- */
  async function scanReceipt(imageFile) {
    if (!imageFile) throw new Error('imageFile required');
    const w = await ensureWorker();
    const { data: { text } } = await w.recognize(imageFile);
    return parseMexicanTicket(text);
  }
  ns.scanReceipt = scanReceipt;

  /* ---------- API helper ---------- */
  async function createPurchaseFromOcr(parsed) {
    const token = (global.Volvix.auth && global.Volvix.auth.getToken && global.Volvix.auth.getToken()) || '';
    const r = await fetch('/api/purchases/from-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(parsed)
    });
    return r.json();
  }
  ns.createPurchaseFromOcr = createPurchaseFromOcr;

  /* ---------- UI ---------- */
  function openScannerUI(targetEl) {
    const root = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;
    if (!root) return;
    root.innerHTML = `
      <div class="volvix-ocr">
        <h3>Escanear ticket</h3>
        <input type="file" accept="image/*" capture="environment" id="vx-ocr-file"/>
        <img id="vx-ocr-preview" style="max-width:280px;display:none;margin:8px 0"/>
        <div id="vx-ocr-status" style="font-size:12px;color:#666"></div>
        <pre id="vx-ocr-text" style="max-height:160px;overflow:auto;background:#f6f6f6;padding:6px"></pre>
        <form id="vx-ocr-form" style="display:none">
          <label>RFC <input name="rfc"/></label>
          <label>Fecha <input name="date" type="date"/></label>
          <label>Total <input name="total" type="number" step="0.01"/></label>
          <button type="submit">Crear compra</button>
        </form>
      </div>`;
    const file = root.querySelector('#vx-ocr-file');
    const prev = root.querySelector('#vx-ocr-preview');
    const stat = root.querySelector('#vx-ocr-status');
    const txt  = root.querySelector('#vx-ocr-text');
    const form = root.querySelector('#vx-ocr-form');
    let lastParsed = null;

    file.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      prev.src = URL.createObjectURL(f); prev.style.display = 'block';
      stat.textContent = 'Procesando OCR...';
      try {
        lastParsed = await scanReceipt(f);
        txt.textContent = lastParsed.raw || '(sin texto)';
        form.rfc.value = lastParsed.rfc || '';
        form.date.value = lastParsed.date || '';
        form.total.value = lastParsed.total || '';
        form.style.display = 'block';
        stat.textContent = `Listo. ${lastParsed.items.length} items detectados.`;
      } catch (err) { stat.textContent = 'Error: ' + err.message; }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        ...lastParsed,
        rfc: form.rfc.value, date: form.date.value, total: Number(form.total.value)
      };
      stat.textContent = 'Creando compra...';
      const r = await createPurchaseFromOcr(payload);
      stat.textContent = r && r.id ? 'Compra creada: ' + r.id : 'Error: ' + JSON.stringify(r);
    });
  }
  ns.openScannerUI = openScannerUI;

})(typeof window !== 'undefined' ? window : globalThis);
