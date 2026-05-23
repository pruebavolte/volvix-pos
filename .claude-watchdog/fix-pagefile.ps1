# Script elevado: restaura pagefile a tamano correcto.
# Se ejecuta con admin via Start-Process -Verb RunAs.

$LogFile = 'D:\github\volvix-pos\.claude-watchdog\fix-pagefile.log'
"=== FIX PAGEFILE @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Encoding UTF8

try {
    # Estado ANTES
    "ANTES:" | Out-File $LogFile -Append -Encoding UTF8
    Get-CimInstance Win32_PageFileSetting | Format-Table Name, InitialSize, MaximumSize -AutoSize | Out-String | Out-File $LogFile -Append -Encoding UTF8

    $cs = Get-CimInstance Win32_ComputerSystem
    "AutomaticManagedPagefile ANTES: $($cs.AutomaticManagedPagefile)" | Out-File $LogFile -Append -Encoding UTF8

    # OPCION 1: borrar todos los settings manuales y dejar managed by system
    # Esto restaura el default de Windows que es "managed automatically"
    Get-CimInstance Win32_PageFileSetting | ForEach-Object {
        "Eliminando setting manual: $($_.Name)" | Out-File $LogFile -Append -Encoding UTF8
        Remove-CimInstance $_ -ErrorAction Continue
    }

    # Activar managed by system
    Set-CimInstance $cs -Property @{AutomaticManagedPagefile=$true}
    Start-Sleep -Seconds 2

    # Estado DESPUES
    $csAfter = Get-CimInstance Win32_ComputerSystem
    "AutomaticManagedPagefile DESPUES: $($csAfter.AutomaticManagedPagefile)" | Out-File $LogFile -Append -Encoding UTF8
    "DESPUES:" | Out-File $LogFile -Append -Encoding UTF8
    Get-CimInstance Win32_PageFileSetting | Format-Table Name, InitialSize, MaximumSize -AutoSize | Out-String | Out-File $LogFile -Append -Encoding UTF8

    "OK: pagefile configurado como managed by system. Surte efecto tras reboot." | Out-File $LogFile -Append -Encoding UTF8
} catch {
    "ERROR: $_" | Out-File $LogFile -Append -Encoding UTF8
}
