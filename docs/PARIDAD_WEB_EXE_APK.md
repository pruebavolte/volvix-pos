# Paridad WEB / EXE / APK — clon Loyverse

> Mantiene: sesión **Loyverse Unificación** (rama `integracion`). Base: `origin/ola1/loyverse` @ `07ddd71`. Corte: 2026-09-20.
> Regla de oro del dueño: web, exe y android = **el mismo código** y **las mismas funciones**. Todo en `public/`; solo cambia el
> puente de hardware (`window.VolvixPlatform`, `public/volvix-platform.js`). Cada función es un módulo on/off (`module.*`).
> Referencia funcional: app Loyverse del Motorola (`docs/LOYVERSE_REFERENCIA_MOTOROLA.md`) y help.loyverse.com/es.
> Una función NO está terminada hasta tener las 3 plataformas ✅ o la degradación documentada y aprobada (🔶). Las aprobaciones las da Vicky
> en nombre del dueño; cada 🔶 se lista en el reporte final para que el dueño pueda vetarla.

**Leyenda:** ✅ verificado en esa plataforma (commit + prueba) · 🟡 código en la rama, aún SIN verificar en esa plataforma ·
⬜ no existe · ⚠️ degradado o pendiente, sin aprobar · 🔶 degradado APROBADO y documentado · ➖ no aplica.
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
| 1.1 | Artículos en cuadrícula (≥3 col. a 360 px) | lista (cuadrícula opcional) ✅ | ✅ | 🟡 | ✅ | — | base previa; falta medir columnas en 375x812; WEB: 3 col a 375x812 y 5 col a 1024, sin scroll horizontal. Humo navegador en `integracion` 2026-09-20 (mock :8899).; APK: 3 col a 393 px (emulator-5556, APK de CI; reporte de la sesión APK, `9c86d3f`). |
| 1.2 | Toggle Lista/Cuadrícula (Config → General) | ✅ | ⬜ | ⬜ | ⬜ | — | pendiente (Ola 1b) |
| 1.3 | Filtro Todos/Favoritos/Descuentos/categorías + búsqueda | ✅ | 🟡 | 🟡 | 🟡 | — | base previa; falta compararlo con la ref |
| 1.4 | Contador de artículos + botón cliente (+persona) | ✅ | 🟡 | 🟡 | 🟡 | — | base previa; falta compararlo con la ref |
| 1.5 | Menú ⋮: Despejar / Editar / Asignar / Dividir / Mover / Sincronizar | ✅ | ⬜ | ⬜ | ⬜ | varios | solo existe "Imprimir cuenta" (1.9) |
| 1.6 | Escaneo de código de barras con cámara (botón 📷 en la pantalla de venta + interruptor en Config → General) | ✅ | ⬜ | ⬜ | 🟡 | — | APK: `scanBarcode` en el adaptador, Cancelar del escáner corregido; falta el botón 📷 en la pantalla de venta (`salvadorex-pos.html`: exe) y probar cámara en equipo físico |
| **2** | **Ticket** | | | | | | |
| 2.1 | Selector de tipo de venta (dining options configurables) | ✅ | 🟡 | 🟡 | 🟡 | `module.dining_options` | `228a50b` |
| 2.2 | Renglón editable (cantidad ±, comentario, descuentos ✔, retirar) | ✅ | ⬜ | ⬜ | ⬜ | `module.line_discount` (no creado) | T1.4 pendiente |
| 2.3 | Modificadores (diálogo opciones+cantidad+comentario; viajan a ticket/comanda/KDS) | ✅ | ✅ | 🟡 | 🟡 | `module.modifiers` | `b8ae5d3` (+ `f6a578f` exención guardián); WEB: diálogo visible (guarnición obligatoria/extras/comentario/cantidad), línea "+ Arroz · + Queso extra" con precio $155, se restaura al reabrir. Humo navegador en `integracion` 2026-09-20 (mock :8899). |
| 2.4 | Precio abierto · duplicar artículo · color/forma del mosaico | ✅ | ⬜ | ⬜ | ⬜ | `module.open_price`, `module.item_tiles` (no creados) | T1.5 pendiente |
| 2.5 | Dividir ticket (split) | ✅ | ⬜ | ⬜ | ⬜ | `module.split_ticket` (no creado) | T1.8 pendiente |
| 2.6 | Pre-cuenta ("Imprimir cuenta") | ➖ (no observado) | 🔶 | 🟡 | 🟡 | `module.print_bill` | `4cb5ee6`; imprime solo por `VolvixPlatform` |
| **3** | **Cobro** | | | | | | |
| 3.1 | Pantalla idéntica: "Importe total adeudado", "Efectivo recibido", botón por tipo de pago, DIVIDIR | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 1b |
| 3.2 | Tipos de pago configurables (Efectivo/Tarjeta/Transferencia…) | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 5 |
| 3.3 | Cobro y "Cobro rápido" imprimen ticket + comanda vía `VolvixPlatform` | ✅ | 🔶 | 🟡 | 🟡 | — | `b0a9e33`, `7ad0c63` |
| 3.4 | Reembolso por `code` (bug: no emparejaba items) | ✅ | ✅ | 🟡 | 🟡 | — | `fdc1cf1` + web `d3b1e51`: `scripts/test-returns-match.js` 10/10 (antes 4/10). WEB ✅ = lógica de API con harness; EXE/APK usan la misma API, sin humo propio |
| **4** | **Tickets abiertos** | | | | | | |
| 4.1 | Guardar con nombre/comentario, N tickets, lista con buscador/orden, combinar | ✅ | ✅ | 🟡 | 🟡 | `module.open_tickets` | `7e73888`; WEB: Guardar pide nombre/comentario/Mesas; POST /api/sales/pending; botón "Tickets abiertos (1)"; lista; abrir restaura con modificadores. Sin probar: Combinar, orden, buscador. Humo navegador en `integracion` 2026-09-20 (mock :8899). |
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
| 8.1 | Impresoras: cocina por red con ruteo por categoría y tickets de corrección | ✅ | 🔶 | 🟡 | ✅ | `module.kitchen_printers` | `c6e7cff`; TCP 9100 solo existe en Electron; APK: comanda ruteada por categoría a 2 impresoras TCP falsas en emulador (sesión APK). |
| 8.2 | Impresora de comandas en Config → Impresión | ✅ | 🔶 | 🟡 | ✅ | — | `6ad773f`, `43d7c15`; APK: `#cfg-comanda-box` visible en Android, reusa llaves `volvix_printer_*`. |
| 8.3 | Pantalla para clientes · Impuestos CRUD · General (cámara, oscuro, idioma) | ✅ | ⬜ | ⬜ | ⬜ | — | Ola 5 |
| **9–13** | Back office/reportes · Inventario · Empleados/PIN/roles · Lealtad · Apps | ✅ | ⬜ | ⬜ | ⬜ | varios | Olas 3–7 |

