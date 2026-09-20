# Brechas Loyverse → Volvix para la Ola 2 (por pantalla del Recorrido 2)

> 2026-09-20 · rama `apk/loyverse` · sin capturas nuevas. Comportamiento de Loyverse = `docs/LOYVERSE_REFERENCIA_MOTOROLA.md` "Recorrido 2" (app real v2.74).
> **Cómo se verificó "¿existe en Volvix?":** búsqueda (grep/regex) en el código REAL de `D:\github\volvix-integracion` @ `e17dfaa` (rama `integracion`, la más
> reciente): `public/salvadorex-pos.html` + `public/volvix-*.js`. Se cita archivo:línea o función; nada de memoria. Los números de línea envejecen: buscar por identificador.
> **Leyenda:** ✅ existe · 🟡 existe parcial / distinto · ⬜ no existe (0 coincidencias) · ❓ hay API/módulo cargado pero NO se verificó una pantalla que lo use.
> **Esfuerzo** (una tarea de 1 agente Sonnet): **S** = 1 archivo, sin API ni BD, <1 h · **M** = 2–3 archivos o API existente + prueba en navegador · **L** = API/BD nuevas o varios módulos.
> **Orden:** de lo más usado a lo menos usado (criterio de `LOYVERSE_CLONE_EJECUCION.md` §6). **Ola** = sugerencia alineada con ese plan (1b = uso diario, 2 = artículos, 4 = clientes/lealtad, 5 = recibos/ajustes).

## 1. Ticket ⋮, Mover, Despejar (uso: cada venta)

| # | Loyverse (Recorrido 2 §C) | ¿Existe en Volvix? (evidencia) | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 1.1 | ⋮ → **Despejar el ticket** con diálogo "¿Realmente quieres despejar el ticket?" CANCELAR / BORRAR | 🟡 `clearCart()` (`salvadorex-pos.html:10362`) con confirmación destructiva ("¿Eliminar toda la venta actual?"), pero el ⋮ (`#lv-more`, `:22342-22355`) solo trae **"Artículo vario" e "Imprimir cuenta"** | Agregar la entrada al ⋮ y llamar a `clearCart` (textos como Loyverse) | 1b | S |
| 1.2 | ⋮ → **Editar ticket** (nombre/comentario; deshabilitado en ticket nuevo) | 🟡 `volvix-open-tickets.js` guarda `name`/`comment` (`parseMeta`, `:10-14`; `window.__vlxOpenTicket`), sin entrada "Editar ticket" | Entrada en ⋮ habilitada solo con ticket abierto cargado; reusa el modal de Guardar | 1b | S |
| 1.3 | ⋮ → **Asignar ticket** (a cliente/empleado; deshabilitado en nuevo) | 🟡 cliente por 👤 (`#lv-customer`, `__volvixSelectedCustomerName`); `employee` viaja en `VLXMETA` (`volvix-open-tickets.js:13`) pero **no hay UI ni empleados con PIN** (Ola 3) | Asignar cliente = ya existe; asignar empleado depende de Ola 3 | 3 | M |
| 1.4 | ⋮ → **Dividir ticket** (deshabilitado en nuevo) | ❓ `TablesAPI.splitBill/splitEqual` (`volvix-tables-wiring.js:319`) para mesas; **sin pantalla** en el POS ni en el cobro; `module.split_ticket` no existe (paridad 2.5 ⬜) | Pantalla de selección de renglones + cobro de 2 tickets; reusar `splitBill` | 1b | M |
| 1.5 | ⋮ → **Mover ticket** → "Mover a…" + MOVER, lista "Tickets disponibles" | ❓ `transferTable`/`mergeOrder` (`volvix-tables-wiring.js:280,298`) solo mesas; tickets abiertos viven en `/api/sales/pending` (`volvix-open-tickets.js`) sin acción "mover" | Pantalla "Mover a…" (destino = otro ticket abierto/mesa) sobre `mergeOrder` | 1b | M |
| 1.6 | ⋮ → **Sincronizar** | 🟡 sincronización automática: cola offline y widget (`volvix-offline-queue.js`, `volvix-sync-widget.js`); **sin botón manual** | Entrada en ⋮ que fuerce el vaciado de la cola + toast | 1b | S |
| 1.7 | **TICKETS ABIERTOS** y **COBRAR** atenuados si el ticket está vacío; guardar habilita GUARDAR | 🟡 `window.__vlxOTBtn` cambia el texto a "Tickets abiertos (N)" con carrito vacío (T1.1); estado deshabilitado visual no verificado | Estilo `disabled` cuando no hay tickets/artículos | 1b | S |

