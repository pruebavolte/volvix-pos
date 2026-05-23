# ============================================================
# Monitor PROFUNDO 1 hora - cada 30s captura todo lo posible
# para identificar la causa real del trabamiento
# ============================================================

$DurationMin = 60
$IntervalSec = 30
$WatchdogDir = 'D:\github\volvix-pos\.claude-watchdog'
$LogFile     = Join-Path $WatchdogDir 'monitor-deep.log'
$EventsLog   = Join-Path $WatchdogDir 'monitor-events.log'
$SummaryFile = Join-Path $WatchdogDir 'monitor-deep-summary.txt'
$RawFile     = Join-Path $WatchdogDir 'monitor-deep-raw.csv'

"=== MONITOR PROFUNDO 1 HORA INICIADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (PID $PID) ===" | Out-File $LogFile -Encoding UTF8
"Duracion: $DurationMin min, intervalo: ${IntervalSec}s" | Out-File $LogFile -Append -Encoding UTF8
"" | Out-File $LogFile -Append -Encoding UTF8

# CSV header
"Time,RAMUsedPct,RAMFreeGB,RAMCommitGB,PageFaultsDelta,CPUFreqMHz,CPULoadPct,ChromeProcs,ChromeGB,ClaudeProcs,ClaudeGB,TopMemProc,TopMemMB,TopCpuProc,TopCpuPct,CFreeGB,SSDTempC" | Out-File $RawFile -Encoding UTF8

$start = Get-Date
$prevPageFaults = 0
$prevSnapshot = @{}
$peakRamPct = 0
$peakChromeGB = 0
$peakClaudeGB = 0
$freezeMoments = @()

# Para CPU% por proceso necesitamos diferencias
function Get-ProcessSnapshot {
    $now = Get-Date
    $snap = @{}
    Get-Process | ForEach-Object {
        $snap[$_.Id] = @{ Name=$_.ProcessName; CPU=$_.CPU; Mem=$_.WorkingSet; T=$now }
    }
    return @{ Time=$now; Procs=$snap }
}

$prevSnap = Get-ProcessSnapshot
Start-Sleep -Seconds 2

