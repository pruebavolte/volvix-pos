# R14 — Onboarding v2

## Resumen
Flujo de onboarding rediseñado en 7 pasos con persistencia en localStorage,
plantillas por vertical, e integración API completa.

## Archivos creados / modificados

| Archivo | Tipo | Descripción |
|---|---|---|
| `volvix-onboarding-v2.html` | NEW | Wizard de 7 pasos con tour final |
| `api/index.js` | MOD | +6 endpoints `/api/onboarding/*` (bloque IIFE nuevo) |
| `db/R14_VERTICAL_TEMPLATES.sql` | NEW | Tabla `vertical_templates` + 8 verticales seed + función `seed_vertical_for_tenant` |
| `R14_ONBOARDING_V2.md` | NEW | Este reporte |

## Steps del wizard

| # | Step | Campos / Acción | Skip |
|---|------|-----------------|------|
| 1 | Negocio | name, RFC, admin_email, vertical (8 opciones con iconos) | ❌ |
| 2 | Branding | logo (drag&drop, base64, max 1MB), color primario/secundario, slogan | ✅ |
| 3 | Cajero | name, email, PIN 4 dígitos, role | ❌ |
| 4 | Productos | CSV upload + preview + mapper (auto-match), o template del vertical | ✅ |
| 5 | Pago | plan (trial/basic/pro), Stripe test mode placeholder | ✅ |
| 6 | Fiscal | régimen (601/603/612/621/626), cer/key opcionales, modo prueba/prod | ✅ |
| 7 | Tour | overlay estilo intro.js, 5 tarjetas, redirige al POS al cerrar | — |

- Progress bar persistente con `localStorage[volvix_onboarding_v2]` (sobrevive recargas).
- Validación por step antes de avanzar.
- RFC autocompleta vía `GET /api/onboarding/sat-lookup` cuando el formato es válido.

## Endpoints API añadidos en `api/index.js`

| Método | Ruta | Auth | Cuerpo / Query | Respuesta |
|--------|------|------|----------------|-----------|
| POST | `/api/onboarding/start` | ❌ | `{business:{name,rfc,admin_email}, vertical}` | `{token, tenant_id, user_id, temp_password}` |
| POST | `/api/onboarding/step` | ✅ JWT | `{step, data}` | `{ok, step}` (upsert en `generic_blobs`) |
| POST | `/api/onboarding/complete` | ✅ JWT | `{}` | `{ok, tenant_id, onboarded:true}` |
| POST | `/api/onboarding/import-products` | ✅ JWT | `{products:[{name,sku,price,stock,barcode}]}` | `{ok, inserted, fallback_blob}` |
| GET | `/api/onboarding/template?vertical=X` | ❌ | — | `{vertical, products:[...]}` |
| GET | `/api/onboarding/sat-lookup?rfc=X` | ❌ | — | `{ok, rfc, valid_format}` |
| GET | `/api/onboarding/sat-regimenes` | ❌ | — | `{regimenes:{code:label}}` |

### Detalles de implementación

**`/start`**
- Inserta `companies` (plan=trial, is_active=true).
- Crea `pos_users` admin con password scrypt aleatorio (`tempPass` se devuelve para email reset en producción).
- Persiste estado inicial en `generic_blobs` (kind=`onboarding_state`).
- Emite JWT inmediato (sin login adicional).

**`/import-products`**
- Sanea: name≤200ch, sku≤80ch, price→Number, stock→int, barcode≤80ch.
- Limita a 5000 productos por request.
- Bulk insert en `products`. Si la tabla no existe o falla, **fallback** a `generic_blobs` (kind=`imported_products`) — se reporta `fallback_blob:true`.

**`/complete`**
- Intenta `PATCH companies` con `onboarded=true, onboarded_at=now()`.
- Si la columna no existe (Supabase aún no migrado), guarda marca en `generic_blobs` (kind=`tenant_onboarded`).

## Verticales soportados

`farmacia`, `restaurante`, `gym`, `salon`, `ferreteria`, `papeleria`, `abarrotes`, `cafeteria`.

Cada uno con 5–7 productos seed (espejo en código JS y en SQL).

## Migración DB (`R14_VERTICAL_TEMPLATES.sql`)

1. Crea tabla `vertical_templates` (idempotente).
2. ALTER `companies` añade columnas: `onboarded`, `onboarded_at`, `vertical`, `branding`, `fiscal_config`.
3. Inserta ~50 productos seed.
4. Función `seed_vertical_for_tenant(vertical, tenant_uuid) RETURNS int`.

```sql
SELECT seed_vertical_for_tenant('farmacia', '11111111-...');
```

## Plan de pruebas

```bash
# 1. Plantilla pública (sin auth)
curl http://localhost:3000/api/onboarding/template?vertical=farmacia

# 2. Iniciar onboarding
curl -X POST http://localhost:3000/api/onboarding/start \
  -H "Content-Type: application/json" \
  -d '{"business":{"name":"Test SA","admin_email":"a@b.mx"},"vertical":"farmacia"}'

# 3. Con el token devuelto:
TOKEN="eyJ..."
curl -X POST http://localhost:3000/api/onboarding/step \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"step":2,"data":{"branding":{"primary":"#1e3c72"}}}'

# 4. Importar productos
curl -X POST http://localhost:3000/api/onboarding/import-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"products":[{"name":"X","sku":"S1","price":10,"stock":5}]}'

# 5. Completar
curl -X POST http://localhost:3000/api/onboarding/complete \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

## Notas / pendientes

- **Stripe test mode**: botón presente en step 5 pero requiere wiring con `R14_STRIPE.md` (endpoint `/api/stripe/checkout` ya existente).
- **Email del temp_password**: hoy se devuelve en el response del `/start`. En producción debería enviarse vía `sendEmail()` y NO retornarse al cliente.
- **multipart/form-data CSV**: el endpoint `/import-products` actualmente acepta JSON parseado por el cliente (más simple). Si se requiere upload directo del CSV crudo, hay que añadir parser multipart en `api/index.js` (no presente hoy).
- **SAT lookup real**: el SAT no expone API pública. La integración real requiere proveedores tipo SW Sapien, FactureAPI, etc. — placeholder con validación de formato.
- **Certificados .cer/.key**: leídos en cliente pero NO subidos al server en este iteración. Endpoint dedicado pendiente (`POST /api/fiscal/upload-cert`).
