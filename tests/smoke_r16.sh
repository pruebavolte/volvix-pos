#!/bin/bash
# R16 Final Smoke Test - 20 endpoints
set +e
BASE="https://volvix-pos.vercel.app"
source .env.local 2>/dev/null
ADMIN_KEY=$(grep '^ADMIN_API_KEY' .env.local | cut -d'"' -f2)

# Helper: curl returns "STATUS LATENCY_MS BODY_FIRST_200"
hit() {
  local method="$1"; local path="$2"; local auth="$3"; local body="$4"
  local hdrs=()
  [ -n "$auth" ] && hdrs+=(-H "Authorization: Bearer $auth")
  [ -n "$body" ] && hdrs+=(-H "Content-Type: application/json" -d "$body")
  local out
  out=$(curl -s -o /tmp/r16_body.txt -w "%{http_code}|%{time_total}" -X "$method" "${hdrs[@]}" "$BASE$path")
  local code=${out%%|*}
  local lat=${out##*|}
  local lat_ms
  lat_ms=$(awk "BEGIN{printf \"%.0f\", $lat*1000}")
  echo "$code|$lat_ms"
}

# 3) Login first to get token
EMAIL="admin@volvix.test"
PASS="Volvix2026!"
LOGIN_BODY=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  "$BASE/api/login")
echo "LOGIN_RESPONSE: $LOGIN_BODY" | head -c 300
echo ""
TOKEN=$(echo "$LOGIN_BODY" | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('access_token') or d.get('jwt') or '')" 2>/dev/null)
echo "TOKEN_LEN: ${#TOKEN}"
echo "ADMIN_KEY_LEN: ${#ADMIN_KEY}"

# Use ADMIN_KEY as bearer fallback if no token
BEARER="${TOKEN:-$ADMIN_KEY}"

# Run all 20
declare -a results

run_test() {
  local n="$1"; local desc="$2"; local exp="$3"; local result="$4"
  local code=${result%%|*}; local lat=${result##*|}
  printf "%2d|%s|%s|%s|%s\n" "$n" "$desc" "$exp" "$code" "$lat"
}

# 1
r=$(hit GET "/api/health"); run_test 1 "/api/health" "200" "$r"
# 2
r=$(hit GET "/api/health/deep"); run_test 2 "/api/health/deep" "200" "$r"
# 3 login already done
r=$(hit POST "/api/login" "" "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"); run_test 3 "/api/login" "200" "$r"
# 4
r=$(hit GET "/api/products" "$BEARER"); run_test 4 "/api/products" "200" "$r"
# 5
r=$(hit GET "/api/customers" "$BEARER"); run_test 5 "/api/customers" "200" "$r"
# 6
r=$(hit GET "/api/sales/latest" "$BEARER"); run_test 6 "/api/sales/latest" "200" "$r"
# 7
r=$(hit GET "/api/sales/today" "$BEARER"); run_test 7 "/api/sales/today" "200" "$r"
# 8
r=$(hit GET "/api/cash/current" "$BEARER"); run_test 8 "/api/cash/current" "200|404" "$r"
# 9
r=$(hit GET "/api/owner/dashboard" "$BEARER"); run_test 9 "/api/owner/dashboard" "200" "$r"
# 10
r=$(hit GET "/api/openapi.yaml"); run_test 10 "/api/openapi.yaml" "200" "$r"
# 11
r=$(hit GET "/api/metrics" "$BEARER"); run_test 11 "/api/metrics" "200" "$r"
# 12
r=$(hit GET "/sitemap.xml"); run_test 12 "/sitemap.xml" "200" "$r"
# 13
r=$(hit GET "/robots.txt"); run_test 13 "/robots.txt" "200" "$r"
# 14
r=$(hit GET "/volvix-qa-scenarios.html"); run_test 14 "/volvix-qa-scenarios.html" "404" "$r"
# 15
r=$(hit GET "/api/products"); run_test 15 "/api/products NO_AUTH" "401" "$r"
# 16
r=$(hit GET "/api/debug"); run_test 16 "/api/debug" "404" "$r"
# 17
r=$(hit GET "/api/docs"); run_test 17 "/api/docs" "200" "$r"
# 18
r=$(hit POST "/api/sales" "$BEARER" '{"items":[{"product_id":"test","quantity":1,"price":10}],"payment_method":"cash","total":10}'); run_test 18 "POST /api/sales" "200|201" "$r"
# 19
r=$(hit GET "/api/inventory/stock" "$BEARER"); run_test 19 "/api/inventory/stock" "200" "$r"
# 20
r=$(hit GET "/api/billing/plans"); run_test 20 "/api/billing/plans" "200" "$r"
