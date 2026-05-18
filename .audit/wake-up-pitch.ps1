# Wake-up — Sprint pre-pitch terminado, producción intacta
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = 0
$speak.Volume = 100

Add-Type -AssemblyName System.Windows.Forms
$notif = New-Object System.Windows.Forms.NotifyIcon
$notif.Icon = [System.Drawing.SystemIcons]::Information
$notif.Visible = $true

$wshShell = New-Object -ComObject WScript.Shell
1..50 | ForEach-Object { $wshShell.SendKeys([char]175) }

$Host.UI.RawUI.FlushInputBuffer()
Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  ERICK - DESPIERTA - PITCH HOY" -ForegroundColor Red -BackgroundColor Yellow
Write-Host "  Auditoria completa. CATALOGO + TERMINOLOGIAS + SQLs listos." -ForegroundColor Cyan
Write-Host "  Branch feature/ampliacion-modulos SIN mergear." -ForegroundColor Cyan
Write-Host "  Produccion intacta en main (1.0.360)." -ForegroundColor Green
Write-Host "  Lee: .audit/ROADMAP-DEMO.md ANTES del pitch." -ForegroundColor Cyan
Write-Host "  Presiona CUALQUIER TECLA para apagar la alarma." -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow

$rounds = 0
while (-not $Host.UI.RawUI.KeyAvailable) {
    $rounds++
    [console]::Beep(880, 200); [console]::Beep(1100, 200); [console]::Beep(1320, 300)
    Start-Sleep -Milliseconds 100
    [console]::Beep(880, 200); [console]::Beep(1100, 200); [console]::Beep(1320, 300)
    if ($rounds % 3 -eq 0) {
        $speak.SpeakAsync("Erick. Despierta. Pitch hoy. Catalogo listo. Produccion intacta. Lee Roadmap demo.") | Out-Null
    }
    $notif.BalloonTipTitle = "VOLVIX PRE-PITCH LISTO"
    $notif.BalloonTipText = "Auditoria completa. Produccion intacta. Lee .audit/ROADMAP-DEMO.md"
    $notif.ShowBalloonTip(5000)
    Start-Sleep -Seconds 2
    if ($rounds -gt 600) { break }
}
$notif.Visible = $false
Write-Host "Alarma apagada. Lee ROADMAP-DEMO.md ANTES del pitch." -ForegroundColor Green
