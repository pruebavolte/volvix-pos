# Contrato Tier 1: Screen `clientes`
> Generado por Wave 2A · 2026-05-15 · SalvadoreX SDD

---

## 1. Identidad

| Campo | Valor |
|---|---|
| `showScreen()` key | `clientes` |
| `section#id` en HTML | `screen-clientes` |
| Archivo | `public/salvadorex-pos.html` |
| Rol mínimo requerido | `cashier` (lectura), `manager`/`owner` (crear/editar crédito) |
| Módulo habilitador | `module.clientes` (feature flag en `FEATURES` object, línea ~7142) |
| Parent módulo | `mod_pos` (system-map nodo `screen_pos_clientes`) |

---

## 2. Responsabilidades

1. **Listar clientes del tenant** — tabla paginada (hasta 500 en memoria) con nombre, teléfono, crédito autorizado, saldo deudor, puntos de lealtad y fecha de última compra.
2. **Crear nuevo cliente** — modal `modal-new-customer` con CRUD (nombre*, teléfono, email, RFC, crédito autorizado, notas); detecta duplicados por teléfono/email (HTTP 409 `CUSTOMER_DUPLICATE`) y ofrece `force_create`.
3. **Asignar cliente a ticket activo** — `openCustomerSelector()` busca en CUSTOMERS en memoria con filtro en vivo; abre `openNewCustomerModal()` si no existe.
4. **Mostrar puntos de lealtad** — columna `Puntos` del array CUSTOMERS[4]; vinculado a tabla `loyalty_transactions`.
5. **Proveer datos al POS** — el array global `CUSTOMERS` (formato posicional de 6 elementos) es la fuente compartida con el cobro, el selector de cliente, y el módulo de crédito.

---

## 3. UI Principal

### Estructura HTML (líneas 4610–4623)
```
section#screen-clientes.screen-pad.hidden
  └─ .page-head
       ├─ h1.page-title "Clientes" + p#cli-sub "N clientes registrados"
       └─ button.btn.accent [onclick=openNewCustomerModal()]
  └─ .card > .tbl-wrap > table.tbl
       └─ thead: Cliente | Teléfono | Crédito | Saldo | Puntos | Última compra | (acciones)
       └─ tbody#cli-body [renderizado por renderClientes()]
```

### Columnas renderizadas (`renderClientes()`, línea 11056)
| Índice CUSTOMERS | Columna visual | Tipo |
|---|---|---|
| `c[0]` | Cliente (nombre) | texto |
| `c[1]` | Teléfono | texto gris |
| `c[2]` | Crédito ($) | número `fmt()` |
| `c[3]` | Saldo ($) | número rojo si `>0` |
| `c[4]` | Puntos | entero |
| `c[5]` | Última compra | fecha o `'—'` |

### Botón de acción por fila
- `btn.sm "Ver"` — sin handler definido en `renderClientes()` (GAP: botón sin acción).

---

## 4. Estado en Memoria

| Variable | Scope | Descripción |
|---|---|---|
| `CUSTOMERS` | global `let` | Array de arrays posicionales [nombre, telefono, credit_limit, debt, purchases_count, last_purchase_at] |
| `CUSTOMERS.length` | derivado | Contador mostrado en `#cli-sub` |

### Fuentes de llenado de `CUSTOMERS`:
1. **DataLoader principal** (`VolvixDataLoader.loadAll()`, línea 7465): `GET /api/customers?limit=500` → mapea `c.name, c.phone, c.credit_limit, c.debt, c.purchases_count, c.last_purchase_at`.
2. **Path alternativo de reconexión** (línea 7856): `GET /api/customers?tenant_id=X` → mapea `c.credit_balance` en lugar de `c.debt` (inconsistencia de campo).
3. **Post-creación modal** (línea 8073): recarga via `GET /api/customers` sin parámetros → mapea `c.last_purchase` (sin `_at`).
4. **Custom event** `volvix:customers-loaded` disparado después de carga exitosa.

---

## 5. Endpoints API

| Método | Endpoint | Cuándo | Notas |
|---|---|---|---|
| `GET` | `/api/customers?limit=500` | Boot (DataLoader) | Devuelve `{ customers: [...] }` o array directo |
| `GET` | `/api/customers?tenant_id=X` | Reconexión SSO | Path secundario — mismo array |
| `GET` | `/api/customers?search=Q` | Customer selector (POS cobro) | Búsqueda fuzzy |
| `GET` | `/api/customers` | Post-create refresh | Sin filtros |
| `POST` | `/api/customers` | `openNewCustomerModal` submit | Body: `{name, phone, email, rfc, credit_limit, notes, [force_create]}` |

### Tablas Supabase involucradas (schema-truth)
- Primaria: `customers` (9x API) — columnas: `id, tenant_id, name, email, phone, rfc, loyalty_points, tier_id, created_at`
- Ambigua: `pos_customers` (2x API) — posible tabla dual (Deuda D4 schema-truth)
- Lealtad: `loyalty_transactions` — `{customer_id, sale_id, points, type ('earn'|'redeem'), balance_after}`
- Tiers: `loyalty_tiers` — `{min_points, discount_percent, perks}`

---

## 6. Flujo Principal

