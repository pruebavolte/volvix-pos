# R14 — Customer Self-Service Portal

## Resumen

Portal de cliente self-service con autenticación por **magic link OTP** (código 6 dígitos
enviado por email). El cliente puede consultar su historial de compras, puntos de lealtad,
métodos de pago guardados, descargar facturas (PDF / XML CFDI), reservar citas, cambiar
contraseña y solicitar GDPR.

## Archivos entregados

| Archivo | Propósito |
|---|---|
| `volvix-customer-portal-v2.html` | UI del portal (login OTP + dashboard con tabs). Reemplaza `volvix-customer-portal.html`. |
| `volvix-customer-auth-wiring.js`  | SDK browser: `Volvix.customerAuth.requestOtp(email)` y `verifyOtp(email, otp)`. |
| `api/customer-portal.js`          | Módulo Node con todos los handlers `/api/customer/*`. |
| `api/index.js`                    | Se le agregó `require('./customer-portal').register({...})` antes de `matchRoute`. |
| `db/R14_CUSTOMER_AUTH.sql`        | Tabla `customer_otps` + tabla auxiliar `portal_customers`. |

## Endpoints añadidos

### Auth (públicos, rate-limited)
| Método | Path | Descripción |
|---|---|---|
| POST | `/api/customer/otp/request` | Genera OTP de 6 dígitos, guarda hash SHA-256 en `customer_otps`, envía email vía `sendEmail()`. Rate: 5/15min por IP. |
| POST | `/api/customer/otp/verify`  | Valida hash + expiración + intentos, marca `consumed_at`, busca/crea `portal_customers`, emite JWT con `role='customer'`. Rate: 10/15min por IP. |

### Cliente autenticado (JWT `role='customer'`)
| Método | Path | Descripción |
|---|---|---|
| GET  | `/api/customer/me`               | Perfil del cliente. |
| GET  | `/api/customer/orders`           | Historial de compras (`pos_sales` filtrada por `customer_email`). |
| GET  | `/api/customer/loyalty`          | Puntos + movimientos (`loyalty_movements`). |
| GET  | `/api/customer/payment-methods`  | Tarjetas guardadas (best-effort, tabla opcional). |
| POST | `/api/customer/appointments`     | Reservar cita (`appointments`). |
| POST | `/api/customer/password`         | Cambiar password (scrypt, 32 bytes, salt 16). |
| GET  | `/api/customer/invoice/:id?fmt=pdf\|xml` | Descargar CFDI (302 a `cfdi_pdf_url` o stream del XML). |

## Seguridad

- **OTP almacenado solo como hash** `SHA-256(email + code + JWT_SECRET)` — texto del código nunca se persiste.
- **Expiración**: 10 minutos.
- **Intentos**: máximo 5 por OTP (`attempts` column).
- **Rate limit** in-memory por IP (reutiliza `rateLimit()` existente).
- **JWT cliente** firmado HS256 con `JWT_SECRET`, mismo formato que el JWT staff,
  diferenciado por `role='customer'`. `requireAuth(handler, ['customer'])` lo enforce.
- **Filtrado por email** en `/orders` e `/invoice/:id` para que un cliente no acceda a
  pedidos de otro (defensa en profundidad además de RLS).
- **Password**: scrypt con salt aleatoria de 16 bytes, formato `scrypt$<saltHex>$<hashHex>`
  (compatible con `verifyPassword()` ya existente en index.js).
- **CSRF**: las APIs son JSON puro con header `Authorization: Bearer ...`; no usan cookies
  → no hay vector CSRF.

## Schema SQL (`db/R14_CUSTOMER_AUTH.sql`)

```sql
CREATE TABLE customer_otps (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Más `portal_customers(id, email, full_name, phone, tenant_id, loyalty_points, password_hash, ...)`.

El JWT incorpora `role='customer'` directamente en el payload — no requiere ENUM en DB.

## GDPR

El portal incluye un link directo al portal GDPR ya existente (`/volvix-gdpr-portal.html`)
en la pestaña **Cuenta**. No se duplica funcionalidad.

## Pendientes / supuestos

- `pos_sales.customer_email`, `pos_sales.cfdi_xml`, `pos_sales.cfdi_pdf_url`,
  `loyalty_movements`, `customer_payment_methods`, `appointments` se asumen como tablas
  ya existentes o creables aparte; los handlers degradan a array vacío si fallan.
- Si tu schema usa otra tabla de clientes en lugar de `portal_customers`, ajusta los
  selects en `api/customer-portal.js`.
- Para producción: programar `DELETE FROM customer_otps WHERE expires_at < NOW() - INTERVAL '24 hours'`
  vía pg_cron.
