# R25 — CI/CD Pipeline

Fecha: 2026-04-27
Ruta: `.github/workflows/`

## Workflows creados

| Archivo | Propósito | Triggers | Job principal |
|---|---|---|---|
| `ci.yml` | Build, syntax-check, lint, smoke test | `push` y `pull_request` (todas las ramas) | Setup Node 20 → `npm ci` (si hay lock) → `node --check api/index.js` + wirings (`api/*.js`, `api/admin/*.js`, `server.js`) → ESLint condicional → `curl /api/health` con 5 reintentos en PRs |
| `playwright.yml` | E2E sobre deploy preview | `pull_request`, `workflow_dispatch` | Setup Node 20 + Chromium → `npx playwright test --project=chromium` con `BASE_URL=PREVIEW_URL` |
| `daily-backup.yml` | Backup diario del repo | `schedule: 0 6 * * *`, `workflow_dispatch` | `checkout` con `fetch-depth: 0` y `repository: ${{ github.repository }}` (apunta al repo correcto automáticamente) → `tar.gz` excluyendo `.git` y `node_modules` |
| `lighthouse.yml` | Auditoría semanal | `schedule: 0 8 * * 1` (lunes), `workflow_dispatch` | `lighthouse` CLI sobre `PROD_URL`/`PREVIEW_URL` → parser Node calcula min(Perf, A11y, BP, SEO, PWA) |
| `security-scan.yml` | npm audit + Snyk | `push`, `pull_request`, `schedule: 0 4 * * *` | `npm audit --audit-level=high --json` → falla si critical>0 → Snyk solo si `SNYK_TOKEN` está definido |

## Artifacts producidos

- `playwright-report/` y `playwright-artifacts` (test-results, screenshots) — retención 14 d
- `volvix-backup-<UTC stamp>.tar.gz` — retención 30 d
- `lighthouse-report.report.html` + `.json` — retención 30 d
- `npm-audit-report` (audit.json) — retención 14 d

## Secrets requeridos (GitHub repo settings)

- `PREVIEW_URL` — usado por `ci.yml` (smoke), `playwright.yml`, `lighthouse.yml`
- `PROD_URL` — preferente en `lighthouse.yml`
- `SLACK_WEBHOOK` y/o `DISCORD_WEBHOOK` — alertas Lighthouse <80
- `SNYK_TOKEN` — opcional, activa Snyk

## Notas de diseño

- Todos los pasos son tolerantes: si falta `package.json`, `package-lock.json`, `.eslintrc` o `api/index.js`, hacen skip controlado en lugar de fallar.
- `ci.yml` solo corre smoke test en PRs (necesita preview URL).
- `security-scan.yml` rompe CI únicamente con vulnerabilidades **critical**; las **high** quedan como warning para no bloquear releases por falsos positivos transitivos.
- `daily-backup.yml` usa `${{ github.repository }}` para garantizar que apunta al repo donde corre (no hardcoded).