## 2. Recibos (uso: diario)

| # | Loyverse (§D) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 2.1 | Lista **agrupada por fecha**, cuadro **Buscar**, icono del tipo de pago, monto, hora, `#N-NNNN` | 🟡 pantalla "Historial de ventas y devoluciones" (`salvadorex-pos.html:5107`) + `r10aOpenFindSale()` "Buscar venta" (`:5111`); agrupación por fecha e icono de pago **no verificados** | Encabezados por día, icono de pago, búsqueda incremental | 5 (subirla) | M |
| 2.2 | **Detalle**: total grande, Recibo #, Fecha, Pedido (tipo de venta), Empleado, TPV, líneas con modificadores, forma de pago | 🟡 `GET /api/sales/:id` (paridad: `83ec27a`) y líneas con modificadores/nota (`salvadorex-pos.html:8781-8812`); **Empleado y TPV no verificados** en la vista | Mostrar Empleado/TPV/Tipo de venta en el detalle | 5 | S |
| 2.3 | **REEMBOLSAR** desde el detalle | ✅ `volvix-returns-wiring.js` (devolución parcial/total, motivo obligatorio, restock, supervisor) — supera a Loyverse; `POST /api/returns` ya empareja por `code` (paridad 3.4) | Botón REEMBOLSAR con 1 toque desde el detalle del recibo | 5 | S |
| 2.4 | ⋮ del recibo: imprimir / enviar por correo | 🟡 `window.reimprimirUltimoTicket` (`salvadorex-pos.html:8798`, botón `:4543`; solo el ÚLTIMO ticket) y `sendReceipt(toEmail, ticket)` (`volvix-sendgrid-wiring.js:254`) | Menú ⋮ por recibo (cualquier recibo, no solo el último) que llame a ambos | 5 | S |

## 3. Artículo: alta y edición, campo por campo (uso: alta de catálogo; formulario real `salvadorex-pos.html:23202-23302`)

