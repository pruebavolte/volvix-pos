# BLOCKERS — cosas que NO se cerraron 100% y por qué

> Items que requieren input del owner o infraestructura externa antes de continuar.

## 1. AGENTE 0 — Verificación experimental incompleta

### 1.1 — Test DoS contra `/api/auth/register-simple` (B-MKT-5)
**No ejecutado**: significa 50 POST contra producción en vivo (DoS-like). Evidencia equivalente obtenida por inspección de código: handler tiene `rateLimit=True, captcha=False`.

**Necesito del owner**:
- Autorización explícita para load-test contra endpoint en vivo, **O**
- Claves de Cloudflare Turnstile o reCAPTCHA v3 para implementar captcha real

### 1.2 — Cold-start OTP (B-MKT-4)
**No ejecutado**: significa registro real en producción con email/teléfono válidos.

**Necesito**:
- Cuenta de prueba con email/SMS que puedan recibir OTP, **O**
- Autorización para crear tenant de prueba (luego eliminar)

### 1.3 — Fugas cross-tenant (B-X-1/2/3)
**Confirmado por código, NO experimentalmente**.

**Necesito**:
- 2 cuentas tenant en staging, **O**
- Autorización para crear/eliminar 2 tenants en producción

### 1.4 — Tabla `business_giros` físicamente en Supabase (B-MKT-6)
**Necesito**:
- MCP de Supabase activado, **O**
- Owner ejecuta `SELECT count(*) FROM business_giros` y comparte output

---

## 2. AGENTE 4 — Hardening Panel

### 2.1 — TOTP / 2FA Server
**Decisiones de infra**:
- ¿Librería: otpauth, speakeasy, otro?
- ¿Backup recovery codes: donde se guardan cifrados?
- ¿Quién envía el QR de setup (email transaccional)?

### 2.2 — IP Allowlist
- ¿IPs estáticas individuales o rangos CIDR?
- ¿Geo-restricción solo MX?
- ¿Modo "primer login registra IP" o lista manual?

### 2.3 — Email al cliente impersonado (B-PNL-5)
- ¿Servicio de email: Resend, SendGrid, Postmark, SES?
- ¿Template del mensaje?
- ¿Política: notificar siempre o solo si duración > X min?

---

## 3. AGENTE 6 — Fiscal IVA

### 3.1 — Tasas por giro (decisión fiscal MX)
- ¿16% para todos siempre, o hay tasa 0% (libros, alimentos basicos)?
- ¿Tasa frontera 8% — algún cliente actual?
- ¿IEPS aplica a qué categorías (alcohol, tabaco, bebidas saborizadas)?
- ¿IVA antes o después del descuento? **Default conservador propuesto: después**

### 3.2 — Migración tenants existentes
- ¿Default 16% para todos?
- ¿O `null` + forzar configuración al primer corte?

---

## 4. AGENTE 11 — ADR-004 (DROP de tablas legacy)
**Acción IRREVERSIBLE**. Requiere:
- Respaldo verificado de Supabase
- Aprobación explícita del owner
- Ventana de mantenimiento
- Notificación a usuarios de scripts externos

---

## 5. Deploy autónomo de los 14 agentes
14 agentes con cambios masivos sin revisión humana en SaaS con clientes reales es alto riesgo. Necesito aprobación por agente, no de los 14 de golpe.

---

## 7. Hallazgos durante ejecucion de agentes

### 7.1 — B-PNL-4 (banner impersonation) ERA FALSO POSITIVO
El banner YA EXISTE en salvadorex-pos.html linea 3385. Es muy completo (muestra nombre, giro, plan, tid, "MODO SOPORTE", timer, boton "Cerrar vista"). No hizo falta implementarlo.

### 7.2 — B-PNL-5 (notif al cliente) PARCIAL
El handler /api/admin/tenant/:id/impersonate (linea 39850) YA tiene audit log obligatorio
en `tenant_impersonation_log` con fail-closed. Lo que FALTA:
- Notificacion activa al cliente (email a su correo registrado)
- Necesita: cuenta de email transaccional (Resend, SendGrid, Postmark, SES)
- Implementacion: trigger PostgreSQL o cron que detecta nuevos rows y envia email

### 7.3 — AGENTE 4 2FA stubs entregados
- Tabla admin_2fa_secrets creada en R34_PANEL_HARDENING.sql
- Endpoints stub /api/admin/me/2fa/{status,setup,verify} retornan 501 NOT_IMPLEMENTED
- Para activacion real necesito:
  * Libreria TOTP en Node: `otpauth` (recomendado) o `speakeasy`
  * Modulo qrcode para generar QR del setup
  * Servicio email transaccional para enviar QR al admin

### 7.4 — AGENTE 4 IP allowlist + Sesiones — endpoints entregados
- Tablas admin_ip_allowlist y admin_sessions creadas en R34
- Endpoints GET/POST /api/admin/ip-allowlist funcionales
- Endpoints GET /api/admin/me/sessions + POST /revoke-all funcionales
- UI en /paneldecontrol.html (tab Seguridad) PENDIENTE — diseno simple lista para conectar

