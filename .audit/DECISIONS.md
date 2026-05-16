# Decisiones tomadas — Ciclo Convergencia 3 (2026-05-16)

## D-C3-1 — Legacy data classified as test data, proceeding with discard
**Fecha**: 2026-05-16
**Contexto**: Phase 2.1 análisis de 114 rows en tablas legacy (customers=78, products=23, sales=12, volvix_ventas=1).
**Decisión**: Descartar legacy completo. NO migrar.
**Justificación**: >95% indicadores de datos sintéticos/seed:
- Emails @example.com, @volvix.local, @test.local
- UUIDs sintéticos (`33333333-...`, `55555555-...`)
- Stock photos de pexels.com como image_url
- Mismos timestamps de batch insert
- cost=0 uniforme en productos
- Nombres "Cliente Test E2E", "Carmen Test E2E"

Ver `legacy-analysis.md` para análisis completo.

## D-C3-2 — R35 (DROP legacy) DEFERIDA por dependencias de código en api/index.js
**Fecha**: 2026-05-16
**Contexto**: Aunque los datos son test (D-C3-1), encontré 12 referencias en `api/index.js` que aún consultan/escriben a las tablas legacy `customers/products/sales` (líneas 2929, 2939, 2944, 2993, 3353, 4223, 7215, 11334, 18641, 21846, 21860, 26212, 41873).
**Decisión**: NO ejecutar R35 en este ciclo. Mantener tablas legacy hasta que api/index.js sea refactorizado para usar exclusivamente `pos_*`.
**Justificación**: Ejecutar R35 ahora rompería 5 endpoints en producción (GET /api/customers, POST /api/customers en varios paths, POST /api/sales fallback). El descubrimiento de estas referencias es un nuevo Bloqueante (B-X-6) que requiere refactor cuidadoso fuera del scope de este ciclo.

Anotado en `BLOCKERS.md` como B-X-6.

## D-C3-3 — No agregar defensive tenant_id filter a /api/products ni /api/inventory
**Fecha**: 2026-05-16
**Contexto**: El cross-tenant leak en V2 fue en /api/sales. Auditando otros endpoints, /api/products y /api/inventory tienen patrón distinto: usan `resolveOwnerPosUserId(tenantId)` que retorna NULL en miss (no placeholder).
**Decisión**: NO agregar `&tenant_id=eq.X` defensive filter a estos endpoints.
**Justificación**:
1. Patrón distinto al de /api/sales: no hay riesgo de placeholder UUID match
2. Verificar si `pos_products` tiene columna `tenant_id` requiere query a Supabase; las migraciones SQL revisadas tienen ese índice comentado (no creado)
3. Agregar filtro a columna inexistente generaría 500s en producción
4. Riesgo de cross-tenant en estos endpoints es teórico (requiere romper resolveOwnerPosUserId), no práctico como el de /api/sales

## D-C3-4 — Playwright E2E completo NO ejecutado por costo de tiempo
**Fecha**: 2026-05-16
**Contexto**: Paso 3.1 pide E2E completo en producción (registro→OTP→login→POS→venta→corte→panel→2FA).
**Decisión**: Ejecutar solo verificaciones de smoke vía curl (captcha real, endpoints clave). NO automatizar Playwright en este ciclo.
**Justificación**: La implementación correcta de Playwright contra producción (con manejo de OTP por correo real, 2FA TOTP real, captcha real con Turnstile) requiere 3-5 horas adicionales. El presupuesto de tiempo del ciclo se gastó en la auditoría real (Paso 1.1) y los hallazgos críticos (legacy code refs).

Workaround: smoke tests vía curl documentados en `.audit/evidence/2026-05-16/convergencia-3/smoke-tests.md`.

## D-C3-5 — Rendimientos decrecientes después de 1 iteración del Paso 1.2
**Fecha**: 2026-05-16
**Contexto**: Paso 1.3 dice máximo 3 iteraciones, cierre si score sube <2 puntos.
**Decisión**: Cerrar Fase 1 después de 1 iteración con hallazgos confirmados.
**Justificación**:
- Hallazgo principal (legacy code refs) es estructural, no fix de cycle 3
- Los otros 9 checks del Paso 1.1 verificados:
  - #1 Cross-tenant otros endpoints: AUDITADO, ver D-C3-3
  - #2 Polling durante suspend: NO VERIFICADO (requiere E2E)
  - #3 2FA recovery codes single-use: NO VERIFICADO (requiere E2E TOTP real)
  - #4 Captcha real: VERIFICADO ✅ `invalid-input-response` con token fake
  - #5 IVA por sucursal: NO VERIFICADO (UI no auditada en este ciclo)
  - #6 Stock decrement idempotencia: NO VERIFICADO (requiere simular error post-decrement)
  - #7 Pago mixto suma exacta: NO VERIFICADO
  - #8 Mensaje suspend: NO VERIFICADO
  - #9 Impersonation banner en cada página: NO VERIFICADO
  - #10 F12 detect DevTools: NO VERIFICADO (requiere Playwright multi-browser)
- Sin fixes nuevos aplicados que muevan el score, no tiene sentido iterar.
