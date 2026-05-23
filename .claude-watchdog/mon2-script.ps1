$LogFile = 'D:\github\volvix-pos\.claude-watchdog\mon2-0645.log'
$CsvFile = 'D:\github\volvix-pos\.claude-watchdog\mon2-0645.csv'
$EvtFile = 'D:\github\volvix-pos\.claude-watchdog\mon2-0645-events.log'
$DurationMin = 35
$IntervalSec = 20
"=== MONITOR 35min @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') PID=$PID ===" | Out-File $LogFile -Encoding UTF8
"Time,RAM_Pct,RAM_FreeGB,Commit_Pct,CPU_Pct,CPU_MHz,Throttle_Pct,DiskQ_C,R_MBs,W_MBs,ChromeGB,ClaudeGB,FirefoxGB,TopProc,TopMB,Alert" | Out-File $CsvFile -Encoding UTF8
"" | Out-File $EvtFile -Encoding UTF8
$start=Get-Date; $alerts=0; $peakRAM=0; $minMHz=99999
while(((Get-Date)-$start).TotalMinutes -lt $DurationMin){
  $now=Get-Date
  try{
    $os=Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
    $cpu=Get-CimInstance Win32_Processor -EA SilentlyContinue
    $ramT=[math]::Round($os.TotalVisibleMemorySize/1MB,2)
    $ramF=[math]::Round($os.FreePhysicalMemory/1MB,2)
    $ramPct=[math]::Round(($ramT-$ramF)/$ramT*100,1)
    $cT=[math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB,2)
    $cL=[math]::Round($os.TotalVirtualMemorySize/1MB,2)
    $cPct=[math]::Round($cT/$cL*100,1)
    $curMHz=$cpu.CurrentClockSpeed; $maxMHz=$cpu.MaxClockSpeed
    $thrPct=if($maxMHz){[math]::Round($curMHz/$maxMHz*100,0)}else{100}
    $dC=Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk -Filter "Name='C:'" -EA SilentlyContinue
    $dQ=if($dC){$dC.CurrentDiskQueueLength}else{0}
    $dR=if($dC){[math]::Round($dC.DiskReadBytesPersec/1MB,1)}else{0}
    $dW=if($dC){[math]::Round($dC.DiskWriteBytesPersec/1MB,1)}else{0}
    $chGB=[math]::Round(((Get-Process chrome -EA SilentlyContinue|Measure-Object WorkingSet -Sum).Sum)/1GB,2)
    $clGB=[math]::Round(((Get-Process claude -EA SilentlyContinue|Measure-Object WorkingSet -Sum).Sum)/1GB,2)
    $ffGB=[math]::Round(((Get-Process firefox -EA SilentlyContinue|Measure-Object WorkingSet -Sum).Sum)/1GB,2)
    $top=Get-Process|Sort-Object WorkingSet -Desc|Select-Object -First 1
    $alert=''
    if($ramPct -ge 83){$alert+='RAM>=83% '}
    if($cPct -ge 88){$alert+='COMMIT>=88% '}
    if($thrPct -le 35 -and $curMHz -gt 0){$alert+="THROTTLE!($thrPct%) "}
    if($dQ -ge 5){$alert+="DISKQ=$dQ "}
    if($alert){
      $alerts++
      "[$($now.ToString('HH:mm:ss'))] ALERTA $alert RAM=$ramPct% CPU=$($cpu.LoadPercentage)%@$curMHz MHz DQ=$dQ R=$dR W=$dW" | Out-File $EvtFile -Append -Encoding UTF8
      Get-Process|Sort-Object WorkingSet -Desc|Select-Object -First 5|ForEach-Object{"    $($_.ProcessName) $([math]::Round($_.WorkingSet/1MB,0))MB"}|Out-File $EvtFile -Append -Encoding UTF8
    }
    if($ramPct -gt $peakRAM){$peakRAM=$ramPct}
    if($curMHz -lt $minMHz -and $curMHz -gt 100){$minMHz=$curMHz}
    "$($now.ToString('HH:mm:ss')),$ramPct,$ramF,$cPct,$($cpu.LoadPercentage),$curMHz,$thrPct,$dQ,$dR,$dW,$chGB,$clGB,$ffGB,$($top.ProcessName),$([math]::Round($top.WorkingSet/1MB,0)),$alert" | Out-File $CsvFile -Append -Encoding UTF8
    "[$($now.ToString('HH:mm:ss'))] RAM=$ramPct%($ramF GB) Commit=$cPct% CPU=$($cpu.LoadPercentage)%@${curMHz}MHz($thrPct%) DiskQ=$dQ R=$dR W=$dW MB/s Chrome=$chGB FF=$ffGB Claude=$clGB Top=$($top.ProcessName)($([math]::Round($top.WorkingSet/1MB,0))MB) $alert" | Out-File $LogFile -Append -Encoding UTF8
  }catch{
    "[$($now.ToString('HH:mm:ss'))] ERR: $_" | Out-File $LogFile -Append -Encoding UTF8
  }
  Start-Sleep -Seconds $IntervalSec
}
"=== FIN $(Get-Date -Format 'HH:mm:ss') Alertas=$alerts PeakRAM=$peakRAM% MinMHz=$minMHz ===" | Out-File $LogFile -Append -Encoding UTF8
