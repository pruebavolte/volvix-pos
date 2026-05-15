/**
 * printer-network.js — Impresión por IP (TCP raw socket, JetDirect 9100)
 *
 * Por qué funciona:
 *   - 99% de las impresoras térmicas modernas con WiFi/Ethernet exponen
 *     un servicio TCP raw en puerto 9100 (estándar JetDirect / RAW print).
 *   - Solo se conecta, escribe bytes ESC/POS, cierra. Sin protocolo extra.
 *   - Funciona con Epson TM-T20II Ethernet, Star TSP143IIIW, EPSON LAN,
 *     Bixolon SRP-330II, XPrinter XP-N160II Ethernet, y casi cualquier
 *     impresora térmica con conector RJ-45 o WiFi.
 *
 * Configuración esperada del usuario:
 *   - Impresora con IP estática (recomendado) o reservada en el router
 *   - Misma red que el POS
 *   - Puerto 9100 abierto (default en todas las impresoras)
 *
 * Si necesitas IPP (Internet Printing Protocol, port 631):
 *   - Más complejo (HTTP POST con MIME multipart)
 *   - Soporta encryption + auth + más features
 *   - Para impresoras Office (no térmicas), usar driver IPP del SO
 *
 * Este módulo cubre el 99% del caso POS térmico que se conecta a la red.
 */

const net = require('net');

/**
 * Imprimir bytes en una impresora IP via TCP raw socket
 *
 * @param {string} ip      IP de la impresora (ej: 192.168.1.100)
 * @param {number} port    Puerto TCP (default 9100)
 * @param {Buffer|string} data  Bytes ESC/POS a enviar
 * @param {object} opts    { timeout: ms }
 * @returns {Promise<{ok, bytesWritten, error}>}
 */
function printToIP(ip, port, data, opts = {}) {
  port = port || 9100;
  const timeout = opts.timeout || 10000;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'binary');

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;
    let bytesWritten = 0;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch (_) {}
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.on('timeout', () => finish({ ok: false, error: `Timeout (${timeout}ms) connecting to ${ip}:${port}` }));
    socket.on('error', (e) => finish({ ok: false, error: e.message }));
    socket.on('close', () => {
      if (!finished) finish({ ok: true, bytesWritten, ip, port });
    });

    socket.connect(port, ip, () => {
      socket.write(payload, 'binary', (err) => {
        if (err) return finish({ ok: false, error: err.message });
        bytesWritten = payload.length;
        // Pequeño delay para que la impresora procese antes de cerrar
        setTimeout(() => socket.end(), 500);
      });
    });
  });
}

/**
 * Probar conectividad TCP con la impresora (sin imprimir nada)
 */
function pingIP(ip, port, opts = {}) {
  port = port || 9100;
  const timeout = opts.timeout || 3000;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;
    const start = Date.now();

    const finish = (result) => {
      if (finished) return;
      finished = true;
      try { socket.destroy(); } catch (_) {}
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.on('timeout', () => finish({ ok: false, error: 'timeout', ms: timeout }));
    socket.on('error', (e) => finish({ ok: false, error: e.message, ms: Date.now() - start }));
    socket.on('connect', () => finish({ ok: true, ms: Date.now() - start }));
    socket.connect(port, ip);
  });
}

/**
 * Escanear la red local en busca de impresoras (puerto 9100 abierto)
 * @param {string} subnet — ej: "192.168.1" (sin el .0)
 * @param {object} opts — { startIP, endIP, concurrency, timeout }
 */
async function scanSubnet(subnet, opts = {}) {
  const start = opts.startIP || 1;
  const end = opts.endIP || 254;
  const concurrency = opts.concurrency || 30;
  const timeout = opts.timeout || 500;
  const port = opts.port || 9100;

  const ips = [];
  for (let i = start; i <= end; i++) {
    ips.push(`${subnet}.${i}`);
  }

  const found = [];
  let idx = 0;
  async function worker() {
    while (idx < ips.length) {
      const myIdx = idx++;
      const ip = ips[myIdx];
      const r = await pingIP(ip, port, { timeout });
      if (r.ok) {
        found.push({ ip, port, latency_ms: r.ms });
      }
    }
  }
  const workers = Array(concurrency).fill(0).map(() => worker());
  await Promise.all(workers);
  return found;
}

/**
 * Imprimir un ticket via IP. Recibe HTML o texto o bytes, convierte a ESC/POS.
 *
 * @param {object} opts
 *   ip {string}           IP de la impresora (REQUERIDO)
 *   port {number}         Puerto (default 9100)
 *   html {string}         HTML del ticket (se convierte a texto plano + ESC/POS)
 *   text {string}         Texto plano alternativo
 *   bytes {Buffer}        Bytes RAW (override de html/text)
 *   cut {boolean}         Cortar al final (default true)
 *   timeout {number}      ms (default 10000)
 */
async function printTicketIP(opts = {}) {
  if (!opts.ip) return { ok: false, error: 'IP required' };

  let bytes;
  if (opts.bytes) {
    bytes = Buffer.isBuffer(opts.bytes) ? opts.bytes : Buffer.from(opts.bytes, 'binary');
  } else {
    bytes = textToEscPos(opts.html || opts.text || '', { cut: opts.cut !== false });
  }

  return await printToIP(opts.ip, opts.port || 9100, bytes, { timeout: opts.timeout || 10000 });
}

/**
 * Convertir HTML o texto a bytes ESC/POS (58mm = 32 chars, 80mm = 48)
 */
function textToEscPos(content, opts = {}) {
  const ESC = 0x1B, GS = 0x1D, LF = 0x0A;
  const out = [ESC, 0x40]; // Init printer

  let text = String(content || '');
  // Quitar HTML
  if (/<\w/.test(text)) {
    text = text
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  for (const ch of text) {
    if (ch === '\n') out.push(LF);
    else {
      const code = ch.charCodeAt(0);
      out.push(code < 256 ? code : 0x3F);
    }
  }

  // Feed paper
  out.push(LF, LF, LF, LF);

  // Cut paper
  if (opts.cut !== false) {
    out.push(GS, 0x56, 0x00); // Full cut
  }

  return Buffer.from(out);
}

module.exports = {
  printToIP,
  pingIP,
  scanSubnet,
  printTicketIP,
  textToEscPos
};
