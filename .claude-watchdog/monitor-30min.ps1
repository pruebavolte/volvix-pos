# Monitoreo continuo durante 30 minutos.
# Cada 60s captura snapshot de CPU, RAM, disco I/O y top procesos.
# Si detecta sintoma de trabamiento (CPU>90% sostenido, disco>95% busy, RAM<5%),
# marca alerta en el log.

$DurationMinutes = 30
$IntervalSec     = 60
$LogFile         = 'D:\github\volvix-pos\.claude-watchdog\monitor-30min.log'
$SummaryFile     = 'D:\github\volvix-pos\.claude-watchdog\monitor-30min.summary.txt'

"=== MONITOREO 30 MIN INICIADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Encoding UTF8
"PID monitor: $PID" | Out-File $LogFile -Append -Encoding UTF8
"" | Out-File $LogFile -Append -Encoding UTF8

$start = Get-Date
$samples = @()
$alerts  = @()

while (((Get-Date) - $start).TotalMinutes -lt $DurationMinutes) {
    $now = Get-Date
    try {
        $cpu = Get-CimInstance Win32_Processor
        $os  = Get-CimInstance Win32_OperatingSystem
        $cDrive = Get-PSDrive C

        $ramUsedPct  = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)
        $ramFreeGB   = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $cpuLoad     = $cpu.LoadPercentage
        $cpuFreqMHz  = $cpu.CurrentClockSpeed
        $cFreeGB     = [math]::Round($cDrive.Free / 1GB, 2)
        $cFreePct    = [math]::Round($cDrive.Free / ($cDrive.Used + $cDrive.Free) * 100, 1)

        # Top 3 procesos por CPU (cumulative since start)
        $topCpu = Get-Process | Sort-Object CPU -Descending | Select-Object -First 3 |
            ForEach-Object { "$($_.ProcessName)($([math]::Round($_.CPU,0))s/$([math]::Round($_.WorkingSet/1MB,0))MB)" }

        $line = "[$($now.ToString('HH:mm:ss'))] CPU=$cpuLoad% @${cpuFreqMHz}MHz | RAM=$ramUsedPct% used ($ramFreeGB GB free) | C=$cFreeGB GB ($cFreePct%) | TopCPU: $($topCpu -join ', ')"
        $line | Out-File $LogFile -Append -Encoding UTF8

        # Detectar sintomas de trabamiento
        $alert = $null
        if ($cpuLoad -ge 90) { $alert = "CPU>=90%" }
        if ($ramUsedPct -ge 95) { $alert = ($alert + " RAM>=95%").Trim() }
        if ($cFreePct -le 2) { $alert = ($alert + " DISCO<=2%").Trim() }
        if ($alert) {
            $alertLine = "[$($now.ToString('HH:mm:ss'))] ALERTA: $alert"
            $alertLine | Out-File $LogFile -Append -Encoding UTF8
            $alerts += $alertLine
        }

        $samples += [PSCustomObject]@{
            Time=$now; CPU=$cpuLoad; FreqMHz=$cpuFreqMHz; RAMUsedPct=$ramUsedPct;
            RAMFreeGB=$ramFreeGB; CFreeGB=$cFreeGB; CFreePct=$cFreePct
        }
    } catch {
        "[$($now.ToString('HH:mm:ss'))] ERROR muestreo: $_" | Out-File $LogFile -Append -Encoding UTF8
    }
    Start-Sleep -Seconds $IntervalSec
}

# Resumen al final
$cpuAvg     = [math]::Round(($samples.CPU       | Measure-Object -Average).Average, 1)
$cpuMax     = ($samples.CPU       | Measure-Object -Maximum).Maximum
$ramAvg     = [math]::Round(($samples.RAMUsedPct | Measure-Object -Average).Average, 1)
$ramMax     = ($samples.RAMUsedPct | Measure-Object -Maximum).Maximum
$cMin       = ($samples.CFreeGB   | Measure-Object -Minimum).Minimum
$freqAvg    = [math]::Round(($samples.FreqMHz   | Measure-Object -Average).Average, 0)

@"
=== RESUMEN MONITOREO 30 MIN ===
Duracion: 30 min ($(($samples).Count) muestras)

CPU:
  Carga promedio  : $cpuAvg%
  Carga maxima    : $cpuMax%
  Frec promedio   : $freqAvg MHz

RAM:
  Uso promedio    : $ramAvg%
  Uso maximo      : $ramMax%

DISCO C:
  Min libre       : $cMin GB

ALERTAS detectadas: $($alerts.Count)
$($alerts -join "`n")
"@ | Out-File $SummaryFile -Encoding UTF8

"" | Out-File $LogFile -Append -Encoding UTF8
"=== MONITOREO TERMINADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Append -Encoding UTF8
Get-Content $SummaryFile | Out-File $LogFile -Append -Encoding UTF8
