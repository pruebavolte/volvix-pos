# REPORTE DE AUDITORÍA — System International / Volvix POS
**Fecha:** 2026-05-06
**Branch:** main
**Commits incluidos:** `92ed720` → `7e7e99b` → `1486d53` → `291e8e9` → `b57a5ec`

---

## ✅ Corregido

### FASE 0 — Reglas universales del proyecto
- Reescrito `CLAUDE.md` con la metodología universal solicitada (anti-hardcode, auto-login, multi-tenant, config dinámica por giro).
- Variables del proyecto rellenas con valores reales del proyecto.

### FASE 1 — Inventario
Mapeo confirmado de los archivos críticos:
- `api/index.js` — handlers map de todos los endpoints (~12,000+ LOC).
- `public/registro.html` — flujo de registro 3 pasos (form / OTP / success).
- `public/login.html` — login con remembered users + auto-redirect SSO.
- `public/salvadorex-pos.html` — POS principal (~14,000+ LOC).
- `public/marketplace.html` — landing principal con 37 giros.
- `public/volvix-launcher.html` — panel de plataforma (superadmin).
- `public/volvix-cookie-banner-wiring.js` + `volvix-compliance-wiring.js` — banners GDPR.
- Tablas Supabase: 154 con RLS, +3 nuevas (`giros_modulos`, `giros_terminologia`, `giros_campos`).

### FASE 2 — Erradicación de hardcode
- ❌ `'TNT001'` hardcoded → ✅ `__deriveTenantIdFromToken()` lee JWT.
- ❌ `'Abarrotes Don Chucho'` hardcoded → ✅ default `'Mi negocio'` + hidratación desde `tenant_name` del JWT.
- ❌ `admin@donchucho.mx` en input perfil → ✅ hidratado desde `ssoSession.email`.
- ❌ Inputs RFC/Razón social/Dirección/Teléfono hardcoded → ✅ placeholders + hidratación.
- ❌ USERS list demo (4 emails `@donchucho.mx`) → ✅ `__buildInitialUsersFromSession()` devuelve solo el admin del JWT.
- ❌ `CATALOG` array (Coca Cola, Pan dulce, Queso fresco, etc.) → ✅ array vacío + carga desde `/api/products`.
- ❌ `CART` array (3 items demo) → ✅ array vacío al iniciar.
- ❌ `CUSTOMERS` array (María López, Carlos Ramírez, Ana Rodríguez, Roberto Gutiérrez) → ✅ array vacío + carga desde `/api/customers`.
- ❌ `CREDIT` array (6 clientes demo) → ✅ array vacío.
- ❌ `SALES` array (5 ventas demo) → ✅ array vacío + carga desde `/api/sales`.
- ❌ Header `<div class="sub">Don Chucho · Caja 1</div>` → ✅ `Mi negocio · Caja 1` + hidratación al login.
- ❌ Login screen `Abarrotes Don Chucho · Caja 1` → ✅ `id=login-tenant-sub` con default `Mi negocio · Caja 1`.

### FASE 3 — User journey

#### Journey 1 — Registro nuevo usuario
- ✅ `registro.html` simplificado a 3 campos (email, teléfono, contraseña).
- ✅ Auto-fill desde marketplace cache (`volvix_last_search`) + `volvix_last_contact` + `volvix_remembered_users`.
- ✅ Auto-redirect post-OTP en 1.8s (NO segundo login).
- ✅ JWT guardado en localStorage; redirect a `/salvadorex-pos.html`.

#### Journey 2 — Login usuario existente
- ✅ Pills "USAR SESIÓN GUARDADA" en login.html.
- ✅ Click pill auto-llena email + focus en password.
- ✅ Pills persisten next-day (preservadas en logout del launcher).
- ✅ Redirect role-based (platform → launcher; owner → POS).

#### Journey 7 — Reportes
- ✅ `/api/products`, `/api/sales`, `/api/customers` con `requireAuth` + filtro por `tenant_id`.

#### Journey 8 — Configuración
- ✅ `data-ia-arq-moved-to=` aplicado a 15 botones (skill ia-arquitectura).
- ✅ Inputs de "Datos del negocio" hidratados desde JWT.

### FASE 4 — Reorganización de botones
- ✅ Skill `ia-arquitectura` aplicada en commits previos (15 menu buttons movidos a sus módulos correctos).
- ✅ Cookie banner movido de global a perfil/legales (no más intrusivo en POS, login, marketplace).
- ✅ "Iniciar con otro usuario" en login.html (clear input para nuevo email).

### FASE 5 — Botones funcionando
- ✅ `volvix-ui-errors.js` ya no muestra overlay 404 bloqueante para `/api/*`.
- ✅ `/api/products` devuelve 200 + array vacío para tenants nuevos (no 404).
- ✅ Eventos `volvix:login`, `volvix:products-loaded`, `volvix:customers-loaded`, `volvix:sales-loaded` para que módulos re-rendericen al recibir datos.

