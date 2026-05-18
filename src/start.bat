@echo off
chcp 65001 >nul
title Volvix SaaS · Arrancando...
cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════╗
echo ║          VOLVIX SaaS · Auto-arranque           ║
echo ╚════════════════════════════════════════════════╝
echo.

REM Verificar si Node está instalado
where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js no está instalado.
    echo.
    echo Por favor instala Node.js 18+ desde: https://nodejs.org
    echo Descarga la versión LTS, instala, y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

REM Mostrar versión de Node
echo [*] Node detectado:
node --version
echo.

REM Asegurar que existe la carpeta public
if not exist "public" (
    echo [*] Creando carpeta public/...
    mkdir public
    REM Mover HTMLs a public/ si están en la raíz
    for %%f in (*.html) do (
        if exist "%%f" move "%%f" "public\" >nul
    )
    for %%f in (*giros_catalog*.js) do (
        if exist "%%f" move "%%f" "public\" >nul
    )
    if exist "volvix-api.js" move "volvix-api.js" "public\" >nul
)

echo [*] Arrancando servidor Volvix...
echo.
node server.js

pause
