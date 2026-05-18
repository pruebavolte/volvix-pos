# Volvix POS · Build .exe installer para Windows
# ------------------------------------------------
# Uso:
#   pwsh scripts/build-electron-win.ps1
#
# Que hace:
#   1. Instala electron + electron-builder de forma efimera (no toca package.json).
#   2. Empaqueta la app con la config de electron-builder.yml.
#   3. Deja el .exe en dist-electron/.
#
# Pre-requisitos:
#   - Node 18+
#   - electron/icons/icon.ico existente (si no, se usa default y warning).

$ErrorActionPreference = 'Stop'

Write-Host '== Volvix POS · Electron Windows build ==' -ForegroundColor Cyan
Write-Host ''

# 1. Verificar Node
$nodeVersion = node -v 2>$null
if (-not $nodeVersion) {
    Write-Host 'ERROR: Node.js no encontrado en PATH. Instala Node 18+ primero.' -ForegroundColor Red
    exit 1
}
Write-Host "Node detectado: $nodeVersion"

# 2. Verificar electron/main.js
if (-not (Test-Path 'electron/main.js')) {
    Write-Host 'ERROR: falta electron/main.js. Corre el scaffold primero.' -ForegroundColor Red
    exit 1
}

# 3. Verificar electron-builder.yml
if (-not (Test-Path 'electron-builder.yml')) {
    Write-Host 'ERROR: falta electron-builder.yml en la raiz.' -ForegroundColor Red
    exit 1
}

# 4. Instalar electron + electron-builder (--no-save = no modifica package.json)
Write-Host ''
Write-Host '[1/3] Instalando electron + electron-builder (efimero)...' -ForegroundColor Yellow
npm install --no-save electron electron-builder
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: npm install fallo.' -ForegroundColor Red
    exit 1
}

# 5. Build via npm script
Write-Host ''
Write-Host '[2/3] Empaquetando .exe con electron-builder...' -ForegroundColor Yellow
npm run electron:build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: electron-builder fallo.' -ForegroundColor Red
    exit 1
}

# 6. Mostrar resultado
Write-Host ''
Write-Host '[3/3] Build completado.' -ForegroundColor Green
$exe = Get-ChildItem -Path 'dist-electron' -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exe) {
    Write-Host ('OK Build completado: ' + $exe.FullName) -ForegroundColor Green
    Write-Host ('  Tamano: {0:N1} MB' -f ($exe.Length / 1MB))
} else {
    Write-Host 'WARN .exe no encontrado en dist-electron/. Revisa logs.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Siguientes pasos:'
Write-Host '  1. Probar el .exe localmente.'
Write-Host '  2. Subir a /downloads/ en Vercel.'
Write-Host '  3. Linkear desde /descargas.html.'
