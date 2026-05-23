param($LogFile,$CsvFile,$EvtFile)
$DurationMin = 35; $IntervalSec = 20
"=== MONITOR PROFUNDO 35min @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') PID=$PID ===" | Out-File $LogFile -Encoding UTF8
"Time,RAM_Pct,RAM_FreeGB,Commit_Pct,CPU_Pct,CPU_MHz,MaxMHz,Throttle_Pct,DiskQueueC,DiskReadMBs,DiskWriteMBs,ChromeGB,ClaudeGB,FirefoxGB,TopProc,TopMB,Alert" | Out-File $CsvFile -Encoding UTF8
"" | Out-File $EvtFile -Encoding UTF8
$start=Get-Date; $alerts=0; $peakRAM=0; $peakCPU=0; $minMHz=99999; $peakQueue=0
while(((Get-Date)-$start).TotalMinutes -lt $DurationMin){
  $now=Get-Date
  try{
    $os=Get-CimInstance Win32_OperatingSystem -EA Stop
    $cpu=Get-CimInstance Win32_Processor -EA Stop
    $ramT=[math]::Round($os.TotalVisibleMemorySize/1MB,2)
    $ramF=[math]::Round($os.FreePhysicalMemory/1MB,2)
    $ramPct=[math]::Round(($ramT-$ramF)/$ramT*100,1)
    $cT=[math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB,2)
    $cL=[math]::Round($os.TotalVirtualMemorySize/1MB,2)
    $cPct=[math]::Round($cT/$cL*100,1)
    $curMHz=$cpu.CurrentClockSpeed; $maxMHz=$cpu.MaxClockSpeed
    $thrPct=[math]::Round($curMHz/$maxMHz*100,0)
    $diskC=Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk -Filter "Name='C:'" -EA SilentlyContinue
    $dQueue=if($diskC){$diskC.CurrentDiskQueueLength}else{0}
    $dReadMB=if($diskC){[math]::Round($diskC.DiskReadBytesPersec/1MB,1)}else{0}
    $dWriteMB=if($diskC){[math]::Round($diskC.DiskWriteBytesPersec/1MB,1)}else{0}
    $chs=Get-Process chrome -EA SilentlyContinue; $chGB=if($chs){[math]::Round((($chs|Measure-Object WorkingSet -Sum).Sum)/1GB,2)}else{0}
    $cls=Get-Process claude -EA SilentlyContinue; $clGB=if($cls){[math]::Round((($cls|Measure-Object WorkingSet -Sum).Sum)/1GB,2)}else{0}
    $ffx=Get-Process firefox -EA SilentlyContinue; $ffGB=if($ffx){[math]::Round((($ffx|Measure-Object WorkingSet -Sum).Sum)/1GB,2)}else{0}
    $top=Get-Process|Sort-Object WorkingSet -Descending|Select-Object -First 1
    $topName=$top.ProcessName; $topMB=[math]::Round($top.WorkingSet/1MB,0)
    $alert=''
    if($ramPct -ge 85){$alert+='RAM>=85% '}
    if($cPct -ge 90){$alert+='COMMIT>=90% '}
    if($thrPct -le 30){$alert+="THROTTLE!($thrPct%) "}
    if($dQueue -ge 5){$alert+="DISKQ=$dQueue "}
    if($alert){
      $alerts++
      "[$($now.ToString('HH:mm:ss'))] *** ALERTA *** $alert | RAM=$ramPct% CPU=$($cpu.LoadPercentage)%@$curMHz MHz DiskQ=$dQueue R=$dReadMB W=$dWriteMB MB/s" | Out-File $EvtFile -Append -Encoding UTF8
      Get-Process|Sort-Object WorkingSet -Desc|Select-Object -First 5|ForEach-Object{"    $($_.ProcessName) PID=$($_.Id) $([math]::Round($_.WorkingSet/1MB,0))MB"}|Out-File $EvtFile -Append -Encoding UTF8
    }
    if($ramPct -gt $peakRAM){$peakRAM=$ramPct}; if($cpu.LoadPercentage -gt $peakCPU){$peakCPU=$cpu.LoadPercentage}
    if($curMHz -lt $minMHz){$minMHz=$curMHz}; if($dQueue -gt $peakQueue){$peakQueue=$dQueue}
    "$($now.ToString('HH:mm:ss')),$ramPct,$ramF,$cPct,$($cpu.LoadPercentage),$curMHz,$maxMHz,$thrPct,$dQueue,$dReadMB,$dWriteMB,$chGB,$clGB,$ffGB,$topName,$topMB,$alert"|Out-File $CsvFile -Append -Encoding UTF8
    "[$($now.ToString('HH:mm:ss'))] RAM=$ramPct%($ramF GB) Commit=$cPct% CPU=$($cpu.LoadPercentage)%@${curMHz}MHz($thrPct% de max) DiskQ=$dQueue R=$dReadMB W=$dWriteMB MB/s | Chrome=$chGB FF=$ffGB Claude=$clGB | Top=$topName($topMB MB) $alert"|Out-File $LogFile -Append -Encoding UTF8
  }catch{"[$($now.ToString('HH:mm:ss'))] ERR: $_"|Out-File $LogFile -Append -Encoding UTF8}
  Start-Sleep -Seconds $IntervalSec
}
"=== FIN $(Get-Date -Format 'HH:mm:ss') | Alertas=$alerts PeakRAM=$peakRAM% PeakCPU=$peakCPU% MinMHz=$minMHz PeakDiskQ=$peakQueue ==="|Out-File $LogFile -Append -Encoding UTF8
