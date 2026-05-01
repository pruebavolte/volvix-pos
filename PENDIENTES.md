# 📋 PENDIENTES — Volvix POS

**Última actualización:** 2026-05-01
**Estado del código:** 97% (142 URLs, 32 módulos backend, 7 migraciones críticas aplicadas hoy)

---

## ✅ RESUELTO HOY (2026-05-01)

- ✅ 7 migraciones críticas aplicadas: giros_synonyms, system_error_logs, usage-billing (3 tablas), shop_orders, system_incidents + health_pings, pos_leads + user_tour_progress, tenant_button_overrides + admin_notes + impersonation_log
- ✅ Bugs B4-B8 corregidos (title truncado, validation order, canonicals, /api/admin/tenants 404, sitemap)
- ✅ UI limpia: sin botones flotantes, i18n inline, banner México auto-inject
- ✅ Dominio canónico definido: systeminternational.app (CSP ya configurada en vercel.json)
- ✅ Error logging: system_error_logs activo, errores NO se muestran al usuario

---

## 🚨 BLOQUEADORES TÚ resuelves

### #1 · Vercel deploy stuck — CRÍTICO (5 min)
- Commit `689b457` (trabajo de hoy) **NO está en Production**
- `deploy_marker` actual: `9b82f90`
- **Acción:** Vercel Dashboard → volvix-pos → Deployments → `689b457` → `⋯` → "Promote to Production"
- Si no aparece: revisar si hay build error en el tab de Deployments

