# Clon Loyverse — PLAN DE EJECUCIÓN (capa operativa)

> 2026-09-19 · Autor: Vicky (Fable, SOLO planeación). **Inventario canónico de gaps = `docs/LOYVERSE_SUPERSET_PLAN.md`**
> (220 funciones Loyverse mapeadas, 121 gaps, 6 fases, con anclajes). Este archivo NO lo duplica: define
> reglas, orden, tareas atómicas, pruebas y modelo de IA por tarea. Referencias: https://help.loyverse.com/es
> y la app Loyverse del Motorola del dueño (misma función botón por botón).

## 0. Reglas que NO se negocian

1. **Un solo código para WEB + EXE + ANDROID.** Todo vive en `public/` (Electron sirve `public/` por
   `127.0.0.1:47321`; Capacitor usa `webDir: public`; Railway sirve `public/`). PROHIBIDO poner lógica de
   negocio en `electron/` o `android/`: ahí solo van PUENTES de hardware.
2. **Puente de plataforma único:** crear `public/volvix-platform.js` → `window.VolvixPlatform` con
   `{ kind:'electron'|'android'|'web', printTicket(opts), printComanda(c), openDrawer(), scanBarcode() }`.
   Adaptadores: electron → `window.volvixElectron.*`; android → plugin Capacitor (si no existe: no-op con
   toast "No disponible en este dispositivo"); web → no-op/`window.print`. Ninguna pantalla llama
   `volvixElectron` directo: siempre `VolvixPlatform`. (Migrar lo de hoy: `VolvixComanda.onSave`,
   cobro modal `printRawText`, bloque `cfg-comanda-box`.)
3. **Somos un sistema de módulos on/off por negocio.** TODA función nueva nace detrás de una bandera:
   `data-feature="module.<clave>"` en su botón/sección + alta de la clave en `public/volvix-feature-flags.js`
   y en `public/paneldecontrol.html` (árbol de módulos) + `global.enforceFeature('<clave>')` en su endpoint
   (patrón en `api/index.js`, ver `POST /api/returns`). Default para giro restaurante: ON lo de Ola 1.
   Campos/etiquetas personalizables por negocio = mecanismo existente `giros_campos` / `giros_terminologia`.
4. **Conservar TODO lo actual** (fiado, CFDI, IEPS, giros, comandas por red, ticket 58 mm). Superset, no reemplazo.
5. **Vertical (teléfono) = CUADRÍCULA, no lista.** Loyverse en vertical muestra lista; nosotros NO.
   `.lv-products-grid` debe dar ≥3 columnas a 360 px de ancho. Prueba obligatoria en cada tarea de UI.
6. **Simple como Loyverse:** alta de producto = nombre, categoría, precio, costo, SKU, código de barras,
   "controlar stock", color/forma o imagen. Nada más visible por default (lo avanzado, colapsado).
7. **Verificar antes de codificar:** los números de línea del inventario están VIEJOS. Buscar por
   identificador (`grep -a -n`), nunca por línea. Si algo ya existe, se reutiliza; no se crea paralelo.
8. `salvadorex-pos.html` es CRLF y tiene un byte `\0`: editar con Python
   `io.open(..., newline='')` + `assert s.count(old)==1`, o con la herramienta Edit; usar `grep -a`.
9. Git: NUNCA trabajar en `main` local (divergió: tiene `1479ce7` sin subir, de otra sesión — no tocar).
   Cada tarea: `git fetch && git checkout -B tarea/<id> origin/main` → commit → `git push origin tarea/<id>:main`.
   Web se despliega sola (Railway). **EXE: un tag `v1.0.N` por OLA, no por tarea** (cada tag se auto-instala
   en toda la flota). Pipeline: memoria `volvix-exe-release-pipeline`.
10. Contraseñas: ninguna IA las teclea en campos. Login de pruebas = por API con script.

## 1. Modelo de IA por trabajo (ahorro de tokens)