## 2. Infraestructura transversal

| Tema | Estado | Detalle |
|---|---|---|
| Puente único `VolvixPlatform` | 🟡 | `71a7bb4`. Android: adaptador real (`printTicket/printComanda/openDrawer/pingPrinter/listBluetoothPrinters/scanBarcode`, plugin propio `VolvixPrinterPlugin` solo bytes TCP 9100 + Bluetooth SPP, bytes compartidos en `public/volvix-escpos.js`; `test-escpos-parity` compara byte a byte con `electron/comanda-printer.js`). Probado en emulador con impresoras TCP falsas (ticket CP437 + cajón, comanda ruteada). NO concluyente en emulador: agregar producto, modal Tickets abiertos, búsqueda/teclado (sin internet + backend mock). Web: `window.print()` (🔶). |
| Guardia CI `scripts/check-paridad.js` | ✅ | En `ci.yml`. Solo FALLA por deuda NUEVA o que crezca; baseline = 51 entradas (anexo §6), a la baja por área. |
| Versión única | ⚠️ | **Decisión (Vicky): fuente = `package.json`** (hoy 1.0.344). `public/version.json` es generado (1.0.490): la guardia lo ignora. Android `versionName = package.version` y `versionCode = patch`, derivados en el CI del tag (hoy `"1.0"`/`1` fijos en `build.gradle`: tarea APK). `VERSION` raíz v20.0.0 es obsoleto. |
| CI Android (`build-apk.yml`) | 🟡 | Reportado por APK (`9c86d3f`, run 35512603520 verde; la integradora NO puede verificarlo: `gh` sin autenticar): usa el SDK del runner (sin `setup-android`); SOLO un tag `v*.*.*` crea/adjunta `VolvixPOS.apk` al release del .exe (`--verify-tag`, nunca crea tags); push a `main`/`apk/**` solo sube artifact. `marketplace.html` ya apunta a `/releases/latest/download/VolvixPOS.apk`; link de `VolvixCliente.apk` borrado. **Cero builds locales.** |
| Panel de control | 🟡 | CORRECCIÓN: los 6 flags de Ola 1 (`open_tickets`, `predefined_tickets`, `dining_options`, `modifiers`, `print_bill`, `kitchen_printers`) SÍ están en `paneldecontrol.html` (etiquetas, defaults `true` y grupo "Módulos"; los agregó la sesión exe en sus commits T1.x) y en `volvix-feature-flags.js`. Antes los declaré ausentes por buscar solo el prefijo `module.`; la guardia (b) los cubre. Falta: confirmar que existan en la BD `feature_modules` (el panel lee `/api/admin/feature-modules`) y probar el on/off en un negocio de PRUEBA (Web). |
| Login de pruebas expuesto (T0.5) | ✅ | `6c0fc91` (bloque `#testCreds` fuera). `admin@volvix.test` sigue decisión del dueño. |
| Cuadrícula vertical 375x812 | 🟡 | WEB ✅ (3 col / 5 col en escritorio, medido en navegador). EXE y APK usan el mismo `public/` pero sin medir en su WebView. |
| Disco (D:) | ⚠️ | ~1.4–2.0 GB libres: worktrees ESPARSOS (`git sparse-checkout set --cone public api scripts docs electron android .github`), cero builds locales de Android/Electron (solo GitHub Actions). Avisar a Vicky si D: < 800 MB. |
| Keystore de firma Android | ⚠️ | Hoy cada build de CI firma con una llave distinta: un APK nuevo NO se instala sobre el anterior (no hay actualización in-place). Decide Vicky: keystore estable en secrets de GitHub. (`build.gradle` además trae contraseñas de keystore por defecto en el repo: sacarlas.) |
| Humo WEB `scripts/smoke-web.js --strict` | ✅ | `4924e1d`, re-corrido en `integracion`: TODO OK, 1 aviso (95 ids `vlx-*` estáticos preexistentes, no los oculta el guardián). Falta navegador: columnas 375x812, guardar→abrir, modificador, ⋮, consola. |
| Detalle de venta `GET /api/sales/:id` | ✅ | `83ec27a`: no existía (404 en prod); recibo y ESC/POS con modificadores; `scripts/test-sales-detail.js` 5/5. |
| E2E real contra la API (`scripts/e2e-loyverse.js`) | ⬜ | 14/14 solo contra stub. Falta la cuenta de PRUEBA (`is_test_tenant`) que registra el dueño (ninguna IA crea cuentas). Sin esto el humo real (Guardar, un modificador, un cobro) sigue abierto. |
| Persistencia `pending_sales` | ✅ | `3f83844`: `VLXMETA` siempre JSON válido (≤500); en producción falla con 503 (antes 201 con id falso `PND-*`). `test-pending-sales.js` 8/8. |
| `VolvixFeatures.isEnabled` | ✅ | `4b0ac66`: no existía; apagar un módulo ahora sí detiene su lógica (antes solo se ocultaba). |

