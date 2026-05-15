/**
 * printer-auto-setup.js — Auto-instalación + auto-fix de impresora térmica al arrancar.
 *
 * OBJETIVO (adulto mayor, 60-75 años, no técnico):
 *   El usuario conecta una impresora térmica 58mm/80mm USB y NUNCA tiene que:
 *     - Instalar drivers
 *     - Configurar puertos
 *     - Elegir impresora default
 *     - Aceptar UAC adicional (la app ya corre como admin)
 *
 * QUÉ HACE ESTE MÓDULO (corre en background al arrancar Electron):
 *   1. Asegura que Print Spooler esté habilitado y corriendo
 *   2. Limpia duplicados típicos de POS chinas (END-80TEUX (Copia N), POS-XXX clones)
 *   3. Escanea USB en busca de hardware térmico conocido (Yichip, WinChipHead, Bixolon, EPSON TM)
 *   4. Si encuentra hardware pero el driver actual está colgado (job no avanza), re-vincula:
 *      - Elimina puerto USB huérfano
 *      - Re-enumera USB (disable+enable) para que Windows cree puerto fresco
 *      - Crea impresora "Volvix-Thermal" con driver "Generic / Text Only" (built-in Windows)
 *      - Marca como default
 *   5. Si NO encuentra ningún driver de POS, instala el bundleado en resources/drivers/
 *   6. Reporta el estado al renderer via IPC para que el POS sepa si la impresora está lista
 *
 * Se ejecuta:
 *   - Una vez al arrancar la app (silencioso, en background, max 30s timeout)
 *   - Cuando el usuario explícitamente lo dispare desde Configuración → "Detectar impresora"
 */

const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// USB vendor IDs comunes de impresoras térmicas POS chinas/coreanas/japonesas
const KNOWN_THERMAL_USB_IDS = [
  /VID_0416&PID_5011/i,   // Winbond / WinChipHead (POS-58, POS-80 genéricas)
  /VID_0416&PID_5000/i,   // Variante
  /VID_0FE6/i,            // ICS Advent (POS comunes)
  /VID_0519/i,            // Star Micronics
  /VID_04B8/i,            // EPSON (TM-T20, TM-T82, etc)
  /VID_0DD4/i,            // Custom (Bixolon)
  /VID_154F/i,            // SNBC
  /VID_28E9/i,            // Bixolon/SRP
  /VID_1659/i,            // Prolific (usado por Munbyn, 3nstar)
  /VID_067B/i,            // Prolific (POS varios)
  /VID_0DD2/i,            // Custom adaptadores POS
];

const KNOWN_THERMAL_KEYWORDS = /YICHIP|POS-?58|POS-?80|TM-T\d+|EPSON\s+TM|XPrinter|XP-\d+|3NSTAR|MUNBYN|BIXOLON|SRP-?\d+|STAR\s+\w+|THERMAL\s+RECEIPT/i;

// Nombres de impresoras duplicadas comunes que aparecen tras conexiones repetidas
const DUPLICATE_PRINTER_PATTERNS = [
  /\(Copia[r]? \d+\)$/i,
  /^Generic.*\(Copy\s*\d\)$/i,
];

const log = (...args) => console.log('[printer-auto-setup]', ...args);
const warn = (...args) => console.warn('[printer-auto-setup]', ...args);

/**
 * Ejecutar PowerShell silencioso y devolver stdout
 */
function runPowerShell(script, timeout = 15000) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
    execFile('powershell.exe', args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        warn('PS error:', err.message, stderr);
        resolve({ ok: false, error: err.message, stdout: '', stderr });
      } else {
        resolve({ ok: true, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() });
      }
    });
  });
}

/**
 * 1. Asegurar Spooler corriendo
 */