| Trabajo | Modelo |
|---|---|
| Planear / decidir arquitectura / desbloquear | Fable (solo eso; PROHIBIDO programar con Fable) |
| Implementar tareas T* y revisión adversarial | **Sonnet** (mínimo capaz con un HTML de 25k líneas) |
| Greps, smoke tests, bump de versión, tag, vigilar CI, bitácora | Haiku |

Cada tarea = 1 agente, ≤3 archivos, termina con: `node --check` de cada JS tocado + prueba local descrita
+ commit. Después 1 agente revisor (adversarial-reviewer, Sonnet). Si el revisor marca BLOQUEANTE, se corrige
antes de seguir. El dueño NUNCA es el primer probador.

## 2. Anclajes verificados hoy (identificadores, no líneas)

- Shell Loyverse: `#lv-appbar`, `#lv-drawer`, `.lv-grid`, `#lv-products-grid`, `syncLvProducts`,
  `#lv-ticket-items`, `#lv-dinein` (`data-mode` here/away), `#lv-note` (`window.__vlxTicketNote`),
  `#lv-more` → `window.openVarios`, `#lv-btn-save` → `window.savePendingSale`, `#lv-btn-charge` → `window.openPayment`.
- Tickets abiertos: `window.savePendingSale` / `window.restorePendingSale` → `/api/sales/pending`
  (POST exige header `Idempotency-Key`). Mesas: `TablesAPI` en `public/volvix-tables-wiring.js`
  (`splitBill`, `splitEqual`, `mergeOrder`, `transferTable`, `seedDefaultTables`).
- Comandas: `window.VolvixComanda` {delta, markSent, reset, onSave} + `electron/comanda-printer.js`
  + IPC `volvix:comanda:print|get|save|test`. Config UI: `#cfg-comanda-box` (Config → Impresión).
- Ticket: `window.VolvixTicketCustomizer.renderText/getConfig`; cobro: `public/volvix-cobro-modal.js`
  (wrapper de `window.completePay`, llama `printRawText`). "Cobro rápido" NO imprime.
- Modificadores: tabla `product_modifiers` + `GET/POST /api/products/modifiers` (por `parent_sku`) YA existen;
  `public/volvix-modifiers-wiring.js` (`ModifiersAPI`) tiene modal POS con sets hardcodeados; el POS aún no
  lee los reales.
- KDS/CDS: `renderKDS`, `kdsMarkDone`, `renderCDS`, `readCart`. Reportes: `REPORT_DEFS`.
  Usuarios: `posNuevoUsuario`, `posEditUsuario`, `__posRoleSelect`. Impuestos: `VolvixTax`.
- Módulos: `public/volvix-feature-flags.js`, atributos `data-feature="module.*"`, `public/paneldecontrol.html`.
- Bugs conocidos: `/api/returns` busca `product_id||id` pero el carrito guarda `code` → reembolso imposible;
  `VolvixCliente.apk` nunca existió (link 404 en `marketplace.html`); CI "Build Android APK" falla en
  "Setup Android SDK"; `admin@volvix.test` superadmin activo con contraseña en repo público (decisión del dueño).

## 3. Olas y tareas (orden de ejecución)

Formato: **ID — objetivo** · flag · archivos · cómo · prueba de aceptación (PA).

### OLA 0 — Base común (hacer primero; todo lo demás depende)
- **T0.1 — VolvixPlatform (regla 2).** flag: n/a · `public/volvix-platform.js` (nuevo), `salvadorex-pos.html`
  (1 `<script>` antes de los módulos), `volvix-cobro-modal.js`. Migrar llamadas directas a `volvixElectron`
  de comandas/ticket al puente. PA: en navegador normal `VolvixPlatform.kind==='web'` y Guardar/Cobrar no
  lanzan error; harness node con `volvixElectron` falso recibe `comandaPrint` igual que hoy (5 escenarios de
  `VolvixComanda` siguen pasando).
- **T0.2 — Reembolso:** en `POST /api/returns` aceptar match por `code` además de `product_id||id`
  (sale items y request items). PA: script que arma una venta de prueba en tenant demo y la devuelve → 200.
