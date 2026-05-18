# Wake-up alarm — Suena hasta que Erick presione una tecla
# Generado por Claude Code session autonomous mode 2026-05-18

# Subir volumen del sistema (50 teclazos de volume up)
$wshShell = New-Object -ComObject WScript.Shell
1..50 | ForEach-Object { $wshShell.SendKeys([char]175) }

# TTS setup
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = 0
$speak.Volume = 100

# Notificación popup
Add-Type -AssemblyName System.Windows.Forms
$notif = New-Object System.Windows.Forms.NotifyIcon
$notif.Icon = [System.Drawing.SystemIcons]::Information
$notif.Visible = $true

# Loop de alarma
$Host.UI.RawUI.FlushInputBuffer()
Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  VOLVIX TERMINO - DESPIERTA ERICK" -ForegroundColor Red -BackgroundColor Yellow
Write-Host "  Presiona CUALQUIER TECLA para apagar la alarma" -ForegroundColor Yellow
Write-Host "  1081/1081 giros PASS - 100% landing premium" -ForegroundColor Green
Write-Host "  Lee: .audit/REPORTE-FINAL-2026-05-18.md" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""

$rounds = 0
while (-not $Host.UI.RawUI.KeyAvailable) {
    $rounds++

    # Beep ascendente
    [console]::Beep(880, 200)
    [console]::Beep(1100, 200)
    [console]::Beep(1320, 300)
    Start-Sleep -Milliseconds 100
    [console]::Beep(880, 200)
    [console]::Beep(1100, 200)
    [console]::Beep(1320, 300)

    # TTS cada 3 rounds
    if ($rounds % 3 -eq 0) {
        $speak.SpeakAsync("Erick. Despierta. La validacion de mil giros termino. Mil ochenta y uno PASS. Cero al template plano.") | Out-Null
    }

    # Notificación balloon
    $notif.BalloonTipTitle = "VOLVIX TERMINO"
    $notif.BalloonTipText = "1081/1081 giros pasaron. Lee REPORTE-FINAL en .audit/"
    $notif.ShowBalloonTip(5000)

    Start-Sleep -Seconds 2

    # Salida de emergencia tras ~30 min
    if ($rounds -gt 600) { break }
}

# Apagar
$notif.Visible = $false
Write-Host "Alarma apagada. Lee .audit/REPORTE-FINAL-2026-05-18.md" -ForegroundColor Green
