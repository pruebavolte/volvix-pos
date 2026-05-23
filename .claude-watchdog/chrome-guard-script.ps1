$Log = 'D:\github\volvix-pos\.claude-watchdog\chrome-guard.log'
$MaxChromGB = 4.0
$MaxCommitPct = 88
$interval = 12
$start = Get-Date

while(((Get-Date)-$start).TotalMinutes -lt 90){
    try{
        $os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
        $ch = Get-Process chrome -EA SilentlyContinue
        $chGB = if($ch){[math]::Round((($ch|Measure-Object WorkingSet -Sum).Sum)/1GB,2)}else{0}
        $cT = [math]::Round(($os.TotalVirtualMemorySize-$os.FreeVirtualMemory)/1MB,2)
        $cL = [math]::Round($os.TotalVirtualMemorySize/1MB,2)
        $cPct = [math]::Round($cT/$cL*100,1)

        if($chGB -gt $MaxChromGB -or $cPct -gt $MaxCommitPct){
            $ts = Get-Date -Format 'HH:mm:ss'
            "[$ts] INTERVENCION Chrome=$chGB GB Commit=$cPct%" | Out-File $Log -Append -Encoding UTF8
            # Matar procs Chrome < 100MB
            $small = Get-Process chrome -EA SilentlyContinue | Sort-Object WorkingSet | Where-Object {$_.WorkingSet -lt 100MB} | Select-Object -First 12
            $freed = 0
            foreach($p in $small){ $freed += $p.WorkingSet; Stop-Process -Id $p.Id -Force -EA SilentlyContinue }
            "[$ts] Liberados $([math]::Round($freed/1MB,0)) MB de $($small.Count) procs Chrome" | Out-File $Log -Append -Encoding UTF8
        }
    }catch{}
    Start-Sleep -Seconds $interval
}
