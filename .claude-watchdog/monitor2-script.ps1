$logFile = "D:\github\volvix-pos\.claude-watchdog\monitor2-1208.log"
$evtFile = "D:\github\volvix-pos\.claude-watchdog\monitor2-1208-events.log"
$endTime = (Get-Date).AddMinutes(120)
$interval = 20

function GetMB([string]$name) {
    $p = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($p) { return [math]::Round(($p | Measure-Object WorkingSet64 -Sum).Sum/1MB) }
    return 0
}

Add-Content $logFile "=== Monitor2 iniciado $(Get-Date -Format HH:mm:ss) ==="

while ((Get-Date) -lt $endTime) {
    $os = Get-CimInstance Win32_OperatingSystem
    $ramPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100,1)
    $freeGB = [math]::Round($os.FreePhysicalMemory/1MB,2)
    $pf = Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue
    $pfUsed = if($pf){$pf.CurrentUsage}else{0}
    $mhz = (Get-CimInstance Win32_Processor).CurrentClockSpeed
    $cpu = (Get-CimInstance Win32_Processor).LoadPercentage
    $bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    $batPct = if($bat){$bat.EstimatedChargeRemaining}else{"?"}
    $batSt = if($bat){if($bat.BatteryStatus -eq 2){"CHG"}else{"DIS"}}else{"?"}
    $chrMB = GetMB "chrome"
    $ffMB  = GetMB "firefox"
    $clMB  = GetMB "claude"
    $prMB  = GetMB "Perplexity"
    $chrGB = [math]::Round($chrMB/1024,2)
    $ffGB  = [math]::Round($ffMB/1024,2)
    $clGB  = [math]::Round($clMB/1024,2)
    $prGB  = [math]::Round($prMB/1024,2)
    $ts = Get-Date -Format "HH:mm:ss"

    $line = "[$ts] RAM=$ramPct% free=$freeGB GB PF=$pfUsed MB CPU=$cpu%@$mhz MHz Bat=$batPct%$batSt | Chr=$chrGB FF=$ffGB Cl=$clGB Perp=$prGB"
    Add-Content $logFile $line

    if ($ramPct -ge 80) {
        Add-Content $evtFile "ALERTA RAM $ramPct% @ $ts"
    }
    if ($mhz -gt 2000) {
        Add-Content $evtFile "INFO CPU=$mhz MHz (desbloqueado!) @ $ts"
    }
    if ($chrMB -gt 3500) {
        Add-Content $evtFile "ALERTA Chrome=$chrGB GB @ $ts"
    }

    Start-Sleep -Seconds $interval
}
Add-Content $logFile "=== Monitor2 COMPLETADO $(Get-Date -Format HH:mm:ss) ==="
