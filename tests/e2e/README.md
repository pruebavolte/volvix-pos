# Volvix POS — E2E Tests (Playwright)

Suite E2E contra producción: `https://volvix-pos.vercel.app`.

## Requisitos

- Node.js 18+
- Acceso a internet (apunta a la URL prod)

## Instalación y ejecución

Desde `tests/e2e/` (o desde la raíz del proyecto, ajustando el path):

```bash
# 1) Instala Playwright + browsers (solo la primera vez)
npm init -y
npm install -D @playwright/test
npx playwright install

# 2) Corre toda la suite
npx playwright test --config=playwright.config.js

# 3) Reporte HTML
npx playwright show-report
```

## Variables de entorno

- `VOLVIX_BASE_URL` — sobreescribe la URL base. Default: `https://volvix-pos.vercel.app`.

```bash
VOLVIX_BASE_URL=https://staging.volvix-pos.vercel.app npx playwright test
```

## Specs incluidos

| Archivo | Cubre |
|---|---|
| `01_login.spec.js` | Login admin/owner/cajero, fail con bad creds (401), token persistido |
| `02_pos_flow.spec.js` | Flujo POS: catálogo → carrito → cobro → ticket |
| `03_owner_panel.spec.js` | Owner: dashboard, productos, clientes, reports |
| `04_security.spec.js` | Sin Bearer → 401, `/api/debug` → 404, confidenciales → 404 |
| `05_multi_tenant.spec.js` | Cajero de TNT001 NO puede leer TNT002 |

## Usuarios de prueba

| Email | Pass | Rol |
|---|---|---|
| admin@volvix.test | Volvix2026! | admin |
| owner@volvix.test | Volvix2026! | owner |
| cajero@volvix.test | Volvix2026! | cajero |

## Notas

- Los selectores priorizan `data-testid`, luego `name/id`, y caen a heurísticas por texto.
- Si un spec falla por selector, agregar `data-testid` en el frontend en vez de hacer el selector más laxo.
- Los tests usan `failOnStatusCode: false` para validar status codes negativos sin abortar.
- Retry = 1, workers = 1 para evitar carreras multi-tenant en producción.
