# Contrato: Screen `inventario`
> TIER 1 — DETALLADO
> Wave 2A · 2026-05-15
> Fuente: análisis estático de `public/salvadorex-pos.html` (líneas 4356-4590+) + `public/system-map.json` + `.specify/schema-truth.md`

---

## 1. Identidad

| Campo | Valor |
|---|---|
| ID en system-map | `screen_pos_inventario` |
| `<section>` HTML | `id="screen-inventario"` |
| Ruta de activación | `showScreen('inventario')` desde nav-btn `btn_pos__inventario` |
| Parent | `mod_pos` |
| Título visible | "Inventario" |
| Subtítulo dinámico | `#inv-sub` — "0 productos" (actualizable con conteo real) |
| Endpoint propio (system-map) | `/api/admin/tenants` (solo superadmin) |

---

## 2. Responsabilidades

1. Listar el catálogo de productos del tenant con su stock actual.
2. Crear, editar y eliminar productos (`saveProduct()` / `deleteProduct()`).
3. Filtrar por texto libre, categoría, bajo mínimo, agotados, y por caducar.
4. Mostrar KPIs: total productos, valor al costo, bajo mínimo, sin stock.
5. Registrar movimientos de inventario (entrada, salida, ajuste, merma, traslado, devolución).
6. Soportar conteo físico en 4 pasos (A→B→C→D): iniciar, capturar, revisar discrepancias, aplicar ajustes.
7. Ajuste rápido individual de stock con motivo obligatorio.
8. Exportar catálogo a CSV / importar desde CSV.
9. Detectar y limpiar productos duplicados.
10. Superadmin: ver inventario de cualquier tenant (switcher de tenant).

---

## 3. UI — Árbol de elementos

```
#screen-inventario
  .page-head
    h1.page-title              "Inventario"
    p.page-sub#inv-sub         "0 productos"
    .btn-row
      #inv-search              <input text> búsqueda libre
      #inv-cat-filter          <select> categorías
      #inv-only-low            <checkbox> Solo bajo stock
      #inv-only-zero           <checkbox> Solo agotados
      #inv-only-expiry         <checkbox> Por caducar (≤30 días)
      #inv-tenant-switcher     [hidden|flex] solo superadmin — <select> #inv-tenant-select
      #btn-export-prod         [📤 Exportar]
      #btn-import-prod         [📥 Importar]
      #inv-import-file         <input file> .csv (oculto)
      #btn-dedupe-prod         [🧹 Limpiar duplicados]
      #btn-new-prod            [+ Nuevo producto]

  // KPIs
  .kpi-grid
    #inv-stat-total            Total productos
    #inv-stat-value            Valor al costo ($)
    #inv-stat-low              Bajo mínimo (warn color)
    #inv-stat-zero             Sin stock (danger color)

  // Tabs
  .config-tabs
    [📦 Stock actual]    data-inv-tab="stock"   → showInvTab('stock')
    [🔄 Movimientos]     data-inv-tab="movs"    → showInvTab('movs')
    [📋 Conteo físico]   data-inv-tab="count"   → showInvTab('count')
    [✏️ Ajustes]         data-inv-tab="adjust"  → showInvTab('adjust')

  // Tab: Stock actual
  #inv-tab-stock .card
    #inv-bulk-bar              [hidden|visible] bulk-select bar
      #inv-bulk-count          "N seleccionados"
      #btn-bulk-clear          [Limpiar selección]
      #btn-bulk-adjust         [Ajustar seleccionados] → bulk-adjust modal
    table.tbl
      thead: [checkbox | Código | Producto | Categoría | Costo | Precio | Stock | Mín | Estado | acciones]
      #inv-check-all           <checkbox> seleccionar todos
      #inv-body                <tbody> filas dinámicas

  // Tab: Movimientos
  #inv-tab-movs .card
    filtros: #movs-from, #movs-to, #movs-type, #movs-prod, #movs-user
    #btn-load-movs             [🔄 Recargar] → loadMovimientos()
    #btn-export-movs           [📤 Exportar CSV]
    table.tbl
      thead: [Fecha | Tipo | Producto | Cantidad | Antes | Después | Usuario | Motivo]
      #movs-body

  // Tab: Conteo físico — máquina de estados A→B→C→D
  #inv-tab-count .card
    #count-step-a              Iniciar conteo
      #count-name              <input> nombre del conteo
      #count-area              <input> área (opcional)
      #count-msg-a             mensaje de error
      #btn-count-start         [▶ Iniciar conteo]
      #btn-count-resume        [↻ Resumir conteo en curso] (solo si hay conteo activo)

    #count-step-b [hidden]     Capturar conteos
      #count-active-name       nombre del conteo activo
      #count-active-id         ID del conteo
      #count-progress          "N productos contados"
      #btn-count-add           [+ Por producto]
      #btn-count-barcode        [🔢 Por barcode]
      #btn-count-pause         [⏸ Pausar]
      #btn-count-review        [✓ Revisar discrepancias]
      #btn-count-cancel        [✕ Cancelar]
      #count-barcode-input     <input> escaneo barcode
      #count-body              <tbody> productos en conteo

    #count-step-c [hidden]     Revisar discrepancias
      KPIs: #count-stat-total, #count-stat-pos, #count-stat-neg, #count-stat-value
      #btn-count-back-b        [‹ Volver a capturar]
      #btn-count-cancel-c      [✕ Cancelar conteo]
      #btn-count-finalize      [✓ Aceptar y aplicar ajustes]
      #count-review-body       tabla discrepancias

    #count-step-d [hidden]     Resumen final
      #count-summary           resumen texto
      #btn-count-print         [🖨 Imprimir]
      #btn-count-close         [Cerrar]

  // Tab: Ajustes
  #inv-tab-adjust .card
    // Ajuste rápido
    #adj-product               <select> producto
    #adj-type                  <select> entrada|salida|ajuste exacto
    #adj-qty                   <input number>
    #adj-reason-sel            <select> motivo (compra|merma|robo|daño|regalo|devolución|otro)
    #adj-reason                <input text> notas detalle
    #adj-msg                   error inline
    #btn-adj-submit            [Registrar movimiento]
    // + panel de historial de ajustes recientes (últimos 50)
```