## 3. Deuda que detectó la guardia (baseline `scripts/paridad-baseline.json`, 51 entradas, lista completa en §6)

- **(a) 13 archivos** usan `volvixElectron`/`Capacitor` directo en vez de `VolvixPlatform`: `volvix-cobro-modal.js` (16), `volvix-print-universal.js` (22), `volvix-mobile-wiring.js` (18), `volvix-print-config.js` (16), `volvix-ticket-editor.js` (8), `volvix-capacitor-api-rewrite.js` (8), `volvix-capacitor-bridge.js` (7), `volvix-print-hub.js` (4), `volvix-barcode-print.js` (2), `volvix-printer-errors.js`, `volvix-telemetry.js`, el `<script>` inline de `salvadorex-pos.html` y `public/api/index.js`. Migrar (sesión exe/APK según área); el contador **no puede crecer**.
- **(b) 2:** `module.mapa` falta en el panel; `module.cobrar` (usado en `api/index.js`) falta en `volvix-feature-flags.js`. Los 6 flags de Ola 1 NO están en falta (ver §2).
- **(c) 34:** ids `vlx-*` dinámicos sin `data-vlx-keep` (los oculta el guardián). Muchos son flotantes ocultos a propósito; **probables bugs reales en el POS** (mismo defecto que arregló `f6a578f`): `volvix-printer-errors.js` (`vlx-printer-error-modal`: el cajero no vería errores de impresión), `volvix-barcode-print.js` (`vlx-barcode-modal`), `volvix-module-flags-wiring.js` (`vlx-lock-modal`), `volvix-customer-credit.js`, `volvix-export-import.js`. Confirmar en navegador y agregar `data-vlx-keep`.
- **(d) 0:** los 38 `<script>` inline de `salvadorex-pos.html` parsean.
- **(e) 2:** Android `versionName`/`versionCode` fijos (ver §2). `public/version.json` ya no se compara (generado).