| # | Loyverse (§A) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 3.1 | **Nombre** | ✅ `pNombre` ("Nombre del producto *") | — | — | — |
| 3.2 | **Categoría** (lista, "Sin categoría") | ✅ `pCategoria` (`:23221`) | Alta de categoría desde el mismo campo (ver §6) | 2 | S |
| 3.3 | **Vendido por** Unidad / Peso | 🟡 `pUnidad` (`:23234-23237`: Pieza, Kilogramo, …) — más opciones, otro control | Radio Unidad/Peso (peso ⇒ captura por báscula/kg en el POS) | 2 | M |
| 3.4 | **Precio** (en blanco = se pide al vender) | ⬜ `precio_abierto`/`open_price`: 0 coincidencias; `pPrecio` es obligatorio ("Precio de venta *") | Precio abierto: campo opcional + diálogo de precio al tocar el mosaico (plan T1.5, `module.open_price`) | 1b | M |
| 3.5 | **Coste** | ✅ `pCosto` ("Precio de costo") | — | — | — |
| 3.6 | **REF** (SKU autonumérico) | 🟡 `pSku` "SKU interno" es un campo manual (`:23214`); no encontré autonumeración (búsquedas `nextSku`/`autoSku`/`sku…auto`: 0 en el POS y sus verticales) | Autonumerar REF al crear (siguiente consecutivo del tenant) | 2 | S |
| 3.7 | **Código de barras** | ✅ `pCodigo` + búsqueda (`onBarcodeLookup`, `:23645`) + escáner con cámara (`volvix-scan-button.js`) | — | — | — |
| 3.8 | **Seguir el Inventario** (interruptor) | ⬜ 0 coincidencias; `pStock` "Stock actual *" siempre obligatorio | Interruptor: apagado = sin stock ni alerta (servicios); afecta venta/reportes | 2 | M |
| 3.9 | **Inventario bajo** (cantidad de alerta) | ✅ `pMin` "Stock mínimo (alerta)" (`:23262`) | Mostrarlo solo con "seguir inventario" (3.8) | 2 | S |
| 3.10 | **Modificadores**: un interruptor por cada modificador | 🟡 T1.3: editor por producto dentro del formulario largo (`salvadorex-pos.html:12302,12424,12483`, `POST /api/products/modifiers`, `volvix-modifiers-wiring.js`); **no está en el modal `pNombre` (`:23202`)** | Un solo control: lista de sets con interruptor, en ambos formularios | 2 | M |
| 3.11 | **Representación en el TPV**: Color y forma (8 colores × 4 formas) o Imagen | ⬜ `tile_color`/`tile_shape`: 0 (paridad 2.4 ⬜); imagen 🟡 solo por URL (`pImageUrl`, `pImagesExtra`) | Selector 8×4 + `syncLvProducts` lo usa (plan T1.5, `module.item_tiles`); subir imagen desde cámara/galería | 2 | M |
| 3.12 | **ELIMINAR ARTÍCULOS** | ✅ `deleteProduct` (`:11941`); su confirmación no la verifiqué (el patrón existe: `VolvixUI.destructiveConfirm`, usado en `clearCart`, `:10365`) | Confirmar borrado con `destructiveConfirm` si aún no lo hace | 2 | S |
| 3.13 | Salir con ← y cambios: "Cambios no guardados — DESCARTAR CAMBIOS / CONTINUAR EDITANDO" | ⬜ 0 coincidencias (solo `beforeunload` en landings) | Guardia de "sucio" reutilizable para TODOS los formularios/modales | 1b | M |
| 3.14 | (extras de Volvix que Loyverse móvil no tiene) | ✅ Proveedor, Notas, galería, videos, descripción larga, ficha técnica (`pProveedor`…`pTechInfo`) | Colapsarlos ("modo Loyverse", T1.9): visibles solo los 8 de Loyverse | 1b | S |

## 4. Clientes (uso: frecuente en cobro)

| # | Loyverse (§C) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 4.1 | 👤＋ **Añadir cliente al ticket**: Buscar + "Clientes recientes" | 🟡 selector en cobro (`__volvixSelectedCustomerName`; `volvix-cobro-modal.js:657`) y 👤 `#lv-customer` | Lista de recientes + buscador en un solo diálogo | 4 | S |
| 4.2 | **AÑADIR CLIENTE NUEVO** desde el selector | ✅ `openNewCustomerModal()` (`salvadorex-pos.html:8617`), con detección de duplicado (`ncc-dup-warning`) | Abrirlo desde el diálogo de 4.1 | 4 | S |
| 4.3 | Campos: Nombre, Correo, Teléfono, **Dirección, Ciudad, Estado, Código postal, País, Código de cliente**, Nota | 🟡 el alta rápida tiene solo `ncc-name`, `ncc-phone`, `ncc-email`, `ncc-rfc`, `ncc-credit`, `ncc-notes` (`salvadorex-pos.html:8617+`); Dirección/Ciudad/Estado/CP/País/Código de cliente: ⬜ (`volvix-fiscal-wiring.js` solo menciona "ZIP" de archivos XML, no de domicilio) | Agregar domicilio (5 campos) y **Código de cliente** (escaneable, para lealtad) al alta; requiere columnas en la tabla de clientes (revisar con Web) | 4 | M |
| 4.4 | (superset) puntos de lealtad | ✅ `volvix-loyalty-wiring.js` cargado; canje en cobro no verificado (plan Ola 4) | Acumular/canjear en cobro | 4 | L |

## 5. Descuentos (uso: frecuente)

