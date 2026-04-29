# Setup Wasender (WhatsApp Provider) — Volvix POS

> Alternativa **simple y rápida** a Twilio. Setup en 5 min, sin Meta Business approval.

## Por qué Wasender

| Criterio | Wasender | Twilio |
|---|---|---|
| Setup | 5 min | 1-3 días (con sandbox) o semanas (con número real) |
| Aprobación Meta | ❌ No requerida | ✅ Requerida para producción |
| Costo arranque | $30/mes flat | ~$0.04/msg (México) |
| Volumen incluido | 10,000 msgs/mes | Pay-as-you-go |
| Display name | Auto | Aprobación Meta requerida |
| Soporte | Discord, email | Tickets enterprise |
| Confiabilidad | Buena (no oficial Meta) | Excelente (Meta partner) |

**Cuándo usar Wasender**:
- ✅ Estás arrancando, validando el flow.
- ✅ Volumen < 10,000 OTPs/mes.
- ✅ No quieres pelearte con Facebook Business Manager.

**Cuándo NO usar**:
- ❌ Compliance estricto (banking, salud, etc.).
- ❌ Volumen > 50,000/mes (busca Twilio o Meta directo).
- ❌ Necesitas SLA garantizado.

## Setup paso a paso (5 min)

### 1) Crear cuenta
- https://wasenderapi.com (o el provider equivalente que uses)
- Sign up con email
- Plan: **Starter $30/mes** (10K mensajes incluidos)

### 2) Conectar tu WhatsApp
- Dashboard → "Devices" → "Add Device"
- Te muestra un **QR code**.
- En tu WhatsApp Business app → Settings → Linked Devices → Link a Device → Escanear el QR.
- Listo: tu número está conectado a Wasender.

> **Importante**: el número que conectes será el remitente de los OTPs. Recomendado: número dedicado (no el personal del owner).

### 3) Generar API key
- Dashboard → "API" → "Generate Key"
- Copiar: `wsk_live_xxxxxxxxxxxxxxxx`

### 4) Test con curl
```bash
curl -X POST https://wasenderapi.com/api/send-message \
  -H "Authorization: Bearer wsk_live_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5215512345678",
    "text": "Tu código Volvix POS es: 123456"
  }'
```

Si llega WhatsApp → integración OK.

### 5) Agregar a Vercel
```bash
vercel env add WASENDER_API_KEY
# Valor: wsk_live_xxxxxxxxxxxxxxxx
```

Redeploy: `vercel --prod --yes`.

## Cómo el sistema detecta Wasender

Archivo: `api/index.js`:

```js
const hasWhatsAppProvider = !!(process.env.TWILIO_ACCOUNT_SID ||
                               process.env.WASENDER_API_KEY ||
                               process.env.WHATSAPP_TOKEN);
```

Con `WASENDER_API_KEY` set:
- `providers_offline === false` (asumiendo también email provider).
- Banner "Modo demo" desaparece de `/registro.html`.

## Limitaciones

- **No oficial de Meta**: WhatsApp puede banear el número si detecta abuso (envíos masivos no solicitados, spam).
- **Mantén el QR conectado**: si cierras sesión en WhatsApp, deja de funcionar.
- **No promueve broadcasts**: úsalo solo para OTPs/transactional, no para marketing.

## Buenas prácticas

1. **Usa número dedicado** — no el WhatsApp personal del fundador.
2. **No envíes promociones** desde Wasender — solo OTPs y transaccional.
3. **Plan B**: ten Twilio en standby por si Wasender cae o WhatsApp banea.
4. **Monitorea entregas**: dashboard de Wasender muestra failures.
5. **Migra a Twilio cuando llegues a 10K/mes** — más estable, mismo precio efectivo.

## Costos

| Plan | Mensajes/mes | Precio |
|---|---|---|
| Starter | 10,000 | $30 USD |
| Pro | 50,000 | $99 USD |
| Business | 200,000 | $299 USD |

## Troubleshooting

- **"Device disconnected"**: re-escanear QR.
- **"Number not registered on WhatsApp"**: el `to` no tiene cuenta WhatsApp.
- **"Daily limit reached"**: llegaste al cap del plan, upgrade.
- **"Messages going to spam folder"**: WhatsApp no tiene spam folder, pero puede marcarte como "negocio nuevo". Pide a usuarios que guarden tu número en contactos.

## Siguiente paso

Ver `INDEX.md` para comparativa completa.
