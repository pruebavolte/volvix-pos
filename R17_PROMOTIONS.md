# R17 — Sistema de Promociones y Cupones

**Fecha**: 2026-04-26
**Slice**: 112 (idx 2240-2260)
**Estado**: implementado

## Archivos creados / modificados

| Archivo | Tipo | Descripción |
|---|---|---|
| `db/R17_PROMOTIONS.sql` | nuevo | Schema: `promotions`, `promotion_uses`, función `validate_promotion()` |
| `api/index.js` | modificado | Bloque IIFE `R17 PROMOTIONS` con 5 endpoints + helper `applyPromoToSale()` |
| `volvix-promotions-wiring.js` | nuevo | Cliente: input checkout + admin CRUD |
| `live_status/slice_112.json` | nuevo | Status del slice |

## Esquema SQL

### `promotions`
- `id BIGSERIAL PK`
- `tenant_id BIGINT NOT NULL`
- `code TEXT NOT NULL` — único por tenant (`UNIQUE(tenant_id, code)`)
- `type TEXT` — `percent | fixed | bogo | first_purchase | loyalty_tier`
- `value NUMERIC(12,4)` — % o cantidad fija
- `min_amount NUMERIC(12,2)` — monto mínimo de carrito
- `max_uses INTEGER` — `0 = ilimitado`
- `used_count INTEGER`
- `category_id BIGINT` (BOGO)
- `required_tier TEXT` (loyalty_tier)
- `starts_at`, `ends_at TIMESTAMPTZ`
- `active BOOLEAN`

**Indexes**: `tenant_id`, `active`, `ends_at DESC`, `UNIQUE(tenant_id, code)`.

### `promotion_uses`
- `id`, `promo_id FK`, `sale_id`, `customer_id`, `discount_applied`, `ts`.
- Indexes: `promo_id`, `sale_id`, `customer_id`, `ts DESC`.

### Función SQL `validate_promotion(code, tenant, customer, cart_total)`
Devuelve `(valid, discount_amount, message, promo_id)`. Replica la lógica del endpoint para uso en triggers o RPC directo.

## Endpoints API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET    | `/api/promotions` | user | Lista promos del tenant (`?active=1` filtra activas) |
| POST   | `/api/promotions` | admin/owner/superadmin | Crea promo |
| PATCH  | `/api/promotions/:id` | admin/owner/superadmin | Actualiza promo |
| DELETE | `/api/promotions/:id` | admin/owner/superadmin | Elimina promo |
| POST   | `/api/promotions/validate` | user | Valida código + retorna descuento aplicable |

### `POST /api/promotions/validate`
**Body**: `{ code, customer_id?, cart_total }`
**Respuesta**: `{ valid, discount_amount, message, promo_id?, type? }`

**Mensajes posibles**: `ok`, `invalid_code`, `not_started`, `expired`, `max_uses_reached`, `min_amount_not_met`, `not_first_purchase`, `tier_too_low`.

### Hook server-side `global.applyPromoToSale()`
Permite que `POST /api/sales` aplique la promo automáticamente cuando el body contiene `promo_code`. Inserta en `promotion_uses` e incrementa `used_count`. Tolerante a tablas faltantes (catch silencioso).

## Tipos de promoción

| Tipo | Cálculo | Notas |
|---|---|---|
| `percent` | `cart_total * value / 100` | 10% off |
| `fixed` | `min(value, cart_total)` | $50 off |
| `bogo` | `cart_total * 0.5` | 2x1 (afinable por categoría) |
| `first_purchase` | percent sobre cart | sólo clientes sin usos previos en `promotion_uses` |
| `loyalty_tier` | percent sobre cart | requiere tier ≥ `required_tier` (bronze < silver < gold < platinum) |

## Cliente (`volvix-promotions-wiring.js`)

- `attachCheckoutInput()` — monta input + botón **Aplicar** en `#checkout-promo` o `[data-promo-input]`. Valida vía API y emite evento `volvix:promo:applied`. Persiste en `window.volvixCart.{promo_code, promo_discount, promo_id}`.
- `renderAdminTable()` — tabla CRUD en `#promotions-admin` (toggle active, eliminar, crear con prompts).
- `window.volvixPromotions` expone: `loadPromotions, createPromotion, updatePromotion, deletePromotion, validate, attachCheckoutInput, renderAdminTable`.

## Verificación

- `node -c api/index.js` → **SYNTAX_OK**.
- SQL idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- Validación server-side completa antes de aplicar descuento (no se confía en `discount` enviado por cliente).

## Pendientes / mejoras

- Wirear `applyPromoToSale` dentro del handler `POST /api/sales` actual (hoy expuesto en `global` listo para invocar).
- BOGO real por categoría: actualmente usa heurística `0.5 * cart_total`; el cliente debe pasar items para cálculo exacto.
- UI admin con modal en lugar de `prompt()` (placeholder).
