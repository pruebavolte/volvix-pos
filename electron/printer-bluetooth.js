/**
 * printer-bluetooth.js — Impresión Bluetooth (SPP / virtual COM port)
 *
 * Por qué este módulo:
 *   - Impresoras térmicas Bluetooth usan SPP (Serial Port Profile)
 *   - Windows expone SPP como puerto COM virtual (COM4, COM5, COM6, COM7...)
 *   - Hablar al COM port escribe ESC/POS directo al hardware vía radio BT
 *   - NO requiere admin, NO requiere driver de impresora, NO usa spooler
 *
 * Funcionamiento:
 *   1. Escanear registry HKLM\SYSTEM\CurrentControlSet\Enum\BTHENUM en busca
 *      de devices con FriendlyName que contenga "printer"
 *   2. Mapear el MAC del device al COM port virtual (SPP service 0x1101)
 *   3. Abrir el COM con SerialPort .NET y escribir bytes ESC/POS
 *
 * Para el adulto mayor:
 *   - La impresora BT debe estar previamente emparejada en Windows Settings
 *   - Después, el sistema la detecta automáticamente y la usa cuando se
 *     selecciona "Bluetooth" en la configuración de Volvix POS
 *
 * Limitaciones:
 *   - Si hay varias impresoras BT, se elige la primera encontrada
 *   - El usuario puede forzar un MAC específico en config (advanced)
 */

const { exec, execFile } = require('child_process');

function runPowerShell(script, timeout = 8000) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
    execFile('powershell.exe', args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.message, stdout: '' });
      else resolve({ ok: true, stdout: String(stdout || '').trim() });
    });
  });
}

/**
 * Listar impresoras Bluetooth emparejadas + su puerto COM SPP
 * Returns: [{ name, mac, com, paired }]
 */
