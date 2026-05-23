# Monitor ACTIVO 1 hora - cada 15 segundos
# Captura TODO y marca FREEZES con detalle.

$DurationMin = 60
$IntervalSec = 15
$WatchdogDir = 'D:\github\volvix-pos\.claude-watchdog'
$LogFile     = Join-Path $WatchdogDir 'monitor-active.log'
$EventsLog   = Join-Path $WatchdogDir 'monitor-active-events.log'
$SummaryFile = Join-Path $WatchdogDir 'monitor-active-summary.txt'
$RawFile     = Join-Path $WatchdogDir 'monitor-active-raw.csv'

"=== MONITOR ACTIVO 1 HORA @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (PID $PID) ===" | Out-File $LogFile -Encoding UTF8
"" | Out-File $LogFile -Append -Encoding UTF8
"Time,RAMUsedPct,RAMFreeGB,CommitUsedGB,CommitLimitGB,PFs,CPULoad,CPUFreq,ChromeP,ChromeGB,ClaudeP,ClaudeGB,TopMem,TopMB" | Out-File $RawFile -Encoding UTF8
"" | Out-File $EventsLog -Encoding UTF8

$start = Get-Date
$prevPF = 0
$freezeCnt = 0
$samples = 0

while (((Get-Date) - $start).TotalMinutes -lt $DurationMin) {
    $now = Get-Date
    try {
        $os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
        $cpu = Get-CimInstance Win32_Processor -EA SilentlyContinue
        $ramT = [math]::Round($os.TotalVisibleMemorySize/1MB,2)
        $ramF = [math]::Round($os.FreePhysicalMemory/1MB,2)
        $ramPct = [math]::Round(($ramT - $ramF)/$ramT*100,1)
        $cT = [math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB,2)
        $cL = [math]::Round($os.TotalVirtualMemorySize/1MB,2)

        $memPerf = Get-CimInstance Win32_PerfRawData_PerfOS_Memory -EA SilentlyContinue
        $pf = if ($memPerf) { $memPerf.PageFaultsPersec } else { 0 }
        $pfDelta = if ($prevPF -gt 0) { [math]::Max(0, $pf - $prevPF) } else { 0 }
        $prevPF = $pf

        $chs = Get-Process chrome -EA SilentlyContinue
        $chP = if ($chs) { @($chs).Count } else { 0 }
        $chGB = if ($chs) { [math]::Round((($chs | Measure-Object WorkingSet -Sum).Sum)/1GB,2) } else { 0 }

        $cls = Get-Process claude -EA SilentlyContinue
        $clP = if ($cls) { @($cls).Count } else { 0 }
        $clGB = if ($cls) { [math]::Round((($cls | Measure-Object WorkingSet -Sum).Sum)/1GB,2) } else { 0 }

        $top = Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 1
        $topName = $top.ProcessName
        $topMB = [math]::Round($top.WorkingSet/1MB,0)

        # FREEZE detector
        $freeze = ($ramPct -ge 92) -or ($pfDelta -gt 50000) -or ($cpu.LoadPercentage -ge 95)
        if ($freeze) {
            $freezeCnt++
            "[$($now.ToString('HH:mm:ss'))] *** FREEZE *** RAM=$ramPct% Commit=$cT/$cL GB PF/s=$pfDelta CPU=$($cpu.LoadPercentage)%" | Out-File $EventsLog -Append -Encoding UTF8
            $top10 = Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10
            foreach ($p in $top10) {
                "    $($p.ProcessName) PID=$($p.Id) Mem=$([math]::Round($p.WorkingSet/1MB,0))MB CPU=$([math]::Round($p.CPU,1))s" | Out-File $EventsLog -Append -Encoding UTF8
            }
            "" | Out-File $EventsLog -Append -Encoding UTF8
        }

        "$($now.ToString('HH:mm:ss')),$ramPct,$ramF,$cT,$cL,$pfDelta,$($cpu.LoadPercentage),$($cpu.CurrentClockSpeed),$chP,$chGB,$clP,$clGB,$topName,$topMB" | Out-File $RawFile -Append -Encoding UTF8

        "[$($now.ToString('HH:mm:ss'))] RAM=$ramPct%($ramF GB libre) Commit=$cT/$cL GB CPU=$($cpu.LoadPercentage)%@$($cpu.CurrentClockSpeed)MHz | Chrome=$chP($chGB GB) Claude=$clP($clGB GB) | Top=$topName($topMB MB) | PF/s=$pfDelta" | Out-File $LogFile -Append -Encoding UTF8

        $samples++
    } catch {
        "[$($now.ToString('HH:mm:ss'))] ERR: $_" | Out-File $LogFile -Append -Encoding UTF8
    }
    Start-Sleep -Seconds $IntervalSec
}

$csv = Import-Csv $RawFile
@"
=== RESUMEN MONITOR ACTIVO 1H ===
Periodo  : $($csv[0].Time) -> $($csv[-1].Time)
Muestras : $samples
Freezes  : $freezeCnt

RAM% (lower=mejor):
  Promedio : $([math]::Round(($csv.RAMUsedPct | Measure-Object -Average).Average,1))%
  Maxima   : $(($csv.RAMUsedPct | Measure-Object -Maximum).Maximum)%
  Minima   : $(($csv.RAMUsedPct | Measure-Object -Minimum).Minimum)%

Commit:
  Maximo usado : $(($csv.CommitUsedGB | Measure-Object -Maximum).Maximum) GB
  Limite       : $($csv[0].CommitLimitGB) GB

Chrome:
  Maximo: $(($csv.ChromeGB | Measure-Object -Maximum).Maximum) GB en $(($csv.ChromeP | Measure-Object -Maximum).Maximum) procesos

Claude:
  Maximo: $(($csv.ClaudeGB | Measure-Object -Maximum).Maximum) GB en $(($csv.ClaudeP | Measure-Object -Maximum).Maximum) procesos

Page Faults pico/s: $(($csv.PFs | Measure-Object -Maximum).Maximum)

Procesos que mas aparecieron como TOP RAM:
$(($csv | Group-Object TopMem | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { '  '+$_.Name+': '+$_.Count+' veces' }) -join "`n")
"@ | Out-File $SummaryFile -Encoding UTF8

"=== TERMINADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Append -Encoding UTF8
