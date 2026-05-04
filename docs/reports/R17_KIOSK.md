# R17 — KIOSK MODE (Auto-servicio)

Fecha: 2026-04-26
Slice: 108 (idx 2160-2180)

## Alcance

Punto de auto-servicio para clientes finales. Sin login, sesión de corta duración
con JWT especial role=`kiosk` y scope limitado al POS (`pos.read`, `pos.order.create`).

## Entregables

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `volvix-kiosk.html` | Pantalla full-screen con catálogo grid 200x250, carrito derecha, pago tarjeta/efectivo, idle 60s, lector barcode, selector ES/EN. |
| 2 | `api/index.js` | Rutas nuevas: `POST /api/kiosk/session` (sin auth) y `POST /api/kiosk/orders` (Bearer kiosk-jwt). |
| 3 | `db/R17_KIOSK.sql` | Tablas `kiosk_devices` y `kiosk_orders` con RLS por tenant. |
| 4 | `R17_KIOSK.md` | Este reporte. |
| 5 | `live_status/slice_108.json` | Estado del slice (idx 2160-2180). |

## Endpoints

### POST /api/kiosk/session
- Sin auth previa. Rate-limit 30/min/IP.
- Body: `{ tenant_id, kiosk_id }`
- Valida `kiosk_devices` activo, actualiza `last_seen_at`.
- Devuelve JWT 1h con `role='kiosk'`, `scope=['pos.read','pos.order.create']`.

### POST /api/kiosk/orders
- Auth: `Authorization: Bearer <kiosk-jwt>`. Verifica role/scope.
- Rate-limit 60/min por (kiosk_id, IP).
- Body: `{ items:[...], amount, payment:'card'|'cash'|'wallet' }`.
- Inserta en `kiosk_orders` con `status='pending'` (cajero confirma).
- Fallback local si Supabase falla (no rompe el flujo del cliente).

## Schema

```
kiosk_devices(id, tenant_id, name, location, is_active, last_seen_at, created_at)
kiosk_orders (id, kiosk_id, tenant_id, items jsonb, status, amount, payment, ts,
              confirmed_by, confirmed_at)
```

RLS habilitado en ambas tablas, política por `app.tenant_id`.
Índice parcial `idx_kiosk_ord_pending` para colas rápidas del cajero.

## Frontend (volvix-kiosk.html)

- CSS `overflow:hidden` + Fullscreen API en botón ⛶.
- Grid `repeat(auto-fill,200px)` con tarjetas 200x250 touch-friendly.
- Carrito siempre visible a la derecha (380px). Subtotal + IVA 16% + total.
- Idle timer 60s resetea carrito y cierra modales.
- Lector de barcode: input con re-focus cada 1.5s; `Enter` agrega al carrito por id/code.
- Selector idioma ES/EN con `localStorage` y diccionario `I18N`.
- Pago: tarjeta envía orden inmediata; efectivo encola y notifica al cajero.

## Apertura URL

`/volvix-kiosk.html?tenant=1&kiosk=3`

## Tests sugeridos

- Crear `kiosk_devices` con `is_active=true`, abrir kiosk, agregar 3 productos, pagar tarjeta → orden `pending`.
- Idle 60s → carrito vacío.
- Barcode wedge → producto agregado.
- JWT expirado → 401 en `/api/kiosk/orders`.
