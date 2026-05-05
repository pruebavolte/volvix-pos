# QA Autónomo - Volvix POS

Suite end-to-end Playwright: 7 fases, ~30 tests, validación de UI, API, BD simulada y seguridad.

## Estructura

```
tests/qa-autonomous/
├── phase1_explore.js              # Crawler que genera INVENTORY.json + storage.json
├── phase2_tests/
│   ├── auth.spec.js               # Login 3 roles + bad creds + PIN + logout
│   ├── pos_flow.spec.js           # Catálogo → carrito → cobrar → ticket
│   ├── productos_crud.spec.js     # Crear/editar/borrar/import/export
│   ├── clientes_crud.spec.js      # CRUD + RFC inválido + email duplicado
│   ├── caja.spec.js               # Apertura → ventas → corte con variance
│   ├── cfdi.spec.js               # Generar + cancelar CFDI
│   ├── multitenant.spec.js        # TNT001 NO ve TNT002
│   └── security.spec.js           # Confidenciales 404, sin auth 401
├── phase3_human.spec.js           # Edge cases: doble click, XSS, refresh, multi-tab
├── phase5_db_validation.spec.js   # POST sale → GET /api/sales/latest + dup detection
├── phase7_optimized.spec.js       # Fixtures, parallel, retry
├── playwright.config.js
├── REPORT.md                      # Plantilla de reporte final
├── README.md
└── artifacts/                     # Generado al correr (gitignore)
    ├── INVENTORY.json
    ├── storage.json
    ├── html-report/
    └── *.png
```

## Instalación

```bash
cd tests/qa-autonomous
npm init -y
npm i -D @playwright/test
npx playwright install chromium
```

## Ejecución

```bash
# 1. Explorar y generar inventario + storage state autenticado
node phase1_explore.js

# 2. Correr todos los specs (genera REPORT en artifacts/)
npx playwright test

# Subset
npx playwright test phase2_tests/auth.spec.js
npx playwright test --grep security

# Ver reporte HTML
npx playwright show-report artifacts/html-report
```

## Variables de entorno

| Var | Default | Uso |
|-----|---------|-----|
| `BASE_URL`   | `https://volvix-pos.vercel.app` | URL del POS |
| `QA_EMAIL`   | `admin@volvix.test`             | Login |
| `QA_PASSWORD`| `Volvix2026!`                   | Login |
| `QA_PIN`     | `1234`                          | PIN admin |

## Las 7 fases

1. **Exploración** — `phase1_explore.js` extrae todos los `<button>`, `<input>`, `<select>` y modales con `page.$$eval`. Genera `INVENTORY.json`.
2. **Tests generados** — 8 specs en `phase2_tests/` cubren auth, POS, CRUD, caja, CFDI, multitenant, security.
3. **Humano simulado** — `phase3_human.spec.js`: doble click, form vacío, XSS, precio negativo, refresh durante checkout, multi-tab.
4. **Validación estructurada** — Cada test imprime `[QA RESULT]` con Expected/Actual/Error/Improvement.
5. **BD simulada** — `phase5_db_validation.spec.js`: POST sale → GET latest, detecta duplicados con misma idempotency-key.
6. **Reporte** — `REPORT.md` con secciones P0/P1/UX/técnico/negocio.
7. **Auto-mejora** — `phase7_optimized.spec.js` con fixtures, parallel, retry.

## CI - GitHub Actions

`.github/workflows/qa.yml`:

```yaml
name: QA Autónomo
on:
  pull_request:
  push: { branches: [main] }
  schedule: [{ cron: '0 6 * * *' }]   # daily 06:00 UTC
jobs:
  qa:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - working-directory: tests/qa-autonomous
        run: |
          npm i -D @playwright/test
          npx playwright install --with-deps chromium
      - name: Phase 1 - explore
        working-directory: tests/qa-autonomous
        env:
          BASE_URL: ${{ secrets.QA_BASE_URL }}
          QA_EMAIL: ${{ secrets.QA_EMAIL }}
          QA_PASSWORD: ${{ secrets.QA_PASSWORD }}
        run: node phase1_explore.js
      - name: Phases 2-7 - tests
        working-directory: tests/qa-autonomous
        env:
          BASE_URL: ${{ secrets.QA_BASE_URL }}
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: qa-artifacts
          path: tests/qa-autonomous/artifacts/
```

## Convención de logs

Todos los tests emiten stdout etiquetado:

- `[QA]`              info general
- `[QA][LOGIN]`       paso del flujo
- `[QA][REQ]/[RES]`   network capture
- `[QA][PAGEERROR]`   JS error en página
- `[QA RESULT]`       resumen Expected/Actual al cierre de cada test

Esto permite `grep "\[QA RESULT\]" output.log` para auditoría rápida.
