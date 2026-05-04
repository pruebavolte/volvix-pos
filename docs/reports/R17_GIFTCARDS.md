# R17 — Gift Cards / Vales prepagados

## Objetivo
Sistema completo de gift cards (vales prepagados) con código único formato
`VLX-XXXX-XXXX-XXXX`, balance descontable, expiración, cancelación administrativa
e integración con el flujo de checkout del POS.

## Esquema (db/R17_GIFTCARDS.sql)

### `gift_cards`
| col | tipo | notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| tenant_id | text | default `TNT001` |
| code | text UNIQUE | formato `VLX-XXXX-XXXX-XXXX` |
| initial_amount | numeric(14,2) | `>= 0` |
| current_balance | numeric(14,2) | `>= 0` |
| currency | text | default `mxn` |
| status | text | `active` / `redeemed` / `expired` / `canceled` |
| expires_at | timestamptz | nullable |
| sold_to_customer_id | uuid | nullable |
| sold_in_sale_id | uuid | nullable, para trazabilidad |
| created_at | timestamptz | default `now()` |

### `gift_card_uses`
- `id`, `gift_card_id` (FK cascade), `sale_id`, `amount_used (>0)`, `used_at`.
- FK opcional a `volvix_ventas` si la tabla existe.

### Generador de código
- Función SQL `public.gift_card_generate_code()` produce `VLX-XXXX-XXXX-XXXX`
  con alfabeto sin caracteres ambiguos (sin `0/O/1/I`) y reintenta hasta 12
  veces si choca con `code` existente.
- El backend también genera el código en JS (`_gcGenCode`) por consistencia.

### RLS
- `gift_cards` y `gift_card_uses`: lectura `authenticated`, escritura
  `service_role` (backend ejecuta todas las mutaciones).

## API (api/index.js, IIFE R17)

| método+ruta | auth | acción |
|---|---|---|
| `POST /api/gift-cards` | admin/owner | crea card, devuelve `{gift_card, qr}` (201) |
| `GET /api/gift-cards/:code` | público | status + balance (verificación QR) |
| `POST /api/gift-cards/:code/redeem` | auth | descuenta `amount`, registra `gift_card_uses` |
| `GET /api/gift-cards?customer_id=` | auth | listado, filtro por cliente |
| `PATCH /api/gift-cards/:id` | admin/owner | `action: 'cancel' \| 'extend'` |

### Reglas de redención
- Status debe ser `active`.
- Si `expires_at < now()` se marca `expired` y se rechaza (409).
- `amount > current_balance` → 422 `insufficient_balance`.
- Cuando `current_balance` llega a 0 → status pasa a `redeemed`.

### QR
La respuesta `qr` incluye una URL pública generadora de imagen PNG
(`api.qrserver.com`) con el `code` como contenido — el front lo embebe
directo en `<img>`.

## Integración POS checkout
Helper `globalThis.__gcValidateForCheckout(code, amount)` para que el flujo
de checkout valide `payment_method='gift_card'` antes de completar la venta:
- valida código existente, status `active`, no expirado, balance suficiente;
- el descuento real se aplica con `POST /api/gift-cards/:code/redeem`
  pasando `sale_id` cuando la venta queda confirmada.

## Errores del bus de errores
`validation_failed`, `not_found`, `forbidden`, `conflict`, `expired`,
`insufficient_balance`, `invalid_action`, `create_failed`.

## Validación
`node --check api/index.js` → OK (sin salida).
