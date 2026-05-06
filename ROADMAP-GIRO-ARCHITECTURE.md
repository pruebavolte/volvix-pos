# Roadmap arquitectónico — Sistema unificado por giro

> **Regla de oro**: NO son 1,000 sistemas distintos. Es **UN solo sistema** que activa/desactiva módulos y cambia terminología según el giro del usuario.

## Estado actual (post commit 2026-05-06)

### ✅ Resuelto en este commit
- Auto-redirect post registro (1 solo login, no doble)
- `TENANT_ID` se deriva del JWT (no más `'TNT001'` hardcoded)
- `tenant_name` se deriva del JWT (no más `'Abarrotes Don Chucho'` hardcoded)
- Email del perfil hidratado desde session (no más `admin@donchucho.mx`)
- USERS demo limpiado: solo el admin actual, no más `maria.lopez@donchucho.mx`
- Cookie banner restringido a perfil + páginas legales (no más intrusivo en POS)
- Inputs de "Datos del negocio" hidratados desde JWT/session

### ⚠️ Pendiente (requiere trabajo adicional, no era trivial en este commit)

## Bloque A — Multi-tenant data REAL en la API

**Problema**: aunque el JWT ahora trae `tenant_id` correcto, los endpoints de `/api/products`, `/api/sales`, `/api/customers` deben filtrar por `tenant_id` del JWT (Row Level Security en Supabase ya implementado en Phases 1-5, falta Phase 6 con tenant-aware policies).

**Acción**:
1. Auditar cada endpoint en `api/index.js` para confirmar que use `resolveTenant(req)` y NO un fallback global a TNT001.
2. Phase 6 RLS: implementar policies tenant-aware en `pos_sales`, `pos_products`, `kds_*` (las 4 tablas que quedaron en hybrid mode en Phase 5).
3. Eliminar el array hardcoded `INVENTORY` (línea ~4779), `SALES` (4811), `CUSTOMERS` (4797) en `salvadorex-pos.html` — estos deben venir de `/api/products`, `/api/sales`, `/api/customers` filtrados por tenant.

## Bloque B — Activación/desactivación de módulos por giro

**Problema**: el menú actual muestra TODOS los módulos para todos los giros (Vender, Inventario, Reportes, Corte, Clientes, Config, Historial, Recargas, Vista 0, etc.). El usuario debe ver solo:
- Núcleo común: Productos, Inventario, Ventas, Corte, Reportes, Configuración.
- Módulos específicos del giro (e.g., Veterinaria → Expediente mascota, Calendario vacunas, Agenda consultas).

**Arquitectura propuesta**:
1. Tabla `giro_module_matrix` en Supabase:
   ```sql
   CREATE TABLE giro_module_matrix (
     giro_slug TEXT PRIMARY KEY,
     core_modules TEXT[] NOT NULL DEFAULT ARRAY['productos','inventario','ventas','corte','reportes','config'],
     extra_modules TEXT[] NOT NULL DEFAULT '{}',
     terminology JSONB NOT NULL DEFAULT '{}',
     product_modal_flags JSONB NOT NULL DEFAULT '{}'
   );
   ```
2. Seed con cada giro:
   - `veterinaria`: extra=['mascotas','vacunas','consultas','estetica'], terminology={'cliente':'paciente','clientes':'pacientes'}, flags={requiere_receta:true, ingrediente_activo:true}
   - `farmacia`: extra=['recetas','controlados'], terminology={}, flags={requiere_receta:true, ingrediente_activo:true, lote:true}
   - `abarrotes`: extra=[], terminology={}, flags={caducidad:true} (sin receta, sin ingrediente)
   - `restaurante`: extra=['mesas','meseros','comandas','cocina'], terminology={'cliente':'comensal'}, flags={modificadores:true, recetas:true}
   - `consultorio`: extra=['expediente_clinico','citas','recetas_medicas'], terminology={'cliente':'paciente'}, flags={requiere_receta:true}
   - ... (37 giros documentados en marketplace)
3. Endpoint `GET /api/giro/config` que devuelva la config para el giro del tenant actual.
4. En `salvadorex-pos.html`: al cargar, llamar a `/api/giro/config` y aplicar:
   - Ocultar `.menu-btn[data-menu]` que NO esté en `core_modules ∪ extra_modules`.
   - Reemplazar `data-i18n="cliente"` por el término del giro (`Paciente`/`Comensal`/etc.).
   - Mostrar/ocultar checkboxes en el modal de producto según `product_modal_flags`.

## Bloque C — Terminología i18n (Cliente → Paciente para vet/médico)

