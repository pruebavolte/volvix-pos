# Auditoría comparativa exhaustiva — salvadorex-pos.html

> **Fecha**: 2026-05-15
> **Alcance**: 34 pantallas, 24 modales, 249 botones con handler, 609 funciones definidas.
> **Método**: comparación cross-screen + contraste con `.specify/contracts/screens/*.spec.md`
> **Foco**: "¿este botón hace lo que dice su label?" + "¿este módulo es coherente con el resto del sistema?"

---

## 1. Anti-patrones CROSS-SCREEN (afectan a múltiples pantallas)

### 🔴 AP-G1 — Cada módulo reinventó su sistema de tabs

| Pantalla | Función de tabs | Notas |
|---|---|---|
| inventario | `showInvTab('stock', this)` | usa 2 args |
| promociones | `showPromoTab('active', this)` | mismo patrón |
| proveedores | `provTab('lista', this)` | mismo patrón |
| config | `showCfg('general', this)` | mismo patrón |
| ingredientes | `ingApp.switchTab('ingredientes', this)` | dentro de IIFE |
| menu-digital | implícito (no encontré función explícita) | |

**Problema**: Cada función reimplementa lo mismo: activar tab seleccionado, deactivar resto, mostrar pane, ocultar resto. 6 implementaciones distintas → 6 lugares que pueden romperse. Cuando el usuario reporta "el tab no cambia" el agente IA tiene que adivinar cuál función toca.

**Sugerencia**: crear una sola `window.VolvixTabs.activate(group, tab, btn)` que reciba el grupo (`inv`, `promo`, etc.) y el tab name. Cada `showInvTab/provTab/...` se vuelve un alias que delega. Cero refactor de HTML.

**Prioridad**: media (refactor incremental, sin riesgo).

---

### 🔴 AP-G2 — Inconsistencia "Recargar" / "Exportar" según pantalla

| Pantalla | Tiene 🔄 Recargar | Tiene 📤 Exportar | Comentario |
|---|---|---|---|
| `pos` (Vender) | ❌ | ❌ | Innecesario (es transaccional) |
| `inventario` | ❌ | ✅ (Exportar/Importar/Limpiar duplicados) | Falta Recargar |
| `clientes` | ❌ | ❌ | **78 registros y sin export** |
| `ventas` (Historial) | ❌ | ✅ | Falta Recargar (hay que volver a entrar) |
| `dashboard` | ❌ | ✅ | OK |
| `reportes` | ❌ | ❌ | Cada reporte exporta dentro del modal |
| `corte` | ❌ | ❌ | Necesita "Imprimir corte" y "Exportar corte" |
| `apertura` | ❌ | ❌ | OK (es one-shot) |
| `kardex` | ✅ | ✅ | Patrón oro — replicar en otros |
| `proveedores` | ✅ | ❌ | Falta Exportar lista |
| `facturacion` | ✅ | ❌ | Necesita "Exportar facturas a SAT" |
| `cotizaciones` | ✅ | ✅ | OK |
| `devoluciones` | ✅ | ✅ | OK |
| `promociones` | ✅ | ✅ | OK |
| `departamentos` | ✅ | ❌ | OK (probablemente no necesite export) |

**Patrón sugerido**: TODA pantalla con tabla debe tener `🔄 Recargar` + `📤 Exportar` en la barra de acciones. Replicar el orden de `kardex` (que tiene el patrón completo) en todas.

**Quick fix**:
- `clientes`: agregar `📤 Exportar CSV` y `🔄 Recargar`
- `ventas`: agregar `🔄 Recargar`
- `corte`: agregar `🖨️ Imprimir corte` y `📤 Exportar PDF`
- `proveedores`: agregar `📤 Exportar lista`
- `facturacion`: agregar `📤 Descargar XMLs del periodo`

**Prioridad**: alta (afecta percepción del producto).

---

### 🟡 AP-G3 — Labels "Cancelar" vs "Cerrar" inconsistentes en modales

- `fila-modalAgregar`: **Cancelar** → cierra modal
- `ing-modalIng`: **Cancelar** → cierra modal
- `ing-modalReceta`: **Cancelar** → cierra modal
- `ing-modalSuggest`: **Cancelar** → cierra modal
- `menu-modalQR`: **Cerrar** → cierra modal ⚠️
- `menu-modalDigitalizar`: **Cancelar** → cierra modal

