# POS Module Map — salvadorex-pos.html

**Archivo:** `D:\github\volvix-pos\public\salvadorex-pos.html`
**Tamaño:** 24,218 líneas
**Fecha auditoría:** 2026-05-21
**Convención unificada:** Todas las pantallas usan `<section id="screen-{name}" class="screen-pad hidden">`
(la única excepción es `#screen-pos`, que usa `class="pos-screen"` en lugar de `screen-pad` por su layout especial).

---

## Arquitectura general

### Sidebar / Navegación
**NO hay sidebar vertical.** La navegación es una **barra horizontal superior** (`<nav class="menubar">`) líneas **3984–4158**, complementada por:
- **Topbar** (`<header>`) con botones secundarios: `LIVE SYNC`, `Perfil`, `Ayuda`, `Salir`, `SAAS` (líneas 3956–3980).
- **Botones internos dentro de cada módulo** que disparan otras pantallas (deep-linking via `showScreen`).

La menubar agrupa botones en tres tiers (comentado como `ia-arquitectura`):
- **PRIMARY (diarios):** Vender, Inventario, Reportes.
- **SECONDARY (operacionales):** Corte, (Devoluciones — oculto, accesible vía Historial).
- **TERTIARY (gestión):** Clientes, Config, Cotizaciones, Recargas + varios ocultos (`display:none` con `data-ia-arq-moved-to=...`).

Los botones llevan **`data-menu`** + **`data-feature="module.X"`** y todos invocan `onclick="showScreen('X')"`.

### Router
**Función central:** `showScreen(name)` definida en línea **8132**:
```js
function showScreen(name) {
  $$('section[id^="screen-"]').forEach(s => s.classList.add('hidden'));
  const el = $('#screen-' + name);
  if (el) el.classList.remove('hidden');
  $$('.menu-btn').forEach(b => b.classList.toggle('active', b.dataset.menu === name));
  // hooks especiales: credito → loadCreditReal(); dashboard → actualizar fecha
}
```

**Wrappers** (override pattern): `showScreen` se "envuelve" múltiples veces en líneas 16194, 18900, 20163, 22468, 24018 — cada uno agrega hooks de inicialización lazy para su módulo (ej. inicializar `RentasUI` al primer acceso a `rentas`).

**Hash routing (deep-linking):** sí está activo.
- Líneas 21882–21899: lee `location.hash`, llama `showScreen(h)`, escucha `hashchange`.
- Líneas 22511–22523 y 24032–24039: handlers redundantes para hash bootstrapping.
- Query param `?module=X` también se soporta (línea 28 del comentario inicial).

**No usa localStorage para activeModule** — el estado vive en `.menu-btn.active` + sección no-hidden.

**Atajos de teclado (línea 12451+):**
- F1 → POS, F2 → Crédito, F3 → Inventario, F4 → Kardex.

---

## Módulos detectados (35 pantallas, TOP 12 principales)

Total `<section id="screen-*">`: **35 pantallas**. A continuación los **12 módulos principales** según la menubar y la jerarquía IA.

### 1. POS (Punto de Venta) — `pos`
- **Wrapper:** `#screen-pos.pos-screen` — líneas **4160–4390**
- **Botón menú:** línea 3986 (`data-menu="pos"` · "💰 Vender")
- **Subbotones/sub-tabs internos:**
  - INS Varios, Art. Común (Ctrl+P), F10 Buscar, F11 Mayoreo, F7 Entradas, F8 Salidas, DEL Borrar, F9 Verificador, 📒 Panel, 🖼️ Catálogo, ⚖ Granel, % Descuento, 📱 Recargas, 💡 Servicios, 🧮 Calc
  - Bottom: F5 Cambiar, F6 Pendiente, Eliminar, Asignar cliente, **F12 Cobrar** (CTA principal), Reimprimir, Enviar a Impresora, Ventas del día
