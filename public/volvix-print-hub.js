/**
 * volvix-print-hub.js
 * Print Hub centralizado para Volvix POS / Copiador y Pegador
 *
 * Funciones:
 *   - Detección de impresoras (USB, Bluetooth, Network/IPP, virtuales del SO)
 *   - Test page (genera y manda página de prueba)
 *   - Queue management (cola FIFO con prioridad, reintentos, cancelación)
 *   - Soporte duplex (simplex, long-edge, short-edge)
 *   - Soporte color / blanco y negro
 *   - Eventos (onJobUpdate, onPrinterUpdate)
 *
 * Expone: window.PrintHub
 *
 * Compatibilidad: navegador moderno + Electron. En Electron usa
 * webContents.getPrinters() / window.print(). En navegador usa Web USB,
 * Web Bluetooth y window.print() como fallback.
 */
(function (global) {
  'use strict';

  // ───────────────────────────── utilidades ─────────────────────────────
  const uid = (p = 'id') =>
    p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  const log = (...a) => console.log('[PrintHub]', ...a);
  const warn = (...a) => console.warn('[PrintHub]', ...a);
  const err = (...a) => console.error('[PrintHub]', ...a);

  const now = () => new Date().toISOString();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isElectron =
    typeof process !== 'undefined' &&
    process.versions &&
    !!process.versions.electron;

  // ───────────────────────────── modelo ─────────────────────────────────
  // Printer:
  //   { id, name, type: 'usb'|'bluetooth'|'network'|'system'|'virtual',
  //     status: 'ready'|'offline'|'error'|'busy',
  //     capabilities: { color: bool, duplex: bool, paperSizes: [..],
  //                     dpi: [..], maxCopies: int },
  //     raw: <objeto subyacente> }
  //
  // Job:
  //   { id, printerId, content, contentType, options, status, createdAt,
  //     startedAt, finishedAt, attempts, lastError, priority }

  const JOB_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    ERROR: 'error',
    CANCELLED: 'cancelled',
  };

  // ───────────────────────────── EventEmitter ───────────────────────────
  class Emitter {
    constructor() {
      this._h = {};
    }
    on(ev, fn) {
      (this._h[ev] = this._h[ev] || []).push(fn);
      return () => this.off(ev, fn);
    }
    off(ev, fn) {
      if (!this._h[ev]) return;
      this._h[ev] = this._h[ev].filter((f) => f !== fn);
    }
    emit(ev, payload) {
      (this._h[ev] || []).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          err('emitter handler error', e);
        }
      });
    }
  }

  // ───────────────────────────── PrintHub ───────────────────────────────
  class PrintHub extends Emitter {
    constructor(opts = {}) {
      super();
      this.opts = Object.assign(
        {
          maxRetries: 3,
          retryDelayMs: 1500,
          autoScanIntervalMs: 0, // 0 = no autoscan
          defaultDuplex: 'simplex', // 'simplex'|'long-edge'|'short-edge'
          defaultColor: true,
        },
        opts
      );
      this.printers = new Map(); // id -> Printer
      this.queue = []; // jobs pendientes
      this.history = []; // jobs terminados (capped)
      this.HISTORY_CAP = 200;
      this._running = false;
      this._scanTimer = null;
      if (this.opts.autoScanIntervalMs > 0) {
        this._scanTimer = setInterval(
          () => this.detectPrinters().catch(() => {}),
          this.opts.autoScanIntervalMs
        );
      }
    }

    // ──────────────── DETECCIÓN ────────────────
    async detectPrinters() {
      const found = [];
      const tasks = [
        this._detectSystem().catch((e) => (warn('system', e), [])),
        this._detectUSB().catch((e) => (warn('usb', e), [])),
        this._detectBluetooth().catch((e) => (warn('bt', e), [])),
        this._detectNetwork().catch((e) => (warn('net', e), [])),
      ];
      const all = await Promise.all(tasks);
      all.forEach((arr) => arr.forEach((p) => found.push(p)));

      // refresca el mapa
      const seen = new Set();
      found.forEach((p) => {
        seen.add(p.id);
        const prev = this.printers.get(p.id);
        if (!prev || prev.status !== p.status) {
          this.printers.set(p.id, p);
          this.emit('printerUpdate', { printer: p, change: prev ? 'updated' : 'added' });
        }
      });
      // marca como offline las que ya no aparecen
      for (const [id, p] of this.printers.entries()) {
        if (!seen.has(id) && p.status !== 'offline') {
          p.status = 'offline';
          this.emit('printerUpdate', { printer: p, change: 'offline' });
        }
      }
      return Array.from(this.printers.values());
    }

    async _detectSystem() {
      // 2026-05-14 FIX: el módulo Electron `remote` fue ELIMINADO en Electron 14+.
      // El POS instalado nunca podía enumerar impresoras del sistema → fallaba
      // a "Diálogo del sistema" forzando al adulto mayor a apretar Imprimir
      // manualmente. Ahora usamos window.volvixElectron (expuesto por preload.js
      // via contextBridge + IPC handler 'volvix:printers:list').
      try {
        const ve = global.volvixElectron || (typeof window !== 'undefined' && window.volvixElectron);
        if (ve && typeof ve.listSystemPrinters === 'function') {
          const list = await ve.listSystemPrinters();
          if (Array.isArray(list) && list.length) {
            return list.map((p) => {
              const name = p.displayName || p.name || 'Impresora sin nombre';
              const isThermal58 = /58|pos-?58|pos58|thermal.*58|generic.*pos/i.test(name);
              const isThermal80 = /80|pos-?80|pos80|thermal.*80|TM-?T?\d+|EPSON.*TM|XPrinter|XP-?\d+/i.test(name);
              return {
                id: 'sys:' + (p.name || uid()),
                name: name,
                type: 'system',
                status: p.status === 0 ? 'ready' : 'ready', // tratamos cualquier estado como ready
                isDefault: !!p.isDefault,
                // Detectar tipo de impresora por nombre para auto-config
                isThermal: isThermal58 || isThermal80,
                paperWidth: isThermal58 ? 58 : isThermal80 ? 80 : null,
                capabilities: Object.assign(
                  this._capsFromOptions(p.options || {}),
                  isThermal58 ? { paperSizes: ['58mm'], color: false } :
                  isThermal80 ? { paperSizes: ['80mm'], color: false } : {}
                ),
                raw: p,
              };
            });
          }
        }
      } catch (e) {
        warn('listSystemPrinters fallo', e);
      }
      // Browser puro (no Electron) o IPC falló: placeholder "Sistema (diálogo)"
      return [
        {
          id: 'sys:browser-dialog',
          name: 'Diálogo del sistema (window.print)',
          type: 'system',
          status: 'ready',
          capabilities: {
            color: true,
            duplex: false,
            paperSizes: ['A4', 'Letter'],
            dpi: [300],
            maxCopies: 99,
          },
          raw: null,
        },
      ];
    }

    // 2026-05-14: helper para que la app encuentre AUTOMÁTICAMENTE la mejor
    // impresora térmica (58/80mm) sin que el adulto mayor configure nada.
    // Prioridad: térmica default > térmica disponible > default del SO > primera
    async findBestThermalPrinter() {
      try {
        const all = await this.detectPrinters();
        const thermal = all.filter((p) => p.isThermal);
        if (thermal.length) {
          const def = thermal.find((p) => p.isDefault) || thermal[0];
          return def;
        }
        // No hay térmica detectada → usar default del SO si existe
        const sysDef = all.find((p) => p.type === 'system' && p.isDefault);
        return sysDef || all[0] || null;
      } catch (e) {
        warn('findBestThermalPrinter fallo:', e);
        return null;
      }
    }

    async _detectUSB() {
      if (!global.navigator || !navigator.usb || !navigator.usb.getDevices) return [];
      try {
        const devs = await navigator.usb.getDevices();
        return devs
          .filter((d) => this._looksLikePrinter(d))
          .map((d) => ({
            id: 'usb:' + d.vendorId + ':' + d.productId + ':' + (d.serialNumber || uid()),
            name: d.productName || `USB ${d.vendorId}/${d.productId}`,
            type: 'usb',
            status: d.opened ? 'busy' : 'ready',
            capabilities: {
              color: false,
              duplex: false,
              paperSizes: ['80mm', 'A4'],
              dpi: [203, 300],
              maxCopies: 1,
            },
            raw: d,
          }));
      } catch (e) {
        warn('Web USB no disponible', e);
        return [];
      }
    }

    _looksLikePrinter(dev) {
      // Clase USB 7 = impresora. Si no hay info, asumir sí.
      if (!dev || !dev.configurations) return true;
      try {
        return dev.configurations.some((c) =>
          c.interfaces.some((i) =>
            i.alternates.some((a) => a.interfaceClass === 7)
          )
        );
      } catch {
        return true;
      }
    }

    async _detectBluetooth() {
      if (!global.navigator || !navigator.bluetooth) return [];
      // Web Bluetooth no permite enumerar sin gesto del usuario.
      // Devolvemos ya emparejadas si el navegador lo soporta.
      try {
        if (typeof navigator.bluetooth.getDevices === 'function') {
          const list = await navigator.bluetooth.getDevices();
          return list.map((d) => ({
            id: 'bt:' + d.id,
            name: d.name || 'Bluetooth Printer',
            type: 'bluetooth',
            status: d.gatt && d.gatt.connected ? 'ready' : 'offline',
            capabilities: {
              color: false,
              duplex: false,
              paperSizes: ['58mm', '80mm'],
              dpi: [203],
              maxCopies: 1,
            },
            raw: d,
          }));
        }
      } catch (e) {
        warn('Web Bluetooth getDevices fallo', e);
      }
      return [];
    }

    async _detectNetwork() {
      // Sin permisos especiales no se puede escanear LAN desde el navegador.
      // Si el host expone un endpoint /api/printers, lo usamos.
      try {
        if (global.fetch) {
          const r = await fetch('/api/printers', { cache: 'no-store' });
          if (r.ok) {
            const arr = await r.json();
            return (Array.isArray(arr) ? arr : []).map((p) => ({
              id: 'net:' + (p.uri || p.host || p.name || uid()),
              name: p.name || p.host || 'Network Printer',
              type: 'network',
              status: p.status || 'ready',
              capabilities: Object.assign(
                {
                  color: !!p.color,
                  duplex: !!p.duplex,
                  paperSizes: p.paperSizes || ['A4', 'Letter'],
                  dpi: p.dpi || [300, 600],
                  maxCopies: p.maxCopies || 99,
                },
                p.capabilities || {}
              ),
              raw: p,
            }));
          }
        }
      } catch (e) {
        // silencioso: el endpoint puede no existir
      }
      return [];
    }

    _capsFromOptions(o) {
      return {
        color: o['printer-is-color'] !== 'false',
        duplex: !!o['sides'] || !!o['duplex'],
        paperSizes: (o['media-supported'] || 'A4,Letter').split(',').map((s) => s.trim()),
        dpi: (o['printer-resolution-supported'] || '300').split(',').map((n) => parseInt(n, 10) || 300),
        maxCopies: parseInt(o['copies-max'] || '99', 10),
      };
    }

    listPrinters() {
      return Array.from(this.printers.values());
    }

    getPrinter(id) {
      return this.printers.get(id) || null;
    }

    // ──────────────── TEST PAGE ────────────────
    async printTestPage(printerId, opts = {}) {
      const p = this.getPrinter(printerId);
      if (!p) throw new Error('Impresora no encontrada: ' + printerId);
      const html = this._buildTestPageHTML(p);
      return this.enqueue({
        printerId,
        content: html,
        contentType: 'text/html',
        options: Object.assign(
          { copies: 1, duplex: 'simplex', color: !!p.capabilities.color, title: 'Volvix Test Page' },
          opts
        ),
        priority: 10,
      });
    }

    _buildTestPageHTML(p) {
      return `<!doctype html><html><head><meta charset="utf-8"><title>Volvix Test Page</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
  h1{margin:0 0 8px} .row{display:flex;gap:12px;margin:8px 0}
  .sw{width:60px;height:30px;border:1px solid #000}
  .k{font-weight:600;width:140px}
  .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:12px}
  .grid div{height:24px;border:1px solid #444;text-align:center;font-size:11px;line-height:24px}
</style></head><body>
  <h1>Volvix Print Hub — Test Page</h1>
  <div class="row"><div class="k">Impresora:</div><div>${p.name}</div></div>
  <div class="row"><div class="k">Tipo:</div><div>${p.type}</div></div>
  <div class="row"><div class="k">Fecha:</div><div>${now()}</div></div>
  <div class="row"><div class="k">Color:</div>
    <div class="sw" style="background:#000"></div>
    <div class="sw" style="background:#0a84ff"></div>
    <div class="sw" style="background:#34c759"></div>
    <div class="sw" style="background:#ff3b30"></div>
    <div class="sw" style="background:#ffcc00"></div>
  </div>
  <div class="grid">${Array.from({ length: 64 }, (_, i) => `<div>${i + 1}</div>`).join('')}</div>
  <p style="margin-top:24px;font-size:12px;color:#555">
    Si ves todos los colores, la cuadrícula completa y este texto nítido,
    la impresora está OK.
  </p>
</body></html>`;
    }

    // ──────────────── QUEUE ────────────────
    enqueue(job) {
      if (!job || !job.printerId) throw new Error('job.printerId requerido');
      const j = {
        id: uid('job'),
        printerId: job.printerId,
        content: job.content || '',
        contentType: job.contentType || 'text/plain',
        options: Object.assign(
          {
            copies: 1,
            duplex: this.opts.defaultDuplex,
            color: this.opts.defaultColor,
            paperSize: 'A4',
            title: 'Volvix Job',
          },
          job.options || {}
        ),
        priority: job.priority || 0,
        status: JOB_STATUS.PENDING,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        attempts: 0,
        lastError: null,
      };
      this.queue.push(j);
      this.queue.sort((a, b) => b.priority - a.priority);
      this.emit('jobUpdate', { job: j, change: 'enqueued' });
      this._tick().catch((e) => err('tick', e));
      return j.id;
    }

    cancel(jobId) {
      const i = this.queue.findIndex((j) => j.id === jobId);
      if (i >= 0) {
        const j = this.queue.splice(i, 1)[0];
        j.status = JOB_STATUS.CANCELLED;
        j.finishedAt = now();
        this._archive(j);
        this.emit('jobUpdate', { job: j, change: 'cancelled' });
        return true;
      }
      return false;
    }

    getQueue() {
      return this.queue.slice();
    }
    getHistory() {
      return this.history.slice();
    }
    getJob(id) {
      return this.queue.find((j) => j.id === id) || this.history.find((j) => j.id === id) || null;
    }

    async _tick() {
      if (this._running) return;
      this._running = true;
      try {
        while (this.queue.length) {
          const j = this.queue[0];
          if (j.status === JOB_STATUS.CANCELLED) {
            this.queue.shift();
            continue;
          }
          await this._runJob(j);
          this.queue.shift();
          this._archive(j);
        }
      } finally {
        this._running = false;
      }
    }

    async _runJob(j) {
      j.status = JOB_STATUS.RUNNING;
      j.startedAt = now();
      j.attempts += 1;
      this.emit('jobUpdate', { job: j, change: 'running' });
      const p = this.getPrinter(j.printerId);
      if (!p) {
        j.status = JOB_STATUS.ERROR;
        j.lastError = 'Impresora no disponible';
        j.finishedAt = now();
        this.emit('jobUpdate', { job: j, change: 'error' });
        return;
      }
      try {
        await this._dispatch(p, j);
        j.status = JOB_STATUS.DONE;
        j.finishedAt = now();
        this.emit('jobUpdate', { job: j, change: 'done' });
      } catch (e) {
        j.lastError = (e && e.message) || String(e);
        if (j.attempts < this.opts.maxRetries) {
          warn('job retry', j.id, j.lastError);
          await sleep(this.opts.retryDelayMs);
          return this._runJob(j); // reintenta
        }
        j.status = JOB_STATUS.ERROR;
        j.finishedAt = now();
        this.emit('jobUpdate', { job: j, change: 'error' });
      }
    }

    _archive(j) {
      this.history.unshift(j);
      if (this.history.length > this.HISTORY_CAP)
        this.history.length = this.HISTORY_CAP;
    }

    // ──────────────── DISPATCH POR TIPO ────────────────
    async _dispatch(printer, job) {
      switch (printer.type) {
        case 'system':
        case 'virtual':
          return this._printViaSystem(printer, job);
        case 'usb':
          return this._printViaUSB(printer, job);
        case 'bluetooth':
          return this._printViaBluetooth(printer, job);
        case 'network':
          return this._printViaNetwork(printer, job);
        default:
          throw new Error('Tipo de impresora no soportado: ' + printer.type);
      }
    }

    async _printViaSystem(printer, job) {
      // Electron: webContents.print
      if (isElectron && printer.raw) {
        return new Promise((resolve, reject) => {
          try {
            const { remote } = require('electron'); // eslint-disable-line
            const win = remote.getCurrentWindow();
            win.webContents.print(
              {
                silent: true,
                deviceName: printer.raw.name,
                color: !!job.options.color,
                duplexMode: job.options.duplex || 'simplex',
                copies: job.options.copies || 1,
                pageSize: job.options.paperSize || 'A4',
              },
              (ok, reason) => (ok ? resolve() : reject(new Error(reason || 'print fail')))
            );
          } catch (e) {
            reject(e);
          }
        });
      }
      // Browser: abrir ventana oculta y window.print()
      return new Promise((resolve, reject) => {
        try {
          const w = global.open('', '_blank', 'width=800,height=600');
          if (!w) return reject(new Error('Popup bloqueado'));
          w.document.open();
          w.document.write(
            job.contentType === 'text/html'
              ? job.content
              : `<pre>${String(job.content).replace(/[<&]/g, (c) =>
                  c === '<' ? '&lt;' : '&amp;'
                )}</pre>`
          );
          w.document.close();
          w.focus();
          setTimeout(() => {
            try {
              w.print();
              w.close();
              resolve();
            } catch (e) {
              reject(e);
            }
          }, 250);
        } catch (e) {
          reject(e);
        }
      });
    }

    async _printViaUSB(printer, job) {
      const dev = printer.raw;
      if (!dev) throw new Error('USB device sin handler');
      if (!dev.opened) await dev.open();
      if (dev.configuration === null) await dev.selectConfiguration(1);
      // toma la primera interface de clase 7
      let ifaceNum = 0;
      try {
        const cfg = dev.configuration;
        const iface = cfg.interfaces.find((i) =>
          i.alternates.some((a) => a.interfaceClass === 7)
        );
        if (iface) ifaceNum = iface.interfaceNumber;
      } catch {}
      await dev.claimInterface(ifaceNum);
      const enc = new TextEncoder();
      const data = typeof job.content === 'string' ? enc.encode(job.content) : job.content;
      // endpoint OUT 1 por convención
      await dev.transferOut(1, data);
      await dev.releaseInterface(ifaceNum);
    }

    async _printViaBluetooth(printer, job) {
      const dev = printer.raw;
      if (!dev) throw new Error('BT device sin handler');
      if (!dev.gatt.connected) await dev.gatt.connect();
      // Servicio SPP genérico de impresoras térmicas
      const SVC = 0x18f0;
      const CHR = 0x2af1;
      const svc = await dev.gatt.getPrimaryService(SVC).catch(() => null);
      if (!svc) throw new Error('Servicio BT de impresora no encontrado');
      const chr = await svc.getCharacteristic(CHR);
      const enc = new TextEncoder();
      const buf = typeof job.content === 'string' ? enc.encode(job.content) : job.content;
      // chunkea en 180 bytes
      for (let i = 0; i < buf.length; i += 180) {
        await chr.writeValue(buf.slice(i, i + 180));
      }
    }

    async _printViaNetwork(printer, job) {
      if (!global.fetch) throw new Error('fetch no disponible');
      const r = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerId: printer.id,
          uri: (printer.raw && printer.raw.uri) || null,
          content: job.content,
          contentType: job.contentType,
          options: job.options,
        }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')));
    }

    // ──────────────── HELPERS PÚBLICOS ────────────────
    setDefaultDuplex(mode) {
      if (!['simplex', 'long-edge', 'short-edge'].includes(mode))
        throw new Error('duplex inválido: ' + mode);
      this.opts.defaultDuplex = mode;
    }
    setDefaultColor(b) {
      this.opts.defaultColor = !!b;
    }
    destroy() {
      if (this._scanTimer) clearInterval(this._scanTimer);
      this.queue.length = 0;
      this._h = {};
    }
  }

  // ───────────────────────────── export ─────────────────────────────────
  const instance = new PrintHub();
  global.PrintHub = instance;
  global.PrintHubClass = PrintHub;
  global.PrintHub.JOB_STATUS = JOB_STATUS;

  log('listo. Usa window.PrintHub.detectPrinters() para empezar.');
})(typeof window !== 'undefined' ? window : globalThis);
