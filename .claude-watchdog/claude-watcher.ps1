# ============================================================
# Claude Code Watchdog v4 - ANTI-DUPLICADOS + LIGERO
#
# Cambios vs v3:
#   * ANTES de relanzar, verifica si YA hay claude.exe con --resume <sid>
#   * Lanza ventana Minimized (visible en taskbar pero no estorba)
#   * Si ve 2+ instancias del mismo session-id, mata las viejas
#   * Cooldown post-launch mas largo (3 min) para dar tiempo a arrancar
# ============================================================

$ErrorActionPreference = 'Continue'

$WatchdogDir    = $PSScriptRoot
$SessionIdFile  = Join-Path $WatchdogDir 'session-id.txt'
$TargetFile     = Join-Path $WatchdogDir 'target.txt'
$LogFile        = Join-Path $WatchdogDir 'watcher.log'
$StopFlag       = Join-Path $WatchdogDir 'STOP-WATCHER.flag'
$StateFile      = Join-Path $WatchdogDir 'state.json'
$JsonlPathCache = Join-Path $WatchdogDir 'jsonl-path.cache'
$ClaudeExeCache = Join-Path $WatchdogDir 'claude-exe.cache'

$CheckIntervalSec       = 60
$RelaunchCooldownSec    = 180     # 3 min - tiempo suficiente para que arranque y escriba al JSONL
$MaxFailuresInRow       = 3
$LongPauseMin           = 30
$JsonlStaleThresholdSec = 300     # 5 min sin escribir => muerta (mas tolerante)
$ContinuePrompt         = 'continua'

$DefaultClaudeExe = 'C:\Users\DELL\AppData\Roaming\Claude\claude-code\2.1.128\claude.exe'

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line  = "[$stamp] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction Stop } catch {}
    try {
        if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 5MB)) {
            Move-Item -Path $LogFile -Destination "$LogFile.old" -Force
        }
    } catch {}
}

function Get-Target {
    $sessionId = $null; $worktree = $null
    if (Test-Path $SessionIdFile) {
        $sessionId = (Get-Content $SessionIdFile -Raw -EA SilentlyContinue) -split "`n" |
            ForEach-Object {$_.Trim()} | Where-Object {$_ -and -not $_.StartsWith('#')} | Select-Object -First 1
    }
    if (Test-Path $TargetFile) {
        $worktree = (Get-Content $TargetFile -Raw -EA SilentlyContinue) -split "`n" |
            ForEach-Object {$_.Trim()} | Where-Object {$_ -and -not $_.StartsWith('#')} | Select-Object -First 1
    }
    return @{ SessionId = $sessionId; Worktree = $worktree }
}

function Resolve-JsonlPath {
    param([string]$SessionId, [string]$Worktree)
    if (Test-Path $JsonlPathCache) {
        $cached = (Get-Content $JsonlPathCache -Raw -EA SilentlyContinue).Trim()
        if ($cached -and (Test-Path -LiteralPath $cached)) { return $cached }
    }
    $encoded = $Worktree -replace ':',''
    $encoded = $encoded -replace '[\\/]','-'
    if ($encoded -match '^([A-Za-z])-(.*)$') { $encoded = $matches[1] + '--' + $matches[2] }
    $candidate = Join-Path "$env:USERPROFILE\.claude\projects\$encoded" "$SessionId.jsonl"
    if (Test-Path -LiteralPath $candidate) { Set-Content -Path $JsonlPathCache -Value $candidate -Force; return $candidate }
    Write-Log "Buscando JSONL recursivo (1 vez)" 'INFO'
    $found = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Recurse -Filter "$SessionId.jsonl" -File -EA SilentlyContinue | Select-Object -First 1
    if ($found) { Set-Content -Path $JsonlPathCache -Value $found.FullName -Force; return $found.FullName }
    return $null
}

function Resolve-ClaudeExe {
    if (Test-Path $ClaudeExeCache) {
        $cached = (Get-Content $ClaudeExeCache -Raw -EA SilentlyContinue).Trim()
        if ($cached -and (Test-Path -LiteralPath $cached)) { return $cached }
    }
    if (Test-Path -LiteralPath $DefaultClaudeExe) { Set-Content -Path $ClaudeExeCache -Value $DefaultClaudeExe -Force; return $DefaultClaudeExe }
    $alt = Get-ChildItem 'C:\Users\DELL\AppData\Roaming\Claude\claude-code' -Recurse -Filter 'claude.exe' -File -EA SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($alt) { Set-Content -Path $ClaudeExeCache -Value $alt.FullName -Force; return $alt.FullName }
    return $null
}

# *** NUEVO v4: detecta procesos claude.exe activos con el session-id ***
function Get-ActiveSessionProcesses {
    param([string]$SessionId)
    return Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -EA SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match "--resume\s+$([regex]::Escape($SessionId))" }
}

# *** NUEVO v4: mata duplicados, conserva el mas reciente ***
function Remove-DuplicateSessions {
    param([string]$SessionId)
    $procs = Get-ActiveSessionProcesses -SessionId $SessionId
    if (@($procs).Count -le 1) { return @($procs).Count }
    $keep = $procs | Sort-Object CreationDate -Descending | Select-Object -First 1
    $kill = $procs | Where-Object { $_.ProcessId -ne $keep.ProcessId }
    foreach ($p in $kill) {
        Stop-Process -Id $p.ProcessId -Force -EA SilentlyContinue
        Write-Log "Duplicado eliminado: PID $($p.ProcessId)" 'WARN'
    }
    return 1
}

