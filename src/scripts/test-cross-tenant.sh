#!/usr/bin/env bash
# B1 Tests 2-4: cross-tenant aislamiento
set -u
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
set -a; . .env.production 2>/dev/null; set +a

PROD="${PROD_URL:-https://volvix-pos.vercel.app}"
TENANT_A="11111111-1111-1111-1111-111111111111"
TENANT_B="22222222-2222-2222-2222-222222222222"
USER_A="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"
USER_B="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

bold "━━━━ B1 cross-tenant tests ━━━━"

# Login admin@ (TENANT_A) y owner@ (TENANT_B)
echo "[login] admin@volvix.test"
TOK_A=$(curl -s -X POST "$PROD/api/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@volvix.test","password":"Volvix2026!"}' | python -c "import json,sys;print(json.load(sys.stdin).get('token',''))")
echo "  TOK_A: ${TOK_A:0:30}..."

echo "[login] owner@volvix.test"
TOK_B=$(curl -s -X POST "$PROD/api/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@volvix.test","password":"Volvix2026!"}' | python -c "import json,sys;print(json.load(sys.stdin).get('token',''))")
echo "  TOK_B: ${TOK_B:0:30}..."

[ -z "$TOK_A" ] && red "✗ login A falló" && exit 1
[ -z "$TOK_B" ] && red "✗ login B falló" && exit 1

# Helper para contar registros vs su pos_user_id
count_user_id() {
  local txt="$1" expected_uid="$2"
  echo "$txt" | python -c "
import sys, json
try:
  d = json.load(sys.stdin)
  arr = d if isinstance(d,list) else (d.get('items',[]) or [])
  target = '$expected_uid'
  matches = sum(1 for x in arr if x.get('pos_user_id') == target)
  print(f'{len(arr)}/{matches}')
except: print('0/0')
"
}

# ── Test 2: TOK_A → /api/sales debe mostrar SOLO ventas de TENANT_A
echo
bold "[Test 2] TOK_A GET /api/sales → solo TENANT_A"
RESP_A=$(curl -s -H "Authorization: Bearer $TOK_A" "$PROD/api/sales?limit=200")
TOTAL_MATCH_A=$(count_user_id "$RESP_A" "$USER_A")
TOTAL=$(echo "$TOTAL_MATCH_A" | cut -d/ -f1)
MATCH=$(echo "$TOTAL_MATCH_A" | cut -d/ -f2)
if [ "$TOTAL" = "$MATCH" ] && [ "$TOTAL" -gt 0 ]; then
  green "  ✓ $MATCH/$TOTAL ventas pertenecen a USER_A (aislamiento OK)"
else
  red "  ✗ $MATCH/$TOTAL — admin recibe ventas que NO le pertenecen"
fi

# ── Test 3: TOK_A con ?tenant_id=TENANT_B (intento de cross-tenant)
echo
bold "[Test 3] TOK_A ?tenant_id=TENANT_B → debe ser [] o 403"
RESP_X=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOK_A" "$PROD/api/sales?tenant_id=$TENANT_B")
RESP_BODY=$(curl -s -H "Authorization: Bearer $TOK_A" "$PROD/api/sales?tenant_id=$TENANT_B&limit=50")
COUNT_X=$(count_user_id "$RESP_BODY" "$USER_A")
TOT_X=$(echo "$COUNT_X" | cut -d/ -f1)
MATCH_X=$(echo "$COUNT_X" | cut -d/ -f2)
if [ "$RESP_X" = "403" ] || [ "$TOT_X" = "0" ]; then
  green "  ✓ rechazado correctamente (status=$RESP_X count=$TOT_X)"
elif [ "$TOT_X" = "$MATCH_X" ]; then
  yellow "  ⚠ status=$RESP_X devuelve $TOT_X (TODAS pertenecen a USER_A — query string ignorado correctamente)"
else
  red "  ✗ FUGA: status=$RESP_X $MATCH_X de USER_A pero $TOT_X total → contiene datos de OTROS users"
fi

# ── Test 4: TOK_B → /api/sales debe mostrar SOLO ventas de TENANT_B
echo
bold "[Test 4] TOK_B GET /api/sales → solo TENANT_B"
RESP_B=$(curl -s -H "Authorization: Bearer $TOK_B" "$PROD/api/sales?limit=200")
TOT_B_MATCH=$(count_user_id "$RESP_B" "$USER_B")
TOT_B=$(echo "$TOT_B_MATCH" | cut -d/ -f1)
MATCH_B=$(echo "$TOT_B_MATCH" | cut -d/ -f2)
echo "  raw response (primeros 200 chars): $(echo "$RESP_B" | head -c 200)"
if [ "$TOT_B" = "$MATCH_B" ]; then
  green "  ✓ $MATCH_B/$TOT_B ventas pertenecen a USER_B (aislamiento OK)"
else
  red "  ✗ $MATCH_B/$TOT_B — owner_B recibe ventas que NO le pertenecen"
fi

# ── Test 4b: TOK_B con ?tenant_id=TENANT_A (intento cruzado)
echo
bold "[Test 4b] TOK_B ?tenant_id=TENANT_A → debe ser [] o 403"
RESP_BX=$(curl -s -H "Authorization: Bearer $TOK_B" "$PROD/api/sales?tenant_id=$TENANT_A&limit=50")
COUNT_BX=$(count_user_id "$RESP_BX" "$USER_B")
TOT_BX=$(echo "$COUNT_BX" | cut -d/ -f1)
MATCH_BX=$(echo "$COUNT_BX" | cut -d/ -f2)
if [ "$TOT_BX" = "0" ] || [ "$TOT_BX" = "$MATCH_BX" ]; then
  green "  ✓ TOK_B no obtiene datos de TENANT_A (aislamiento OK)"
else
  red "  ✗ FUGA cross-tenant: TOK_B recibe datos que NO son de USER_B"
fi

echo
bold "━━━━ resumen ━━━━"
echo "TENANT_A=$TENANT_A user_A_count=$TOT  same_uid=$MATCH"
echo "TENANT_B=$TENANT_B user_B_count=$TOT_B same_uid=$MATCH_B"
