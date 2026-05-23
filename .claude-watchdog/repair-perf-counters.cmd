@echo off
echo === REPARANDO Performance Counter Database ===
echo.
echo Paso 1: lodctr /R (rebuild counters)...
lodctr /R
echo Resultado: %errorlevel%
echo.
echo Paso 2: winmgmt /resyncperf (resync WMI perf)...
winmgmt /resyncperf
echo Resultado: %errorlevel%
echo.
echo Paso 3: Reiniciando servicio WMI...
net stop winmgmt /y
net start winmgmt
echo.
echo Paso 4: wbemdiag para verificar...
wbemtest /namespace:\\root\cimv2 /query "SELECT * FROM Win32_OperatingSystem" /output:D:\github\volvix-pos\.claude-watchdog\wmi-test.txt 2>nul
echo.
echo === REPARACION COMPLETA ===
echo Si ve "Rebuilding performance counter setting from system backup store"
echo entonces funciono correctamente.
echo.
pause
