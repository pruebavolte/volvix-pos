# Volvix POS — Industry Demo Seeds

Comprehensive realistic demo data for **10 industry verticals**. Used for sales demos, marketing screenshots, E2E test fixtures, and as starter data for new tenants.

## Tenants Created

| # | Vertical    | Tenant Name                  | Owner Email                       | Currency |
|---|-------------|------------------------------|-----------------------------------|----------|
| 1 | abarrotes   | Abarrotes La Esquina         | demo-abarrotes@volvix.test        | MXN      |
| 2 | panaderia   | Panadería La Espiga Dorada   | demo-panaderia@volvix.test        | MXN      |
| 3 | farmacia    | Farmacia San Rafael          | demo-farmacia@volvix.test         | MXN      |
| 4 | restaurant  | Tacos El Buen Sabor          | demo-restaurant@volvix.test       | MXN      |
| 5 | cafe        | Café Central                 | demo-cafe@volvix.test             | MXN      |
| 6 | barberia    | Barbería Don Pepe            | demo-barberia@volvix.test         | MXN      |
| 7 | gasolinera  | Gasolinera Express 24/7      | demo-gasolinera@volvix.test       | MXN      |
| 8 | ropa        | Boutique Femenina Andrea     | demo-ropa@volvix.test             | MXN      |
| 9 | electronica | TecnoMundo                   | demo-electronica@volvix.test      | MXN      |
|10 | fitness     | FitZone Gym                  | demo-fitness@volvix.test          | MXN      |

**Password for all demo users:** `Demo2026!`

Each tenant has 1 owner + 2 cajeros (one POS-only, one POS+reports).

## What Gets Created (per tenant)

| Asset                 | Quantity |
|-----------------------|----------|
| Tenant record         | 1        |
| Users                 | 3 (owner + 2 cajeros) |
| Products              | 25-45 industry-specific |
| Customers             | 25-50 (10 with credit for abarrotes/farmacia) |
| Sales (last 30 days)  | 90-4500 (volume varies by industry) |
| Cash cuts             | 30 (1/day, with realistic discrepancies) |
| Inventory movements   | 13/tenant (entradas + ajustes) for retail tenants |
| Customer payments     | 24 (abarrotes + farmacia: 6 customers × 4 weekly abonos) |
| Industry config       | 1-3 JSON blobs (mesas, bombas, instructores, etc.) |

### Daily sales volume distribution (last 30 days)

| Industry    | Sales/day | Avg ticket | Peak hours    |
|-------------|-----------|------------|---------------|
| abarrotes   | 3-5       | $80        | 10, 18, 19    |
| panaderia   | 5-10      | $50        | 7-9, 17       |
| farmacia    | 4-8       | $120       | 10-11, 17-18  |
| restaurant  | 30-60     | $150       | 14-15, 20-21  |
| cafe        | 50-100    | $80        | 8-9, 15-16    |
| barberia    | 5-10      | $150       | 11-12, 17-19  |
| gasolinera  | 80-150    | $400       | 7-8, 17-20    |
| ropa        | 5-15      | $600       | 12-13, 17-19  |
| electronica | 1-3       | $5,000     | 12-13, 17-18  |
| fitness     | 5-15      | $400       | 6-7, 18-20    |

## How to seed (3 methods)

### Method 1 — Direct SQL (recommended, fastest, ~30s)

Requires `psql` and `DATABASE_URL` env var.

```bash
# Linux/macOS/WSL
DATABASE_URL=postgres://... ./seeds/seed-all.sh

# Windows PowerShell
$env:DATABASE_URL="postgres://..."
.\seeds\seed-all.ps1
```

### Method 2 — Per-file manual SQL

If you want fine control:

```bash
psql $DATABASE_URL -f seeds/_shared/helpers.sql
psql $DATABASE_URL -f seeds/tenants-10-industries.sql

# One per industry
for v in abarrotes panaderia farmacia restaurant cafe barberia gasolinera ropa electronica fitness; do
  psql $DATABASE_URL -f seeds/tenant-$v/products.sql
done

psql $DATABASE_URL -f seeds/customers-all.sql
psql $DATABASE_URL -f seeds/sales-all.sql
psql $DATABASE_URL -f seeds/cuts-and-inventory-all.sql
psql $DATABASE_URL -f seeds/industry-configs-all.sql
```

### Method 3 — Via API (slowest, no DB access needed)

Uses the production HTTP endpoints. Useful when you only have an admin login.

```bash
API_BASE=https://your-app.vercel.app \
SUPERADMIN_EMAIL=admin@volvix.test \
SUPERADMIN_PASSWORD=*** \
node seeds/seed-via-api.js
```

Takes ~3-5 minutes (HTTP round-trips for each insert).

## Verification queries

After seeding, run these to confirm:

