@echo off
echo === Configurando pagefile en D: (system-managed) ===
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v PagingFiles /t REG_MULTI_SZ /d "D:\pagefile.sys 0 0" /f
echo Resultado: %errorlevel%
echo.
echo === Verificacion ===
reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v PagingFiles
echo.
echo === Hecho ===
echo Reinicia para que tome efecto.
echo Al reiniciar: Windows BORRA C:\pagefile.sys (libera 6.58 GB en C:) y crea D:\pagefile.sys segun necesidad.
pause > "D:\github\volvix-pos\.claude-watchdog\fix-pagefile-D.done"
