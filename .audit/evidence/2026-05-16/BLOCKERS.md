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

## 6. Resumen y plan ajustado por evidencia

De los 16 Bloqueantes inferidos: **3 DESCARTADOS** (B-MKT-1/2/3), **7 CONFIRMADOS por código**, **6 PARCIALES** (requieren verificación física/owner).

**Plan ajustado**:
1. Empezar con **AGENTE 6 (Fiscal IVA)** — único con impacto legal SAT
2. **AGENTE 8 (Unificar Estado)** — bug visible al usuario
3. **AGENTE 5 (Enforcement Cross)** — protege control real del platform_owner
4. **AGENTE 4 (Hardening Panel)** — requiere claves/decisiones del owner — stub primero
5. **AGENTE 7 (Stock local)** — bug confirmado
6. **AGENTE 1** reducido a captcha (los 3 endpoints ya existen)
7. AGENTES 2-13 según plan