**Convención sugerida** (basada en best-practice UX):
- **Cancelar**: cuando hay un formulario y el usuario está a medio llenar
- **Cerrar**: cuando es solo informativo (modal de QR, modal de detalle)

Aplicando esto, todos están bien EXCEPTO en algunos casos:
- `modal-sale-detail` (detalle de venta): debe ser **Cerrar**, verificar
- `modal-pay-verify` (verificación bancaria): debe ser **Cancelar venta**, verificar

**Prioridad**: baja (cosmético).

---

### 🟡 AP-G4 — Botones con SOLO emoji sin label

| Pantalla | Botón | Problema |
|---|---|---|
| `recargas` | 📡 📶 📲 📞 📡 (5 botones) | No se sabe cuál carrier sin tooltip |
| `servicios` | 💧 ☎️ 📺 📡 🔥 | No se sabe cuál servicio sin tooltip |
| `ventas` | 👁️ (Ver detalle) | OK porque tiene `title=` |
| `rentas` | ↩️ + | Necesitan `title=` |
| `reservaciones` | 🪑 + | Idem |

**Sugerencia**: TODO botón solo-emoji DEBE tener `title="descripcion"` o `aria-label`. Para tablets/móvil el tooltip no aparece — sería mejor agregar texto al lado del emoji.

**Quick fix** para `recargas` y `servicios`: cambiar los botones a tener label visible (`📡 Telcel`, `💧 CFE/Agua`, etc.) — el espacio sobra.

**Prioridad**: media (accesibilidad + UX para nuevos cajeros).

---

### 🔴 AP-G5 — Duplicate state CATALOG vs PRODUCTS_REAL (detectado físicamente)

Ya documentado en `VERIFICACION-FISICA-2026-05-15.md`. **Requiere ADR-001**.

---

### 🟡 AP-G6 — Modal de pago tiene 4 variantes sin flujo claro

| Modal | Propósito |
|---|---|
| `modal-pay` | Selector principal de método de pago |
| `modal-pay-confirm` | Confirmación post-aceptar tarjeta |
| `modal-pay-verify` | Verificación bancaria humana (transfer/sinpe/oxxo) |
| `modal-app-pay` | Polling para app-pago externa |
| `modal-late-invoice` | Facturar venta ya cerrada |

**Problema**: 5 modales relacionados con pago. ¿Hay un diagrama que muestre cuándo se abre cada uno? **No**. El contrato `pos.spec.md` §4 los lista pero sin flujo visual.

**Sugerencia**: agregar a `.specify/flows/cobro-end-to-end.md` un diagrama mermaid del state machine de cobro mostrando cuándo se abre cada modal y con qué estado del ticket.

**Prioridad**: media (para nuevos desarrolladores y debugging).

---

## 2. Sugerencias POR PANTALLA

### 🛒 `screen-pos` (Vender)

| Elemento | Estado actual | Sugerencia |
|---|---|---|
| Input `#barcode-input` placeholder | "Escanear o escribir código…" | Cambiar a "Escanear código O escribir nombre" porque `searchProduct()` busca por AMBOS según las reglas L1-L4. El cajero no sabe que puede teclear "coca cola". |
| Botón **F12 Cobrar** | Abre `modal-pay` | OK — pero el atajo F12 debe estar visible cuando el cart está vacío (deshabilitado) en lugar de no aparecer. |
| Botón **F11 Mayoreo** | `togglePriceTier()` | Sugerencia: mostrar indicador visible cuando está en mayoreo (chip "MAYOREO" al lado del total). Hoy no se sabe si está activo. |
| Botón **F7 Entradas / F8 Salidas** | `cashIn()` / `cashOut()` | Verificar que registren en `pos_drawer_log` (lo confirma `pos.spec.md` §6). |
| Botón **DEL Borrar Art.** | `deleteCartItem()` | Sugerencia: confirmar antes de borrar si el item lleva > 5 min en el carrito (evitar borrado accidental). |
| Botón **Cupón** Aplicar | `applyCouponToCart()` | OK pero no veo botón "Quitar cupón" visible — el código `#pos-coupon-bar` lo tiene oculto hasta aplicar. Verificar que aparezca. |
| Botón **Reimprimir Último Ticket** | `reimprimirUltimoTicket()` | OK — verificado que llama al endpoint correcto. |
| Sidebar **PEDIDOS DE PLATAFORMAS** (Uber Eats, Didi, Rappi) | Muestra "Próximamente" | Si no está implementado, debería estar oculto detrás de feature-flag. Ocupa espacio en una pantalla crítica. |

