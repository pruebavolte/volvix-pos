# Estado del watchdog y de la sesion ESPECIFICA monitoreada.

$WatchdogDir   = $PSScriptRoot
$LogFile       = Join-Path $WatchdogDir 'watcher.log'
$PidFile       = Join-Path $WatchdogDir 'watcher.pid'
$StateFile     = Join-Path $WatchdogDir 'state.json'
$SessionIdFile = Join-Path $WatchdogDir 'session-id.txt'
$TargetFile    = Join-Path $WatchdogDir 'target.txt'

Write-Host ""
Write-Host "===== ESTADO DEL WATCHDOG (sesion especifica) =====" -ForegroundColor Cyan

# --- Cargar config actual ---
$sessionId = $null; $worktree = $null
if (Test-Path $SessionIdFile) { $sessionId = (Get-Content $SessionIdFile -Raw).Trim() -split "`n" | ForEach-Object {$_.Trim()} | Where-Object {$_ -and -not $_.StartsWith('#')} | Select-Object -First 1 }
if (Test-Path $TargetFile)    { $worktree  = (Get-Content $TargetFile -Raw).Trim() -split "`n" | ForEach-Object {$_.Trim()} | Where-Object {$_ -and -not $_.StartsWith('#')} | Select-Object -First 1 }

Write-Host "Session ID    : $sessionId"
Write-Host "Worktree path : $worktree"

# 1) Watcher
$watcherRunning = $false; $watcherPid = $null
if (Test-Path $PidFile) {
    $watcherPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($watcherPid -and (Get-Process -Id $watcherPid -ErrorAction SilentlyContinue)) { $watcherRunning = $true }
}
if (-not $watcherRunning) {
    $byCmd = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'claude-watcher\.ps1' } | Select-Object -First 1
    if ($byCmd) { $watcherRunning = $true; $watcherPid = $byCmd.ProcessId }
}
if ($watcherRunning) { Write-Host "Watcher       : CORRIENDO (PID $watcherPid)" -ForegroundColor Green }
else                 { Write-Host "Watcher       : NO esta corriendo" -ForegroundColor Red }

# 2) Sesion especifica corriendo?
if ($sessionId) {
    $procs = Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match "--resume\s+$([regex]::Escape($sessionId))" }
    if ($procs) {
        Write-Host "Sesion target : CORRIENDO" -ForegroundColor Green
        $procs | ForEach-Object { Write-Host "                PID $($_.ProcessId)" }
    } else {
        Write-Host "Sesion target : NO esta corriendo" -ForegroundColor Red
    }
}

# 3) JSONL persistido
if ($sessionId) {
    $found = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Recurse -Filter "$sessionId.jsonl" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
        Write-Host "JSONL en disco: $($found.FullName)" -ForegroundColor Green
        Write-Host "                Tamano: $([math]::Round($found.Length/1KB,2)) KB | Modificado: $($found.LastWriteTime)"
    } else {
        Write-Host "JSONL en disco: NO encontrado" -ForegroundColor Yellow
    }
}

# 4) Scheduled Task
$task = Get-ScheduledTask -TaskName 'ClaudeCodeWatcher-volvix-pos' -ErrorAction SilentlyContinue
if ($task) {
    $info = Get-ScheduledTaskInfo -TaskName 'ClaudeCodeWatcher-volvix-pos'
    Write-Host "Scheduled Task: Registrada ($($task.State)) | Ultimo: $($info.LastRunTime) | Result: 0x$([Convert]::ToString($info.LastTaskResult,16))" -ForegroundColor Green
} else {
    Write-Host "Scheduled Task: NO registrada" -ForegroundColor Yellow
}

# 5) Estado
if (Test-Path $StateFile) {
    Write-Host ""
    Write-Host "----- state.json -----" -ForegroundColor Cyan
    Get-Content $StateFile -Raw | Write-Host
}

# 6) Log
if (Test-Path $LogFile) {
    Write-Host ""
    Write-Host "----- Ultimas 15 lineas del log -----" -ForegroundColor Cyan
    Get-Content $LogFile -Tail 15 | ForEach-Object { Write-Host $_ }
}
Write-Host ""
