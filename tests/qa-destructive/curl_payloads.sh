#!/usr/bin/env bash
# QA DESTRUCTIVO - Payloads ejecutables curl
# Uso: BASE=https://volvix-pos.vercel.app bash curl_payloads.sh
# Cada bloque imprime [LABEL] HTTP_CODE → no debe haber 5xx.

set -u
BASE="${BASE:-https://volvix-pos.vercel.app}"
EMAIL="${EMAIL:-admin@volvix.test}"
PASS="${PASS:-Volvix2026!}"

echo "== Login =="
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',d.get('access_token','')))" 2>/dev/null)
echo "TOKEN_LEN=${#TOKEN}"
AUTH="Authorization: Bearer $TOKEN"

show() { local L=$1; shift; printf "[%s] " "$L"; "$@" -s -o /dev/null -w "%{http_code}\n"; }

# ── INPUTS EXTREMOS ──
echo "== Inputs extremos =="
HUGE=$(python -c "print('A'*100000)")
show huge-name curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"$HUGE\",\"price\":1}"

show emoji-rfc curl -X POST "$BASE/api/customers" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"X","rfc":"🔥🔥🔥","email":"a@a.test"}'

show null-bytes curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  --data-binary $'{"name":"X\x00Y","price":1}'

show rtl-override curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"admin‮gnp.exe","price":1}'

show path-traversal curl "$BASE/api/assets?path=../../../etc/passwd" -H "$AUTH"
show path-encoded curl "$BASE/api/assets?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd" -H "$AUTH"

show sqli-1 curl "$BASE/api/products?search=%27%20OR%201%3D1--" -H "$AUTH"
show sqli-2 curl "$BASE/api/products?search=%27%3B%20DROP%20TABLE%20users%3B--" -H "$AUTH"
show sqli-union curl "$BASE/api/products?search=%27%20UNION%20SELECT%20NULL--" -H "$AUTH"

show num-infinity curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"X","price":"Infinity"}'
show num-nan curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"X","price":"NaN"}'
show num-unsafe curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"X","price":9007199254740993}'

show neg-qty curl -X POST "$BASE/api/sales" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":1,"qty":-5,"price":10}],"total":-50}'

# Array gigante (10k items)
python -c "import json; print(json.dumps({'items':[{'product_id':1,'qty':1,'price':1} for _ in range(10000)],'total':10000}))" > /tmp/huge_array.json 2>/dev/null
show huge-array curl -X POST "$BASE/api/sales" -H "$AUTH" -H "Content-Type: application/json" \
  --data-binary @/tmp/huge_array.json

show malformed-json curl -X POST "$BASE/api/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"X","price":1'

# ── AUTH ATTACKS ──
echo "== Auth attacks =="
NONE_JWT=$(python -c "import base64,json; h=base64.urlsafe_b64encode(json.dumps({'alg':'none','typ':'JWT'}).encode()).rstrip(b'=').decode(); p=base64.urlsafe_b64encode(json.dumps({'sub':'1','role':'admin','exp':9999999999}).encode()).rstrip(b'=').decode(); print(h+'.'+p+'.')")
show jwt-none curl "$BASE/api/me" -H "Authorization: Bearer $NONE_JWT"

EXPIRED=$(python -c "import base64,json; h=base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=').decode(); p=base64.urlsafe_b64encode(json.dumps({'sub':'1','role':'admin','exp':1}).encode()).rstrip(b'=').decode(); print(h+'.'+p+'.aaaa')")
show jwt-expired curl "$BASE/api/me" -H "Authorization: Bearer $EXPIRED"

show jwt-tampered curl "$BASE/api/me" -H "Authorization: Bearer ${TOKEN}xxxx"

# Header injection
show header-inj curl "$BASE/api/me" -H "Authorization: Bearer fake\r\nX-Admin: true"

# Bruteforce (10 quick — el spec lleva 100)
echo "[bruteforce] 10 intentos:"
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"WRONG$i\"}")
  printf "%s " "$CODE"
done
echo ""

# ── RACE: stock 1, 5 ventas paralelas ──
echo "== Race condition: stock 1 ==
Crea producto manualmente o ajusta product_id antes de ejecutar."
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "[race-$i] %{http_code}\n" \
    -X POST "$BASE/api/sales" -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"items":[{"product_id":1,"qty":1,"price":10}],"total":10}' &
done
wait

echo "== FIN =="
