/**
 * printer-discovery.js — Discovery agresivo de impresoras de red
 *
 * El problema: el scan tradicional /24 solo encuentra impresoras en el mismo
 * subnet que el PC. Pero en muchas redes reales:
 *   - PC en 192.168.80.x, impresora en 192.168.1.x (subnets diferentes en mismo router)
 *   - PC en 192.168.x.x, impresora en 100.100.x.x (range completamente diferente)
 *   - Multiple VLANs en el mismo modem/switch físico
 *
 * Este módulo usa 5 técnicas en paralelo:
 *
 *   1. INTERFACES LOCALES — detecta TODAS las redes del PC (LAN, WiFi, VPN)
 *      y escanea cada subnet detectada
 *   2. ARP TABLE — lee la tabla ARP del sistema. Cualquier device que el PC
 *      haya hablado recientemente aparece ahí, INCLUYENDO impresoras de
 *      otros subnets si están en el broadcast domain
 *   3. mDNS / Bonjour — query _ipp._tcp.local y _pdl-datastream._tcp.local
 *      via UDP multicast 224.0.0.251:5353
 *   4. SSDP / UPnP — discovery via UDP multicast 239.255.255.250:1900
 *      con M-SEARCH urn:schemas-upnp-org:device:Printer:1
 *   5. SUBNETS COMUNES FALLBACK — si lo anterior no encuentra nada, escanea
 *      192.168.0-10.x, 10.0.0-1.x, 172.16-17.x (los rangos donde casi todas
 *      las impresoras router-default residen)
 *
 * Cada candidato encontrado se valida con TCP probe en puerto 9100.
 */

const net = require('net');
const os = require('os');
const dgram = require('dgram');
const { execFile } = require('child_process');

const PRINTER_PORT = 9100;
const DEFAULT_TIMEOUT = 500;

// ─── HELPERS ──────────────────────────────────────────────────────────
function ipToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}
function intToIp(int) {
  return [(int >>> 24) & 0xFF, (int >>> 16) & 0xFF, (int >>> 8) & 0xFF, int & 0xFF].join('.');
}
function cidrToRange(cidr) {
  const [base, bits] = cidr.split('/');
  const baseInt = ipToInt(base);
  const mask = bits ? (~((1 << (32 - parseInt(bits, 10))) - 1)) >>> 0 : 0xFFFFFFFF;
  const start = baseInt & mask;
  const end = start | (~mask >>> 0);
  return { start, end, total: end - start + 1 };
}
function pingPort(ip, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, ms) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) {}
      resolve({ ok, ip, port, ms });
    };
    const start = Date.now();
    socket.setTimeout(timeout || DEFAULT_TIMEOUT);
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('connect', () => finish(true, Date.now() - start));
    socket.connect(port, ip);
  });
}

// ─── 1. INTERFACES LOCALES ──────────────────────────────────────────
function getLocalNetworkRanges() {
  const ranges = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (iface.address.startsWith('169.254')) continue; // skip APIPA
      // Calcular subnet basado en netmask
      const ipInt = ipToInt(iface.address);
      const maskInt = ipToInt(iface.netmask);
      const subnet = (ipInt & maskInt) >>> 0;
      const broadcast = (subnet | (~maskInt >>> 0)) >>> 0;
      const total = broadcast - subnet;
      // Limitar para no escanear /8 o /16 enteros (sería millones de IPs)
      if (total > 4096) {
        // Subnet demasiado grande → escanear solo el /24 alrededor del IP
        const ipHigh = (ipInt & 0xFFFFFF00) >>> 0;
        ranges.push({
          iface: name,
          localIP: iface.address,
          start: ipHigh + 1,
          end: ipHigh + 254,
          size: 254,
          source: 'iface-/24'
        });
      } else {
        ranges.push({
          iface: name,
          localIP: iface.address,
          start: subnet + 1,
          end: broadcast - 1,
          size: total - 1,
          source: 'iface-cidr'
        });
      }
    }
  }
  return ranges;
}