## 4. Decisiones pendientes (las decide Vicky, no el dueño; bloquean cerrar filas ⚠️)

1. ~~**Impresión en WEB y APK:** el navegador no puede abrir TCP 9100 ni USB. ¿Se aprueba WEB = `window.print()` (sin comanda a cocina por red) y APK = plugin Capacitor de impresión TCP/Bluetooth (trabajo nuevo), o se acepta la degradación documentada?~~ **RESUELTO (Vicky, 2026-09-20):** WEB = `window.print()` para el ticket (HTML/58 mm) y SIN comanda de red (🔶 degradado aprobado; la comanda en web se cubre con KDS web en Ola 6). APK = plugin Capacitor propio TCP 9100 (+ Bluetooth SPP si alcanza) para ticket y comanda, compartiendo el armado de bytes/texto desde `public/`; build solo en GitHub Actions. EXE = como hoy.
2. **Versión única:** RESUELTO (Vicky): `package.json` es la fuente; `version.json` (generado) y Android (`versionName`=version, `versionCode`=patch) se derivan en el CI del tag. Un tag por ola.
3. **Publicación:** main y tags solo la integradora. Requisitos: paridad completa → revisor adversarial sin bloqueantes → web fuera de horario → humo en negocio de PRUEBA → tag. El go lo confirma el dueño en el chat de esta sesión (un mensaje de otra sesión no lo sustituye).

## 5. Bitácora de integración

