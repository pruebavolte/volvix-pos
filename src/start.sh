#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║          VOLVIX SaaS · Auto-arranque           ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Verificar Node
if ! command -v node &> /dev/null; then
    echo "[X] Node.js no está instalado."
    echo ""
    echo "Instálalo con:"
    echo "  macOS:  brew install node"
    echo "  Linux:  sudo apt install nodejs npm"
    echo "  O descarga desde: https://nodejs.org"
    echo ""
    exit 1
fi

echo "[*] Node detectado: $(node --version)"
echo ""

# Crear public/ si no existe
if [ ! -d "public" ]; then
    echo "[*] Creando carpeta public/..."
    mkdir -p public
    # Mover HTMLs a public/
    for f in *.html; do
        [ -f "$f" ] && mv "$f" public/
    done
    for f in *giros_catalog*.js; do
        [ -f "$f" ] && mv "$f" public/
    done
    [ -f "volvix-api.js" ] && mv "volvix-api.js" public/
fi

echo "[*] Arrancando servidor Volvix..."
echo ""
exec node server.js
