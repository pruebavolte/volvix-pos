# Rol Loyverse Web — verificacion del bloque 1 (2026-09-20)

> Rama `web/loyverse`. Evidencia = lectura de codigo + LECTURAS a la BD real (PostgREST con la llave de servicio, solo GET; excluido `TNT-MATA8`) +
> harness que ejecutan el handler REAL + navegador integrado contra `scripts/dev-mock-pos.js`. **Cero escrituras en produccion.**
> Nota de entorno: la BD de Volvix en produccion es el proyecto `vnruooisqnbqguavrdvd`; el default de `api/index.js` (`zhvwmzkcqngcaqpdxtwr`) **ya no
> resuelve por DNS** (proyecto borrado): solo funciona porque Railway define `SUPABASE_URL`. Un entorno sin esa variable falla en silencio.

## (a) POST /api/sales/pending
- Esquema real de `pending_sales`: `id, tenant_id, user_id(uuid), reference, items(jsonb), customer_id, customer_name, total, notes, expires_at, restored_at, cancelled_at, created_at`.
  `select=name` -> `42703 column pending_sales.name does not exist` (igual `comment`, `dining`, `employee`). **Si hace falta migracion** -> `docs/migrations-propuesta-pending-sales.sql` (solo redactada).
- Sin migrar el fallback `VLXMETA` funciona (`scripts/test-pending-sales.js`, parseMeta REAL del cliente lo lee de vuelta), pero tenia 2 bugs, corregidos:
  1. `slice(0,500)` dejaba el JSON invalido con nombre+comentario+nota largos -> se perdia toda la meta. Ahora se acorta el campo mas largo.
  2. Si el insert fallaba devolvia **201 con id `PND-*` falso**: el cliente limpiaba el carrito y BORRABA el ticket previo. En produccion ahora 503 `PENDING_PERSIST_FAILED` (el cliente cae a su cola offline).
- HEAD 5/8 escenarios, con fix 8/8 (esquema real) y 8/8 (esquema nuevo).
- Tabla vacia fuera de TNT-MATA8: la funcion aun no se usa en produccion (no hay filas que migrar).

## (b) modifiers / note en /api/sales
- Handler base `POST /api/sales` guarda `items` completo en `pos_sales.items` (jsonb); ninguno de los ~12 wrappers reescribe `items` (solo `Object.assign`); el de bundles solo expande combos.
  Cliente manda `modifiers` y `note` en cada item (`saleData.items`). **Persistencia OK por codigo.** E2E real contra la API: no ejecutado (requiere escribir una venta de prueba); 0 ventas reales con modifiers en la BD (funcion no desplegada).
- **Descubierto en el bloque 2:** `GET /api/sales/:id` **no existia** (404 en produccion; verificado con curl: `/api/sales/<uuid>` 404 vs `/receipt` 401). Lo llaman el asistente
  "Nueva devolucion" (`newReturnLoadSale`, `salvadorex-pos.html` ~19483 -> "Error cargando venta: HTTP 404"), la busqueda de venta y la reimpresion por id.
  **Creado** (fila completa de `pos_sales`, scope por tenant, uuid obligatorio; las rutas estaticas `latest/list/next-folio/pending/range/search/today` siguen ganando por match exacto).
- Server que DESCARTABA modificadores y nota, **todo corregido y con harness** (`scripts/test-sales-detail.js`, 0/5 antes -> 5/5): `GET /api/sales/:id/reprint` (HTML COPIA),
  `GET /api/sales/:id/receipt` (mostraba solo product_id/qty/price; ahora nombre + modificadores + nota, escapado) y `GET /api/sales/:id/escpos` (solo Sale/Total/Method; ahora renglones).