---

### 🧾 `screen-ventas` (Historial)

| Elemento | Estado | Sugerencia |
|---|---|---|
| Subtítulo dinámico | ✅ Acabamos de arreglar — muestra "últimas 24h / N de M tickets" | Mantener. |
| Filtro estado (Completada/Devuelta) | ❌ No existe filtro por estado | Agregar `Solo completadas / Solo devueltas / Todas` (chip selector) — el contrato `historial.spec.md` C5 dice "Estado por defecto: cobrado". |
| Filtro método de pago | ❌ No existe | Agregar (`Efectivo / Tarjeta / Todos`) — útil para conciliación bancaria. |
| Botón **🔄 Recargar** | ❌ No existe | Agregar — patrón consistente con `kardex`. |
| Botón **Devolver** por fila | ✅ Existe (solo si completed) | Sugerencia: además mostrar "Reimprimir" por fila — hoy solo está disponible para el "último ticket" en POS. |
| Tabla columnas | Ticket / Fecha / Cliente / Cajero / Pago / Total / Estado | Sugerencia: agregar columna "Items" (conteo) para preview rápido sin abrir detalle. |

---

### 👥 `screen-clientes`

| Elemento | Estado | Sugerencia |
|---|---|---|
| Buscador inline | ✅ Acabamos de agregar (AP-C5) | OK |
| Botón **🔄 Recargar** | ❌ No existe | Agregar para refrescar tras crear cliente en otra pestaña. |
| Botón **📤 Exportar** | ❌ No existe | **CRÍTICO** — 78 clientes y sin export para contabilidad. Patrón de `kardex`. |
| Filtros | ❌ No existen | Agregar: "Con crédito", "Con saldo", "Con puntos", "Sin RFC" — útil para campañas. |
| Botón **Ver historial** por fila | ✅ Existe | OK — pero abre un modal. Sugerencia: el modal debe mostrar también "Total comprado YTD" y "Producto más comprado" — info útil para retención. |
| Columna **Saldo** | Muestra deuda en rojo si > 0 | Sugerencia: hacer clickable → abre modal de abonos con `abonarCredito()`. |
| Columna **Puntos** | Muestra solo número | Sugerencia: clickable → muestra historial de puntos (earn/redeem) de `loyalty_transactions`. |

---

### 📦 `screen-inventario`

| Elemento | Estado | Sugerencia |
|---|---|---|
| Subtítulo | ⚠️ "1000 productos · 807 con stock bajo" desincronizado con tabla | ADR-001 unificar CATALOG ↔ PRODUCTS_REAL |
| Buscador | `#inv-search` existe | Verificar que filtre por nombre + código + SKU (el contrato lo pide). |
| Filtro "Solo bajo stock" | Existe | OK |
| Filtro "Solo agotados" | Existe | OK |
| Filtro "Por caducar" | Existe | Sugerencia: agregar tooltip "≤30 días" para que se sepa el umbral. |
| Tabs (Stock / Movimientos / Conteo / Ajustes) | `showInvTab()` | OK — usar como referencia para AP-G1 |
| Botón **+ Nuevo producto** | OK | Sugerencia: tras crear producto, el campo "código de barras" debería tener botón "Generar código" (auto-incremental). |
| Botón **Limpiar duplicados** | Existe | ¿Cómo detecta duplicados? Verificar que sea por código de barras + nombre normalizado. Pedir confirmación antes de borrar. |
| Botón **Exportar/Importar** | OK | Sugerencia: en `Importar`, después de subir CSV, mostrar preview de qué filas son nuevas vs cuáles actualizan vs cuáles fallan ANTES de aplicar. |
| Botones por fila (Editar / Kardex / Etiqueta / +Stock / -Stock) | OK | Sugerencia: agregar botón "Ver ventas de este producto" → filtra historial por SKU. |

---

### 💰 `screen-corte` y `screen-apertura`