- **Modales disparados:** `modal-pay` (F12), `modal-search` (F10), `modal-calc`, `modal-granel`, `modal-cash`, `modal-new-customer`
- **Elementos prominentes giro-aware (5):**
  - L.4169: `VENTA — Ticket {folio}` ← `data-i18n="ticket"` (en frutería: "VENTA — Comanda"; en gym: "VENTA — Reservación")
  - L.4174: `<label>Código del Producto:</label>` ← `data-i18n="codigo_producto"` (cafetería: "Código de la bebida")
  - L.4177: placeholder `"Escanear código O escribir nombre del producto…"` ← `data-i18n="placeholder_escanear"`
  - L.4287: `Productos en la venta actual.` ← `data-i18n="productos_en_venta"`
  - L.4309: `<span>F12 - Cobrar</span>` ← `data-i18n="cobrar"` (taquería: "Pedir cuenta"; salón: "Cobrar servicio")
  - L.4383: `<div class="pos-sidebar-title">Categorías</div>` ← `data-i18n="categorias"`

### 2. Dashboard — `dashboard`
- **Wrapper:** `#screen-dashboard.screen-pad.hidden` — líneas **4393–4491**
- **Botón menú:** línea 4069 (oculto: `data-ia-arq-moved-to="reportes"`)
- **Sub-componentes:** `#dash-sub` (fecha dinámica), KPIs del día, gráficas
- **Modales:** ninguno propio
- **Giro-aware:**
  - L.4396: `<h1>Dashboard</h1>` ← `data-i18n="dashboard"`
  - L.4397: `<p>Resumen del día</p>` ← `data-i18n="resumen_dia"`

### 3. Inventario — `inventario`
- **Wrapper:** `#screen-inventario.screen-pad.hidden` — líneas **4492–4741**
- **Botón menú:** línea 3990 (`📦 Inventario`)
- **Sub-tabs internos** (líneas 4536–4541, `data-inv-tab`):
  - 📦 Stock actual, 🔄 Movimientos, 📋 Conteo físico, ✏️ Ajustes
- **Modales:** modal de edición de producto (creado dinámicamente), modal de bulk adjustment
- **Giro-aware (5):**
  - L.4495: `<h1>Inventario</h1>` ← `data-i18n="inventario"` (restaurante: "Almacén"; ropa: "Existencias")
  - L.4496: `<p>0 productos</p>` ← `data-term="producto"` (gym: "0 servicios"; salón: "0 tratamientos")
  - L.4523: `+ Nuevo producto` ← `data-i18n="nuevo_producto"`
  - L.4529: KPI label `Total productos` ← `data-i18n="total_productos"`
  - L.4537: `📦 Stock actual` ← `data-i18n="stock_actual"`
  - L.4556: header tabla `Código / Producto / Categoría` ← `data-i18n="*"`

### 4. Clientes — `clientes`
- **Wrapper:** `#screen-clientes.screen-pad.hidden` — líneas **4744–4764**
- **Botón menú:** línea 4019 (`👥 Clientes`)
- **Sub-acciones:** Recargar, Exportar, + Nuevo cliente
- **Modales:** `modal-new-customer` (línea 8170+, creado dinámicamente)
- **Giro-aware (5):**
  - L.4746: `<h1>Clientes</h1>` ← `data-term="cliente"` (gym: "Socios"; salón: "Pacientes"; restaurante: "Comensales")
  - L.4746: `<p>0 clientes registrados</p>` ← `data-i18n="clientes_registrados"`
  - L.4749: placeholder `🔍 Buscar por nombre, teléfono, RFC…` ← `data-i18n="placeholder_buscar_cliente"`
  - L.4753: `+ Nuevo cliente` ← `data-i18n="nuevo_cliente"`
  - L.4759: headers tabla `Crédito / Saldo / Puntos / Última compra` ← localizar