- **T0.3 — Cobro rápido imprime ticket + comanda** reutilizando el mismo camino del cobro normal. PA: harness.
- **T0.4 — CI Android:** arreglar "Setup Android SDK" en `.github/workflows/build-apk.yml`; que el release
  `latest` incluya `VolvixPOS.apk`; quitar/ocultar el link a `VolvixCliente.apk`. PA: run verde + asset en release.
- **T0.5 — Seguridad login:** borrar el bloque `#testCreds` y su script de `public/login.html` (no solo ocultar).
  (Desactivar `admin@volvix.test` SOLO con "sí" del dueño.)

### OLA 1 — Venta estilo Loyverse para restaurante (P0 de mañana) · inventario Fase 1 + F2 modifiers + F6 cocina
- **T1.1 — Tickets abiertos completos.** flag `module.open_tickets`. Guardar pide nombre (default HH:MM) +
  comentario; N tickets; modal "Tickets abiertos" (GET `/api/sales/pending`) con buscador, orden
  (nombre/total/hora/empleado), selección múltiple → Merge; al abrir uno: `VolvixComanda.markSent`. Chips de
  tickets predefinidos (Mesa 1..N desde `seedDefaultTables`) si `module.predefined_tickets`. PA: guardar 3,
  listar, buscar, abrir, agregar 1 producto, re-guardar → comanda solo del nuevo.
- **T1.2 — Dining options configurables.** flag `module.dining_options`. `#lv-dinein` pasa de toggle a
  selector poblado de config por tenant (defaults: Comer aquí / Para llevar / A domicilio; CRUD + reordenar en
  Config). Se guarda en el pendiente, sale en ticket, comanda y KDS. PA: crear "Rappi", venderla, aparece en comanda.
- **T1.3 — Modificadores reales.** flag `module.modifiers`. Back-office "Modificadores": CRUD de SETS
  (nombre, opciones con `price_delta`, obligatorio, multi/una opción, máx) y asignación a productos por
  checkbox (persistir con la API existente por `parent_sku`; si hace falta agrupar, usar `group_label`).
  POS: al tocar producto con sets → diálogo Loyverse (opciones + cantidad + comentario); línea del ticket
  muestra modificadores y suma precio; viajan en venta, ticket, comanda (debajo del item, indentado) y KDS.
  Sembrar para TNT-MATA8 el set "Guarnición" (espagueti, arroz, puré, frijoles, nopales, verduras, papas a
  la francesa, coditos; elegir 1, $0) asignado a Guisados y Antojitos. PA: vender Milanesa+Arroz → comanda
  "1 MILANESA… / · ARROZ".
- **T1.4 — Línea del ticket:** tap en renglón = editar cantidad, descuento por línea (%/$), comentario del
  item; swipe = borrar (ya existe). flag `module.line_discount`. PA: descuento 10% a 1 de 2 items → total correcto.
- **T1.5 — Precio abierto** (`producto.precio_abierto`) + **Duplicar artículo** + **color/forma del mosaico**
  (`tile_color`, `tile_shape` usados por `syncLvProducts`). flags `module.open_price`, `module.item_tiles`.
- **T1.6 — Pre-cuenta (Print bill)** en `openVarios`: imprime "Importe a pagar" sin cerrar la venta, vía
  `VolvixPlatform.printTicket`. flag `module.print_bill`.
- **T1.7 — Cocina:** ruteo por categoría a impresora (usar tab "Ruteo Multi-Impresora" existente como fuente;
  `comanda-printer.json` pasa a lista de impresoras {nombre, ip, puerto, ancho, categorías}) + **tickets de
  corrección** (item quitado/cantidad reducida → comanda "CANCELAR"). Extiende `VolvixComanda.delta` a deltas
  negativos. flag `module.kitchen_printers`. PA: harness con 2 impresoras TCP falsas: comida→A, bebida→B.
- **T1.8 — Split:** exponer `TablesAPI.splitBill/splitEqual` en `openVarios` y en el cobro ("Dividir en N").
  flag `module.split_ticket`.