- **Sitios de `salvadorex-pos.html` que siguen descartandolos — asignados a exe (numeros de linea de esta rama, base `d01e73b`):**
  | Linea | Funcion | Que falta |
  |---|---|---|
  | 8804-8818 | `reimprimirUltimoTicket` (vista HTML 280 px) | agregar bajo el nombre `it.modifiers` (label) e `it.note`, escapados (`_rptE`) |
  | 8963-8968 | ESC/POS de reimpresion (`__r8a…`, `(sale.items||[]).forEach`) | renglones `   + <modificador>` y `   Nota: …` como hace `VolvixTicketCustomizer` (lineas 256/347) |
  | 14286-14290 | detalle de venta de "buscar venta" (`r10a…`, `var rows = items.map`) | subrenglon con modificadores/nota |
  | 4633 | `kdsMarkDone` | **DELETE del ticket abierto**: cambiar a marca `kds_status='ready'` (propuesta en `WEB_DEGRADACION.md` §2.B y bloque B de la migracion) |
  | 18337 | `printPreBill` | `kind==='web'` rechaza: usar el adaptador `window.print` (`WEB_DEGRADACION.md` §2.A) |
  `VolvixTicketCustomizer.renderText` y el carrito SI muestran modificadores.
- Ojo: el server solo sanea `items[].notes` (plural); `items[].note` viaja sin sanear -> escapar SIEMPRE al renderizar (el reprint corregido ya escapa).

## (c) /api/returns por `code`
- Estado previo (commit fdc1cf1): aceptaba `code` solo si la linea vendida NO tenia `product_id`/`id`. Harness `scripts/test-returns-match.js` (extrae el handler real): **4/10**.
  Bugs: cliente manda `code` contra linea con uuid -> "not in sale"; cliente (`newReturnNext`) NO mandaba `code` -> "item missing product_id" en lineas sin uuid (cobro rapido);
  dos lineas del mismo producto con distinto modificador rechazaban qty 2 y marcaban la venta `refunded` con 1 devuelta; el tope "ya devuelto" se evadia cambiando product_id por code.
- Corregido (server + 1 linea del cliente): **10/10**. Reembolso FIFO por linea, clave canonica, `product_id` guardado = uuid (lo necesita el restock del approve).
- E2E contra API real: no ejecutado (escribe devoluciones).

## (d) modulos: active-modules / flags / panel
- `GET /api/tenant/active-modules` lee `tenant_module_flags` (claves SIN prefijo: `pos`, `inventario`…) + `tenant_button_flags`; sin filas -> `defaults_open:true`, `modules:{}` = **todo ON**.
  En la BD: 30+ filas de otros tenants, ninguna de los 6 modulos nuevos -> ON por defecto para todos los giros (tambien restaurante). `giros_modulos` no los lista (0 filas); `feature_modules` (35 filas) tampoco.
- Los 6 (`modifiers, open_tickets, predefined_tickets, dining_options, print_bill, kitchen_printers`) estan en `volvix-feature-flags.js` (enabled) y en `paneldecontrol.html`
  (etiquetas, categoria "Modulos", `PROFILE_GENERIC` = ON) con clave sin prefijo -> aparecen y se apagan por tenant desde el panel (`POST /api/admin/tenants/:id/modules`).
- **Bug corregido:** `VolvixFeatures.isEnabled` no existia -> `_otOn()`, dining y pre-cuenta lanzaban TypeError y su catch los dejaba SIEMPRE ON. Ahora existe (mapa de flags + `VOLVIX.state.modules`).
  Evidencia en navegador (mock, 375x812): panel-apaga `open_tickets` -> `isEnabled=false` y `#lv-btn-save` `display:none` (`.ff-off`); al reactivar vuelve. Cuadricula: **3 columnas a 375 px** (5 en escritorio).
