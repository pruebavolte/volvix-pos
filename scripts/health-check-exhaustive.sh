#!/usr/bin/env bash
# ============================================================================
# VOLVIX POS — Health Check Exhaustivo (FIX-DR5)
# ----------------------------------------------------------------------------
# Curl a 20+ endpoints en producción. Mide latencia y compara contra status
# esperado (200 / 401 / 404). Imprime tabla y sale con exit 1 si encuentra
# CUALQUIER 5xx.
#
# Útil para:
#   - Post-deploy verification (last step de CI/CD)
#   - Cron monitoring (each 5min)
#   - Pre-DR drill (asegura que prod está estable antes de probar restore)
#
# Uso:
#   ./scripts/health-check-exhaustive.sh
#   ./scripts/health-check-exhaustive.sh --base https://salvadorexoficial.com
#   ./scripts/health-check-exhaustive.sh --json   # output JSON para parsers
#   ./scripts/health-check-exhaustive.sh --fail-on-degraded   # exit 1 si degraded
#
# Variables de entorno opcionales:
#   VOLVIX_BASE_URL    — URL base (default: https://salvadorexoficial.com)
#   VOLVIX_TIMEOUT     — timeout por curl en segundos (default: 10)
#   VOLVIX_SLOW_MS     — latencia que dispara warn (default: 1500ms)
# ============================================================================

set -uo pipefail

BASE_URL="${VOLVIX_BASE_URL:-https://salvadorexoficial.com}"
TIMEOUT="${VOLVIX_TIMEOUT:-10}"
SLOW_MS="${VOLVIX_SLOW_MS:-1500}"
OUTPUT_JSON=0
FAIL_ON_DEGRADED=0

# ---- Args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_URL="$2"; shift 2 ;;
    --json) OUTPUT_JSON=1; shift ;;
    --fail-on-degraded) FAIL_ON_DEGRADED=1; shift ;;
    -h|--help)
      sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "curl required" >&2; exit 2
fi

# ---- Endpoint table: METHOD | PATH | EXPECTED_STATUS | DESC ----
# Status esperado:
#   200 = público OK
#   401 = requiere auth (sin JWT, debe rechazar correctamente)
#   404 = endpoint no existe (intencional para detectar misroutes)
#   503 = degraded ok (health/full puede dar 503 sin ser ERR)
ENDPOINTS=(
  "GET|/api/health|200|Health check básico"
  "GET|/api/health/full|200,503|Self-check exhaustivo (200 ok, 503 degraded)"
  "GET|/api/health/deep|200,503|Deep check (RPC roundtrip)"
  "GET|/api/healthcheck/api-root|200|HC api-root stub"
  "GET|/api/healthcheck/api-auth|200|HC api-auth stub"
  "GET|/api/healthcheck/api-pos|200|HC api-pos stub"
  "GET|/api/healthcheck/api-stock|200|HC api-stock stub"
  "GET|/api/healthcheck/api-reports|200|HC api-reports stub"
  "GET|/login.html|200|Login page accesible"
  "GET|/status-page.html|200|Status page público (R8e DR1)"
  "GET|/volvix-emergency-mode.html|200|Emergency mode UI (R8e DR3)"
  "GET|/404.html|200,404|Custom 404"
  "GET|/api/products|401|Productos sin auth → 401"
  "GET|/api/sales|401|Ventas sin auth → 401"
  "GET|/api/customers|401|Clientes sin auth → 401"
  "GET|/api/inventory|401|Inventario sin auth → 401"
  "GET|/api/users|401|Users sin auth → 401"
  "GET|/api/cuts|401|Cortes sin auth → 401"
  "GET|/api/promotions|401|Promociones sin auth → 401"
  "GET|/api/kds|401,404|KDS sin auth → 401 (404 si no montado)"
  "GET|/api/feature-flags|200,401|Feature flags (R8e DR4)"
  "GET|/api/tenants|401|Tenants sin auth → 401"
  "GET|/api/this-endpoint-does-not-exist|404|Catch-all 404"
)

# ---- Color helpers ----
if [[ "$OUTPUT_JSON" -eq 0 ]] && [[ -t 1 ]]; then
  G='\e[32m'; Y='\e[33m'; R='\e[31m'; B='\e[36m'; D='\e[2m'; N='\e[0m'
else
  G=''; Y=''; R=''; B=''; D=''; N=''
fi

declare -i TOTAL=0
declare -i PASS=0
declare -i FAIL=0
declare -i WARN_SLOW=0
declare -i ANY_5XX=0

if [[ "$OUTPUT_JSON" -eq 1 ]]; then
  echo "{"
  echo "  \"base\": \"$BASE_URL\","
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"results\": ["
  FIRST_JSON=1