while (((Get-Date) - $start).TotalMinutes -lt $DurationMin) {
    $now = Get-Date
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    try {
        # ===== RAM =====
        $os = Get-CimInstance Win32_OperatingSystem
        $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
        $ramFreeGB  = [math]::Round($os.FreePhysicalMemory/1MB, 2)
        $ramUsedPct = [math]::Round(($ramTotalGB - $ramFreeGB) / $ramTotalGB * 100, 1)
        $ramCommitGB = [math]::Round(($os.TotalVirtualMemorySize - $os.FreeVirtualMemory)/1MB, 2)

        # ===== CPU =====
        $cpu = Get-CimInstance Win32_Processor
        $cpuFreq = $cpu.CurrentClockSpeed
        $cpuLoad = $cpu.LoadPercentage

        # ===== Page faults (indicador clave de swap) =====
        $memPerf = Get-CimInstance Win32_PerfRawData_PerfOS_Memory -EA SilentlyContinue
        $pageFaults = if ($memPerf) { $memPerf.PageFaultsPersec } else { 0 }
        $pfDelta = if ($prevPageFaults -gt 0) { $pageFaults - $prevPageFaults } else { 0 }
        $prevPageFaults = $pageFaults

        # ===== Disco =====
        $cDrive = Get-PSDrive C
        $cFreeGB = [math]::Round($cDrive.Free/1GB, 2)

        # ===== Procesos Chrome y Claude =====
        $chromes = Get-Process chrome -EA SilentlyContinue
        $chromeProcs = if ($chromes) { @($chromes).Count } else { 0 }
        $chromeGB = if ($chromes) { [math]::Round((($chromes | Measure-Object WorkingSet -Sum).Sum)/1GB, 2) } else { 0 }

        $claudes = Get-Process claude -EA SilentlyContinue
        $claudeProcs = if ($claudes) { @($claudes).Count } else { 0 }
        $claudeGB = if ($claudes) { [math]::Round((($claudes | Measure-Object WorkingSet -Sum).Sum)/1GB, 2) } else { 0 }

        # ===== Top procesos AHORA =====
        $allProcs = Get-Process
        $topMem = $allProcs | Sort-Object WorkingSet -Descending | Select-Object -First 1
        $topMemName = $topMem.ProcessName
        $topMemMB = [math]::Round($topMem.WorkingSet/1MB, 0)

        # ===== CPU% por proceso (diferencia con snap anterior) =====
        $curSnap = Get-ProcessSnapshot
        $dT = ($curSnap.Time - $prevSnap.Time).TotalSeconds
        $topCpuProc = 'N/A'
        $topCpuPct = 0
        if ($dT -gt 0) {
            $cpuDeltas = @()
            foreach ($pid in $curSnap.Procs.Keys) {
                if ($prevSnap.Procs.ContainsKey($pid)) {
                    $deltaCPU = $curSnap.Procs[$pid].CPU - $prevSnap.Procs[$pid].CPU
                    if ($deltaCPU -gt 0) {
                        # PercentProcessorTime aproximado: (deltaCPU seg / dT seg) * 100 / num_cores
                        $pct = [math]::Round($deltaCPU / $dT * 100 / 8, 1)
                        $cpuDeltas += [PSCustomObject]@{
                            Name=$curSnap.Procs[$pid].Name; Id=$pid; Pct=$pct; DeltaMB=[math]::Round(($curSnap.Procs[$pid].Mem - $prevSnap.Procs[$pid].Mem)/1MB,1)
                        }
                    }
                }
            }
            $topCpu = $cpuDeltas | Sort-Object Pct -Descending | Select-Object -First 1
            if ($topCpu) { $topCpuProc = "$($topCpu.Name)($($topCpu.Id))"; $topCpuPct = $topCpu.Pct }

            # Detectar procesos que CRECIERON mucho en este intervalo
            $growers = $cpuDeltas | Where-Object {$_.DeltaMB -gt 100} | Sort-Object DeltaMB -Descending | Select-Object -First 3
            if ($growers) {
                $growStr = ($growers | ForEach-Object { "$($_.Name)+$($_.DeltaMB)MB" }) -join ', '
                "[$($now.ToString('HH:mm:ss'))] GROWERS: $growStr" | Out-File $EventsLog -Append -Encoding UTF8
            }
        }
        $prevSnap = $curSnap

        # ===== SSD temp =====
        $ssdTemp = 0
        try {
            $ssd = Get-PhysicalDisk | Where-Object {$_.MediaType -eq 'SSD'} | Select-Object -First 1
            if ($ssd) {
                $rel = $ssd | Get-StorageReliabilityCounter -EA SilentlyContinue
                if ($rel) { $ssdTemp = $rel.Temperature }
            }
        } catch {}

        # ===== Detectar FREEZE: RAM>92% O page faults extremos =====
        $isFreeze = ($ramUsedPct -ge 92) -or ($pfDelta -gt 50000)
        if ($isFreeze) {
            $freezeMoments += $now
            # En freeze, capturar TOP 10 de RAM + procesos chrome/claude detallados
            "[$($now.ToString('HH:mm:ss'))] *** FREEZE DETECTADO *** RAM=$ramUsedPct% PageFaults/s=$pfDelta" | Out-File $EventsLog -Append -Encoding UTF8
            $top10 = $allProcs | Sort-Object WorkingSet -Descending | Select-Object -First 10
            foreach ($p in $top10) {
                "    $($p.ProcessName) PID=$($p.Id) Mem=$([math]::Round($p.WorkingSet/1MB,0))MB CPU=$([math]::Round($p.CPU,1))s" | Out-File $EventsLog -Append -Encoding UTF8
            }
            # Chromes detallados
            if ($chromes) {
                "    Chromes top 5:" | Out-File $EventsLog -Append -Encoding UTF8
                $chromes | Sort-Object WorkingSet -Descending | Select-Object -First 5 | ForEach-Object {
                    $title = if ($_.MainWindowTitle) { $_.MainWindowTitle.Substring(0,[Math]::Min(60,$_.MainWindowTitle.Length)) } else { '' }
                    "      Chrome PID=$($_.Id) Mem=$([math]::Round($_.WorkingSet/1MB,0))MB Title='$title'" | Out-File $EventsLog -Append -Encoding UTF8
                }
            }
        }

        # Picos
        if ($ramUsedPct -gt $peakRamPct) { $peakRamPct = $ramUsedPct }
        if ($chromeGB -gt $peakChromeGB) { $peakChromeGB = $chromeGB }
        if ($claudeGB -gt $peakClaudeGB) { $peakClaudeGB = $claudeGB }

        # CSV
        "$($now.ToString('HH:mm:ss')),$ramUsedPct,$ramFreeGB,$ramCommitGB,$pfDelta,$cpuFreq,$cpuLoad,$chromeProcs,$chromeGB,$claudeProcs,$claudeGB,$topMemName,$topMemMB,$topCpuProc,$topCpuPct,$cFreeGB,$ssdTemp" | Out-File $RawFile -Append -Encoding UTF8

        # Log legible
        $line = "[$($now.ToString('HH:mm:ss'))] RAM=$ramUsedPct%(free $ramFreeGB GB) commit=$ramCommitGB GB | CPU=$cpuLoad% @$($cpuFreq)MHz | Chrome=$chromeProcs($chromeGB GB) Claude=$claudeProcs($claudeGB GB) | TopMem=$topMemName($topMemMB MB) TopCPU=$topCpuProc($topCpuPct%) | PF/s=$pfDelta | SSD=$($ssdTemp)C"
        $line | Out-File $LogFile -Append -Encoding UTF8

    } catch {
        "[$($now.ToString('HH:mm:ss'))] ERROR muestreo: $_" | Out-File $LogFile -Append -Encoding UTF8
    }

    Start-Sleep -Seconds $IntervalSec
}