### 7.5 — AGENTE 5 enforceFeature middleware entregado
- Tabla pos_tenant_module_permissions creada en R33_ENFORCEMENT_CROSS.sql
- Funcion global.enforceFeature(featKey)(handler) registrada
- Aplicada a POST /api/sales (feature 'cobrar'), POST /api/returns (feature 'devoluciones'),
  GET /api/reports/sales (feature 'reportes')
- Fail-open: si tabla no existe o consulta falla, permite la request (no rompe sistema actual)

### 7.6 — Cliente POS poll /api/app/config cada 60s
- Implementado en salvadorex-pos.html
- Primer poll al volvix:login + setInterval cada 60s
- Maneja 304 Not Modified (eficiente)
- Aplica state hidden/locked/enabled a elementos con data-feature

### 7.7 — Captcha en /api/auth/register-simple
PENDIENTE de claves del owner:
- CAPTCHA_SITE_KEY (publica, inyectable en HTML)
- CAPTCHA_SECRET_KEY (privada, .env de Vercel)
- Provider sugerido: Cloudflare Turnstile (gratis, sin friction al usuario)

## 9. PASOS HUMANOS pendientes (decisiones del owner ya tomadas, falta acción humana)

> Estado actualizado tras ejecución del bloque "procede con todo".

### 9.1 — Variables de entorno en Vercel
Owner debe ir a Vercel → Project Settings → Environment Variables y agregar:

| Variable | Valor | Para qué |
|---|---|---|
| `RESEND_API_KEY` | (generar en resend.com) | Email transaccional para notificar impersonation |
| `RESEND_FROM` | `Volvix <no-reply@systeminternational.app>` | Dirección remitente (requiere DNS verificado en Resend) |
| `TURNSTILE_SITE_KEY` | (generar en cloudflare.com → Turnstile) | Captcha en registro.html |
| `TURNSTILE_SECRET_KEY` | (idem, secret) | Validación server-side de Turnstile |
| `CAPTCHA_ENABLED` | `true` | Activar el middleware de captcha (default `false` = fail-open) |
| `ALLOW_TEST_TENANTS` | `true` durante pruebas, `false` después | Habilita endpoint admin de test-tenant |

### 9.2 — Crear cuenta en Resend (humano, ~3 min)
1. Ir a https://resend.com/signup
2. Crear cuenta con email del owner
3. Verificar email
4. Domains → Add Domain → `systeminternational.app`
5. Copiar registros DNS que muestra (4 registros: SPF, DKIM x2, MX)
6. **Pegar registros en Cloudflare DNS** del dominio (zona DNS del owner)
7. Esperar verificación (5-30 min)
8. API Keys → Create → copiar key, pegar en Vercel como `RESEND_API_KEY`

### 9.3 — Crear cuenta en Cloudflare Turnstile (humano, ~3 min)
1. Ir a https://dash.cloudflare.com → Turnstile (si no tiene cuenta, crear primero)
2. Add Site → Domain: `systeminternational.app`
3. Widget type: "Managed" (recomendado)
4. Copiar Site Key + Secret Key
5. Pegar en Vercel: `TURNSTILE_SITE_KEY` (pública, va al HTML) y `TURNSTILE_SECRET_KEY` (secret)
6. Setear `CAPTCHA_ENABLED=true` en Vercel
7. Agregar widget al HTML de `registro.html` (yo ya dejé `body.captcha_token` en el POST; solo falta agregar `<div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>` antes del botón submit — owner puede hacerlo en 1 línea)

### 9.4 — Ejecutar migración SQL en Supabase
Owner debe ejecutar en Supabase SQL Editor:
1. `db/R32_TAX_CONFIG.sql` (AGENTE 6)
2. `db/R33_ENFORCEMENT_CROSS.sql` (AGENTE 5)
3. `db/R34_PANEL_HARDENING.sql` (AGENTE 4)
4. `db/R35_ADR-004_DROP_LEGACY.sql` (AGENTE 11 / ADR-004)

Sin estas migraciones aplicadas, los endpoints retornan datos vacíos (fail-open intencional para no romper sistema actual).

### 9.5 — npm install otpauth qrcode resend
En Vercel build, el `package.json` ahora incluye estas dependencias. El siguiente deploy las instalará automáticamente. No requiere acción manual del owner.

## 11. BLOCKER CRÍTICO — 7 verificaciones experimentales NO ejecutadas

**Situación**: el owner autorizó crear T_A y T_B en producción. Implementé el endpoint admin `/api/admin/test-tenant/create` que crea tenants sin OTP, gated por:
- Header `Authorization: Bearer <JWT_superadmin>` (requiere JWT del owner)
- Variable env `ALLOW_TEST_TENANTS=true` (debe setearse en Vercel)

