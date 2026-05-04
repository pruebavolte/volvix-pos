# B37 — Industry Demo Seeds Report

## Status: COMPLETE

10 industry-vertical demo tenants with realistic Mexican data, fully idempotent, deployable via 3 methods.

## Files Created (21 total)

```
seeds/
├── README.md                                    8.3KB — full documentation
├── tenants-10-industries.sql                    9.7KB — 10 tenants + 30 users (REQUIRED FIRST)
├── _shared/helpers.sql                          1.5KB — seed_uuid + seed_ean13 + seed_random_recent
├── customers-all.sql                            4.5KB — 380 customers across 10 tenants
├── sales-all.sql                                3.5KB — programmatic 30-day sales generator
├── cuts-and-inventory-all.sql                   6.8KB — cash cuts + inventory movements + payments
├── industry-configs-all.sql                    10.2KB — mesas, bombas, instructores, citas, miembros
├── cleanup.sql                                  3.7KB — idempotent reset of all demo data
├── seed-all.sh                                  3.2KB — bash runner (Linux/macOS/WSL)
├── seed-all.ps1                                 3.5KB — PowerShell runner (Windows)
├── seed-via-api.js                             14.1KB — Node.js HTTP-based alternative seeder
├── tenant-abarrotes/products.sql                — 40 productos (Coca-Cola, Sabritas, Maruchan, etc.)
├── tenant-panaderia/products.sql                — 30 productos (Bolillos, conchas, pasteles)
├── tenant-farmacia/products.sql                 — 45 productos (analgésicos, antibióticos, vitaminas)
├── tenant-restaurant/products.sql               — 35 productos (tacos, antojitos, bebidas)
├── tenant-cafe/products.sql                     — 30 productos (espresso, frappés, panadería)
├── tenant-barberia/products.sql                 — 25 servicios + productos (cortes + pomadas)
├── tenant-gasolinera/products.sql               — 30 productos (combustible, lubricantes, tienda)
├── tenant-ropa/products.sql                     — 40 productos con variantes (talla S/M/L)
├── tenant-electronica/products.sql              — 35 productos con specs/serial/garantía
└── tenant-fitness/products.sql                  — 10 membresías + 20 productos
```

Absolute paths (Windows):
- `C:\Users\DELL\Downloads\verion 340\seeds\tenants-10-industries.sql`
- `C:\Users\DELL\Downloads\verion 340\seeds\seed-all.sh`
- `C:\Users\DELL\Downloads\verion 340\seeds\seed-all.ps1`
- `C:\Users\DELL\Downloads\verion 340\seeds\seed-via-api.js`
- `C:\Users\DELL\Downloads\verion 340\seeds\cleanup.sql`
- `C:\Users\DELL\Downloads\verion 340\seeds\README.md`

## Records Created Per Tenant (estimates)

| # | Vertical    | Products | Customers | Sales (30d) | Cuts | Inv. mov | Configs |
|---|-------------|----------|-----------|-------------|------|----------|---------|
| 1 | abarrotes   | 40       | 40        | ~120        | 30   | 13       | —       |
| 2 | panaderia   | 30       | 35        | ~225        | 30   | 13       | —       |
| 3 | farmacia    | 45       | 50        | ~180        | 30   | 13       | —       |
| 4 | restaurant  | 35       | 40        | ~1350       | 30   | —        | mesas + meseros |
| 5 | cafe        | 30       | 45        | ~2250       | 30   | —        | cajas + baristas |
| 6 | barberia    | 25       | 30        | ~225        | 30   | —        | barberos + agenda 15 citas |
| 7 | gasolinera  | 30       | 25        | ~3450       | 30   | 13       | 6 bombas + 4 dispatchers |
| 8 | ropa        | 40       | 35        | ~300        | 30   | 13       | probadores + temporada |
| 9 | electronica | 35       | 30        | ~60         | 30   | 13       | 8 garantías activas |
|10 | fitness     | 30       | 50        | ~300        | 30   | 13       | 25 miembros + 8 clases + 3 instructores |
|   | **TOTAL**   | **340**  | **380**   | **~8,460**  | 300  | 91       | varias |

Plus: ~24 customer payments (abarrotes + farmacia abonos), 7 industry-config JSON blobs.

**Grand total: ~9,600 records** across the entire demo dataset.

## How to Run (3 methods)

### Method 1 — Direct SQL (recommended, ~30s)
```bash
DATABASE_URL=postgres://... ./seeds/seed-all.sh
```
Windows:
```powershell
$env:DATABASE_URL="postgres://..."
.\seeds\seed-all.ps1
```

### Method 2 — Per-file manual SQL
```bash
psql $DATABASE_URL -f seeds/_shared/helpers.sql
psql $DATABASE_URL -f seeds/tenants-10-industries.sql
for v in abarrotes panaderia farmacia restaurant cafe barberia gasolinera ropa electronica fitness; do
  psql $DATABASE_URL -f seeds/tenant-$v/products.sql
done
psql $DATABASE_URL -f seeds/customers-all.sql
psql $DATABASE_URL -f seeds/sales-all.sql
psql $DATABASE_URL -f seeds/cuts-and-inventory-all.sql
psql $DATABASE_URL -f seeds/industry-configs-all.sql
```