function Test-SessionAlive {
    param([string]$JsonlPath, [string]$SessionId)
    # Primero: hay proceso claude.exe con esa sesion?
    $procs = Get-ActiveSessionProcesses -SessionId $SessionId
    if (@($procs).Count -ge 1) { return @{ Alive=$true; By='proceso'; ProcessId=$procs[0].ProcessId; Count=@($procs).Count } }
    # Segundo: mtime del JSONL fresco?
    if ($JsonlPath -and (Test-Path -LiteralPath $JsonlPath)) {
        $item = Get-Item -LiteralPath $JsonlPath -EA SilentlyContinue
        if ($item) {
            $age = [int]((Get-Date) - $item.LastWriteTime).TotalSeconds
            if ($age -le $JsonlStaleThresholdSec) { return @{ Alive=$true; By='mtime'; AgeSec=$age } }
            return @{ Alive=$false; Reason='stale'; AgeSec=$age }
        }
    }
    return @{ Alive=$false; Reason='no-jsonl' }
}

function Start-ClaudeSession {
    param([string]$SessionId, [string]$Worktree, [string]$Exe)
    # SAFETY: verificar UNA VEZ MAS antes de lanzar
    $existing = Get-ActiveSessionProcesses -SessionId $SessionId
    if (@($existing).Count -ge 1) {
        Write-Log "ABORTANDO lanzamiento: ya hay $(@($existing).Count) instancia(s) con session $SessionId" 'WARN'
        return $false
    }
    if (-not (Test-Path -LiteralPath $Worktree)) { Write-Log "ERROR: worktree no existe" 'ERROR'; return $false }
    $psCmd = "Set-Location -LiteralPath '$Worktree'; & '$Exe' --resume '$SessionId' '$ContinuePrompt'"
    try {
        # Minimized = visible en taskbar pero no estorba la pantalla
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit','-ExecutionPolicy','Bypass','-Command',$psCmd) -WorkingDirectory $Worktree -WindowStyle Minimized | Out-Null
        Write-Log "Sesion $SessionId relanzada (ventana minimizada)" 'INFO'
        return $true
    } catch { Write-Log "ERROR: $_" 'ERROR'; return $false }
}

function Save-State { param([hashtable]$S) try { $S | ConvertTo-Json | Out-File $StateFile -Encoding UTF8 -Force } catch {} }

if (Test-Path $StopFlag) { Remove-Item $StopFlag -Force -EA SilentlyContinue }

$target = Get-Target
if (-not $target.SessionId -or -not $target.Worktree) { Write-Log "FATAL: config invalida" 'ERROR'; exit 1 }

Write-Log "=== Watcher v4 ANTI-DUP iniciado | PID $PID | intervalo ${CheckIntervalSec}s ===" 'INFO'
Write-Log "Session: $($target.SessionId)" 'INFO'

$jsonlPath = Resolve-JsonlPath -SessionId $target.SessionId -Worktree $target.Worktree
$claudeExe = Resolve-ClaudeExe

$failsInRow = 0
$lastRelaunch = (Get-Date).AddMinutes(-30)
$relaunchCnt = 0

while ($true) {
    if (Test-Path $StopFlag) { Write-Log "STOP flag. Saliendo." 'INFO'; Remove-Item $StopFlag -Force -EA SilentlyContinue; break }

    if (-not $jsonlPath -or -not (Test-Path -LiteralPath $jsonlPath)) {
        $jsonlPath = Resolve-JsonlPath -SessionId $target.SessionId -Worktree $target.Worktree
    }
    if (-not $claudeExe -or -not (Test-Path -LiteralPath $claudeExe)) {
        $claudeExe = Resolve-ClaudeExe
    }

    # *** Mata duplicados si los hay ***
    $count = Remove-DuplicateSessions -SessionId $target.SessionId

    $check = Test-SessionAlive -JsonlPath $jsonlPath -SessionId $target.SessionId

    if ($check.Alive) {
        $failsInRow = 0
        Save-State @{ alive=$true; by=$check.By; pid=$check.ProcessId; ageSec=$check.AgeSec; lastSeen=(Get-Date).ToString('o'); relaunches=$relaunchCnt }
    } else {
        $secsSinceLast = ((Get-Date) - $lastRelaunch).TotalSeconds
        if ($secsSinceLast -lt $RelaunchCooldownSec) {
            # silencio durante cooldown
        } elseif (-not $jsonlPath) {
            Write-Log "JSONL ausente, NO relanzo" 'WARN'
        } elseif (-not $claudeExe) {
            Write-Log "claude.exe no resuelto, NO relanzo" 'WARN'
        } else {
            Write-Log "Sesion MUERTA ($($check.Reason) age=$($check.AgeSec)s). Relanzando..." 'WARN'
            $ok = Start-ClaudeSession -SessionId $target.SessionId -Worktree $target.Worktree -Exe $claudeExe
            $lastRelaunch = Get-Date
            if ($ok) { $relaunchCnt++; $failsInRow = 0 }
            else {
                $failsInRow++
                if ($failsInRow -ge $MaxFailuresInRow) {
                    Write-Log "$MaxFailuresInRow fallos. Pausa $LongPauseMin min." 'WARN'
                    Start-Sleep -Seconds ($LongPauseMin * 60)
                    $failsInRow = 0
                }
            }
        }
    }

    Start-Sleep -Seconds $CheckIntervalSec
}
