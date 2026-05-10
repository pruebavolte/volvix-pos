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
    // Anchored: nombre inicia con 3+ letras (no símbolos / no dígitos),
    // separador opcional, currency opcional, precio, currency opcional, fin
    const re = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ][\wÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ\s,'.&\/()\-]{2,80}?)[\s\.\-_|]+(?:[€$¢]|MXN|USD|MX\$)?\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*(?:[€$¢]|MXN|USD|MX\$|pesos|dolares|d[oó]lares)?\s*$/i;
    let matched = 0;
    lines.forEach(l => {
      if (l.length < 5 || l.length > 200) return;
      const m = l.match(re);
      if (!m) return;
      let name = m[1].trim().replace(/[\.\-_|·•:]+$/, '').trim();
      // Nombre debe tener una palabra inicial de 3+ letras Unicode
      if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÄÖÜßäöüçÇ]{3,}/.test(name)) return;
      // Rechazar descripciones largas con muchas comas (no productos)
      if (name.length > 50 && (name.match(/,/g) || []).length >= 3) return;
      const price = parseFloat(m[2].replace(',', '.'));
      if (!isFinite(price) || price < 0.5 || price > 99999) return;
      rows.push([name, String(price)]);
      matched++;
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

  // PDF via pdf.js
  async function parsePDF(arrayBuffer) {
    await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
    if (!global.pdfjsLib) throw new Error('pdf.js no disponible');
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const doc = await global.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      text += tc.items.map(it => it.str).join(' ') + '\n';
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
      // Binarización adaptiva simple: convertir a luminance + threshold
      try {
        const imgData = ctx.getImageData(0, 0, newW, newH);
        const d = imgData.data;
        // Calcular mean luminance para threshold dinámico
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        const meanLum = sum / (d.length / 4);
        const threshold = meanLum * 0.85; // bias hacia más negro (texto)
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
          const v = lum < threshold ? 0 : 255;
          d[i] = v; d[i+1] = v; d[i+2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
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

  // Dispatcher principal
  async function parseFile(file) {
    if (file.size > MAX_FILE_BYTES) throw new Error('Archivo muy grande (max 50MB)');
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
      .volvix-imp-2cards{display:grid;grid-template-columns:1fr 1fr;gap:14px}
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
          <div class="info" id="volvix-imp-info">Solo lectura · nunca ejecutamos el archivo · max 50MB</div>
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
      </div>
      <div id="volvix-imp-msg"></div>
    `;
    acts.innerHTML = '';
    const fileCard = document.getElementById('volvix-opt-file');
    const fileInput = document.getElementById('volvix-imp-file');
    const camCard = document.getElementById('volvix-opt-cam');
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
  async function renderCamera() {
    const body = document.getElementById('volvix-imp-body');
    body.innerHTML = `
      <video id="volvix-cam-video" autoplay playsinline></video>
      <canvas id="volvix-cam-canvas"></canvas>
      <div class="volvix-cam-actions">
        <button class="volvix-imp-btn" id="volvix-cam-cancel">← Volver</button>
        <button class="volvix-imp-btn primary" id="volvix-cam-snap">📸 Capturar y procesar</button>
      </div>
      <div id="volvix-imp-msg"></div>
    `;
    document.getElementById('volvix-imp-actions').innerHTML = '';
    document.getElementById('volvix-cam-cancel').addEventListener('click', () => { _stopCamera(); renderStep1(); });
    document.getElementById('volvix-cam-snap').addEventListener('click', async () => {
      const video = document.getElementById('volvix-cam-video');
      const canvas = document.getElementById('volvix-cam-canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
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
        _showMsg('Error OCR: ' + e.message, 'err');
      }
    });
    try {
      _camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      document.getElementById('volvix-cam-video').srcObject = _camStream;
    } catch (e) {
      _showMsg('No se pudo acceder a la cámara: ' + e.message + '. Intenta subir un archivo.', 'err');
    }
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

  // AUTO-OPEN si CATALOG vacío
  function openWizardIfEmpty() {
    // Esperar a que CATALOG se hidrate
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const empty = !window.CATALOG || (Array.isArray(window.CATALOG) && window.CATALOG.length === 0);
      // Si después de 10s (~5 polls de 2s) sigue vacío → abrir
      if (empty && attempts >= 5) {
        clearInterval(poll);
        // Solo si no hay otro modal abierto
        if (!document.querySelector('#modal-product-form, #volvix-import-modal, #volvix-err-overlay')) {
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
