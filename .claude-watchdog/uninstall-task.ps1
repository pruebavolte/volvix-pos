# Quita la Scheduled Task y detiene el watcher.

$TaskName = 'ClaudeCodeWatcher-volvix-pos'
$WatchdogDir = $PSScriptRoot
$Stopper = Join-Path $WatchdogDir 'stop-watcher.ps1'

# Detener watcher activo
if (Test-Path $Stopper) {
    & $Stopper
}

# Quitar tarea
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tarea '$TaskName' eliminada." -ForegroundColor Green
} else {
    Write-Host "No habia tarea registrada con ese nombre." -ForegroundColor Yellow
}
