/**
 * volvix-import-wizard.js
 * Migración cero-teclas para clientes que vienen de otros sistemas POS.
 *
 * Soporta:
 *  - Imágenes (JPG/PNG) via Tesseract.js OCR (lazy load CDN)
 *  - PDF via pdf.js (lazy load CDN) + OCR fallback si es scaneado
 *  - Excel (.xlsx, .xls) via SheetJS xlsx (lazy load CDN)
 *  - Word (.docx) via mammoth.js (lazy load CDN)
 *  - PowerPoint (.pptx) lectura básica de slides (zip + xml regex)
 *  - CSV / TSV / TXT / JSON (parser inline)
 *  - SQL / SDF (regex INSERT INTO + heurística columnas)
 *  - Eleventa, MyBusinessPOS, Parrot, SoftRestaurant (heurísticas + fallback)
 *  - Cámara en vivo (getUserMedia → canvas → OCR)
 *
 * Seguridad: NUNCA ejecuta el archivo. Solo lectura. Magic bytes para detectar
 * tipo cuando la extensión está cambiada. Whitelist estricta de tipos. Sin eval.
 *
 * Public API:
 *   window.VolvixImport.openWizard()         — abre el modal
 *   window.VolvixImport.openWizardIfEmpty()  — abre solo si CATALOG está vacío
 */
