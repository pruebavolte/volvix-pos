# Paridad WEB / EXE / APK — clon Loyverse

> Mantiene: sesión **Loyverse Unificación** (rama `integracion`). Base: `origin/ola1/loyverse` @ `07ddd71`. Corte: 2026-09-20.
> Regla de oro del dueño: web, exe y android = **el mismo código** y **las mismas funciones**. Todo en `public/`; solo cambia el
> puente de hardware (`window.VolvixPlatform`, `public/volvix-platform.js`). Cada función es un módulo on/off (`module.*`).
> Referencia funcional: app Loyverse del Motorola (`docs/LOYVERSE_REFERENCIA_MOTOROLA.md`) y help.loyverse.com/es.
> Una función NO está terminada hasta tener las 3 plataformas ✅ o la degradación documentada y **aprobada por el dueño**.

**Leyenda:** ✅ verificado en esa plataforma (commit + prueba) · 🟡 código en la rama, aún SIN verificar en esa plataforma ·
⬜ no existe · ⚠️ degradado, sin aprobación del dueño · ➖ no aplica.
Hoy **nada está ✅**: solo hay pruebas de harness/mock de la sesión exe; falta humo real (navegador 375x812 + escritorio, exe, APK).

## Ramas y áreas de archivo (para que no se pisen)

| Sesión | Rama | Área exclusiva |
|---|---|---|
| Loyverse exe | `ola1/loyverse` (o `exe/*`) | `public/salvadorex-pos.html` (**única** que edita el HTML grande, CRLF), `public/volvix-*.js` de pantallas POS (tickets abiertos, comandas, modificadores UI, cobro, ticket), `electron/**`, bloque *electron* de `volvix-platform.js` |
| Loyverse APK | `apk/loyverse` | `android/**`, `capacitor.config.json`, `.github/workflows/build-apk.yml`, `public/volvix-capacitor-*.js`, bloque *android* de `volvix-platform.js` |
| Loyverse Web | `web/loyverse` | `api/**`, `public/paneldecontrol.html`, `public/volvix-feature-flags*.js`, `migrations/**` y seeds (`feature_modules`), pantallas back office/marketplace |
| Integración (yo) | `integracion` | `docs/PARIDAD_*`, `scripts/check-paridad.js` + baseline, `.github/workflows/ci.yml`, versiones (`package.json`, `public/version.json`), todos los merges |

Reglas: nadie toca `main`, nadie hace tag, nadie sube a Railway (solo yo, con OK del dueño). Commits chicos por tarea, push solo a **su** rama.
Si otra sesión necesita algo en un archivo que no es suyo: 1 línea `<script src>` en commit aparte + aviso a la integradora; lo demás se pide por mensaje.
Antes de cada tarea nueva: `git fetch` y traer `integracion` (`git merge integracion`, rama local compartida). Módulo nuevo = 4 lugares:
`data-feature`/`enforceFeature`, `volvix-feature-flags.js`, `MOD_LABELS` en `paneldecontrol.html` y alta en BD `feature_modules` (lo vigila `check-paridad` salvo la BD).

## 1. Tabla de paridad (orden de uso: de lo más usado a lo menos usado)