**Yo NO tengo**:
- JWT del platform_owner (las credenciales `grupovolvix@gmail.com` / `123456789` que el owner mencionó antes son del browser interactivo; no me las puede pasar para uso programático sin que las exponga, y por política de seguridad NO debo recibir/usar passwords aunque me las pasen)
- Acceso al dashboard de Vercel para setear `ALLOW_TEST_TENANTS=true`

**Opciones para desbloquear** (decisión del owner):

**A) Owner provee un JWT de service-account creado para esta tarea**:
   - En Vercel env: setear `ALLOW_TEST_TENANTS=true` por 24h
   - Generar JWT manualmente con `node -e "console.log(require('jsonwebtoken').sign({role:'superadmin',email:'test@volvix.local',tenant_id:null}, process.env.JWT_SECRET, {expiresIn:'2h'}))"`
   - Pegármelo en chat para que yo ejecute curl
   - Rotar JWT_SECRET después de las pruebas (invalida el JWT temp)

**B) Owner ejecuta las 7 pruebas él mismo** con instrucciones que dejo abajo, y me pega los resultados.

**C) Aceptar que las 7 quedan como "confirmadas por inspección de código" (lo que ya hice en AGENTE 0)** y avanzar.

### Las 7 pruebas (curl listos para ejecutar manualmente)

```bash
# Prerequisito: setear $TOKEN_A y $TOKEN_B (JWTs de los 2 tenants test)
# 1. Crear T_A
TOK_ADMIN=<jwt-superadmin>
T_A=$(curl -X POST https://systeminternational.app/api/admin/test-tenant/create \
  -H "Authorization: Bearer $TOK_ADMIN" -H "Content-Type: application/json" \
  -d '{"slug":"a","giro":"abarrotes"}')
TOKEN_A=$(echo $T_A | jq -r .token)
TID_A=$(echo $T_A | jq -r .tenant_id)
# Idem T_B
T_B=$(curl -X POST https://systeminternational.app/api/admin/test-tenant/create \
  -H "Authorization: Bearer $TOK_ADMIN" -H "Content-Type: application/json" \
  -d '{"slug":"b","giro":"cafe"}')
TOKEN_B=$(echo $T_B | jq -r .token)
TID_B=$(echo $T_B | jq -r .tenant_id)

# TEST 1: ¿Token T_B puede leer datos de T_A?
curl https://systeminternational.app/api/sales -H "Authorization: Bearer $TOKEN_B" | grep -i "$TID_A" && echo "FUGA!" || echo "OK aislado"

# TEST 2: Suspender T_A, ¿sigue cobrando?
curl -X POST https://systeminternational.app/api/admin/tenant/$TID_A/suspend \
  -H "Authorization: Bearer $TOK_ADMIN" -d '{"reason":"test"}'
sleep 5
curl -X POST https://systeminternational.app/api/sales \
  -H "Authorization: Bearer $TOKEN_A" -d '{}'  # Debe ser 403 (token revoked)

# TEST 3: Deshabilitar feature 'cobrar' para T_A, ¿endpoint rechaza?
curl -X POST https://systeminternational.app/api/admin/tenants/$TID_A/modules \
  -H "Authorization: Bearer $TOK_ADMIN" \
  -d '{"modules":{"cobrar":{"enabled":false}}}'
sleep 5
curl -X POST https://systeminternational.app/api/sales \
  -H "Authorization: Bearer $TOKEN_A"  # Debe ser 403 feature_disabled

# TEST 4: Override 'deny' para usuario X, ¿aplica al instante?
# (requiere endpoint /api/admin/user-override)

# TEST 5-7: Token de impersonación read-only
# (requiere endpoint /api/admin/tenant/:id/impersonate del owner real)

# CLEANUP siempre:
curl -X DELETE https://systeminternational.app/api/admin/test-tenant/$TID_A -H "Authorization: Bearer $TOK_ADMIN"
curl -X DELETE https://systeminternational.app/api/admin/test-tenant/$TID_B -H "Authorization: Bearer $TOK_ADMIN"
```

## 12. Resumen y plan ajustado por evidencia

De los 16 Bloqueantes inferidos: **3 DESCARTADOS** (B-MKT-1/2/3), **7 CONFIRMADOS por código**, **6 PARCIALES** (requieren verificación física/owner).

**Plan ajustado**:
1. Empezar con **AGENTE 6 (Fiscal IVA)** — único con impacto legal SAT
2. **AGENTE 8 (Unificar Estado)** — bug visible al usuario
3. **AGENTE 5 (Enforcement Cross)** — protege control real del platform_owner
4. **AGENTE 4 (Hardening Panel)** — requiere claves/decisiones del owner — stub primero
5. **AGENTE 7 (Stock local)** — bug confirmado
6. **AGENTE 1** reducido a captcha (los 3 endpoints ya existen)
7. AGENTES 2-13 según plan