# ===== SUMMARY =====
$samples = Import-Csv $RawFile
@"
=== RESUMEN MONITOR PROFUNDO 1 HORA ===
Periodo: $($samples[0].Time) -> $($samples[-1].Time)
Muestras: $($samples.Count)

PICOS:
  RAM maxima      : $peakRamPct%
  Chrome maximo   : $peakChromeGB GB
  Claude maximo   : $peakClaudeGB GB

FREEZES detectados (RAM>=92% o PageFaults>50k/s): $($freezeMoments.Count)
$(if ($freezeMoments) { ($freezeMoments | ForEach-Object { '  - '+$_.ToString('HH:mm:ss') }) -join "`n" } else { '  (ninguno)' })

ESTADISTICAS RAM%:
  Promedio        : $([math]::Round(($samples.RAMUsedPct | Measure-Object -Average).Average, 1))%
  Maximo          : $(($samples.RAMUsedPct | Measure-Object -Maximum).Maximum)%
  Minimo          : $(($samples.RAMUsedPct | Measure-Object -Minimum).Minimum)%

PROCESO QUE MAS APARECIO COMO TOP RAM:
$(($samples | Group-Object TopMemProc | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { "  $($_.Name): $($_.Count) veces" }) -join "`n")

PROCESO QUE MAS APARECIO COMO TOP CPU:
$(($samples | Group-Object TopCpuProc | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { "  $($_.Name): $($_.Count) veces" }) -join "`n")

VER monitor-events.log para detalles de cada FREEZE (top 10 procesos en cada freeze, pestañas Chrome con titulo, procesos que crecieron mucho).
"@ | Out-File $SummaryFile -Encoding UTF8

"=== MONITOR TERMINADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Append -Encoding UTF8
Get-Content $SummaryFile | Out-File $LogFile -Append -Encoding UTF8
