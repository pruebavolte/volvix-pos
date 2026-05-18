# Lanza el watcher en background (oculto).
# Si ya hay otro corriendo, no lo duplica.

$WatchdogDir = $PSScriptRoot
$Watcher     = Join-Path $WatchdogDir 'claude-watcher.ps1'
$PidFile     = Join-Path $WatchdogDir 'watcher.pid'

# Verificar si ya hay un watcher activo
if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "Watcher YA esta corriendo (PID $oldPid). No se lanza otro."
        exit 0
    } else {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
}

# Tambien verificar por linea de comando (por si murio sin limpiar el pid file)
$existing = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'claude-watcher\.ps1' }
if ($existing) {
    Write-Host "Watcher YA esta corriendo (PID $($existing.ProcessId | Select-Object -First 1) detectado por commandline)."
    Set-Content -Path $PidFile -Value ($existing.ProcessId | Select-Object -First 1) -Force
    exit 0
}

Write-Host "Lanzando watcher en background..."
$args = @('-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File', $Watcher)
$proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WindowStyle Hidden -PassThru
Set-Content -Path $PidFile -Value $proc.Id -Force
Write-Host "Watcher iniciado. PID: $($proc.Id)"
Write-Host "Log: $(Join-Path $WatchdogDir 'watcher.log')"