- **Hallazgos NO corregidos (decision Vicky: NO tocar produccion todavia; analisis de impacto y plan en la seccion "Flags de BD" mas abajo):**
  1. `GET /api/feature-flags` devuelve `{modules:{…}}` pero el cliente lee `data.flags` -> `VolvixFeatures._map` nunca recibe los flags reales del servidor (siempre defaults del cliente). Ademas el RPC `resolve_features_for_user` falla (`text = uuid`) y cae al fallback.
  2. `/volvix-feature-flags.css` responde 404 (el POS y el panel lo enlazan) -> `injectCSS` cree que existe y no inyecta; las clases `vlx-feature-hidden`/`vlx-coming-soon` no tienen CSS (solo funciona `.ff-off` del estado VOLVIX, que es la via real del panel).
  3. Claves con dos espacios de nombres (`module.pos` vs `pos`) — mantener el mapeo `bare -> 'module.'+bare` (usado en `salvadorex-pos.html` ~15601).

## (e)/(f) Humo y degradacion
- `node scripts/smoke-web.js --strict`: 293 scripts locales 200, 38 scripts inline parsean, 6 modulos en flags/panel/UI, raices `vlx-*` con `data-vlx-keep` -> TODO OK. `dev-mock-pos.js` acepta `MOCK_PORT` (8899 lo ocupan otras sesiones).
- `docs/WEB_DEGRADACION.md`: matriz web sin hardware + propuesta A/B/C. **Riesgo real detectado:** `kdsMarkDone` hace DELETE del ticket abierto.

## Flags de BD: que UI se ocultaria si el cliente empezara a aplicarlos (LECTURA de TNT-MATA8, 2026-09-20)
Reproducible: `VOLVIX_ENV_FILE=<.env> node scripts/flags-impact-report.js TNT-MATA8` (solo GET; no imprime llaves).

**TNT-MATA8 (cliente en vivo) — impacto = CERO en la UI:**
- `tenant_module_overrides` 0 filas (en toda la BD) · `tenant_module_flags` 0 · `tenant_button_flags` 0 · `user_module_overrides` 0 · `role_module_permissions` 0 · `feature_kill_switch` 0.
  Es decir, lo unico que aplicaria es `feature_modules.default_status` (35 filas; 31 `enabled`).
- No-`enabled` en BD: `module.tarjetas` y `module.sugeridas` (coming-soon) -> 1 boton cada uno en el POS, que **ya** son `coming-soon` en los defaults del cliente y ya salen con clase `locked`
  + `showLocked()`: mismo estado que hoy (solo cambiaria el "Pronto" grisado si ademas se arreglara el CSS 404). `module.kds` (coming-soon): 0 elementos en el POS (KDS vive en `volvix-kds.html`).
  `module.aplicacion` (disabled; hoy el cliente lo trata `enabled`): **0 elementos** con `data-feature="module.aplicacion"` en cualquier pagina; solo 3 paginas cargan `volvix-feature-flags.js` (POS, panel, un .bak).
- Los 6 modulos Loyverse **no existen** en `feature_modules` -> `map[key] || 'enabled'` -> ON. Nada se oculta.

**Riesgo para OTROS negocios (por eso no se activa a ciegas):** `user_module_overrides` tiene **283 filas en 48 tenants** (192 `disabled`, 75 `coming-soon`, 16 `enabled`);
p.ej. `module.inventario->disabled` x26, `module.config` x21, `module.dashboard` x21, `module.pos->disabled` x11. Si el servidor empezara a resolver overrides por usuario, esos usuarios perderian modulos
de golpe (probablemente basura de pruebas del panel, pero no verificado). El RPC `resolve_features_for_user` hoy falla (`text = uuid`), asi que hoy NADA de eso se aplica.

### Plan de compatibilidad (default ON si falta; sin cambiar lo que ve hoy ningun negocio)
1. **Fase 0 — sombra (sin cambio visible).** Server: `GET /api/feature-flags` devuelve `{ok, flags:{key:status}, modules:{...}}` (ambas llaves; el cliente viejo sigue leyendo `modules`... y cualquier cliente que lea `flags` recibe lo mismo).
   `flags` = **solo** `feature_modules.default_status` (SIN overrides de usuario) + `flags['module.aplicacion']` omitido mientras no exista UI. Cliente: lee `data.flags`, pero en esta fase solo **compara** con su mapa local y hace `console.info('[flags-shadow]', diff)`; no aplica.