else
  printf "${B}══════════════════════════════════════════════════════════════════${N}\n"
  printf "${B}  VOLVIX POS — Health Check Exhaustivo${N}\n"
  printf "${B}  Base: %s${N}\n" "$BASE_URL"
  printf "${B}  Timestamp: %s${N}\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "${B}══════════════════════════════════════════════════════════════════${N}\n\n"
  printf "%-7s %-44s %-6s %-9s %s\n" "METHOD" "PATH" "STATUS" "LATENCY" "RESULT"
  printf "%s\n" "──────────────────────────────────────────────────────────────────────────────"
fi

for entry in "${ENDPOINTS[@]}"; do
  IFS='|' read -r METHOD PATHN EXPECTED DESC <<< "$entry"
  TOTAL+=1
  URL="$BASE_URL$PATHN"

  # curl: -w '%{http_code}|%{time_total}', -m timeout, -s silent, -o /dev/null
  RESPONSE="$(curl -s -m "$TIMEOUT" -X "$METHOD" -o /dev/null \
                   -w '%{http_code}|%{time_total}' "$URL" 2>/dev/null || echo '000|0')"
  STATUS_CODE="${RESPONSE%|*}"
  TIME_S="${RESPONSE#*|}"
  # convert seconds -> ms (avoiding bc dependency)
  TIME_MS="$(awk -v t="$TIME_S" 'BEGIN{printf "%d", t*1000}')"

  # Acepta lista CSV como expected: "200,503"
  EXPECTED_OK=0
  IFS=',' read -ra EXP_ARR <<< "$EXPECTED"
  for exp in "${EXP_ARR[@]}"; do
    if [[ "$STATUS_CODE" == "$exp" ]]; then EXPECTED_OK=1; break; fi
  done

  # 5xx siempre es FAIL aunque esté en expected
  if [[ "$STATUS_CODE" =~ ^5 ]]; then
    EXPECTED_OK=0
    ANY_5XX+=1
  fi

  if [[ "$EXPECTED_OK" -eq 1 ]]; then
    PASS+=1
    if [[ "$TIME_MS" -gt "$SLOW_MS" ]]; then
      WARN_SLOW+=1
      MARK="${Y}OK (slow)${N}"
    else
      MARK="${G}OK${N}"
    fi
  else
    FAIL+=1
    MARK="${R}FAIL${N} (esperado ${EXPECTED})"
  fi

  if [[ "$OUTPUT_JSON" -eq 1 ]]; then
    [[ "$FIRST_JSON" -eq 1 ]] || echo ","
    FIRST_JSON=0
    printf '    {"method":"%s","path":"%s","expected":"%s","status":%s,"latency_ms":%s,"ok":%s}' \
      "$METHOD" "$PATHN" "$EXPECTED" "$STATUS_CODE" "$TIME_MS" \
      "$([ "$EXPECTED_OK" -eq 1 ] && echo true || echo false)"
  else
    printf "%-7s %-44s %-6s ${D}%-9s${N} %b\n" \
      "$METHOD" "$PATHN" "$STATUS_CODE" "${TIME_MS}ms" "$MARK"
  fi
done

if [[ "$OUTPUT_JSON" -eq 1 ]]; then
  echo ""
  echo "  ],"
  echo "  \"summary\": {"
  echo "    \"total\": $TOTAL,"
  echo "    \"pass\": $PASS,"
  echo "    \"fail\": $FAIL,"
  echo "    \"slow\": $WARN_SLOW,"
  echo "    \"server_errors\": $ANY_5XX"
  echo "  }"
  echo "}"
else
  echo ""
  printf "${B}══════════════════════════════════════════════════════════════════${N}\n"
  printf " Total: %d   ${G}Pass: %d${N}   ${R}Fail: %d${N}   ${Y}Slow: %d${N}\n" \
    "$TOTAL" "$PASS" "$FAIL" "$WARN_SLOW"
  printf "${B}══════════════════════════════════════════════════════════════════${N}\n"
fi

# Exit codes
if [[ "$ANY_5XX" -gt 0 ]]; then
  echo ""
  echo "ERROR: $ANY_5XX endpoint(s) devolvieron 5xx — sistema con falla crítica" >&2
  exit 1
fi
if [[ "$FAIL" -gt 0 ]]; then
  echo ""
  echo "FAIL: $FAIL endpoint(s) no devolvieron status esperado" >&2
  exit 1
fi
if [[ "$FAIL_ON_DEGRADED" -eq 1 ]] && [[ "$WARN_SLOW" -gt 0 ]]; then
  echo ""
  echo "DEGRADED: $WARN_SLOW endpoint(s) lentos (>${SLOW_MS}ms)" >&2
  exit 1
fi
exit 0