### FASE 6 — Multi-tenant audit
- ✅ RLS Phase 1-5 ya completas (154/154 tablas).
- ⚠️ Phase 6 RLS pendiente para `pos_sales`, `pos_products`, `kds_*` (4 tablas en hybrid mode — requiere Supabase Auth integration).
- ✅ JWT.tenant_id usado en `__deriveTenantIdFromToken()`, `resolveTenant(req)` en endpoints.
- ✅ Cross-tenant leak en `/api/menu-digital` ya prevenido con whitelist `KNOWN_TENANTS`.

### FASE 7 — Activación de módulos por giro

**Tablas creadas en Supabase** (migración `volvix_giros_config_tables`):
- `giros_modulos` (giro_slug, modulo, activo, orden) — 67 filas activas
- `giros_terminologia` (giro_slug, clave, valor_singular, valor_plural) — 19 filas
- `giros_campos` (giro_slug, modal, campo, visible, requerido, orden) — 26 filas
- RLS habilitado, lectura pública (SELECT), escritura solo service_role
- Index por `giro_slug` y `(giro_slug, modal)` para queries rápidas

**8 giros configurados:**
| Giro | Módulos extra | Terminología | Campos producto extra |
|---|---|---|---|
| `default` | (solo nucleo) | Cliente, Producto, Venta | (defaults) |
| `abarrotes` | recargas, servicios | Cliente | (defaults) |
| `farmacia` | recetas, controlados | Paciente, Medicamento | requiere_receta, ingrediente_activo, lote |
| `veterinaria` | mascotas, vacunas, consultas, estetica | Dueño, Atención | requiere_receta, ingrediente_activo, lote, sagarpa, marca_animal |
| `restaurante` | mesas, meseros, comandas, cocina | Comensal, Platillo, Cuenta | modificadores, receta_bom |
| `consultorio` | expediente_clinico, citas, recetas_medicas | Paciente, Servicio, Consulta | requiere_receta |
| `estetica` | servicios_belleza, citas, estilistas | Cliente, Servicio, Atención | (defaults) |
| `ferreteria` | cotizaciones | Cliente | (defaults) |

**Endpoint `GET /api/giro/config`** (api/index.js):
- Resuelve `giro_slug` desde `tenants` table
- Carga 3 config tables en paralelo
- Merge default + override del giro
- Devuelve JSON con `{modulos, terminologia, campos}`
- Auth requerido (requireAuth middleware)

**Frontend wiring `window.VolvixGiroConfig`** (salvadorex-pos.html):
- `load()` → fetch `/api/giro/config` con JWT
- `apply()` → 3 transformaciones DOM:
  1. `.menu-btn[data-menu]` no en `modulos[]` → `display:none` (excepto los 6 núcleo)
  2. `[data-i18n]` → textContent = `term[clave].singular` o `.plural`
  3. `[data-flag]` no visible → wrapper `display:none`
- Triggers: `volvix:login` + `DOMContentLoaded` fallback
- Dispara evento `volvix:giro-config-applied`

### FASE 8 — QA hostil (Quinn persona)
Casos verificados:
- ✅ Registrar sin llenar campos → bloqueado por `validateStep1()`.
- ✅ JWT inválido en `salvadorex-pos.html` → redirect a `/login.html?redirect=...` (correcto).
- ✅ Cookie banner suprimido en marketplace/login/POS, mostrado solo en cookies-policy + perfil/clientes.
- ✅ `/api/products` con tenant no provisionado → 200 + array vacío + flag `tenant_not_provisioned` (no 404 bloqueante).

---

## 🔧 Archivos modificados

| Archivo | Cambios |
|---|---|
| `CLAUDE.md` | Reescrito con metodología universal y variables del proyecto |
| `api/index.js` | Endpoint `GET /api/giro/config` + fix 200 en `/api/products` para tenants nuevos |
| `public/registro.html` | Auto-fill 3 fuentes + auto-redirect post-OTP en 1.8s |
| `public/login.html` | Pills remembered users + save `volvix_last_contact` + fix typo `data` → `result` |
| `public/salvadorex-pos.html` | Eliminados 5 arrays demo + `__deriveTenantIdFromToken()` + `VolvixDataLoader` + `VolvixGiroConfig` + hidratación inputs perfil/negocio |
| `public/volvix-launcher.html` | Logout preserva `volvix_remembered_users`, `volvix_last_contact`, `volvix_last_search` |
| `public/volvix-cookie-banner-wiring.js` | Banner restringido a páginas legales + perfil/clientes |
| `public/volvix-compliance-wiring.js` | Mismo restricción aplicada al segundo banner |
| `public/marketplace.html` | sessionStorage write para auto-fill registro |
| `ROADMAP-GIRO-ARCHITECTURE.md` | Documentación de los Bloques A-F |
| `AUDITORIA-2026-05-06.md` | Este reporte |

