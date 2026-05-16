# PLAN MAESTRO FINAL — Volvix POS / Marketplace / Panel
> **Reemplaza** a todos los reportes anteriores. Sustenta toda la auditoría hecha hoy.
> **Alcance**: 3 ejes del negocio — `/` (marketplace), `/salvadorex-pos.html` (cliente final), `/paneldecontrol.html` (super-admin).
> **Modo**: pasos especifícos ejecutables por agentes especializados, sin estimaciones de tiempo.

---

## 0. Arquitectura real del sistema (descubierta auditando)

```
                    ┌─────────────────────────┐
                    │ systeminternational.app │  ← marketplace.html (landing)
                    │ (PUERTA DE ENTRADA)     │     · Buscador de giro IA
                    └────────┬────────────────┘     · 60 landings dedicadas + 1 dinámica
                             │                       · Capta leads y dispara registro
                             │
                ┌────────────┴────────────┐
                ▼                          ▼
        /registro.html              /login.html
        (OTP + tenant_id)           (sesión existente)
                │                          │
                └──────────┬───────────────┘
                           ▼
              /salvadorex-pos.html
              (operación diaria del cliente)
                           │
                           │ controlled by
                           ▼
              /paneldecontrol.html
              (super-admin platform_owner)
```

### Inventario consolidado (los 3 ejes)