**Ping-pong detectado**: `corte` tiene solo botón "Ir a Apertura" y `apertura` tiene solo botón "Ir a Corte". Es ridículo.

| Pantalla | Botones que faltan |
|---|---|
| `apertura` | "Iniciar turno con efectivo $X", "Imprimir comprobante apertura", "Ver apertura anterior" |
| `corte` | "Hacer corte ahora", "Imprimir corte", "Exportar PDF", "Ver cortes anteriores (lista paginada)", "Comparar corte con sistema" (detectar faltantes) |

**Prioridad**: alta — son operaciones de fin de turno críticas para conciliación.

---

### ⚙️ `screen-config`

43 botones — la pantalla más densa. Subdividida en sub-secciones (`showCfg('general')`, etc.).

**Sugerencias generales**:
- En la sub-pantalla **🧩 Módulos y funciones**: agregar buscador (43 toggles es mucho para escanear).
- En **🔄 Sincronización**: mostrar "Última sincronización: hace X min" + indicador de éxito/fallo.
- En **🔑 Licencia**: mostrar fecha de expiración prominente con color (verde > 30 días, amarillo 7-30, rojo <7).
- En **🖨️ Impresión**: agregar botón "Imprimir página de prueba" para verificar conexión.

---

### 📱 `screen-recargas` y `screen-servicios`

**Problema**: 5 emojis sin label. El cajero nuevo no sabe qué carrier es cuál.

**Sugerencia inmediata**:
```html
<button onclick="recargaCarrier('telcel')">📡 Telcel</button>
<button onclick="recargaCarrier('att')">📶 AT&T</button>
<button onclick="recargaCarrier('movistar')">📲 Movistar</button>
<button onclick="recargaCarrier('unefon')">📞 Unefon</button>
<button onclick="recargaCarrier('bait')">📡 Bait</button>
```

Mismo para servicios:
- `💧 Agua`
- `☎️ Telmex`
- `📺 Izzi`
- `📡 TotalPlay`
- `🔥 Gas Natural`

**También**: agregar campo de "monto fijo" o "monto custom" antes de seleccionar carrier — hoy se va directo al modal del carrier sin saber el monto, lo cual es mal flujo.

---

### 🍽️ `screen-menu-digital`

| Elemento | Estado | Sugerencia |
|---|---|---|
| Botón "✅ Activar todos" / "❌ Ocultar todos" | OK | Sugerencia: agregar confirmación si son >50 productos (acción masiva sin undo). |
| Botones de idioma (ES/EN/FR) | OK | Sugerencia: indicar visualmente cuál está activo (chip dorado). |
| "✨ Digitalizar menú con IA" | OK | Sugerencia: agregar opción de "Cargar foto del menú" para OCR — más usable que pegar texto. |
| "👁 Vista cliente" | Abre menú público | Verificar que el URL sea responsive y tenga el logo del tenant. |

---

### 📅 `screen-reservaciones`

Botones con solo emoji y poca claridad (🪑 = Configurar mesa, + = Nueva reservación, ↩️ = ¿?, ⏳ Waitlist):

**Sugerencia**: agregar labels:
- `🪑 Configurar mesas`
- `⏳ Lista de espera`
- `+ Nueva reservación`
- `‹ Día anterior` / `Hoy` / `Día siguiente ›`

---

### 🗺️ `screen-mapa`

5 botones (Modo diseñador, Plantillas, Exportar, Importar, Ajustar). Bien etiquetados.

**Sugerencia única**: en "Modo diseñador", al activarlo cambiar el cursor a `crosshair` y mostrar instrucciones inline ("Click para agregar mesa, arrastra para mover, click derecho para borrar").

---

### 🔑 `screen-rentas`

Botones con poca claridad: 📦 Agregar equipo, ↩️ (¿devolución de equipo?), + (¿nuevo contrato?).

**Sugerencia**: agregar labels: `📦 + Equipo`, `↩️ Registrar devolución`, `+ Nuevo contrato`.

---

### 📋 `screen-cotizaciones`, `screen-devoluciones`, `screen-promociones`

Estos 3 siguen el patrón consistente: 🔄 Recargar / 📤 Exportar / + Nuevo. **Replicar este patrón en `clientes` y `ventas`**.

---