(function (global) {
  'use strict';

  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
  const MAX_ROWS = 5000; // hard cap

  // Headers comunes a buscar (case-insensitive, normalizado sin acentos/espacios)
  const HDR_NAME     = ['nombre', 'name', 'producto', 'product', 'descripcion', 'description', 'articulo', 'article', 'descripciondelarticulo', 'item', 'productname'];
  const HDR_CODE     = ['codigo', 'code', 'codigodebarras', 'codigobarras', 'barcode', 'sku', 'upc', 'ean', 'plu', 'clave'];
  const HDR_PRICE    = ['precio', 'price', 'preciodeventa', 'preciovta', 'pventa', 'venta', 'pvp', 'preciopublico', 'preciofinal', 'precio2', 'preciofinal'];
  const HDR_COST     = ['costo', 'cost', 'preciocosto', 'pcosto', 'compra', 'preciocompra'];
  const HDR_STOCK    = ['stock', 'existencia', 'inventario', 'cantidad', 'qty', 'qtyonhand', 'almacen', 'piezas'];
  const HDR_CATEGORY = ['categoria', 'category', 'cat', 'depto', 'departamento', 'department', 'familia', 'rubro', 'tipo'];

  // Magic bytes para detectar tipo cuando la extensión está cambiada
  const MAGIC = [
    { type: 'pdf',   bytes: [0x25, 0x50, 0x44, 0x46] },             // %PDF
    { type: 'zip',   bytes: [0x50, 0x4B, 0x03, 0x04] },             // PK.. (xlsx/docx/pptx son zip)
    { type: 'jpg',   bytes: [0xFF, 0xD8, 0xFF] },
    { type: 'png',   bytes: [0x89, 0x50, 0x4E, 0x47] },
    { type: 'xls',   bytes: [0xD0, 0xCF, 0x11, 0xE0] },             // OLE2 (xls/mdb antiguo)
    { type: 'sdf',   bytes: [0xFD, 0xFF, 0xFF, 0xFF] },             // SQL CE
    { type: 'sqlite',bytes: [0x53, 0x51, 0x4C, 0x69] },             // SQLite
  ];

  function detectMagic(bytes) {
    for (const m of MAGIC) {
      let ok = true;
      for (let i = 0; i < m.bytes.length; i++) {
        if (bytes[i] !== m.bytes[i]) { ok = false; break; }
      }
      if (ok) return m.type;
    }
    return null;
  }

  function _normHdr(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_\-.]/g, '');
  }
  function _matchHdr(target, list) {
    const n = _normHdr(target);
    return list.some(h => n === h || n.includes(h));
  }
  function _findCol(headers, list) {
    if (!Array.isArray(headers)) return -1;
    for (let i = 0; i < headers.length; i++) {
      if (_matchHdr(headers[i], list)) return i;
    }
    return -1;
  }
  function _toNum(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^0-9.,-]/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ────────────────────────────────────────────────────────────────────
  // Lazy loader de scripts CDN (sin npm)
  // ────────────────────────────────────────────────────────────────────
  const _loadedLibs = {};
  function loadScript(url) {
    if (_loadedLibs[url]) return _loadedLibs[url];
    _loadedLibs[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ' + url));
      document.head.appendChild(s);
    });
    return _loadedLibs[url];
  }

  // ────────────────────────────────────────────────────────────────────
  // PARSERS
  // ────────────────────────────────────────────────────────────────────
  // CSV/TSV simple (auto-detect delimiter)
  function parseCSV(text) {
    if (!text) return [];
    // Detectar delimiter
    const sample = text.slice(0, 2000);
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    for (const c of sample) if (counts[c] !== undefined) counts[c]++;
    const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    return lines.map(line => {
      // Manejo simple de quoted strings
      const out = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === delim && !inQ) { out.push(cur); cur = ''; continue; }
        cur += c;
      }
      out.push(cur);
      return out.map(s => s.trim());
    });
  }

  // JSON (array de objetos o array de arrays)
  function parseJSON(text) {
    try {
      let j = JSON.parse(text);
      // 2026-05-10 fix: aceptar wrappers comunes — antes solo array root devolvía rows.
      // Casos reales que rechazaba: {products:[...]}, {items:[...]}, {data:[...]}.
      if (!Array.isArray(j) && j && typeof j === 'object') {
        const wrapKey = ['products','items','data','rows','menu','catalog','catalogo','productos'].find(k => Array.isArray(j[k]));
        if (wrapKey) j = j[wrapKey];
      }
      if (!Array.isArray(j)) return [];
      if (j.length && typeof j[0] === 'object' && !Array.isArray(j[0])) {
        const keys = Object.keys(j[0]);
        const rows = [keys];
        j.forEach(o => rows.push(keys.map(k => o[k] != null ? String(o[k]) : '')));
        return rows;
      }
      return j;
    } catch (_) { return []; }
  }

  // SQL: extrae INSERT INTO ... VALUES (...)
  function parseSQL(text) {
    const rows = [];
    // Tomar la PRIMERA tabla con INSERTs (heurística)
    const inserts = text.match(/INSERT\s+INTO\s+[`"\[]?([\w.]+)[`"\]]?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?=INSERT\s+INTO|$)/gi);
    if (!inserts || !inserts.length) return [];
    let headers = null;
    inserts.forEach(stmt => {
      const m = stmt.match(/\(([^)]+)\)\s*VALUES/i);
      if (!m) return;
      if (!headers) {
        headers = m[1].split(',').map(s => s.trim().replace(/[`"\[\]]/g, ''));
        rows.push(headers);
      }
      // Extraer cada tupla VALUES (...)
      const valuesPart = stmt.split(/VALUES/i)[1] || '';
      const tuples = valuesPart.match(/\(([^)]+)\)/g) || [];
      tuples.forEach(t => {
        const inner = t.slice(1, -1);
        const vals = [];
        let cur = '', inQ = false, qc = null;
        for (let i = 0; i < inner.length; i++) {
          const c = inner[i];
          if ((c === "'" || c === '"') && (!inQ || c === qc)) {
            if (inQ) { vals.push(cur); cur = ''; inQ = false; qc = null; }
            else { inQ = true; qc = c; }
            continue;
          }
          if (!inQ && c === ',') { if (cur.trim()) vals.push(cur.trim()); cur = ''; continue; }
          cur += c;
        }
        if (cur.trim()) vals.push(cur.trim());
        rows.push(vals);
      });
    });
    return rows;
  }

  // TXT con líneas estilo "Producto $precio"
  // 2026-05-10 fix #6: parser robusto para OCR de menús reales:
  //  · Acepta currencies €/$/¢/MXN/USD/MX$ antes o después del precio
  //  · Tolera separadores OCR (...., ___, ----, |) entre nombre y precio
  //  · Exige nombre con palabra inicial de 3+ letras (rechaza "y orégano…")
  //  · Rechaza descripciones largas con muchas comas (no son productos)
  //  · Filtra precios fuera de rango razonable (0.50 – 99,999)
  //  · Caso especial "Producto ........... $25" (líneas-puntos típicas de menú)
  function parseTXTHeuristic(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = [['nombre', 'precio']];
    // 2026-05-10 fix v2: regex GLOBAL no-anchored para capturar MULTIPLES
    // pares "Nombre ...... precio" en una sola línea (típico menu 2-columnas).
    // Patrón: palabra(s) que empiezan con 3+ letras + separadores + número.
    // Char class incluye em-dash (—) y en-dash (–) tanto en nombre como en
    // separador — son comunes en menús OCR ("Item ........— $25").
    // 2026-05-10 fix v3: 2 patrones combinados:
    //  1) PREFERIDO con currency $/€/¢ — captura "HOT CAKES $175" (1 espacio basta)
    //  2) FALLBACK con 2+ separadores — captura "Item ......... 25" (sin $)
    const reWithCurrency = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ][A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ0-9\s'&\/()\-—–]{2,80}?)\s*[\.\-_|—–]*\s*[$€¢]\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi;
    const reWithSeparators = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ][A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ\s'&\/()\-—–]{2,60}?)[\s\.\-_|—–]{2,}(?:MXN|USD|MX\$)?\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi;
    let matched = 0;
    function tryRegex(line, re) {
      const out = [];
      const reL = new RegExp(re.source, 'gi');
      let m;
      while ((m = reL.exec(line)) !== null) {
        let name = m[1].trim().replace(/[\.\-_|·•:,]+$/, '').replace(/^[\.\-_|·•:,\s]+/, '').trim();
        if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ]{3,}/.test(name)) continue;
        if (name.length > 50 && (name.match(/,/g) || []).length >= 3) continue;
        const price = parseFloat(m[2].replace(',', '.'));
        if (!isFinite(price) || price < 0.5 || price > 99999) continue;
        out.push([name, String(price)]);
      }
      return out;
    }
    lines.forEach(l => {
      if (l.length < 5) return;
      // 2026-05-10 fix: PDFs text-layer junta items con espacio sin \n —
      // pueden ser líneas de 5000+ chars. No descartar por longitud, dejar
      // que el regex global itere. Limit max razonable: 50000 (50KB linea).
      if (l.length > 50000) return;
      // Patrón 1: con currency — más confiable
      const r1 = tryRegex(l, reWithCurrency);
      if (r1.length > 0) {
        r1.forEach(p => { rows.push(p); matched++; });
      } else {
        // Fallback: separadores múltiples
        const r2 = tryRegex(l, reWithSeparators);
        r2.forEach(p => { rows.push(p); matched++; });
      }
    });
    return matched > 0 ? rows : [];
  }

  // Excel via SheetJS (CDN)
  async function parseXLSX(arrayBuffer) {
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    if (!global.XLSX) throw new Error('XLSX no disponible');
    const wb = global.XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }

  // Word .docx via mammoth
  async function parseDOCX(arrayBuffer) {
    await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
    if (!global.mammoth) throw new Error('mammoth no disponible');
    const result = await global.mammoth.extractRawText({ arrayBuffer });
    return parseTXTHeuristic(result.value || '');
  }

  // PDF via pdf.js — con fallback OCR para PDFs escaneados (sin text layer)
  // 2026-05-10 fix #11: muchos PDFs de menús son escaneos (todo es imagen).
  // pdf.js extrae texto de la text-layer, pero scanned PDFs no la tienen →
  // 0 chars → 0 productos. Fallback: si texto extraído < 50 chars total,
  // rasterizar cada página a canvas y pasar por parseImageOCR.
  async function parsePDF(arrayBuffer) {
    await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
    if (!global.pdfjsLib) throw new Error('pdf.js no disponible');
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const doc = await global.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    const maxPages = Math.min(doc.numPages, 20); // limit para no colgar en PDFs grandes
    const pages = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      pages.push(page);
      const tc = await page.getTextContent();
      text += tc.items.map(it => it.str).join(' ') + '\n';
    }
    // Si el text-layer extrajo muy poco, asumir PDF escaneado → OCR cada página
    if (text.trim().length < 50) {
      console.log('[wizard-ocr] PDF parece escaneado (', text.length, 'chars) → rasterizando ' + maxPages + ' páginas a OCR');
      let allRows = [['nombre', 'precio']];
      for (let i = 0; i < pages.length && i < 5; i++) { // limit 5 páginas para no quemar tiempo
        try {
          const page = pages[i];
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          const file = new File([blob], 'pdf-page-' + (i + 1) + '.png', { type: 'image/png' });
          const ocrRows = await parseImageOCR(file);
          if (Array.isArray(ocrRows) && ocrRows.length > 1) {
            // Skip header [0], append data rows
            allRows = allRows.concat(ocrRows.slice(1));
          }
        } catch (e) { console.warn('[wizard-ocr] PDF page ' + (i + 1) + ' OCR err', e.message); }
      }
      return allRows.length > 1 ? allRows : [];
    }
    return parseTXTHeuristic(text);
  }

  // ─── PRE-PROCESSOR de imagen (upscale + binarización) ──────────────
  // 2026-05-10 Sprint 1.5: imágenes pequeñas (<800px ancho) o de baja
  // calidad fallan en Tesseract por insuficiente densidad de pixeles.
  // Pre-procesamos: upscale a 1600+ ancho con smoothing alto + conversión
  // a B/N alto contraste para mejorar reconocimiento.
  async function _preprocessImage(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const w = bitmap.width, h = bitmap.height;
      // Si ya es razonable (>=900 ancho), no toques nada
      if (w >= 900) { bitmap.close && bitmap.close(); return file; }
      // Upscale 2-3x
      const scale = w < 400 ? 4 : w < 700 ? 3 : 2;
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = newW; c.height = newH;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, newW, newH);
      bitmap.close && bitmap.close();
      // Binarización SOLO si imagen es de fondo claro (papel blanco típico).
      // Imágenes con fondos artísticos/oscuros (menús reales fotografiados con
      // decoración) pierden info crítica al binarizar — mejor solo upscale.
      try {
        const imgData = ctx.getImageData(0, 0, newW, newH);
        const d = imgData.data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        const meanLum = sum / (d.length / 4);
        // Solo binarizar si fondo CLARO (>180 = casi blanco). En oscuros, skip.
        if (meanLum > 180) {
          const threshold = meanLum * 0.75;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
            const v = lum < threshold ? 0 : 255;
            d[i] = v; d[i+1] = v; d[i+2] = v;
          }
          ctx.putImageData(imgData, 0, 0);
        }
      } catch (_) { /* canvas tainted, skip binarization */ }
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      return new File([blob], 'preprocessed-' + (file.name || 'img.png'), { type: 'image/png' });
    } catch (e) {
      console.warn('[wizard-ocr] preprocess failed, usando original:', e.message);
      return file;
    }
  }

  // ─── PIPELINE MULTI-ENGINE OCR (Tier 1: offline + gratis) ───────────
  // 2026-05-10 Sprint 1: en lugar de un solo OCR, corre engines en paralelo
  // y arma rompecabezas con resultados parciales. Cada engine extrae lo que
  // puede; el merger toma el nombre más completo y el precio donde lo encuentre.
  //
  // Tier 1 (offline, funciona sin internet una vez cacheados los modelos):
  //   1a. window.TextDetector     - Native Chrome API ~50ms (si existe)
  //   1b. Tesseract.js spa+eng    - Default PSM=auto
  //   1c. Tesseract.js spa+eng    - PSM=11 sparse-text (mejor menus)
  //
  // Si Tier 1 ≥ 5 productos confiables → STOP. Si no, futuros tiers (2-4)
  // se llaman manualmente desde la UI con consentimiento del usuario.

  async function _engineNativeTextDetector(file) {
    if (typeof global.TextDetector !== 'function') return { engine: 'native-text', text: '', skipped: true };
    try {
      const td = new global.TextDetector();
      const bitmap = await createImageBitmap(file);
      const detections = await td.detect(bitmap);
      const text = detections.map(d => d.rawValue || '').join('\n');
      bitmap.close && bitmap.close();
      return { engine: 'native-text', text, ms: 0 };
    } catch (e) {
      return { engine: 'native-text', text: '', err: String(e).substring(0, 100) };
    }
  }

  // Tier 2: OCR.space API (online, free 25K/mes, mejores modelos para
  // imágenes de baja calidad). Llamado solo si Tier 1 < 3 productos buenos.
  async function _engineOCRSpace(file) {
    const t0 = Date.now();
    try {
      const fd = new FormData();
      fd.append('file', file, file.name || 'image.jpg');
      fd.append('language', 'spa');         // OCR.space soporta spa, eng, etc.
      fd.append('scale', 'true');            // auto-upscale
      fd.append('isTable', 'true');          // mejor estructura para menus
      fd.append('OCREngine', '2');           // engine 2 = mejor para variantes
      // API key 'helloworld' es la pública de OCR.space para tests/uso ligero
      // Reemplazar con key tuya en production (registro gratis en ocr.space)
      const r = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { 'apikey': 'helloworld' },
        body: fd
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.IsErroredOnProcessing) throw new Error(j.ErrorMessage || 'OCR.space error');
      const text = (j.ParsedResults || []).map(p => p.ParsedText || '').join('\n');
      return { engine: 'ocrspace-tier2', text, ms: Date.now() - t0 };
    } catch (e) {
      return { engine: 'ocrspace-tier2', text: '', err: String(e).substring(0, 100), ms: Date.now() - t0 };
    }
  }

  async function _engineTesseract(file, opts) {
    const t0 = Date.now();
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js');
      if (!global.Tesseract) throw new Error('Tesseract no disponible');
      const tessOpts = opts && opts.psm ? { tessedit_pageseg_mode: String(opts.psm) } : {};
      const r = await global.Tesseract.recognize(file, 'spa+eng', tessOpts);
      return { engine: opts && opts.label || 'tesseract-default', text: r.data.text || '', conf: r.data.confidence, ms: Date.now() - t0 };
    } catch (e) {
      return { engine: opts && opts.label || 'tesseract-default', text: '', err: String(e).substring(0, 100), ms: Date.now() - t0 };
    }
  }

  // Similitud de strings simple (Sørensen–Dice de bigramas) — sin libs
  function _similarity(a, b) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúüñ ]/gi, '').trim();
    a = norm(a); b = norm(b);
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bg = s => { const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out; };
    const A = bg(a), B = bg(b);
    let inter = 0;
    A.forEach(x => { if (B.has(x)) inter++; });
    return (2 * inter) / (A.size + B.size);
  }

  // Merge resultados de N engines en una lista única de productos
  function _mergeEngineResults(engineResults) {
    // Cada engine devuelve { engine, text }. Aplicamos parseTXTHeuristic a cada
    // texto, recolectamos productos, y luego deduplicamos por similitud.
    const buckets = []; // [{name, price, sources:[engineNames]}]
    engineResults.forEach(r => {
      if (!r.text) return;
      const rows = parseTXTHeuristic(r.text);
      if (!rows || rows.length < 2) return;
      // skipear header [0]
      for (let i = 1; i < rows.length; i++) {
        const [name, price] = rows[i];
        if (!name || name.length < 3) continue;
        // Buscar bucket existente por similitud
        const match = buckets.find(b => _similarity(b.name, name) >= 0.7);
        if (match) {
          // Tomar nombre más LARGO (más completo)
          if (name.length > match.name.length) match.name = name;
          // Tomar precio si el bucket no tenía o el nuevo > 0
          const np = parseFloat(price);
          if ((!match.price || match.price === 0) && isFinite(np) && np > 0) match.price = np;
          if (!match.sources.includes(r.engine)) match.sources.push(r.engine);
        } else {
          buckets.push({ name: name.trim(), price: parseFloat(price) || 0, sources: [r.engine] });
        }
      }
    });
    // Volver a formato rows [['nombre','precio'], ...]
    if (!buckets.length) return [];
    const out = [['nombre', 'precio']];
    buckets.forEach(b => out.push([b.name, String(b.price || 0)]));
    return out;
  }

  // Orquestador principal: Tier 1 en paralelo, luego merger
  async function parseImageOCR(file) {
    // Pre-procesar: upscale + binarización si la imagen es pequeña
    const processed = await _preprocessImage(file);
    if (processed !== file) console.log('[wizard-ocr] pre-processed', file.name, '→', processed.size, 'bytes');
    // Lanzar engines de Tier 1 en paralelo (cada uno tolera errores propios)
    const tasks = [
      _engineNativeTextDetector(processed),
      _engineTesseract(processed, { label: 'tesseract-auto' }),
      _engineTesseract(processed, { label: 'tesseract-sparse', psm: 11 }),
    ];
    const results = await Promise.all(tasks);
    if (typeof console !== 'undefined') {
      results.forEach(r => console.log('[wizard-ocr]', r.engine, '·', r.ms || 0, 'ms', '·', (r.text || '').length, 'chars', r.err ? '· ERR ' + r.err : ''));
    }
    // Si TODOS fallaron, lanzar error del último
    const anyText = results.some(r => r.text && r.text.length > 5);
    if (!anyText) {
      const lastErr = results.map(r => r.err).filter(Boolean).join(' | ');
      throw new Error('OCR fallo en todos los engines: ' + (lastErr || 'sin texto'));
    }
    // Merge de resultados Tier 1 → productos únicos
    let merged = _mergeEngineResults(results);
    const tier1Count = merged.length - 1; // -1 por el header
    console.log('[wizard-ocr] Tier 1 extrajo', tier1Count, 'productos');

    // Tier 2: si Tier 1 fue pobre (<3 productos) Y hay internet, llamar OCR.space
    if (tier1Count < 3 && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      console.log('[wizard-ocr] Tier 1 < 3 prods → escalando a Tier 2 OCR.space');
      try {
        const tier2 = await _engineOCRSpace(processed);
        console.log('[wizard-ocr]', tier2.engine, '·', tier2.ms, 'ms', '·', (tier2.text || '').length, 'chars', tier2.err ? '· ERR ' + tier2.err : '');
        if (tier2.text && tier2.text.length > 5) {
          // Re-merge incluyendo Tier 2
          merged = _mergeEngineResults([...results, tier2]);
        }
      } catch (e) { console.warn('[wizard-ocr] Tier 2 falló:', e.message); }
    }

    // Si merge produjo algo, retornar; sino fallback a heurística sobre el texto más largo
    if (merged.length > 1) return merged;
    const longest = results.reduce((a, b) => (a.text.length > b.text.length ? a : b));
    return parseTXTHeuristic(longest.text);
  }

  // 2026-05-10: auto-compresión transparente para archivos > 50MB.
  // Imágenes (jpg/png/webp/heic) → re-encodear con calidad reducida y resize si necesario.
  // Otros (PDF/DOCX/XLSX/etc) → no se pueden comprimir client-side; warn al usuario.
  // Documentación de límites:
  //  - Memoria browser móvil ~200-400MB total → archivos grandes la consumen toda
  //  - Tesseract.js carga la imagen a canvas: 4096x4096 RGBA = 64MB en RAM
  //  - PDF.js de igual forma rasteriza a canvas → consumo cuadrático con DPI
  //  - Tiempo: 50MB+ tarda 30+ seg sólo en cargar a memoria
  //  - No es restricción del SERVER (todo es client-side, nunca se sube original)
  //  - Es restricción de RECURSOS DEL DISPOSITIVO (RAM + CPU del browser)
  async function _autoCompressIfBig(file) {
    if (file.size <= MAX_FILE_BYTES) return file;
    const type = (file.type || '').toLowerCase();
    const ext = String(file.name || '').toLowerCase().split('.').pop();
    const isImage = type.startsWith('image/') || ['jpg','jpeg','png','webp','heic','heif'].includes(ext);
    if (!isImage) {
      // No se puede comprimir client-side → mostrar mensaje claro pero seguir intentando
      console.warn('[wizard] Archivo > 50MB no es imagen, intentando procesar tal cual:', file.size);
      return file;
    }
    try {
      const bitmap = await createImageBitmap(file);
      let w = bitmap.width, h = bitmap.height;
      // Reducir si exceso de pixeles (límite 4096 lado mayor)
      const maxSide = 4096;
      if (Math.max(w, h) > maxSide) {
        const scale = maxSide / Math.max(w, h);
        w = Math.round(w * scale); h = Math.round(h * scale);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close && bitmap.close();
      // Quality 0.7 para reducir tamaño manteniendo legibilidad OCR
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
      console.log('[wizard] auto-compresión:', (file.size/1024/1024).toFixed(1) + 'MB → ' + (blob.size/1024/1024).toFixed(1) + 'MB');
      return new File([blob], 'compressed-' + (file.name || 'image.jpg'), { type: 'image/jpeg' });
    } catch (e) {
      console.warn('[wizard] auto-compresión falló, usando original:', e.message);
      return file;
    }
  }

  // Dispatcher principal
  async function parseFile(file) {
    // 2026-05-10: auto-compresión transparente en lugar de rechazar
    file = await _autoCompressIfBig(file);
    const name = String(file.name || '').toLowerCase();
    const ext = name.split('.').pop();
    // Magic bytes
    const buf = await file.arrayBuffer();
    const magic = detectMagic(new Uint8Array(buf.slice(0, 8)));

    // Decisión por magic > extensión
    const kind = magic === 'pdf' ? 'pdf'
      : magic === 'jpg' || magic === 'png' ? 'image'
      : magic === 'zip' ? (ext === 'pptx' ? 'pptx' : ext === 'docx' ? 'docx' : 'xlsx')
      : (['csv','tsv','txt','log'].includes(ext)) ? 'text'
      : (ext === 'json') ? 'json'
      : (['sql','sdf','ddl'].includes(ext)) ? 'sql'
      : (['xlsx','xls','xlsm'].includes(ext)) ? 'xlsx'
      : (ext === 'docx') ? 'docx'
      : (ext === 'pptx') ? 'pptx'
      : (['jpg','jpeg','png','webp','heic','heif'].includes(ext)) ? 'image'
      : 'text'; // fallback: intentar como texto

    if (kind === 'image') return await parseImageOCR(file);
    if (kind === 'pdf')   return await parsePDF(buf);
    if (kind === 'xlsx')  return await parseXLSX(buf);
    if (kind === 'docx')  return await parseDOCX(buf);
    if (kind === 'pptx') {
      // 2026-05-10 fix #12: PPTX usa DEFLATE, parser zip casero solo lee
      // entries sin compresión → 0 chars. Usar JSZip que sí descomprime.
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        if (global.JSZip) {
          const zip = await global.JSZip.loadAsync(buf);
          let text = '';
          const slidePromises = [];
          zip.forEach((relPath, entry) => {
            if (/^ppt\/slides\/slide\d+\.xml$/.test(relPath)) {
              slidePromises.push(entry.async('string').then(s => { text += s + '\n'; }));
            }
          });
          await Promise.all(slidePromises);
          // Extraer solo el texto entre <a:t>...</a:t> (texto runs de PowerPoint)
          const textRuns = (text.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [])
            .map(m => m.replace(/<[^>]+>/g, ''))
            .join('\n');
          return parseTXTHeuristic(textRuns || text.replace(/<[^>]+>/g, ' '));
        }
      } catch (e) { console.warn('[wizard] PPTX JSZip falló, fallback parser casero', e.message); }
      // Fallback al parser casero si JSZip no carga
      const text = await _readZipTextEntries(buf, /ppt\/slides\/slide\d+\.xml$/);
      return parseTXTHeuristic(text.replace(/<[^>]+>/g, ' '));
    }
    if (kind === 'sql')  return parseSQL(new TextDecoder().decode(buf));
    if (kind === 'json') return parseJSON(new TextDecoder().decode(buf));
    // text/csv/tsv/txt
    const text = new TextDecoder().decode(buf);
    if (text.includes(',') || text.includes(';') || text.includes('\t')) return parseCSV(text);
    return parseTXTHeuristic(text);
  }

  // Mini lector zip → extraer texto de XML entries (para pptx sin libs)
  async function _readZipTextEntries(arrayBuffer, regex) {
    const u8 = new Uint8Array(arrayBuffer);
    let out = '';
    let i = 0;
    while (i < u8.length - 4) {
      // Local file header sig: 50 4B 03 04
      if (u8[i] === 0x50 && u8[i+1] === 0x4B && u8[i+2] === 0x03 && u8[i+3] === 0x04) {
        const compMethod = u8[i+8] | (u8[i+9] << 8);
        const compSize = u8[i+18] | (u8[i+19] << 8) | (u8[i+20] << 16) | (u8[i+21] << 24);
        const fnLen = u8[i+26] | (u8[i+27] << 8);
        const exLen = u8[i+28] | (u8[i+29] << 8);
        const fname = new TextDecoder().decode(u8.slice(i+30, i+30+fnLen));
        const dataStart = i + 30 + fnLen + exLen;
        if (regex.test(fname) && compMethod === 0) {
          out += new TextDecoder().decode(u8.slice(dataStart, dataStart + compSize)) + '\n';
        }
        // Avanzar (simple — no decodifica DEFLATE)
        i = dataStart + compSize;
      } else { i++; }
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────
  // NORMALIZER: rows → [{ name, code, price, cost, stock, category }]
  // ────────────────────────────────────────────────────────────────────
  function rowsToProducts(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return [];
    let headers = rows[0];
    let body = rows.slice(1);
    // Detectar si la 1ra fila es header o data (si todos son numéricos → no es header)
    const looksLikeHeader = headers.some(h => isNaN(parseFloat(h)) && String(h).length < 32);
    if (!looksLikeHeader) { body = rows; headers = headers.map((_, i) => 'col' + i); }

    const idx = {
      name:     _findCol(headers, HDR_NAME),
      code:     _findCol(headers, HDR_CODE),
      price:    _findCol(headers, HDR_PRICE),
      cost:     _findCol(headers, HDR_COST),
      stock:    _findCol(headers, HDR_STOCK),
      category: _findCol(headers, HDR_CATEGORY),
    };

    // Si no encontramos nombre, asumir col 0 = nombre, col 1 = precio (heurística)
    if (idx.name < 0) idx.name = 0;
    if (idx.price < 0 && headers.length >= 2) idx.price = 1;

    const out = [];
    body.slice(0, MAX_ROWS).forEach((row, rIdx) => {
      if (!Array.isArray(row)) return;
      const name = String(row[idx.name] || '').trim();
      if (!name || name.length > 200) return; // skip basura
      const product = {
        name,
        code:     idx.code     >= 0 ? String(row[idx.code] || '').trim()     : '',
        price:    idx.price    >= 0 ? _toNum(row[idx.price])                 : 0,
        cost:     idx.cost     >= 0 ? _toNum(row[idx.cost])                  : 0,
        stock:    idx.stock    >= 0 ? Math.round(_toNum(row[idx.stock]))     : 0,
        category: idx.category >= 0 ? String(row[idx.category] || '').trim() : '',
        _row: rIdx + 1
      };
      out.push(product);
    });
    return out;
  }

  // ────────────────────────────────────────────────────────────────────
  // UI MODAL
  // ────────────────────────────────────────────────────────────────────
  let _state = { products: [], file: null, parsing: false };

  function _injectStyles() {
    if (document.getElementById('vlx-import-styles')) return;
    const s = document.createElement('style');
    s.id = 'vlx-import-styles';
    s.textContent = `
      #volvix-import-modal{position:fixed;inset:0;background:rgba(15,23,42,.7);display:flex;align-items:center;justify-content:center;z-index:99996;padding:18px;backdrop-filter:blur(4px);font-family:-apple-system,Segoe UI,Roboto,sans-serif}
      #volvix-import-card{background:#fff;border-radius:14px;width:100%;max-width:880px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
      .volvix-imp-head{padding:18px 22px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,#f0fdf4,#dbeafe)}
      .volvix-imp-h{margin:0;font-size:18px;font-weight:700;color:#0f172a}
      .volvix-imp-sub{margin:3px 0 0;font-size:12px;color:#475569}
      .volvix-imp-x{background:transparent;border:0;font-size:22px;cursor:pointer;color:#64748b;padding:4px 10px;border-radius:6px}
      .volvix-imp-x:hover{background:rgba(0,0,0,.06)}
      .volvix-imp-body{flex:1;overflow:auto;padding:22px}
      .volvix-imp-foot{padding:14px 22px;border-top:1px solid #e5e7eb;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;gap:10px}
      .volvix-imp-foot .info{font-size:11.5px;color:#64748b}
      .volvix-imp-btn{padding:9px 16px;border:1px solid #d1d5db;background:#fff;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;color:#0f172a}
      .volvix-imp-btn.primary{background:#10b981;color:#fff;border-color:#059669}
      .volvix-imp-btn:disabled{opacity:.5;cursor:not-allowed}
      .volvix-imp-2cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media(min-width:920px){.volvix-imp-2cards{grid-template-columns:1fr 1fr 1fr 1fr}}
      @media(max-width:640px){.volvix-imp-2cards{grid-template-columns:1fr}}
      .volvix-imp-card-opt{border:2px dashed #cbd5e1;border-radius:12px;padding:32px 22px;text-align:center;cursor:pointer;transition:all .15s;background:#fff}
      .volvix-imp-card-opt:hover{border-color:#10b981;background:#f0fdf4;transform:translateY(-2px)}
      .volvix-imp-card-opt.dragover{border-color:#10b981;background:#f0fdf4}
      .volvix-imp-card-ico{font-size:48px;margin-bottom:8px}
      .volvix-imp-card-t{font-weight:700;font-size:15px;color:#0f172a;margin-bottom:4px}
      .volvix-imp-card-d{font-size:12px;color:#64748b;line-height:1.5}
      .volvix-imp-formats{font-size:10.5px;color:#94a3b8;margin-top:8px;font-family:ui-monospace,monospace}
      .volvix-imp-progress{padding:60px 20px;text-align:center}
      .volvix-imp-progress .spin{display:inline-block;width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#10b981;border-radius:50%;animation:volvix-imp-spin 1s linear infinite;margin-bottom:12px}
      @keyframes volvix-imp-spin{to{transform:rotate(360deg)}}
      .volvix-imp-table-wrap{overflow:auto;max-height:48vh;border:1px solid #e5e7eb;border-radius:8px}
      .volvix-imp-table{width:100%;border-collapse:collapse;font-size:13px;background:#fff}
      .volvix-imp-table th{position:sticky;top:0;background:#f8fafc;text-align:left;padding:8px 10px;border-bottom:2px solid #e5e7eb;font-weight:700;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#475569;z-index:1}
      .volvix-imp-table td{padding:0;border-bottom:1px solid #f1f5f9;vertical-align:middle}
      .volvix-imp-table td input{border:0;background:transparent;width:100%;padding:8px 10px;font:inherit;color:#0f172a;outline:none}
      .volvix-imp-table td input:focus{background:#fffbeb;outline:1px solid #f59e0b}
      .volvix-imp-table tr:hover td{background:#f9fafb}
      .volvix-imp-row-del{background:transparent;border:0;color:#ef4444;cursor:pointer;font-size:16px;padding:4px 8px}
      .volvix-imp-stat{display:flex;gap:14px;font-size:12px;color:#475569;margin-bottom:10px}
      .volvix-imp-stat b{color:#0f172a;font-weight:700}
      #volvix-cam-video{width:100%;max-width:480px;display:block;margin:0 auto;border-radius:8px;background:#000}
      #volvix-cam-canvas{display:none}
      .volvix-cam-actions{display:flex;gap:10px;justify-content:center;margin-top:12px}
      .volvix-msg{margin-top:10px;padding:8px 12px;border-radius:6px;font-size:12.5px}
      .volvix-msg.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
      .volvix-msg.ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
    `;
    document.head.appendChild(s);
  }

  function openWizard() {
    _injectStyles();
    _state = { products: [], file: null, parsing: false };
    let modal = document.getElementById('volvix-import-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'volvix-import-modal';
    modal.innerHTML = `
      <div id="volvix-import-card">
        <div class="volvix-imp-head">
          <div>
            <h2 class="volvix-imp-h">📥 Importar productos</h2>
            <p class="volvix-imp-sub">Migra tu inventario sin teclear nada — desde tu sistema anterior, una foto del menú, o un archivo de Excel</p>
          </div>
          <button class="volvix-imp-x" id="volvix-imp-close" aria-label="Cerrar">×</button>
        </div>
        <div class="volvix-imp-body" id="volvix-imp-body"></div>
        <div class="volvix-imp-foot">
          <div class="info" id="volvix-imp-info">Solo lectura · nunca ejecutamos el archivo · auto-comprime imágenes &gt; 50MB</div>
          <div id="volvix-imp-actions"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    // 2026-05-10 anti-hide: algún wiring del POS inyecta `display:none !important`
    // a elementos floater no autorizados. Forzamos display:flex con !important via
    // setProperty para sobrescribir cualquier conflicto, y re-aplicamos cada 250ms
    // por 2s en caso de que un MutationObserver lo vuelva a ocultar.
    function _forceShow() {
      try {
        modal.style.setProperty('display', 'flex', 'important');
        modal.style.setProperty('visibility', 'visible', 'important');
        modal.style.setProperty('opacity', '1', 'important');
        modal.style.setProperty('z-index', '99999', 'important');
        modal.removeAttribute('aria-hidden');
        modal.classList.remove('vlx-feature-hidden', 'vlx-coming-soon', 'tv-hidden');
      } catch (_) {}
    }
    _forceShow();
    let _showTries = 0;
    const _showInt = setInterval(() => { _forceShow(); if (++_showTries > 8) clearInterval(_showInt); }, 250);

    document.getElementById('volvix-imp-close').addEventListener('click', closeWizard);
    modal.addEventListener('click', e => { if (e.target === modal) closeWizard(); });
    document.addEventListener('keydown', _escHandler);
    renderStep1();
  }

  function _escHandler(e) {
    if (e.key === 'Escape' && document.getElementById('volvix-import-modal')) closeWizard();
  }

  function closeWizard() {
    const m = document.getElementById('volvix-import-modal');
    if (m) m.remove();
    document.removeEventListener('keydown', _escHandler);
    try { _stopCamera(); } catch (_) {}
  }

  // STEP 1: pick source (file or camera)
  function renderStep1() {
    const body = document.getElementById('volvix-imp-body');
    const acts = document.getElementById('volvix-imp-actions');
    body.innerHTML = `
      <div class="volvix-imp-2cards">
        <div class="volvix-imp-card-opt" id="volvix-opt-file" tabindex="0">
          <div class="volvix-imp-card-ico">📁</div>
          <div class="volvix-imp-card-t">Subir archivo</div>
          <div class="volvix-imp-card-d">Selecciona o arrastra cualquier archivo aquí</div>
          <div class="volvix-imp-formats">Excel · CSV · PDF · Word · PowerPoint · Imagen · TXT · SQL · Eleventa · Parrot · MyBusinessPOS · SoftRestaurant</div>
          <input type="file" id="volvix-imp-file" accept=".xlsx,.xls,.csv,.tsv,.txt,.log,.json,.pdf,.docx,.pptx,.sql,.sdf,.jpg,.jpeg,.png,.webp,.heic,.heif" style="display:none;">
        </div>
        <div class="volvix-imp-card-opt" id="volvix-opt-cam" tabindex="0">
          <div class="volvix-imp-card-ico">📷</div>
          <div class="volvix-imp-card-t">Tomar fotografía</div>
          <div class="volvix-imp-card-d">Apunta tu cámara al menú o lista de precios</div>
          <div class="volvix-imp-formats">OCR español + inglés · funciona offline</div>
        </div>
        <div class="volvix-imp-card-opt" id="volvix-opt-template" tabindex="0">
          <div class="volvix-imp-card-ico">✨</div>
          <div class="volvix-imp-card-t">No lo tengo</div>
          <div class="volvix-imp-card-d">Empieza con 10 productos base de tu giro</div>
          <div class="volvix-imp-formats">Edita después · ahorra capturar desde cero</div>
        </div>
        <div class="volvix-imp-card-opt" id="volvix-opt-blank" tabindex="0">
          <div class="volvix-imp-card-ico">📝</div>
          <div class="volvix-imp-card-t">Empezar en blanco</div>
          <div class="volvix-imp-card-d">Yo agregaré manualmente todos los productos</div>
          <div class="volvix-imp-formats">Tabla vacía editable · 0 productos al inicio</div>
        </div>
      </div>
      <div id="volvix-imp-msg"></div>
    `;
    acts.innerHTML = '';
    const fileCard = document.getElementById('volvix-opt-file');
    const fileInput = document.getElementById('volvix-imp-file');
    const camCard = document.getElementById('volvix-opt-cam');
    const tplCard = document.getElementById('volvix-opt-template');
    const blankCard = document.getElementById('volvix-opt-blank');
    fileCard.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) handleFile(f);
    });
    // Drag & drop
    fileCard.addEventListener('dragover', e => { e.preventDefault(); fileCard.classList.add('dragover'); });
    fileCard.addEventListener('dragleave', () => fileCard.classList.remove('dragover'));
    fileCard.addEventListener('drop', e => {
      e.preventDefault();
      fileCard.classList.remove('dragover');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    camCard.addEventListener('click', renderCamera);
    tplCard.addEventListener('click', _useBaseTemplate);
    if (blankCard) blankCard.addEventListener('click', _startBlank);
  }

  // 2026-05-10: empezar en blanco con 1 fila vacía editable
  function _startBlank() {
    const blank = [{
      name: '', code: '', price: 0, cost: 0, stock: 0, category: '', _row: 1
    }];
    renderEditTable(blank);
    if (typeof _showMsg === 'function') _showMsg('📝 Empieza a agregar productos. Edita la fila o presiona "+ agregar fila" para añadir más.', 'ok');
  }

  // 2026-05-10 user-request: si el cliente no tiene catálogo, ofrecer 10
  // productos base del giro (abarrotes, restaurante, etc.) para arrancar.
  // Detecta giro vía 3 fuentes (en orden):
  //   1. window.__volvixGiroData.slug (set por applyModuleRenames al boot)
  //   2. /api/app/config?t=<tenant> giro.slug (fetch on-demand si no existe)
  //   3. fallback 'general'
  async function _useBaseTemplate() {
    const TEMPLATES = {
      abarrotes: [
        ['Bebidas', 'Coca Cola 600ml', 12, 18, 50],
        ['Bebidas', 'Pepsi 600ml', 11, 17, 30],
        ['Bebidas', 'Agua Ciel 1L', 8, 14, 40],
        ['Botanas', 'Sabritas Original', 8, 15, 40],
        ['Botanas', 'Doritos Nacho', 9, 16, 35],
        ['Panaderia', 'Pan Bimbo Grande', 28, 42, 12],
        ['Lacteos', 'Leche Lala 1L', 18, 28, 25],
        ['Abarrotes', 'Huevo Docena', 32, 48, 20],
        ['Abarrotes', 'Arroz Verde Valle 1kg', 22, 32, 18],
        ['Abarrotes', 'Frijol Bayo 1kg', 28, 40, 15],
      ],
      restaurante: [
        ['Tacos', 'Tacos al Pastor', 12, 25, 100],
        ['Tacos', 'Tacos de Suadero', 11, 25, 80],
        ['Antojitos', 'Quesadilla de Queso', 15, 30, 60],
        ['Antojitos', 'Sope con Frijol', 18, 35, 40],
        ['Hamburguesas', 'Hamburguesa Sencilla', 40, 80, 30],
        ['Hamburguesas', 'Hamburguesa Doble', 55, 110, 25],
        ['Bebidas', 'Refresco 600ml', 12, 25, 80],
        ['Bebidas', 'Agua de Horchata', 8, 20, 60],
        ['Bebidas', 'Café Americano', 10, 25, 50],
        ['Postres', 'Pastel de Chocolate', 30, 60, 15],
      ],
      farmacia: [
        ['Analgesicos', 'Paracetamol 500mg 10pzs', 18, 35, 100],
        ['Analgesicos', 'Ibuprofeno 400mg 10pzs', 22, 42, 80],
        ['Antigripales', 'Tafil C 24pzs', 28, 55, 60],
        ['Vitaminas', 'Vitamina C 30 tabs', 35, 70, 40],
        ['Cuidado personal', 'Shampoo H&S 400ml', 60, 120, 30],
        ['Cuidado personal', 'Pasta Colgate 100ml', 22, 45, 50],
        ['Higiene', 'Papel Higienico 4 rollos', 38, 72, 80],
        ['Higiene', 'Toallas Femeninas 10pzs', 28, 55, 60],
        ['Bebes', 'Pañales Huggies M 30pzs', 220, 380, 20],
        ['Bebes', 'Toallitas Húmedas 80pzs', 38, 72, 40],
      ],
      papeleria: [
        ['Cuadernos', 'Cuaderno Profesional 100h', 28, 55, 100],
        ['Cuadernos', 'Cuaderno Italiano 100h', 24, 48, 80],
        ['Escritura', 'Lápiz Mirado #2', 4, 8, 200],
        ['Escritura', 'Bolígrafo Bic Negro', 5, 10, 150],
        ['Escritura', 'Marcador Sharpie', 22, 45, 60],
        ['Oficina', 'Hojas Bond Carta 500hjs', 90, 165, 40],
        ['Oficina', 'Folder Manila Carta', 4, 8, 200],
        ['Útiles', 'Tijeras Escolares', 15, 30, 50],
        ['Útiles', 'Pegamento Resistol Blanco', 12, 25, 60],
        ['Útiles', 'Calculadora Casio Básica', 75, 150, 20],
      ],
      minisuper: [
        ['Bebidas', 'Coca Cola 600ml', 12, 18, 50],
        ['Bebidas', 'Cerveza Tecate 355ml', 14, 22, 80],
        ['Botanas', 'Sabritas Original 45g', 8, 15, 40],
        ['Lacteos', 'Leche Lala 1L', 18, 28, 25],
        ['Lacteos', 'Yogurt Danone 150g', 10, 18, 40],
        ['Abarrotes', 'Pan Bimbo Grande', 28, 42, 12],
        ['Abarrotes', 'Aceite Capullo 1L', 38, 58, 18],
        ['Hogar', 'Detergente Foca 1kg', 28, 45, 30],
        ['Hogar', 'Papel Higiénico 4 rollos', 38, 65, 40],
        ['Cigarros', 'Marlboro Caja', 65, 80, 50],
      ],
      ropa: [
        ['Caballero', 'Playera Básica', 80, 180, 30],
        ['Caballero', 'Pantalón Mezclilla', 220, 480, 20],
        ['Caballero', 'Camisa Vestir', 180, 380, 15],
        ['Dama', 'Blusa Casual', 120, 280, 25],
        ['Dama', 'Vestido Verano', 250, 550, 12],
        ['Dama', 'Pantalón Mezclilla Dama', 200, 450, 20],
        ['Niños', 'Conjunto Infantil', 120, 250, 18],
        ['Calzado', 'Zapato Caballero', 350, 700, 10],
        ['Calzado', 'Tenis Deportivo', 450, 950, 15],
        ['Accesorios', 'Cinturón Piel', 80, 180, 25],
      ],
      ferreteria: [
        ['Herramientas', 'Martillo 16oz', 80, 150, 20],
        ['Herramientas', 'Desarmador Plano #3', 25, 50, 40],
        ['Herramientas', 'Pinzas de Mecánico', 65, 130, 25],
        ['Herramientas', 'Llave Stilson 14"', 180, 350, 12],
        ['Tornillería', 'Tornillo 1/2" x 100pz', 35, 75, 50],
        ['Tornillería', 'Clavo 3" 1kg', 28, 55, 40],
        ['Eléctrico', 'Cable Cal 12 metro', 18, 32, 100],
        ['Eléctrico', 'Foco LED 9W', 35, 70, 80],
        ['Plomería', 'Tubo PVC 1/2" 6m', 45, 90, 30],
        ['Pintura', 'Pintura Vinil 4L', 280, 480, 20],
      ],
      carniceria: [
        ['Res', 'Bistec de Res kg', 180, 240, 30],
        ['Res', 'Molida de Res kg', 130, 180, 50],
        ['Res', 'Costilla de Res kg', 150, 200, 25],
        ['Cerdo', 'Chuleta de Cerdo kg', 110, 160, 40],
        ['Cerdo', 'Pierna de Cerdo kg', 95, 140, 30],
        ['Cerdo', 'Costilla de Cerdo kg', 140, 190, 25],
        ['Pollo', 'Pollo Entero kg', 75, 110, 40],
        ['Pollo', 'Pechuga de Pollo kg', 110, 160, 50],
        ['Pollo', 'Pierna y Muslo kg', 65, 95, 40],
        ['Embutidos', 'Chorizo Argentino kg', 95, 150, 20],
      ],
      pasteleria: [
        ['Pasteles', 'Pastel 3 Leches Chico', 180, 350, 8],
        ['Pasteles', 'Pastel Chocolate Mediano', 280, 520, 6],
        ['Pasteles', 'Pastel Frutos Rojos', 320, 600, 5],
        ['Cupcakes', 'Cupcake Vainilla', 25, 45, 30],
        ['Cupcakes', 'Cupcake Red Velvet', 30, 55, 25],
        ['Galletas', 'Galleta Avena docena', 60, 120, 20],
        ['Galletas', 'Galleta Chispa Choco docena', 65, 130, 20],
        ['Pan', 'Concha Tradicional', 8, 15, 50],
        ['Pan', 'Bolillo', 3, 6, 100],
        ['Bebidas', 'Café Americano', 18, 35, 60],
      ],
      cafeteria: [
        ['Café Caliente', 'Café Americano', 18, 35, 100],
        ['Café Caliente', 'Capuccino', 25, 50, 100],
        ['Café Caliente', 'Latte', 28, 55, 100],
        ['Café Frío', 'Frappé Mocha', 35, 70, 80],
        ['Café Frío', 'Cold Brew', 30, 60, 80],
        ['Té', 'Té Verde', 18, 35, 50],
        ['Pastel', 'Cheesecake rebanada', 45, 90, 20],
        ['Pastel', 'Brownie', 25, 50, 25],
        ['Sandwich', 'Sandwich Pollo', 55, 110, 30],
        ['Sandwich', 'Sandwich Vegetal', 50, 100, 25],
      ],
      taqueria: [
        ['Tacos', 'Taco al Pastor', 10, 20, 200],
        ['Tacos', 'Taco de Suadero', 11, 22, 150],
        ['Tacos', 'Taco de Bistec', 13, 25, 150],
        ['Tacos', 'Taco de Longaniza', 10, 20, 100],
        ['Tacos', 'Gringa de Pastor', 35, 70, 80],
        ['Especialidades', 'Quesadilla Sencilla', 18, 35, 100],
        ['Especialidades', 'Volcan de Pastor', 20, 40, 80],
        ['Especialidades', 'Alambre Mixto', 60, 120, 50],
        ['Bebidas', 'Refresco 600ml', 12, 25, 100],
        ['Bebidas', 'Agua de Horchata 1L', 15, 30, 60],
      ],
      pizzeria: [
        ['Pizzas', 'Pizza Hawaiana Mediana', 90, 180, 50],
        ['Pizzas', 'Pizza Pepperoni Mediana', 95, 190, 50],
        ['Pizzas', 'Pizza Mexicana Grande', 130, 260, 40],
        ['Pizzas', 'Pizza Cuatro Quesos Grande', 140, 280, 40],
        ['Pastas', 'Spaghetti Boloñesa', 55, 110, 30],
        ['Pastas', 'Lasaña de Carne', 70, 140, 25],
        ['Complementos', 'Pan con Ajo', 22, 45, 60],
        ['Complementos', 'Alitas BBQ 8pz', 75, 150, 40],
        ['Bebidas', 'Refresco 2L', 25, 50, 80],
        ['Bebidas', 'Cerveza Corona 355ml', 18, 35, 100],
      ],
      panaderia: [
        ['Pan Dulce', 'Concha de Vainilla', 4, 9, 200],
        ['Pan Dulce', 'Cuernito', 5, 10, 150],
        ['Pan Dulce', 'Oreja', 5, 11, 150],
        ['Pan Dulce', 'Mantecada', 4, 8, 200],
        ['Pan Salado', 'Bolillo', 2, 4, 300],
        ['Pan Salado', 'Telera', 2, 4, 250],
        ['Pasteles', 'Pastel Tres Leches Rebanada', 22, 45, 40],
        ['Pasteles', 'Pay de Queso Rebanada', 20, 40, 40],
        ['Galletas', 'Polvorón Tricolor', 4, 8, 200],
        ['Galletas', 'Galleta de Nuez', 5, 10, 150],
      ],
      heladeria: [
        ['Helados', 'Cono Sencillo Vainilla', 15, 30, 100],
        ['Helados', 'Cono Doble Chocolate', 22, 45, 100],
        ['Helados', 'Bola Extra', 12, 25, 200],
        ['Helados', 'Banana Split', 50, 100, 40],
        ['Paletas', 'Paleta de Agua Limón', 7, 15, 150],
        ['Paletas', 'Paleta de Crema Fresa', 10, 20, 150],
        ['Postres', 'Sundae Caramelo', 30, 60, 60],
        ['Postres', 'Crepa de Cajeta', 35, 70, 50],
        ['Bebidas', 'Malteada Chocolate', 30, 60, 60],
        ['Bebidas', 'Frappé de Café', 32, 65, 60],
      ],
      tortilleria: [
        ['Tortillas', 'Tortilla de Maíz 1kg', 12, 23, 200],
        ['Tortillas', 'Tortilla de Maíz 1/2kg', 6, 12, 200],
        ['Tortillas', 'Tortilla de Harina Chica 1pq', 14, 28, 100],
        ['Tortillas', 'Tortilla de Harina Grande 1pq', 22, 45, 100],
        ['Masa', 'Masa para Tortilla 1kg', 10, 18, 80],
        ['Masa', 'Masa para Tamal 1kg', 18, 35, 50],
        ['Antojitos', 'Sope Crudo Pza', 3, 6, 150],
        ['Antojitos', 'Tlacoyo Crudo Pza', 5, 10, 100],
        ['Botanas', 'Totopos 250g', 12, 25, 80],
        ['Botanas', 'Chicharrón de Harina 100g', 8, 18, 100],
      ],
      barberia: [
        ['Cortes', 'Corte de Cabello Caballero', 60, 120, 0],
        ['Cortes', 'Corte Niño', 50, 100, 0],
        ['Cortes', 'Corte Fade', 75, 150, 0],
        ['Barba', 'Arreglo de Barba', 50, 100, 0],
        ['Barba', 'Afeitado Clásico', 60, 120, 0],
        ['Barba', 'Diseño de Barba', 75, 150, 0],
        ['Tratamientos', 'Mascarilla Facial', 90, 180, 0],
        ['Tratamientos', 'Lavado y Peinado', 40, 80, 0],
        ['Productos', 'Cera para Cabello 100g', 60, 130, 30],
        ['Productos', 'Aceite para Barba 30ml', 95, 190, 25],
      ],
      estetica: [
        ['Cabello', 'Corte Dama', 90, 180, 0],
        ['Cabello', 'Tinte Completo', 250, 500, 0],
        ['Cabello', 'Mechas / Rayitos', 350, 700, 0],
        ['Cabello', 'Alaciado Permanente', 500, 1000, 0],
        ['Tratamientos', 'Hidratación Capilar', 150, 300, 0],
        ['Tratamientos', 'Peinado de Evento', 200, 400, 0],
        ['Maquillaje', 'Maquillaje Social', 250, 500, 0],
        ['Maquillaje', 'Maquillaje de Novia', 700, 1400, 0],
        ['Productos', 'Shampoo Profesional 500ml', 120, 240, 20],
        ['Productos', 'Mascarilla Capilar 250ml', 90, 180, 20],
      ],
      spa: [
        ['Masajes', 'Masaje Relajante 60min', 350, 700, 0],
        ['Masajes', 'Masaje Descontracturante 60min', 400, 800, 0],
        ['Masajes', 'Masaje con Piedras Calientes', 500, 1000, 0],
        ['Faciales', 'Limpieza Facial Profunda', 400, 800, 0],
        ['Faciales', 'Facial Antiedad', 500, 1000, 0],
        ['Corporales', 'Exfoliación Corporal', 350, 700, 0],
        ['Corporales', 'Envoltura de Chocolate', 450, 900, 0],
        ['Paquetes', 'Paquete Día de Spa', 950, 1900, 0],
        ['Paquetes', 'Paquete Pareja', 900, 1800, 0],
        ['Productos', 'Aceite Esencial Lavanda 50ml', 90, 180, 20],
      ],
      nails: [
        ['Manicure', 'Manicure Tradicional', 60, 120, 0],
        ['Manicure', 'Manicure con Gelish', 100, 200, 0],
        ['Manicure', 'Uñas Acrílicas', 200, 400, 0],
        ['Manicure', 'Retoque de Acrílicas', 125, 250, 0],
        ['Pedicure', 'Pedicure Spa', 125, 250, 0],
        ['Pedicure', 'Pedicure con Gelish', 150, 300, 0],
        ['Diseños', 'Decoración por Uña', 8, 15, 0],
        ['Diseños', 'Encapsulado por Uña', 12, 25, 0],
        ['Productos', 'Esmalte Gel 15ml', 50, 110, 30],
        ['Productos', 'Lima Profesional', 15, 35, 50],
      ],
      tatuajes: [
        ['Tatuajes', 'Tatuaje Mini (5cm)', 350, 700, 0],
        ['Tatuajes', 'Tatuaje Chico (10cm)', 600, 1200, 0],
        ['Tatuajes', 'Tatuaje Mediano (15cm)', 900, 1800, 0],
        ['Tatuajes', 'Tatuaje Hora de Trabajo', 500, 1000, 0],
        ['Tatuajes', 'Cover Up por Sesión', 800, 1600, 0],
        ['Perforaciones', 'Perforación Lóbulo', 75, 150, 0],
        ['Perforaciones', 'Perforación Cartílago', 125, 250, 0],
        ['Perforaciones', 'Perforación Septum', 200, 400, 0],
        ['Cuidados', 'Pomada Cicatrizante 30g', 55, 120, 30],
        ['Joyería', 'Arete de Titanio', 90, 180, 50],
      ],
      clinica_dental: [
        ['Consultas', 'Consulta y Diagnóstico', 100, 200, 0],
        ['Limpieza', 'Limpieza Dental Simple', 350, 700, 0],
        ['Limpieza', 'Limpieza Profunda', 600, 1200, 0],
        ['Restauración', 'Resina Dental', 400, 800, 0],
        ['Restauración', 'Extracción Simple', 350, 700, 0],
        ['Restauración', 'Endodoncia Unirradicular', 900, 1800, 0],
        ['Estética', 'Blanqueamiento Dental', 1000, 2000, 0],
        ['Estética', 'Carilla de Resina', 950, 1900, 0],
        ['Ortodoncia', 'Consulta de Ortodoncia', 150, 300, 0],
        ['Ortodoncia', 'Ajuste Mensual de Brackets', 350, 700, 0],
      ],
      veterinaria: [
        ['Consultas', 'Consulta General', 150, 300, 0],
        ['Consultas', 'Consulta de Urgencia', 250, 500, 0],
        ['Vacunas', 'Vacuna Antirrábica', 75, 150, 50],
        ['Vacunas', 'Vacuna Múltiple Canina', 200, 400, 30],
        ['Servicios', 'Baño y Corte', 175, 350, 0],
        ['Servicios', 'Desparasitación', 90, 180, 0],
        ['Alimento', 'Croqueta Adulto 4kg', 280, 550, 25],
        ['Alimento', 'Croqueta Cachorro 2kg', 180, 350, 25],
        ['Accesorios', 'Collar Antipulgas', 175, 350, 20],
        ['Accesorios', 'Correa Reforzada', 90, 180, 30],
      ],
      optica: [
        ['Armazones', 'Armazón Básico Acetato', 250, 500, 30],
        ['Armazones', 'Armazón Metálico', 350, 700, 30],
        ['Armazones', 'Armazón de Diseñador', 900, 1800, 15],
        ['Armazones', 'Armazón Infantil', 200, 400, 25],
        ['Lentes', 'Lente Monofocal CR-39', 250, 500, 50],
        ['Lentes', 'Lente Antirreflejante', 450, 900, 40],
        ['Lentes', 'Lente Bifocal', 600, 1200, 30],
        ['Lentes', 'Lente Progresivo', 1000, 2000, 20],
        ['Servicios', 'Examen de la Vista', 100, 200, 0],
        ['Accesorios', 'Estuche Rígido', 35, 70, 50],
      ],
      polleria: [
        ['Pollo Crudo', 'Pollo Entero Kg', 60, 95, 50],
        ['Pollo Crudo', 'Pechuga sin Hueso Kg', 90, 150, 40],
        ['Pollo Crudo', 'Pierna y Muslo Kg', 55, 90, 40],
        ['Pollo Crudo', 'Alas de Pollo Kg', 50, 85, 30],
        ['Pollo Crudo', 'Milanesa de Pollo Kg', 100, 165, 30],
        ['Vísceras', 'Hígado de Pollo Kg', 35, 65, 20],
        ['Vísceras', 'Mollejas Kg', 40, 75, 20],
        ['Preparados', 'Pollo Marinado Adobo Kg', 95, 160, 25],
        ['Huevo', 'Huevo Blanco Kg', 35, 55, 60],
        ['Huevo', 'Huevo Cartón 30pz', 75, 120, 40],
      ],
      fruteria: [
        ['Frutas', 'Manzana Roja Kg', 25, 45, 60],
        ['Frutas', 'Plátano Tabasco Kg', 12, 22, 80],
        ['Frutas', 'Naranja Valencia Kg', 10, 20, 80],
        ['Frutas', 'Papaya Maradol Kg', 18, 35, 40],
        ['Frutas', 'Sandía Kg', 12, 22, 50],
        ['Verduras', 'Jitomate Saladet Kg', 15, 28, 60],
        ['Verduras', 'Cebolla Blanca Kg', 12, 22, 60],
        ['Verduras', 'Aguacate Hass Kg', 50, 90, 40],
        ['Verduras', 'Papa Blanca Kg', 14, 25, 60],
        ['Hierbas', 'Cilantro Manojo', 5, 10, 50],
      ],
      zapateria: [
        ['Caballero', 'Zapato de Vestir Negro', 350, 700, 25],
        ['Caballero', 'Tenis Casual', 400, 800, 30],
        ['Caballero', 'Bota Industrial', 450, 900, 20],
        ['Dama', 'Zapatilla de Tacón', 300, 600, 30],
        ['Dama', 'Sandalia de Plataforma', 250, 500, 30],
        ['Dama', 'Bota Larga', 500, 1000, 15],
        ['Niños', 'Tenis Escolar', 225, 450, 40],
        ['Niños', 'Zapato Escolar Negro', 200, 400, 40],
        ['Accesorios', 'Calceta Deportiva 3pq', 50, 100, 60],
        ['Accesorios', 'Crema para Calzado', 30, 60, 50],
      ],
      muebleria: [
        ['Sala', 'Sala 3-2-1 Tela', 4500, 8500, 5],
        ['Sala', 'Mesa de Centro Madera', 700, 1400, 10],
        ['Sala', 'Sillón Reclinable', 2500, 4900, 5],
        ['Comedor', 'Comedor 6 Sillas', 4000, 7900, 4],
        ['Comedor', 'Comedor 4 Sillas', 2500, 4900, 5],
        ['Recámara', 'Cama Matrimonial Madera', 2200, 4500, 6],
        ['Recámara', 'Colchón Individual', 1500, 2999, 8],
        ['Recámara', 'Buró 2 Cajones', 600, 1200, 12],
        ['Oficina', 'Escritorio L Melamina', 1100, 2200, 8],
        ['Oficina', 'Silla Ejecutiva', 750, 1500, 10],
      ],
      floreria: [
        ['Ramos', 'Ramo de Rosas Rojas Docena', 200, 400, 20],
        ['Ramos', 'Ramo de Girasoles', 175, 350, 15],
        ['Ramos', 'Ramo Mixto Primaveral', 225, 450, 15],
        ['Arreglos', 'Arreglo Floral Mediano', 350, 700, 10],
        ['Arreglos', 'Arreglo Fúnebre Corona', 700, 1400, 5],
        ['Arreglos', 'Centro de Mesa', 250, 500, 10],
        ['Plantas', 'Suculenta en Maceta', 50, 100, 30],
        ['Plantas', 'Orquídea en Maceta', 200, 400, 15],
        ['Globos', 'Globo Metálico Feliz Cumpleaños', 35, 75, 50],
        ['Globos', 'Bouquet de Globos', 175, 350, 15],
      ],
      dulceria: [
        ['Dulces Mexicanos', 'Mazapán De la Rosa', 2, 5, 200],
        ['Dulces Mexicanos', 'Pulparindo', 2, 4, 250],
        ['Dulces Mexicanos', 'Tamarindo Enchilado 100g', 8, 18, 100],
        ['Dulces Mexicanos', 'Cocada 50g', 6, 14, 80],
        ['Chocolates', 'Carlos V Barra', 7, 15, 150],
        ['Chocolates', 'Kinder Delice', 9, 20, 100],
        ['Chocolates', 'Snickers', 12, 25, 100],
        ['Paletas', 'Paleta Payaso', 6, 13, 150],
        ['Botanas', 'Bolsa de Frituras Surtidas', 12, 25, 80],
        ['Piñatas', 'Piñata Mediana Tradicional', 100, 220, 15],
      ],
      'taller_mecanico': [
        ['Servicios', 'Cambio de Aceite', 150, 350, 50],
        ['Servicios', 'Afinación Mayor', 800, 1800, 20],
        ['Servicios', 'Alineación y Balanceo', 350, 650, 30],
        ['Servicios', 'Cambio de Frenos', 600, 1200, 15],
        ['Refacciones', 'Filtro de Aceite', 60, 120, 50],
        ['Refacciones', 'Bujías Set 4pz', 280, 480, 25],
        ['Refacciones', 'Pastillas Freno Delant', 450, 850, 20],
        ['Lubricantes', 'Aceite Motor 5W30 1L', 95, 165, 40],
        ['Lubricantes', 'Liquido de Frenos DOT3', 65, 120, 30],
        ['Diagnóstico', 'Scanner Computacional', 250, 500, 100],
      ],
      general: [
        ['General', 'Producto 1', 10, 20, 10],
        ['General', 'Producto 2', 12, 24, 10],
        ['General', 'Producto 3', 15, 30, 10],
        ['General', 'Producto 4', 18, 36, 10],
        ['General', 'Producto 5', 20, 40, 10],
        ['General', 'Producto 6', 25, 50, 10],
        ['General', 'Producto 7', 30, 60, 10],
        ['General', 'Producto 8', 35, 70, 10],
        ['General', 'Producto 9', 40, 80, 10],
        ['General', 'Producto 10', 50, 100, 10],
      ],
    };
    // Detectar giro: prioridad cache → JWT tenant → fetch config endpoint
    let giro = 'general';
    try {
      if (global.__volvixGiroData && global.__volvixGiroData.slug) {
        giro = global.__volvixGiroData.slug;
      } else {
        // Fetch on-demand desde /api/app/config con tenant_id del JWT
        const tok = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken');
        if (tok) {
          try {
            const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            const tnt = payload && (payload.tenant_id || payload.tnt);
            if (tnt) {
              const r = await fetch('/api/app/config?t=' + encodeURIComponent(tnt));
              if (r.ok) {
                const j = await r.json();
                if (j && j.giro && j.giro.slug) {
                  giro = j.giro.slug;
                  global.__volvixGiroData = j.giro; // cachear para próxima vez
                }
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    const picked = TEMPLATES[giro] || TEMPLATES.general;
    // Convertir a rows formato wizard: [['nombre','precio'], ...]
    // Pero rowsToProducts espera headers + data con name/code/price/cost/stock/category
    const rows = [['categoria', 'nombre', 'costo', 'precio', 'inventario']];
    picked.forEach(p => rows.push(p.map(String)));
    const products = rowsToProducts(rows);
    renderEditTable(products);
    if (typeof _showMsg === 'function') _showMsg('✨ Plantilla de ' + giro + ' (' + products.length + ' productos). Edita los que quieras y guarda.', 'ok');
  }

  // STEP 2: parsing
  function renderParsing() {
    const body = document.getElementById('volvix-imp-body');
    body.innerHTML = `
      <div class="volvix-imp-progress">
        <div class="spin"></div>
        <div style="font-weight:600;color:#0f172a;font-size:14px;margin-bottom:4px;">Leyendo archivo…</div>
        <div style="font-size:12px;color:#64748b;" id="volvix-imp-prog-msg">No ejecutamos nada · solo lectura segura</div>
      </div>
    `;
    document.getElementById('volvix-imp-actions').innerHTML = '';
  }

  // STEP 3: editable table
  function renderEditTable(products) {
    _state.products = products;
    const body = document.getElementById('volvix-imp-body');
    if (!products.length) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;">
          <div style="font-size:42px;margin-bottom:8px;">⚠️</div>
          <div style="font-weight:600;color:#0f172a;font-size:14px;margin-bottom:4px;">No pudimos extraer productos</div>
          <div style="font-size:12px;color:#64748b;">Intenta otro archivo, o usa la cámara para tomar foto del menú</div>
        </div>
      `;
      document.getElementById('volvix-imp-actions').innerHTML = `
        <button class="volvix-imp-btn" id="volvix-imp-back">← Probar otro archivo</button>
      `;
      document.getElementById('volvix-imp-back').addEventListener('click', renderStep1);
      return;
    }

    body.innerHTML = `
      <div class="volvix-imp-stat">
        <div><b>${products.length}</b> productos detectados</div>
        <div>· Edita cualquier celda como Excel</div>
        <div>· Borra los que no quieras</div>
      </div>
      <div class="volvix-imp-table-wrap">
        <table class="volvix-imp-table" id="volvix-imp-tbl">
          <thead><tr>
            <th style="width:24%">Categoría</th>
            <th style="width:32%">Nombre del producto</th>
            <th style="width:14%">Costo</th>
            <th style="width:14%">Precio venta</th>
            <th style="width:11%">Inventario</th>
            <th style="width:5%"></th>
          </tr></thead>
          <tbody id="volvix-imp-tbody"></tbody>
        </table>
      </div>
      <div id="volvix-imp-msg"></div>
    `;
    _renderRows();
    document.getElementById('volvix-imp-actions').innerHTML = `
      <button class="volvix-imp-btn" id="volvix-imp-back">← Otro archivo</button>
      <button class="volvix-imp-btn primary" id="volvix-imp-save">💾 Guardar ${products.length} productos</button>
    `;
    document.getElementById('volvix-imp-back').addEventListener('click', renderStep1);
    document.getElementById('volvix-imp-save').addEventListener('click', saveAll);
  }

  function _renderRows() {
    const body = document.getElementById('volvix-imp-tbody');
    if (!body) return;
    body.innerHTML = _state.products.map((p, i) => `
      <tr data-row="${i}">
        <td><input type="text" data-f="category" value="${_esc(p.category || '')}"></td>
        <td><input type="text" data-f="name" value="${_esc(p.name || '')}"></td>
        <td><input type="number" step="0.01" data-f="cost" value="${p.cost || 0}" style="text-align:right;"></td>
        <td><input type="number" step="0.01" data-f="price" value="${p.price || 0}" style="text-align:right;"></td>
        <td><input type="number" step="1" data-f="stock" value="${p.stock || 0}" style="text-align:right;"></td>
        <td><button class="volvix-imp-row-del" data-del="${i}" title="Eliminar fila">×</button></td>
      </tr>
    `).join('');
    // Wire edits + delete
    body.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', e => {
        const tr = e.target.closest('tr');
        const i = parseInt(tr.dataset.row, 10);
        const f = e.target.dataset.f;
        if (f === 'cost' || f === 'price' || f === 'stock') {
          _state.products[i][f] = _toNum(e.target.value);
        } else {
          _state.products[i][f] = e.target.value;
        }
      });
    });
    body.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        const i = parseInt(b.dataset.del, 10);
        _state.products.splice(i, 1);
        _renderRows();
        const saveBtn = document.getElementById('volvix-imp-save');
        if (saveBtn) saveBtn.textContent = '💾 Guardar ' + _state.products.length + ' productos';
      });
    });
  }

  // CAMERA
  let _camStream = null;
  // 2026-05-10 fix cámara: permission flow + retry + instrucciones claras
  // Mobile-first: la mayoría de usuarios usarán celular/tablet.
  //
  // Errores comunes y su tratamiento:
  //   NotAllowedError  → usuario denegó permiso (o bloqueado en config)
  //   NotFoundError    → no hay cámara en el dispositivo
  //   NotReadableError → cámara en uso por otra app (común en iOS)
  //   OverconstrainedError → facingMode 'environment' no disponible (iOS desktop) → retry sin constraint
  //   SecurityError    → contexto no-HTTPS (Vercel ya es HTTPS)
  //   AbortError       → usuario cerró el prompt
  async function renderCamera() {
    const body = document.getElementById('volvix-imp-body');
    body.innerHTML = `
      <div id="volvix-cam-prompt" style="text-align:center;padding:40px 20px;">
        <div style="font-size:56px;margin-bottom:12px;">📷</div>
        <h3 style="margin:0 0 8px;color:#0f172a;">Activar cámara</h3>
        <p style="margin:0 0 20px;color:#64748b;font-size:13px;line-height:1.5;">
          Tu navegador te pedirá permiso para usar la cámara.<br>
          <strong>Toca "Permitir"</strong> cuando aparezca el aviso.
        </p>
        <button class="volvix-imp-btn primary" id="volvix-cam-start" style="font-size:15px;padding:12px 24px;">Activar cámara</button>
        <div id="volvix-cam-help" style="display:none;margin-top:18px;text-align:left;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px;font-size:13px;color:#78350f;"></div>
      </div>
      <video id="volvix-cam-video" autoplay playsinline muted style="display:none;width:100%;max-height:60vh;border-radius:10px;background:#000;"></video>
      <canvas id="volvix-cam-canvas" style="display:none;"></canvas>
      <div id="volvix-cam-actions-bar" class="volvix-cam-actions" style="display:none;margin-top:14px;justify-content:center;gap:10px;">
        <button class="volvix-imp-btn" id="volvix-cam-cancel">← Volver</button>
        <button class="volvix-imp-btn primary" id="volvix-cam-snap">📸 Capturar y procesar</button>
      </div>
      <div id="volvix-imp-msg"></div>
    `;
    document.getElementById('volvix-imp-actions').innerHTML = '';

    function backToStep1() { _stopCamera(); renderStep1(); }
    document.getElementById('volvix-cam-start').addEventListener('click', () => requestCamera());

    // Detectar si los permisos ya están denegados antes de pedir (Permissions API)
    async function tryRequestPermission() {
      // 1) Verificar via Permissions API si está disponible (Chrome desktop, Android)
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'camera' });
          if (status.state === 'denied') {
            return { state: 'denied' };
          }
          // Reescuchar cambios para auto-retry cuando el usuario cambie en config
          status.onchange = () => {
            if (status.state === 'granted' && _camStream === null) requestCamera();
          };
        }
      } catch (_) { /* iOS Safari no tiene Permissions API, seguir directo */ }
      return { state: 'unknown' };
    }

    function showHelp(html) {
      const h = document.getElementById('volvix-cam-help');
      if (!h) return;
      h.style.display = 'block';
      h.innerHTML = html;
    }

    async function requestCamera(retry) {
      const help = document.getElementById('volvix-cam-help');
      if (help) help.style.display = 'none';
      // Detectar denegación previa
      const perm = await tryRequestPermission();
      if (perm.state === 'denied') {
        showHelp(
          '<strong>🚫 Permiso bloqueado</strong><br>' +
          'La cámara fue bloqueada en una visita anterior. Para activarla:<br>' +
          '<strong>Chrome/Edge:</strong> toca el 🔒 a la izquierda de la URL → Cámara → Permitir → recarga.<br>' +
          '<strong>iPhone Safari:</strong> Ajustes → Safari → Cámara → Permitir.<br>' +
          '<strong>Android:</strong> Ajustes → Apps → Chrome → Permisos → Cámara → Permitir.'
        );
        return;
      }
      // Pedir cámara — primero trasera (mejor para menús), si falla intentar default
      try {
        const constraints = retry
          ? { video: true } // fallback a cualquier cámara
          : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } };
        _camStream = await navigator.mediaDevices.getUserMedia(constraints);
        // Mostrar video y ocultar prompt
        const promptEl = document.getElementById('volvix-cam-prompt');
        const video = document.getElementById('volvix-cam-video');
        const actionsBar = document.getElementById('volvix-cam-actions-bar');
        if (promptEl) promptEl.style.display = 'none';
        if (video) { video.style.display = 'block'; video.srcObject = _camStream; }
        if (actionsBar) actionsBar.style.display = 'flex';
      } catch (e) {
        const errName = e && e.name || '';
        const errMsg = e && e.message || String(e);
        console.warn('[wizard] cámara error:', errName, errMsg);
        // OverconstrainedError → reintentar sin facingMode
        if ((errName === 'OverconstrainedError' || errName === 'NotFoundError') && !retry) {
          return requestCamera(true);
        }
        // Mensajes específicos por error
        let html = '<strong>⚠️ No se pudo activar la cámara</strong><br>';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          html += 'Negaste el permiso. Para reintentar:<br>' +
            '<strong>Móvil:</strong> recarga la página y toca "Permitir" cuando aparezca el aviso.<br>' +
            '<strong>Si ya bloqueaste antes:</strong> abre Ajustes del navegador → Permisos → Cámara → Permitir para este sitio.';
        } else if (errName === 'NotFoundError') {
          html += 'No se detectó cámara en este dispositivo. Prueba subir una foto desde la galería en su lugar.';
        } else if (errName === 'NotReadableError') {
          html += 'La cámara está siendo usada por otra app. Cierra otras apps (zoom, meet, instagram) e inténtalo de nuevo.';
        } else if (errName === 'SecurityError') {
          html += 'El navegador bloqueó la cámara por motivos de seguridad. Asegúrate de estar en https://';
        } else if (errName === 'AbortError') {
          html += 'Cancelaste el aviso. Toca "Activar cámara" otra vez.';
        } else {
          html += 'Error: ' + (errMsg || errName) + '. Intenta recargar la página.';
        }
        html += '<br><br><button class="volvix-imp-btn primary" id="volvix-cam-retry" style="font-size:13px;padding:8px 16px;">🔄 Reintentar</button>';
        showHelp(html);
        const retryBtn = document.getElementById('volvix-cam-retry');
        if (retryBtn) retryBtn.addEventListener('click', () => requestCamera());
      }
    }

    document.getElementById('volvix-cam-cancel').addEventListener('click', backToStep1);
    document.getElementById('volvix-cam-snap').addEventListener('click', async () => {
      const video = document.getElementById('volvix-cam-video');
      const canvas = document.getElementById('volvix-cam-canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d').drawImage(video, 0, 0);
      _stopCamera();
      renderParsing();
      try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
        const file = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
        const rows = await parseImageOCR(file);
        const products = rowsToProducts(rows);
        renderEditTable(products);
      } catch (e) {
        renderEditTable([]);
        _showMsg('Error OCR: ' + (e && e.message || e), 'err');
      }
    });
  }
  function _stopCamera() {
    if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null; }
  }

  function _showMsg(text, kind) {
    const el = document.getElementById('volvix-imp-msg');
    if (!el) return;
    el.innerHTML = '<div class="volvix-msg ' + (kind || 'err') + '">' + _esc(text) + '</div>';
  }

  // FILE handler
  async function handleFile(file) {
    _state.file = file;
    renderParsing();
    try {
      const rows = await parseFile(file);
      const products = rowsToProducts(rows);
      renderEditTable(products);
    } catch (e) {
      console.error('[VolvixImport] parse error', e);
      renderEditTable([]);
      _showMsg('Error procesando ' + file.name + ': ' + e.message, 'err');
    }
  }

  // SAVE bulk
  async function saveAll() {
    const btn = document.getElementById('volvix-imp-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando…'; }
    const tok = localStorage.getItem('volvix_token') || localStorage.getItem('volvixAuthToken') || '';
    try {
      const r = await fetch('/api/products/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        credentials: 'include',
        body: JSON.stringify({ items: _state.products })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        _showMsg('✅ ' + (j.inserted || _state.products.length) + ' productos guardados', 'ok');
        // Recargar CATALOG si existe loadCatalogReal
        if (typeof window.loadCatalogReal === 'function') {
          try { await window.loadCatalogReal(); } catch (_) {}
        }
        setTimeout(closeWizard, 1500);
      } else {
        _showMsg('Error guardando: ' + (j.error || r.status), 'err');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Reintentar'; }
      }
    } catch (e) {
      _showMsg('Error de red: ' + e.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = '💾 Reintentar'; }
    }
  }

  // 2026-05-11: chequear si el tenant tiene productos en la BD (no solo CATALOG)
  async function tenantHasProductsInDB() {
    try {
      const r = await fetch('/api/productos?select=id&limit=1', { credentials: 'include' });
      if (!r.ok) return false;
      const j = await r.json();
      const items = (j && (j.items || j.data)) || [];
      return items.length > 0;
    } catch (_) { return false; }
  }

  // AUTO-OPEN si CATALOG vacío Y la BD del tenant también está vacía
  function openWizardIfEmpty() {
    // Si el usuario ya descartó el wizard antes, NO re-abrir
    try {
      if (localStorage.getItem('volvix_wizard_dismissed') === 'true') return;
    } catch (_) {}

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const empty = !window.CATALOG || (Array.isArray(window.CATALOG) && window.CATALOG.length === 0);
      if (empty && attempts >= 5) {
        clearInterval(poll);
        // CRÍTICO: verificar BD ANTES de abrir, no solo CATALOG local
        if (await tenantHasProductsInDB()) return;
        // Solo si no hay otro modal abierto
        if (!document.querySelector('#modal-product-form, #volvix-import-modal, #volvix-err-overlay, #volvix-onboarding-overlay')) {
          openWizard();
        }
      }
      if (!empty || attempts > 10) clearInterval(poll);
    }, 2000);
  }

  // Public API
  global.VolvixImport = {
    openWizard,
    openWizardIfEmpty,
    closeWizard,
    parseFile,
    rowsToProducts,
    _state
  };
})(typeof window !== 'undefined' ? window : this);
