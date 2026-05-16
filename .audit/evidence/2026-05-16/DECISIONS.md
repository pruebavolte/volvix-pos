# DECISIONS — decisiones tomadas autonomamente (autorizadas por el owner)

## D1 — Tenants de prueba en produccion (autorizado)
Owner confirmo crear T_A y T_B en produccion para AGENTE 5.
Compromiso: eliminar al terminar, evidencia en agente-05/CLEANUP.md.

## D2 — Captcha stub (autorizado)
Stub + flag CAPTCHA_ENABLED=false. Owner provee Turnstile keys despues.

## D3 — IVA 16% post-descuento (autorizado)
Default global, configurable por tenant. Casos especiales: frontera 8%, exentos 0%, IEPS opcional.
Migracion: todos los tenants existentes reciben 16% al primer load.

## D4 — AGENTE 1 reducido a captcha stub, movido al final con AGENTE 12.

## D5 — Convencion nombres tabla: pos_* / admin_*

## D6 — Sin breaking changes en cliente — Fase 1 siempre backward-compatible.

## D7 — Confirmacion destructiva: modal custom + tipear slug, reemplaza confirm() browser.

## D8 — DROP de tablas legacy (ADR-004) NO se ejecuta en este ciclo (irreversible).

## D9 — Token impersonacion: scope='impersonate_read_only' con check en endpoints write.

## D10 — Polling config cada 60s con If-None-Match, retorna 304 si no hubo cambio.

## D11 — Ticket reimpreso con IVA: se imprime con IVA actual del tenant, no historico
(Si tenant cambia IVA de 16 a 8 frontera, los tickets viejos al reimprimir muestran el desglose
con el IVA original guardado en la tabla pos_sales.tax_breakdown, no el actual.)

## D12 — Stock decrement local: TRANSACCIONAL con POST /api/sales exitoso.
Si POST falla, NO decrementa CATALOG. Si POST 200, decrementa y dispara onProductsChange.