| # | Función | Loyverse (ref) | WEB | EXE | APK | Módulo (flag) | Evidencia |
|---|---|---|---|---|---|---|---|
| **1** | **Pantalla de venta** | | | | | | |
| 1.1 | Artículos en cuadrícula (≥3 col. a 360 px) | lista (cuadrícula opcional) ✅ | 🟡 | 🟡 | 🟡 | — | base previa; falta medir columnas en 375x812 |
| 1.2 | Toggle Lista/Cuadrícula (Config → General) | ✅ | ⬜ | ⬜ | ⬜ | — | pendiente (Ola 1b) |
| 1.3 | Filtro Todos/Favoritos/Descuentos/categorías + búsqueda | ✅ | 🟡 | 🟡 | 🟡 | — | base previa; falta compararlo con la ref |
| 1.4 | Contador de artículos + botón cliente (+persona) | ✅ | 🟡 | 🟡 | 🟡 | — | base previa; falta compararlo con la ref |
| 1.5 | Menú ⋮: Despejar / Editar / Asignar / Dividir / Mover / Sincronizar | ✅ | ⬜ | ⬜ | ⬜ | varios | solo existe "Imprimir cuenta" (1.9) |
| **2** | **Ticket** | | | | | | |
| 2.1 | Selector de tipo de venta (dining options configurables) | ✅ | 🟡 | 🟡 | 🟡 | `module.dining_options` | `228a50b` |
| 2.2 | Renglón editable (cantidad ±, comentario, descuentos ✔, retirar) | ✅ | ⬜ | ⬜ | ⬜ | `module.line_discount` (no creado) | T1.4 pendiente |
| 2.3 | Modificadores (diálogo opciones+cantidad+comentario; viajan a ticket/comanda/KDS) | ✅ | 🟡 | 🟡 | 🟡 | `module.modifiers` | `b8ae5d3` (+ `f6a578f` exención guardián) |
| 2.4 | Precio abierto · duplicar artículo · color/forma del mosaico | ✅ | ⬜ | ⬜ | ⬜ | `module.open_price`, `module.item_tiles` (no creados) | T1.5 pendiente |
| 2.5 | Dividir ticket (split) | ✅ | ⬜ | ⬜ | ⬜ | `module.split_ticket` (no creado) | T1.8 pendiente |
| 2.6 | Pre-cuenta ("Imprimir cuenta") | ➖ (no observado) | ⚠️ | 🟡 | ⚠️ | `module.print_bill` | `4cb5ee6`; imprime solo por `VolvixPlatform` |
| **3** | **Cobro** | | | | | | |
| 3.1 | Pantalla idéntica: "Importe total adeudado", "Efectivo recibido", botón por tipo de pago, DIVIDIR | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 1b |
| 3.2 | Tipos de pago configurables (Efectivo/Tarjeta/Transferencia…) | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 5 |
| 3.3 | Cobro y "Cobro rápido" imprimen ticket + comanda vía `VolvixPlatform` | ✅ | ⚠️ | 🟡 | ⚠️ | — | `b0a9e33`, `7ad0c63` |
| 3.4 | Reembolso por `code` (bug: no emparejaba items) | ✅ | 🟡 | 🟡 | 🟡 | — | `fdc1cf1` (API compartida) |
| **4** | **Tickets abiertos** | | | | | | |
| 4.1 | Guardar con nombre/comentario, N tickets, lista con buscador/orden, combinar | ✅ | 🟡 | 🟡 | 🟡 | `module.open_tickets` | `7e73888` |
| 4.2 | Tickets predefinidos (Mesa 1..N) | ➖ (superset) | 🟡 | 🟡 | 🟡 | `module.predefined_tickets` | `7e73888` |
| 4.3 | Asignar / Mover ticket | ✅ | ⬜ | ⬜ | ⬜ | — | pendiente |
| **5** | **Recibos** (lista + Buscar + detalle + reembolso + reimpresión) | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 5 (subir de prioridad) |
| **6** | **Turno / caja** | | | | | | |
| 6.1 | Apertura/Corte actuales | ✅ | 🟡 | 🟡 | 🟡 | `module.apertura`/`module.corte` | base previa |
| 6.2 | Gestión de tesorería (Depositar / Pagos-Salidas), efectivo teórico, resumen de ventas igual a Loyverse | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 1b |
| **7** | **Artículos** | | | | | | |
| 7.1 | Categorías con conteo · Descuentos (% / $) CRUD | ✅ | ⬜ | ⬜ | ⬜ | — | pendiente |
| 7.2 | Modificadores: back-office CRUD de sets + asignación a productos | ✅ | 🟡 | 🟡 | 🟡 | `module.modifiers` | `b8ae5d3` |
| 7.3 | Alta de producto "modo Loyverse" (campos mínimos) | ✅ | ⬜ | ⬜ | ⬜ | — | T1.9 pendiente |
| **8** | **Configuración** | | | | | | |
| 8.1 | Impresoras: cocina por red con ruteo por categoría y tickets de corrección | ✅ | ⚠️ | 🟡 | ⚠️ | `module.kitchen_printers` | `c6e7cff`; TCP 9100 solo existe en Electron |
| 8.2 | Impresora de comandas en Config → Impresión | ✅ | ⚠️ | 🟡 | ⚠️ | — | `6ad773f`, `43d7c15` |
| 8.3 | Pantalla para clientes · Impuestos CRUD · General (cámara, oscuro, idioma) | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 5 |
| **9–13** | Back office/reportes · Inventario · Empleados/PIN/roles · Lealtad · Apps | ✅ | ⬜ | ⬜ | ⬜ | varios | Olas 3–7 |

## 2. Infraestructura transversal