### 5. Crédito — `credito`
- **Wrapper:** `#screen-credito.screen-pad.hidden` — líneas **4767–4788**
- **Botón menú:** línea 4037 (oculto: `moved-to="clientes"`)
- **Hook:** `showScreen('credito')` dispara `loadCreditReal()` (línea 8141)
- **Giro-aware:** títulos "Créditos / Abonos" — algunos giros no aplican (cafetería, gym).

### 6. Ventas (Historial) — `ventas`
- **Wrapper:** `#screen-ventas.screen-pad.hidden` — líneas **4789–4828**
- **Botón menú:** línea 4057 (`📄 Historial`)
- **Sub-botones:** Buscar venta (`r10aOpenFindSale`), filtros de estado/pago, Filtrar fecha, Ver todas, Recargar, Exportar
- **Modales:** `modal-sale-search` (l.6987), `modal-sale-detail` (l.7051)
- **Giro-aware (5):**
  - L.4791: `<h1>Historial de ventas y devoluciones</h1>` ← `data-i18n="historial_ventas"`
  - L.4795: `Buscar venta` ← `data-i18n="buscar_venta"` (restaurante: "Buscar comanda")
  - L.4823: headers `Ticket / Cliente / Cajero / Pago / Total / Estado` ← cambiar "Ticket" según giro
  - L.4800: options `completed/cancelled/returned`
  - L.4807: options `Efectivo/Tarjeta/Transferencia`

### 7. Reportes — `reportes`
- **Wrapper:** `#screen-reportes.screen-pad.hidden` — líneas **4831–4882**
- **Botón menú:** línea 3994 (`📊 Reportes`)
- **Sub-tarjetas (8):** Buscar venta, Búsqueda flexible, Ventas por día, Top productos, Clientes top, Rotación inventario, Ganancias, Por cajero
- **Modales:** `modal-sale-search` (compartido con Ventas)
- **Giro-aware:**
  - L.4856: `🏆 Top productos` ← `data-term="producto"` (peluquería: "Top servicios")
  - L.4861: `👥 Clientes top` ← `data-term="cliente"`
  - L.4876: `🧑‍💼 Por cajero` ← `data-i18n="por_cajero"` (gym: "Por entrenador")

### 8. Corte de caja — `corte`
- **Wrapper:** `#screen-corte.screen-pad.hidden` — líneas **4885–4978**
- **Botón menú:** línea 4011 (`🔐 Corte`)
- **Sub-componentes:** Resumen del turno (cards), Conteo físico de billetes ($500/$200/$100/$50/$20/monedas), ajustes de caja (R4c), reabrir Z
- **Sub-botones:** Imprimir corte, Exportar, Historial, Actualizar, Cerrar corte
- **Modales:** ninguno propio (alertas inline)
- **Giro-aware (5):**
  - L.4887: `<h1>Corte de caja</h1>` ← `data-i18n="corte_caja"`
  - L.4887: `<p>Cierre del turno</p>` ← `data-i18n="cierre_turno"`
  - L.4900: `Ir a Apertura` ← `data-i18n="ir_apertura"`
  - L.4950: `Resumen del turno` ← `data-i18n="resumen_turno"`
  - L.4965–4970: labels billetes `Billetes de $500/$200/...` ← localizables si la denominación no es MXN

### 9. Config — `config`
- **Wrapper:** `#screen-config.screen-pad.hidden` — líneas **4981–5618**
- **Botón menú:** línea 4023 (`⚙️ Config`)
- **Sub-tabs (8+):** General, Datos del negocio, Equipo (→ usuarios), Apps móviles, Facturación electrónica, etc.
- **Giro-aware:** títulos `Datos del negocio` cambian (gym: "Datos del estudio"; restaurante: "Datos del restaurante")

