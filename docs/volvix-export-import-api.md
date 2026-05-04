# Volvix Export / Import / Customer Credit — API Contract

This module set (`volvix-export-import.js` + `volvix-customer-credit.js`) consumes the following
endpoints from `api/index.js`. All requests must carry `Authorization: Bearer <jwt>` and rely
on RLS (`tenant_id = auth.jwt().tenant_id`) for tenant isolation.

---

## 1. `GET /api/products`

Paginated product list.

**Query**
| param | type | default | notes |
|-------|------|---------|-------|
| `limit` | int | 100 | hard cap server-side, e.g. 1000 |
| `offset` | int | 0 | for cursor-less pagination |
| `search` | string | — | optional name/SKU substring |
| `category` | string | — | optional category filter |

**Response (any of)**
```json
{ "data": [ { ... } ], "total": 1234, "limit": 1000, "offset": 0 }
```
or a bare array `[ { ... } ]`. The client accepts both.

**Item shape**
```json
{
  "id": "uuid",
  "sku": "SKU-001",
  "barcode": "7501234567890",
  "name": "Producto X",
  "description": "...",
  "price": 99.50,
  "cost": 60.00,
  "stock": 12,
  "category": "Lácteos",
  "brand": "Marca Y",
  "tax_rate": 0.16,
  "created_at": "2026-01-15T10:00:00Z"
}
```

---

## 2. `POST /api/products/bulk`

Bulk insert / upsert products. Used by CSV import.

**Body**
```json
{
  "products": [
    {
      "sku": "SKU-001",
      "barcode": "7501...",
      "name": "Producto X",
      "description": "...",
      "price": 99.50,
      "cost": 60.00,
      "stock": 10,
      "category": "Lácteos",
      "brand": "Marca Y",
      "tax_rate": 0.16
    }
  ]
}
```

**Behavior**
- If `sku` exists for the tenant → update existing row (UPSERT on `(tenant_id, sku)`).
- If `sku` is null → insert as new product.
- Recommended batch size: 100 per request (client sends in batches of 100).

**Response**
```json
{
  "inserted": 87,
  "updated": 13,
  "errors": [
    { "row_index": 4, "sku": "BAD-1", "message": "price must be >= 0" }
  ]
}
```

---

## 3. `GET /api/customers`

Paginated customers list with autocomplete.

**Query**
| param | type | default | notes |
|-------|------|---------|-------|
| `limit` | int | 100 | |
| `offset` | int | 0 | |
| `search` | string | — | matches name OR phone OR email |

**Item shape**
```json
{
  "id": "uuid",
  "name": "Juan Pérez",
  "phone": "5512345678",
  "email": "juan@example.com",
  "credit_limit": 5000.00,
  "balance": 1234.50,
  "total_spent": 23456.78,
  "transaction_count": 42,
  "last_purchase_date": "2026-04-20",
  "created_at": "2025-09-01T10:00:00Z"
}
```

---

## 4. `GET /api/customers/:id`

Single customer fetch (used to preselect on payment modal).

Returns a single customer object with the same shape as above.

---

## 5. `POST /api/customers/:id/payments`

Register a credit payment (abono).

**Body**
```json
{
  "amount": 500.00,
  "method": "efectivo",
  "date": "2026-04-27",
  "notes": "Optional"
}
```

**Validation (server-side, recommended)**
- `amount > 0`
- `amount <= customer.balance` (the client also enforces this)
- `method` ∈ `{efectivo, tarjeta, transferencia, cheque}`
- Updates `customers.balance = balance - amount` atomically
- Inserts row in `customer_payments` with `balance_after`

**Response**
```json
{
  "id": "uuid",
  "customer_id": "uuid",
  "amount": 500.00,
  "method": "efectivo",
  "date": "2026-04-27",
  "notes": "Optional",
  "balance_after": 734.50,
  "created_at": "2026-04-27T15:30:00Z"
}
```

---

## 6. `GET /api/customers/:id/payments`

Paginated payment history per customer.

**Query**: `limit`, `offset`.

**Response**
```json
{
  "data": [
    {
      "id": "uuid",
      "date": "2026-04-27",
      "amount": 500.00,
      "method": "efectivo",
      "balance_after": 734.50,
      "notes": "...",
      "created_at": "2026-04-27T15:30:00Z"
    }
  ],
  "total": 12
}
```

---

## 7. `GET /api/inventory-movements`

Kardex movements (entradas, salidas, ajustes).

**Query**
| param | type | notes |
|-------|------|-------|
| `from` | YYYY-MM-DD | inclusive lower bound |
| `to` | YYYY-MM-DD | inclusive upper bound |
| `product` | string | SKU or product UUID |
| `type` | string | `entrada` / `salida` / `ajuste` |
| `limit` | int | |
| `offset` | int | |

**Item shape**
```json
{
  "id": "uuid",
  "date": "2026-04-27T10:00:00Z",
  "type": "salida",
  "product_id": "uuid",
  "product_name": "Producto X",
  "sku": "SKU-001",
  "quantity": -3,
  "stock_before": 12,
  "stock_after": 9,
  "user_id": "uuid",
  "user_name": "cajero1",
  "reason": "Venta",
  "sale_id": "uuid"
}
```

---

## 8. Reports endpoints (used by "Exportar todo")

The client iterates a fixed list and expects rows back. Each endpoint may accept
`from` / `to` query params:

| id | endpoint |
|----|----------|
| `sales` | `GET /api/reports/sales?from=&to=` |
| `top-products` | `GET /api/reports/top-products?from=&to=` |
| `top-customers` | `GET /api/reports/top-customers?from=&to=` |
| `profit` | `GET /api/reports/profit?from=&to=` |
| `by-cashier` | `GET /api/reports/by-cashier?from=&to=` |

Each may return `[ rows ]`, `{ data: [...] }`, `{ items: [...] }`, or `{ rows: [...] }`.
The client autodetects all four shapes.

---

## RLS Policies (verify these exist)

Each table needs at least:
```sql
-- products
CREATE POLICY "tenant_isolate_products" ON products
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- customers
CREATE POLICY "tenant_isolate_customers" ON customers
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- customer_payments
CREATE POLICY "tenant_isolate_customer_payments" ON customer_payments
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- inventory_movements
CREATE POLICY "tenant_isolate_inventory_movements" ON inventory_movements
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

Reports endpoints must filter by `tenant_id` on the server side (they don't return raw tables).

---

## Sample CSV format (products)

```csv
sku,barcode,name,description,price,cost,stock,category,brand,tax_rate
SKU-001,7501234567890,Coca Cola 600ml,Refresco,18.50,12.00,150,Bebidas,Coca-Cola,0.16
```

Required columns: `name`, `price`. All others optional.