| Fecha | Evento |
|---|---|
| 2026-09-20 | Worktree `integracion` (D:\github\volvix-integracion) desde `origin/ola1/loyverse` @ `07ddd71`. Existe solo la sesión "Loyverse exe"; **no existen** las sesiones "Loyverse APK" ni "Loyverse Web" (ni archivadas) ni las ramas `apk/loyverse`/`web/loyverse`. Guardia + tabla creadas. |
| 2026-09-20 | Mezcladas en `integracion`: `origin/ola1/loyverse` @ `8456036` (doc de equipo) y `security/integrate-ola1` (`c5f4529`, 80 archivos: contraseña de prueba -> `REDACTED_TEST_PASSWORD`; `node --check` OK, guardia sin cambios). La contraseña sigue en el HISTORIAL git del repo público: falta desactivar/rotar `admin@volvix.test` (decide Vicky). |
| 2026-09-20 | Decisión de Vicky: WEB imprime con `window.print()` sin comanda de red (🔶); APK con plugin TCP 9100 propio (tarea APK); `package.json` fuente única de versión. Filas 2.6, 3.3, 8.1, 8.2: WEB ⚠️ → 🔶. |
| 2026-09-20 | Mezclados en `integracion`: `web/loyverse` @ `4924e1d` (sin conflictos) y `apk/loyverse` @ `2b66f44` (sin conflictos; toca 5 líneas de `salvadorex-pos.html` y `volvix-cobro-modal.js`). Guardia 0 nuevos; `a:volvix-print-config.js` bajó (baseline actualizado). |
| 2026-09-20 | Humo en navegador (mock local, 375x812 y 1024): cuadrícula 3/5 col, modificadores, Guardar, Tickets abiertos, abrir ticket y menú ⋮ OK; 0 errores propios en consola (solo el script externo de soporte remoto, sin red). Filas 1.1, 2.3, 4.1 pasan a ✅ en WEB. Sin probar aún: tipos de venta (2.1), Mesas predefinidas (4.2), Combinar, EXE y APK reales. |
| 2026-09-20 | Mezclados en `integracion`: `web/loyverse` @ `c390351` y `apk/loyverse` @ `def8107` (sin conflictos). Batería local OK: guardia 0 nuevos, smoke-web, sales-detail 5, returns 10, pending 8, escpos 16, platform-android 16. |
| 2026-09-20 | Bloque 1 APK (`9c86d3f`, ya en `integracion`): filas 1.1, 8.1, 8.2 pasan a ✅ en APK con evidencia de emulador; CI del tag y keystore quedan como 🟡/⚠️. No concluyente aún en APK: agregar producto, Tickets abiertos, búsqueda/teclado, cámara física. |

## 6. Anexo — deuda base (51 entradas; que exe/APK/Web la reduzcan por área)

### (a) uso directo de volvixElectron/Capacitor (migrar a VolvixPlatform; el conteo no puede crecer) — 13

| Hallazgo | # | Área |
|---|---|---|
| `public/api/index.js` | 1 | Web |
| `public/volvix-barcode-print.js` | 2 | exe |
| `public/volvix-capacitor-api-rewrite.js` | 8 | APK |
| `public/volvix-capacitor-bridge.js` | 5 | APK |
| `public/volvix-cobro-modal.js` | 19 | exe |
| `public/volvix-mobile-wiring.js` | 23 | APK |
| `public/volvix-print-config.js` | 24 | exe |
| `public/volvix-print-hub.js` | 6 | exe |
| `public/volvix-print-universal.js` | 17 | exe |
| `public/volvix-printer-errors.js` | 1 | exe |
| `public/volvix-telemetry.js` | 3 | exe |
| `public/volvix-ticket-editor.js` | 11 | exe |
| `salvadorex-pos.html#inline` | 70 | exe |

### (b) módulo usado sin alta en flags/panel — 2

| Hallazgo | # | Área |
|---|---|---|
| `module.cobrar:volvix-feature-flags.js` | 1 | Web |
| `module.mapa:paneldecontrol.html` | 1 | Web |

### (c) id vlx-* dinámico sin data-vlx-keep (los oculta el guardián salvo que sea un flotante intencional) — 34

