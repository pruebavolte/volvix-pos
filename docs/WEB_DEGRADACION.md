# WEB sin hardware — comportamiento degradado y propuesta

> Rama `web/loyverse` · 2026-09-20 · Estado: **aprobado por Vicky** (instruccion del bloque Web). Fuente: lectura del codigo de `public/` y
> `api/index.js` en esta rama (cada afirmacion tiene su ancla). Regla de oro: la VENTA nunca se bloquea por falta de hardware.

## 1. Que pasa hoy en web (navegador, sin .exe ni APK)

`window.VolvixPlatform.kind === 'web'` -> `printTicket`, `printComanda`, `openDrawer`, `scanBarcode`, `comanda*` resuelven
`{ ok:false, unsupported:true }` sin lanzar (`public/volvix-platform.js`, adaptador `noopAdapter`).

| Funcion | Comportamiento actual en web | Se rompe la venta? | Gap |
|---|---|---|---|
| Cobrar | La venta se guarda (POST /api/sales). La impresion automatica es solo `kind==='electron'` (`volvix-cobro-modal.js` FASE 4). | No | No sale ticket solo |
| Ticket / reimpresion | "Reimprimir ultimo ticket": ventana 280 px con boton Imprimir = `window.print()` del navegador (`reimprimirUltimoTicket`); `GET /api/sales/:id/reprint` da HTML 80 mm con marca COPIA | No | Ambas reimpresiones **omiten modificadores y nota de linea** (ver `docs/WEB_VERIFICACION.md`) |
| Pre-cuenta (`module.print_bill`) | `printPreBill`: `kind==='web'` -> toast rojo "Impresora no disponible en este dispositivo" | No | Deberia imprimir con el navegador |
| Comanda a cocina por red (TCP 9100) | Imposible desde un navegador (sin sockets). `VolvixComanda.onSave` -> `unsupported`, silencioso. `#cfg-comanda-box` sale `hidden` fuera de electron/android | No | Cocina no se entera |
| Cajon de efectivo | no-op silencioso | No | — |
| Escaner | Lector USB/BT tipo teclado funciona igual (campo de codigo con foco); camara: pendiente (`scanBarcode` unsupported) | No | Camara en Ola hardware |
| KDS | Existe en web: POS > Cocina (`renderKDS`, lee `GET /api/sales/pending`) y `volvix-kds.html` | **Si, en combinacion con tickets abiertos** | "Listo" hace `DELETE /api/sales/pending/:id` (`kdsMarkDone`): **borra el ticket abierto** que caja todavia debe cobrar |

## 2. Propuesta (orden = costo/beneficio; A y B no requieren instalar nada)

**A. Adaptador web de impresion por navegador** (0.5 dia). En `volvix-platform.js`, `noopAdapter.printTicket` (y `printPreBill` por reutilizarlo)
renderiza `opts.text` dentro de un `<iframe>` oculto (`<pre>` monoespaciado, `@page { size: 58mm|80mm auto; margin:0 }`) y llama `window.print()`.
Devuelve `{ ok:true, via:'browser-print' }` (el navegador no informa si imprimio; el toast dice "Se abrio la impresion"). Con Chrome en
modo `--kiosk-printing` la impresion en la PC de caja sale sin dialogo. `kind` sigue siendo `'web'`. `printComanda`/`openDrawer` siguen `unsupported`.
Ningun llamador cambia: `printPreBill` deja de rechazar `kind==='web'`; cobro FASE 4 imprime en web solo si `cfg.autoPrintWeb` (default apagado).

**B. KDS web para la cocina** (1 dia, sin hardware). La comanda deja de ser papel: al **Guardar** el ticket abierto (o cobrar) la cocina lo ve en
una tablet abierta en `volvix-kds.html` (o POS > Cocina). Cambios: (1) "Listo" no borra: marca `kds_status='ready'` (columnas nuevas, ver
`docs/migrations-propuesta-pending-sales.sql` bloque B) y el ticket sigue abierto para caja; (2) mostrar `modifiers`, `note`, `dining`, mesero y
solo lo NUEVO desde el ultimo envio (misma logica `VolvixComanda.delta`); (3) refresco por polling 5 s (luego Supabase Realtime); (4) filtro por
estacion (categoria -> cocina/barra) reutilizando el ruteo de `module.kitchen_printers`; (5) sonido/parpadeo al llegar un item nuevo.
Flag: `module.kitchen_printers` en negocios con impresora, `kds` en negocios sin ella.

**C. Puente de impresion local (opcional, negocios web-only con impresora de red)** (1-2 dias). Servicio minimo en la PC de caja
(`127.0.0.1:9101`, reutiliza `electron/comanda-printer.js`): `GET /health`, `POST /print {ip,port,text|bytes}` -> TCP 9100. Solo loopback,
token local, allowlist de IPs privadas, CORS al origen del POS. El adaptador web lo detecta al cargar (`health` 200) y pasa a
`kind:'web'` + `bridge:true`: `printComanda` y `printTicket` van por el puente; sin puente, se degrada a A/B. Es lo unico que da comandas de
red reales desde web; el .exe ya lo trae integrado.

**D. Reglas de degradacion (todas las plataformas):** toda llamada de hardware va en try/catch, es no bloqueante (nunca en la ruta critica de
`completePay`), su fallo produce un toast informativo unico por sesion y deja rastro (`printed:false` + `print_error` en la venta local, ya existe).

## 3. Orden sugerido y dueños
1) Corregir `kdsMarkDone` (evita perder tickets abiertos; hoy es un riesgo real) — 2) A (pre-cuenta y ticket en web) — 3) B (KDS) — 4) C si algun
cliente web-only lo pide. `salvadorex-pos.html` lo toca Unificacion/exe: asignar area de archivo antes (regla del rol Unificacion).