---

## 4. Estado (State)

| Variable | Tipo | Descripción |
|---|---|---|
| `CATALOG[]` | `array` | Cache local de productos. Fuente: `loadCatalogReal()` → `/api/products` |
| `activeCount` | `object \| null` | Conteo físico activo `{count_id, name, area, lines[]}` |
| `invTab` | `'stock'|'movs'|'count'|'adjust'` | Tab activo |
| `selectedProds[]` | `array` | IDs seleccionados en bulk-bar |
| `invFilter` | `object` | `{search, category, onlyLow, onlyZero, onlyExpiry, tenantId}` |

---

## 5. Endpoints (todos autenticados via `_authFetch`)

### Productos (catálogo)
| Método | URL | Cuándo |
|---|---|---|
| `GET` | `/api/products?tenant_id={tid}` | Al cargar screen (`loadCatalogReal()`) |
| `GET` | `/api/products?search={q}&limit=10&tenant_id={tid}` | Búsqueda live en topbar |
| `POST` | `/api/products` | Crear producto nuevo |
| `PATCH` | `/api/products/{id}` | Editar producto existente |
| `DELETE` | `/api/products/{id}` | Eliminar producto por ID |
| `DELETE` | `/api/products?code={code}&tenant_id={tid}` | Eliminar producto por código (fallback) |
| `POST` | `/api/products/import` | Importar CSV (batch) |
| `GET` | `/api/products/next-barcode` | Sugerir siguiente código libre (silencioso) |
| `GET` | `/api/products/check-barcode?code={v}` | Validar unicidad de barcode en tiempo real |
| `POST` | `/api/products/seed-from-giro` | Poblar catálogo desde giro del negocio |
| `POST` | `/api/inventory/dedupe` | Detectar y consolidar duplicados |

### Movimientos de inventario
| Método | URL | Cuándo |
|---|---|---|
| `GET` | `/api/inventory-movements?{params}` | Tab Movimientos (btn Recargar) |
| `POST` | `/api/inventory-movements` | Ajuste rápido individual + fallback de bulk |
| `POST` | `/api/inventory/bulk-adjust` | Ajuste bulk seleccionados (con fallback individual) |
| `GET` | `/api/inventory/alerts?tenant_id={tid}` | Alertas de bajo stock (`refreshLowStockAlerts()`) |

