# SPEC — Fusión en UN producto: systeminternational.app (POS) + negocio.international
Fecha: 2026-08-23 · Estado: PROPUESTA VERIFICADA (descubrimiento por 7 agentes sobre código real + 3 revisiones adversariales + conteos en DB) · Dueño: Erick (GrupoVolvix)

## 0. Hechos verificados (no supuestos)
- Los 3 sitios YA comparten la DB única `vnruooisqnbqguavrdvd` (probado por runtime; `zhvw` y `bynv` son legacy muertos desde jul-2026).
- POS: vanilla HTML/JS + Node (api/index.js 44k líneas), Railway, sesión = JWT custom HS256 en **localStorage.volvix_token** (NO cookie), 100% rutas root-absolutas (`/api/...`, `/auth-gate.js`).
- Negocio: Next.js 15, Railway, sesión = Supabase Auth (auth.users) cookie `sb-*`.
- Identidad HOY (conteo real en vnru): pos_users=192 · con auth.users mismo id=2 · por email con id distinto=6 · **SIN auth.users=184** · auth.users=74 · neg_profiles=44 (0 huérfanos) · pos_companies=138 · **pos_tenants=0** (tabla muerta; "suspender tenant" de volvix-admin-saas escribe ahí → la suspensión NO funciona hoy) · personas=59.
- Puentes que YA existen: (1) negocio→POS login bridge (`src/lib/pos-auth-bridge.ts`: replica la contraseña del POS a auth.users — doble almacén de credencial); (2) "Entrar al POS" (`api/admin/entrar-pos` → magic link → `public/auth-callback.html` → `POST /api/auth/oauth/google/exchange` L9097); (3) provisioning `lib/pos-account-link.ts` (crea pos_users con id = auth.users.id); (4) product-import.
- Bugs reales encontrados (independientes de la fusión):
  - `GET /api/licencias` (api/index.js ~L41366) filtra `pos_companies?id=eq.TNT-…` → siempre vacío → "plan free/inactiva".
  - `DEFAULT_TENANT_STATE.status='active'` hardcodeado (salvadorex-pos.html ~L7340) + enforcement solo en localStorage → NO hay kill switch server-side.
  - Exchange Google (L9141/L9153) auto-crea `pos_users` con id `USR-<base36>` → requireAuth lo rechaza (exige UUID) → token inservible.
  - Negocio `api/auth/login` banea PERMANENTE (876000h) al 3er fallo a todo no-admin; y llama al bridge en TODO fallo → sobrescribe la contraseña de auth.users con la del POS.
  - Tres resolvedores de tenant distintos con fallback `TNT001`.
  - Electron (`electron/main.js` L44) y Capacitor (`capacitor.config.json`) apuntan a `volvix-pos.vercel.app` / `zhvw` (hosts muertos).
  - `linkPersona` (pos-account-link.ts L268-281) puede escribir `profile_id` inexistente en auth.users; `entrar-pos` crea auth.users "a ciegas" si falla generateLink.

## 1. Arquitectura elegida (C corregida = un dominio raíz + subdominio para el POS + SSO por handoff de token)
- **Raíz `<dominio>`** = negocio (Next): landing, registro/pago, licencias, admin interno, WhatsApp.
- **`pos.<dominio>`** = servicio Railway del POS, DIRECTO (sin proxy Next). Razón: el POS es root-absoluto (proxy por prefijo `/pos/*` NO es viable; `<base href>` no aplica a `/api/...`), CSP distinta, IPv6 privado, timeouts de proxy, colisiones `/api/auth/login` y `/api/push/subscribe`.
- `systeminternational.app` queda VIVO como alias del POS durante toda la transición.
- **SSO = handoff por token** (la sesión POS es localStorage; "cookie compartida" es imposible): negocio autentica con Supabase → server-to-server `POST pos/api/auth/sso-exchange` (NUEVO, protegido con `SSO_SHARED_SECRET` + HMAC + TTL; NO con X-API-Key vlx_* que es tenant-scoped) → recibe `volvix_token` → redirige a `https://pos.<dominio>/auth-callback.html#token=…` → auth-callback lo guarda en localStorage. Renovación al expirar (8h): auth-gate.js manda a `<raíz>/login?redirect=` en vez de login.html.
- **Identidad canónica**: `auth.users` = fuente para DUEÑOS/ADMINS. `pos_users` gana columna `auth_user_id` (NO renumerar `pos_users.id`: 81 queries FK). Altas nuevas: `pos_users.id = auth.users.id` (ya lo hace pos-account-link). Nativos (184): se vinculan al primer login en la raíz (reset de contraseña obligatorio: el hash scrypt NO es migrable a Supabase Auth).
- **Cajeros/empleados** (creados por `POST /api/users`): SIGUEN con login nativo del POS. `POST /api/login` NO se apaga NUNCA. Alcance del SSO = dueños + plataforma.
- **Resolvedor de tenant ÚNICO** en el POS: `pos_companies.tenant_id` (vía company_id) > `pos_users.tenant_id` > `notes.tenant_id`; PROHIBIDO fallback `TNT001`.
- **Licencias**: `pos_companies.{plan,status,is_active}` = verdad. Regla FAIL-OPEN: sin fila / 5xx / sin red ⇒ NO bloquear; bloquear solo con status ∈ {suspended, revoked, expired} explícito. Enforcement server-side en requireAuth (cache corto) + sso-exchange; requireAuth lee `pos_revoked_tokens` (hoy solo se escribe).

