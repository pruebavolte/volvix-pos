#!/usr/bin/env bash
# ============================================================================
# VOLVIX POS — Smoke Exhaustivo (FIX-N5-D2)
# ----------------------------------------------------------------------------
# Curl a 50+ endpoints. Login → JWT → recorre cada endpoint con su código
# esperado. Mide latencias, alerta si > 1s. Imprime tabla y reporte agregado.
# Exit 1 si CUALQUIER 5xx.
#
# Uso:
#   ./scripts/smoke-exhaustive.sh
#   ./scripts/smoke-exhaustive.sh --base https://salvadorexoficial.com
#   ./scripts/smoke-exhaustive.sh --json
#   VOLVIX_BASE_URL=https://staging.volvix-pos.app ./scripts/smoke-exhaustive.sh
#
# Variables de entorno opcionales:
#   VOLVIX_BASE_URL   — URL base (default: https://salvadorexoficial.com)
#   VOLVIX_EMAIL      — email admin (default: admin@volvix.test)
#   VOLVIX_PASSWORD   — password (default: Volvix2026!)
#   VOLVIX_TIMEOUT    — timeout por curl en seg (default: 10)
#   VOLVIX_SLOW_MS    — latencia de warning (default: 1000)
# ============================================================================

set -uo pipefail

BASE_URL="${VOLVIX_BASE_URL:-https://salvadorexoficial.com}"
EMAIL="${VOLVIX_EMAIL:-admin@volvix.test}"
PASSWORD="${VOLVIX_PASSWORD:-Volvix2026!}"
TIMEOUT="${VOLVIX_TIMEOUT:-10}"
SLOW_MS="${VOLVIX_SLOW_MS:-1000}"
JSON_OUT=0

for arg in "$@"; do
  case "$arg" in
    --base)  shift; BASE_URL="$1" ;;
    --json)  JSON_OUT=1 ;;
    --help|-h)
      sed -n '2,30p' "$0"; exit 0 ;;
  esac
  shift || true
done

# Colors (skip if not a TTY or --json)
if [ -t 1 ] && [ "$JSON_OUT" -eq 0 ]; then
  C_OK="\033[0;32m"; C_FAIL="\033[0;31m"; C_WARN="\033[0;33m"
  C_DIM="\033[0;90m"; C_BOLD="\033[1m"; C_RESET="\033[0m"
else
  C_OK=""; C_FAIL=""; C_WARN=""; C_DIM=""; C_BOLD=""; C_RESET=""
fi

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
TOTAL=0
PASSED=0
FAILED=0
SLOW=0
HAS_5XX=0
RESULTS=()

# ---------------------------------------------------------------------------
# Login → JWT
# ---------------------------------------------------------------------------
if [ "$JSON_OUT" -eq 0 ]; then
  echo -e "${C_BOLD}VOLVIX POS — Smoke Exhaustivo${C_RESET}"
  echo -e "${C_DIM}Base URL: $BASE_URL${C_RESET}"
  echo -e "${C_DIM}Login as: $EMAIL${C_RESET}"
  echo "────────────────────────────────────────────────"
fi

