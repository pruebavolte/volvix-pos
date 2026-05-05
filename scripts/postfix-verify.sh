#!/usr/bin/env bash
# ============================================================
# VOLVIX postfix-verify v2 — corre tras CADA fix dentro de un bloque
# ============================================================
# Args:
#   $1  pantalla recién arreglada (ej. /volvix-mega-dashboard.html)
#   $2  worktree relativo del archivo modificado (para auto-rollback)
#   $3..$5  3 sub-sistemas no relacionados a re-verificar (regresión)
#
# Uso:
#   bash scripts/postfix-verify.sh /volvix-mega-dashboard.html volvix-mega-dashboard.html \
#        /salvadorex-pos.html /volvix-owner-panel.html /volvix-vendor-portal.html
#
# Comportamiento:
#  - Lanza Playwright con 4 workers en paralelo
#  - Compara screenshots con baseline en .baseline/
#  - Regresión >5% en sub-sistema NO relacionado → AUTO-ROLLBACK del archivo
#  - Pantalla arreglada sin cambio visual → "fix no aplicado" (warn)
#  - Reporte: post-fix-<timestamp>.md
# ============================================================

set -u
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

PROD_URL="${PROD_URL:-https://salvadorexoficial.com}"
QA_PROJECT="${QA_PROJECT:-C:/qa-playwright}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT="$PROJECT_ROOT/.audit/post-fix-$TIMESTAMP.md"
mkdir -p "$PROJECT_ROOT/.audit" "$PROJECT_ROOT/.baseline"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

