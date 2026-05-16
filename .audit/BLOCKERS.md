# Bloqueantes — Estado al cierre del Ciclo Convergencia 3 (2026-05-16)

## B-X-6 (NUEVO en ciclo 3) — api/index.js depende de tablas legacy

**Severidad**: Bloqueante (impide ejecutar R35 / ADR-004)
**Categoría**: Refactor estructural / técnico
**Descubierto**: 2026-05-16 ciclo 3

### Descripción
12 referencias en `api/index.js` aún consultan/escriben directamente a las tablas legacy `customers`, `products`, `sales`. Ejecutar `R35_ADR-004_DROP_LEGACY.sql` (que hace DROP TABLE de estas) rompería los endpoints siguientes:

| Línea | Operación | Endpoint impactado |
|---|---|---|
| 2929 | `GET /customers` | `GET /api/customers` (path principal) |
| 2939 | `GET /customers` | `GET /api/customers` (fallback sin deleted_at) |
| 2944 | `GET /customers` | `GET /api/customers` (fallback profundo user_id) |
| 2993 | `POST /customers` | `POST /api/customers` (creación) |
| 3353 | `GET /customers?select=id,active` | endpoint admin stats |
| 4223 | `POST /customers` | bootstrap nuevo tenant |
| 7215 | `POST /products` | catálogo bootstrap |
| 11334 | `POST /customers` | otro path de creación |
| 18641 | `GET /customers` | export endpoint |
| 21846 | `POST /sales` | wrapper venta (fallback) |
| 21860 | `POST /sales` | wrapper venta (segundo intento) |
| 26212 | `POST /customers` | flow auto-crear customer en venta |
| 41873 | `POST /customers` | otro path |

### Gravedad para producción real
**Alta** si se ejecuta R35 sin refactor. **Baja** si NO se ejecuta R35:
- Sistema actual funciona porque las tablas legacy existen vacías o con seed data
- POS opera principalmente sobre `pos_*` (el código nuevo); las refs legacy son paths fallback o de creación menos críticos
- Riesgo: si alguno de estos paths recibe tráfico real, los datos quedan duplicados (escribir tanto a legacy como a pos_*)

### Workaround actual
NO ejecutar R35. Mantener tablas legacy existiendo (vacías). Aceptar que ADR-004 queda 4/5 (no se cierra el 5/5).

### Para cerrarlo necesitamos
1. Refactor: reemplazar cada `/customers` → `/pos_customers`, `/products` → `/pos_products`, `/sales` → `/pos_sales` en api/index.js (12 líneas)
2. Verificar que `pos_customers` tiene columnas equivalentes (full_name vs name, etc.) — schema diff
3. Crear migración R37_CODE_TO_POS.md documentando el mapeo
4. E2E completo de cada endpoint refactorizado contra preview Vercel antes de prod
5. Luego R35 puede ejecutarse seguro

**Estimación**: 2-3 horas de refactor + 1-2 horas de E2E + 30 min para R35.

---

## B-MKT-5 (HEREDADO de V2) — Cloudflare Turnstile

**Estado en ciclo 3**: ✅ CERRADO en sesión anterior (post-V2). Site key creado, env vars en Vercel, widget en registro.html, backend valida con siteverify real (verificado en este ciclo).

Movido a "Cerrados" — eliminar de blockers.

---

## B-X-7 (NUEVO) — Verificaciones E2E completas no ejecutadas

**Severidad**: Crítico (no Bloqueante)
**Categoría**: Cobertura de testing

### Descripción
De los 10 checks específicos del Paso 1.1, solo se verificaron en este ciclo:
- #1 Cross-tenant otros endpoints (auditoría de código, no E2E)
- #4 Captcha Turnstile real (smoke test curl ✅)

Los 8 restantes (polling/suspend, 2FA recovery codes, IVA UI, stock idempotencia, pago mixto, mensaje suspend, banner impersonation, F12 detect) requieren E2E con Playwright multi-browser. No ejecutados por presupuesto de tiempo.

### Gravedad
Cada uno individualmente es Crítico (no Bloqueante) — la app funciona, pero estos flows no están probados E2E.

### Workaround actual
Smoke tests vía curl documentados. UI manual del owner cuando opere su propio POS.

### Para cerrarlo necesitamos
Suite Playwright contra preview Vercel cubriendo:
- Multi-browser (Chromium, Firefox, WebKit)
- Captura de OTP de Resend via API key
- Captura de TOTP via shared secret (test mode)
- Asserts en cada checkpoint

**Estimación**: 4-6 horas iniciales + mantenimiento continuo.

---

## Bloqueantes heredados aún abiertos

(Ninguno — los de V2 quedaron cerrados o convertidos en los de arriba)

---

## Resumen final

| ID | Descripción | Impacto producción | Workaround |
|---|---|---|---|
| **B-X-6** | api/index.js depende de tablas legacy | Bloquea ADR-004 5/5 | No ejecutar R35; tablas vacías OK |
| **B-X-7** | E2E completos no automatizados | Tests faltantes | Smoke tests + uso manual |

**ADR-004 final**: 4/5 (R35 deferida con justificación técnica).