| # | Loyverse (§A) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 5.1 | **Catálogo** de descuentos (Nombre + Valor; blanco = pedir al vender) | ⬜ 0 coincidencias de catálogo/presets; hay `applyDiscount()` (`:15745`, F11) con monto o % libre (`vlx-discount-amount/-percent`, motivo `vlx-discount-reason`, `:7297-7301`) y promociones (`promo.type 'percent'`, `:19867`) | CRUD de descuentos predefinidos (API + back-office) y lista para elegir | 2 | L |
| 5.2 | Selector **% | Σ (monto)** | 🟡 % y monto por separado en el descuento libre | Un solo control con los dos modos | 2 | S |
| 5.3 | Descuento **por renglón** (casilla en el editor del renglón) | ⬜ `module.line_discount` "no creado" (paridad 2.2 ⬜) | Editor de renglón (cantidad, comentario, descuentos ✔, retirar): plan T1.4 | 1b | M |

## 6. Categorías

| # | Loyverse (§A) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 6.1 | Lista con nombre y "N artículos" | ❓ `volvix-categories-wiring.js` (cargado en el POS): árbol padre-hijo, `color`, `productIds`, conteos, `CategoriesAPI` CRUD (`:1-14`); pantalla que lo muestre no verificada | Pantalla de lista con conteo en Config/Artículos | 2 | M |
| 6.2 | **Color de categoría** | 🟡 el módulo guarda `color`; el POS usa icono emoji por nombre (`__iconForCategory`) | Usar `color` en pestañas y mosaicos | 2 | S |
| 6.3 | **ASIGNAR ARTÍCULOS** / CREAR ARTÍCULO desde la categoría | ⬜ 0 coincidencias | Diálogo con casillas de artículos | 2 | M |

## 7. Modificadores (back office)

| # | Loyverse (§A) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 7.1 | Lista de sets (nombre + opciones) y **Crear/Editar modificador**: Nombre, opciones con precio, AGREGAR OPCIÓN, ELIMINAR | 🟡 `volvix-modifiers-wiring.js` (`ModifiersAPI`) y editor dentro del producto (T1.3); **sin pantalla de sets** (búsquedas de "admin"/"CRUD de sets": 0) | Pantalla Artículos → Modificadores (paridad 7.2 🟡) | 2 | M |
| 7.2 | Loyverse móvil NO tiene obligatorio / única-múltiple | ✅ Volvix ya lo supera en T1.3 (obligatorio, extras, máx.) | — | — | — |

## 8. Impresoras (Config)

| # | Loyverse (§B) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 8.1 | Lista de impresoras + **Nombre** + **Modelo** (Star/Epson/Sunmi/GP/…) | 🟡 tarjetas de cocina con nombre, IP, puerto, ancho, categorías (`#cfg-comanda-box`, `salvadorex-pos.html:5792+`) y modo USB/BT/IP (`volvix-print-config.js`); sin lista de modelos (ESC/POS genérico) | "Otro modelo" = ESC/POS genérico basta; lista de modelos solo si hace falta perfiles | 5 | S |
| 8.2 | Interruptor **Imprimir recibos y cuentas** | ⬜ 0 coincidencias (un solo "Imprimir comandas", `cfg-comanda-on`) | Interruptores separados por impresora: recibos vs pedidos | 5 | M |
| 8.3 | **Imprimir pedidos** (comanda) + "Imprima un solo artículo por orden de ticket" + "Agrupar artículos idénticos" | 🟡 comandas con ruteo por categoría (`Ruteo Multi-Impresora`, `:5456`; `module.kitchen_printers`); **los dos interruptores: 0 coincidencias** | Opciones de comanda en `volvix-escpos.js`/`comanda-printer.js` (mismo código web/exe/apk) | 5 | M |
| 8.4 | **Grupos de impresora** (cocina por categoría, se configuran en Back office) | ✅ el ruteo por categorías equivale (`categories` por impresora) | — | — | — |
| 8.5 | **IMPRESIÓN DE PRUEBA** | ✅ `comandaTest` (`volvix-platform.js`) y "Probar" por tarjeta | — | — | — |
| 8.6 | Pantalla para clientes: Mostrar nombre, IP + BUSCAR, tema oscuro, VINCULAR | 🟡 CDS existe (`renderCDS`, `salvadorex-pos.html:4685`); vinculación por IP/búsqueda no verificada | Pantalla de alta de CDS remoto (plan Ola 6) | 6 | L |