async function ensureSpoolerRunning() {
  log('checking spooler...');
  const status = await runPowerShell(
    `$s = Get-Service Spooler; "$($s.Status)|$($s.StartType)"`
  );
  if (!status.ok) return { ok: false, reason: 'cannot read service' };
  const [st, type] = status.stdout.split('|');
  if (st === 'Running') {
    log('spooler running ✓');
    return { ok: true, alreadyOk: true };
  }
  log('spooler needs start. Current:', st, type);
  const fix = await runPowerShell(`
    try {
      if ((Get-Service Spooler).StartType -eq 'Disabled') {
        Set-Service Spooler -StartupType Automatic
      }
      Start-Service Spooler
      Start-Sleep -Seconds 1
      $s = Get-Service Spooler
      Write-Output "$($s.Status)|$($s.StartType)"
    } catch { Write-Output "ERROR|$($_.Exception.Message)" }
  `, 10000);
  return { ok: fix.ok && fix.stdout.startsWith('Running'), result: fix.stdout };
}

/**
 * 2. Listar impresoras instaladas
 */
async function listPrinters() {
  const r = await runPowerShell(
    `Get-Printer | Select-Object Name,PortName,DriverName,PrinterStatus | ConvertTo-Json -Compress`,
    8000
  );
  if (!r.ok) return [];
  try {
    const data = JSON.parse(r.stdout || '[]');
    return Array.isArray(data) ? data : [data];
  } catch (e) { warn('parse printers:', e.message); return []; }
}

/**
 * 3. Buscar hardware térmico conectado en USB
 */
async function findThermalHardware() {
  const r = await runPowerShell(
    `Get-PnpDevice -PresentOnly | Where-Object {$_.InstanceId -match 'USB\\\\VID_'} | Select-Object FriendlyName,InstanceId,Status,Service | ConvertTo-Json -Compress`,
    8000
  );
  if (!r.ok) return [];
  let devices = [];
  try {
    const parsed = JSON.parse(r.stdout || '[]');
    devices = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) { return []; }

  return devices.filter((d) => {
    if (!d || !d.InstanceId) return false;
    const id = String(d.InstanceId);
    const name = String(d.FriendlyName || '');
    const svc = String(d.Service || '');
    // Filtros: por VID/PID conocido, nombre con palabras clave, o servicio usbprint
    if (KNOWN_THERMAL_USB_IDS.some((rx) => rx.test(id))) return true;
    if (KNOWN_THERMAL_KEYWORDS.test(name)) return true;
    if (svc === 'usbprint') return true;
    return false;
  });
}

/**
 * 4. Eliminar impresoras duplicadas (END-80TEUX (Copia N), etc.)
 */
async function removeDuplicatePrinters() {
  const printers = await listPrinters();
  const removed = [];
  for (const p of printers) {
    if (!p || !p.Name) continue;
    if (DUPLICATE_PRINTER_PATTERNS.some((rx) => rx.test(p.Name))) {
      const r = await runPowerShell(`Remove-Printer -Name "${p.Name.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue`);
      if (r.ok) removed.push(p.Name);
    }
  }
  if (removed.length) log('removed duplicates:', removed.join(', '));
  return removed;
}

/**
 * 5. Detectar si una impresora tiene jobs colgados (driver/port broken)
 */
async function isPrinterHung(printerName) {
  const r = await runPowerShell(
    `(Get-PrintJob -PrinterName "${printerName.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue | Measure-Object).Count`,
    5000
  );
  if (!r.ok) return false;
  const count = parseInt(r.stdout, 10) || 0;
  return count > 0;
}

/**
 * 6. Asegurar driver Generic / Text Only existe
 */
async function ensureGenericDriver() {
  const r = await runPowerShell(`
    if (-not (Get-PrinterDriver -Name "Generic / Text Only" -ErrorAction SilentlyContinue)) {
      Add-PrinterDriver -Name "Generic / Text Only" -ErrorAction SilentlyContinue
    }
    if (Get-PrinterDriver -Name "Generic / Text Only" -ErrorAction SilentlyContinue) { Write-Output "OK" } else { Write-Output "MISSING" }
  `, 10000);
  return r.ok && r.stdout === 'OK';
}

/**
 * 7. Re-enumerar hardware USB para forzar puerto fresco
 */
