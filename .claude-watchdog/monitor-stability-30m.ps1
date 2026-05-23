# Monitor de estabilidad post-fix-pagefile
# Cada 30s durante 30 min. Captura clave para confirmar que ya no se traba.

$DurationMin = 30
$IntervalSec = 30
$Dir = 'D:\github\volvix-pos\.claude-watchdog'
$LogFile = Join-Path $Dir 'monitor-stability.log'
$CsvFile = Join-Path $Dir 'monitor-stability.csv'
$EventsLog = Join-Path $Dir 'monitor-stability-events.log'

"=== MONITOR ESTABILIDAD 30m @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (PID $PID) ===" | Out-File $LogFile -Encoding UTF8
"Time,RAM_Pct,RAM_FreeGB,Commit_Pct,Commit_UsedGB,Commit_LimitGB,C_FreeGB,Pagefile_GB,CPU_Pct,ChromeGB,ClaudeGB,Alert" | Out-File $CsvFile -Encoding UTF8
"" | Out-File $EventsLog -Encoding UTF8

$start = Get-Date
$alerts = 0
$peakRam = 0
$peakCommit = 0
$peakPagefile = 0
$minCFree = 999

while (((Get-Date) - $start).TotalMinutes -lt $DurationMin) {
    $now = Get-Date
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $cpu = Get-CimInstance Win32_Processor
        $ramT = [math]::Round($os.TotalVisibleMemorySize/1MB,2)
        $ramF = [math]::Round($os.FreePhysicalMemory/1MB,2)
        $ramPct = [math]::Round(($ramT - $ramF)/$ramT*100,1)
        $cT = [math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB,2)
        $cL = [math]::Round($os.TotalVirtualMemorySize/1MB,2)
        $cPct = [math]::Round($cT/$cL*100,1)

        $cFree = [math]::Round((Get-PSDrive C).Free/1GB,2)

        $pf = Get-Item 'C:\pagefile.sys' -Force -EA SilentlyContinue
        $pfGB = if ($pf) { [math]::Round($pf.Length/1GB,2) } else { 0 }

        $chs = Get-Process chrome -EA SilentlyContinue
        $chGB = if ($chs) { [math]::Round((($chs | Measure-Object WorkingSet -Sum).Sum)/1GB,2) } else { 0 }
        $cls = Get-Process claude -EA SilentlyContinue
        $clGB = if ($cls) { [math]::Round((($cls | Measure-Object WorkingSet -Sum).Sum)/1GB,2) } else { 0 }

        # ALERTAS
        $alert = ''
        if ($ramPct -ge 90) { $alert += 'RAM>=90% ' }
        if ($cPct -ge 95) { $alert += 'COMMIT>=95% ' }
        if ($cFree -lt 2) { $alert += 'C<2GB ' }
        if ($pfGB -gt 4.1) { $alert += 'PAGEFILE>4GB(!!) ' }

        if ($alert) {
            $alerts++
            "[$($now.ToString('HH:mm:ss'))] ALERTA: $alert | RAM=$ramPct% Commit=$cPct% C=$cFree GB PF=$pfGB GB" | Out-File $EventsLog -Append -Encoding UTF8
            $top5 = Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 5
            foreach ($p in $top5) {
                "    $($p.ProcessName) PID=$($p.Id) Mem=$([math]::Round($p.WorkingSet/1MB,0))MB" | Out-File $EventsLog -Append -Encoding UTF8
            }
        }

        # Picos
        if ($ramPct -gt $peakRam) { $peakRam = $ramPct }
        if ($cPct -gt $peakCommit) { $peakCommit = $cPct }
        if ($pfGB -gt $peakPagefile) { $peakPagefile = $pfGB }
        if ($cFree -lt $minCFree) { $minCFree = $cFree }

        # CSV
        "$($now.ToString('HH:mm:ss')),$ramPct,$ramF,$cPct,$cT,$cL,$cFree,$pfGB,$($cpu.LoadPercentage),$chGB,$clGB,$alert" | Out-File $CsvFile -Append -Encoding UTF8

        # Log legible
        "[$($now.ToString('HH:mm:ss'))] RAM=$ramPct%($ramF GB libre) Commit=$cPct%($cT/$cL GB) C=$cFree GB Pagefile=$pfGB GB CPU=$($cpu.LoadPercentage)% | Chrome=$chGB GB Claude=$clGB GB $alert" | Out-File $LogFile -Append -Encoding UTF8

    } catch {
        "[$($now.ToString('HH:mm:ss'))] ERR: $_" | Out-File $LogFile -Append -Encoding UTF8
    }
    Start-Sleep -Seconds $IntervalSec
}

"=== TERMINADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Append -Encoding UTF8
"PICOS: RAM=$peakRam% Commit=$peakCommit% Pagefile=$peakPagefile GB MinCFree=$minCFree GB" | Out-File $LogFile -Append -Encoding UTF8
"ALERTAS totales: $alerts" | Out-File $LogFile -Append -Encoding UTF8