- **T1.9 — Alta de producto "modo Loyverse"** (regla 6) + verificación de cuadrícula vertical (regla 5).
- **RELEASE OLA 1:** Haiku: bump versión, tag, vigilar CI, verificar `latest.yml`. Revisor Sonnet sobre el
  diff completo de la ola ANTES del tag.

### OLA 2 — Artículos avanzados (inventario Fase 2): variantes universales (≤3 opciones, producto
cartesiano, diálogo POS), SKU ≠ código de barras, favoritos paginados, producción/desensamble.
### OLA 3 — Empleados (Fase 4): PIN 4 dígitos (hash) → `window.CURRENT_EMPLOYEE`, switch por candado,
`role.permissions{}` (14 POS + 16 back office) + helper `can()`, roles custom, reloj checador (`timecards`),
reportes de horas, propinas por empleado.
### OLA 4 — Lealtad y clientes (Fase 5): acumular/canjear puntos en el cobro, tasa configurable, saldo al
elegir cliente, código de cliente escaneable, historial, puntos en recibo.
### OLA 5 — Reportes y Ajustes (Fase 6a): resumen de ventas, por categoría/pago/hora/modificador/descuentos/
impuestos, presets de periodo, recibos navegables + CSV; tipos de pago CRUD, impuestos CRUD + incluido/agregado
+ por producto, stores multi-sucursal, redondeo de efectivo, moneda/zona horaria, features self-serve.
### OLA 6 — KDS/CDS (Fase 6b): push Realtime, estados nuevo→prep→listo, tachar item, recall, sonido,
modificadores/notas, estaciones por categoría, mesero y dining en header; CDS remoto por código, pagado/cambio.
### OLA 7 — Inventario avanzado (Fase 3): costo promedio al recibir, landed cost, valuación completa,
proveedor principal, export por documento, etiquetas.
### Hardware transversal: escaneo con cámara (BarcodeDetector + fallback), códigos con peso embebido 20/02.

Cada item de Olas 2–7 se ejecuta con la ficha del inventario (Loyverse + Impl) + reglas §0 + flag propia.

## 6. Orden por USO (más usado → menos usado)

> Criterio: frecuencia de uso diario de un comercio típico (venta/cobro se usan cada minuto; reportes, empleados
> y apps se usan semanal/mensual). Es el orden de la estructura de Loyverse (menú lateral: Ventas, Recibos, Turno,
> Artículos, Configuración, Back office, Apps). No son estadísticas publicadas por Loyverse: es criterio de uso real.

| # | Bloque | Contenido Loyverse a igualar | Estado nuestro |
|---|---|---|---|
| 1 | **Pantalla de venta** | lista/cuadrícula de artículos, filtro "Todos los artículos / Favoritos / Descuentos / <categorías>", búsqueda, tocar = agregar, contador del ticket, botón COBRAR $ | base ✅; cuadrícula ✅ (default) |
| 2 | **Ticket** | vista de ticket con renglones "NOMBRE x N  $", selector de tipo de venta, Total, GUARDAR / COBRAR; tocar renglón = editar (Cantidad ±, Comentario, Descuentos con check, RETIRAR DEL TICKET, GUARDAR); menú ⋮: Despejar, Editar, Asignar, Dividir, Mover, Sincronizar; botón cliente (+persona) | 🟡 T1.1/T1.4/T1.8 |
| 3 | **Cobro** | pantalla "Importe total adeudado", campo "Efectivo recibido" editable, botones por tipo de pago (Efectivo / Por tarjeta / Transferencia…), DIVIDIR, cambio, recibo | 🟡 T1.8 + tipos de pago (Ola 5) |
| 4 | **Tickets abiertos** | GUARDAR (nombre/comentario), lista TICKETS ABIERTOS, editar/asignar/dividir/mover | ⬜ T1.1 (en curso) |
| 5 | **Recibos** | lista cronológica + Buscar, detalle, reembolso, reimpresión | ⬜ Ola 5 (subir) |
| 6 | **Turno / caja** | Número de cierre, Fondo anterior, Cobros/Reembolsos en efectivo, Depositado, Pagos/Salidas, Efectivo teórico, Resumen de ventas (brutas/reembolsos/descuentos/netas), GESTIÓN DE TESORERÍA (monto + comentario → DEPOSITAR / PAGOS/SALIDAS), CERRAR EL TURNO | 🟡 tenemos Apertura/Corte; falta Tesorería y resumen igual (Ola 1b) |
| 7 | **Artículos** | lista, Categorías (con conteo de artículos), Modificadores (grupos con opciones), Descuentos (% o $) | 🟡 T1.3 ✅ modificadores; categorías/descuentos por igualar |
| 8 | **Configuración** | Impresoras (recibos y cocina), Pantalla para clientes, Impuestos, General (cámara para escanear, modo oscuro, distribución Lista/Cuadrícula, idioma), CERRAR SESIÓN | 🟡 T1.7 impresoras; resto Ola 5 |
| 9 | **Back office (reportes/dashboard)** | ventas, artículos, categorías, empleados, pago, impuestos… | ⬜ Ola 5 |
| 10 | **Inventario** | stock, costo, OC, ajustes, conteo | ⬜ Ola 7 |
| 11 | **Empleados / permisos / reloj** | PIN, roles, timecards | ⬜ Ola 3 |
| 12 | **Lealtad / clientes** | puntos, canje | ⬜ Ola 4 |
| 13 | **Apps / integraciones / soporte** | marketplace de apps | ⬜ último |