### Conteo físico
| Método | URL | Cuándo |
|---|---|---|
| `POST` | `/api/inventory-counts/start` | Iniciar nuevo conteo |
| `GET` | `/api/inventory-counts/{id}/lines` | Retomar conteo activo (resume) |
| `PATCH` | `/api/inventory-counts/{id}/lines` | Guardar líneas (best-effort, silencioso) |
| `POST` | `/api/inventory-counts/{id}/pause` | Pausar conteo |
| `POST` | `/api/inventory-counts/{id}/resume` | Resumir conteo pausado |
| `POST` | `/api/inventory-movements` | Aplicar discrepancias (una por una en finalización) |

### Admin (superadmin only)
| Método | URL | Cuándo |
|---|---|---|
| `GET` | `/api/admin/tenants` | Poblar `#inv-tenant-select` (solo si 200 OK) |

---

## 6. Flujo principal — Cargar inventario

```
1. showScreen('inventario')
   └─ loadCatalogReal()
      ├─ GET /api/products?tenant_id={tid}
      ├─ Guardar en CATALOG[]
      ├─ Calcular KPIs (total, valor, bajo_min, sin_stock)
      ├─ Renderizar #inv-body con filtros aplicados
      └─ Si superadmin: GET /api/admin/tenants → mostrar #inv-tenant-switcher

2. Filtros (reactivos — sin llamada API extra)
   └─ input #inv-search / change #inv-cat-filter / change checkboxes
      └─ filtrarYRenderizar(CATALOG, filtros)
```

---

## 7. Flujo — Crear/editar producto

```
1. [+ Nuevo producto] → promptProductForm(prefill?)
   └─ Muestra modal/form con campos:
      code, name, category, price, cost, stock, min_stock, barcode,
      unit, description, expiry_date (opcional)

2. Validación local:
   ├─ code y name requeridos
   └─ GET /api/products/check-barcode si barcode cambia

3. saveProduct(data, productId?)
   ├─ POST /api/products     (crear)
   └─ PATCH /api/products/{id} (editar)

4. OK → loadCatalogReal() + showToast
```

---

## 8. Flujo — Conteo físico (4 pasos)

```
Step A: iniciar
  [▶ Iniciar conteo]
  └─ POST /api/inventory-counts/start {name, area, tenant_id}
     ├─ 200 → { count_id } → activeCount = {count_id, name} → showStep('b')
     └─ 409 → "Ya hay un conteo activo" → ofrecer #btn-count-resume
               GET /api/inventory-counts/{active_count_id}/lines → cargar líneas

Step B: capturar
  - Añadir por producto (#btn-count-add) o barcode scan (#count-barcode-input)
  - Cada cambio en líneas → PATCH /api/inventory-counts/{id}/lines (silencioso)
  - [⏸ Pausar] → POST /api/inventory-counts/{id}/pause
  - [✓ Revisar] → showStep('c')
  - [✕ Cancelar] → confirm → limpiar activeCount

Step C: revisar discrepancias
  - Muestra solo productos con discrepancia ≠ 0
  - [‹ Volver] → showStep('b')
  - [✓ Aceptar y aplicar]
    └─ Para cada discrepancia: POST /api/inventory-movements {type:'ajuste', qty, reason:'Conteo físico {name}'}
       → loadCatalogReal() → showStep('d')

Step D: resumen final
  - Muestra totales: contados, disc+, disc−, valor total ajustes
  - [🖨 Imprimir] → imprime resumen
  - [Cerrar] → activeCount = null → showStep('a') → loadCatalogReal()
```

---

## 9. Invariantes