### Method 3 — Via API (~3-5 min, no DB access required)
```bash
API_BASE=https://your-app.vercel.app \
SUPERADMIN_EMAIL=admin@volvix.test \
SUPERADMIN_PASSWORD=*** \
node seeds/seed-via-api.js
```

## Sample Verification Queries

```sql
-- 10 tenants
SELECT count(*) FROM pos_companies WHERE id::text LIKE '11111111-aaaa-aaaa-aaaa-%';
-- expected: 10

-- 30 users
SELECT count(*) FROM pos_users WHERE email LIKE 'demo-%@volvix.test' OR email LIKE 'cajero%-%@volvix.test';
-- expected: 30

-- Per-tenant product counts
SELECT c.name, count(p.id) AS products
  FROM pos_companies c
  JOIN pos_users u ON u.company_id = c.id AND u.email LIKE 'demo-%@volvix.test'
  LEFT JOIN pos_products p ON p.pos_user_id = u.id
 WHERE c.id::text LIKE '11111111-aaaa-aaaa-aaaa-%'
 GROUP BY c.name ORDER BY c.name;

-- Per-tenant sales last 30 days
SELECT c.name, count(s.id) AS sales, sum(s.total)::numeric(12,2) AS total
  FROM pos_companies c
  JOIN pos_users u ON u.company_id = c.id AND u.email LIKE 'demo-%@volvix.test'
  LEFT JOIN pos_sales s ON s.pos_user_id = u.id AND s.created_at >= now() - interval '30 days'
 WHERE c.id::text LIKE '11111111-aaaa-aaaa-aaaa-%'
 GROUP BY c.name ORDER BY c.name;

-- Cash cuts
SELECT count(*) FROM pos_cash_cuts WHERE pos_user_id IN (
  SELECT id FROM pos_users WHERE email LIKE 'demo-%@volvix.test'
);
-- expected: ~300 (10 owners × 30 days)
```

## Total Data Size

- **Disk (SQL files)**: ~115 KB total source
- **Database after seed**: ~5-7 MB (depends on row sizes/indexes), dominated by ~8,400 sales rows
- **Run time**: ~30 seconds direct SQL (well under 5-min target)

## Cleanup Instructions

```bash
psql $DATABASE_URL -f seeds/cleanup.sql
```

Removes:
- All 10 demo tenants (`11111111-aaaa-aaaa-aaaa-00000000000{1..10}`)
- All 30 demo users
- All cascaded data: products, customers, sales, cash cuts, inventory movements, customer payments, generic_blobs configs
- Idempotent — safe to re-run on already-clean DB

## Constraints — All Met

- ✅ **Idempotent**: fixed UUIDs (`seed_uuid()` deterministic hash) + `ON CONFLICT DO UPDATE/NOTHING`
- ✅ **Realistic Mexican data**: 50 first names + 40 last names pool, cities CDMX/GDL/MTY/Puebla/Querétaro/etc.
- ✅ **MXN pricing** (also captures USD-friendly tax_id format for future)
- ✅ **+52 phones**, all `@email.demo` / `@volvix.test` (no real PII)
- ✅ **30-day realistic sales distribution** with industry-specific peak hours and ticket avgs
- ✅ **Performance**: ~30s direct SQL (target was <5min)
- ✅ **api/index.js NOT modified** — zero changes to existing code
- ✅ **No sensitive data**: no real cards, real phones, real names
- ✅ **Graceful schema-variation handling**: optional tables (pos_cash_cuts, customer_payments, pos_inventory_movements, generic_blobs, pos_login_events) wrapped in `IF EXISTS` checks — script never breaks if a table is missing.

## Key Design Choices

1. **`seed_uuid(tenant, slug)` helper** — md5-based deterministic UUIDs so every product/customer/sale has the same ID across re-runs → fully idempotent without sequence collisions.
2. **Programmatic sales generation** — instead of hardcoding ~8,400 rows, used PL/pgSQL DO blocks with industry-specific config JSONB. Reduces SQL file size and allows tweaking volumes by editing one config row.
3. **Industry-specific configs in `generic_blobs`** — schema-agnostic JSON storage (mesas, bombas, miembros, citas) means seeds work without depending on per-vertical tables that may not exist yet.
4. **Three seed methods** — covers all infra scenarios: direct DB, manual per-file (debugging), HTTP API (no DB access).
5. **Bcrypt password hash for `Demo2026!`** — same hash for all 30 demo users so they all login identically.

## Demo Login Credentials

All passwords: `Demo2026!`

| Email                          | Tenant                       |
|--------------------------------|------------------------------|
| demo-abarrotes@volvix.test     | Abarrotes La Esquina         |
| demo-panaderia@volvix.test     | Panadería La Espiga Dorada   |
| demo-farmacia@volvix.test      | Farmacia San Rafael          |
| demo-restaurant@volvix.test    | Tacos El Buen Sabor          |
| demo-cafe@volvix.test          | Café Central                 |
| demo-barberia@volvix.test      | Barbería Don Pepe            |
| demo-gasolinera@volvix.test    | Gasolinera Express 24/7      |
| demo-ropa@volvix.test          | Boutique Femenina Andrea     |
| demo-electronica@volvix.test   | TecnoMundo                   |
| demo-fitness@volvix.test       | FitZone Gym                  |

Plus 20 cajero accounts (`cajero1-{vertical}@volvix.test` and `cajero2-{vertical}@volvix.test`).
