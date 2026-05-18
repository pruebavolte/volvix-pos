#!/bin/bash
# final-validation.sh
# ───────────────────────────────────────────────────────────────────
# Verificación final del blitz. Cuenta cuánto se completó realmente.
# Se corre al final como parte de Wave 4.
#
# Uso: bash scripts/final-validation.sh

set -e

REPO_ROOT="${1:-$(pwd)}"
cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Validación final del Blitz SalvadoreX SDD"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Repo: $REPO_ROOT"
echo ""

# ─── Setup ───
echo "▸ Setup"

CHECK() {
  if [ -e "$1" ]; then
    echo "  ✓ $1"
    return 0
  else
    echo "  ✗ $1 (falta)"
    return 1
  fi
}

CHECK "CLAUDE.md"
CHECK ".specify/architecture.md"
CHECK ".specify/constitution.md"
CHECK ".specify/domain.md"
CHECK ".specify/schema-truth.md"
CHECK ".specify/contracts/screens/SCREEN_TEMPLATE.md"
CHECK ".specify/contracts/endpoints/ENDPOINT_TEMPLATE.md"
CHECK ".specify/decisions/ADR-001-spin-off-pdc.md"
CHECK "public/system-map.json"
CHECK "public/volvix-system-map-v2.html"
CHECK "scripts/generate-system-map.js"

echo ""
echo "▸ Patches del scanner"
PATCHES=$(ls scripts/_patches/patch-*.diff.js 2>/dev/null | wc -l)
echo "  $PATCHES / 5 patches generados"
if [ -f "scripts/generate-system-map.v2.js" ]; then
  echo "  ✓ scripts/generate-system-map.v2.js merged"
else
  echo "  ⚠️ generate-system-map.v2.js no se mergeo"
fi

echo ""
echo "▸ Screen contracts"
SCREENS_TOTAL=$(ls .specify/contracts/screens/*.spec.md 2>/dev/null | wc -l)
SCREENS_TIER1=$(grep -l "Confianza.*⭐⭐⭐" .specify/contracts/screens/*.spec.md 2>/dev/null | wc -l)
SCREENS_TIER2=$(grep -l "STUB Tier 2" .specify/contracts/screens/*.spec.md 2>/dev/null | wc -l)
echo "  Total screen contracts: $SCREENS_TOTAL"
echo "    - Tier 1 (detallados): $SCREENS_TIER1"
echo "    - Tier 2 (stubs): $SCREENS_TIER2"

echo ""
echo "▸ Endpoint contracts"
ENDPOINTS_TOTAL=$(ls .specify/contracts/endpoints/*.spec.md 2>/dev/null | wc -l)
ENDPOINTS_TIER1=$(grep -l "STUB Tier 2" .specify/contracts/endpoints/*.spec.md 2>/dev/null | wc -l)
ENDPOINTS_DETAILED=$((ENDPOINTS_TOTAL - ENDPOINTS_TIER1))
INDEX_EXISTS="no"
if [ -f ".specify/contracts/endpoints/_INDEX.md" ]; then
  INDEX_EXISTS="sí"
fi
echo "  Total endpoint contracts: $ENDPOINTS_TOTAL"
echo "    - Detallados: $ENDPOINTS_DETAILED"
echo "    - Stubs Tier 2: $ENDPOINTS_TIER1"
echo "  Endpoints _INDEX.md: $INDEX_EXISTS"

echo ""
echo "▸ Validation reports (Wave 3)"
for f in validation-schema validation-endpoints validation-screens validation-orphans validation-coherence wave-3-summary; do
  CHECK ".audit/$f.md" || true
done

echo ""
echo "▸ Reporte final"
CHECK ".audit/final-report.md"

echo ""
echo "▸ Estado del status board"
if [ -f ".blitz/status-board.md" ]; then
  WAVES_DONE=$(grep -c "✅ COMPLETADO" .blitz/status-board.md 2>/dev/null || echo 0)
  WAVES_FAILED=$(grep -c "❌ FALLIDO" .blitz/status-board.md 2>/dev/null || echo 0)
  echo "  Waves completadas: $WAVES_DONE"
  echo "  Waves fallidas: $WAVES_FAILED"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"

# Métricas globales
TOTAL_CONTRACTS=$((SCREENS_TOTAL + ENDPOINTS_TOTAL))
EXPECTED_SCREENS=34  # 29 + 5 perm-tabs
EXPECTED_DETAILED_ENDPOINTS=33  # 8 + 10 + 10 + 5

SCREEN_COVERAGE=0
if [ $EXPECTED_SCREENS -gt 0 ]; then
  SCREEN_COVERAGE=$((SCREENS_TOTAL * 100 / EXPECTED_SCREENS))
fi

echo ""
echo "RESUMEN:"
echo "  Cobertura de screens: $SCREENS_TOTAL / $EXPECTED_SCREENS ($SCREEN_COVERAGE%)"
echo "  Endpoints documentados: $ENDPOINTS_TOTAL (de ~155 totales)"
echo "  Total contratos: $TOTAL_CONTRACTS"
echo ""

# Veredicto
if [ $SCREENS_TOTAL -ge 30 ] && [ $ENDPOINTS_TOTAL -ge 30 ] && [ -f ".audit/final-report.md" ]; then
  echo "✅ BLITZ EXITOSO — objetivos del día cumplidos"
  exit 0
elif [ $SCREENS_TOTAL -ge 20 ] && [ $ENDPOINTS_TOTAL -ge 15 ]; then
  echo "⚠️ BLITZ PARCIAL — la mayoría se completó, revisar reporte final"
  exit 1
else
  echo "❌ BLITZ INCOMPLETO — menos del 50% completado"
  exit 2
fi
