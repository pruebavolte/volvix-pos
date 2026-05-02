# Dónde pegar las llaves de Stripe y Mercado Pago

Las dos pasarelas usan dos llaves cada una: una **pública** (la que ve el navegador) y una **secreta/access token** (la que usa el servidor). Las dos van en **Vercel → Settings → Environment Variables**.

## Stripe (https://dashboard.stripe.com)

Stripe → **Developers → API keys**. Vas a ver dos campos:

| Lo que dice Stripe          | Variable en Vercel          | Empieza con   |
|-----------------------------|-----------------------------|---------------|
| Publishable key             | `STRIPE_PUBLISHABLE_KEY`    | `pk_live_…`   |
| Secret key (es el "token")  | `STRIPE_SECRET_KEY`         | `sk_live_…`   |

> "Token" en Stripe = Secret key. Es la misma llave.

Cuando tengas Webhook configurado:

| Webhook signing secret | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |

## Mercado Pago (https://www.mercadopago.com.mx/developers/panel)

Mercado Pago → **Tus integraciones → tu app → Credenciales de producción**. Verás:

| Lo que dice MP    | Variable en Vercel           | Empieza con          |
|-------------------|------------------------------|----------------------|
| Public Key        | `MERCADO_PAGO_PUBLIC_KEY`    | `APP_USR-…`          |
| Access Token      | `MERCADO_PAGO_ACCESS_TOKEN`  | `APP_USR-…` (otra)   |

> En MP la "clave publicable" = Public Key, y el "token" = Access Token.

Webhook (cuando lo configures):

| Webhook secret | `MERCADO_PAGO_WEBHOOK_SECRET` | (lo genera MP al crear la URL) |

## Cómo pegarlas en Vercel

1. https://vercel.com/grupo-volvixs-projects/volvix-pos/settings/environment-variables
2. Por cada variable: **Add New** → Name = nombre exacto de la tabla, Value = la llave, marca **Production + Preview + Development**.
3. Save.
4. **Deployments → Redeploy** el último (sin "Use existing build cache" para que tome las nuevas variables).

## Verificación rápida

Después del redeploy:

```
GET https://systeminternational.app/api/payments/health
```

Debe responder `{ "stripe": true, "mercadopago": true, … }`. Si una sigue en `false`, revisa que copiaste la llave **completa** (suelen tener guiones — `pk_live_51AB…`).

## Errores comunes

- Pegar la llave de **test** (`pk_test_`, `sk_test_`) en producción → MP/Stripe rechazan los pagos reales.
- Espacios al inicio/final → Vercel los conserva. Pega limpio.
- Confundir Public Key con Access Token en MP → la app inicia pero los pagos fallan con `auth error`.
- En Stripe, confundir el **Restricted key** con el **Secret key** — usa el Secret key (full access).
