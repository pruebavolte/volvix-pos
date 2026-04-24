@echo off
title Volvix POS
color 0A

echo.
echo  ============================================
echo   VOLVIX POS - Sistema Multi-Tenant con IA
echo  ============================================
echo.

:: Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js no encontrado.
    echo  Descargalo en: https://nodejs.org
    pause
    exit /b 1
)

:: Verificar .env
if not exist .env (
    echo  [AVISO] No se encontro .env, copiando .env.example...
    copy .env.example .env >nul
    echo  [!] Edita .env con tus credenciales de Supabase antes de continuar.
    notepad .env
    pause
)

:: Instalar dependencias si hace falta
if not exist node_modules (
    echo  Instalando dependencias...
    npm install
    if errorlevel 1 (
        echo  [ERROR] Fallo npm install
        pause
        exit /b 1
    )
)

echo  Iniciando servidor...
echo.
node server.js

pause