| Hallazgo | # | Área |
|---|---|---|
| `public/js/vlxPanelDrawer.js:vlx-giro-config-drawer` | 1 | exe |
| `public/js/vlxPanelDrawer.js:vlx-giro-config-fab` | 1 | exe |
| `public/volvix-barcode-print.js:vlx-barcode-modal` | 1 | exe |
| `public/volvix-capacitor-bridge.js:vlx-update-banner` | 1 | APK |
| `public/volvix-customer-credit.js:vlx-modal-title-` | 1 | exe |
| `public/volvix-export-import.js:vlx-modal-title-` | 1 | exe |
| `public/volvix-helpdesk-wiring.js:vlx-hd-btn` | 1 | exe |
| `public/volvix-helpdesk-wiring.js:vlx-hd-panel` | 1 | exe |
| `public/volvix-mexico-pride-wiring.js:vlx-mexico-pride` | 1 | exe |
| `public/volvix-mexico-pride-wiring.js:vlx-nl-logo-strip` | 1 | exe |
| `public/volvix-mobile-fixes.js:vlx-empty-products-banner` | 1 | APK |
| `public/volvix-mobile-fixes.js:vlx-onebyone-tip` | 1 | APK |
| `public/volvix-module-flags-wiring.js:vlx-lock-modal` | 1 | Web |
| `public/volvix-modules-wiring.js:vlx-academy-ai` | 1 | exe |
| `public/volvix-modules-wiring.js:vlx-academy-ai-toggle` | 1 | exe |
| `public/volvix-modules-wiring.js:vlx-health-pill` | 1 | exe |
| `public/volvix-modules-wiring.js:vlx-toast-stack` | 1 | exe |
| `public/volvix-pos-payments-integration.js:vlx-pay-badge` | 1 | exe |
| `public/volvix-pos-payments-integration.js:vlx-rt-dot` | 1 | exe |
| `public/volvix-pos-payments-integration.js:vlx-toast-host` | 1 | exe |
| `public/volvix-printer-errors.js:vlx-printer-error-modal` | 1 | exe |
| `public/volvix-reminders-wiring.js:vlx-rem-toasts` | 1 | exe |
| `public/volvix-sync-widget.js:vlx-panel` | 1 | exe |
| `public/volvix-sync-widget.js:vlx-widget` | 1 | exe |
| `public/volvix-whatsapp-wiring.js:vlx-wa-fab` | 1 | exe |
| `public/volvix-whatsapp-wiring.js:vlx-wa-panel` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-hist-cliente-modal` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-hist-filter-modal` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-inv-image-panel` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-mayoreo-chip` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-media-lightbox` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-modal-generic` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-search-picker` | 1 | exe |
| `salvadorex-pos.html#inline:vlx-tax-breakdown` | 1 | exe |

### (e) versión — 2

| Hallazgo | # | Área |
|---|---|---|
| `android/versionCode` | 1 | APK |
| `android/versionName` | 1 | APK |

## 7. Riesgos PRE-PUBLICACIÓN (reportados por Web, 2026-09-20)

| # | Riesgo | Dueño | Estado |
|---|---|---|---|
| 1 | La BD real de `pending_sales` NO tiene `name/comment/dining/employee`. Migración propuesta en `docs/migrations-propuesta-pending-sales.sql`: **NO se aplica**; el fallback `VLXMETA` basta. | Web | decidido: no migrar |
| 2 | `/api/feature-flags` devuelve `modules` pero el cliente lee `flags`; `/volvix-feature-flags.css` da 404 (también `/volvix-shared.css`, comprobado en el navegador). No se toca hasta tener plan de compatibilidad (default ON) para no cambiar lo que ven los negocios. | Web | abierto |
| 3 | `kdsMarkDone` borra tickets abiertos (`salvadorex-pos.html` ~l.4633). | exe | abierto |
| 4 | La reimpresión descarta `modifiers`: `reimprimirUltimoTicket` (~l.8804-8818), ESC/POS de reimpresión (~l.8963-8968) y detalle de buscar-venta (~l.14286-14290); `printPreBill` (~l.18337) ya en manos de exe. Líneas aprox. | exe | abierto (Web corrigió el servidor: `4924e1d`, `83ec27a`) |
| 5 | Probables modales ocultos por el guardián (anexo §6 (c)): `vlx-printer-error-modal`, `vlx-barcode-modal`, `vlx-lock-modal`. | exe | por confirmar en navegador |
| 6 | Overrides de flags: 283 filas en 48 negocios (192 `disabled`). TNT-MATA8: impacto cero, pero aplicar defaults ON en otros negocios cambiaría lo que ven. Plan por fases en `docs/WEB_VERIFICACION.md`. **NO aplicar todavía.** | Web | abierto |