## 2. Fases (cada una desplegable sola; F1-F3 reversibles)
- **F0 Verificación** (HOY, parcial): conteos ✅; trigger `trg_persona_desde_profile` → `neg_profiles` ✅. Falta: leer env reales en Railway de ambos servicios (sin imprimir keys); allow-list de Redirect URLs en Supabase Auth incluye `…/auth-callback.html`; comprobar si vnru usa JWT signing keys asimétricas (si sí, validar tokens Supabase vía `auth.getUser`, no HS256).
- **F1 Licencias + bugs (aditivo, bajo riesgo)**: fix `GET /api/licencias` (filtro `tenant_id`); backfill `pos_companies` para tenants que solo viven en JWT/notes; POS lee licencia al arrancar y cada N min (fail-open, detrás de flag); negocio `api/admin/validar` al validar pago PATCH `pos_companies {plan,status:'active',is_active}`; `GET /api/licencia/estado` lee también pos_companies; admin-saas suspende en `pos_companies` (no en pos_tenants); negocio: ban permanente → lockout 15 min; bridge solo si NO existe auth.users con contraseña; fix linkPersona/entrar-pos a ciegas.
- **F2 Dominio único (bajo-medio)**: DNS `pos.<raíz>` → servicio POS; agregar a `ALLOWED_ORIGINS`; CSP del POS intacta (Next no la toca); Redirect URLs Supabase; systeminternational.app sigue igual.
- **F3 SSO (medio; el camino viejo sigue vivo)**: `POST /api/auth/sso-exchange` nuevo (resuelve por `id=auth_user_id` → columna `auth_user_id` → email como último recurso; NUNCA auto-crea; 404 ⇒ negocio provisiona con pos-account-link); corregir exchange Google (no más `USR-base36`); auth-gate.js renueva vía raíz; negocio deja el bridge para usuarios con auth.users; registro.html del POS → `/registro` de la raíz; admin: volvix-admin-saas/launcher enlazados desde `/admin` con sso-exchange (superadmin ↔ esOwner).
- **F4 Convergencia de datos (NO reversible; dry-run + backup)**: columna `pos_users.auth_user_id`; vinculación lazy de los 184 nativos (auth.admin.createUser + reset al primer login); dedupe pos_companies por persona; migrar escrituras pos_tenants → pos_companies.
- **F5 Limpieza (solo con F4 al 100%)**: (sin 301: ambos dominios viven) corregir targets de Electron/Capacitor (ya obsoletos) + release; retirar pos-auth-bridge.ts; apagar el REGISTRO público del POS (NO el login); destino de ~320 landings SEO; unificar push/VAPID y WhatsApp (decisión de producto).

## 3. Decisiones del dueño
1. ✅ DECIDIDO (2026-08-23): **los DOS dominios sobreviven y siguen funcionando** (`systeminternational.app` = POS, `negocio.international` = negocio), los 3 sitios sobre la misma DB vnru. Consecuencias: NO hay 301 ni dominio perdedor; NO hace falta `pos.<raíz>` (el host del POS ya es systeminternational.app); la fusión = identidad única (SSO por handoff de token entre dominios) + licencias coherentes + puentes ya existentes endurecidos. F2 se reduce a: Redirect URLs de Supabase Auth + ALLOWED_ORIGINS si negocio llama al API del POS desde el navegador (hoy es server-to-server).
2. Marca única: "Volvix" vs "SalvadoreX".
3. Modelo comercial: ¿sigue el trial gratis de registro.html o toda alta pasa por preventa/pago? ¿Licencia única por transferencia (negocio) vs suscripción Stripe (POS)? ¿Qué `plan` escribe una licencia comprada?
4. Nativos del POS (184): aceptar reset de contraseña al primer login en la raíz (único camino técnico).
5. Canal WhatsApp oficial (bridge del dueño vs Meta/Wasender/Twilio del POS).
6. Admin único: OWNER_EMAIL (negocio) ↔ superadmin/@systeminternational.app (POS).

## 4. Lo que NO se hace (objeciones aceptadas de la revisión)
- NO proxy por prefijo `/pos/*`; NO "SSO por cookie"; NO verificar JWT Supabase dentro de `verifyJWT/requireAuth`; NO reutilizar X-API-Key para SSO; NO apagar `POST /api/login`; NO renumerar `pos_users.id`; NO migrar password_hash (imposible).
