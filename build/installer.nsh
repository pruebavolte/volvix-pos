; build/installer.nsh — NSIS hooks para Volvix POS
;
; Se incluye durante la generación del instalador electron-builder.
; Define macros customInstall y customUnInstall que se ejecutan SIEMPRE
; al instalar/desinstalar (oneClick=true silencioso).
;
; PROPÓSITO: forzar que Volvix POS SIEMPRE arranque como administrador
; sin que el usuario configure nada. Esto es crítico para que el módulo
; printer-auto-setup pueda:
;   - Habilitar el Print Spooler si está Disabled
;   - Eliminar impresoras fantasmas
;   - Crear puertos USB nuevos
;   - Add-PrinterDriver / Remove-PrinterDriver
;   - Disable/Enable-PnpDevice
;
; Mecanismo: AppCompatFlags Layers registry key con "RUNASADMIN".
; Windows respeta este flag y SIEMPRE eleva al .exe (con UAC inicial automático).
; perMachine=true en electron-builder.yml hace que la registry se escriba
; en HKLM (afecta a todos los usuarios de la máquina).

!macro customInstall
  ; Forzar "Ejecutar como administrador" para todos los usuarios
  WriteRegStr HKLM "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Volvix POS.exe" "~ RUNASADMIN"

  ; Adicional: si por alguna razón HKLM falla, también HKCU como fallback
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Volvix POS.exe" "~ RUNASADMIN"

  ; Habilitar Print Spooler durante el install (algunos sistemas lo tienen disabled)
  nsExec::Exec 'sc config Spooler start= auto'
  nsExec::Exec 'sc start Spooler'

  DetailPrint "Volvix POS configurado para arrancar como administrador automáticamente"
!macroend

!macro customUnInstall
  ; Limpiar los flags de elevación al desinstalar
  DeleteRegValue HKLM "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Volvix POS.exe"
  DeleteRegValue HKCU "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers" "$INSTDIR\Volvix POS.exe"
!macroend
