# R14 — Programa de Lealtad Volvix POS

Sistema de fidelización con puntos, tiers configurables, devengo automático
en cada venta y canjes en checkout.

## 1. Componentes

| Capa | Archivo | Descripción |
|------|---------|-------------|
| SQL  | `db/R14_LOYALTY.sql` | Tablas, función y trigger |
| API  | `api/index.js` (`handleLoyalty`) | Endpoints REST |
| UI   | `public/volvix-loyalty-real-wiring.js` | Modal, botón canjear, historial |

## 2. Modelo de datos

### `loyalty_tiers`
| col | tipo | nota |
|-----|------|------|
| id | uuid PK | |
| tenant_id | uuid FK volvix_tenants | |
| name | text | único por tenant |
| min_points | integer | umbral de pertenencia |
| multiplier | numeric(5,2) | multiplica puntos al devengar |
| perks | jsonb | lista libre de beneficios |

### `loyalty_transactions`
| col | tipo |
|-----|------|
| id | uuid PK |
| tenant_id | uuid |
| customer_id | uuid FK customers |
| sale_id | uuid (sin FK dura — referencia a `volvix_ventas.id`) |
| type | `earn` \| `redeem` \| `expire` \| `adjust` |
| points | integer (negativo en redeem/expire/adjust−) |
| balance_after | integer |
| notes | text |
| ts | timestamptz |

### `customers` (extensión)
- `loyalty_points integer default 0`
- `current_tier_id uuid → loyalty_tiers(id)`
- `last_visit_at timestamptz`

### Función SQL
```sql
recompute_customer_points(p_customer uuid) returns integer
```
Suma todas las transacciones del cliente, asigna el tier correcto
(el de mayor `min_points` que su saldo cubre) y actualiza
`customers.loyalty_points` + `current_tier_id`. Devuelve el nuevo saldo.

### Trigger `after_sale_insert`
Sobre `volvix_ventas`. Cuando una venta se inserta con `customer_id`:

1. Lee `multiplier` del tier vigente del cliente (default `1.00`).
2. `puntos = floor(total × multiplier)`.
3. Inserta una transacción `earn` con el saldo nuevo.
4. Actualiza `customers.last_visit_at` y dispara `recompute_customer_points`
   para promover de tier si aplica.

> El trigger **agrega automáticamente la columna `customer_id` a `volvix_ventas`**
> si no existe (idempotente).

## 3. API REST

Base: misma que server.js (`http://localhost:3000` en dev).

### `GET /api/loyalty/customers/:id`
```json
{
  "customer": { "id": "...", "nombre": "Ana", "loyalty_points": 320,
                "tier": { "name": "Silver", "multiplier": 1.25, "perks": [...] } },
  "balance": 320,
  "history": [
    { "type": "earn",   "points":  50, "balance_after": 320, "ts": "..." },
    { "type": "redeem", "points": -20, "balance_after": 270, "ts": "..." }
  ]
}
```

### `POST /api/loyalty/redeem`
```json
// req
{ "customer_id": "uuid", "sale_id": "uuid", "points": 100, "notes": "opt" }
// res
{ "ok": true, "redeemed": 100, "balance": 220 }
```
Errores: `404 customer_not_found`, `400 insufficient_points`.

### `GET /api/loyalty/tiers?tenant_id=…`
Lista ordenada por `min_points` asc.

### `POST /api/loyalty/tiers`
```json
{ "tenant_id": "uuid", "name": "Gold", "min_points": 1500,
  "multiplier": 1.5, "perks": ["10% off mensual"] }
```

### `POST /api/loyalty/adjust`  (admin)
Header obligatorio: `x-admin-key: $ADMIN_API_KEY`.
```json
{ "customer_id": "uuid", "points": -50, "notes": "Corrección manual" }
```
`points` puede ser positivo o negativo (≠ 0).

## 4. Wiring del front

### Carga
```html
<script src="/volvix-loyalty-real-wiring.js"></script>
```
Expone `window.VolvixLoyalty`.

### Modal de cliente en POS
```html
<button data-loyalty-customer="UUID-del-cliente">Ver lealtad</button>
```
o programáticamente:
```js
VolvixLoyalty.openModal(customerId);
```
Muestra:
> **Cliente: 320 pts (Silver)**
> · 5% extra puntos · Promos exclusivas

### Botón "Canjear" en checkout
```html
<div data-loyalty-redeem="UUID-cliente" data-sale-id="UUID-venta"></div>
```
o:
```js
VolvixLoyalty.attachRedeemButton({
  container, saleId, customerId,
  onRedeemed: r => actualizarTotal(r.balance)
});
```

### Vista historial en pantalla de cliente
```html
<div data-loyalty-history="UUID-cliente"></div>
```
o:
```js
VolvixLoyalty.renderHistory(elemento, customerId);
```

## 5. Despliegue

1. Ejecutar `db/R14_LOYALTY.sql` en Supabase SQL Editor.
2. En `server.js` montar el handler antes del 404 final:
   ```js
   const loyalty = require('./api');
   if (await loyalty.handleLoyalty(req, res, method, pathname, parsed)) return;
   ```
3. Servir `volvix-loyalty-real-wiring.js` desde `/public` (ya estático).
4. Configurar `ADMIN_API_KEY` para habilitar `/adjust`.

## 6. Tiers seed

El SQL inserta para el tenant **Demo Volvix**:

| Tier     | min_points | multiplier | perks |
|----------|-----------:|-----------:|-------|
| Bronze   |          0 |       1.00 | Acumula puntos |
| Silver   |        500 |       1.25 | 5% extra + promos |
| Gold     |       1500 |       1.50 | 10% off mensual + soporte |
| Platinum |       5000 |       2.00 | 20% off + regalo cumpleaños + VIP |

## 7. Casos borde

- Venta sin `customer_id` → trigger no devenga.
- Cliente sin tier → multiplier = 1.00.
- `redeem` con saldo insuficiente → 400 sin alterar nada.
- `adjust` requiere `ADMIN_API_KEY` configurado en env.
- `recompute_customer_points` es seguro de re-ejecutar (idempotente).