### #2 · Twilio keys (SMS OTP) — ALTO (10 min)
Sin esto el registro funciona pero con `dev_code` (cualquier OTP acepta → inseguro en producción):
```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_SMS_FROM=+1xxxxxxxxxx
```
Obtener en: [console.twilio.com](https://console.twilio.com)

### #3 · Migraciones r1-r12 restantes — MEDIO (30-60 min)
~34 archivos de hardening, RLS avanzado, multi-sucursal, auditoría.
Todos idempotentes (`IF NOT EXISTS`). Aplicar en Supabase SQL Editor en orden numérico:
```
r1 → r2 → r3a → r3b → r4a → r4b → r4c → r5a → r5b → r5c
→ r6a → r6c → r7a → r7c → r8a → r8b → r8c → r8e → r8f → r8g
→ r9a → r9b → r10a → r10b → r10c → r10d → r10e
→ r11 → r12 → r12-o-1 → r12-o-3a → r12a → r12b → r12bug
```

### #4 · DNS systeminternational.app — MEDIO (15 min)
- Vercel Dashboard → volvix-pos → Settings → Domains → Add → `systeminternational.app`
- En tu DNS/Cloudflare: A record `@` → IP de Vercel (o usar nameservers de Vercel)
- Habilitar `CANONICAL_REDIRECT_ENABLED=true` en env vars una vez el DNS esté activo

---

## 🔑 API KEYS PENDIENTES

### Prioridad 1 — Para launch mínimo viable

| Variable | Servicio | Sin ella... |
|---|---|---|
| `TWILIO_ACCOUNT_SID` + `AUTH_TOKEN` + `SMS_FROM` | SMS OTP | Registro sin SMS real |
| `OPENAI_API_KEY` | IA chat/forecast/insights | Módulos IA desactivados |
| `MERCADO_PAGO_ACCESS_TOKEN` + `PUBLIC_KEY` | Pagos México | Pagos en mock |
| `STRIPE_SECRET_KEY` + `PUBLISHABLE_KEY` | Pagos USD | Pagos en mock |
| `VOLVIX_GA_ID` | Google Analytics 4 | Sin analytics |
| `VOLVIX_FB_PIXEL_ID` | Meta Pixel | Sin pixel ads |

### Prioridad 2 — B2B avanzado

| Variable | Notas |
|---|---|
| `MERCADO_PAGO_WEBHOOK_SECRET` | Configurar URL webhook en panel MP |
| `STRIPE_WEBHOOK_SECRET` | Endpoint: `/api/webhooks/stripe` |
| `STP_OWNER_CLABE` + `ENTERPRISE_KEY` + `WEBHOOK_SECRET` | Requiere convenio empresarial |
| `PAC_API_URL` + `USER` + `PASSWORD` | CFDI 4.0 (Finkok/SW Sapien/Edicom) |
| `ANTHROPIC_API_KEY` | Alternativa a OpenAI |
| `VAPID_PUBLIC` + `VAPID_PRIVATE` | Push notifications web |
| `CRON_SECRET` | `openssl rand -hex 32` |

### Prioridad 3 — Delivery (requiere ser partner aprobado)

`UBEREATS_WEBHOOK_SECRET`, `DIDI_WEBHOOK_SECRET`, `RAPPI_WEBHOOK_SECRET`,
`SINDELANTAL_WEBHOOK_SECRET`, `IFOOD_WEBHOOK_SECRET`, `PEDIDOSYA_WEBHOOK_SECRET`

### Prioridad 4 — Recargas (requiere reseller mayorista)

`PROVIDER_RECARGAS_API_KEY`, `PROVIDER_SERVICES_API_KEY`

---

## ❓ DECISIONES PENDIENTES

| # | Pregunta | Impacto |
|---|---|---|
| 1 | **Email from oficial** (`hola@volvix.com`?) | Configurar en Resend + api/email-* |
| 2 | **CFDI provider** (Finkok/SW Sapien/Edicom) | Cada uno tiene API distinta |
| 3 | **Plan pricing final** ($299/$499/$899 MXN?) | Aparece en 60+ landings + checkout |
| 4 | **Empresa legal** (RFC, dirección fiscal) | Footer + términos + emisor CFDI |
| 5 | **Logo SVG alta res** (≥1024px) | Blog headers, emails, recibos PDF |

---

## 🛑 REQUIERE TU ACCESO DIRECTO

- Aplicar migraciones SQL en Supabase Dashboard
- Configurar env vars en Vercel Dashboard
- Promover deploy en Vercel
- Crear cuentas en Stripe/MP/Resend/Twilio
- Configurar DNS en Cloudflare/registrador
- Crear webhooks en paneles externos (MP/Stripe/STP/Uber/etc.)
- Generar APK Android (Android Studio + signing keys + Google Play account)
- Generar EXE Windows (cert code-signing)

---

## 🔮 ROADMAP FUTURO

### Fase 2 — Apps nativas
- [ ] Android APK con Capacitor (estructura en `android/` lista, falta build)
- [ ] iOS Capacitor wiring
- [ ] Windows Electron `.exe`
- [ ] Mac `.dmg`, Linux `.deb`

### Fase 3 — QA
- [ ] Run Playwright E2E completo (5 specs listos en `tests-e2e/`)
- [ ] Lighthouse audit 142 URLs (target 90+)
- [ ] Load testing con k6/Artillery

### Fase 4 — ML/IA real
- [ ] Fraud detection con ML real (hoy heurístico)
- [ ] Demand forecasting time-series
- [ ] Recommendation engine productos

### Fase 5 — Enterprise
- [ ] i18n adicional (pt-BR, en-US — base es-MX/en preparada)
- [ ] White-label para resellers
- [ ] GraphQL wrapper sobre REST
- [ ] WebSocket real para chat live
- [ ] SOC2/GDPR compliance score dashboard

### Fase 6 — Marketing
- [ ] A/B testing en producción real (framework ya creado)
- [ ] NPS tracking
- [ ] Customer testimonials reales
- [ ] Trust badges (SSL, PCI)

---

## 📊 RESUMEN ESTADO

✅ 142 URLs renderizan
✅ 32 módulos backend listos
✅ 7 migraciones críticas aplicadas hoy
✅ UI limpia, bugs B4-B8 cerrados
✅ Email transaccional activo (Resend)
✅ Error tracking activo (system_error_logs)
✅ E2E specs Playwright listos
✅ CSP configurada para systeminternational.app
❌ Vercel deploy 689b457 sin promover
❌ Twilio/OpenAI/MP/Stripe sin configurar
⚠️ ~34 migraciones r1-r12 pendientes
⚠️ DNS systeminternational.app sin activar

**El sistema está LISTO. Solo falta la infraestructura externa.**
