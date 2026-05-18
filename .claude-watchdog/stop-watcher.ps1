# Detiene el watcher de forma limpia (via STOP flag) y como respaldo lo mata.

$WatchdogDir = $PSScriptRoot
$StopFlag    = Join-Path $WatchdogDir 'STOP-WATCHER.flag'
$PidFile     = Join-Path $WatchdogDir 'watcher.pid'

# 1) Crear STOP flag para parada limpia
New-Item -ItemType File -Path $StopFlag -Force | Out-Null
Write-Host "STOP flag creado. Esperando 25s para parada limpia..."
Start-Sleep -Seconds 25

# 2) Si sigue vivo, matarlo
$killed = $false
if (Test-Path $PidFile) {
    $pidVal = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pidVal -and (Get-Process -Id $pidVal -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
        Write-Host "Watcher (PID $pidVal) detenido forzosamente."
        $killed = $true
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# Tambien por commandline
$leftovers = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'claude-watcher\.ps1' }
foreach ($p in $leftovers) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "Watcher leftover (PID $($p.ProcessId)) detenido."
    $killed = $true
}

if (-not $killed) {
    Write-Host "Watcher detenido limpiamente via STOP flag."
}

Remove-Item $StopFlag -Force -ErrorAction SilentlyContinue
