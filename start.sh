#!/bin/bash
set -e

echo ""
echo " ============================================"
echo "  VOLVIX POS - Sistema Multi-Tenant con IA"
echo " ============================================"
echo ""

# Verificar Node.js
if ! command -v node &>/dev/null; then
  echo " [ERROR] Node.js no encontrado. Instálalo desde https://nodejs.org"
  exit 1
fi

# Crear .env si no existe
if [ ! -f .env ]; then
  echo " [AVISO] Creando .env desde .env.example..."
  cp .env.example .env
  echo " [!] Edita .env con tus credenciales de Supabase antes de continuar."
  echo " Presiona Enter cuando termines..."
  read
fi

# Instalar dependencias
if [ ! -d node_modules ]; then
  echo " Instalando dependencias..."
  npm install
fi

echo " Iniciando servidor..."
echo ""
node server.js
