#!/usr/bin/env bash
# B2 Test 6: insertar venta $999 hoy → /api/dashboard/today refleja el delta
set -u
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
set -a; . .env.production 2>/dev/null; set +a

PROD="${PROD_URL:-https://volvix-pos.vercel.app}"
USER_A="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# Login admin para obtener TOK_A
TOK_A=$(curl -s -X POST "$PROD/api/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@volvix.test","password":"Volvix2026!"}' | python -c "import json,sys;print(json.load(sys.stdin).get('token',''))")

bold "[Test 6] Cambio dinámico: insertar venta \$999, refresh"

# 1. Estado inicial
echo "[1] estado ANTES"
RESP_BEFORE=$(curl -s -H "Authorization: Bearer $TOK_A" "$PROD/api/dashboard/today")
echo "$RESP_BEFORE" | python -m json.tool 2>&1 | head -15
SALES_BEFORE=$(echo "$RESP_BEFORE" | python -c "import json,sys;print(json.load(sys.stdin).get('sales_today',0))")
TICKETS_BEFORE=$(echo "$RESP_BEFORE" | python -c "import json,sys;print(json.load(sys.stdin).get('tickets_today',0))")
echo "  sales_today_before=$SALES_BEFORE  tickets_before=$TICKETS_BEFORE"

# 2. Insertar venta de $999.00 hoy via Supabase service_role
echo
echo "[2] insertar venta \$999.00 via service_role"
NEW_SALE=$(curl -s -X POST -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"pos_user_id\":\"$USER_A\",\"total\":999,\"payment_method\":\"efectivo\",\"items\":[{\"qty\":1,\"sku\":\"B2-DYNAMIC\",\"price\":999}]}" \
  "$SUPABASE_URL/rest/v1/pos_sales")
NEW_ID=$(echo "$NEW_SALE" | python -c "import json,sys;d=json.load(sys.stdin);print(d[0].get('id','') if isinstance(d,list) and d else '')")
if [ -n "$NEW_ID" ]; then green "  ✓ venta creada id=$NEW_ID"
else red "  ✗ no se pudo crear venta: $(echo "$NEW_SALE" | head -c 200)"; exit 1; fi

# 3. Esperar 1s y consultar /api/dashboard/today
echo
echo "[3] estado DESPUÉS"
sleep 1
RESP_AFTER=$(curl -s -H "Authorization: Bearer $TOK_A" "$PROD/api/dashboard/today")
echo "$RESP_AFTER" | python -m json.tool 2>&1 | head -15
SALES_AFTER=$(echo "$RESP_AFTER" | python -c "import json,sys;print(json.load(sys.stdin).get('sales_today',0))")
TICKETS_AFTER=$(echo "$RESP_AFTER" | python -c "import json,sys;print(json.load(sys.stdin).get('tickets_today',0))")
echo "  sales_today_after=$SALES_AFTER  tickets_after=$TICKETS_AFTER"

# 4. Verificar delta
echo
DELTA_SALES=$(python -c "print($SALES_AFTER - $SALES_BEFORE)")
DELTA_TICKETS=$(python -c "print($TICKETS_AFTER - $TICKETS_BEFORE)")
echo "  delta_sales=$DELTA_SALES (esperado 999)  delta_tickets=$DELTA_TICKETS (esperado 1)"

if python -c "import sys; sys.exit(0 if abs($DELTA_SALES - 999) < 0.01 and $DELTA_TICKETS == 1 else 1)"; then
  green "✓ Test 6 PASA: dashboard refleja el cambio dinámicamente"
else
  red "✗ Test 6 FALLA: delta no coincide con la venta insertada"
  exit 1
fi

# 5. Cleanup: borrar la venta seed
echo
echo "[5] cleanup seed venta"
curl -s -X DELETE -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/pos_sales?id=eq.$NEW_ID" >/dev/null
green "  ✓ cleanup OK"