async function listBluetoothPrinters() {
  const script = `
$results = @()
$btDev = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\BTHENUM"
# 1) Encontrar todos los devices BT (Dev_<MAC>)
$macs = @{}
if (Test-Path $btDev) {
  Get-ChildItem $btDev -ErrorAction SilentlyContinue | Where-Object PSChildName -match '^Dev_([0-9A-F]+)$' | ForEach-Object {
    $mac = $matches[1]
    Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object {
      $info = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($info.FriendlyName) {
        $macs[$mac] = $info.FriendlyName
      }
    }
  }
}
# 2) Encontrar SPP COM ports y mapearlos al MAC
if (Test-Path $btDev) {
  Get-ChildItem $btDev -ErrorAction SilentlyContinue | Where-Object PSChildName -match '00001101' | ForEach-Object {
    Get-ChildItem $_.PSPath -ErrorAction SilentlyContinue | ForEach-Object {
      $info = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($info.FriendlyName -match 'COM(\\d+)') {
        $comNum = $matches[1]
        # Extraer MAC del InstanceId (ej: 7&xxx&0&5A4A77BACE8D_C00000000)
        $instId = $_.PSChildName
        if ($instId -match '&([0-9A-F]{12})_') {
          $mac = $matches[1]
          $name = $macs[$mac]
          if ($name) {
            $isPrinter = $name -match 'print|POS|58|80|thermal|receipt'
            $results += [PSCustomObject]@{
              name = $name
              mac = $mac
              com = "COM$comNum"
              isPrinter = $isPrinter
            }
          }
        }
      }
    }
  }
}
$results | ConvertTo-Json -Compress
`;
  const r = await runPowerShell(script, 8000);
  if (!r.ok || !r.stdout) return [];
  try {
    let data = JSON.parse(r.stdout);
    if (!Array.isArray(data)) data = [data];
    return data.filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * Encontrar la mejor impresora BT (primera que matchea "printer")
 */
async function findBestBluetoothPrinter() {
  const all = await listBluetoothPrinters();
  // Priorizar las que tienen "printer" en el nombre
  const printers = all.filter((d) => d.isPrinter);
  if (printers.length) return printers[0];
  // Si no hay claramente printer, devolver primer device con SPP COM
  return all[0] || null;
}

/**
 * Enviar bytes ESC/POS directo al COM port BT
 *
 * @param {string} comPort - "COM7", "COM5", etc.
 * @param {Buffer} bytes - Bytes ESC/POS a enviar
 * @param {object} opts - { baudRate, timeout }
 * @returns {Promise<{ok, bytesWritten, error}>}
 */
async function printBytesViaCom(comPort, bytes, opts = {}) {
  const baud = opts.baudRate || 9600;
  // Generar PowerShell que abre el COM y escribe los bytes (vía base64)
  const b64 = Buffer.isBuffer(bytes) ? bytes.toString('base64') : Buffer.from(String(bytes), 'binary').toString('base64');
  const script = `
$port = New-Object System.IO.Ports.SerialPort
$port.PortName = "${comPort.replace(/"/g, '`"')}"
$port.BaudRate = ${baud}
$port.Parity = 'None'
$port.DataBits = 8
$port.StopBits = 'One'
$port.WriteTimeout = 5000
try {
  $port.Open()
  Start-Sleep -Milliseconds 300
  $bytes = [System.Convert]::FromBase64String("${b64}")
  $port.Write($bytes, 0, $bytes.Length)
  $port.BaseStream.Flush()
  Start-Sleep -Milliseconds 500
  $port.Close()
  Write-Output "OK|$($bytes.Length)"
} catch {
  if ($port.IsOpen) { $port.Close() }
  Write-Output "ERR|$($_.Exception.Message)"
}
`;
  const r = await runPowerShell(script, (opts.timeout || 10000));
  if (!r.ok) return { ok: false, error: r.error || 'powershell failed' };
  const out = String(r.stdout || '');
  if (out.startsWith('OK|')) {
    return { ok: true, bytesWritten: parseInt(out.split('|')[1], 10) || 0 };
  }
  return { ok: false, error: out.split('|')[1] || out };
}

/**
 * Imprimir ticket via Bluetooth — recibe HTML o texto, genera ESC/POS,
 * encuentra la printer BT, manda bytes
 */
async function printTicketBT(opts = {}) {
  const { html, text, printerName, mac } = opts;

  // 1) Encontrar la impresora BT
  let printer = null;
  if (printerName || mac) {
    const all = await listBluetoothPrinters();
    printer = all.find((p) => (printerName && p.name === printerName) || (mac && p.mac === mac));
  }
  if (!printer) printer = await findBestBluetoothPrinter();
  if (!printer) return { ok: false, error: 'No Bluetooth printer paired or found' };

  // 2) Convertir HTML/texto a ESC/POS bytes
  const escposBytes = htmlToEscPos(html || text || '', opts.width || 32);

  // 3) Mandar al COM
  const result = await printBytesViaCom(printer.com, escposBytes, { baudRate: opts.baudRate || 9600 });
  return Object.assign({ printer: printer.name, com: printer.com, mac: printer.mac }, result);
}

/**
 * Convertidor minimalista HTML/texto plano → bytes ESC/POS para 58mm (32 chars).
 * No es perfecto pero cubre el caso común del ticket POS.
 */
function htmlToEscPos(content, width = 32) {
  const ESC = 0x1B, GS = 0x1D, LF = 0x0A;
  const out = [ESC, 0x40]; // Init

  // Si es HTML, extraer texto plano básico
  let text = String(content || '');
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

  // Encoding IBM437 (compatible con impresoras térmicas chinas genéricas)
  for (const ch of text) {
    if (ch === '\n') {
      out.push(LF);
    } else {
      const code = ch.charCodeAt(0);
      out.push(code < 256 ? code : 0x3F); // '?' para caracteres no ASCII
    }
  }

  // Feed paper + cut
  out.push(LF, LF, LF, LF);
  out.push(GS, 0x56, 0x00); // Full cut

  return Buffer.from(out);
}

module.exports = {
  listBluetoothPrinters,
  findBestBluetoothPrinter,
  printBytesViaCom,
  printTicketBT,
  htmlToEscPos
};