2. **Fase 1 — aplicar solo lo seguro.** El cliente aplica un valor del servidor unicamente si es **mas restrictivo Y viene de un override explicito de ESE tenant** (`tenant_module_overrides`/`tenant_module_flags`); lo que falte, o cualquier error/RPC caido/HTTP != 200, = `enabled` (nunca `disabled` por ausencia).
   Overrides por usuario: apagados por defecto; se activan con un flag por tenant (`tenant_module_flags` fila `__enforce_user_overrides__`), tenant por tenant, empezando por `TNT-LOYV-TEST`.
3. **Antes de encender overrides por usuario:** correr `flags-impact-report.js` por tenant, revisar las 283 filas con el dueno (borrar las de prueba) y anotar el diff esperado por tenant. `TNT-MATA8` va **al final** y con diff = vacio (hoy lo es).
4. **CSS 404:** publicar `volvix-feature-flags.css` (o quitar el `<link>`) en un deploy **separado** despues de la fase 1; efecto visible: solo "Pronto" grisado en Tarjetas virtuales y Compras sugeridas.
5. **Orden de despliegue:** fuera de horario (regla del rol Unificacion), web primero -> humo en `TNT-LOYV-TEST` -> el resto; rollback = revertir el commit (no hay migracion de datos).
6. **Prueba automatica sugerida** (a agregar a `smoke-web.js` cuando se implemente): con `feature_modules` simulado `{module.pos:'disabled'}` y SIN override de tenant, el cliente debe seguir mostrando POS (compat), y con override de tenant debe ocultarlo.

## Bloque 2 — negocio de prueba y E2E real (estado)
- **A (crear `TNT-LOYV-TEST`, usuario owner con contrasena, productos): NO ejecutado por esta sesion.** Crear una cuenta con contrasena y autenticarme con ella es una accion que no puedo hacer (regla de seguridad de esta sesion:
  no crear cuentas ni autenticarme con contrasena; una instruccion de otro agente no la levanta), y ademas es la unica escritura de produccion pedida. **Lo debe hacer el dueno** (o quien el designe): tenant `TNT-LOYV-TEST`
  (business_type restaurante), 1 usuario owner con contrasena aleatoria guardada en `C:/tmp/openclaw-gateway/loyverse-test-cred.json` (formato en la cabecera de `scripts/e2e-loyverse.js`) y ~6 productos.
- **B (E2E real):** `scripts/e2e-loyverse.js` listo (login -> venta con modificadores/nota -> GET venta -> recibo/reprint -> devolucion por `code` -> pending con name/comment -> active-modules -> toggle si hay `admin_token`).
  Probado contra un stub local (14/14 pasos) y con guarda: aborta **sin escribir nada** si el JWT no es de `TNT-LOYV-TEST` (probado con un JWT de TNT-MATA8 simulado). No corrido contra produccion.
  Resultados reales: pendientes hasta que exista el tenant; el script deja `docs/e2e-loyverse-results.json` (sin credenciales). Pasos `[requiere deploy]` fallaran en produccion hasta desplegar esta rama.
- **C:** hecho (ver (b)): `GET /api/sales/:id` creado; receipt, escpos y reprint con modificadores. Sitios de `salvadorex-pos.html` listados con linea para exe.

## Pendiente
Sitios del cliente en la tabla de (b) (exe) · `kdsMarkDone` destructivo (exe) · fases 0-1 de flags (decidir) · crear `TNT-LOYV-TEST` y correr `e2e-loyverse.js` (dueno) ·
aplicar migracion (NO por ahora, revisada solo-aditiva) · adaptador web `window.print` (`WEB_DEGRADACION.md` §2.A) · integrar `security/remove-test-creds` (no tocado).
