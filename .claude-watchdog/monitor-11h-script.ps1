$LogFile = 'D:\github\volvix-pos\.claude-watchdog\monitor-11h-1111.log'
$CsvFile = 'D:\github\volvix-pos\.claude-watchdog\monitor-11h-1111.csv'
$EvtFile = 'D:\github\volvix-pos\.claude-watchdog\monitor-11h-1111-events.log'
$DurationMin = 60
$IntervalSec = 15
"=== MONITOR 60min @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') PID=$PID ===" | Out-File $LogFile -Encoding UTF8
"Time,RAM_Pct,RAM_FreeGB,Commit_Pct,CPU_Pct,CPU_MHz,ChromeGB,ClaudeGB,FFoxGB,Batt_Pct,Alert" | Out-File $CsvFile -Encoding UTF8
"" | Out-File $EvtFile -Encoding UTF8
$start=Get-Date; $alerts=0; $peakRAM=0; $peakCommit=0
while(((Get-Date)-$start).TotalMinutes -lt $DurationMin){
  $now=Get-Date
  try{
    $os=Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
    $cpu=Get-CimInstance Win32_Processor -EA SilentlyContinue
    $batt=Get-CimInstance Win32_Battery -EA SilentlyContinue
    $ramT=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $ramF=[math]::Round($os.FreePhysicalMemory/1MB,2)
    $ramPct=[math]::Round(($ramT-$ramF)/$ramT*100,1)
    $cT=[math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB,2); $cL=[math]::Round($os.TotalVirtualMemorySize/1MB,2)
    $cPct=[math]::Round($cT/$cL*100,1)
    $chGB=[math]::Round(((Get-Process chrome -EA SilentlyContinue|Measure-Object WorkingSet -Sum).Sum)/1GB,2)
    $clGB=[math]::Round(((Get-Process claude -EA SilentlyContinue|Measure-Object WorkingSet -Sum).Sum)/1GB,2)
    $ffGB=[math]::Round(((Get-Process firefox -EA SilentlyContinue|Measure-Object WorkingSet -Sum).Sum)/1GB,2)
    $battPct=if($batt){$batt.EstimatedChargeRemaining}else{0}
    $alert=''
    if($ramPct -ge 82){$alert+='RAM>=82% '}
    if($cPct -ge 90){$alert+='COMMIT>=90% '}
    if($cPct -ge 95){$alert+='COMMIT_CRITICO! '}
    if($alert){
      $alerts++
      "[$($now.ToString('HH:mm:ss'))] ALERTA $alert RAM=$ramPct% Commit=$cPct% Chrome=$chGB FF=$ffGB Claude=$clGB" | Out-File $EvtFile -Append -Encoding UTF8
      Get-Process|Sort-Object WorkingSet -Desc|Select-Object -First 5|ForEach-Object{"  $($_.ProcessName) $([math]::Round($_.WorkingSet/1MB,0))MB"}|Out-File $EvtFile -Append -Encoding UTF8
    }
    if($ramPct -gt $peakRAM){$peakRAM=$ramPct}
    if($cPct -gt $peakCommit){$peakCommit=$cPct}
    "$($now.ToString('HH:mm:ss')),$ramPct,$ramF,$cPct,$($cpu.LoadPercentage),$($cpu.CurrentClockSpeed),$chGB,$clGB,$ffGB,$battPct,$alert" | Out-File $CsvFile -Append -Encoding UTF8
    "[$($now.ToString('HH:mm:ss'))] RAM=$ramPct%($ramF GB) Commit=$cPct% CPU=$($cpu.LoadPercentage)%@$($cpu.CurrentClockSpeed)MHz Batt=$battPct% | Chrome=$chGB Claude=$clGB FF=$ffGB $alert" | Out-File $LogFile -Append -Encoding UTF8
  }catch{
    "[$($now.ToString('HH:mm:ss'))] ERR:$_" | Out-File $LogFile -Append -Encoding UTF8
  }
  Start-Sleep -Seconds $IntervalSec
}
"=== FIN $(Get-Date -Format 'HH:mm:ss') Alertas=$alerts PeakRAM=$peakRAM% PeakCommit=$peakCommit% ===" | Out-File $LogFile -Append -Encoding UTF8