**Reordenamiento resultante:** después de lo que corre hoy (T0.*, T1.1–T1.3, T1.6, T1.7) el SIGUIENTE bloque es
**Ola 1b = bloques 1–3 y 6 clonados exactos**: ajuste Lista/Cuadrícula, filtro por categoría/favoritos/descuentos,
renglón editable idéntico (T1.4), pantalla de cobro idéntica con "Efectivo recibido" y tipos de pago (T1.8 + tipos
de pago configurables), Turno con Gestión de tesorería (Depositar / Pagos-Salidas) y resumen de ventas, y Recibos
con búsqueda. Luego Ola 2 (artículos/categorías/descuentos exactos) y así por la tabla.

### Referencia observada en el Motorola (2026-09-19, Loyverse v2.74, cuenta "Kists Venta")
Menú lateral: Ventas · Recibos · Turno · Artículos (Artículos/Categorías/Modificadores/Descuentos) · Configuración
(Impresoras/Pantalla para clientes/Impuestos/General) · Back office · Apps · Soporte. Detalle de pantallas en
`docs/LOYVERSE_REFERENCIA_MOTOROLA.md`.

## 4. Pruebas locales estándar (sin máquina del cliente)
1. `node --check` de cada JS tocado; para scripts inline del HTML extraer el bloque y evaluarlo en un harness
   node con `window`/`document` falsos (patrón usado para `VolvixComanda`).
2. Impresoras: servidor TCP falso en 127.0.0.1:9100 (`net.createServer`) y verificar bytes/contenido.
3. UI: abrir `https://systeminternational.app/salvadorex-pos.html` (o server local `npm run dev`, puerto 8765)
   en el navegador integrado con viewport móvil 375×812 y escritorio; capturar; contar columnas de la cuadrícula.
4. API: scripts node con login por API (tenant de pruebas, NUNCA TNT-MATA8 para escrituras de prueba).
5. Comparación Loyverse: Motorola por `adb` (hoy NO aparece en `adb devices`; solo `emulator-5556`). Cuando se
   conecte: `adb exec-out screencap -p > x.png` SOLO de la app Loyverse; cero datos personales.

## 5. Definición de "terminado" por tarea
Flag creada y visible en panel de control · funciona igual en web/exe/android (o degrada con aviso) ·
cuadrícula en vertical intacta · pruebas §4 pasan · revisor sin bloqueantes · bitácora actualizada
(`D:\github\Vicky Domotica\instalaciones\bitacora-sazon-primas.md` si afecta al cliente vivo) ·
inventario `LOYVERSE_SUPERSET_PLAN.md` actualizado (⬜→✅).