| Archivo | Líneas | Botones | APIs invocadas | Storage keys |
|---|---|---|---|---|
| `marketplace.html` | 2,321 | 26 | 5 (giros/search, generate, classify, leads, downloads) | 8 |
| `registro.html` | 1,114 | (form-based) | 5 (register-simple, verify-simple, resend-otp, classify, autocomplete) | múltiples (cache) |
| `login.html` | 1,030 | (form-based) | 3 (login, password-reset, oauth/providers) | volvix_token |
| `landing_dynamic.html` + 60 landings | varía | 16 (genérico) | 1 (industry-seed) | gtag |
| `salvadorex-pos.html` | 23,536 | 249 | 30+ | varias |
| `paneldecontrol.html` | 9,118 | 68 | 75 (/api/admin/*) | volvix:overrides:* + token |

---

## 1. HALLAZGOS NUEVOS DEL MARKETPLACE (auditoría de hoy)

### 1.1 — Bloqueantes del marketplace

| ID | Defecto | Por qué importa |
|---|---|---|
| **B-MKT-1** | `/api/giros/search?q=` invocado en marketplace.html pero **NO existe handler en api/index.js** | Búsqueda nunca regresa resultados → usuario abandona |
| **B-MKT-2** | `/api/giros/generate` invocado para "crear giro con IA" → handler ausente | Si el giro no existe, el flujo se rompe completamente — el negocio entero gira en torno a este flow |
| **B-MKT-3** | `/api/giros/autocomplete?q=` invocado en registro.html → handler ausente | Usuario no ve sugerencias mientras escribe → fricción alta |
| **B-MKT-4** | OTP en memoria (`_otpStore = {}`) — código confiesa "Lost on cold start" | Vercel mata el lambda cada N minutos; usuarios que tardan ven "OTP inválido" sin razón aparente |
| **B-MKT-5** | Sin captcha en `/api/auth/register-simple` (solo rate-limit por IP) | Bot con pool de 100 IPs registra 100 tenants/15min |
| **B-MKT-6** | Tabla `business_giros` referenciada en backend pero **0 matches en código fuente** | Si la tabla no existe en Supabase, `/api/giros/list` cae siempre al fallback in-memory → catálogo es estático |

### 1.2 — Críticos del marketplace

| ID | Defecto |
|---|---|
| **C-MKT-1** | Botón "Panel SaaS" va a `volvix-owner-panel.html` (no a `/paneldecontrol.html`) — ¿son dos paneles distintos o residuo? |
| **C-MKT-2** | `isAuthed()` existe en marketplace pero no se verificó si redirige al POS automáticamente cuando hay sesión activa |
| **C-MKT-3** | `marketplace.html` tiene 0 `<input>` visibles — la búsqueda se monta dinámicamente con JS; si el JS falla, no hay fallback |
| **C-MKT-4** | 60 landings dedicadas + 1 dinámica = **3 fuentes de verdad** para describir un giro (landing-X.html, landing_dynamic.html?giro=X, giros-catalog.js) |
| **C-MKT-5** | Captura de leads en `/api/leads` sin validar fingerprint/CSRF — bot puede inundar la BD con leads falsos |
| **C-MKT-6** | `vlxTrackDownload('apk', 'android')` registra descargas en `/api/downloads/track` sin verificar que el archivo descargado existe |

### 1.3 — Altos del marketplace

- A-MKT-1: `localStorage.setItem('volvix:custom-giros', ...)` — giros generados por IA viven en cliente, no en BD → otros usuarios no los ven
- A-MKT-2: Sin loader visible durante `classifyWithAI()` — usuario no sabe si está pensando o congelado
- A-MKT-3: `escapeHtmlMP` existe pero no se usa en todas las inserciones de `g.name` dinámicas
- A-MKT-4: 60 landings con estructuras inconsistentes (tamaños desde 654 bytes hasta 43KB) — algunas son stubs (`landing-clinica-dental.html` = 654b)
- A-MKT-5: Sin manejo de error 429 (rate-limit) en cliente — usuario ve "fallo silencioso"
- A-MKT-6: `searchGiro()` no debouncea — cada tecla pega al endpoint

### 1.4 — Conexiones rotas Marketplace → POS

| Promesa del marketplace | Realidad en POS |
|---|---|
| "Tu giro será cafetería" → al entrar al POS, módulos relevantes activos | El POS arranca con módulos genéricos. `pos_giro_config` se carga pero `__volvixGiro` no siempre se aplica antes del render inicial |
| "Tu plan Free incluye X" | Plan se asigna en `/api/auth/register-tenant` pero no se vio middleware que lo aplique en POS |
| Landing dinámica de giro nuevo → registro → tenant queda con giro custom | Verificado: el giro generado por IA queda en `localStorage` (custom-giros), no en `business_giros` de BD → al re-login el giro se pierde |

---

## 2. HALLAZGOS PREVIOS (consolidación de los 12 reportes anteriores)

### 2.1 — Bloqueantes del POS (cuerpo adversarial)
- **B-POS-1**: `updateTotals()` no aplica IVA
- **B-POS-2**: Stock local no se decrementa post-venta
- **B-POS-3**: Pago mixto sin validar suma === total
- **B-POS-4**: Duplicate state CATALOG vs PRODUCTS_REAL

### 2.2 — Bloqueantes cross-archivo + panel (Anexo II)
- **B-X-1**: Toggle "ventas" off → cliente sigue trabajando (cache stale + JWT vivo)
- **B-X-2**: Toggle "pos.cobrar" off → endpoint `/api/sales` sigue aceptando
- **B-X-3**: Suspender tenant no invalida JWT activo
- **B-PNL-4**: Impersonation sin banner visible en POS
- **B-PNL-5**: Impersonation sin notificación al cliente
- **B-PNL-6**: platform_owner sin 2FA UI / IP allowlist / sesiones activas

### 2.3 — Críticos / Altos / Medios (17 + 13 + 7)
Detalle completo en `AUDITORIA-ADVERSARIAL-2026-05-16.md`. Resumen: override en localStorage, modo "hidden" cosmético, DELETE sin tipear nombre, folio client-side, optimistic UI sin rollback, `confirm()` browser destructivo, IVA hardcoded, cupón sin decrementar usage_count, sin UI para recuperar ventas pendientes, etc.

### 2.4 — ADRs propuestos
- ADR-001: Unificar `CATALOG` + `PRODUCTS_REAL` en `window.VolvixState`
- ADR-002: `SALES`/`CUSTOMERS` array posicional → objetos híbridos
- ADR-003: 6 sistemas tabs → `window.VolvixTabs.activate()`
- ADR-004: Canonizar `pos_*`, DROP de tablas legacy (`sales`, `volvix_ventas`)
- ADR-005: Diagrama state-machine de 5 modales de pago

### 2.5 — Overpromises sin corregir (Anexo I)
- Dashboard "Hoy/Semana/Mes": cosmético, KPIs hardcoded
- Aperturas anteriores: solo navega, no muestra historial real
- Feature flag plataformas: default visible, no hay toggle UI
- Sin verificación física: `printCorteSummary`, `exportCorteCSV`, `printAperturaSummary`, `toggleSaludAutoRefresh`, chips ventas

### 2.6 — 15 verificaciones experimentales pendientes (Anexo III)

Las 7 críticas para confirmar Bloqueantes:
1. ¿Token tenant B puede leer datos de tenant A?
2. ¿Cliente suspendido sigue cobrando?
3. ¿`/api/sales` rechaza si feature deshabilitada?
4. ¿Override aplica al instante?
5. ¿Token impersonación es read-only?
6. ¿JWT platform_owner accede a endpoints no-superadmin?
7. ¿Token impersonación se invalida al cerrar pestaña?

---

## 3. PLAN MAESTRO — por agentes y pasos específicos

> Estructura: cada **AGENTE** ejecuta un **MISIÓN** específica con pasos numerados. El owner decide qué agente lanzar. Los agentes son independientes y se pueden paralelizar donde no haya dependencia.

---

### AGENTE 0 — Verificador Experimental (CONFIRMA bloqueantes inferidos)
**Misión**: convertir los 10 Bloqueantes "inferidos" en "comprobados" antes de invertir esfuerzo en fixes.

**Pasos**:
1. Crear dos tenants de prueba con credenciales propias (T_A, T_B).
2. Obtener JWT de T_A. Llamar `GET /api/admin/tenants/<T_B_id>` con ese JWT → registrar status code.
3. Marcar tenant T_A como suspendido desde panel. Con su sesión vigente, intentar `POST /api/sales` → registrar si acepta o rechaza.
4. Deshabilitar módulo "ventas" para T_A desde panel. Con su sesión, intentar `POST /api/sales` → registrar respuesta.
5. Crear override "deny pos.cobrar" para usuario X de T_A. Loguearse como X, verificar si el override aplica sin re-login.
6. Llamar `POST /api/admin/tenant/<T_A>/impersonate` desde panel. Con el token retornado, intentar `POST /api/sales` → debe ser 403.
7. Cerrar la pestaña impersonada. Intentar reutilizar el mismo token → debe ser invalidado.
8. Llamar `GET /api/giros/search?q=cafe`, `POST /api/giros/generate` y `GET /api/giros/autocomplete?q=ca` → registrar si responden 404 o JSON real.
9. Escribir reporte en `.audit/VERIFICACION-EXPERIMENTAL.md` con tabla de 8 filas: prueba, resultado esperado, resultado real, severidad confirmada.
10. **No modificar código**. Solo reportar.

**Salida**: `.audit/VERIFICACION-EXPERIMENTAL.md` con tabla 8 × 4.

---

### AGENTE 1 — Marketplace Backend Reparador
**Misión**: implementar los 3 endpoints faltantes que el marketplace invoca + arreglar OTP persistente.

**Pasos**:
1. Verificar en Supabase si tabla `business_giros` existe. Si no, crear con columnas (`id`, `slug`, `name`, `industry_class`, `created_by`, `is_custom`, `created_at`).
2. Implementar `GET /api/giros/search?q=` en `api/index.js`: leer de `business_giros` con `ilike '%q%'` en `name` y `slug`, devolver `{ok, items: [{slug, name}], total}`.
3. Implementar `POST /api/giros/generate`: validar `text` no vacío, llamar a OpenAI (o lo que esté configurado) para clasificar, persistir en `business_giros` con `is_custom=true` y `created_by=<email>`, devolver `{ok, giro: {...}}`.
4. Implementar `GET /api/giros/autocomplete?q=`: idéntico a search pero limitado a 8 resultados + ordenado por relevancia (match prefix > match parcial).
5. Reemplazar `_otpStore = {}` por tabla `auth_otps` (email, otp_hash, expires_at, attempts). Hash bcrypt del OTP. Limpiar expirados con cron diario.
6. Agregar verificación de captcha (Cloudflare Turnstile gratis) en `/api/auth/register-simple` y `/api/auth/send-otp`. Sin captcha → 400.
7. Test manual: marketplace.html → buscar "café" → debe mostrar resultados reales. Buscar "vendedor de velas mágicas" → debe ofrecer "Crear con IA".
8. Commit + push.

**Salida**: 3 endpoints nuevos en producción + OTP persistente + captcha en registro.

---

### AGENTE 2 — Marketplace Frontend Coherencia
**Misión**: resolver C-MKT-1 hasta C-MKT-6 + A-MKT-1 hasta A-MKT-6.

**Pasos**:
1. Decidir: ¿`volvix-owner-panel.html` y `/paneldecontrol.html` son lo mismo? Si sí, eliminar uno (deja redirect). Si no, documentar la diferencia en `.specify/`.
2. Implementar `isAuthed()` correctamente: si tiene JWT válido + tenant_id, redirigir a `/salvadorex-pos.html` al cargar marketplace. Con query `?force=1` permite ver marketplace aunque esté logueado.
3. Agregar input `<input id="mkt-search-fallback">` HTML estático que funciona sin JS, así el marketplace sigue captable por crawlers/usuarios con JS off.
4. Borrar persistencia de giros en localStorage (`volvix:custom-giros`). El AI genera → server persiste en `business_giros` (AGENTE 1) → marketplace lee siempre del server.
5. Aplicar `escapeHtmlMP()` a todas las inserciones `${g.name}`, `${g.description}` en JS.
6. Auditar las 60 landings y eliminar las que son stubs (< 5KB): `landing-clinica-dental.html` (654b), `landing-renta-autos.html` (13KB), etc. Reemplazar por redirect a `landing_dynamic.html?giro=<slug>`.
7. Agregar loader visible en `classifyWithAI()` y `searchGiro()` con spinner. Manejar 429 con mensaje "Estás buscando muy rápido, espera 30s".
8. Debouncear `searchGiro()` a 300ms con `debounce()` ya existente.
9. Commit + push.

**Salida**: marketplace usable sin JS, sin duplicación de fuentes de giros, con feedback visual completo.

---

### AGENTE 3 — Marketplace → POS Coherencia
**Misión**: cerrar la conexión rota entre selección de giro en marketplace y configuración del POS al entrar.

**Pasos**:
1. Verificar que `POST /api/auth/register-tenant` guarda `giro_slug` en la tabla `pos_users` o `volvix_tenants`.
2. En el POS, leer el `giro_slug` del JWT o de `/api/users/me` y aplicarlo en `__volvixGiro` ANTES del render inicial (no después).
3. Si el cliente tiene plan "Free", el server debe rechazar requests a módulos premium (`/api/recargas`, `/api/rentas`, `/api/cfdi/*`) con `403 PLAN_REQUIRED`.
4. Agregar middleware `requirePlan(['paid', 'pro'])` en endpoints premium del backend.
5. Banner en POS cuando hay módulo premium bloqueado: "Esta función requiere plan Pro — actualizar".
6. Commit + push.

**Salida**: el giro/plan elegido en marketplace SE APLICA realmente en POS.

---

### AGENTE 4 — Hardening del Panel (Bloqueantes B-PNL-4/5/6)
**Misión**: blindar credenciales y operaciones del platform_owner.

**Pasos**:
1. Crear tabla `admin_2fa_secrets` (admin_user_id, totp_secret_encrypted, enabled, last_used_at).
2. Implementar setup 2FA: `POST /api/admin/me/2fa/setup` retorna QR + recovery codes; `POST /api/admin/me/2fa/verify` activa.
3. Modificar `requireAuth` para platform_owner: si 2FA habilitado, exigir `X-2FA-Code` header en cada admin POST/PATCH/DELETE.
4. Tab "Seguridad" en panel con: estado 2FA + botón activar/desactivar + lista de recovery codes.
5. Tabla `admin_ip_allowlist` + UI en tab "Seguridad" para añadir IPs.
6. Middleware `enforceIpAllowlist` en endpoints `/api/admin/*` que rechaza si IP del request no está en allowlist (cuando habilitado).
7. Tabla `admin_sessions` (admin_user_id, jti, ip, user_agent, created_at, last_seen, revoked_at). Cada login crea row.
8. Tab "Sesiones activas" en panel: lista, botón revocar individual o todas.
9. Alerta por email cuando nueva IP intenta login del platform_owner.
10. Implementar banner amarillo en POS cuando llega con `?impersonate=` en URL: "MODO IMPERSONACIÓN — admin X viendo como Y. [Salir]".
11. Modificar `POST /api/admin/tenant/:tid/impersonate` para emitir JWT con `scope='impersonate_read_only'`. Middleware en endpoints write rechaza si scope es ese.
12. Notificar al cliente impersonado: insert en `pos_user_security_log` + email opcional.
13. Botón "Salir de impersonación" en banner → cierra pestaña + invalida token server-side.
14. Commit + push.

**Salida**: panel blindado. Credenciales robadas ya no = control total. Impersonation auditable y read-only.

---

### AGENTE 5 — Enforcement Real Cross-Archivo (Bloqueantes B-X-1/2/3)
**Misión**: que los toggles del panel tengan efecto INMEDIATO y REAL en el POS.

**Pasos**:
1. Crear tabla `revoked_tokens` (jti, revoked_at, reason, revoked_by).
2. Modificar `requireAuth` para verificar `jti` contra `revoked_tokens` (con caché de 30s para no pegar DB en cada request).
3. Modificar handler `POST /api/admin/tenants/:id/suspend`: además de marcar tenant suspendido, INSERT en `revoked_tokens` los `jti` activos de ese tenant.
4. Implementar `requireFeature(featKey)` middleware: lee de `pos_feature_overrides` (override por usuario) y `pos_tenant_features` (feature global del tenant). Si feature off → 403 con mensaje claro.
5. Aplicar `requireFeature('pos.cobrar')` en handler `POST /api/sales`. Aplicar `requireFeature('pos.devoluciones')` en `POST /api/returns`. Etc.
6. Endpoint `GET /api/app/config?since=<ts>`: retorna `{tenant_features, user_overrides, plan_features, updated_at}`. Si `since` > `updated_at` retorna `304 Not Modified`.
7. En POS: poll `/api/app/config?since=<ts>` cada 60s. Si llega cambio, invalida caché y re-renderea nav.
8. BroadcastChannel `volvix-features-sync` para que todas las pestañas del cliente reciban el cambio.
9. Commit + push.

**Salida**: el toggle del panel apaga el módulo en TODAS las pestañas del cliente en ≤ 60s, sin requerir relogin.

---

### AGENTE 6 — Reparador Fiscal del POS (Bloqueante B-POS-1, fiscal MX)
**Misión**: corregir el cálculo de IVA — actualmente no-compliant SAT.

**Pasos**:
1. Crear tabla `pos_tax_config` (tenant_id, category_id NULL, tax_kind ENUM('iva','ieps','retencion'), rate, applies_on ENUM('subtotal','net')).
2. Seed: para cada tenant, insertar IVA 16% applies_on subtotal por default.
3. Endpoint `GET /api/tax-config` retorna config del tenant + categorías.
4. En POS, cargar tax_config al inicio. Modificar `updateTotals()` para calcular: `subtotal = Σ(price × qty)`, luego sumar impuestos por categoría según config, `total = subtotal + Σ(impuestos)`.
5. Mostrar desglose visible: "Subtotal: $X · IVA: $Y · Total: $Z".
6. En ticket impreso (función `_buildTicketHTML`), incluir línea de IVA separada (requisito SAT).
7. Para giros tasa-0 (libros, ciertos alimentos), permitir editar tax_config desde Config del POS.
8. Probar matemática al centavo: 3 productos $33.33 + $17.77 + $99.99 con IVA 16% = subtotal $151.09 + IVA $24.17 = total $175.26.
9. Commit + push.

**Salida**: tickets cobrados con IVA correctamente desglosado. Compatible con CFDI.

---

### AGENTE 7 — Coherencia Stock + Pago Mixto (Bloqueantes B-POS-2 y B-POS-3)
**Misión**: stock local refleja realidad post-venta + pago mixto valida suma.

**Pasos**:
1. En POS, después de `POST /api/sales` exitoso, llamar función `_postSaleCleanup(saleData)` que:
   - Para cada `item` del cart, busca en `CATALOG` por `code` y decrementa `stock`.
   - Para cada `item`, si tiene receta (ingredientes), decrementa los ingredientes proporcionalmente.
   - Llama `renderInv()` y `updateInvStats()` para refrescar UI.
2. Si `POST /api/sales` falla (rollback), NO ejecutar `_postSaleCleanup`.
3. En modal-pay (pago mixto), agregar campos para efectivo + tarjeta + transferencia simultáneos.
4. Validación pre-submit: `Σ(montos) === total` con tolerancia ±0.01. Si no cuadra, mostrar inline "Falta $X" o "Sobra $X".
5. Botón "Cobrar" disabled hasta que `montos.sum === total`.
6. En el body de `POST /api/sales`, enviar array `payments: [{method, amount}]` en vez de campo plano `payment_method`.
7. Backend valida idem que la suma coincide. Persiste cada payment como row en `pos_sale_payments`.
8. Commit + push.

**Salida**: stock local sincronizado, pagos mixtos validados al centavo.

---

### AGENTE 8 — Unificador de Estado (ADR-001 ejecutar)
**Misión**: eliminar duplicate state CATALOG vs PRODUCTS_REAL.

**Pasos**:
1. Crear `public/volvix-state.js` con `window.VolvixState` (setProducts, getProducts, onProductsChange, idem para customers y sales).
2. Cargar en `salvadorex-pos.html` ANTES de cualquier otro JS.
3. Modificar `VolvixDataLoader.loadAll()` para llamar `VolvixState.setProducts(arr)` además de mutar CATALOG.
4. Modificar `volvix-real-data-loader.js` para mismo patrón.
5. Refactor `renderInv()` para leer de `VolvixState.getProducts()`.
6. Refactor `searchProduct()` L1 idem.
7. Suscribir `renderInv` a `VolvixState.onProductsChange()` reemplaza event `volvix:products-loaded`.
8. Test físico: en panel crear tenant, asociar productos. En POS, abrir Inventario — el subtítulo y los KPIs y la tabla muestran el MISMO número.
9. Una vez verificado, eliminar `window.CATALOG = [...]` y `window.PRODUCTS_REAL = [...]`.
10. Commit + push.

**Salida**: una sola fuente de verdad para productos. Bug visible al usuario resuelto.

---

### AGENTE 9 — Críticos del Panel (C-11 al C-37)
**Misión**: cerrar los críticos identificados en Anexo II que afectan operación del platform_owner.

**Pasos**:
1. Eliminar lectura de `localStorage` para overrides en panel. Solo confiar en server (`GET /api/admin/tenant/:tid/user-overrides`).
2. Para módulos en estado "hidden": el server no debe servir el HTML/JS de esos módulos al cliente (no solo ocultar con CSS).
3. Reemplazar `confirm()` de browser por modal custom para Suspender/Eliminar tenant. El modal pide tipear el slug del tenant antes de habilitar el botón.
4. Implementar rollback en `toggleModule`/`toggleFeature`: si `await this._apiCall(...)` falla, revertir UI al estado previo.
5. Crear tabla `bulk_operations_log` (admin_id, operation, targets, executed_at, rolled_back_at). Bulk delete/suspend escribe aquí. Botón "Deshacer últimas 5 min" en tab Audit.
6. Endpoint `POST /api/auth/logout`: invalida JWT server-side (insert en `revoked_tokens`). Frontend llama esto antes de borrar localStorage.
7. Interceptor global de `fetch` en POS y panel: detecta 401 → `location.href = '/login.html?reason=expired'`.
8. Commit + push.

**Salida**: panel sin acciones destructivas accidentales, sin promesas vacías de UI.

---

### AGENTE 10 — Críticos del POS (C-18 al C-24)
**Misión**: cerrar críticos UX/integridad del POS.

**Pasos**:
1. `F12 Cobrar` debe tener atributo `disabled` cuando `CART.length === 0`. Setear en `updateTotals()`.
2. Folio del ticket debe venir del server, no client-side. Modificar `POST /api/sales` para retornar `{folio: N}` y POS solo muestra ese valor.
3. `addToCart(producto)` debe rechazar si `producto.stock <= 0`, mostrando toast "Sin stock" con opción de override solo para rol owner/admin.
4. Después de `POST /api/sales` con cupón, re-fetch `GET /api/promotions/:id` y decrementar `usage_count` local.
5. Crear lista "Ventas pendientes" en sidebar del POS: `GET /api/sales/pending?cashier_id=` con botón "Recuperar" por cada.
6. Auditar exhaustivamente todas las `innerHTML` en `reprintSale()`, print windows, modales de búsqueda — todas usan `htmlEsc` o helpers equivalentes.
7. Commit + push.

**Salida**: POS sin click-loops, sin folios duplicados, sin sobreventa, con UI completa para todas las features documentadas.

---

### AGENTE 11 — ADRs estructurales (002, 003, 004, 005)
**Misión**: ejecutar las 4 decisiones arquitectónicas restantes.

**Pasos**:
1. **ADR-002 — Arrays híbridos**: agregar helpers `_saleTuple(s)` y `_customerTuple(c)` que devuelven objetos con propiedades nombradas + índices numéricos (backward compat). Refactor renderVentas/renderClientes para usar `s.folio`, `c.nombre`, etc.
2. **ADR-003 — Tabs unificados**: crear `public/volvix-tabs.js` con `VolvixTabs.activate(group, tab, btn)`. Agregar `data-tab-group` y `data-tab` al HTML. Reemplazar `showInvTab/provTab/showCfg/...` con aliases de 1 línea.
3. **ADR-004 — Canonizar BD**: en Supabase, auditar si `sales`, `customers`, `products`, `volvix_ventas`, `volvix_productos` tienen datos. Migrar a `pos_*` y DROP las legacy con respaldo. Refactor `public/pdf-export.js` para usar `pos_sales`.
4. **ADR-005 — State machine pago**: documentar diagrama mermaid del flujo de 5 modales en `.specify/flows/cobro-state-machine.md`. Agregar test E2E para cada transición.
5. Commit + push.

**Salida**: arquitectura coherente con los contratos en `.specify/`.

---

### AGENTE 12 — Limpieza de overpromises previos
**Misión**: corregir lo que declaré "completado" hoy pero quedó cosmético.

**Pasos**:
1. Dashboard filtros Hoy/Semana/Mes: implementar `GET /api/dashboard/summary?range=hoy|semana|mes` que retorna KPIs reales. Reemplazar los `$4,820`, `18`, `$2,145`, `$890` hardcoded por valores del response.
2. "Aperturas anteriores" en screen-apertura: implementar `GET /api/cash-openings?cashier_id=` y mostrar lista en lugar de solo navegar a corte.
3. Feature flag plataformas: agregar toggle en Config del POS para `volvix_show_platforms`. Quitar default visible si es plan Free.
4. Verificar físicamente cada Quick Win declarado: `printCorteSummary`, `exportCorteCSV`, `printAperturaSummary`, `toggleSaludAutoRefresh`, chips ventas. Para cada uno, abrir POS, ejecutar acción, capturar screenshot, anotar en `.audit/VERIFICACION-FINAL.md`.
5. Si algún Quick Win no funciona, crear ticket separado por uno.
6. Commit + push.

**Salida**: cero overpromises pendientes. Lo declarado, funciona.

---

### AGENTE 13 — Altos / Medios / Bajos (limpieza incremental)
**Misión**: cerrar los ~20 items restantes de menor severidad.

**Pasos**:
1. Reemplazar todos los `confirm()` de browser por modal custom (POS: clearCart, deleteCartItem, deleteProduct; Panel: bulk-suspend, bulk-reactivate, DELETE).
2. Mover IVA hardcoded `0.16` a `pos_tax_config` (cubierto por AGENTE 6, validar consistencia).
3. UPCitemDB cache: `sessionStorage['vlx:upc_cache']` con TTL 7 días para no repetir consultas.
4. Debounce `#barcode-input` y `#inv-search` (300ms via `oninput`, no `onkeypress`).
5. Validaciones edge case: cantidad ≥ 1 (no negativa), descuento ≤ 100%, precio > 0 (con confirm si =0).
6. Wire `GET /api/dashboard/summary` real (parte de AGENTE 12).
7. Logout server-side (cubierto por AGENTE 9, validar).
8. Loader/spinner global durante fetches en panel y POS.
9. Empty states informativos en todas las tablas.
10. Tooltips en toggles del panel.
11. Convención uniforme "Cancelar" vs "Cerrar" en modales.
12. Commit + push.

**Salida**: pulido final de UX.

---

## 4. Dependencias entre agentes

```
AGENTE 0 (Verificación)  ← debe correrse PRIMERO
       │
       ├─→ confirma B-X-1/2/3 → AGENTE 5 (Enforcement cross)
       ├─→ confirma B-PNL-4/5/6 → AGENTE 4 (Hardening panel)
       ├─→ confirma B-MKT-1/2/3 → AGENTE 1 (Marketplace backend)
       └─→ todos los demás

AGENTE 1 (mkt backend)
       └─→ AGENTE 2 (mkt frontend) — depende de endpoints reales
                  └─→ AGENTE 3 (mkt → POS)

AGENTE 4 + AGENTE 5 (panel + cross) — paralelizables, comparten tabla revoked_tokens

AGENTE 6 (Fiscal IVA) — independiente, puede correr en paralelo con todo

AGENTE 7 (Stock + pago mixto) — depende de AGENTE 6 si hay refactor compartido en updateTotals

AGENTE 8 (ADR-001 estado unificado) — depende parcial de AGENTE 7

AGENTE 9 (críticos panel) y AGENTE 10 (críticos POS) — independientes, paralelizables

AGENTE 11 (ADRs 002-005) — depende de AGENTES 7-10 terminados

AGENTE 12 (overpromises) — independiente, se puede correr cuando sea

AGENTE 13 (limpieza incremental) — al final
```

---

## 5. Definición de "HECHO" por cada agente (DoD)

Antes de que un agente declare su misión cumplida, debe pasar:

1. **BD verifiable**: query MCP directo a Supabase confirma el cambio (cuando aplica).
2. **UI verifiable**: screenshot o test Playwright muestra el resultado sin recargar la página.
3. **Flujo E2E verde**: el flow correspondiente en `.specify/flows/` pasa todos los checkpoints.
4. **Sin overpromise**: si algo quedó cosmético o parcial, debe declararse en `.audit/<AGENTE-X>-PENDIENTES.md`.
5. **Push a producción**: el cambio está en `main` y Vercel lo desplegó.

Sin las 5, **el agente no terminó**. Reportar como WIP, no como completo.

---

## 6. Métricas de salida

| Métrica | Hoy | Objetivo post-plan |
|---|---|---|
| Score marketplace | NEW (NO-GO) | PRODUCTION-READY |
| Score POS | 22/100 | ≥ 75/100 |
| Score Panel | 15/100 | ≥ 80/100 |
| Veredicto global | NO-GO | PRODUCTION-READY |
| Bloqueantes abiertos | 16 (10 originales + 6 marketplace) | 0 |
| Críticos abiertos | 23 | ≤ 3 |
| ADRs ejecutados | 0 / 5 | 5 / 5 |
| Verificaciones experimentales | 0 / 15 | 15 / 15 |
| Overpromises pendientes | 19 items | 0 |

---

## 7. Decisión inmediata

Para arrancar, lanza UN agente. Mi recomendación:

**AGENTE 0 — Verificador Experimental**. Sin esto los siguientes agentes pueden invertir esfuerzo en "Bloqueantes" que en realidad no lo son. Output: tabla 8×4 que confirma o descarta cada inferencia.

Después: en orden de impacto al negocio, **AGENTE 1 (marketplace backend)** porque el negocio entero depende de la puerta de entrada. Sin marketplace funcional no hay clientes nuevos.

---

## 8. Referencias a reportes consolidados aquí

| Archivo | Para qué consultarlo |
|---|---|
| `.audit/AUDITORIA-ADVERSARIAL-2026-05-16.md` | 84 defectos detallados (37 cuerpo + 47 Anexo II) + 3 anexos honestidad |
| `.audit/SUGERENCIAS-COMPARATIVAS-2026-05-15.md` | 47 sugerencias UX por pantalla del POS |
| `.audit/REPORTE-SDD-2026-05-15.md` | 5 deudas SDD reparadas |
| `.audit/VERIFICACION-FISICA-2026-05-15.md` | Screenshots de Quick Wins vivos |
| `.audit/PLAN-MAESTRO-2026-05-16.md` | Plan anterior (reemplazado por este) |
| `.specify/decisions/ADR-001..005.md` | 5 decisiones arquitectónicas |
| `.specify/constitution.md` | 10 reglas inviolables (C1-C10) |
| `.specify/contracts/screens/*.spec.md` | 40+ contratos por pantalla del POS |

---

**Fin del Plan Maestro Final. Plan único, por agentes, por pasos específicos, sin tiempos. Decide qué agente lanzo primero.**