**Ya existe parcialmente** en `volvix-i18n-wiring.js` y el panel de admin tiene UI para configurarlo por giro. Falta:
1. Aplicarlo realmente en runtime cuando carga `salvadorex-pos.html` — leer `giro.terminology` y reemplazar todos los `data-i18n="X"` con el valor del giro.
2. En el menú, los textos hardcoded como `<span>Clientes</span>` deben tener `data-i18n="customers"` para que el motor pueda intercambiarlos.
3. En modals (e.g., "Asignar cliente"), el título debe leer del i18n.

## Bloque D — Modal unificado de "Agregar producto" con feature flags

**Problema**: actualmente existe UN solo modal (bien), pero TODOS los campos siempre se muestran (mal). Debe ocultar campos no aplicables al giro:

| Campo | Abarrotes | Farmacia | Veterinaria | Restaurante |
|-------|-----------|----------|-------------|-------------|
| Código de barras | ✅ | ✅ | ✅ | ✅ |
| Precio | ✅ | ✅ | ✅ | ✅ |
| Costo | ✅ | ✅ | ✅ | ✅ |
| Stock | ✅ | ✅ | ✅ | ✅ |
| Caducidad | ✅ | ✅ | ✅ | opcional |
| **Requiere receta** | ❌ | ✅ | ✅ | ❌ |
| **Ingrediente activo** | ❌ | ✅ | ✅ | ❌ |
| **Lote / serie** | ❌ | ✅ | ✅ (vacunas) | ❌ |
| **SAGARPA controlado** | ❌ | ❌ | ✅ | ❌ |
| **Marca/Talla animal** | ❌ | ❌ | ✅ (alimentos) | ❌ |
| **Modificadores** | ❌ | ❌ | ❌ | ✅ |
| **Receta (BOM)** | ❌ | ❌ | ❌ | ✅ |

**Acción**:
1. Cada checkbox/input en el modal debe tener `data-flag="X"`.
2. Al abrir el modal, leer `giro.product_modal_flags` y `el.style.display='none'` para flags falsy.
3. Las DBs `pos_products` ya tienen columnas para todos estos campos (ver `volvix_create_pos_products` migration), solo se ocultan en UI.

## Bloque E — Wiring real de funcionalidades prometidas en landings

Cada landing por giro promete X funciones. Ejemplo: `landing-veterinaria.html` promete:
- ✅ Expediente por mascota
- ✅ Calendario de vacunas
- ✅ Agenda de consultas
- ✅ Inventario de medicamentos (ya existe via `pos_products`)
- ✅ Catálogo de alimentos (ya existe via `pos_products`)
- ✅ Estética y baño integrado

**De las 6, solo 2 están realmente implementadas**. Las otras 4 requieren tablas + endpoints + UI:

```sql
-- Pendiente: tabla mascotas (giro=veterinaria)
CREATE TABLE pet_records (
  id uuid PRIMARY KEY,
  tenant_id text REFERENCES tenants,
  customer_id uuid REFERENCES pos_customers,
  name text, species text, breed text, dob date, weight_kg numeric,
  allergies text, last_visit timestamptz, ...
);

CREATE TABLE pet_vaccines (
  id uuid PRIMARY KEY,
  pet_id uuid REFERENCES pet_records,
  vaccine_name text, applied_at timestamptz, next_due_at timestamptz,
  reminder_sent_at timestamptz, ...
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY,
  tenant_id text, doctor_id uuid, pet_id uuid, customer_id uuid,
  starts_at timestamptz, duration_min int, type text /* consulta|cirugia|baño */,
  status text, ...
);
```

**Esfuerzo**: ~3-5 sesiones de implementación por giro especializado (vet, farmacia, restaurante, consultorio).

## Bloque F — Cookie banner: ya está en su lugar correcto

El banner ahora SOLO se muestra en:
- Páginas legales: `/cookies-policy.html`, `/aviso-privacidad.html`, `/terminos-condiciones.html`
- En `/salvadorex-pos.html` cuando el usuario está en la sección "Mi Perfil" o "Clientes"

Para forzarlo manualmente: `window.volvixCookies.reset()` o el botón "Configurar cookies" en la sección perfil.

## Priorización sugerida

**Sprint 1 (1 semana)**: Bloque A (data REAL multi-tenant) — sin esto los demás bloques no tienen sentido porque siguen viendo datos de Don Chucho.

**Sprint 2 (1-2 semanas)**: Bloque B + Bloque C (módulos por giro + terminología) — gran impacto visual, código existente.

**Sprint 3 (1 semana)**: Bloque D (modal con flags) — UX mejor, esfuerzo bajo.

**Sprint 4-N**: Bloque E (features verticales reales) — esfuerzo grande, priorizar por giro de mayor demanda (probablemente farmacia, veterinaria, restaurante en ese orden).