// ─── 2. ARP TABLE ───────────────────────────────────────────────────
function readArpTable() {
  return new Promise((resolve) => {
    execFile('arp', ['-a'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      const ips = [];
      const seen = new Set();
      const lines = String(stdout || '').split(/\r?\n/);
      for (const line of lines) {
        // Match patterns like "  192.168.1.50          aa-bb-cc-dd-ee-ff     dinámico"
        const m = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([\w-:]{11,17})\s+/);
        if (m) {
          const ip = m[1];
          const mac = m[2];
          // Skip multicast (224-239) and broadcast (255.255.255.255)
          if (/^(224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239|255)\./.test(ip)) continue;
          if (ip.endsWith('.255')) continue;
          if (mac === 'ff-ff-ff-ff-ff-ff' || mac === 'FF-FF-FF-FF-FF-FF') continue;
          if (!seen.has(ip)) {
            seen.add(ip);
            ips.push({ ip, mac, source: 'arp' });
          }
        }
      }
      resolve(ips);
    });
  });
}

// ─── 3. mDNS DISCOVERY ──────────────────────────────────────────────
function discoverMDNS(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const found = new Map(); // ip → {ip, hostname, service}
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch (e) { return resolve([]); }

    const services = [
      '_pdl-datastream._tcp.local',
      '_ipp._tcp.local',
      '_printer._tcp.local',
      '_http._tcp.local'
    ];

    socket.on('error', () => { try { socket.close(); } catch (_) {} resolve([]); });
    socket.on('message', (msg, rinfo) => {
      // Cualquier respuesta = device existe en la red
      const text = msg.toString('utf8');
      if (!found.has(rinfo.address)) {
        // Detectar si parece una impresora por el nombre del servicio
        const isPrinter = /printer|pdl|ipp|brother|epson|canon|hp|xerox|lexmark|zebra/i.test(text);
        found.set(rinfo.address, {
          ip: rinfo.address,
          hostname: null,
          service: 'mdns',
          isPrinter,
          source: 'mdns'
        });
      }
    });

    try {
      socket.bind(0, () => {
        try {
          socket.setMulticastTTL(1);
          socket.setBroadcast(true);
        } catch (_) {}

        // Construir queries DNS-SD para cada service
        services.forEach((svc) => {
          const query = buildMDNSQuery(svc);
          try {
            socket.send(query, 0, query.length, 5353, '224.0.0.251');
          } catch (_) {}
        });

        setTimeout(() => {
          try { socket.close(); } catch (_) {}
          resolve(Array.from(found.values()));
        }, timeoutMs);
      });
    } catch (e) {
      try { socket.close(); } catch (_) {}
      resolve([]);
    }
  });
}

function buildMDNSQuery(serviceName) {
  // DNS query: ID + flags + counts + question
  const labels = serviceName.split('.');
  const headerBuf = Buffer.from([
    0x00, 0x00,  // ID
    0x00, 0x00,  // Flags (standard query)
    0x00, 0x01,  // QDCOUNT = 1
    0x00, 0x00,  // ANCOUNT
    0x00, 0x00,  // NSCOUNT
    0x00, 0x00   // ARCOUNT
  ]);
  const labelBufs = [];
  for (const label of labels) {
    if (!label) continue;
    const b = Buffer.from(label, 'utf8');
    labelBufs.push(Buffer.from([b.length]));
    labelBufs.push(b);
  }
  labelBufs.push(Buffer.from([0])); // root label
  labelBufs.push(Buffer.from([0x00, 0x0C])); // QTYPE = PTR
  labelBufs.push(Buffer.from([0x00, 0x01])); // QCLASS = IN
  return Buffer.concat([headerBuf, ...labelBufs]);
}

// ─── 4. SSDP / UPnP DISCOVERY ───────────────────────────────────────
function discoverSSDP(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const found = new Map();
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch (e) { return resolve([]); }

    socket.on('error', () => { try { socket.close(); } catch (_) {} resolve([]); });
    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (!found.has(rinfo.address)) {
        const isPrinter = /printer|pdl|ipp|brother|epson|canon|hp|xerox|lexmark/i.test(text);
        found.set(rinfo.address, {
          ip: rinfo.address,
          source: 'ssdp',
          isPrinter
        });
      }
    });

    try {
      socket.bind(0, () => {
        // M-SEARCH para impresoras + UPnP genérico
        const queries = [
          // Targeted printer search
          'M-SEARCH * HTTP/1.1\r\n' +
          'HOST: 239.255.255.250:1900\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 2\r\n' +
          'ST: urn:schemas-upnp-org:device:Printer:1\r\n\r\n',
          // All devices (catch-all)
          'M-SEARCH * HTTP/1.1\r\n' +
          'HOST: 239.255.255.250:1900\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 2\r\n' +
          'ST: ssdp:all\r\n\r\n'
        ];

        for (const q of queries) {
          const buf = Buffer.from(q, 'utf8');
          try {
            socket.send(buf, 0, buf.length, 1900, '239.255.255.250');
          } catch (_) {}
        }

        setTimeout(() => {
          try { socket.close(); } catch (_) {}
          resolve(Array.from(found.values()));
        }, timeoutMs);
      });
    } catch (e) {
      try { socket.close(); } catch (_) {}
      resolve([]);
    }
  });
}

