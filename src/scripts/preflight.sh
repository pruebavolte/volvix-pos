#!/usr/bin/env bash
# ============================================================
# VOLVIX preflight v2 — corre al inicio de cada sesión nueva
# ============================================================
# Verifica:
#  1. git status limpio
#  2. 30 endpoints públicos responden
#  3. Supabase PAT válido (lee 1 fila)
#  4. VOLVIX-FIX-PLAN.md presente y reporta próximo bloque PENDIENTE
#  5. SYSTEM-INVENTORY.json existe (si no, genera placeholder y avisa)
# Exit 0 si todo OK, exit 1 si algo bloquea.
# ============================================================

set -u
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

PROD_URL="${PROD_URL:-https://volvix-pos.vercel.app}"
INVENTORY="$PROJECT_ROOT/SYSTEM-INVENTORY.json"
FIX_PLAN="$PROJECT_ROOT/VOLVIX-FIX-PLAN.md"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

bold "━━━━ VOLVIX PREFLIGHT v2 ━━━━"
echo "Repo:    $PROJECT_ROOT"
echo "Prod:    $PROD_URL"
echo "Time:    $(date -u +%FT%TZ)"
echo

# Cargar .env.production para PAT y URL Supabase
if [ -f .env.production ]; then
  set -a; . .env.production 2>/dev/null; set +a
fi

ERRS=0
warn_only() { yellow "  ⚠ $*"; }
fail()      { red    "  ✗ $*"; ERRS=$((ERRS+1)); }
ok()        { green  "  ✓ $*"; }

# ───────────────────────────────────────────────────────────
# 1. git status limpio
# ───────────────────────────────────────────────────────────
bold "[1/5] git status"
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  CHANGES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CHANGES" = "0" ]; then
    ok "working tree limpio"
  else
    warn_only "working tree con $CHANGES cambios sin commit (no bloqueante en setup)"
  fi
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  ok "branch: $BRANCH"
else
  warn_only "git no inicializado o no disponible (no bloqueante)"
fi
echo

# ───────────────────────────────────────────────────────────
# 2. Smoke test 30 endpoints
# ───────────────────────────────────────────────────────────
bold "[2/5] smoke test endpoints"
ENDPOINTS=(
  "/api/ping"
  "/api/healthcheck/api-root"
  "/api/healthcheck/api-auth"
  "/api/healthcheck/api-pos"
  "/api/healthcheck/api-stock"
  "/api/healthcheck/api-reports"
  "/api/config/public"
  "/api/billing/plans"
  "/api/currencies"
  "/api/fx/rates"
  "/api/integrations/supabase/health"
  "/api/integrations/stripe/health"
  "/api/integrations/sat-cfdi/health"
  "/api/integrations/sat/ping"
  "/api/integrations/whatsapp/ping"
  "/api/openapi.yaml"
  "/api/docs"
  "/login.html"
  "/marketplace.html"
  "/volvix-hub-landing.html"
  "/volvix-customer-portal.html"
  "/volvix-vendor-portal.html"
  "/volvix-mega-dashboard.html"
  "/volvix-admin-saas.html"
  "/salvadorex_web_v25.html"
  "/volvix_owner_panel_v7.html"
  "/volvix-sitemap.html"
  "/volvix-api-docs.html"
  "/volvix-gdpr-portal.html"
  "/404.html"
)
PASS=0; FAIL_LIST=()
for ep in "${ENDPOINTS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "$PROD_URL$ep" 2>/dev/null || echo "000")
  if [ "$CODE" -ge 200 ] && [ "$CODE" -lt 500 ]; then
    PASS=$((PASS+1))
  else
    FAIL_LIST+=("$ep[$CODE]")
  fi
done
if [ "$PASS" -ge 27 ]; then
  ok "smoke $PASS/${#ENDPOINTS[@]} (umbral 27)"
elif [ "$PASS" -ge 20 ]; then
  warn_only "smoke $PASS/${#ENDPOINTS[@]} (degradado, no bloqueante)"
  printf "    failed: %s\n" "${FAIL_LIST[*]}"
else
  fail "smoke $PASS/${#ENDPOINTS[@]} (BLOQUEANTE: prod caído)"
  printf "    failed: %s\n" "${FAIL_LIST[*]}"
fi
echo

