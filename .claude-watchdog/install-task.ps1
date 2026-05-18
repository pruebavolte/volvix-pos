# Registra Scheduled Task que arranca el watcher al login
# Usa wrapper VBScript invisible (NO flashea ventana cada vez que dispara).

$ErrorActionPreference = 'Stop'

$TaskName    = 'ClaudeCodeWatcher-volvix-pos'
$WatchdogDir = $PSScriptRoot
$VbsWrapper  = Join-Path $WatchdogDir 'run-hidden.vbs'

if (-not (Test-Path $VbsWrapper)) {
    Write-Host "ERROR: No se encuentra $VbsWrapper" -ForegroundColor Red
    exit 1
}

# Quitar tarea anterior si existe
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Tarea anterior encontrada. Eliminandola..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Accion: wscript.exe ejecuta el VBS (totalmente invisible)
$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
    -Argument "`"$VbsWrapper`"" `
    -WorkingDirectory $WatchdogDir

# Trigger SOLO al logon (sin repeticion cada 5 min - eso era lo que flasheaba!)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Mantiene viva la sesion a5074f19 de volvix-pos. Wrapper VBScript invisible." | Out-Null

Write-Host ""
Write-Host "Tarea '$TaskName' registrada (v3 LIGERA)." -ForegroundColor Green
Write-Host " - Arranca SOLO al login (sin repeticion cada 5 min)"
Write-Host " - Usa wscript+VBS = 100% invisible (no flashea ventanas)"
Write-Host " - Watcher hace check cada 60s (no 20s)"
Write-Host " - SIN busquedas recursivas en loop (no satura disco)"
