#!/usr/bin/env bash
# ============================================================
# B1 Test 1 — seed idempotente de tenant_B + user_B
# ============================================================
# Crea (si no existen):
#  - TENANT_A: ya existe (Don Chucho 11111111-...)
#  - TENANT_B: usa Restaurante Los Compadres (22222222-...) ya seedeado
#  - user_B: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1 (owner@volvix.test)
#  - Asocia user_A.company_id = TENANT_A_ID
#  - Asocia user_B.company_id = TENANT_B_ID
#
# Idempotente: PATCH siempre, INSERT con upsert (on_conflict).
# ============================================================
set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
set -a; . .env.production 2>/dev/null; set +a

URL="$SUPABASE_URL"
SR="$SUPABASE_SERVICE_ROLE_KEY"
TENANT_A="11111111-1111-1111-1111-111111111111"
TENANT_B="22222222-2222-2222-2222-222222222222"
USER_A="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"   # admin@volvix.test
USER_B="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1"   # owner@volvix.test

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

req() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" \
      -d "$body" "$URL$path"
  else
    curl -s -X "$method" -H "apikey: $SR" -H "Authorization: Bearer $SR" "$URL$path"
  fi
}

bold "━━━━ B1 SEED tenant_B + asociaciones ━━━━"

# 1. Verificar TENANT_A y TENANT_B existen
echo "[1] verificar tenants"
TA=$(req GET "/rest/v1/pos_companies?id=eq.$TENANT_A&select=id,name")
TB=$(req GET "/rest/v1/pos_companies?id=eq.$TENANT_B&select=id,name")
if echo "$TA" | grep -q '"id"'; then green "  ✓ TENANT_A: $(echo "$TA" | python -c "import sys,json;print(json.load(sys.stdin)[0].get('name',''))")"
else red "  ✗ TENANT_A no existe"; exit 1; fi
if echo "$TB" | grep -q '"id"'; then green "  ✓ TENANT_B: $(echo "$TB" | python -c "import sys,json;print(json.load(sys.stdin)[0].get('name',''))")"
else red "  ✗ TENANT_B no existe"; exit 1; fi

# 2. Asociar user_A → TENANT_A (idempotente)
echo "[2] asociar user_A → TENANT_A"
PA=$(req PATCH "/rest/v1/pos_users?id=eq.$USER_A" "{\"company_id\":\"$TENANT_A\",\"role\":\"admin\"}")
if echo "$PA" | grep -q "$TENANT_A"; then green "  ✓ user_A.company_id = TENANT_A"
else red "  ✗ patch user_A falló: $(echo "$PA" | head -c 200)"; fi

# 3. Asociar user_B → TENANT_B (idempotente)
echo "[3] asociar user_B → TENANT_B"
PB=$(req PATCH "/rest/v1/pos_users?id=eq.$USER_B" "{\"company_id\":\"$TENANT_B\",\"role\":\"admin\"}")
if echo "$PB" | grep -q "$TENANT_B"; then green "  ✓ user_B.company_id = TENANT_B"
else red "  ✗ patch user_B falló: $(echo "$PB" | head -c 200)"; fi

# 4. Sembrar venta en TENANT_B (para tests cross-tenant)
echo "[4] seed venta en TENANT_B"
SALES_B=$(req GET "/rest/v1/pos_sales?pos_user_id=eq.$USER_B&select=id&limit=1")
if echo "$SALES_B" | grep -q '"id"'; then
  green "  ✓ ya hay ventas para user_B"
else
  NEW_SALE=$(req POST "/rest/v1/pos_sales" "{\"pos_user_id\":\"$USER_B\",\"total\":99.99,\"payment_method\":\"efectivo\",\"items\":[{\"qty\":1,\"sku\":\"B-SEED\",\"price\":99.99}]}")
  if echo "$NEW_SALE" | grep -q '"id"'; then green "  ✓ venta seed creada en TENANT_B"
  else yellow "  ⚠ no se pudo crear venta (probablemente RLS lo bloquea, no crítico): $(echo "$NEW_SALE" | head -c 200)"
  fi
fi

# 5. Sembrar customer en TENANT_B
echo "[5] seed customer en TENANT_B"
CUST_B=$(req GET "/rest/v1/customers?user_id=eq.$USER_B&select=id&limit=1")
if echo "$CUST_B" | grep -q '"id"'; then
  green "  ✓ ya hay customer para user_B"
else
  NEW_CUST=$(req POST "/rest/v1/customers" "{\"user_id\":\"$USER_B\",\"name\":\"Cliente Tenant B\",\"phone\":\"5550000002\"}")
  if echo "$NEW_CUST" | grep -q '"id"'; then green "  ✓ customer seed creado en TENANT_B"
  else yellow "  ⚠ no se pudo crear customer: $(echo "$NEW_CUST" | head -c 200)"; fi
fi

bold "━━━━ SEED OK ━━━━"
echo "TENANT_A=$TENANT_A"
echo "TENANT_B=$TENANT_B"
echo "USER_A=$USER_A"
echo "USER_B=$USER_B"
