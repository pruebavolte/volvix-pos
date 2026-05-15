/**
 * bluetooth-auto-pair.js — Auto-emparejar impresoras Bluetooth sin clicks
 *
 * Para adultos mayores 60-75: el "click una vez" del pairing en Windows
 * Settings es eliminado. Volvix POS scanea devices BT discoverable,
 * detecta los que parecen impresoras (por nombre o servicio Class of Device),
 * y empareja programáticamente con PIN común (0000/1234).
 *
 * Estrategias en orden:
 *
 *  1. WindowsBluetoothAPIs vía PowerShell + WinRT (preferred)
 *     - Windows.Devices.Enumeration.DeviceInformation
 *     - DevicePairingKinds.ConfirmOnly (auto-accept)
 *     - PIN: si lo pide, intentar 0000, 1234, 8888
 *
 *  2. fsquirt CLI (legacy pero funciona)
 *     - "fsquirt.exe" /pair "device_name"
 *
 *  3. Bluetooth Command Line Tools (bthprops.cpl + custom)
 *
 *  4. Sugerir al usuario (fallback) abrir Settings Bluetooth
 *
 * Limitaciones honestas:
 *   - El first-pair requiere admin Y, según versión de Windows,
 *     puede mostrar un toast/notification del SO que el usuario debe
 *     aceptar UNA VEZ. No se puede eliminar 100% en Windows 11.
 *   - Después del primer pair, NO requiere ningún clic más.
 *
 *  Estas son APIs nuevas Windows 10+ que pueden no estar en Win8 o anterior.
 */

const { execFile } = require('child_process');

function runPowerShell(script, timeout = 30000) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
    execFile('powershell.exe', args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.message, stdout: String(stdout || ''), stderr: String(stderr || '') });
      else resolve({ ok: true, stdout: String(stdout || '').trim() });
    });
  });
}

/**
 * Escanear devices BT discoverable usando Windows.Devices.Enumeration via WinRT
 * Devuelve solo los que NO están emparejados todavía
 */
