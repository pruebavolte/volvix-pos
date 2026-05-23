# Mueve pagefile.sys de C: a D: (donde hay 35 GB libres).
# Esto libera 6.58 GB en C: que esta saturado.
# Surte efecto tras reboot.

$LogFile = 'D:\github\volvix-pos\.claude-watchdog\move-pagefile.log'
"=== MOVE PAGEFILE C: -> D: @ $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File $LogFile -Encoding UTF8

try {
    # 1) ANTES
    "ANTES:" | Out-File $LogFile -Append -Encoding UTF8
    Get-CimInstance Win32_PageFileSetting | Format-Table Name, InitialSize, MaximumSize -AutoSize | Out-String | Out-File $LogFile -Append -Encoding UTF8

    # 2) Desactivar AutomaticManagedPagefile para poder cambiar manualmente
    $cs = Get-CimInstance Win32_ComputerSystem
    if ($cs.AutomaticManagedPagefile) {
        Set-CimInstance $cs -Property @{AutomaticManagedPagefile=$false}
        "AutomaticManagedPagefile desactivado (necesario para personalizar)" | Out-File $LogFile -Append -Encoding UTF8
    }

    # 3) Eliminar pagefile de C: (queda en 0)
    Get-CimInstance Win32_PageFileSetting | Where-Object {$_.Name -like 'C:*'} | ForEach-Object {
        "Eliminando pagefile de: $($_.Name)" | Out-File $LogFile -Append -Encoding UTF8
        Remove-CimInstance $_ -ErrorAction Continue
    }

    # 4) Crear/asegurar pagefile en D: con system-managed (initial=0, max=0 = managed)
    $dExisting = Get-CimInstance Win32_PageFileSetting | Where-Object {$_.Name -like 'D:*'}
    if ($dExisting) {
        "Pagefile D: ya existe, ajustando a system-managed" | Out-File $LogFile -Append -Encoding UTF8
        Set-CimInstance $dExisting -Property @{InitialSize=0; MaximumSize=0}
    } else {
        "Creando pagefile en D:" | Out-File $LogFile -Append -Encoding UTF8
        try {
            $newPf = New-CimInstance -ClassName Win32_PageFileSetting -Property @{
                Name = 'D:\pagefile.sys'
                InitialSize = 0
                MaximumSize = 0
            }
            "Creado: $($newPf.Name)" | Out-File $LogFile -Append -Encoding UTF8
        } catch {
            # Si New-CimInstance falla, usar wmic
            "Usando wmic como fallback" | Out-File $LogFile -Append -Encoding UTF8
            wmic pagefileset create name="D:\\pagefile.sys" 2>&1 | Out-File $LogFile -Append -Encoding UTF8
        }
    }

    Start-Sleep -Seconds 2

    # 5) DESPUES
    "DESPUES:" | Out-File $LogFile -Append -Encoding UTF8
    Get-CimInstance Win32_PageFileSetting | Format-Table Name, InitialSize, MaximumSize -AutoSize | Out-String | Out-File $LogFile -Append -Encoding UTF8

    $csAfter = Get-CimInstance Win32_ComputerSystem
    "AutomaticManagedPagefile final: $($csAfter.AutomaticManagedPagefile)" | Out-File $LogFile -Append -Encoding UTF8

    "OK - aplicar requiere reinicio. Al reiniciar Windows borrara C:\pagefile.sys (libera 6.58 GB) y creara D:\pagefile.sys segun necesidad." | Out-File $LogFile -Append -Encoding UTF8
} catch {
    "ERROR: $_" | Out-File $LogFile -Append -Encoding UTF8
    "Stack: $($_.ScriptStackTrace)" | Out-File $LogFile -Append -Encoding UTF8
}
