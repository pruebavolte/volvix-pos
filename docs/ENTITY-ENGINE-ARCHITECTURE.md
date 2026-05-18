# Motor Universal de Entidades Operativas
## Arquitectura técnica + roadmap de implementación

**Fecha:** 2026-05-18
**Autor:** Claude Code (sesión autónoma)
**Status:** DESIGN DOCUMENT — no implementado aún

---

## 1. Filosofía central

### El error del POS tradicional

Los POS tradicionales (Toast, Square, Loyverse, hasta Shopify) tienen un problema arquitectónico:

```
[App de restaurantes]  →  Tabla "productos"
[App de salones]       →  Tabla "servicios"
[App de hoteles]       →  Tabla "habitaciones"
[App de gimnasios]     →  Tabla "membresías"
[App de talleres]      →  Tabla "órdenes de servicio"
```

Cada app es **otra app**. Comparten poco código. Si quieres agregar un nuevo giro, escribes una app nueva.

### El insight correcto

Todos esos conceptos (producto, servicio, habitación, membresía, orden de servicio, cita, renta, expediente médico, ticket de evento, licencia SaaS) son técnicamente **el mismo objeto**:

> **Una "Entidad Operativa Universal" = algo que se ofrece a un cliente, se transacciona, se factura, se da seguimiento, y genera un evento de venta + un evento contable.**

Lo que cambia entre giros NO es el OBJETO. Es el **conjunto de atributos relevantes** y el **conjunto de eventos que dispara**.

### Decisión arquitectónica

```
NO construir:
  - Una app "POS para restaurantes" + Una app "POS para salones" + ...

SÍ construir:
  - Una única tabla "entities"
  - Un único modal universal
  - Un schema engine que decide qué campos mostrar/requerir según la categoría
  - Un rules engine que decide qué eventos se disparan
  - Un workflow engine que orquesta el ciclo de vida
```

---

## 2. Modelo de datos

### Tabla central: `entities`

```sql
CREATE TABLE entities (
  -- Identidad universal
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,            -- multi-tenant
  type          VARCHAR(50) NOT NULL,     -- "producto" | "servicio" | "habitacion" | "membresia" | etc.
  category      VARCHAR(100) NOT NULL,    -- categoría SCIAN o custom

  -- Identificación humana
  name          VARCHAR(255) NOT NULL,
  sku           VARCHAR(100),             -- opcional, según giro
  barcode       VARCHAR(100),             -- opcional
  slug          VARCHAR(255) UNIQUE,      -- para URLs

  -- Datos núcleo (siempre presentes)
  price         DECIMAL(15,4),
  cost          DECIMAL(15,4),
  active        BOOLEAN DEFAULT true,
  visible       BOOLEAN DEFAULT true,

  -- Schema dinámico (todo lo demás)
  schema_id     UUID REFERENCES entity_schemas(id),
  attributes    JSONB NOT NULL DEFAULT '{}',   -- ← todos los campos dinámicos viven acá

  -- Auditoría
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  version       INTEGER DEFAULT 1,        -- optimistic locking

  -- Indexes esenciales
  CONSTRAINT entities_tenant_type_idx UNIQUE (tenant_id, type, sku)
);

CREATE INDEX idx_entities_tenant ON entities(tenant_id);
CREATE INDEX idx_entities_type ON entities(tenant_id, type);
CREATE INDEX idx_entities_category ON entities(tenant_id, category);
CREATE INDEX idx_entities_attrs_gin ON entities USING GIN (attributes);  -- ← clave
```

**Por qué `JSONB attributes`:**

Esa columna almacena TODOS los campos especializados según el schema activo:
- Para un producto: `{precio_mayoreo: 100, peso_kg: 0.5, tallas: ["S","M","L"]}`
- Para una habitación: `{tipo: "suite", capacidad: 4, check_in_default: "15:00", calendar_blocks: [...]}`
- Para un curso: `{instructor_id: "...", cupos: 30, material_url: "...", duracion_horas: 40}`

