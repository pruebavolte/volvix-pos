# R17 — Apple Pay + Google Pay (Web Payment Request API)

**Date**: 2026-04-26
**Status**: GREEN — DEPLOYED
**Deployment**: https://volvix-pos.vercel.app (`dpl_7gGtFyxwm41g2ak9cdZ3Q76Gbr1d`)

## Alcance

Integración de Apple Pay y Google Pay en Volvix POS vía Web Payment Request API,
con enrutamiento a Stripe (que maneja automáticamente ambos wallets como métodos
de pago dentro de un PaymentIntent normal).

## Entregables

### 1. Cliente: `volvix-payments-wallets.js`
Namespace `Volvix.wallets`:
- `isApplePayAvailable()` — chequea `window.ApplePaySession.canMakePayments()`.
- `isGooglePayAvailable()` — chequea `window.PaymentRequest` y/o `google.payments.api`.
- `payWithApple(amount, currency, sale_id)` — `ApplePaySession` v3 con `onvalidatemerchant`,
  `onpaymentauthorized`, `oncancel`. Llama al backend `/validate-merchant` y crea
  PaymentIntent vía `/api/payments/stripe/intent`.
- `payWithGoogle(amount, currency, sale_id)` — `PaymentRequest` con
  `tokenizationSpecification` gateway=`stripe`, redes Visa/MC/Amex.

Token pasa por `JWT` (Authorization Bearer, leído desde `localStorage`).

### 2. Backend: `api/index.js`
- **GET `/api/payments/wallets/config`** (auth) → retorna `apple_merchant_id`,
  `google_merchant_id`, `stripe_publishable_key`, `supported_networks`,
  `country_code: MX`, `default_currency: MXN`.
- **POST `/api/payments/wallets/validate-merchant`** (auth) → Apple Pay merchant
  validation real con cert mTLS si `APPLE_PAY_MERCHANT_CERT_PATH` y
  `APPLE_PAY_MERCHANT_KEY_PATH` están configurados; **placeholder 503**
  (`apple_pay_cert_not_configured`) si no.

### 3. DB: `db/R17_WALLETS.sql`
Tabla `wallet_payments(id uuid pk, sale_id uuid fk, provider text in
[apple|google|stripe], token_data jsonb, status, amount_cents bigint, currency,
ts, created_at, updated_at)`. Índices por sale, provider, status, ts. RLS:
read=authenticated, write=service_role. Trigger `updated_at`. FK opcional a
`volvix_ventas`.

## Validación
- `node --check api/index.js` → **PASS**.
- Vercel deploy ready, alias `volvix-pos.vercel.app` actualizado.
- Endpoints registrados en `handlers` map.

## Variables de entorno requeridas (opcionales)
- `APPLE_MERCHANT_ID`
- `APPLE_PAY_MERCHANT_CERT_PATH` (ruta al `.pem`)
- `APPLE_PAY_MERCHANT_KEY_PATH` (ruta al `.key`)
- `GOOGLE_MERCHANT_ID` (Google Pay & Wallet Console)
- `STRIPE_PUBLISHABLE_KEY` (ya existente)

Sin certs Apple, validación retorna 503 con `placeholder: true` — el resto del
flujo (Google Pay, intent creation) sigue funcionando.

## Notas
Stripe enruta Apple/Google Pay automáticamente dentro de PaymentIntent normal,
por eso no se requiere endpoint separado de "wallet intent". El `wallet_payments`
table se usa para auditoría y guardar el token crudo del wallet.