async function recycleUsbDevice(instanceId) {
  const escapedId = instanceId.replace(/'/g, "''");
  const r = await runPowerShell(`
    try {
      Disable-PnpDevice -InstanceId '${escapedId}' -Confirm:$false -ErrorAction Stop
      Start-Sleep -Seconds 2
      Enable-PnpDevice -InstanceId '${escapedId}' -Confirm:$false -ErrorAction Stop
      Start-Sleep -Seconds 3
      Write-Output "OK"
    } catch { Write-Output "ERROR|$($_.Exception.Message)" }
  `, 15000);
  return r.ok && r.stdout === 'OK';
}

/**
 * 8. Crear nueva impresora "Volvix-Thermal" con driver Generic / Text Only
 */
async function createVolvixThermalPrinter(portName = 'USB001') {
  const r = await runPowerShell(`
    try {
      # Eliminar Volvix-Thermal previa si existe
      if (Get-Printer -Name "Volvix-Thermal" -ErrorAction SilentlyContinue) {
        Remove-Printer -Name "Volvix-Thermal" -ErrorAction SilentlyContinue
      }
      # Asegurar puerto existe
      if (-not (Get-PrinterPort -Name "${portName}" -ErrorAction SilentlyContinue)) {
        Add-PrinterPort -Name "${portName}" -ErrorAction Stop
      }
      Add-Printer -Name "Volvix-Thermal" -DriverName "Generic / Text Only" -PortName "${portName}" -ErrorAction Stop
      $p = Get-CimInstance Win32_Printer -Filter "Name='Volvix-Thermal'"
      Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter | Out-Null
      Write-Output "OK"
    } catch { Write-Output "ERROR|$($_.Exception.Message)" }
  `, 15000);
  return r.ok && r.stdout.startsWith('OK');
}

/**
 * 9. Eliminar puertos USB huérfanos (sin impresora asignada)
 */
async function removeOrphanedUsbPorts() {
  const r = await runPowerShell(`
    $printerPorts = (Get-Printer | Select-Object -ExpandProperty PortName) -as [string[]]
    $orphans = Get-PrinterPort | Where-Object { $_.Name -match '^USB\\d+$' -and $printerPorts -notcontains $_.Name }
    foreach ($p in $orphans) {
      try { Remove-PrinterPort -Name $p.Name -ErrorAction SilentlyContinue } catch {}
    }
    ($orphans | Measure-Object).Count
  `, 8000);
  if (r.ok) log('removed orphaned ports:', r.stdout);
}

/**
 * 10. Marcar impresora como default
 */
async function setDefaultPrinter(name) {
  const r = await runPowerShell(`
    $p = Get-CimInstance Win32_Printer -Filter "Name='${name.replace(/'/g, "''")}'"
    if ($p) { Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter | Out-Null; Write-Output "OK" }
    else { Write-Output "NOT_FOUND" }
  `, 5000);
  return r.ok && r.stdout === 'OK';
}

/**
 * ───────── ORQUESTADOR PRINCIPAL ─────────
 *
 * Devuelve un objeto con el estado final + cualquier acción tomada,
 * que el renderer puede mostrar en un toast no-bloqueante.
 */
async function runAutoSetup(options = {}) {
  const start = Date.now();
  const report = {
    started_at: new Date().toISOString(),
    actions: [],
    hardware_found: [],
    final_printer: null,
    success: false,
    elapsed_ms: 0
  };

  function track(action) {
    log(action);
    report.actions.push({ at: Date.now() - start, msg: action });
  }

  try {
    // Step 1: Spooler
    const spoolerRes = await ensureSpoolerRunning();
    if (!spoolerRes.ok) {
      track('spooler not running and could not start');
      report.elapsed_ms = Date.now() - start;
      return report;
    }
    track(spoolerRes.alreadyOk ? 'spooler already ok' : 'spooler enabled and started');

    // Step 2: Encontrar hardware térmico
    const hardware = await findThermalHardware();
    report.hardware_found = hardware.map((h) => ({ name: h.FriendlyName, id: h.InstanceId, service: h.Service }));
    track(`hardware found: ${hardware.length} thermal candidate(s)`);

    if (hardware.length === 0) {
      track('no thermal hardware connected — skipping printer setup');
      report.elapsed_ms = Date.now() - start;
      return report;
    }

    // Step 3: Limpiar duplicados
    const removed = await removeDuplicatePrinters();
    if (removed.length) track(`removed ${removed.length} duplicate printers`);

    // Step 4: Asegurar Generic driver disponible
    const genericOk = await ensureGenericDriver();
    if (!genericOk) {
      track('generic driver not available');
      report.elapsed_ms = Date.now() - start;
      return report;
    }
    track('generic driver ready');

    // Step 5: Listar impresoras actuales
    let printers = await listPrinters();

    // Step 6: Verificar si ya hay una impresora térmica funcional
    const existingThermal = printers.find((p) =>
      p && p.Name && /POS-?58|POS-?80|VOLVIX-?THERMAL|THERMAL|TM-T|END-80/i.test(p.Name)
    );

    // Si Volvix-Thermal ya existe Y no tiene jobs colgados, todo bien
    if (existingThermal && existingThermal.Name === 'Volvix-Thermal') {
      const hung = await isPrinterHung('Volvix-Thermal');
      if (!hung) {
        track('Volvix-Thermal exists and is healthy');
        await setDefaultPrinter('Volvix-Thermal');
        report.final_printer = 'Volvix-Thermal';
        report.success = true;
        report.elapsed_ms = Date.now() - start;
        return report;
      } else {
        track('Volvix-Thermal exists but has stuck jobs — will rebuild');
      }
    }

    // 2026-05-14 BUGFIX: si encontramos hardware térmico Y NO existe "Volvix-Thermal",
    // SIEMPRE reconstruir. La existencia de POS-58C, POS-80C u otra no es garantía
    // de que el driver/puerto estén bien mapeados al hardware actual — frecuentemente
    // son fantasmas de instalaciones anteriores con USB001/USB002 huérfanos que cuelgan
    // los jobs sin error visible (status "Normal" pero el papel nunca sale).
    // La solución determinista: rehacer la impresora con driver Generic / Text Only
    // (built-in Windows, no requiere descarga) sobre puerto USB fresco re-enumerado.
    let needRebuild = true;  // siempre que llegamos aquí con hardware presente, reconstruir
    if (existingThermal) {
      track(`found existing thermal "${existingThermal.Name}" but it's not Volvix-Thermal — rebuilding to ensure proper port binding`);
    } else {
      track('no thermal printer installed — will create Volvix-Thermal');
    }

    if (needRebuild) {
      // Step 7: Re-enumerar hardware para forzar puerto fresco
      for (const hw of hardware) {
        await recycleUsbDevice(hw.InstanceId);
      }
      track('USB hardware recycled');

      // Step 8: Eliminar puertos USB huérfanos
      await removeOrphanedUsbPorts();
      track('orphaned USB ports cleaned');

      // Step 9: Listar puertos USB después del recycle
      const portsRes = await runPowerShell(
        `Get-PrinterPort | Where-Object Name -match '^USB' | Select-Object -ExpandProperty Name`,
        5000
      );
      const usbPorts = portsRes.ok ? portsRes.stdout.split(/\r?\n/).filter(Boolean) : [];
      track(`USB ports available: ${usbPorts.join(', ') || 'none'}`);

      // Elegir el primer puerto USB disponible (Windows lo creó al re-enumerar)
      const targetPort = usbPorts[0] || 'USB001';

      // Step 10: Crear Volvix-Thermal
      const created = await createVolvixThermalPrinter(targetPort);
      if (created) {
        track(`Volvix-Thermal created on ${targetPort} and set as default`);
        report.final_printer = 'Volvix-Thermal';
        report.success = true;
      } else {
        track('failed to create Volvix-Thermal');
      }
    }

  } catch (e) {
    warn('auto-setup crashed:', e);
    track('crashed: ' + e.message);
  }

  report.elapsed_ms = Date.now() - start;
  return report;
}

/**
 * Versión "fast" que solo chequea estado, no toma acciones.
 * Para mostrar status en la pantalla de Configuración.
 */
async function getStatus() {
  const printers = await listPrinters();
  const hardware = await findThermalHardware();
  const spooler = await runPowerShell(`(Get-Service Spooler).Status`, 3000);
  return {
    spooler_running: spooler.ok && spooler.stdout === 'Running',
    hardware_connected: hardware.length > 0,
    hardware_list: hardware.map((h) => h.FriendlyName),
    printers_count: printers.length,
    has_volvix_thermal: printers.some((p) => p && p.Name === 'Volvix-Thermal'),
    default_printer: printers.find((p) => p && p.Default)?.Name || null,
  };
}

module.exports = { runAutoSetup, getStatus };