```
showScreen('clientes')
  └─ [CUSTOMERS ya lleno por DataLoader] → renderClientes() → pinta #cli-body
  └─ [CUSTOMERS vacío] → tabla vacía, #cli-sub "0 clientes registrados"
       └─ VolvixDataLoader dispara GET /api/customers
            └─ OK → CUSTOMERS.push(...) → renderClientes()
            └─ ERROR → console.warn, UI queda vacía (sin error toast)

[Usuario: + Nuevo cliente]
  └─ openNewCustomerModal()
       └─ Crea DOM modal si no existe (lazy build)
       └─ Muestra modal#modal-new-customer
       └─ [Submit]
            ├─ Validaciones client: name required, email format, credit_limit >= 0
            ├─ POST /api/customers { name, phone, email, rfc, credit_limit, notes }
            ├─ [200] → showToast("✓ Cliente creado") → GET /api/customers → renderClientes()
            ├─ [409 CUSTOMER_DUPLICATE] → muestra dupBox con cliente existente + botón "Usar este" 
            │     └─ [force_create=true] → reenvía POST con force_create
            └─ [otro error] → msg.textContent = error

[POS: Asignar cliente al ticket]
  └─ openCustomerSelector()
       └─ Busca en CUSTOMERS con input fuzzy
       └─ Si no existe → abre openNewCustomerModal()
       └─ Selecciona → guarda customer_id en estado del ticket (st.customer.id)
```

---

## 7. Invariantes

1. `CUSTOMERS` SIEMPRE es un array de arrays de 6 elementos. Código que lo consume (renderClientes, openCustomerSelector) accede por índice posicional — cualquier cambio de orden rompe todo.
2. El contador `#cli-sub` DEBE actualizarse en cada llamada a `renderClientes()` (bug anterior: solo se actualizaba en el try-catch del fetch).
3. `credit_limit >= 0` — validado en client y DEBE validarse en server.
4. El `modal-new-customer` se construye UNA sola vez (lazy, primera apertura); las siguientes llamadas reusan el DOM existente. El flag `_nccForceCreate` es local al closure del evento.
5. El campo duplicado de mapeo (`c.debt` vs `c.credit_balance` vs `c.last_purchase` vs `c.last_purchase_at`) depende del path de carga — existe inconsistencia activa que puede mostrar saldo $0 o fecha incorrecta según cuál path ganó.

---

## 8. Anti-Patrones Conocidos

| # | Anti-patrón | Severidad | Descripción |
|---|---|---|---|
| AP-C1 | Botón "Ver" sin handler | MEDIA | `renderClientes()` genera `<button class="btn sm">Ver</button>` sin onclick. No abre detalle de cliente ni historial de compras. |
| AP-C2 | Tres campos de mapeo inconsistentes | ALTA | `c.debt` / `c.credit_balance` / `c.deuda` para el mismo concepto según path de carga. |
| AP-C3 | Sin paginación server-side | MEDIA | `?limit=500` fijo. Tenants con >500 clientes no ven el resto. |
| AP-C4 | Array posicional frágil | ALTA | `CUSTOMERS` usa índices [0..5] en lugar de objetos con nombre de campo. Un reordenamiento silencia errores. |
| AP-C5 | Sin búsqueda/filtro en la tabla | MEDIA | No hay input de búsqueda en `screen-clientes`. Solo existe en `openCustomerSelector()` (popup del POS). |
| AP-C6 | Tabla `customers` vs `pos_customers` | ALTA | Deuda D4: dos tablas activas en producción para el mismo concepto. RLS puede diferir. |

---

## 9. Deudas Técnicas

| ID | Descripción | Origen |
|---|---|---|
| DT-C1 | Botón "Ver" sin funcionalidad (historial de compras del cliente) | Código comentado / no implementado |
| DT-C2 | Unificar `customers` + `pos_customers` en una sola tabla | schema-truth D4 |
| DT-C3 | Migrar `CUSTOMERS` de array posicional a array de objetos | Fragilidad estructural |
| DT-C4 | Agregar búsqueda/filtro inline en la tabla de clientes | UX gap |
| DT-C5 | Normalizar campo de mapeo (`debt` vs `credit_balance`) | Inconsistencia multi-path |
| DT-C6 | Implementar edición de cliente (PUT /api/customers/:id) | No existe en UI |
| DT-C7 | Paginación server-side para tenants con >500 clientes | Límite hardcoded |

---

## 10. Checklist R9

- [x] Bloque HTML `section#screen-clientes` identificado y analizado
- [x] Funciones JS principales documentadas (`renderClientes`, `openNewCustomerModal`, `openCustomerSelector`)
- [x] Array global `CUSTOMERS` — estructura y fuentes de llenado documentadas
- [x] Endpoints API listados con método, path y contrato de request/response
- [x] Tablas Supabase mapeadas (`customers`, `pos_customers`, `loyalty_transactions`, `loyalty_tiers`)
- [x] Flujo principal de usuario documentado (paso a paso)
- [x] Invariantes definidas (5)
- [x] Anti-patrones identificados (6)
- [x] Deudas técnicas registradas (7)
- [ ] Validación en producción (pendiente — análisis estático únicamente)
- [ ] Test E2E cubriendo: crear cliente, duplicado 409, force_create, asignar a ticket

---

> Tier 1 · Wave 2A · 2026-05-15 · Generado por agente Wave 2A (SalvadoreX SDD)