### 10. Devoluciones — `devoluciones`
- **Wrapper:** `#screen-devoluciones.screen-pad.hidden` — líneas **5852–5903**
- **Botón menú:** línea 4006 (oculto, `moved-to="historial"`)
- **Sub-botones:** filtros estado/cliente/fecha, Recargar, Exportar, + Nueva devolución
- **Modales:** `openNewReturnModal()` (creado dinámicamente)
- **Giro-aware (5):**
  - L.5855: `<h1>Devoluciones y Reembolsos</h1>` ← `data-i18n="devoluciones"` (servicios: "Cancelaciones"; salón: "Reembolso de cita")
  - L.5871: `+ Nueva devolución` ← `data-i18n="nueva_devolucion"`
  - L.5877–5880: KPI labels `Devoluciones del mes / Monto reembolsado / Pendientes aprobación / Producto más devuelto`
  - L.5859–5864: options `pending/approved/rejected/completed`

### 11. Facturación CFDI — `facturacion`
- **Wrapper:** `#screen-facturacion.screen-pad.hidden` — líneas **5776–5794**
- **Botón menú:** línea 4052 (oculto, `moved-to="reportes"`)
- **Sub-botones:** + Nueva factura, 🔑 Configurar CSD, 🔄 Recargar
- **Modales:** `modal-late-invoice` (l.7074), `modal-cfdi-cancel` (l.7109), `modal-cfdi-refacturar` (l.7134)
- **Giro-aware:** títulos "CFDI 4.0 · timbrado vía Facturama" (México-específico — en otros países este módulo desaparece)

### 12. Cotizaciones — `cotizaciones`
- **Wrapper:** `#screen-cotizaciones.screen-pad.hidden` — líneas **5796–5851**
- **Botón menú:** línea 4080 (`💬 Cotizaciones`)
- **Sub-botones:** filtros estado/cliente/fechas, Recargar, Exportar, + Nueva cotización
- **Modales:** `openNewQuotationModal()` (dinámico)
- **Giro-aware:**
  - L.5799: `<h1>Cotizaciones</h1>` ← `data-i18n="cotizaciones"` (eventos: "Propuestas"; B2B: "Presupuestos")
  - L.5805–5810: options `draft/sent/accepted/rejected/expired/converted`
  - L.5823–5826: KPIs `Tasa de conversión / Pendientes seguimiento`

---

## Pantallas adicionales (no top-12, pero presentes)

| # | Key | Línea | Título visible |
|---|-----|-------|----------------|
| 13 | `usuarios` | 5619 | Gestión de usuarios (subset de Config) |
| 14 | `apertura` | 5649 | Apertura de caja (subset de Corte) |
| 15 | `quickpos` | 5685 | Caja rápida |
| 16 | `perfil` | 5713 | Mi perfil |
| 17 | `kardex` | 5731 | Kardex (subset de Inventario) |
| 18 | `proveedores` | 5752 | Proveedores |
| 19 | `recargas` | 5905 | Recargas (tiempo aire) |
| 20 | `servicios` | 5940 | Pago de servicios |
| 21 | `promociones` | 5960 | Promociones |
| 22 | `departamentos` | 6014 | Departamentos |
| 23 | `actualizador` | 6025 | Actualizador masivo |
| 24 | `salud` | 6058 | 💚 Panel de Salud |
| 25 | `mobile-apps` | 6085 | Apps móviles |
| 26 | `ayuda` | 6109 | Ayuda |
| 27 | `fila` | 6139 | Fila de espera |
| 28 | `ingredientes` | 6232 | Ingredientes (restaurante/cocina) |
| 29 | `menu-digital` | 6370 | Menú digital |
| 30 | `marketing` | 6500 | Marketing |
| 31 | `plan` | 6594 | Plan / suscripción |
| 32 | `rentas` | 6682 | Rentas (lazy: render delegado a `window.RentasUI`) |
| 33 | `reservaciones` | 6714 | Reservaciones (lazy) |
| 34 | `mapa` | 6751 | Mapa |

---

## Modales (12 estáticos + N dinámicos)

