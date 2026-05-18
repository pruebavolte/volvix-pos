#!/usr/bin/env bash
# ============================================================================
# Volvix POS — run-all.sh
# Runs every migration against $DATABASE_URL in order. Stops on first error.
# Usage:
#   export DATABASE_URL='postgresql://user:pwd@host:5432/db?sslmode=require'
#   ./migrations/run-all.sh
# ============================================================================
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Get it from Supabase → Project Settings → Database → Connection string." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is not installed or not on PATH." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILES=(
  "feature-flags.sql"
  "cuts.sql"
  "inventory-movements.sql"
  "customer-payments.sql"
  "users-tenant.sql"
  "owner-saas.sql"
  "r1-pos-core-hardening.sql"
  "r2-mv-sales-daily.sql"
  "r3a-devoluciones-hardening.sql"
  "r3b-promociones-priority.sql"
  "r4a-inventario-hardening.sql"
  "r4b-customers-hardening.sql"
  "r4c-cortes-hardening.sql"
  "r5a-kds-hardening.sql"
)

echo "=================================================================="
echo "Volvix POS migrations — running ${#FILES[@]} files"
echo "Database: ${DATABASE_URL%%@*}@***"
echo "=================================================================="

for f in "${FILES[@]}"; do
  PATH_TO_FILE="${SCRIPT_DIR}/${f}"
  if [[ ! -f "$PATH_TO_FILE" ]]; then
    echo "ERROR: missing file ${PATH_TO_FILE}" >&2
    exit 1
  fi
  echo ""
  echo ">>> Applying ${f} ..."
  psql "$DATABASE_URL" \
       --set ON_ERROR_STOP=on \
       --single-transaction \
       -v ON_ERROR_STOP=1 \
       -f "$PATH_TO_FILE"
  echo "    OK: ${f}"
done

echo ""
echo "=================================================================="
echo "All migrations applied successfully."
echo "=================================================================="
