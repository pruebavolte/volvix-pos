# Vercel · Setup de Variables de Entorno

## 🚀 Quick Setup (5 minutos)

### Opción A — Importar de un golpe (RECOMENDADO)

1. Abre [vercel.com/dashboard](https://vercel.com/dashboard) → proyecto **volvix-pos**
2. **Settings** → **Environment Variables**
3. Click **"Import .env"** (botón en la esquina superior derecha)
4. Abre el archivo `/.env.production.template` de este repo
5. Copia TODO y pega en el dialog de Vercel
6. Marca las 3 environments: **Production**, **Preview**, **Development**
7. Click **Save**
8. **Deployments** → ⋯ del último deploy → **Redeploy**

### Opción B — Una por una (manual)

Para cada variable abajo:
1. Click **Add New**
2. **Key:** copia el nombre (ej: `OPENAI_API_KEY`)
3. **Value:** pega tu valor (ej: `sk-proj-...`)
4. Marca las 3 environments
5. **Save**

---

## 📋 Lista completa de variables · 36 totales

### 🔐 Ya configuradas (verificar que sigan)

| Variable | Dónde se obtiene |
|---|---|
| `SUPABASE_URL` | Supabase → Project → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Project → Settings → API → service_role |
| `SUPABASE_SERVICE_ROLE_KEY` | Mismo que arriba (alias) |
| `SUPABASE_PAT` | Supabase → Account → Tokens |
| `SUPABASE_ANON_KEY` | Supabase → Project → Settings → API → anon |
| `JWT_SECRET` | Genera con `openssl rand -hex 32` |
| `ADMIN_API_KEY` | Genera con `openssl rand -hex 24` |
| `ALLOWED_ORIGINS` | `https://volvix-pos.vercel.app` |
| `NODE_ENV` | `production` |

### 🟢 Prioridad 1 (80% del valor)

| Variable | Dónde se obtiene | Costo |
|---|---|---|
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ~$5-50/mes |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Alternativa a OpenAI |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) | $0-20/mes |
| `MERCADO_PAGO_ACCESS_TOKEN` | [mercadopago.com.mx/developers](https://www.mercadopago.com.mx/developers) | comisión por txn |
| `MERCADO_PAGO_PUBLIC_KEY` | Mismo panel MP | — |
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | comisión por txn |
| `STRIPE_PUBLISHABLE_KEY` | Mismo panel Stripe | — |
| `VOLVIX_GA_ID` | [analytics.google.com](https://analytics.google.com) → Admin → Streams | gratis |
| `VOLVIX_FB_PIXEL_ID` | [business.facebook.com](https://business.facebook.com) → Pixels | gratis |

### 🟡 Prioridad 2 (B2B avanzado)

| Variable | Dónde se obtiene |
|---|---|
| `MERCADO_PAGO_WEBHOOK_SECRET` | MP → Webhooks → Setup |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → Add endpoint → URL: `https://volvix-pos.vercel.app/api/webhooks/stripe` |
| `STP_OWNER_CLABE` | STP → cuenta empresarial (requiere convenio) |
| `STP_ENTERPRISE_KEY` | STP → API credentials |
| `STP_WEBHOOK_SECRET` | STP → Webhooks |
| `PAC_API_URL` | Finkok / SW Sapien / Edicom (PACs SAT) |
| `PAC_API_USER` | Mismo proveedor PAC |
| `PAC_API_PASSWORD` | Mismo proveedor PAC |

### 🟠 Prioridad 3 (delivery platforms)

Cada una requiere ser **partner aprobado** primero:

| Variable | Plataforma |
|---|---|
| `UBEREATS_WEBHOOK_SECRET` | [merchants.ubereats.com](https://merchants.ubereats.com) |
| `DIDI_WEBHOOK_SECRET` | [food.didiglobal.com](https://food.didiglobal.com) partner |
| `RAPPI_WEBHOOK_SECRET` | Rappi Partners portal |
| `SINDELANTAL_WEBHOOK_SECRET` | Sin Delantal partner |
| `IFOOD_WEBHOOK_SECRET` | iFood partner |
| `PEDIDOSYA_WEBHOOK_SECRET` | PedidosYa partner |

### 🟣 Prioridad 4 (recargas/servicios)

| Variable | Dónde se obtiene |
|---|---|
| `PROVIDER_RECARGAS_API_KEY` | Reseller mayorista (ej: Recargaki, Telcel reseller) |
| `PROVIDER_SERVICES_API_KEY` | Mismo proveedor o aparte |

### 📱 SMS (ya configurado)

| Variable |
|---|
| `TWILIO_ACCOUNT_SID` |
| `TWILIO_AUTH_TOKEN` |
| `TWILIO_FROM_NUMBER` |

### 🔧 Opcionales

| Variable | Default sugerido |
|---|---|
| `RATE_LIMIT_PER_MIN` | `60` |
| `SESSION_TIMEOUT_MIN` | `30` |
| `SESSION_TIMEOUT_OWNER_MIN` | `120` |
| `ENABLE_DEBUG_ENDPOINTS` | `false` |
| `ENABLE_PROVIDER_FALLBACK` | `true` |

---

## ✅ Verificación post-setup

Después de redeployar, prueba estos endpoints:

```bash
# Health (debería responder sin error)
curl https://volvix-pos.vercel.app/api/health

# Status de pagos (te dice qué keys están configuradas)
curl https://volvix-pos.vercel.app/api/payments/health

# Status global del sistema
curl https://volvix-pos.vercel.app/api/status/uptime
```

Si `/api/payments/health` devuelve `{mp:true, stripe:true, ai:true, ...}` → ¡todo activo!

---

## 🔒 Seguridad

- **NUNCA** commitees el `.env.production` con valores reales (ya está en `.gitignore`)
- **NUNCA** pegues API keys en chats, GitHub issues, o screenshots
- **Rota las keys** cada 90 días
- **Revoca** keys viejas inmediatamente si sospechas leak
- **Usa diferentes keys** para Production vs Development