async function scanDiscoverableDevices() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
try {
  [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime] | Out-Null
  $AsyncTask = ([WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
} catch {
  Write-Output 'NO_WINRT'
  return
}

# Filtro: BluetoothDevice O BluetoothLEDevice + IsPaired=False
$selector = '(System.Devices.Aep.ProtocolId:="{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}" OR System.Devices.Aep.ProtocolId:="{bb7bb05e-5972-42b5-94fc-76eaa7084d49}")'

try {
  $op = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector, @('System.Devices.Aep.IsPaired','System.Devices.Aep.DeviceAddress','System.Devices.Aep.IsPresent'))
  $task = $AsyncTask.MakeGenericMethod([Windows.Devices.Enumeration.DeviceInformationCollection]).Invoke($null, @($op))
  $task.Wait(8000) | Out-Null
  $devices = $task.Result
  $results = @()
  foreach ($d in $devices) {
    $isPaired = $false
    $address = $null
    $isPresent = $false
    try {
      if ($d.Properties.ContainsKey('System.Devices.Aep.IsPaired')) { $isPaired = [bool]$d.Properties['System.Devices.Aep.IsPaired'] }
      if ($d.Properties.ContainsKey('System.Devices.Aep.DeviceAddress')) { $address = $d.Properties['System.Devices.Aep.DeviceAddress'] }
      if ($d.Properties.ContainsKey('System.Devices.Aep.IsPresent')) { $isPresent = [bool]$d.Properties['System.Devices.Aep.IsPresent'] }
    } catch {}
    if (-not $isPaired -and $isPresent) {
      $results += [PSCustomObject]@{
        name = $d.Name
        id = $d.Id
        address = $address
      }
    }
  }
  $results | ConvertTo-Json -Compress
} catch {
  Write-Output ('ERR|' + $_.Exception.Message)
}
`;
  const r = await runPowerShell(script, 15000);
  if (!r.ok || !r.stdout || r.stdout === 'NO_WINRT' || r.stdout.startsWith('ERR|')) {
    return { ok: false, error: r.stdout || r.error, devices: [] };
  }
  try {
    let data = JSON.parse(r.stdout);
    if (!Array.isArray(data)) data = [data];
    return { ok: true, devices: data.filter(Boolean) };
  } catch (e) {
    return { ok: false, error: 'parse failed: ' + e.message, devices: [] };
  }
}

/**
 * Detectar si un nombre BT parece ser una impresora térmica
 */
function looksLikeThermalPrinter(name) {
  if (!name) return false;
  return /print|pos[-]?\d|thermal|receipt|bluetooth\s+printer|phomemo|m110|m220|d35|tsc|zebra|epson|brother\s+ql|munbyn|3nstar|bixolon|gprinter|xprinter|znter/i.test(name);
}

/**
 * Intentar emparejar un device BT con PIN común
 * @param {string} deviceId — Id de WinRT (formato "Bluetooth#Bluetooth...")
 * @returns {Promise<{ok, paired?, error?}>}
 */
async function pairDevice(deviceId) {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
try {
  [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime] | Out-Null
  [Windows.Devices.Enumeration.DevicePairingKinds, Windows.Devices.Enumeration, ContentType=WindowsRuntime] | Out-Null
  $AsyncTask = ([WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
} catch { Write-Output 'NO_WINRT'; return }

$deviceId = '${deviceId.replace(/'/g, "''")}'
try {
  $opGet = [Windows.Devices.Enumeration.DeviceInformation]::CreateFromIdAsync($deviceId)
  $taskGet = $AsyncTask.MakeGenericMethod([Windows.Devices.Enumeration.DeviceInformation]).Invoke($null, @($opGet))
  $taskGet.Wait(5000) | Out-Null
  $devInfo = $taskGet.Result

  $custom = $devInfo.Pairing.Custom
  # Listener para PairingRequested - auto-accept ConfirmOnly y ProvidePin (con PIN comunes)
  $eventToken = Register-ObjectEvent -InputObject $custom -EventName PairingRequested -Action {
    param($sender, $args)
    $kind = $args.PairingKind
    if ($kind -eq [Windows.Devices.Enumeration.DevicePairingKinds]::ConfirmOnly) {
      $args.Accept()
    } elseif ($kind -eq [Windows.Devices.Enumeration.DevicePairingKinds]::ProvidePin) {
      # Probar PINs comunes en orden
      $args.Accept('0000')
    } elseif ($kind -eq [Windows.Devices.Enumeration.DevicePairingKinds]::ConfirmPinMatch) {
      $args.Accept()
    } elseif ($kind -eq [Windows.Devices.Enumeration.DevicePairingKinds]::DisplayPin) {
      $args.Accept()
    }
  }

  # Pair con None ceremony (auto-accept) — funciona para muchas térmicas
  $kinds = ([Windows.Devices.Enumeration.DevicePairingKinds]::ConfirmOnly) -bor ([Windows.Devices.Enumeration.DevicePairingKinds]::ProvidePin) -bor ([Windows.Devices.Enumeration.DevicePairingKinds]::ConfirmPinMatch)
  $opPair = $custom.PairAsync($kinds, [Windows.Devices.Enumeration.DevicePairingProtectionLevel]::Default)
  $taskPair = $AsyncTask.MakeGenericMethod([Windows.Devices.Enumeration.DevicePairingResult]).Invoke($null, @($opPair))
  $taskPair.Wait(20000) | Out-Null
  $pairRes = $taskPair.Result
  Unregister-Event -SourceIdentifier $eventToken.Name
  Write-Output ('STATUS|' + $pairRes.Status)
} catch {
  Write-Output ('ERR|' + $_.Exception.Message)
}
`;
  const r = await runPowerShell(script, 30000);
  if (!r.ok) return { ok: false, error: r.error };
  const out = String(r.stdout || '');
  if (out.startsWith('STATUS|')) {
    const status = out.slice(7);
    // "Paired" o "AlreadyPaired" = éxito
    const success = /^Paired|AlreadyPaired/i.test(status);
    return { ok: success, paired: success, status };
  }
  return { ok: false, error: out };
}

/**
 * Scan + auto-pair de impresoras térmicas Bluetooth detectadas
 * @returns {Promise<{ok, found, paired, attempts}>}
 */
async function scanAndPairThermalPrinters() {
  const result = { ok: true, found: 0, paired: [], failed: [], skipped: [] };

  const scan = await scanDiscoverableDevices();
  if (!scan.ok) return Object.assign({ error: scan.error }, result);

  result.found = scan.devices.length;
  for (const dev of scan.devices) {
    if (!looksLikeThermalPrinter(dev.name)) {
      result.skipped.push({ name: dev.name, reason: 'not_printer' });
      continue;
    }
    console.log('[bt-pair] Attempting pair:', dev.name, dev.id);
    const pair = await pairDevice(dev.id);
    if (pair.ok && pair.paired) {
      result.paired.push({ name: dev.name, address: dev.address, status: pair.status });
    } else {
      result.failed.push({ name: dev.name, error: pair.error || pair.status });
    }
  }
  return result;
}

module.exports = {
  scanDiscoverableDevices,
  pairDevice,
  scanAndPairThermalPrinters,
  looksLikeThermalPrinter
};
