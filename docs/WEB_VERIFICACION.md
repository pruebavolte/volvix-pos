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
- Reimpresion/reportes que DESCARTAN modificadores y nota (renderizan solo nombre/qty/precio):
  `GET /api/sales/:id/reprint` (**corregido** en este bloque), `GET receipt` (~linea 18129, sigue `product_id/qty/price`), y en `salvadorex-pos.html`
  `reimprimirUltimoTicket` (vista HTML) y el ESC/POS de reimpresion (`__r8a…`, ~8963) — **pendientes** (archivo caliente: asignar area a Unificacion/exe).
  `VolvixTicketCustomizer.renderText` y el carrito SI los muestran.
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
- **Hallazgos NO corregidos (cambian produccion, decidir con Vicky):**
  1. `GET /api/feature-flags` devuelve `{modules:{…}}` pero el cliente lee `data.flags` -> `VolvixFeatures._map` nunca recibe los flags reales del servidor (siempre defaults del cliente). Ademas el RPC `resolve_features_for_user` falla (`text = uuid`) y cae al fallback. Arreglarlo activaria `module.aplicacion`/`app.*` = `disabled` de `feature_modules` para todos.
  2. `/volvix-feature-flags.css` responde 404 (el POS y el panel lo enlazan) -> `injectCSS` cree que existe y no inyecta; las clases `vlx-feature-hidden`/`vlx-coming-soon` no tienen CSS (solo funciona `.ff-off` del estado VOLVIX, que es la via real del panel).
  3. Claves con dos espacios de nombres (`module.pos` vs `pos`) — mantener el mapeo `bare -> 'module.'+bare` (usado en `salvadorex-pos.html` ~15601).

## (e)/(f) Humo y degradacion
- `node scripts/smoke-web.js --strict`: 293 scripts locales 200, 38 scripts inline parsean, 6 modulos en flags/panel/UI, raices `vlx-*` con `data-vlx-keep` -> TODO OK. `dev-mock-pos.js` acepta `MOCK_PORT` (8899 lo ocupan otras sesiones).
- `docs/WEB_DEGRADACION.md`: matriz web sin hardware + propuesta A/B/C. **Riesgo real detectado:** `kdsMarkDone` hace DELETE del ticket abierto.

## Pendiente
Reimpresion en `salvadorex-pos.html` y GET receipt sin modificadores · `kdsMarkDone` destructivo · `feature-flags` shape/CSS (decidir) · E2E contra API real en negocio de PRUEBA (necesita usuario de prueba) ·
aplicar migracion (luz verde de Vicky) · adaptador web `window.print` (WEB_DEGRADACION §2.A) · integrar `security/remove-test-creds` (no tocado).