---

## 🗃️ Cambios en BD

**Migración `volvix_giros_config_tables`** (project `zhvwmzkcqngcaqpdxtwr`):
- 3 tablas creadas: `giros_modulos`, `giros_terminologia`, `giros_campos`
- RLS habilitado, policies de SELECT públicas
- Index por `giro_slug` + `(giro_slug, modal)`

**Migración `volvix_giros_seed_2026_05_06`**:
- 67 filas en `giros_modulos` (8 giros × 6-10 módulos)
- 19 filas en `giros_terminologia`
- 26 filas en `giros_campos` (modal `producto` con flags por giro)

---

## ⚠️ Pendiente (con razón técnica)

### Bloque A residual — Phase 6 RLS
- Tablas `pos_sales`, `pos_products`, `kds_*` siguen en hybrid mode (Phase 5).
- **Razón técnica**: las policies tenant-aware requieren Supabase Auth integration completa (mapping `auth.uid()` → `tenant_id`). El sistema actual usa JWT custom emitido por `/api/login`, no Supabase Auth. Migrar a Supabase Auth es un sprint dedicado.

### Bloque E — Funcionalidades verticales
Las landings prometen features que aún NO existen como tablas/endpoints:
- Veterinaria: `pet_records`, `pet_vaccines`, `appointments` (expediente, vacunas, agenda)
- Farmacia: `prescriptions` table + flujo de receta
- Restaurante: `restaurant_tables`, `kitchen_orders` ya existen pero no wired al UI
- **Razón técnica**: cada vertical es 3-5 días de implementación (tabla + endpoint + UI). Documentado en ROADMAP-GIRO-ARCHITECTURE.md (Bloque E).

### Rotación de secrets
- Pexels API key + Google CSE API key estuvieron en git history (commits previos).
- **Acción requerida del usuario**: rotar manualmente en Pexels dashboard + Google Cloud Console.

### Phase 6 RLS, leaked password protection, extension_in_public
- 1 advisor lint pendiente: `auth_leaked_password_protection` (toggle del Supabase dashboard, no se controla por SQL).
- 4 extensions en `public` schema (ltree, pg_trgm, btree_gin, unaccent) — documentadas como conscientes.

---

## 📊 Estado por módulo

| Módulo | Estado | Notas |
|---|---|---|
| **Auth (registro/login)** | ✅ | Auto-login post-registro, pills, sin doble login |
| **POS (Vender)** | ✅ | Hardcode eliminado, productos/clientes/ventas desde API |
| **Inventario** | ✅ | Productos desde `/api/products`, ia-arquitectura aplicada |
| **Clientes** | ⚠️ | Carga desde `/api/customers` OK, pero re-render de UI necesita listener para `volvix:customers-loaded` |
| **Corte** | ⚠️ | Carga desde `/api/sales` OK, mismo issue de re-render |
| **Reportes** | ⚠️ | Endpoints existen, UI necesita conectarse a los datos cargados |
| **Configuración** | ✅ | Inputs hidratados, ia-arquitectura aplicada |
| **Multi-tenant** | ✅ | TENANT_ID dinámico desde JWT, RLS Phase 1-5 |
| **Config por giro** | ✅ | Tablas + endpoint + frontend wiring deployed |
| **Cookie banner** | ✅ | Restringido a perfil + páginas legales |
| **Mascotas/Vacunas/Agenda (vet)** | ❌ | Pendiente Bloque E (no son trivial, ROADMAP doc) |

---

## Resumen ejecutivo

**Lo crítico está resuelto:**
1. Doble login eliminado (auto-redirect post-OTP).
2. Cero datos demo "Don Chucho" visibles en POS para usuarios nuevos.
3. Cada usuario ve solo SUS datos (TENANT_ID dinámico + arrays vacíos cargados desde API).
4. Cookie banner ya no es intrusivo.
5. UN solo sistema con configuración por giro funcionando (8 giros configurados, endpoint funcional, wiring frontend listo).

**Lo grande que queda:**
- Phase 6 RLS para tablas hot-path (sprint dedicado, requiere Supabase Auth migration).
- Funcionalidades verticales (mascotas, recetas, agenda) — documentadas en ROADMAP, requieren 3-5 días por vertical.

Sistema en estado MUCHO MEJOR que al inicio del día. Sin contaminación cross-tenant visible. Flujo de registro coherente. Configuración por giro lista para usar — solo falta wireup de las funcionalidades verticales prometidas en landings.
