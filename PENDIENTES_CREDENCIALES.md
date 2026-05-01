# 🔐 PENDIENTES — Cosas que requieren credenciales/cuentas externas

Documento donde está TODO el código preparado esperando solo credenciales para activarse.
Cuando me pases las creds, se activa cada uno SIN tocar código (solo env vars en Vercel).

---

## 1. CFDI / FACTURACIÓN — Facturama

### Estado
- ✅ Endpoints implementados: `POST /api/cfdi/generate`, `POST /api/cfdi/stamp`, `GET /api/cfdi/list`, `POST /api/cfdi/cancel`
- ✅ Tabla `cfdi_documents` lista
- ✅ Migration `migrations/cfdi.sql` aplicada
- ✅ Helper en api/index.js detecta `CFDI_PAC_PROVIDER` env var
- ⏳ Sin credenciales → modo MOCK activo (genera UUIDs ficticios para desarrollo)

### Cuando pases las credenciales de Facturama
**En Vercel Project Settings → Environment Variables**:
```
CFDI_PAC_PROVIDER=facturama
CFDI_PAC_USER=<tu_usuario_facturama>
CFDI_PAC_PASSWORD=<tu_password_facturama>
CFDI_TENANT_RFC=<RFC_emisor>          # ej: ABC010101AB1
CFDI_TENANT_REGIMEN_FISCAL=<código>    # ej: 612 (Persona Física)
CFDI_TENANT_CP=<código_postal_emisor>  # ej: 06000
CFDI_TENANT_NOMBRE=<razón_social>
```

Opcional para sello digital propio (vs delegar a PAC):
```
CFDI_CER_PATH=/path/to/cer.pem
CFDI_KEY_PATH=/path/to/key.pem
CFDI_KEY_PASSWORD=<password_llave>
```

### Lo que se desbloquea automáticamente
- Timbrado real CFDI 4.0
- Cancelación con motivo SAT (01/02/03/04)
- XML descargable
- PDF descargable
- Historial de facturas en `/api/cfdi/list`
- Folio sequential per tenant

### Test cuando esté configurado
```bash
curl -X POST https://salvadorexoficial.com/api/cfdi/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: cfdi-$(date +%s)" \
  -d '{"sale_id":"<uuid>","customer_rfc":"XAXX010101000","payment_method":"01"}'
```

---

## 2. WHATSAPP BUSINESS — Wasender / Meta API

### Estado
- ✅ Endpoints: `POST /api/whatsapp/send`, `POST /api/whatsapp/webhook`, `GET /api/whatsapp/messages`, `GET /api/whatsapp/templates`
- ✅ HMAC validation implementada (Meta X-Hub-Signature-256)
- ✅ Tabla `whatsapp_messages` lista
- ✅ Migration `migrations/whatsapp.sql` aplicada
- ⏳ Sin credenciales → modo MOCK (logs sin enviar)

### Cuando pases las credenciales (Wasender o Meta)

**Para Wasender** (más simple, sin waiting list):
```
WHATSAPP_PROVIDER=wasender
WHATSAPP_API_KEY=<tu_api_key_wasender>
WHATSAPP_PHONE_NUMBER=<tu_numero_e164>   # ej: +5215512345678
```

**Para Meta WhatsApp Business API** (oficial, requiere aprobación):
```
WHATSAPP_PROVIDER=meta
WHATSAPP_TOKEN=<access_token_meta>
WHATSAPP_PHONE_ID=<phone_number_id>
WHATSAPP_BUSINESS_ID=<business_id>
WHATSAPP_APP_SECRET=<app_secret>          # CRÍTICO para webhook HMAC
WHATSAPP_VERIFY_TOKEN=<custom_verify_token>
```

### Lo que se desbloquea
- Envío de tickets/recibos por WhatsApp
- Notificación automática de cambio en estado de orden
- Auto-reply para keywords (menu, orden, ayuda)
- Marketing masivo con opt-in tracking
- Historial completo en `/api/whatsapp/messages`

### Webhook URL para configurar en Meta/Wasender
```
https://salvadorexoficial.com/api/whatsapp/webhook
Verify Token: <el mismo WHATSAPP_VERIFY_TOKEN del env>
```

---

## 3. STRIPE — Cobros + Suscripciones

### Estado
- ✅ Endpoints: `POST /api/billing/checkout-session`, `POST /api/billing/portal-session`
- ✅ Webhook receiver implementado
- ✅ Origin allowlist hardenizado (security fix B40)
- ⏳ Sin credenciales → modo MOCK (genera URLs ficticias)

### Cuando crees los productos en Stripe Dashboard

**Pasos en Stripe Dashboard**:
1. Products → Add product → "Volvix POS - Plan Básico"
2. Crea precios mensuales y anuales para cada plan (Básico, Pro, Enterprise)
3. Anota los Price IDs (`price_1AbCd...`)

**En Vercel Environment Variables**:
```
STRIPE_SECRET_KEY=sk_live_...                      # Stripe API key
STRIPE_WEBHOOK_SECRET=whsec_...                    # Para validar webhooks

# Precios mensuales
STRIPE_PRICE_BASIC_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...

# Precios anuales
STRIPE_PRICE_BASIC_ANNUAL=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_ENTERPRISE_ANNUAL=price_...
```

