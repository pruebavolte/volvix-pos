# Cambia la sesion objetivo del watcher.
# Detecta la sesion claude.exe activa "mas reciente" y la fija como objetivo.
# Tambien actualiza el path del worktree.

param(
    [string]$SessionId,
    [string]$Worktree
)

$WatchdogDir = $PSScriptRoot
$SessionIdFile = Join-Path $WatchdogDir 'session-id.txt'
$TargetFile    = Join-Path $WatchdogDir 'target.txt'

if (-not $SessionId -or -not $Worktree) {
    Write-Host "Auto-detectando sesion activa de Claude Code..."
    $procs = Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction SilentlyContinue
    $found = $null
    foreach ($p in $procs) {
        if ($p.CommandLine -match '--resume\s+([0-9a-f-]{36})') {
            $sid = $matches[1]
            # Tratar de extraer el worktree del path en --plugin-dir o Read(...)
            $wt = $null
            if ($p.CommandLine -match '\(([^)]*volvix-pos[^)]*)\)') {
                $path = $matches[1] -replace '/\*\*$',''
                if ($path -match '^//?([A-Za-z])/(.*)$') { $wt = "$($matches[1].ToUpper()):\$($matches[2] -replace '/','\')" }
            }
            $found = [PSCustomObject]@{ SessionId=$sid; Worktree=$wt; Pid=$p.ProcessId; Cmd=$p.CommandLine }
            break
        }
    }
    if (-not $found) { Write-Host "ERROR: No se encontro ninguna sesion claude.exe corriendo con --resume." -ForegroundColor Red; exit 1 }

    if (-not $SessionId) { $SessionId = $found.SessionId }
    if (-not $Worktree)  { $Worktree  = $found.Worktree }
    if (-not $Worktree) {
        Write-Host "WARN: no pude detectar el worktree automaticamente. Pasa -Worktree '<path>'." -ForegroundColor Yellow
        exit 1
    }
}

# Validar JSONL
$jsonl = Get-ChildItem "$env:USERPROFILE\.claude\projects" -Recurse -Filter "$SessionId.jsonl" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jsonl) {
    Write-Host "ADVERTENCIA: No se encontro $SessionId.jsonl en .claude\projects. La sesion puede no estar persistida aun." -ForegroundColor Yellow
}

Set-Content -Path $SessionIdFile -Value $SessionId -Force
Set-Content -Path $TargetFile    -Value $Worktree  -Force

Write-Host ""
Write-Host "Sesion objetivo actualizada:" -ForegroundColor Green
Write-Host "  Session ID: $SessionId"
Write-Host "  Worktree  : $Worktree"
if ($jsonl) { Write-Host "  JSONL     : $($jsonl.FullName) ($([math]::Round($jsonl.Length/1KB,2)) KB)" }
Write-Host ""
Write-Host "El watcher leera estos archivos en su proxima iteracion (max 20s)."
