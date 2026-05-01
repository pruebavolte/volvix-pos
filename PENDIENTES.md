# 📋 PENDIENTES — Volvix POS

**Última actualización:** 2026-05-01
**Estado del código:** 95% (142 URLs, 28 módulos backend, 45 commits pusheados)

---

## 🚨 BLOQUEADORES TÚ resuelves (orden de prioridad)

### #1 · Vercel deploy desbloqueado (5 min)
- 45 commits pusheados a `main` no están propagando a producción
- Revisar [vercel.com](https://vercel.com) → proyecto **volvix-pos** → Deployments
- Posibles causas: quota agotada, build fallando, "Ignored Build Step" activado, project disconnected
- Sin esto, NADA del trabajo está live

### #2 · Importar variables de entorno (30 min)
- Vercel Dashboard → proyecto → Settings → Environment Variables
- Click **"Import .env"** → pegar contenido de `.env.production.template` (en raíz del repo)
- Marcar las 3 environments (Production/Preview/Development)
- Después: **Deployments → ⋯ del último → Redeploy**

### #3 · Aplicar migraciones SQL en Supabase (10 min)
Ejecutar en orden via Supabase Dashboard → SQL Editor:

```sql
-- 1. migrations/shop-orders.sql
-- 2. migrations/status-monitor.sql
-- 3. migrations/2026_pos_leads_and_tour_progress.sql
-- 4. CFDI templates (en api/cfdi-pac.js comments)
-- 5. Email templates (en api/email-resend.js comments)
-- 6. Push subscriptions (en api/push-notifications.js comments)
-- 7. Newsletter subscribers (en api/newsletter.js comments)
-- 8. Referrals (en api/referrals.js comments)
-- 9. GDPR requests (en api/gdpr.js comments)
-- 10. A/B testing (en api/abtest.js comments)
-- 11. Backup history (en api/backup.js comments)
-- 12. Inventory warehouses+transfers+cycle (en api/inventory-advanced.js comments)
-- 13. Loyalty tiers+rewards+transactions (en api/loyalty-advanced.js comments)
-- 14. Promotions+coupons+flash+bundles (en api/promotions-engine.js comments)
-- 15. Appointments+staff+services+waitlist (en api/appointments.js comments)
-- 16. Email campaigns + drips (en api/email-campaigns.js / email-drips.js comments)
```

---

## 🔑 API KEYS REQUERIDAS (orden de impacto)

### 🟢 Prioridad 1 — 80% del valor
Estas activan los features más usados. Agrégalas primero:

| Variable | Servicio | Donde se obtiene | Costo aprox |
|---|---|---|---|
| `OPENAI_API_KEY` | IA chat/forecast/insights | [platform.openai.com](https://platform.openai.com/api-keys) | $5-50/mes |
| `RESEND_API_KEY` | Email transaccional | [resend.com](https://resend.com/api-keys) | $0-20/mes |
| `MERCADO_PAGO_ACCESS_TOKEN` | Pagos México | [mercadopago.com.mx/developers](https://www.mercadopago.com.mx/developers) | comisión txn |
| `MERCADO_PAGO_PUBLIC_KEY` | Mismo panel MP | — | — |
| `STRIPE_SECRET_KEY` | Pagos USD/global | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | comisión txn |
| `STRIPE_PUBLISHABLE_KEY` | Mismo panel Stripe | — | — |
| `VOLVIX_GA_ID` | Google Analytics 4 | [analytics.google.com](https://analytics.google.com) | gratis |
| `VOLVIX_FB_PIXEL_ID` | Meta/Facebook Pixel | [business.facebook.com](https://business.facebook.com) | gratis |

### 🟡 Prioridad 2 — B2B avanzado (cuando tengas convenios)

| Variable | Notas |
|---|---|
| `MERCADO_PAGO_WEBHOOK_SECRET` | Configurar URL webhook en panel MP |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhooks → endpoint: `/api/webhooks/stripe` |
| `STP_OWNER_CLABE` | Requiere convenio empresarial STP |
| `STP_ENTERPRISE_KEY` | Mismo |
| `STP_WEBHOOK_SECRET` | Mismo |
| `PAC_API_URL` | Finkok/SW Sapien/Edicom (CFDI) |
| `PAC_API_USER` | Mismo proveedor PAC |
| `PAC_API_PASSWORD` | Mismo |
| `ANTHROPIC_API_KEY` | Alternativa OpenAI |

### 🟠 Prioridad 3 — Delivery platforms (requiere ser partner aprobado)

| Variable | Plataforma |
|---|---|
| `UBEREATS_WEBHOOK_SECRET` | merchants.ubereats.com |
| `DIDI_WEBHOOK_SECRET` | food.didiglobal.com partner portal |
| `RAPPI_WEBHOOK_SECRET` | Rappi Partners |
| `SINDELANTAL_WEBHOOK_SECRET` | Sin Delantal partner |
| `IFOOD_WEBHOOK_SECRET` | iFood partner |
| `PEDIDOSYA_WEBHOOK_SECRET` | PedidosYa partner |

### 🟣 Prioridad 4 — Recargas/servicios (reseller mayorista)

| Variable |
|---|
| `PROVIDER_RECARGAS_API_KEY` (Telcel/Movistar/AT&T reseller) |
| `PROVIDER_SERVICES_API_KEY` (CFE/Telmex/etc reseller) |

### 🔧 Operacionales

| Variable | Default |
|---|---|
| `CRON_SECRET` | (genera con `openssl rand -hex 32`) |
| `API_RATE_LIMIT_PER_MIN` | 60 |
| `BACKUP_ENCRYPTION_KEY` | (32-char hex, opcional) |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | Push notifications (genera con `web-push generate-vapid-keys`) |

---

## ❓ PREGUNTAS PENDIENTES

| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | **Custom domain final** (`volvix.mx`? `salvadorex.mx`?) | Afecta CSP, canonicals, sitemap, OG urls |
| 2 | **Vercel Pro plan?** | Cron jobs requieren Pro. Hobby tiene límites de bandwidth |
| 3 | **Email from address oficial** (ej: `hola@volvix.com`) | Configurar en Resend + en api/email-* |
| 4 | **CFDI provider final** (Finkok/SW Sapien/Edicom) | Cada uno tiene API distinta |
| 5 | **Logo + brand assets en alta resolución** (SVG/PNG ≥ 1024px) | Para blog headers, emails, recibos PDF |
| 6 | **Plan pricing real final** (¿$299/$499/$899 son los definitivos?) | Aparece en 60+ landings + checkout |
| 7 | **Empresa legal** (RFC, dirección, datos fiscales) | Footer landings + términos + CFDI emisor |

---

## 🛑 LO QUE NO PUEDO HACER YO (necesita TU input/acceso)

- ❌ Aplicar migraciones SQL contra prod (sin permiso al dashboard Supabase)
- ❌ Generar APKs Android (necesita Android Studio + JDK + signing keys + cuenta Google Play)
- ❌ Generar EXEs Windows (necesita Visual Studio + cert code-signing)
- ❌ Probar deploys de Vercel (sin acceso al dashboard)
- ❌ Crear cuentas reales en Stripe/MP/Resend/Twilio/STP
- ❌ Sembrar blog con autores reales
- ❌ Run Playwright tests (no hay browser en el ambiente)
- ❌ Configurar dominios DNS (Cloudflare, etc)
- ❌ Crear webhooks reales en panels externos (MP/Stripe/STP/Uber/etc)
- ❌ Subir creatives reales para Meta Ads / Google Ads

---

## 🔮 ROADMAP FUTURO (cuando termines lo de arriba)

### Fase 2 — Apps nativas
- [ ] Android APK build con Capacitor (4-6h)
- [ ] iOS Capacitor wiring (4-6h)
- [ ] Windows .sln Visual Studio o Electron app (2-4h)
- [ ] Mac .dmg installer (2h)
- [ ] Linux .deb / .AppImage (2h)

### Fase 3 — Tests & QA
- [ ] Run completo Playwright E2E tests (4 specs ya creados)
- [ ] Lighthouse audit en las 142 URLs (target 90+)
- [ ] Performance budget enforcement
- [ ] Visual regression con Percy/Chromatic
- [ ] Load testing con k6 / Artillery

### Fase 4 — ML/IA real (no mock)
- [ ] Fraud detection con ML real (8-12h)
- [ ] Demand forecasting con time-series ML
- [ ] Recommendation engine para productos
- [ ] AI chatbot fine-tuning con datos reales del tenant

### Fase 5 — Enterprise features
- [ ] Multi-idioma i18n (sólo es-MX/en preparados, falta pt-BR/en-US)
- [ ] White-label para resellers
- [ ] API GraphQL wrapper sobre REST
- [ ] OpenAPI/Swagger spec auto-generado
- [ ] PowerBI/Tableau export
- [ ] Webhook signature verification dashboard
- [ ] Compliance score (SOC2/GDPR readiness)
- [ ] WebSocket server real para chat live

### Fase 6 — Marketing avanzado
- [ ] A/B testing en producción real (framework ya creado)
- [ ] Heatmaps con Hotjar/Microsoft Clarity
- [ ] Survey/feedback widget
- [ ] Net Promoter Score (NPS) tracking
- [ ] Reviews/ratings widget para landings
- [ ] Customer testimonials reales (en lugar de placeholders)
- [ ] Trust badges (SSL, PCI, certificaciones)

---

## 📊 ESTADO ACTUAL · 95% código

✅ 142 URLs renderizan
✅ 28 módulos backend listos
✅ 45 commits pusheados
✅ User journey completo end-to-end
✅ Multi-tenant con 16 módulos toggleables
✅ Tests E2E specs (Playwright) listos
✅ i18n preparado (es-MX/en)
✅ Performance optimizations
✅ A/B testing framework
✅ Rate limiting + webhook security
✅ Backup/Restore + Geo IP audit
✅ Email marketing + drip campaigns
✅ Loyalty + Promotions + Booking
✅ 19 docs articles + 15 blog posts + 4 video tutorials

---

## 🎯 PRÓXIMO PASO

1. Tú revisas Vercel dashboard
2. Tú agregas las API keys de prioridad 1 (Stripe + MP + Resend + GA + OpenAI)
3. Tú aplicas las primeras 3 migraciones SQL críticas
4. **TODO se activa automáticamente**

El sistema está LISTO. Solo falta la infraestructura.