```sql
-- 10 tenants
SELECT count(*) FROM pos_companies
 WHERE id::text LIKE '11111111-aaaa-aaaa-aaaa-%';

-- 30 users (3 per tenant)
SELECT count(*) FROM pos_users
 WHERE email LIKE 'demo-%@volvix.test'
    OR email LIKE 'cajero%-%@volvix.test';

-- Per-tenant product counts
SELECT c.name AS tenant, count(p.id) AS products
  FROM pos_companies c
  JOIN pos_users u ON u.company_id = c.id AND u.email LIKE 'demo-%@volvix.test'
  LEFT JOIN pos_products p ON p.pos_user_id = u.id
 WHERE c.id::text LIKE '11111111-aaaa-aaaa-aaaa-%'
 GROUP BY c.name
 ORDER BY c.name;

-- Per-tenant sales last 30 days
SELECT c.name AS tenant, count(s.id) AS sales, sum(s.total)::numeric(12,2) AS total
  FROM pos_companies c
  JOIN pos_users u ON u.company_id = c.id AND u.email LIKE 'demo-%@volvix.test'
  LEFT JOIN pos_sales s ON s.pos_user_id = u.id AND s.created_at >= now() - interval '30 days'
 WHERE c.id::text LIKE '11111111-aaaa-aaaa-aaaa-%'
 GROUP BY c.name
 ORDER BY c.name;

-- Customer counts per tenant
SELECT c.name AS tenant, count(cu.id) AS customers
  FROM pos_companies c
  JOIN pos_users u ON u.company_id = c.id AND u.email LIKE 'demo-%@volvix.test'
  LEFT JOIN customers cu ON cu.user_id = u.id
 WHERE c.id::text LIKE '11111111-aaaa-aaaa-aaaa-%'
 GROUP BY c.name
 ORDER BY c.name;
```

## Cleanup (reset demo environment)

```bash
psql $DATABASE_URL -f seeds/cleanup.sql
```

Or via PowerShell:
```powershell
psql $env:DATABASE_URL -f seeds\cleanup.sql
```

This deletes all 10 demo tenants and cascades:
- All sales, customers, products, cash cuts, inventory movements
- All demo users
- All `generic_blobs` industry configs

## How to add a new industry

1. Add a row to `seeds/tenants-10-industries.sql` (new UUID `11111111-aaaa-aaaa-aaaa-000000000011`)
2. Add 3 user rows (owner + 2 cajeros) with new UUID prefix `22222222-0011-...`
3. Create folder `seeds/tenant-{vertical}/products.sql` modeled on existing files
4. Add a row to the configs in `customers-all.sql`, `sales-all.sql`, `cuts-and-inventory-all.sql`
5. Add the new vertical to the loop in `seed-all.sh` and `seed-all.ps1`
6. Optionally add an industry-specific config blob in `industry-configs-all.sql`

## File index

```
seeds/
├── README.md                           ← this file
├── tenants-10-industries.sql           ← master tenants + users (REQUIRED FIRST)
├── _shared/helpers.sql                 ← seed_uuid, seed_ean13 helper functions
├── customers-all.sql                   ← all-tenant customers generator
├── sales-all.sql                       ← all-tenant sales generator (last 30 days)
├── cuts-and-inventory-all.sql          ← cash cuts + inventory + payments
├── industry-configs-all.sql            ← industry-specific configs (mesas/bombas/etc.)
├── cleanup.sql                         ← idempotent cleanup
├── seed-all.sh                         ← bash runner
├── seed-all.ps1                        ← PowerShell runner
├── seed-via-api.js                     ← Node.js HTTP API seeder (alt method)
├── tenant-abarrotes/products.sql       ← 40 productos
├── tenant-panaderia/products.sql       ← 30 productos
├── tenant-farmacia/products.sql        ← 45 productos
├── tenant-restaurant/products.sql      ← 35 productos
├── tenant-cafe/products.sql            ← 30 productos
├── tenant-barberia/products.sql        ← 25 servicios + productos
├── tenant-gasolinera/products.sql      ← 30 productos
├── tenant-ropa/products.sql            ← 40 productos con variantes
├── tenant-electronica/products.sql     ← 35 productos con specs
└── tenant-fitness/products.sql         ← 10 membresías + 20 productos
```

## Constraints satisfied

- ✅ Idempotent: re-running creates no duplicates (fixed UUIDs + ON CONFLICT DO UPDATE/NOTHING)
- ✅ Realistic Mexican names, addresses (CDMX, GDL, MTY, Puebla, Querétaro)
- ✅ Prices in MXN
- ✅ Phone numbers in +52 format
- ✅ Dates ISO 8601 with realistic distribution
- ✅ Performance: ~30s for direct SQL seed (well under 5min target)
- ✅ Does NOT modify api/index.js or any existing files
- ✅ No real sensitive data (all phones/emails are demo)
- ✅ Graceful: missing optional tables (pos_cash_cuts, etc.) skipped silently