- **INV-I1**: `CATALOG` siempre filtrado por `tenant_id` del usuario autenticado (a menos que superadmin cambie el switcher).
- **INV-I2**: `deleteProduct` siempre pide confirmación destructiva con texto "ELIMINAR" antes de ejecutar el DELETE.
- **INV-I3**: El `tenant_id` en los payloads de movimientos es sobre-escrito server-side desde JWT. El cliente lo manda por conveniencia.
- **INV-I4**: No puede haber dos conteos activos simultáneos para el mismo `tenant_id + area` (409 en `/api/inventory-counts/start`).
- **INV-I5**: Las líneas del conteo se salvan silenciosamente (`best-effort`) — la pérdida de datos en crash es aceptable pero el server debe ser la fuente de verdad una vez `POST /start` responde.
- **INV-I6**: El `#inv-tenant-switcher` solo se muestra si `/api/admin/tenants` responde 200 — nunca se muestra por defecto.
- **INV-I7**: Un barcode debe ser único por tenant. `check-barcode` valida esto en tiempo real (debounced).

---

## 10. Anti-patrones (prohibidos)

- NO renderizar filas del inventario antes de que `loadCatalogReal()` complete.
- NO confiar en el `tenant_id` del cliente para operaciones de write — el server debe derivarlo del JWT.
- NO eliminar producto sin confirmación destructiva (requireText: 'ELIMINAR').
- NO aplicar ajustes de conteo físico sin pasar por Step C (revisión) — el usuario debe ver y aprobar las discrepancias.
- NO hacer el `POST /api/inventory-counts/start` sin validar `name.length > 0` localmente.
- NO mostrar `#inv-tenant-switcher` salvo que `/api/admin/tenants` responda 200.
- NO filtrar en el server en cada keystroke de `#inv-search` — el filtro es local sobre `CATALOG[]`.

---

## 11. Deudas técnicas

| ID | Severidad | Descripción |
|---|---|---|
| DT-I1 | ALTA | `pos_products` vs `products` vs `volvix_productos` — tres tablas posibles (schema-truth). La API usa `pos_products` (19 menciones) pero `pdf-export.js` usa `products`. Verificar cuál tiene datos reales. |
| DT-I2 | ALTA | `inventory_movements` vs `pos_inventory_movements` — no hay deuda explícita en schema-truth pero el endpoint dice `/api/inventory-movements` que mapea a tabla `inventory_movements` (R14). Confirmar que `inventory_movements` tiene RLS. |
| DT-I3 | MEDIA | `system-map.json` solo lista `/api/admin/tenants` como endpoint propio — los 20+ endpoints reales no están mapeados. System-map incompleto. |
| DT-I4 | MEDIA | Fallback de importación CSV: si `/api/products/import` falla, hace POST individual uno por uno. Sin barra de progreso visible — UX pobre para catálogos grandes. |
| DT-I5 | MEDIA | Conteo físico guarda líneas `best-effort` (PATCH silencioso). Si el navegador se cierra entre Step B y Step C, las líneas no guardadas se pierden. |
| DT-I6 | BAJA | `#btn-dedupe-prod` — flujo de 2 pasos con confirmación estricta, pero el contrato del endpoint `/api/inventory/dedupe` no está especificado (qué considera duplicado, cómo consolida). |
| DT-I7 | BAJA | `exportProductsCSV()` — intenta server-side primero pero no hay contrato de qué endpoint. El fallback es generación local en el cliente. |

---

## 12. Checklist R9 (listo para producción)

| # | Check | Estado |
|---|---|---|
| R9-I1 | Catálogo cargado por tenant antes de renderizar | PRESENTE |
| R9-I2 | Filtros locales sobre CATALOG (sin llamada API extra) | PRESENTE |
| R9-I3 | Confirmación destructiva para eliminar producto | PRESENTE (requireText 'ELIMINAR') |
| R9-I4 | Validación unicidad barcode en tiempo real | PRESENTE (debounced) |
| R9-I5 | Conteo físico con revisión obligatoria de discrepancias | PRESENTE (Step C) |
| R9-I6 | Guard 409 por conteo activo duplicado | PRESENTE |
| R9-I7 | Tenant-switcher solo para superadmin (guard por 200 OK) | PRESENTE |
| R9-I8 | Tabla destino en Supabase confirmada | PENDIENTE (deuda DT-I1) |
| R9-I9 | RLS en inventory_movements confirmado | PENDIENTE (deuda DT-I2) |
| R9-I10 | Progreso visible en importación CSV grande | PENDIENTE (deuda DT-I4) |
