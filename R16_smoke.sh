#!/bin/bash
# R16 Final Smoke Test
BASE="https://salvadorexoficial.com"
EMAIL="admin@volvix.test"
PASS="Volvix2026!"
OUT="C:/Users/DELL/Downloads/verion 340/R16_FINAL_SMOKE.md"

call() {
  local method="$1" path="$2" auth="$3" body="$4"
  local hdrs=()
  hdrs+=("-H" "Content-Type: application/json")
  [ -n "$auth" ] && hdrs+=("-H" "Authorization: Bearer $auth")
  local args=("-s" "-o" "/tmp/r16_body" "-w" "%{http_code}|%{time_total}" "-X" "$method" "${hdrs[@]}")
  [ -n "$body" ] && args+=("-d" "$body")
  args+=("$BASE$path")
  curl "${args[@]}"
}

# 1. health
R1=$(call GET /api/health)
# 2. deep
R2=$(call GET /api/health/deep)

# 4. login
LOGIN_RESP=$(curl -s -X POST "$BASE/api/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN_RESP" | python -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
R4_CODE=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X POST "$BASE/api/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

# 3. metrics admin
R3=$(call GET /api/metrics "$TOKEN")
# 5. products GET
R5=$(call GET /api/products "$TOKEN")
# 6. products POST
CREATE_BODY='{"name":"R16 Test Product","price":1.0,"sku":"R16TEST","stock":10}'
CREATE_RESP=$(curl -s -X POST "$BASE/api/products" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$CREATE_BODY")
PROD_ID=$(echo "$CREATE_RESP" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('id') or d.get('data',{}).get('id') or '')" 2>/dev/null)
R6_CODE=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X POST "$BASE/api/products" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$CREATE_BODY")

# 7. PATCH
if [ -n "$PROD_ID" ]; then
  R7=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X PATCH "$BASE/api/products/$PROD_ID" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"price":2.0}')
  R8=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X DELETE "$BASE/api/products/$PROD_ID" -H "Authorization: Bearer $TOKEN")
else
  R7="SKIP|0"
  R8="SKIP|0"
fi

# 9. customers
R9=$(call GET /api/customers "$TOKEN")
# 10. sales POST
SALES_BODY='{"items":[{"product_id":"any","quantity":1,"price":10}],"total":10,"payment":"cash"}'
R10=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X POST "$BASE/api/sales" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "$SALES_BODY")
# 11
R11=$(call GET /api/sales/latest "$TOKEN")
# 12
R12=$(call GET /api/sales/today "$TOKEN")
# 13 cash open
R13=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X POST "$BASE/api/cash/open" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"opening_amount":100}')
# 14
R14=$(call GET /api/cash/current "$TOKEN")
# 15 cash close
R15=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" -X POST "$BASE/api/cash/close" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"closing_amount":100}')
# 16
R16E=$(call GET /api/owner/dashboard "$TOKEN")
# 17
R17=$(call GET /api/openapi.yaml)
# 18
R18=$(call GET /sitemap.xml)
# 19
R19=$(call GET /robots.txt)
# 20 - should 404
R20=$(call GET /volvix-qa-scenarios.html)

echo "1=$R1"
echo "2=$R2"
echo "3=$R3"
echo "4=$R4_CODE"
echo "5=$R5"
echo "6=$R6_CODE PROD_ID=$PROD_ID"
echo "7=$R7"
echo "8=$R8"
echo "9=$R9"
echo "10=$R10"
echo "11=$R11"
echo "12=$R12"
echo "13=$R13"
echo "14=$R14"
echo "15=$R15"
echo "16=$R16E"
echo "17=$R17"
echo "18=$R18"
echo "19=$R19"
echo "20=$R20"
echo "TOKEN_LEN=${#TOKEN}"