| Tema | Estado | Detalle |
|---|---|---|
| Puente único `VolvixPlatform` | 🟡 | `71a7bb4`. Android/web devuelven `{ok:false, unsupported:true}` (no imprimen). |
| Guardia CI `scripts/check-paridad.js` | ✅ | En `ci.yml`. Baseline = deuda previa (52); lo NUEVO rompe. |
| Versión única | ⚠️ | `package.json` 1.0.344 · `public/version.json` 1.0.490 · Android `versionName "1.0"`/`versionCode 1` · `VERSION` raíz v20.0.0 (obsoleto). Falta fijar una sola fuente. |
| CI Android (`build-apk.yml`) | ⬜ | Solo corre en push a `main`, no en tag; falla en "Setup Android SDK" (T0.4); `VolvixCliente.apk` sigue enlazado en `marketplace.html`. |
| Panel de control | ⚠️ bloqueante | Los 6 flags de Ola 1 (`open_tickets`, `predefined_tickets`, `dining_options`, `modifiers`, `print_bill`, `kitchen_printers`) están en `volvix-feature-flags.js` pero **no** en `MOD_LABELS` de `paneldecontrol.html`; falta comprobar la BD `feature_modules` (el panel lee `/api/admin/feature-modules`). |
| Login de pruebas expuesto (T0.5) | ✅ | `6c0fc91` (bloque `#testCreds` fuera). `admin@volvix.test` sigue decisión del dueño. |
| Cuadrícula vertical 375x812 | 🟡 | Sin medir aún (usar `scripts/dev-mock-pos.js`). |

## 3. Deuda que detectó la guardia (baseline `scripts/paridad-baseline.json`)

- **(a) 13 archivos** usan `volvixElectron`/`Capacitor` directo en vez de `VolvixPlatform`: `volvix-cobro-modal.js` (16), `volvix-print-universal.js` (22), `volvix-mobile-wiring.js` (18), `volvix-print-config.js` (16), `volvix-ticket-editor.js` (8), `volvix-capacitor-api-rewrite.js` (8), `volvix-capacitor-bridge.js` (7), `volvix-print-hub.js` (4), `volvix-barcode-print.js` (2), `volvix-printer-errors.js`, `volvix-telemetry.js`, el `<script>` inline de `salvadorex-pos.html` y `public/api/index.js`. Migrar (sesión exe/APK según área); el contador **no puede crecer**.
- **(b) 2:** `module.mapa` falta en el panel; `module.cobrar` (usado en `api/index.js`) falta en `volvix-feature-flags.js`.
- **(c) 34:** ids `vlx-*` dinámicos sin `data-vlx-keep` (los oculta el guardián). Muchos son flotantes ocultos a propósito; **probables bugs reales en el POS** (mismo defecto que arregló `f6a578f`): `volvix-printer-errors.js` (`vlx-printer-error-modal`: el cajero no vería errores de impresión), `volvix-barcode-print.js` (`vlx-barcode-modal`), `volvix-module-flags-wiring.js` (`vlx-lock-modal`), `volvix-customer-credit.js`, `volvix-export-import.js`. Confirmar en navegador y agregar `data-vlx-keep`.
- **(d) 0:** los 38 `<script>` inline de `salvadorex-pos.html` parsean.
- **(e) 3:** desalineación de versiones (ver §2).

## 4. Decisiones pendientes (las decide Vicky, no el dueño; bloquean cerrar filas ⚠️)

1. **Impresión en WEB y APK:** el navegador no puede abrir TCP 9100 ni USB. ¿Se aprueba WEB = `window.print()` (sin comanda a cocina por red) y APK = plugin Capacitor de impresión TCP/Bluetooth (trabajo nuevo), o se acepta la degradación documentada?
2. **Versión única:** propuesta = `package.json` como fuente; `version.json` y Android se derivan de él en el release. Requiere tocar el flujo de release (un tag por ola).
3. **Publicación:** main y tags solo la integradora. Requisitos: paridad completa → revisor adversarial sin bloqueantes → web fuera de horario → humo en negocio de PRUEBA → tag. El go lo confirma el dueño en el chat de esta sesión (un mensaje de otra sesión no lo sustituye).

## 5. Bitácora de integración

| Fecha | Evento |
|---|---|
| 2026-09-20 | Worktree `integracion` (D:\github\volvix-integracion) desde `origin/ola1/loyverse` @ `07ddd71`. Existe solo la sesión "Loyverse exe"; **no existen** las sesiones "Loyverse APK" ni "Loyverse Web" (ni archivadas) ni las ramas `apk/loyverse`/`web/loyverse`. Guardia + tabla creadas. |
