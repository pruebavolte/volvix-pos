# R17 — QR Payments (CoDi / SPEI / PIX) — slice 109

## Resumen
Slice 109 agrega pagos por código QR (CoDi mexicano, SPEI mock, PIX brasileño)
con generación de string compliant, render SVG inline y polling de estado.
Modo mock activo cuando falta `BBVA_API_KEY`.

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST   | `/api/qr/codi/generate` | sí | Genera string CoDi + QR SVG base64. Body `{amount, sale_id?, concept?}`. |
| POST   | `/api/qr/spei/generate` | sí | Genera CLABE 18 dígitos + QR SVG. Body `{amount, sale_id?}`. |
| GET    | `/api/qr/payments/:id/status` | no | Polling. Devuelve `pending`/`paid`/`expired`. |

### Mock probabilístico (status)
- 60% se mantiene `pending`
- 30% transiciona a `paid` con `paid_at`
- 10% transiciona a `expired`
- Si `expires_at < now`, fuerza `expired` independientemente.

### Formato CoDi
`CODI://pay?ref=<16hex>&amount=<n.nn>&sale=<uuid>&concept=<urlenc>`

## Cliente — `volvix-qr-payments.js`
```js
Volvix.qrPayments.show(saleId, amount);          // CoDi por defecto
Volvix.qrPayments.show(saleId, amount, 'spei');  // SPEI
```
Modal full-screen con QR, polling cada 3 s, auto-cierre 1.2 s tras `paid`.
Emite evento `qr:paid` vía `Volvix.events`.

## Persistencia
Tabla `qr_payments` (ver `db/R17_QR_PAYMENTS.sql`):
`id, sale_id, type, amount, qr_data, status, expires_at, paid_at, tenant_id, provider, created_at`.

RLS habilitada — tenant aislado por `auth.jwt() ->> 'tenant_id'`,
bypass para roles `superadmin`/`admin`. Índices en `(tenant_id,status,created_at)`,
`sale_id` y filtrado `expires_at WHERE status='pending'`.

## Variables de entorno
- `BBVA_API_KEY` — opcional. Sin ella el provider es `mock` y devuelve UUID falso.

## TTL
QR expira a 15 min (`QR_TTL_SECONDS = 900`). El endpoint de status auto-marca
`expired` cuando se rebasa.

## Fallback
Si Supabase falla en INSERT/PATCH, los registros se almacenan en
`global.__qrPaymentsMem` (Map en memoria) para no perder el estado durante el polling.

## Pruebas manuales
```bash
TOKEN="<jwt>"
curl -s -X POST localhost:3000/api/qr/codi/generate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"amount":150.00,"sale_id":"abc","concept":"Venta caja 1"}'

curl -s localhost:3000/api/qr/payments/<id>/status
```

## Validación
`node --check api/index.js` → OK.