### 🧪 `screen-ingredientes`

| Elemento | Estado | Sugerencia |
|---|---|---|
| Tabs (Ingredientes / Recetas) | `ingApp.switchTab()` | Replicar patrón AP-G1 cuando se unifique. |
| Botón "✨ IA sugiere ingredientes" | OK | Sugerencia: mostrar costo estimado al lado de cada sugerencia. |
| Tabla recetas | OK | Sugerencia: mostrar "Margen $" calculado en vivo (ya está en código según `renderRecetas()`). |
| Botón eliminar (🗑) | OK | Sugerencia: si la receta está vinculada a un producto activo, mostrar advertencia "Este producto perderá su receta". |

---

### 📊 `screen-dashboard`

Solo 2 botones (Exportar CSV, Imprimir resumen). Es read-only — está bien.

**Sugerencia única**: agregar filtro de fecha "Hoy / Esta semana / Este mes / Custom" como header del dashboard. Hoy probablemente muestra el día actual sin opción de cambiar.

---

### 💚 `screen-salud`

Solo 1 botón "🔄 Refrescar" — OK pero estático.

**Sugerencia**: agregar auto-refresh cada 60s (con indicador visible) y semáforo de estado (verde/amarillo/rojo) en cada sub-sistema (BD, impresora, sync, internet).

---

### 📱 `screen-mobile-apps`

Solo "⬇ Instalar PWA". OK.

**Sugerencia**: mostrar QR code grande para que el cajero use su teléfono.

---

### ❓ `screen-ayuda`

Solo 2 botones (Docs, Contactar soporte). OK.

**Sugerencia**: agregar buscador de FAQs in-page (¿Cómo hago corte? ¿Cómo cobro a crédito? ¿Cómo facturo?). El cajero no quiere leer toda la doc.

---

## 3. Sugerencias POR MODAL

### `modal-pay` (Cobrar)
- ✅ Tiene métodos de pago
- ⚠️ No veo "Aplicar propina" como opción rápida (10% / 15% / 20% / Custom). Útil en giros restaurantero.
- ⚠️ Cuando cliente paga en efectivo con > total, el campo "Pagó con" debe calcular cambio automático (verificar).
- 💡 Atajos teclado: F12 confirmar, ESC cancelar, F1 efectivo, F2 tarjeta, F3 transfer.

### `modal-pay-verify` (Verificación bancaria)
- ⚠️ Crítico: debe bloquear `completePay()` hasta confirmación humana (lo dice `pos.spec.md` I6).
- 💡 Mostrar últimos 4 dígitos del depósito esperado en banner amarillo para que el cajero los compare con la app del banco.
- 💡 Botón "Rechazar (cliente no pagó)" con confirmación → vuelve a `modal-pay` sin completar venta.

### `modal-app-pay` (App pago externa)
- 💡 Polling cada 10s con countdown visible (no spinner ambiguo).
- 💡 Botón "Cancelar polling" después de 60s.

### `modal-sale-detail` (Detalle de venta)
- 💡 Mostrar timeline: "Cobrada hace X · Impresa hace Y · Reimpresa Z veces · Facturada (sí/no)".
- 💡 Botones de acción: Reimprimir / Facturar tarde / Cancelar venta (con permiso) / Devolver.

### `modal-sale-search` (Buscar venta)
- ✅ Permite buscar por monto, fecha, últimos 4 tarjeta.
- 💡 Recordar última búsqueda (sessionStorage) — útil cuando cliente vuelve por segunda vez.

### `ing-modalIng` (Nuevo ingrediente)
- ✅ Tiene Cancelar + Guardar.
- 💡 Validar costo > 0 y nombre único antes de guardar.

### `ing-modalReceta` (Nueva receta)
- ✅ Tiene flujo de agregar items.
- 💡 Mostrar costo total acumulado en vivo mientras se agregan ingredientes.
- 💡 Calcular margen sugerido al lado.

### `menu-modalQR`
- ✅ Tiene Imprimir + Cerrar.
- 💡 Botón "Compartir por WhatsApp" con link directo al menú público.

### `modal-late-invoice` (Facturar venta antigua)
- ⚠️ Verificar que respete el plazo SAT (~72h después del cierre del mes).
- 💡 Mostrar fecha límite de facturación calculada explícitamente.