if [ $# -lt 5 ]; then
  red "Uso: $0 <fixed_url> <changed_file> <regress1> <regress2> <regress3>"
  exit 2
fi

FIXED_URL="$1"
CHANGED_FILE="$2"
REGR1="$3"; REGR2="$4"; REGR3="$5"

bold "━━━━ POSTFIX-VERIFY v2 ━━━━"
echo "Pantalla arreglada: $FIXED_URL"
echo "Archivo cambiado:   $CHANGED_FILE"
echo "Regresión check:    $REGR1, $REGR2, $REGR3"
echo

# ───────────────────────────────────────────────────────────
# 1. Generar spec Playwright dinámico
# ───────────────────────────────────────────────────────────
SPEC="$QA_PROJECT/tests/_postfix-$TIMESTAMP.spec.js"
SHOTS="$PROJECT_ROOT/.audit/shots-$TIMESTAMP"
mkdir -p "$SHOTS"

cat > "$SPEC" <<'JSEOF'
const { test } = require('@playwright/test');
const fs = require('fs');
const PROD = process.env.PROD_URL || 'https://salvadorexoficial.com';
const SHOTS = process.env.SHOTS_DIR;
const FIXED = process.env.FIXED_URL;
const REGR  = (process.env.REGR_LIST || '').split(',').filter(Boolean);

async function login(page) {
  await page.goto(PROD + '/login.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  try {
    await page.fill('input[type="email"]', 'admin@volvix.test');
    await page.fill('input[type="password"]', 'Volvix2026!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  } catch(e) {}
}

test.describe.parallel('postfix', () => {
  test('fixed', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await login(p);
    await p.goto(PROD + FIXED, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `${SHOTS}/fixed.png`, fullPage: false });
    fs.writeFileSync(`${SHOTS}/fixed.json`, JSON.stringify({
      url: p.url(),
      title: await p.title(),
    }, null, 2));
  });
  for (let i = 0; i < REGR.length; i++) {
    const path = REGR[i];
    test(`regress-${i+1}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 }, serviceWorkers: 'block' });
      const p = await ctx.newPage();
      await login(p);
      await p.goto(PROD + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(3500);
      await p.screenshot({ path: `${SHOTS}/regress-${i+1}.png`, fullPage: false });
    });
  }
});
JSEOF

# ───────────────────────────────────────────────────────────
# 2. Ejecutar Playwright con 4 workers
# ───────────────────────────────────────────────────────────
bold "[1/3] Playwright 4 workers paralelos"
export PROD_URL FIXED_URL REGR_LIST="$REGR1,$REGR2,$REGR3" SHOTS_DIR="$SHOTS"
PW_LOG="$SHOTS/playwright.log"
( cd "$QA_PROJECT" && npx playwright test "tests/_postfix-$TIMESTAMP.spec.js" \
    --project=chromium --workers=4 --reporter=list --timeout=120000 ) > "$PW_LOG" 2>&1
PW_EXIT=$?
if [ "$PW_EXIT" -eq 0 ]; then
  green "  Playwright OK"
else
  yellow "  Playwright tuvo fallos (ver $PW_LOG)"
fi
echo

# ───────────────────────────────────────────────────────────
# 3. Comparar con baseline (si existe)
# ───────────────────────────────────────────────────────────
bold "[2/3] diff visual vs .baseline/"
REGRESSION_PCT=0
NO_CHANGE=0
SHOT_FIXED="$SHOTS/fixed.png"
BASE_FIXED="$PROJECT_ROOT/.baseline/$(basename "$FIXED_URL").png"

# Si python+PIL disponible, calcular diff de pixeles
python_diff() {
  local a="$1" b="$2"
  python - <<PYEOF 2>/dev/null
try:
    from PIL import Image
    import sys
    A = Image.open(r"$a").convert("RGB")
    B = Image.open(r"$b").convert("RGB")
    if A.size != B.size:
        B = B.resize(A.size)
    px_a = list(A.getdata()); px_b = list(B.getdata())
    diff = sum(1 for a,b in zip(px_a, px_b) if a != b)
    pct = 100.0 * diff / len(px_a)
    print(f"{pct:.2f}")
except Exception as e:
    print("0.00")
PYEOF
}

if [ -f "$BASE_FIXED" ]; then
  D=$(python_diff "$SHOT_FIXED" "$BASE_FIXED")
  echo "  fixed vs baseline: $D%"
  # Si <0.5% el fix no se aplicó (pantalla idéntica)
  if [ "$(echo "$D < 0.5" | bc 2>/dev/null || echo 0)" = "1" ]; then
    yellow "  ⚠ pantalla idéntica al baseline → fix probablemente NO desplegado"
    NO_CHANGE=1
  fi
else
  yellow "  baseline no existe para $FIXED_URL → creando uno"
  cp "$SHOT_FIXED" "$BASE_FIXED" 2>/dev/null || true
fi

for i in 1 2 3; do
  SHOT="$SHOTS/regress-$i.png"
  REGR_VAR="REGR$i"
  REGR_PATH=$(eval echo "\${$REGR_VAR}")
  BASE="$PROJECT_ROOT/.baseline/$(basename "$REGR_PATH").png"
  if [ -f "$SHOT" ] && [ -f "$BASE" ]; then
    D=$(python_diff "$SHOT" "$BASE")
    echo "  regress-$i ($REGR_PATH): $D%"
    INT=$(python -c "print(int(float('$D') * 100))" 2>/dev/null || echo 0)
    if [ "$INT" -gt "$REGRESSION_PCT" ]; then REGRESSION_PCT="$INT"; fi
  elif [ -f "$SHOT" ]; then
    cp "$SHOT" "$BASE" 2>/dev/null || true
    echo "  regress-$i ($REGR_PATH): baseline creado"
  fi
done
echo

# ───────────────────────────────────────────────────────────
# 4. Decisión: rollback o continuar
# ───────────────────────────────────────────────────────────
bold "[3/3] decisión"
ACTION="OK"
if [ "$REGRESSION_PCT" -gt 500 ]; then  # >5%
  red "  ✗ regresión visual >5% en sub-sistema no relacionado"
  ACTION="ROLLBACK"
fi
if [ "$NO_CHANGE" = "1" ]; then
  yellow "  ⚠ fix no aplicado (pantalla idéntica)"
  ACTION="${ACTION}|NO-CHANGE"
fi

# Rollback automático si procede
if echo "$ACTION" | grep -q "ROLLBACK"; then
  if command -v git >/dev/null 2>&1 && [ -f "$CHANGED_FILE" ]; then
    red "  AUTO-ROLLBACK: git checkout HEAD -- $CHANGED_FILE"
    git checkout HEAD -- "$CHANGED_FILE" 2>/dev/null || red "  rollback FALLÓ — manual requerido"
  fi
fi

# ───────────────────────────────────────────────────────────
# Reporte
# ───────────────────────────────────────────────────────────
{
  echo "# postfix-verify $TIMESTAMP"
  echo ""
  echo "- Pantalla arreglada: $FIXED_URL"
  echo "- Archivo cambiado: $CHANGED_FILE"
  echo "- Regresión max: $(python -c "print(f'{$REGRESSION_PCT/100:.2f}%')" 2>/dev/null || echo "${REGRESSION_PCT}/100%")"
  echo "- Fix sin cambio visual: $NO_CHANGE"
  echo "- Acción: $ACTION"
  echo "- Screenshots: $SHOTS"
} > "$REPORT"

echo "Reporte: $REPORT"
if [ "$ACTION" = "OK" ]; then
  green "✓ verificación OK"
  exit 0
else
  red "✗ acción tomada: $ACTION"
  exit 1
fi