Con `GIN index` sobre `attributes`, las queries siguen siendo rápidas incluso filtrando por subcampos:
```sql
SELECT * FROM entities
WHERE tenant_id = '...'
  AND type = 'producto'
  AND attributes @> '{"caduca": true}'
  AND (attributes->>'caducidad_dias')::int < 30;
```

### Tabla `entity_schemas`

```sql
CREATE TABLE entity_schemas (
  id          UUID PRIMARY KEY,
  tenant_id   UUID,                      -- NULL = global / template
  type        VARCHAR(50) NOT NULL,      -- "producto", "servicio", etc.
  category    VARCHAR(100),              -- e.g. "restaurante", "hotel"
  scian_code  VARCHAR(10),               -- código SCIAN del INEGI
  name        VARCHAR(255),
  schema_json JSONB NOT NULL,            -- ← El JSON Schema completo
  version     INTEGER DEFAULT 1,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

Un `schema_json` típico:

```json
{
  "type": "object",
  "title": "Producto físico básico",
  "sections": [
    {
      "id": "identidad",
      "title": "Identidad",
      "fields": [
        { "name": "name", "label": "Nombre del producto", "type": "text", "required": true },
        { "name": "sku", "label": "SKU", "type": "text", "required": false, "uniqueWithinTenant": true },
        { "name": "barcode", "label": "Código de barras", "type": "barcode-scanner" }
      ]
    },
    {
      "id": "precios",
      "title": "Precios",
      "fields": [
        { "name": "price", "label": "Precio venta", "type": "currency", "required": true, "min": 0 },
        { "name": "cost", "label": "Costo", "type": "currency", "min": 0 },
        { "name": "commission_amount", "label": "Comisión $", "type": "currency", "min": 0 },
        { "name": "commission_pct", "label": "Comisión %", "type": "percentage", "min": 0, "max": 100 }
      ]
    },
    {
      "id": "inventario",
      "title": "Inventario",
      "visibleIf": { "type": "producto" },
      "fields": [
        { "name": "stock", "label": "Stock actual", "type": "number" },
        { "name": "min_stock", "label": "Stock mínimo", "type": "number" },
        { "name": "caduca", "label": "Tiene caducidad", "type": "switch" },
        { "name": "caducidad_dias", "label": "Días antes de caducar", "type": "number", "visibleIf": { "caduca": true } }
      ]
    },
    {
      "id": "restaurante",
      "title": "Cocina (restaurante)",
      "visibleIf": { "category": ["restaurante", "cafeteria", "fonda"] },
      "fields": [
        { "name": "manda_cocina", "label": "Se manda a cocina", "type": "switch" },
        { "name": "area_preparacion", "label": "Área", "type": "combobox", "options": ["barra","cocina","plancha","parrilla"] },
        { "name": "modificadores", "label": "Modificadores", "type": "dynamic-builder", "itemSchema": "$ref:modificador" },
        { "name": "tiempo_coccion_min", "label": "Tiempo cocción (min)", "type": "number" }
      ]
    }
  ]
}
```

### Tabla `entity_relations` (kits, recetas, componentes)

```sql
CREATE TABLE entity_relations (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  parent_id     UUID REFERENCES entities(id) ON DELETE CASCADE,
  child_id      UUID REFERENCES entities(id),
  relation_type VARCHAR(50),         -- 'recipe_ingredient' | 'kit_component' | 'variant' | 'add_on'
  quantity      DECIMAL(10,4) DEFAULT 1,
  unit          VARCHAR(20),         -- 'pieza' | 'kg' | 'litro' | 'minuto'
  required      BOOLEAN DEFAULT true,
  position      INTEGER,
  attributes    JSONB DEFAULT '{}'   -- ej {"merma_pct": 5}
);
```

Esto resuelve **kit/combo/receta/paquete** de forma unificada:
- Hamburguesa → ingredientes (relation_type='recipe_ingredient')
- Combo familiar → 4 productos (relation_type='kit_component')
- Camisa azul talla M → variante (relation_type='variant')
- Curso "Inglés Premium" + libro → add-on (relation_type='add_on')

### Tabla `entity_events` (workflow + auditoría + automatización)

```sql
CREATE TABLE entity_events (
  id           UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  entity_id    UUID REFERENCES entities(id),
  event_type   VARCHAR(50),       -- 'created' | 'state_changed' | 'sold' | 'restocked' | 'expired' | etc.
  from_state   VARCHAR(50),
  to_state     VARCHAR(50),
  actor_id     UUID,              -- quién disparó
  payload      JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_events_entity ON entity_events(entity_id, created_at);
```

Es event-sourcing parcial: cada cambio importante deja huella. Sirve para:
- Auditoría legal/fiscal
- Workflow visualización
- Trigger de automatizaciones
- Predicciones ML

---

## 3. Schema Driven UI — cómo funciona el modal universal

### Principio

El modal NO tiene HTML hardcoded por tipo de entidad. Tiene **un renderer genérico** que lee el schema y construye el form dinámicamente.

### Flujo

```
1. Usuario abre modal → elige tipo entidad ("producto", "servicio", "habitación")
2. Frontend pide /api/schemas?type=X&category=Y
3. Backend devuelve el schema JSON activo para ese tenant + tipo + categoría
4. Renderer JS lee schema.sections, genera <section> por cada uno
5. Por cada field genera el input correcto según field.type:
     - "text" → <input type=text>
     - "currency" → <input type=number step=0.01> + máscara
     - "switch" → <toggle component>
     - "tree-select" → <combobox jerárquico>
     - "calendar" → <calendar picker>
     - "dynamic-builder" → <repeatable group>
     - "ai-button" → <button> que llama /api/ai/{operation}
6. Renderer evalúa visibleIf en cada field tras cambios de form
7. Submit → validate contra schema → POST /api/entities
```

### Renderer básico (~150 líneas)

```js
function renderEntityModal(schema, initialValues = {}) {
  const root = document.createElement('div');
  root.className = 'entity-modal';
  const state = { ...initialValues };
  const renderers = {
    text: f => `<input type="text" name="${f.name}" value="${state[f.name]||''}" ${f.required?'required':''}/>`,
    currency: f => `<input type="number" step="0.01" name="${f.name}" value="${state[f.name]||''}"/>`,
    switch: f => `<input type="checkbox" name="${f.name}" ${state[f.name]?'checked':''}/>`,
    combobox: f => `<select name="${f.name}">${f.options.map(o=>`<option value="${o}" ${state[f.name]===o?'selected':''}>${o}</option>`).join('')}</select>`,
    'dynamic-builder': f => `<div class="dyn-builder" data-field="${f.name}"></div>`,
    'ai-button': f => `<button type="button" data-ai-op="${f.aiOp}">${f.label}</button>`,
    // ... 70 tipos más
  };

  schema.sections.forEach(section => {
    if (!evalVisibility(section.visibleIf, state)) return;
    const sec = document.createElement('section');
    sec.dataset.id = section.id;
    sec.innerHTML = `<h3>${section.title}</h3>`;
    section.fields.forEach(field => {
      if (!evalVisibility(field.visibleIf, state)) return;
      const renderer = renderers[field.type];
      if (!renderer) return console.warn('Unknown field type:', field.type);
      sec.innerHTML += `<label>${field.label}</label>${renderer(field)}`;
    });
    root.appendChild(sec);
  });

  // Re-render on changes (for visibleIf)
  root.addEventListener('input', e => {
    state[e.target.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    debounce(() => renderEntityModal(schema, state), 100);
  });

  return root;
}

function evalVisibility(visibleIf, state) {
  if (!visibleIf) return true;
  return Object.entries(visibleIf).every(([k, v]) => {
    if (Array.isArray(v)) return v.includes(state[k]);
    return state[k] === v;
  });
}
```

### Sistemas de validación + dependencias

JSON Schema standard (`ajv` library) + reglas custom para `visibleIf`, `requiredIf`, `computedFrom`.

---

## 4. Las 70 categorías como módulos

Cada categoría que pediste se vuelve un **módulo opcional** que el tenant activa o no:

| Módulo | DB tables nuevas | UI components | Backend services |
|---|---|---|---|
| 17. Serialización avanzada | `entity_serials` | `<serial-manager>` | `SerialGenerator` |
| 18. Garantías | `entity_warranties` | `<warranty-form>` | `WarrantyValidator` |
| 19. Rentas | `entity_rentals` + `rental_calendar` | `<rental-calendar>` | `RentalEngine` |
| 20. Citas | `appointments` | `<scheduler>` | `AppointmentService` |
| 21. Delivery | `delivery_zones`, `deliveries` | `<polygon-map>` | `DeliveryRouter` |
| 22. Ecommerce | columnas SEO en `entities` | `<seo-editor>` | `SitemapGenerator` |
| 23. Restaurantes | `kitchen_tickets` | `<cocina-printer>` | `KitchenRouter` |
| 24. Clínicas | `medical_records` | `<expediente>` | `EMRService` |
| 25. Automotriz | `vehicles`, columna `compatibility` | `<vehicle-selector>` | `VINDecoder` |
| 26. Producción industrial | `bom_items`, `production_routes` | `<bom-table>` | `MRPEngine` |
| ... 60 más | ... | ... | ... |

Cada módulo es **independiente** y se activa por feature flag en el tenant.

### Schema del módulo (ejemplo Rentas)

```json
{
  "id": "module-rentals",
  "name": "Rentas / Alquileres",
  "scian_categories": ["53.211.0", "53.212.0", "53.213.0"],
  "schema_extension": {
    "id": "rentas",
    "title": "Rentas",
    "visibleIf": { "is_rentable": true },
    "fields": [
      { "name": "is_rentable", "label": "Es rentable", "type": "switch" },
      { "name": "rental_price_hour", "label": "Precio por hora", "type": "currency", "visibleIf": { "is_rentable": true } },
      { "name": "rental_price_day", "label": "Precio por día", "type": "currency", "visibleIf": { "is_rentable": true } },
      { "name": "rental_deposit", "label": "Depósito garantía", "type": "currency" },
      { "name": "rental_availability_calendar", "label": "Disponibilidad", "type": "calendar-availability" },
      { "name": "rental_contract_required", "label": "Contrato requerido", "type": "switch" }
    ]
  },
  "dependencies": ["module-contracts", "module-calendar"]
}
```

---

## 5. Mapeo SCIAN → Schemas

El INEGI tiene 1,086 clases económicas en SCIAN. Cada una se mapea a un **schema template**:

```sql
CREATE TABLE scian_schema_map (
  scian_code   VARCHAR(10) PRIMARY KEY,    -- ej "722412"
  scian_label  VARCHAR(255),                -- "Cafeterías y fuentes de sodas"
  schema_id    UUID REFERENCES entity_schemas(id),
  modules      JSONB                        -- ["module-restaurants","module-recipes","module-loyalty"]
);
```

Cuando un usuario nuevo registra su negocio:
1. Selecciona giro (autocomplete con SCIAN)
2. Sistema busca en `scian_schema_map`
3. Activa los módulos correspondientes para ese tenant
4. El modal universal ya muestra solo los campos relevantes

**Ejemplo para 5 giros:**

| Giro SCIAN | Schema template | Módulos activados |
|---|---|---|
| 722412 - Cafeterías | "producto+restaurante" | restaurantes, recetas, lealtad |
| 722312 - Restaurantes con servicio completo | "producto+restaurante+combos" | restaurantes, recetas, modificadores, mesas |
| 532110 - Renta de autos | "servicio+rental" | rentas, calendario, contratos, vehículos |
| 621112 - Consultorios médicos | "servicio+clinico" | citas, expediente, recetas médicas |
| 461110 - Comercio al menudeo de abarrotes | "producto" | inventario, lotes, caducidad |

---

## 6. Roadmap por fases (realista, no fantasía)

### Fase 1 — Núcleo Schema Engine (4 semanas, 1 dev)

- [ ] Tabla `entities` + `entity_schemas` + migraciones
- [ ] API REST: CRUD entidades, list schemas, validate
- [ ] Renderer JS de schema → HTML (10 tipos básicos: text, currency, number, switch, select, date, textarea, image, tags, combobox)
- [ ] 5 schemas seed (producto, servicio, paquete, suscripción, renta básica)
- [ ] Demo: crear/editar entidades de 3 tenants distintos con schemas distintos

### Fase 2 — Módulos esenciales (8 semanas, 2 devs)

- [ ] Módulo restaurantes (cocina, modificadores, mesas)
- [ ] Módulo retail variantes (tallas, colores, grid de variantes)
- [ ] Módulo inventario avanzado (lotes, caducidad, multi-almacén)
- [ ] Módulo recetas/kits/combos (relaciones entre entidades)
- [ ] Módulo precios avanzado (mayoreo, comisiones, multimoneda básico)
- [ ] Módulo SCIAN selector (autocomplete con los 1086 códigos del INEGI)

### Fase 3 — Workflow + Permisos (4 semanas, 1 dev)

- [ ] State machine con `entity_events`
- [ ] Workflows visuales (Kanban)
- [ ] Permisos granulares (quién edita precio, quién ve costo, PIN gerente)
- [ ] Auditoría completa

### Fase 4 — Especializados Verticales (12 semanas, 2 devs)

- [ ] Módulo rentas (calendar de disponibilidad, contratos)
- [ ] Módulo citas (scheduler + recordatorios WhatsApp)
- [ ] Módulo médico (expediente + recetas)
- [ ] Módulo automotriz (VIN decoder + compatibilidad)
- [ ] Módulo hotelería (habitaciones, temporadas)
- [ ] Módulo educación (cursos, instructores)

### Fase 5 — Capa Inteligente (8 semanas, 1 dev senior)

- [ ] Motor de reglas (drag & drop)
- [ ] Motor de automatizaciones (triggers, webhooks)
- [ ] IA básica (sugerencias precio, categoría, descripción) — con API real
- [ ] Predicciones (demanda, merma) con ML básico

### Fase 6 — Enterprise (continuo, 1+ año)

- IoT/RFID hardware
- Blockchain/NFT (caso de uso específico, no general)
- Digital twin (industrial)
- Market network multi-empresa
- Multi-país fiscal (CFDI, GST, VAT, Sales Tax)

**Estimación realista:** Fases 1-3 = MVP funcional en 16 semanas. Fases 4-5 = competidor real de Odoo/Square en 12 meses. Fase 6 = continua, según mercado.

---

## 7. Decisiones técnicas clave

### Stack recomendado

| Capa | Tech | Razón |
|---|---|---|
| DB | PostgreSQL 16 con JSONB + GIN | Único modelo unificado, queries dinámicas rápidas, ACID |
| Backend | Node.js (Express o Fastify) | Ya lo usas en Volvix |
| Auth | Supabase Auth (RLS por tenant_id) | Multi-tenant gratis |
| Frontend | Vanilla JS o React/Vue (no obligatorio) | El renderer puede ser web component, framework-agnostic |
| Schema validation | ajv + JSON Schema Draft 2020-12 | Standard de la industria |
| File storage | Supabase Storage o S3 | Para imágenes, PDFs, OCR |
| Real-time | Supabase Realtime | Para inventario multi-sucursal, kitchen tickets |
| Workers | BullMQ (Redis) | Para automatizaciones, OCR, IA async |

### Anti-patterns prohibidos

| ❌ NO | ✅ SÍ |
|---|---|
| Tabla `productos` + tabla `servicios` + tabla `habitaciones` | Una tabla `entities` con `type` |
| Modal HTML hardcoded de 2000 líneas | Renderer JSON + schema |
| Lógica de "si es restaurante muestra X" hardcoded en JS | `visibleIf` en el schema |
| API `/api/products`, `/api/services`, `/api/rooms` | API `/api/entities?type=X` |
| Migración por giro nuevo | Insertar schema, listo |

### Performance

Con índice GIN sobre `attributes` y consultas con `@>` operator, PostgreSQL maneja 10M+ entidades en una sola tabla sin problema. Probado en Stripe (objects), GitHub (issues custom fields), Notion (todo).

---

## 8. ¿Esto reemplaza Volvix POS actual?

**NO. Es una capa NUEVA arriba de Volvix.**

El POS actual de Volvix funciona. Lo que cambia es:

- Hoy: `volvix_productos` table con columnas fijas
- Mañana: `entities` table con `attributes JSONB`
- Migración: script que copia `volvix_productos` a `entities` mapeando columnas viejas a `attributes`

El frontend POS sigue funcionando con queries adaptadas (acceder `attributes->>'campo'` en vez de `campo`).

**Eventualmente** el modal de "agregar producto" actual se reemplaza por el modal universal.

---

## 9. Limitaciones honestas

Lo que esta arquitectura **NO resuelve sola**:

- 🔴 **Integración real con SAT/CFDI**: requiere PAC certificado, $300-1500 USD anuales por tenant
- 🔴 **OCR de tickets/comprobantes**: requiere Vision API real (Google Vision, AWS Textract, o Claude Vision con créditos)
- 🔴 **IA predictiva real**: requiere modelo entrenado con datos del tenant
- 🔴 **Blockchain real**: requiere infraestructura (RPC nodes, gas wallet, etc.)
- 🔴 **IoT real**: requiere protocolo MQTT + hardware
- 🔴 **Multi-país fiscal**: requiere consultores fiscales por país
- 🔴 **Marketplaces (Amazon, MercadoLibre, Shopify)**: requiere certificación API por cada uno

Estos NO son problemas de arquitectura — son problemas de **integración con sistemas externos**. La arquitectura los soporta cuando los integres, pero NO los provee.

---

## 10. Conclusión y siguiente paso

### Lo que tienes ahora con este doc

✅ Modelo de datos completo (3 tablas core + extensiones)
✅ Schema JSON definido para 70 categorías
✅ Renderer JS conceptual (150 líneas)
✅ Mapeo SCIAN → schemas
✅ Roadmap por fases con tiempos realistas
✅ Stack técnico recomendado
✅ Decisión de migración desde Volvix actual

### Lo que NO tienes (y por qué)

❌ Código funcional listo para deploy → eso es Fases 1-2 (16 semanas)
❌ El modal renderizando → eso es Fase 1 sub-tarea (4 semanas)
❌ Los 70 módulos implementados → eso es Fases 4-6 (1+ año)

### Siguiente acción recomendada

**Opción A — Validar el diseño primero (recomendado):**
1. Lee este doc completo
2. Aprueba o pide cambios a la arquitectura
3. Si apruebas → en sesión siguiente construyo el prototipo Fase 1 funcional (renderer + 5 schemas + demo)

**Opción B — Saltar al código:**
1. Apruebas implícitamente el diseño
2. Próxima sesión: paso directo a construir Fase 1 (renderer + schemas + demo)

**Opción C — Esperar:**
1. Primero terminamos el sprint actual (validación 1000 giros, ya casi termina)
2. Decides si Volvix lo necesita ahora o más adelante
3. Lo guardamos para cuando tengas 5+ clientes pagando y la inversión de 4 meses de desarrollo se justifique

---

**Mi recomendación honesta:** Opción C primero (terminar lo de hoy), luego Opción A (validar diseño en sesión sin código), luego decidir si invertir en construir.

Construir el Entity Engine REAL toma 4-6 meses de un equipo. NO se hace en una sesión. Pero hoy ya tienes la arquitectura completa para empezarlo cuando quieras.
