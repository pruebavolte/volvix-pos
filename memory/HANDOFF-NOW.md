# HANDOFF-NOW.md — Estado al cerrar sesión

**Fecha**: 2026-04-28
**Razón cierre**: Ventana de contexto al ~100%, respaldo preventivo.
**Score**: 84/100 (post-B43, +19 desde 65)
**Producción**: https://volvix-pos.vercel.app
**SW Version**: v1.12.2-b43 (PROGRESS dice esto, pero sw.js todavía dice v1.11.1-b42 — BUMP PENDIENTE)
**API**: 16,931 líneas / 628 endpoints

---

## ÚLTIMA TAREA EN PROGRESO

Estábamos en **B43 post-Wave 1**, cerrando bugs Tier 1+2 detectados en B42 Audit Fibonacci.

Acabamos de aplicar 4 post-fixes manuales encima de la Wave 1 (5 agentes paralelos):
1. Returns shadow fix: removed `/api/returns` de POSTKEYS array (api/index.js ~3544)
2. Returns POST schema fix: pos_sales no tiene tenant_id, query por id + verify pos_user_id
3. Quotations UUID→TEXT migration (pos_quotations.tenant_id)
4. Tickets cross-tenant leak fix (filter por JWT tenant)

Smoke final: **28/28 endpoints OK**.

**Bloques en orden (esta sesión = B41 → B43)**:
- B41: Multi-tenant verification + 18 endpoints (5 agentes)
- B42: Audit Fibonacci 1-1-2-3-5-8 (20 agentes, 18 módulos auditados)
- B43: Wave 1 (5 agentes, cerrar gaps Tier 1+2)
- B43 post-fixes: 4 fixes manuales + smoke 28/28

---

## SIGUIENTE PASO INMEDIATO (al continuar)

### 1. BUMPEAR sw.js VERSION → v1.12.2-b43 (P0)
- Editar línea 15 de sw.js: `const VERSION = 'v1.12.2-b43';`
- Deploy: `vercel --prod --yes`
- Sin esto, clientes con caché viejo NO ven los fixes.

### 2. INVESTIGAR MVP-8 cierre-z `sales_count:0` (P1)
- Handler en api/index.js: `GET /api/reports/cierre-z` (~línea 7800)
- Síntoma: para fecha con 304 ventas reales, devuelve `{ sales_count: 0 }`
- Hypothesis: filtra por `tenant_id` UUID pero pos_sales tiene tenant_id TEXT
- Test: `curl -s "https://volvix-pos.vercel.app/api/reports/cierre-z?date=2026-04-28&tenant_id=TNT001" -H "Authorization: Bearer <jwt>"`
- Fix probable: usar resolveOwnerPosUserId(tenantId) + filter por pos_user_id

### 3. DEVOLUCIONES POST refund_amount:0 (P1)
- Frontend (`salvadorex_web_v25.html`) envía `items: [{product_id, qty, price}]`
- Backend (api/index.js ~3300) espera `items_returned: [{...}]`
- Fix: aceptar AMBOS shapes en handler O normalizar en front
- Validar pos_returns rows tienen `total > 0`

### 4. COTIZACIONES items column mismatch (P2)
- pos_quotations.items JSONB existe
- Handler INSERT envía `line_items` (legacy)
- Fix: rename en handler O ALTER ADD COLUMN line_items

### 5. POS UI 33 PARTIAL buttons (P2)
- W1-E quedó incompleto (quota cut)
- Re-correr Playwright `tests/pos-ui-partial-buttons.spec.js`
- Cada botón: cablear handler O eliminar del DOM

---

## ARCHIVOS ABIERTOS / TOCADOS RECIENTEMENTE

```
api/index.js                        — 16,931 líneas / 628 endpoints
salvadorex_web_v25.html             — 8,790 líneas (Devoluciones+Promociones+Cotizaciones)
sw.js                               — VERSION pendiente bump
migrations/b43-pos-returns.sql
migrations/b43-promotions.sql
migrations/b43-owner-panel-fix.sql
migrations/b43-recargas.sql
migrations/b43-service-payments.sql
B43_MASTER_REPORT_V2.md             — reporte master
memory/PROGRESS.md                  — estado completo (recién actualizado)
memory/CONTEXT.md                   — URLs/creds/stack (recién creado)
memory/DECISIONS.md                 — 15 decisiones técnicas (recién creado)
memory/HANDOFF-NOW.md               — este archivo
```

---

## BUGS PENDIENTES (priorizado)

| # | Bug | Severidad | Línea aprox |
|---|-----|-----------|-------------|
| 1 | sw.js VERSION desincronizada (v1.11.1 vs v1.12.2) | P0 | sw.js:15 |
| 2 | MVP-8 cierre-z sales_count:0 (fix deployed pero no funciona) | P1 | api/index.js:~7800 |
| 3 | Devoluciones POST refund_amount:0 (items shape) | P1 | api/index.js:~3300 |
| 4 | Cotizaciones items column mismatch | P2 | api/index.js + pos_quotations |
| 5 | 33 PARTIAL POS UI buttons (W1-E quota) | P2 | salvadorex_web_v25.html |
| 6 | Recargas/Servicios UI completa pendiente | P2 | salvadorex_web_v25.html |
| 7 | AI Modules 39/100 — bloqueado por ANTHROPIC_API_KEY | P3 | Vercel env |

