# R14 — Stripe Payments (Volvix POS)

Integración de Stripe en el flujo de cobro del POS. Server-side via `api/index.js`,
cliente vía `public/volvix-stripe-wiring.js`, almacenamiento en tabla `payments`.

---

## 1. Aplicar SQL

Ejecutar `db/R14_PAYMENTS.sql` en Supabase → SQL Editor. Crea la tabla `payments`,
índices, trigger de `updated_at` y políticas RLS.

---

## 2. Variables de entorno (Vercel)

Configurar en **Vercel → Project → Settings → Environment Variables**
(Production + Preview + Development):

| Variable | Valor | Dónde obtenerla |
|----------|-------|------------------|
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` o `pk_live_...` | Stripe Dashboard → Developers → API keys |
| `STRIPE_SECRET_KEY`      | `sk_test_...` o `sk_live_...` | Stripe Dashboard → Developers → API keys (Reveal) |
| `STRIPE_WEBHOOK_SECRET`  | `whsec_...`                   | Stripe Dashboard → Developers → Webhooks → endpoint → Signing secret |

Si **alguna falta**, los endpoints responden **HTTP 503** con un mensaje claro
(modo de prueba seguro — no se aceptan pagos hasta que estén configuradas).

Después de añadir las variables: **Redeploy** el proyecto en Vercel para que las tome.

---

## 3. Configurar el webhook de Stripe

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. URL: `https://<tu-dominio-vercel>/api/payments/stripe/webhook`
3. Eventos a escuchar (mínimo):
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `payment_intent.processing`
   - `payment_intent.requires_action`
4. Copiar el **Signing secret** (`whsec_...`) y pegarlo en `STRIPE_WEBHOOK_SECRET` (Vercel).

Para test local con Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
# Copiar el whsec_... que imprime → exportar como STRIPE_WEBHOOK_SECRET
```

---

## 4. Endpoints expuestos

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/payments/stripe/intent`   | Crea PaymentIntent. Body: `{ sale_id, amount, currency? }` (amount en centavos). Devuelve `{ client_secret, payment_intent_id, publishable_key }`. |
| POST | `/api/payments/stripe/webhook`  | Recibe eventos firmados de Stripe. Verifica `Stripe-Signature` y actualiza `payments.status`. |
| GET  | `/api/payments/:id/status`      | Consulta estado por `payments.id`, `provider_payment_id` (pi_xxx) o `sale_id`. |

Todos retornan **503** si falta `STRIPE_SECRET_KEY` (o `STRIPE_WEBHOOK_SECRET` para el webhook).

---

## 5. Wiring en `server.js`

Añadir cerca del inicio de `handleAPI(...)`:

```js
const stripeApi = require('./api');
if (pathname.startsWith('/api/payments/')) {
  const handled = await stripeApi.handleStripe(req, res, method, pathname, parsed);
  if (handled !== false) return;
}
```

**Importante**: el webhook necesita el **cuerpo crudo** para verificar la firma.
`api/index.js` ya lee el body desde `req` directamente (no usar middlewares JSON
que consuman el stream antes).

---

## 6. Uso desde el cliente

En cualquier página POS (ej. `pos.html`) cargar el script y llamar a la API:

```html
<script src="/volvix-stripe-wiring.js"></script>
<script>
  // Después de crear la venta y obtener saleId:
  Volvix.stripe.cobrar(saleId, totalCentavos, {
    currency: 'mxn',
    onSuccess: (r) => { console.log('Pagado', r.payment_intent_id); /* marcar venta cobrada */ },
    onError:   (e) => alert('Pago fallido: ' + e.message),
    onCancel:  () => console.log('Usuario canceló'),
  });
</script>
```

`cobrar()` abre un modal con Stripe Elements (Payment Element), confirma el pago
y resuelve con `{ ok, status, payment_intent_id }`.

`Volvix.stripe.status(saleIdOrIntentId)` consulta el estado actual desde el server.

---

## 7. Modo test

- Usar claves `pk_test_...` / `sk_test_...`.
- Tarjetas de prueba: https://stripe.com/docs/testing
  - Éxito: `4242 4242 4242 4242`
  - Requiere 3DS: `4000 0027 6000 3184`
  - Falla: `4000 0000 0000 9995`

---

## 8. Checklist deploy

- [ ] `db/R14_PAYMENTS.sql` aplicado en Supabase.
- [ ] `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` configurados en Vercel.
- [ ] Webhook creado en Stripe apuntando a `/api/payments/stripe/webhook`.
- [ ] `server.js` enruta `/api/payments/*` a `api/index.js` (ver §5).
- [ ] Redeploy en Vercel.
- [ ] Probar `curl https://<dominio>/api/payments/stripe/intent -X POST -H "Content-Type: application/json" -d '{"sale_id":"test","amount":1000,"currency":"mxn"}'` → debe devolver `client_secret`.