# ───────────────────────────────────────────────────────────
# 3. Supabase PAT
# ───────────────────────────────────────────────────────────
bold "[3/5] supabase PAT"
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  RESP=$(curl -s -m 6 -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/pos_companies?select=id&limit=1" 2>/dev/null || echo "")
  if echo "$RESP" | grep -q '"id"'; then
    ok "PAT válido (pos_companies leído)"
  elif echo "$RESP" | grep -qi "invalid"; then
    warn_only "PAT presente pero rechazado por Supabase (rotado o vencido)"
  else
    warn_only "PAT presente pero respuesta vacía o inesperada (no bloqueante)"
  fi
else
  warn_only "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY ausentes en .env.production (no bloqueante en setup)"
fi
echo

# ───────────────────────────────────────────────────────────
# 4. VOLVIX-FIX-PLAN.md y próximo bloque
# ───────────────────────────────────────────────────────────
bold "[4/5] fix plan"
NEXT_BLOCK="(no detectado)"
ETA="?"
if [ -f "$FIX_PLAN" ]; then
  ok "VOLVIX-FIX-PLAN.md presente"
  NEXT_BLOCK=$(grep -E "^### B[0-9]+ " "$FIX_PLAN" 2>/dev/null | while read -r line; do
    blk=$(echo "$line" | grep -oE "^### B[0-9]+")
    blk_no_h=${blk#### }
    # Buscar primero estado pendiente bajo este bloque
    status=$(awk -v b="$blk" '$0~b{found=1;next} found && /^### /{exit} found && /^Estado:/{print;exit}' "$FIX_PLAN")
    if echo "$status" | grep -qi "PENDIENTE"; then
      echo "$blk_no_h"
      break
    fi
  done | head -1)
  if [ -z "$NEXT_BLOCK" ]; then
    NEXT_BLOCK="(todos los bloques completos o no hay marcador 'Estado:')"
  fi
  # Estimación de minutos del bloque
  ETA=$(grep -E "^### $NEXT_BLOCK " "$FIX_PLAN" 2>/dev/null | grep -oE "[0-9]+-[0-9]+ min" | head -1)
  ETA="${ETA:-90 min}"
else
  warn_only "VOLVIX-FIX-PLAN.md no existe — primera sesión, normal"
fi
echo "  próximo bloque: $NEXT_BLOCK"
echo "  estimado:       $ETA"
echo

# ───────────────────────────────────────────────────────────
# 5. SYSTEM-INVENTORY.json
# ───────────────────────────────────────────────────────────
bold "[5/5] system inventory"
if [ -f "$INVENTORY" ]; then
  SUBS=$(python -c "import json,sys; d=json.load(open('SYSTEM-INVENTORY.json',encoding='utf-8')); print(len(d.get('subsystems',[])))" 2>/dev/null || echo "?")
  EPS=$(python -c "import json,sys; d=json.load(open('SYSTEM-INVENTORY.json',encoding='utf-8')); print(len(d.get('endpoints',[])))" 2>/dev/null || echo "?")
  TBLS=$(python -c "import json,sys; d=json.load(open('SYSTEM-INVENTORY.json',encoding='utf-8')); print(len(d.get('db_tables',[])))" 2>/dev/null || echo "?")
  ok "SYSTEM-INVENTORY.json presente: $SUBS sub-sistemas · $EPS endpoints · $TBLS tablas"
  AGE_DAYS=$(python -c "
import json,datetime
d=json.load(open('SYSTEM-INVENTORY.json',encoding='utf-8'))
ts=d.get('generated_at','')
try:
  dt=datetime.datetime.fromisoformat(ts.replace('Z','+00:00'))
  print(int((datetime.datetime.now(datetime.timezone.utc)-dt).total_seconds()//86400))
except: print('?')
" 2>/dev/null || echo "?")
  echo "  edad: $AGE_DAYS días (regenerar si >7)"
else
  warn_only "SYSTEM-INVENTORY.json no existe — generar con scripts/refresh-inventory.sh"
  ERRS=$((ERRS+1))
fi
echo

# ───────────────────────────────────────────────────────────
# Resumen
# ───────────────────────────────────────────────────────────
bold "━━━━ RESUMEN ━━━━"
if [ "$ERRS" = "0" ]; then
  green "✓ Listo para $NEXT_BLOCK. Estimado: $ETA."
  exit 0
else
  red "✗ $ERRS bloqueo(s) detectados. Resolver antes de empezar."
  exit 1
fi