---

## BLOQUEADOS POR EXTERNAL (NO continuar sin acción del usuario)

| # | Servicio | Acción requerida | Tiempo Claude |
|---|----------|------------------|---------------|
| 1 | **Facturama CFDI** | Pasarme creds + RFC | 5 min activar |
| 2 | **Stripe** | Crear products en Dashboard + secret key | 10 min cablear |
| 3 | **WhatsApp/Wasender** | API key | 5 min activar |
| 4 | **Email SMTP** | SendGrid o Gmail creds | 5 min activar |
| 5 | **ANTHROPIC_API_KEY** | Set en Vercel env (1 click) | 0 min — desbloquea AI 39→90 |
| 6 | **Android keystore** | keytool + key alias | 10 min build |
| 7 | **iOS** | Mac + Apple Dev account ($99/año) | 30 min build |
| 8 | **Custom domain** | Comprar volvix.com + DNS | 15 min setup |

**Usuario dijo**: "te voy a dar ahorita lo de facturama" — tener listo el handler.

---

## COMANDOS ÚTILES PARA RETOMAR

```bash
# Verificar estado prod
curl -s https://volvix-pos.vercel.app/api/health | jq

# Login local
cd "C:\Users\DELL\Downloads\verion 340"

# Deploy a producción
vercel --prod --yes

# Aplicar migration
supabase db query --linked < migrations/<file>.sql

# Reload PostgREST schema
supabase db query --linked -c "NOTIFY pgrst, 'reload schema';"

# Smoke test 28 endpoints
node scripts/smoke-test.js
# o curl directo a /api/health, /api/products, etc.

# Local dev
vercel dev
```

---

## COHERENCE CHARTER — REGLAS AL RETOMAR

Per `C:\Users\DELL\.claude\CLAUDE.md`:
1. **R1**: Label↔Handler — verificar cada botón hace LITERALMENTE lo que dice
2. **R2**: Form validation Zod-first — schema obligatorio
3. **R3**: Loading + Error + Success states siempre visibles
4. **R4**: RLS verification — toda tabla nueva con WITH CHECK
5. **R5**: Self-walkthrough antes de "done"
6. **R6**: Adversarial pass (Saboteur/NewHire/Security)
7. **R7**: NO mentir — verificar con E2E, no asumir

Per `D:\github\volvix-pos\CLAUDE.md`:
- **Auditor chat**: https://claude.ai/chat/455d7e93-082b-48d3-8f46-3e57301cd9fb
- **REGLA DE ORO**: NUNCA decidir UX/diseño solo. Preguntar al chat auditor primero, ejecutar al pie de la letra, verificar con auditor.
- Después de CADA cambio: reportar al chat auditor, NO quedarse idle.

Per `D:\github\COPIADOR Y PEGADOR\CLAUDE.md`:
- Si terminas tarea sin saber qué sigue → `notify_supervisor("...")` (roboot @ localhost:5050)
- Supervisor: sesión "Create a robot implementation"

---

## SCORE FINAL POR MÓDULO (post-B43)

```
🥇 MultiPOS Suite       100  ⭐ PERFECT
🥈 Etiquetas             96
🥉 Customers + Crédito   94
   Reportes              92
   Cortes                92
   Multi-tenant Users    90
   Owner Panel           90
   Kiosko                88
   Inventario            85
   Vendor Portal         85
   POS UI Browser        85
   --- production-ready cut ---
   KDS Comandero         80
   Promociones           80
   Servicios             80
   Cotizaciones          80
   Marketplace+Customer  75
   Recargas              75
   --- needs work ---
   Devoluciones          60
   AI Modules            39  (BLOCKED: ANTHROPIC_API_KEY)
```

**Promedio**: 84/100. **11/18 módulos en 85%+**.

---

## MENSAJE EXACTO PARA NUEVA SESIÓN

```
Lee EN ORDEN:
1. memory/HANDOFF-NOW.md (este — tarea exacta siguiente)
2. memory/PROGRESS.md (estado B1-B43)
3. memory/CONTEXT.md (URLs/creds/stack)
4. memory/DECISIONS.md (por qué algo está así)

Continúa desde "SIGUIENTE PASO INMEDIATO":
1) Bumpear sw.js a v1.12.2-b43 + deploy
2) Investigar MVP-8 cierre-z sales_count:0
3) Fix Devoluciones items shape mismatch
4) Fix Cotizaciones items column

Aplicar Coherence Charter R1-R7. NO mentir. Verificar con E2E.
Si te atoras 2x en mismo bug → escalar a Opus 4.7M (S4).
Si terminas sin tareas → notify_supervisor() (NO quedarse idle).
```

---

## ⚠️ NO HACER

- No re-leer api/index.js completo (16,931 líneas — usa grep)
- No re-applyar migrations ya aplicadas (b41/b42/b43-* ya están)
- No commitear sin instrucción explícita
- No decidir UX solo — preguntar al chat auditor
- No marcar done sin smoke test

## ✅ HACER

- Bumpear sw.js + deploy primero (P0)
- Investigar MVP-8 cierre-z (P1)
- Fix devoluciones shape (P1)
- Smoke test después de cada deploy
- Reportar al chat auditor cada cambio
