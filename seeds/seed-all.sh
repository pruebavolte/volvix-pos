#!/usr/bin/env bash
# ============================================================
# Volvix POS — seed-all (10 industry demo tenants)
# ============================================================
# Usage:
#   DATABASE_URL=postgres://... ./seeds/seed-all.sh
#   or with .env.production:
#   ./seeds/seed-all.sh
# ============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEEDS_DIR="$PROJECT_ROOT/seeds"
cd "$PROJECT_ROOT"

# Load env if present
set -a; . .env.production 2>/dev/null || true; set +a

# DATABASE_URL is required
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    DATABASE_URL="$SUPABASE_DB_URL"
  else
    echo "ERROR: DATABASE_URL not set. Export it or define it in .env.production"
    exit 1
  fi
fi

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

run_sql() {
  local file="$1"
  local label="$2"
  bold "[seed] $label"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" > /tmp/seed-log.txt 2>&1; then
    green "  ✓ $label"
  else
    red "  ✗ $label failed:"
    tail -n 30 /tmp/seed-log.txt
    exit 1
  fi
}

bold "════════════════════════════════════════════════════════"
bold "   Volvix POS — Seeding 10 industry demo tenants"
bold "════════════════════════════════════════════════════════"

START=$(date +%s)

# Phase 1: helpers + tenants + users
run_sql "$SEEDS_DIR/_shared/helpers.sql" "Shared helpers (functions)"
run_sql "$SEEDS_DIR/tenants-10-industries.sql" "10 tenants + 30 users"

# Phase 2: per-vertical product catalogs
for v in abarrotes panaderia farmacia restaurant cafe barberia gasolinera ropa electronica fitness; do
  run_sql "$SEEDS_DIR/tenant-$v/products.sql" "Products: $v"
done

# Phase 3: customers, sales, cuts, configs
run_sql "$SEEDS_DIR/customers-all.sql" "Customers (all tenants)"
run_sql "$SEEDS_DIR/sales-all.sql" "Sales history (last 30 days)"
run_sql "$SEEDS_DIR/cuts-and-inventory-all.sql" "Cash cuts + inventory + payments"
run_sql "$SEEDS_DIR/industry-configs-all.sql" "Industry-specific configs"

END=$(date +%s)
ELAPSED=$((END - START))

bold "════════════════════════════════════════════════════════"
green "   ✓ Seed complete in ${ELAPSED}s"
bold "════════════════════════════════════════════════════════"
echo ""
echo "Demo logins (password = Demo2026!):"
echo "  • demo-abarrotes@volvix.test"
echo "  • demo-panaderia@volvix.test"
echo "  • demo-farmacia@volvix.test"
echo "  • demo-restaurant@volvix.test"
echo "  • demo-cafe@volvix.test"
echo "  • demo-barberia@volvix.test"
echo "  • demo-gasolinera@volvix.test"
echo "  • demo-ropa@volvix.test"
echo "  • demo-electronica@volvix.test"
echo "  • demo-fitness@volvix.test"