| ID | Línea | Módulo padre que lo dispara | Propósito |
|---|---|---|---|
| `modal-pay` | 6814 | POS | Cobro (F12) — completar venta |
| `modal-sale-search` | 6987 | Ventas / Reportes | Buscar venta histórica |
| `modal-sale-detail` | 7051 | Ventas | Ver detalle de una venta |
| `modal-late-invoice` | 7074 | Facturación | Facturar venta tardía |
| `modal-cfdi-cancel` | 7109 | Facturación | Cancelar CFDI |
| `modal-cfdi-refacturar` | 7134 | Facturación | Refacturar CFDI |
| `modal-search` | 7168 | POS | Buscar producto (F10) |
| `modal-cash` | 7185 | POS | Cash-in / cash-out (F7/F8) |
| `modal-calc` | 7205 | POS | Calculadora |
| `modal-granel` | 7238 | POS | Venta a granel (peso) |
| `modal-pay-verify` | 19494 | POS | Verificación de pago (Stripe/SPEI) |
| `modal-app-pay` | 19542 | POS | Pago por app |

**Modales creados dinámicamente** (no en HTML estático, sino vía JS `createElement`):
- `modal-new-customer` (l.8170+) — disparado desde Clientes y desde POS "Asignar cliente"
- `modal-mov-detail` (l.14741) — disparado desde Inventario · Movimientos
- Modales de devolución, cotización, edición de producto, reportes — todos creados on-demand por sus handlers (`openNewReturnModal`, `openNewQuotationModal`, etc.)

**Convención modal:** `<div id="modal-X" class="modal-backdrop" onclick="if(event.target===this)closeModal('modal-X')">` con `<div class="modal">` dentro.

---

## Resumen ejecutivo (<300 palabras)

**Módulos identificados:** **35 pantallas totales** declaradas como `<section id="screen-*">`, de las cuales **12 son los módulos principales** del POS (POS, Dashboard, Inventario, Clientes, Crédito, Ventas/Historial, Reportes, Corte, Config, Devoluciones, Facturación, Cotizaciones). Los 23 restantes son subsets (kardex, apertura, usuarios) o módulos verticales por giro (ingredientes, menu-digital, rentas, reservaciones, mapa, fila).

**Modales:** **12 estáticos** en HTML (líneas 6814–7270, agrupados en un solo bloque + 2 más en l.19494/19542) y **~8–10 dinámicos** creados vía JS `createElement` (new-customer, new-return, new-quotation, edit-product, mov-detail, reports, etc.).

**Navegación:** No hay sidebar vertical — es una **barra horizontal superior** (`.menubar`, l.3984) con 3 tiers (Primary/Secondary/Tertiary) usando comentarios `ia-arquitectura`. Botones llevan `data-menu` + `data-feature="module.X"` y disparan `onclick="showScreen('X')"`. **Router central:** `function showScreen(name)` en línea **8132** — oculta todas las `section[id^="screen-"]` y muestra la solicitada. Está envuelta 5 veces con wrappers (l.16194, 18900, 20163, 22468, 24018) para inicialización lazy de cada módulo. **Hash routing** (`#modulo`) y `?module=X` activos para deep-links. **Atajos:** F1 POS, F2 Crédito, F3 Inventario, F4 Kardex.

**Dónde empezar `data-i18n` para máximo impacto visual:**
1. **POS screen (l.4160–4390)** — la pantalla más vista del cajero. Empezar por: banner ticket (l.4169), label código (l.4174), counter "Productos en la venta actual" (l.4287), botón F12 Cobrar (l.4309), título sidebar "Categorías" (l.4383), métodos de pago en `modal-pay` (l.6814+).
2. **Menubar (l.3986–4134)** — los `<span>` de cada `.menu-btn` son lo primero que ve el usuario al abrir el sistema (≈12 strings, alto ROI).
3. **Inventario (l.4492+)** y **Clientes (l.4744+)** — usar `data-term="producto"` / `data-term="cliente"` ya presentes en algunos puntos como base para que el motor de giros las reemplace globalmente.
