/**
 * printer-uac-bypass.js — Crear Scheduled Task que ejecuta comandos admin sin UAC.
 *
 * El adulto mayor NO debe ver popups de "¿Permitir?" cada vez que la app
 * necesita escribir en registry, instalar drivers, eliminar impresoras, etc.
 *
 * Truco Windows: una Scheduled Task con `runLevel=HighestAvailable` corre
 * con tokens elevados SIN disparar UAC, PORQUE Task Scheduler está en el
 * grupo de "trusted system processes" que tienen exempción. Lo único que
 * requiere UAC es CREAR el task la primera vez (que hacemos en el installer
 * NSIS que ya corre elevado).
 *
 * Flujo:
 *   1. NSIS installer (post-install hook) crea el task "VolvixAdminHelper"
 *      apuntando a un script PowerShell que recibe comandos via archivo.
 *   2. La app Volvix POS escribe "comando" en %TEMP%/volvix-admin-cmd.json
 *   3. La app dispara el task: schtasks /Run /TN "VolvixAdminHelper"
 *   4. El task lee el comando, lo ejecuta como SYSTEM (no UAC), escribe el
 *      resultado en %TEMP%/volvix-admin-result.json
 *   5. La app lee el resultado
 *
 * Comandos soportados:
 *   { action: 'install-printer-driver', infPath: '...' }
 *   { action: 'remove-printer', name: '...' }
 *   { action: 'recycle-usb-device', instanceId: '...' }
 *   { action: 'set-printer-port', name: '...', port: '...' }
 *
 * Uso desde renderer:
 *   const result = await window.volvixElectron.adminRun({ action: 'recycle-usb-device', instanceId: '...' });
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TASK_NAME = 'VolvixAdminHelper';
const CMD_FILE = path.join(os.tmpdir(), 'volvix-admin-cmd.json');
const RESULT_FILE = path.join(os.tmpdir(), 'volvix-admin-result.json');

function runPowerShell(script, timeout = 10000) {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
    execFile('powershell.exe', args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: err.message, stdout: '' });
      else resolve({ ok: true, stdout: String(stdout || '').trim() });
    });
  });
}

/**
 * Ejecutar un comando admin sin UAC via Scheduled Task.
 * Si el task no existe, falla gracefully (la app puede usar fallback Set-Printer).
 */
async function adminRun(command) {
  // 1. Limpiar archivos previos
  try { fs.unlinkSync(RESULT_FILE); } catch (_) {}

  // 2. Escribir comando
  try {
    fs.writeFileSync(CMD_FILE, JSON.stringify(command), 'utf8');
  } catch (e) {
    return { ok: false, error: 'Cannot write cmd file: ' + e.message };
  }

  // 3. Verificar que el task existe
  const check = await runPowerShell(`(Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue) -ne $null`, 5000);
  if (!check.ok || check.stdout.trim() !== 'True') {
    return { ok: false, error: 'Scheduled task not registered (needs admin install first)' };
  }

  // 4. Disparar el task
  const trigger = await runPowerShell(`Start-ScheduledTask -TaskName '${TASK_NAME}'; Write-Output "STARTED"`, 5000);
  if (!trigger.ok) return { ok: false, error: 'Cannot start task: ' + trigger.error };

  // 5. Esperar resultado (polling con timeout)
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (fs.existsSync(RESULT_FILE)) {
      try {
        const result = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
        return result;
      } catch (e) {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return { ok: false, error: 'Timeout waiting for admin task result' };
}

/**
 * Registrar el Scheduled Task (solo se llama desde el NSIS installer post-install)
 */
async function registerTask() {
  // El script worker que corre como SYSTEM
  const workerScript = `
$cmdFile = "${CMD_FILE.replace(/\\/g, '\\\\')}"
$resultFile = "${RESULT_FILE.replace(/\\/g, '\\\\')}"
$result = @{ ok = $false }
try {
  if (-not (Test-Path $cmdFile)) { throw "No command file" }
  $cmd = Get-Content $cmdFile -Raw | ConvertFrom-Json
  switch ($cmd.action) {
    'install-printer-driver' {
      $r = & pnputil /add-driver $cmd.infPath /install 2>&1 | Out-String
      $result.ok = $true
      $result.output = $r
    }
    'remove-printer' {
      Remove-Printer -Name $cmd.name -ErrorAction Stop
      $result.ok = $true
    }
    'recycle-usb-device' {
      Disable-PnpDevice -InstanceId $cmd.instanceId -Confirm:$false -ErrorAction Stop
      Start-Sleep -Seconds 2
      Enable-PnpDevice -InstanceId $cmd.instanceId -Confirm:$false -ErrorAction Stop
      $result.ok = $true
    }
    'set-printer-port' {
      Set-Printer -Name $cmd.name -PortName $cmd.port -ErrorAction Stop
      $result.ok = $true
    }
    'add-printer' {
      Add-Printer -Name $cmd.name -DriverName $cmd.driver -PortName $cmd.port -ErrorAction Stop
      $result.ok = $true
    }
    default { throw "Unknown action: $($cmd.action)" }
  }
} catch {
  $result.ok = $false
  $result.error = $_.Exception.Message
}
$result | ConvertTo-Json -Compress | Set-Content -Path $resultFile -Encoding UTF8
`;
  const scriptPath = path.join(os.tmpdir(), 'volvix-admin-worker.ps1');
  fs.writeFileSync(scriptPath, workerScript, 'utf8');

  // Registrar el task como SYSTEM, run on demand, no UAC
  const register = `
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath.replace(/\\/g, '\\\\')}"'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Write-Output 'REGISTERED'
`;
  const r = await runPowerShell(register, 10000);
  return r.ok && r.stdout.includes('REGISTERED');
}

module.exports = { adminRun, registerTask, TASK_NAME };
