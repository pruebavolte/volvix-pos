#!/usr/bin/env bash
# R13_TEST_USERS_INSERT.sh
# Inserta (upsert) los 3 usuarios de prueba en Supabase via REST API.
# Compatible con Git Bash en Windows.
#
# Uso:
#   export SUPABASE_SERVICE_KEY="eyJ..."
#   bash R13_TEST_USERS_INSERT.sh

set -u

SUPABASE_URL="https://zhvwmzkcqngcaqpdxtwr.supabase.co"
TABLE="users"   # ajustar si el nombre real difiere

# ---------- 1. Verificar env var ----------
if [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
  echo "ERROR: la variable de entorno SUPABASE_SERVICE_KEY no esta definida." >&2
  echo "Exporta la service_role key antes de ejecutar el script:" >&2
  echo '  export SUPABASE_SERVICE_KEY="eyJ..."' >&2
  exit 1
fi

# ---------- 2. Verificar dependencias ----------
for bin in curl python; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: '$bin' no encontrado en PATH." >&2
    exit 1
  fi
done

# ---------- 3. Hashear passwords con bcrypt (via python) ----------
hash_password() {
  local plain="$1"
  python - "$plain" <<'PY'
import sys
try:
    import bcrypt
except ImportError:
    sys.stderr.write("ERROR: falta el paquete 'bcrypt'. Instala con: pip install bcrypt\n")
    sys.exit(2)
plain = sys.argv[1].encode()
print(bcrypt.hashpw(plain, bcrypt.gensalt(rounds=12)).decode())
PY
}

# Password se lee desde env var TEST_USER_PASSWORD. Sin default.
PLAIN_PASSWORD="${TEST_USER_PASSWORD:-}"
if [ -z "$PLAIN_PASSWORD" ]; then
  echo "ERROR: la variable TEST_USER_PASSWORD no esta definida." >&2
  echo "Exporta la password de los usuarios de prueba antes de ejecutar:" >&2
  echo '  export TEST_USER_PASSWORD="..."' >&2
  exit 1
fi
echo ">> Hasheando password con bcrypt (rounds=12)..."
HASHED=$(hash_password "$PLAIN_PASSWORD")
if [ -z "$HASHED" ]; then
  echo "ERROR: no se pudo generar el hash bcrypt." >&2
  exit 2
fi
echo "   hash listo: ${HASHED:0:20}..."

# ---------- 4. Construir payload JSON ----------
read -r -d '' PAYLOAD <<JSON || true
[
  {
    "email": "admin@volvix.test",
    "password_hash": "${HASHED}",
    "role": "admin",
    "tenant_id": null
  },
  {
    "email": "owner@volvix.test",
    "password_hash": "${HASHED}",
    "role": "owner",
    "tenant_id": "tenant-farmacia-001"
  },
  {
    "email": "cajero@volvix.test",
    "password_hash": "${HASHED}",
    "role": "cajero",
    "tenant_id": "tenant-farmacia-001"
  }
]
JSON

# ---------- 5. UPSERT via PostgREST (on_conflict=email, merge-duplicates) ----------
echo ""
echo ">> Haciendo UPSERT de 3 usuarios en /rest/v1/${TABLE}..."
HTTP_CODE=$(curl -sS -o /tmp/r13_upsert_resp.json -w "%{http_code}" \
  -X POST "${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=email" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d "${PAYLOAD}")

echo "   HTTP ${HTTP_CODE}"
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "ERROR: upsert fallo. Respuesta:" >&2
  cat /tmp/r13_upsert_resp.json >&2
  echo "" >&2
  exit 3
fi

# ---------- 6. Verificar con SELECT ----------
echo ""
echo ">> Verificando con SELECT..."
SELECT_HTTP=$(curl -sS -o /tmp/r13_select_resp.json -w "%{http_code}" \
  -X GET "${SUPABASE_URL}/rest/v1/${TABLE}?select=email,role,tenant_id&email=in.(admin@volvix.test,owner@volvix.test,cajero@volvix.test)" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}")

echo "   HTTP ${SELECT_HTTP}"
if [ "$SELECT_HTTP" != "200" ]; then
  echo "ERROR: select fallo. Respuesta:" >&2
  cat /tmp/r13_select_resp.json >&2
  echo "" >&2
  exit 4
fi

# ---------- 7. Resumen ----------
echo ""
echo "=========================================="
echo " RESUMEN R13 - Usuarios de prueba"
echo "=========================================="
python - <<PY
import json
with open("/tmp/r13_select_resp.json", encoding="utf-8") as f:
    rows = json.load(f)
print(f"Total filas encontradas: {len(rows)}")
for r in rows:
    email    = r.get("email", "?")
    role     = r.get("role", "?")
    tenant   = r.get("tenant_id") or "(sin tenant)"
    print(f"  - {email:25s} role={role:7s} tenant={tenant}")
PY

echo ""
echo "OK. Upsert completado y verificado."
echo "Password en claro: ${PLAIN_PASSWORD}"
echo "(El hash bcrypt se almaceno en la columna password_hash)"
