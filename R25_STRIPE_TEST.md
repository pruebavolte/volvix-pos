# R25 — Stripe Integration Deeper Test (sandbox / code-side)

Sin auditor. No se usaron keys reales: solo se verificó el flow del código.

## 1. ENV vars

Definidas y leídas en `api/index.js`:

- `STRIPE_SECRET_KEY` — line 4993 + 5555 (trim, vacío => 503).
- `STRIPE_PUBLISHABLE_KEY` — line 5555 (devuelta al cliente en intent).
- `STRIPE_WEBHOOK_SECRET` — line 5556 (vacío => 503 en webhook).

No hay valores hardcoded; se leen sólo de `process.env.*`. En Vercel deben estar en
**Project → Settings → Environment Variables** (Production + Preview). Stub mode
activo automáticamente: si falta cualquiera, los handlers responden 503 con mensaje
explícito (`STRIPE_SECRET_KEY no configurada`).

## 2. POST /api/payments/stripe/intent

Verificado en `api/index.js:5596–5632`:

- Sin `STRIPE_SECRET_KEY` → **503** `{error:'STRIPE_SECRET_KEY no configurada'}`.
- `sale_id` faltante → 400.
- `amount` no entero/positivo → 400.
- OK → llama Stripe `/v1/payment_intents` con `automatic_payment_methods[enabled]=true`,
  inserta fila en `payments` (provider=stripe), devuelve **200** con
  `{ok, client_secret, payment_intent_id, publishable_key}`.
- Idempotente vía `withIdempotency('POST /api/payments/stripe/intent', …)`.
- Auth requerido (`requireAuth`).

## 3. Cliente `public/volvix-stripe-wiring.js`

Carga Stripe.js dinámicamente vía `loadStripeJS()` (line 13):

- Inserta `<script src="https://js.stripe.com/v3/">` con `createElement + appendChild`.
- Singleton cacheado (no recarga si ya está).
- `ensureStripe(pk)` resuelve con `Stripe(pk)` listo.
- Exposición pública: `window.Volvix.stripe = { cobrar, status, _loadStripeJS }`.

(El `volvix-stripe-wiring.js` raíz es un MOCK distinto, no el de prod.)

## 4. Webhook `POST /api/payments/stripe/webhook`

Verificado en `api/index.js:5634–5694`:

- Sin `stripe-signature` header → header parse falla, **400** `invalid signature header`.
- Signature inválida (HMAC mismatch) → **400** `signature mismatch` (timing-safe compare).
- Timestamp >5 min → **400** `timestamp outside tolerance` (anti-replay temporal).
- Anti-replay nonce vía `event.id` (`nonceCheck`).
- Signature válida (`v1 = HMAC-SHA256(secret, t.body)`) → parsea evento y procesa:
  - `payment_intent.succeeded` → status `succeeded`
  - `payment_intent.payment_failed` → `failed`
  - `charge.refunded` → `refunded`
  - Otros → `{received:true, ignored:type}` 200.
- Updates `payments` row vía `PATCH /payments?provider_payment_id=eq.<id>`.

## 5. Cómo configurar Stripe test mode

1. Dashboard: https://dashboard.stripe.com/test/apikeys
2. Copia `pk_test_...` y `sk_test_...`.
3. En Vercel:
   ```
   vercel env add STRIPE_SECRET_KEY        # sk_test_...
   vercel env add STRIPE_PUBLISHABLE_KEY   # pk_test_...
   vercel env add STRIPE_WEBHOOK_SECRET    # whsec_... (paso 7)
   ```
4. Redeploy.

## 6. Test charge desde el POS

- Tarjeta de prueba: `4242 4242 4242 4242`, cualquier CVC, fecha futura, ZIP cualquiera.
- Decline: `4000 0000 0000 0002`.
- Insufficient funds: `4000 0000 0000 9995`.
- 3DS required: `4000 0027 6000 3184`.

Flow: `Volvix.stripe.cobrar(saleId, amountCents)` → llama `/api/payments/stripe/intent`
→ recibe `client_secret` → confirma con `stripe.confirmCardPayment(client_secret, …)`.

## 7. Verificar webhook localmente

```bash
stripe login
stripe listen --forward-to https://volvix-pos.vercel.app/api/payments/stripe/webhook
# copia el `whsec_...` que imprime y mételo como STRIPE_WEBHOOK_SECRET en Vercel
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
```

Verifica en logs de Vercel: `received:true` y la fila `payments` cambia status.

## Resultado

- Code-side flow: OK en los 4 puntos.
- Robusto a env faltante (503 limpio).
- Webhook con HMAC SHA256 timing-safe + anti-replay temporal + nonce.
- Cliente carga Stripe.js bajo demanda.
- No requiere keys reales para pasar este audit.