// ─── 5. SUBNETS COMUNES FALLBACK ────────────────────────────────────
function getCommonSubnets() {
  // Rangos donde 95% de routers default ubican sus DHCP pools
  return [
    { start: ipToInt('192.168.0.1'),  end: ipToInt('192.168.0.254'),  source: 'common-192.168.0' },
    { start: ipToInt('192.168.1.1'),  end: ipToInt('192.168.1.254'),  source: 'common-192.168.1' },
    { start: ipToInt('192.168.2.1'),  end: ipToInt('192.168.2.254'),  source: 'common-192.168.2' },
    { start: ipToInt('192.168.80.1'), end: ipToInt('192.168.80.254'), source: 'common-192.168.80' },
    { start: ipToInt('192.168.100.1'), end: ipToInt('192.168.100.254'), source: 'common-192.168.100' },
    { start: ipToInt('10.0.0.1'),     end: ipToInt('10.0.0.254'),     source: 'common-10.0.0' },
    { start: ipToInt('10.0.1.1'),     end: ipToInt('10.0.1.254'),     source: 'common-10.0.1' },
    { start: ipToInt('172.16.0.1'),   end: ipToInt('172.16.0.254'),   source: 'common-172.16.0' }
  ];
}

// ─── PROBADOR PARALELO CON CONCURRENCIA ─────────────────────────────
async function probeIPs(ips, port, timeout, concurrency) {
  const found = [];
  let idx = 0;
  port = port || PRINTER_PORT;
  timeout = timeout || DEFAULT_TIMEOUT;
  concurrency = concurrency || 50;
  async function worker() {
    while (idx < ips.length) {
      const myIdx = idx++;
      const ip = ips[myIdx];
      const r = await pingPort(ip, port, timeout);
      if (r.ok) found.push({ ip, port, latency_ms: r.ms });
    }
  }
  const workers = Array(concurrency).fill(0).map(() => worker());
  await Promise.all(workers);
  return found;
}

// ─── ORQUESTADOR PRINCIPAL ──────────────────────────────────────────
/**
 * Discovery completo de impresoras IP
 *
 * @param {object} opts
 *   timeout {number}      timeout per TCP probe (default 500ms)
 *   concurrency {number}  parallel probes (default 50)
 *   includeCommon {bool}  scan common subnets (192.168.0-2, 10.0.0, 172.16) (default true)
 *   includeArp {bool}     parse arp table (default true)
 *   includeMDNS {bool}    mDNS query (default true)
 *   includeSSDP {bool}    SSDP query (default true)
 *   maxIPs {number}       cap total IPs to probe (default 2000)
 *   onProgress {fn}       callback({stage, percent, found})
 */