---

## 4. Quick Wins (< 1 hora cada uno)

| # | Acción | Razón |
|---|---|---|
| 1 | Cambiar placeholder de `#barcode-input` a "Escanear código O escribir nombre…" | El usuario no sabe que puede buscar por nombre. |
| 2 | Agregar `🔄 Recargar` + `📤 Exportar` en `screen-clientes` y `screen-ventas` | Consistencia con `kardex`, `proveedores`, etc. |
| 3 | Etiquetar botones de carriers en `recargas` y `servicios` (`📡 Telcel`, etc.) | Accesibilidad UX. |
| 4 | Reemplazar emojis solo en `rentas` y `reservaciones` por labels | Idem. |
| 5 | Agregar chip "MAYOREO" visible cuando `togglePriceTier()` activo | Cajero no sabe si está aplicando precio mayoreo. |
| 6 | En `corte`: agregar `🖨️ Imprimir corte`, `📤 Exportar PDF`, lista de cortes anteriores | Operación crítica de fin de día. |
| 7 | En `apertura`: agregar `Iniciar turno con $X` (input efectivo) + `Imprimir comprobante` | Idem. |
| 8 | Ocultar sidebar "PEDIDOS DE PLATAFORMAS" (Uber, Didi, Rappi) detrás de feature-flag | "Próximamente" ocupa espacio en pantalla crítica. |

---

## 5. Refactors mayores (necesitan ADR)

| # | Refactor | Impacto |
|---|---|---|
| ADR-001 | Unificar `CATALOG` y `PRODUCTS_REAL` en `window.VolvixState.products` | Resuelve C7 SST violation detectada físicamente. |
| ADR-002 | `SALES` y `CUSTOMERS` arrays posicionales → arrays de objetos | Elimina ~30 puntos donde un reorden silencia errores. |
| ADR-003 | Unificar 6 sistemas de tabs en `window.VolvixTabs.activate()` | Patron AP-G1. |
| ADR-004 | Eliminar `volvix_ventas` y `pdf-export.js` references a `sales` (canonizar `pos_sales`) | Backend coherency. |
| ADR-005 | Diagrama mermaid del state-machine de modales de pago | Documentación. |

---

## 6. Hallazgos críticos (BUGS reales — no solo sugerencias)

### 🐛 BUG-001 — `inv-sub` muestra 1000 productos pero KPI dice 5
**Confirmado físicamente** en screenshots de `VERIFICACION-FISICA-2026-05-15.md`. Fix temporal aplicado; fix real = ADR-001.

### 🐛 BUG-002 — `applyHistorialFilter` no actualiza la tabla pero hace fetch (corregido)
**Estado**: ya corregido en commit `30b586e` (AP-V2).

### 🐛 BUG-003 — Botones de pago "Reimprimir" y "Térmica" en preview pueden romperse con saleId que contenga comillas
**Estado**: corregido en commit `00f1e59` (XSS reprintSale).

### 🐛 BUG-004 — sin feedback al cajero cuando `GET /api/sales` falla
**Estado**: corregido en commit `30b586e` (AP-V4) — ahora hay toast.

### 🐛 BUG-005 (potencial) — `Limpiar duplicados` en inventario sin confirmación
**No verificado físicamente**. Recomendar añadir confirmación con preview de cuáles se borrarán.

---

## 7. Próximos pasos para el siguiente ciclo

1. **Aplicar Quick Wins 1–8** (estimado: 2 horas)
2. **Crear los 5 ADRs** en `.specify/decisions/` (estimado: 1 hora por ADR)
3. **Implementar AP-G1 unificado** (`VolvixTabs`) (estimado: 4 horas + test)
4. **Test E2E del flujo cobro** (`cobro-end-to-end.md`) — los 9 pasos / 25 checkpoints (estimado: 6 horas)
5. **Promover stubs PDC a Tier 1** (estimado: 8 horas — son 5 stubs)

Total trabajo restante mapeado: ~25 horas de fixes incrementales.

---

> Reporte generado contra contratos en `.specify/contracts/screens/*.spec.md`.
> Cualquier sugerencia aquí puede convertirse en commit aplicando el prompt `prompts-sdd/AUDITORIA_SISTEMICA.md` con foco en la sugerencia específica.
