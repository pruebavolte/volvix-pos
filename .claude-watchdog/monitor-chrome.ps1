# Monitor especifico de Chrome
# Captura cada 10 segundos durante 20 minutos.
# Registra: cantidad de procesos Chrome, RAM total Chrome, RAM libre,
# y top 5 pestanas/procesos Chrome por memoria.

$DurationMin = 20
$IntervalSec = 10
$LogFile = 'D:\github\volvix-pos\.claude-watchdog\monitor-chrome.log'

"=== MONITOR CHROME INICIADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (PID $PID) ===" | Out-File $LogFile -Encoding UTF8
"Duracion: $DurationMin min, intervalo: ${IntervalSec}s" | Out-File $LogFile -Append -Encoding UTF8
"" | Out-File $LogFile -Append -Encoding UTF8

$start = Get-Date
$samples = @()
$peakRamPct = 0
$peakChromeGB = 0
$chromeOpenedAt = $null
$chromeClosedAt = $null
$wasChromeRunning = $false

while (((Get-Date) - $start).TotalMinutes -lt $DurationMin) {
    $now = Get-Date
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
        $ramFreeGB  = [math]::Round($os.FreePhysicalMemory/1MB, 2)
        $ramUsedPct = [math]::Round(($ramTotalGB - $ramFreeGB) / $ramTotalGB * 100, 1)

        $chromes = Get-Process chrome -EA SilentlyContinue
        $chromeCount = if ($chromes) { @($chromes).Count } else { 0 }
        $chromeGB = if ($chromes) { [math]::Round((($chromes | Measure-Object WorkingSet -Sum).Sum)/1GB, 2) } else { 0 }
        $chromeRunning = $chromeCount -gt 0

        # Detectar transiciones
        if ($chromeRunning -and -not $wasChromeRunning) {
            "[$($now.ToString('HH:mm:ss'))] *** CHROME ABIERTO ***" | Out-File $LogFile -Append -Encoding UTF8
            $chromeOpenedAt = $now
        }
        if (-not $chromeRunning -and $wasChromeRunning) {
            "[$($now.ToString('HH:mm:ss'))] *** CHROME CERRADO ***" | Out-File $LogFile -Append -Encoding UTF8
            $chromeClosedAt = $now
        }
        $wasChromeRunning = $chromeRunning

        # Top 5 chromes por RAM (si hay)
        $topChromeStr = ''
        if ($chromes) {
            $top = $chromes | Sort-Object WorkingSet -Descending | Select-Object -First 5
            $topChromeStr = ($top | ForEach-Object { "$($_.Id):$([math]::Round($_.WorkingSet/1MB,0))MB" }) -join ', '
        }

        $line = "[$($now.ToString('HH:mm:ss'))] RAM=$ramUsedPct% (libre $ramFreeGB GB) | Chrome=$chromeCount procs / $chromeGB GB | Top: $topChromeStr"
        $line | Out-File $LogFile -Append -Encoding UTF8

        if ($ramUsedPct -gt $peakRamPct) { $peakRamPct = $ramUsedPct }
        if ($chromeGB -gt $peakChromeGB) { $peakChromeGB = $chromeGB }

        $samples += [PSCustomObject]@{
            T=$now; RAMPct=$ramUsedPct; ChromeCount=$chromeCount; ChromeGB=$chromeGB; FreeGB=$ramFreeGB
        }
    } catch {
        "[$($now.ToString('HH:mm:ss'))] ERROR: $_" | Out-File $LogFile -Append -Encoding UTF8
    }
    Start-Sleep -Seconds $IntervalSec
}

"" | Out-File $LogFile -Append -Encoding UTF8
"=== RESUMEN ===" | Out-File $LogFile -Append -Encoding UTF8
"Total muestras       : $($samples.Count)" | Out-File $LogFile -Append -Encoding UTF8
"Pico RAM             : $peakRamPct%" | Out-File $LogFile -Append -Encoding UTF8
"Pico Chrome RAM      : $peakChromeGB GB" | Out-File $LogFile -Append -Encoding UTF8
"Pico Chrome procesos : $((($samples).ChromeCount | Measure-Object -Maximum).Maximum)" | Out-File $LogFile -Append -Encoding UTF8
if ($chromeOpenedAt) { "Chrome abierto       : $($chromeOpenedAt.ToString('HH:mm:ss'))" | Out-File $LogFile -Append -Encoding UTF8 }
if ($chromeClosedAt) { "Chrome cerrado       : $($chromeClosedAt.ToString('HH:mm:ss'))" | Out-File $LogFile -Append -Encoding UTF8 }
"=== MONITOR CHROME TERMINADO @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Append -Encoding UTF8