### Webhook URL para configurar en Stripe
```
https://salvadorexoficial.com/api/stripe/webhook
Eventos a suscribir:
- checkout.session.completed
- invoice.paid
- invoice.payment_failed
- customer.subscription.deleted
- customer.subscription.updated
```

### Lo que se desbloquea
- Onboarding con pago real al final
- Self-service plan upgrades/downgrades
- Auto-suspensión por pago fallido
- Customer Portal (Stripe-hosted, no necesitas UI)
- Reporting de revenue automático

---

## 4. EMAIL TRANSACCIONAL — SMTP / SendGrid / Mailgun

### Estado
- ✅ Endpoint: `POST /api/email/test` (superadmin only)
- ✅ Email templates en `email-templates.js`
- ⏳ Sin credenciales → modo MOCK (logs sin enviar)

### Cuando pases credenciales

**Para SMTP genérico** (Gmail, Zoho, cualquier proveedor):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=hola@volvix.com
SMTP_PASS=<app_password>
SMTP_SECURE=tls
FROM_EMAIL=hola@volvix.com
FROM_NAME=Volvix POS
```

**Para SendGrid** (recomendado, free tier 100/día):
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.<key>
FROM_EMAIL=hola@volvix.com
```

**Para Mailgun**:
```
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=<key>
MAILGUN_DOMAIN=mg.volvix.com
```

### Lo que se desbloquea
- Bienvenida al crear nuevo tenant/user
- Confirmación de venta (recibo digital)
- Recovery de password
- Notificación factura pagada
- Alertas de bajo stock al owner

---

## 5. ANDROID APK SIGNING — Keystore + Keystore Password

### Estado
- ✅ Capacitor configurado
- ✅ 12 plugins instalados
- ✅ AndroidManifest.xml con permisos POS
- ✅ Network security config (HTTPS-only)
- ✅ `mobile-build.js` con scripts (debug/release/bundle)
- ⏳ Sin keystore → solo APK debug se puede generar

### Cuando crees el keystore

**Generar keystore (una vez)**:
```bash
keytool -genkey -v \
  -keystore android/app/volvix-release.keystore \
  -alias volvix-pos \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass <STORE_PASS> \
  -keypass <KEY_PASS>
```

**Configurar en `android/gradle.properties`**:
```
VOLVIX_KEYSTORE_PATH=app/volvix-release.keystore
VOLVIX_KEYSTORE_PASSWORD=<STORE_PASS>
VOLVIX_KEY_ALIAS=volvix-pos
VOLVIX_KEY_PASSWORD=<KEY_PASS>
```

**⚠️ CRÍTICO**: Hacer 3 backups del keystore en lugares separados. Si se pierde, NO PUEDES actualizar la app en Google Play (tienes que publicar app nueva).

### Lo que se desbloquea
```bash
node mobile-build.js android-release   # → APK firmado para distribución
node mobile-build.js android-bundle    # → AAB para Google Play Store
```

---

## 6. APPLE iOS — Apple Developer Account ($99/año)

### Estado
- ✅ Capacitor iOS scaffold listo (cuando se ejecute en Mac)
- ⏳ Sin Mac + Apple Dev Account → no se puede compilar

### Lo que necesitas
1. Mac (Mac mini, MacBook, etc.)
2. Apple Developer Program $99 USD/año
3. Xcode 15+
4. Certificate + Provisioning Profile

### Lo que se desbloquea
```bash
node mobile-build.js ios   # Abre Xcode con proyecto listo
```

---

## 7. CUSTOM DOMAIN — Comprar dominio + DNS

### Estado
- ✅ Sistema funciona en `salvadorexoficial.com`
- ⏳ Sin dominio custom → URL larga genérica

### Cuando compres `volvix.com` (o el que elijas)

**En Vercel Project Settings → Domains**:
1. Add Domain → `volvix.com`
2. Vercel te dará registros DNS
3. En tu registrar (Namecheap/GoDaddy): agregar A record + CNAME

**Sub-dominios sugeridos**:
- `volvix.com` → marketing landing
- `app.volvix.com` → POS principal  
- `api.volvix.com` → API endpoints
- `docs.volvix.com` → documentación
- `restaurante.volvix.com` → tenant específico (si quieres URL personalizadas por giro)

### Update needed in code post-domain
- Vercel hace redirect automático
- Single source of truth: `ALLOWED_ORIGINS` env var en Vercel
- Capacitor config: actualizar `allowNavigation`

---

## 📊 SUMMARY EJECUTIVO

| # | Servicio | Estado código | Esperando |
|---|----------|---------------|-----------|
| 1 | CFDI/Facturama | 100% listo, mock activo | Credenciales Facturama + RFC emisor |
| 2 | WhatsApp | 100% listo, mock activo | API Key Wasender o Meta access |
| 3 | Stripe | 100% listo, mock activo | Crear products en Stripe Dashboard |
| 4 | Email | 100% listo, mock activo | SMTP/SendGrid creds |
| 5 | Android APK | 100% listo (debug) | Keystore para release signing |
| 6 | iOS IPA | 100% listo (scaffold) | Mac + Apple Dev account |
| 7 | Custom domain | N/A | Comprar dominio + DNS |

**Total tiempo de activación cuando me pases las creds: ~10 min cada uno** (solo set env vars en Vercel + redeploy).

**No hay que escribir más código**. Todo está implementado, solo faltan las credenciales.