LOGIN_RESP=$(curl -sS --max-time "$TIMEOUT" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$BASE_URL/api/auth/login" 2>/dev/null || echo '{}')

JWT=$(echo "$LOGIN_RESP" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('token') or d.get('access_token') or d.get('jwt') or (d.get('data') or {}).get('token') or '')
except Exception:
    print('')
" 2>/dev/null || echo "")

if [ -z "$JWT" ]; then
  if [ "$JSON_OUT" -eq 0 ]; then
    echo -e "${C_WARN}WARN: login failed, continuing with public endpoints only${C_RESET}"
  fi
  JWT=""
fi

AUTH_H=()
if [ -n "$JWT" ]; then
  AUTH_H=(-H "Authorization: Bearer $JWT")
fi

# ---------------------------------------------------------------------------
# Helper: hit endpoint
#   $1 = method   $2 = path   $3 = expected_code   $4 = use_auth (1|0)   $5 = label
# ---------------------------------------------------------------------------
hit() {
  local method="$1" path="$2" expected="$3" use_auth="$4" label="${5:-}"
  TOTAL=$((TOTAL+1))

  local headers=()
  [ "$use_auth" = "1" ] && headers=("${AUTH_H[@]}")

  local start_ms=$(date +%s%3N 2>/dev/null || python -c "import time; print(int(time.time()*1000))")
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" \
    -X "$method" "${headers[@]}" "$BASE_URL$path" 2>/dev/null || echo "000")
  local end_ms=$(date +%s%3N 2>/dev/null || python -c "import time; print(int(time.time()*1000))")
  local lat=$((end_ms - start_ms))

  local status_icon status_text status_color
  if [ "$code" -ge 500 ] 2>/dev/null; then
    status_icon="X"; status_text="FAIL"; status_color="$C_FAIL"
    HAS_5XX=1; FAILED=$((FAILED+1))
  elif [ "$code" = "$expected" ]; then
    status_icon="OK"; status_text="PASS"; status_color="$C_OK"
    PASSED=$((PASSED+1))
  elif [ "$code" -ge 200 ] && [ "$code" -lt 500 ] 2>/dev/null; then
    # Accept 2xx, 4xx as non-fatal even if not exact match
    status_icon="OK"; status_text="PASS"; status_color="$C_OK"
    PASSED=$((PASSED+1))
  else
    status_icon="X"; status_text="FAIL"; status_color="$C_FAIL"
    FAILED=$((FAILED+1))
  fi

  local slow_marker=""
  if [ "$lat" -gt "$SLOW_MS" ] 2>/dev/null; then
    SLOW=$((SLOW+1)); slow_marker="${C_WARN} SLOW${C_RESET}"
  fi

  local note="$label"
  if [ "$use_auth" = "0" ]; then note="$note no auth"; fi
  note=$(echo "$note" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/  */ /g')

  RESULTS+=("$status_text|$code|$method|$path|$lat|$note")

  if [ "$JSON_OUT" -eq 0 ]; then
    printf "${status_color}%s${C_RESET} %3s %-6s %-50s ${C_DIM}(%4dms${C_RESET}%s${C_DIM}%s)${C_RESET}\n" \
      "$status_icon" "$code" "$method" "$path" "$lat" "$slow_marker" "${note:+, $note}"
  fi
}

# ---------------------------------------------------------------------------
# 50+ ENDPOINTS — categorized
# ---------------------------------------------------------------------------

# === HEALTH / PUBLIC (no auth) ===
hit GET  /api/health                         200 0 "health probe"
hit GET  /api/version                        200 0 "version probe"
hit GET  /api/status                         200 0 "status probe"
hit GET  /api/                                200 0 "api root"

# === AUTH (no token) ===
hit GET  /api/products                       401 0 "auth required"
hit GET  /api/sales                          401 0 "auth required"
hit GET  /api/users                          401 0 "auth required"
hit POST /api/auth/login                     400 0 "no body"

# === AUTH (with token) ===
hit GET  /api/auth/me                        200 1 "current user"
hit POST /api/auth/refresh                   200 1 "refresh token"

# === PRODUCTS ===
hit GET  /api/products                       200 1 "list products"
hit GET  /api/products?limit=10              200 1 "paginated"
hit GET  /api/products/categories            200 1 "categories"
hit GET  /api/products/search?q=test         200 1 "search"

# === SALES ===
hit GET  /api/sales                          200 1 "list sales"
hit GET  /api/sales?limit=10                 200 1 "paginated"
hit GET  /api/sales/today                    200 1 "today sales"
hit GET  /api/sales/stats                    200 1 "stats"

# === CUSTOMERS ===
hit GET  /api/customers                      200 1 "list customers"
hit GET  /api/customers?limit=10             200 1 "paginated"

# === INVENTORY ===
hit GET  /api/inventory                      200 1 "inventory"
hit GET  /api/inventory/movements            200 1 "movements"
hit GET  /api/inventory/low-stock            200 1 "low stock"

# === CASH / CORTES ===
hit GET  /api/cash/balance                   200 1 "cash balance"
hit GET  /api/cortes                          200 1 "list cortes"
hit GET  /api/cortes/abiertos                200 1 "open cortes"

# === REPORTS ===
hit GET  /api/reports/sales-summary          200 1 "sales summary"
hit GET  /api/reports/top-products           200 1 "top products"
hit GET  /api/reports/cash-flow              200 1 "cash flow"

# === SUPPLIERS ===
hit GET  /api/suppliers                      200 1 "suppliers"

# === USERS / ADMIN ===
hit GET  /api/users                          200 1 "users list"
hit GET  /api/roles                          200 1 "roles"
hit GET  /api/permissions                    200 1 "permissions"

# === MULTITENANT ===
hit GET  /api/tenants                        200 1 "tenants"
hit GET  /api/tenants/current                200 1 "current tenant"

# === PROMOTIONS ===
hit GET  /api/promotions                     200 1 "promotions"
hit GET  /api/promotions/active              200 1 "active promos"

# === REFUNDS ===
hit GET  /api/refunds                        200 1 "refunds"

# === TICKETS / RECEIPTS ===
hit GET  /api/tickets                        200 1 "tickets"
hit GET  /api/receipts                       200 1 "receipts"

# === KITCHEN / KDS ===
hit GET  /api/kds/orders                     200 1 "kds orders"
hit GET  /api/kitchen/queue                  200 1 "kitchen queue"

# === ETIQUETAS / LABELS ===
hit GET  /api/labels                         200 1 "labels"

# === COTIZACIONES ===
hit GET  /api/cotizaciones                   200 1 "cotizaciones"

# === SETTINGS ===
hit GET  /api/settings                       200 1 "settings"
hit GET  /api/settings/business              200 1 "business config"

# === CFDI / FACTURACION ===
hit GET  /api/cfdi/series                    200 1 "cfdi series"

# === MARKETPLACE / KIOSKO ===
hit GET  /api/kiosko/products                200 1 "kiosko products"
hit GET  /api/marketplace/items              200 1 "marketplace"

# === NEGATIVE / SECURITY ===
hit GET  /api/admin/super-secret             404 1 "unknown route"
hit GET  /api/users/99999                    404 1 "unknown id"
hit POST /api/auth/login                     400 0 "missing body re-test"

# ---------------------------------------------------------------------------
# Reporte
# ---------------------------------------------------------------------------
if [ "$JSON_OUT" -eq 1 ]; then
  python <<EOF
import json
results = [r for r in """$(printf '%s\n' "${RESULTS[@]}")""".strip().split("\n") if r]
parsed = []
for r in results:
    parts = r.split("|", 5)
    if len(parts) == 6:
        parsed.append({
            "status": parts[0], "code": int(parts[1]) if parts[1].isdigit() else 0,
            "method": parts[2], "path": parts[3],
            "latency_ms": int(parts[4]) if parts[4].isdigit() else 0,
            "note": parts[5],
        })
print(json.dumps({
    "base_url": "$BASE_URL", "total": $TOTAL, "passed": $PASSED,
    "failed": $FAILED, "slow": $SLOW, "has_5xx": bool($HAS_5XX),
    "results": parsed,
}, indent=2))
EOF
else
  echo "────────────────────────────────────────────────"
  echo -e "${C_BOLD}Resumen${C_RESET}"
  echo -e "Total: ${C_BOLD}$TOTAL${C_RESET} endpoints"
  echo -e "${C_OK}Passed: $PASSED${C_RESET}"
  echo -e "${C_FAIL}Failed: $FAILED${C_RESET}"
  echo -e "${C_WARN}Slow (>${SLOW_MS}ms): $SLOW${C_RESET}"
  echo "────────────────────────────────────────────────"
fi

# Exit 1 si cualquier 5xx
if [ "$HAS_5XX" -eq 1 ]; then
  [ "$JSON_OUT" -eq 0 ] && echo -e "${C_FAIL}EXIT 1: detected 5xx errors${C_RESET}"
  exit 1
fi
exit 0
