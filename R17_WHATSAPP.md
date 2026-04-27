# R17 — WhatsApp Business API

## Backend (api/index.js)
- `POST /api/whatsapp/send` (auth) — body `{to, template, params[]}`, llama `https://graph.facebook.com/v18.0/{phone_number_id}/messages` con bearer `WHATSAPP_TOKEN`. Si `WHATSAPP_TOKEN` falta -> 503.
- `GET  /api/whatsapp/webhook` — verify-token handshake (Meta).
- `POST /api/whatsapp/webhook` — recibe mensajes incoming, persiste en `whatsapp_messages` (direction=in).
- `GET  /api/whatsapp/messages` (auth) — lista los ultimos 100.
- `GET  /api/whatsapp/templates` (auth) — lista plantillas aprobadas + flag configured.

Helpers globales `__waSend / __waLog / __waConfigured` expuestos para que el handler `POST /api/sales` haga fire-and-forget.

### Templates pre-aprobados
`order_confirmation`, `payment_received`, `shipping_update`, `low_stock_alert`, `appointment_reminder`. Idioma por defecto: `es_MX`.

## Trigger en venta
En `POST /api/sales`, tras persistir `saleRow`, si `body.customer.phone` existe y `WHATSAPP_TOKEN` esta configurado, dispara `order_confirmation` con `[customerName, orderId, total]`. Es non-blocking (.catch).

## SQL (db/R17_WHATSAPP.sql)
- `whatsapp_messages(id uuid pk, tenant_id, direction in/out, to_phone, template, body text, status, wa_id, sent_at, created_at)` con indices por tenant/phone/template/sent_at.
- `whatsapp_subscribers(id uuid pk, phone, tenant_id, customer_id, opt_in_at, opt_out_at, source)` UNIQUE(phone, tenant_id).

## Cliente (volvix-whatsapp-wiring.js)
Reemplaza el mock previo. Expone `window.WhatsAppAPI` (`send/sendQuick/templates/messages/open/close`) y monta un floating widget (FAB verde + panel) con campo telefono, dropdown de templates y textarea de params (separados por `|`).

## Setup Meta Business

1. Meta Business Suite -> Configuracion -> Cuentas -> WhatsApp Accounts.
2. Crea/selecciona la WhatsApp Business Account (WABA) y agrega un numero (test gratuito o produccion).
3. App Dashboard -> Add Product -> WhatsApp -> Get Started. Genera un System User Token permanente con scope `whatsapp_business_messaging` + `whatsapp_business_management`.
4. Copia `Phone Number ID` (campo "From").
5. Sube y aprueba los 5 templates en `WhatsApp Manager -> Message Templates` con los placeholders `{{1}}{{2}}{{3}}`.
6. Webhooks -> Configure callback URL -> `https://<tu-host>/api/whatsapp/webhook` y verify token = `WHATSAPP_VERIFY_TOKEN`. Suscribir field `messages`.

### Variables de entorno
```
WHATSAPP_TOKEN=EAAB... (System User token)
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=cualquier-string-secreto
WHATSAPP_GRAPH_VERSION=v18.0   # opcional
```

## Twilio fallback
Si Meta WABA aun no esta aprobada (revision 1-3 dias), usar Twilio WhatsApp sandbox como fallback:
- `volvix-twilio-wiring.js` ya soporta `whatsappFrom='whatsapp:+14155238886'`.
- Endpoint alternativo: `POST /api/twilio/whatsapp/send` (no incluido aqui — proxy directo en Twilio wiring).
- Migrar a Graph API tras aprobacion sin cambios en frontend (mismo `WhatsAppAPI.send`).

## Pruebas rapidas
```bash
# Verify webhook
curl "https://host/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=ping"
# -> 200 "ping"

# Envio
curl -X POST https://host/api/whatsapp/send \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"to":"+5215555555555","template":"order_confirmation","params":["Juan","ORD-1","450.00"]}'
```