## 9. Impuestos (Config)

| # | Loyverse (§B) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 9.1 | **Lista de impuestos** (Nombre, Tasa %, Tipo Incluido/Añadido, APLICAR A LOS ARTÍCULOS) | 🟡 `window.VolvixTax` con **una** config (`iva_rate 0.16`, `applies_when`, IEPS; `salvadorex-pos.html:10406-10407`) y `volvix-tax-wiring.js` (varias tasas 16/8/0/exento, IEPS, ISR, override por producto, `TaxAPI`); **sin pantalla CRUD de impuestos con nombre ni modo incluido/añadido por impuesto** | CRUD de impuestos + asignación por artículo + incluido/añadido (afecta CFDI: cuidado con contrato fiscal) | 5 | L |

## 10. General (Config)

| # | Loyverse (§B) | ¿Existe en Volvix? | Brecha | Ola | Esf. |
|---|---|---|---|---|---|
| 10.1 | **Usar la cámara para escanear** | ✅ `volvix-scan-button.js` + interruptor Config→General (`volvix_scan_camera`), APK | — | — | — |
| 10.2 | **Modo oscuro**: Usar ajustes / Desactivado / Activado | 🟡 `volvix-theme-wiring.js`, `volvix-uplift-wiring.js` (modo oscuro); tres opciones en Config no verificadas | Selector de 3 estados en General | 5 | S |
| 10.3 | **Distribución de los artículos**: Lista / Cuadrícula (diálogo con GUARDAR) | ⬜ 0 coincidencias de un ajuste Lista/Cuadrícula (paridad 1.2 ⬜); Vista 2 usa cuadrícula fija | Ajuste que cambie entre lista y cuadrícula (default: **cuadrícula**, regla del dueño) | 1b | M |
| 10.4 | **Idioma** (usar ajustes del dispositivo) | 🟡 `volvix-i18n-wiring.js` cargado; selector en Config no verificado | Selector de idioma | 5 | S |

## Prioridad sugerida (de más a menos valor por esfuerzo)

1. **Ola 1b, esfuerzo S (un solo tramo de trabajo):** 1.1 Despejar, 1.2 Editar ticket, 1.6 Sincronizar, 1.7 estados atenuados, 3.14 "modo Loyverse" del alta de artículo. Todo vive en el ⋮ / formulario ya existentes.
2. **Ola 1b, M:** 5.3 editor de renglón con descuento, 3.4 precio abierto, 3.13 guardia de "cambios no guardados", 10.3 Lista/Cuadrícula, 1.4 Dividir, 1.5 Mover.
3. **Ola 2 (artículos), M:** 3.3 Vendido por, 3.8 Seguir inventario, 3.10 modificadores en un solo control, 3.11 color y forma, 6.1–6.3 categorías, 7.1 pantalla de modificadores.
4. **Ola 4/5, S–M:** 4.1–4.3 clientes recientes y domicilio, 2.1–2.4 recibos (lista por fecha, detalle completo, reembolsar con 1 toque), 8.2–8.3 opciones de impresión, 10.2/10.4.
5. **L (planear aparte):** 5.1 catálogo de descuentos (API + back-office), 9.1 impuestos con nombre e incluido/añadido (toca CFDI), 4.4 lealtad en cobro, 8.6 pantalla para clientes remota.

**Áreas de archivo (para no pisar a exe/Web):** casi todo cae en `public/salvadorex-pos.html` (exe) y `public/volvix-*.js` de pantallas POS (exe); lo de catálogos con API nueva (5.1, 9.1, 3.8 columna `track_stock`, 3.11 columnas de mosaico) requiere `api/**` y migraciones (Web, con luz verde de Vicky). Mientras exe edita el HTML grande, las tareas nuevas deben entrar como archivos `public/volvix-*.js` propios con 1 línea `<script>` aparte.