async function discoverPrinters(opts = {}) {
  const startTime = Date.now();
  const timeout = opts.timeout || 500;
  const concurrency = opts.concurrency || 50;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const port = opts.port || PRINTER_PORT;
  const maxIPs = opts.maxIPs || 2000;

  const result = {
    found: [],
    stats: { stages: {}, total_ips_probed: 0, elapsed_ms: 0 },
    sources: {}
  };

  // ─── PASO 1: mDNS + SSDP en paralelo (rápido, no consume mucho) ───
  onProgress({ stage: 'mdns-ssdp', percent: 5 });
  let mdnsResults = [], ssdpResults = [];
  if (opts.includeMDNS !== false || opts.includeSSDP !== false) {
    const promises = [];
    if (opts.includeMDNS !== false) promises.push(discoverMDNS(2500).then(r => mdnsResults = r));
    if (opts.includeSSDP !== false) promises.push(discoverSSDP(2500).then(r => ssdpResults = r));
    await Promise.all(promises);
  }
  result.stats.stages.mdns = mdnsResults.length;
  result.stats.stages.ssdp = ssdpResults.length;

  // ─── PASO 2: ARP table ─────────────────────────────────────────
  onProgress({ stage: 'arp', percent: 15 });
  let arpResults = [];
  if (opts.includeArp !== false) {
    arpResults = await readArpTable();
  }
  result.stats.stages.arp = arpResults.length;

  // Probar IPs únicas de mDNS/SSDP/ARP
  const candidateIPs = new Set();
  [...mdnsResults, ...ssdpResults, ...arpResults].forEach((r) => {
    if (r.ip) candidateIPs.add(r.ip);
  });
  if (candidateIPs.size > 0) {
    onProgress({ stage: 'probe-candidates', percent: 25 });
    const arr = Array.from(candidateIPs);
    const probed = await probeIPs(arr, port, timeout, concurrency);
    result.stats.total_ips_probed += arr.length;
    for (const p of probed) {
      result.found.push(Object.assign({ source: 'discovery' }, p));
    }
  }

  // ─── PASO 3: Interfaces locales (escanear cada subnet) ─────────
  onProgress({ stage: 'local-ifaces', percent: 35 });
  const ranges = getLocalNetworkRanges();
  result.stats.stages.local_ranges = ranges.length;

  for (let r = 0; r < ranges.length; r++) {
    const range = ranges[r];
    const ips = [];
    for (let i = range.start; i <= range.end && ips.length < maxIPs; i++) {
      const ip = intToIp(i);
      if (!candidateIPs.has(ip)) ips.push(ip);
    }
    if (ips.length === 0) continue;
    onProgress({ stage: 'probe-iface-' + range.iface, percent: 40 + (r * 20 / ranges.length) });
    const probed = await probeIPs(ips, port, timeout, concurrency);
    result.stats.total_ips_probed += ips.length;
    for (const p of probed) {
      // dedupe
      if (!result.found.some(f => f.ip === p.ip)) {
        result.found.push(Object.assign({ source: 'local-' + range.iface }, p));
      }
    }
  }

  // ─── PASO 4: Subnets comunes (si no encontramos nada o pidió includeCommon) ─
  const needCommon = result.found.length === 0 || opts.includeCommon === true;
  if (needCommon) {
    onProgress({ stage: 'common-subnets', percent: 65 });
    const commons = getCommonSubnets();
    const allCommonIPs = [];
    for (const r of commons) {
      for (let i = r.start; i <= r.end; i++) {
        const ip = intToIp(i);
        if (!candidateIPs.has(ip) && !result.found.some(f => f.ip === ip)) {
          allCommonIPs.push(ip);
        }
      }
    }
    if (allCommonIPs.length > maxIPs) {
      allCommonIPs.length = maxIPs;
    }
    onProgress({ stage: 'probe-common', percent: 75, total: allCommonIPs.length });
    const probed = await probeIPs(allCommonIPs, port, timeout, concurrency);
    result.stats.total_ips_probed += allCommonIPs.length;
    for (const p of probed) {
      if (!result.found.some(f => f.ip === p.ip)) {
        result.found.push(Object.assign({ source: 'common-subnet' }, p));
      }
    }
  }

  // ─── PASO 5: Enriquecer datos (mDNS/SSDP info) ─────────────────
  for (const f of result.found) {
    const mdns = mdnsResults.find(m => m.ip === f.ip);
    const ssdp = ssdpResults.find(s => s.ip === f.ip);
    const arp = arpResults.find(a => a.ip === f.ip);
    if (mdns) { f.mdns = true; if (mdns.isPrinter) f.likelyPrinter = true; }
    if (ssdp) { f.ssdp = true; if (ssdp.isPrinter) f.likelyPrinter = true; }
    if (arp) { f.mac = arp.mac; }
  }

  result.stats.elapsed_ms = Date.now() - startTime;
  onProgress({ stage: 'done', percent: 100, found: result.found.length });
  return result;
}

module.exports = {
  discoverPrinters,
  getLocalNetworkRanges,
  readArpTable,
  discoverMDNS,
  discoverSSDP,
  pingPort
};
