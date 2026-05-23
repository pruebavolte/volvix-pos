$logFile = "D:\github\volvix-pos\.claude-watchdog\chromeguard2.log"
$endTime = (Get-Date).AddMinutes(150)
$interval = 15
$killCount = 0

Add-Content $logFile "=== ChromeGuard2 iniciado $(Get-Date -Format HH:mm:ss) ==="

while ((Get-Date) -lt $endTime) {
    $os = Get-CimInstance Win32_OperatingSystem
    $ramPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100,1)
    $pf = Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue
    $pfUsed = if($pf){$pf.CurrentUsage}else{0}

    $chrome = Get-Process -Name "chrome" -ErrorAction SilentlyContinue
    $chrMB = if($chrome){[math]::Round(($chrome|Measure-Object WorkingSet64 -Sum).Sum/1MB)}else{0}

    $needsAction = ($chrMB -gt 3500) -or ($ramPct -gt 82)

    if ($needsAction -and $chrMB -gt 500) {
        $chrGB = [math]::Round($chrMB/1024,2)
        Add-Content $logFile "[$(Get-Date -Format HH:mm:ss)] INTERVENCION Chrome=$chrGB GB RAM=$ramPct%"
        $small = $chrome | Where-Object { $_.WorkingSet64 -lt 120MB } | Sort-Object WorkingSet64
        $freed = 0
        $killed = 0
        foreach ($p in $small) {
            $mb = [math]::Round($p.WorkingSet64/1MB)
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            $freed += $mb
            $killed++
            if ($killed -ge 6) { break }
        }
        $killCount += $killed
        Add-Content $logFile "[$(Get-Date -Format HH:mm:ss)] Liberados $freed MB de $killed procs Chrome"
    }

    Start-Sleep -Seconds $interval
}
Add-Content $logFile "=== ChromeGuard2 FIN $(Get-Date -Format HH:mm:ss) procs matados: $killCount ==="
