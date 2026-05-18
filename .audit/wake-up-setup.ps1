# Wake-up alarm — SETUP REQUIRED variant
# Notifica al usuario que falta config antes de arrancar la validación real

# Subir volumen del sistema
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
$notif.Icon = [System.Drawing.SystemIcons]::Warning
$notif.Visible = $true

# Loop de alarma
$Host.UI.RawUI.FlushInputBuffer()
Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  SETUP REQUERIDO - ERICK DESPIERTA" -ForegroundColor Red -BackgroundColor Yellow
Write-Host "  Falta ANTHROPIC_API_KEY para validacion REAL" -ForegroundColor Yellow
Write-Host "  Lee: .audit/SETUP-REQUIRED.md" -ForegroundColor Cyan
Write-Host "  Presiona CUALQUIER TECLA para apagar la alarma" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""

$rounds = 0
while (-not $Host.UI.RawUI.KeyAvailable) {
    $rounds++

    # Beep tipo alerta (mas baja que el de exito)
    [console]::Beep(600, 200)
    [console]::Beep(800, 200)
    [console]::Beep(600, 300)

    # TTS cada 3 rounds
    if ($rounds % 3 -eq 0) {
        $speak.SpeakAsync("Erick. Despierta. Falta configuracion. La validacion real necesita una clave de Anthropic. Lee setup required.") | Out-Null
    }

    # Notificación balloon
    $notif.BalloonTipTitle = "SETUP REQUIRED"
    $notif.BalloonTipText = "Falta ANTHROPIC_API_KEY. Lee .audit/SETUP-REQUIRED.md"
    $notif.ShowBalloonTip(5000)

    Start-Sleep -Seconds 2

    if ($rounds -gt 600) { break }
}

$notif.Visible = $false
Write-Host "Alarma apagada. Lee .audit/SETUP-REQUIRED.md" -ForegroundColor Green
