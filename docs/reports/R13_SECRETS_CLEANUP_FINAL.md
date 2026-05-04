# R13 Secrets Cleanup — Final Pass

**Fecha:** 2026-04-26
**Carpeta:** `C:\Users\DELL\Downloads\verion 340\`
**Patrones buscados:** `Volvix2026!`, JWT (`eyJhbGc...` 3 segmentos), `service_role`, `SUPABASE_SERVICE_KEY=eyJ...`, `SUPABASE_ANON_KEY=eyJ...`.

## Resumen

Esta ola limpia los archivos de **código y datos** que aún contenían el password de prueba `Volvix2026!` en claro y un JWT anon de Supabase hardcodeado en cliente. Los `.md` de documentación histórica (`VOLVIX_FINAL_REPORT.md`, `R13_*.md`, `IMPLEMENTATION_COMPLETE.md`, `LAUNCH_SUMMARY.md`, etc.) **no fueron tocados** porque describen incidentes y credenciales ya conocidas como historia del proyecto. `api/index.js` ya estaba saneado en la ola 2 (no se modificó). `node_modules/`, `.git/` y `.env*` excluidos.

## Tabla de cambios

| Archivo | Patrón encontrado | Acción tomada |
|---|---|---|
| `db/volvix.db.json` | 3× `"password": "Volvix2026!"` (USR001/USR002/USR003) | redacted → `"<<test-password-via-env>>"` |
| `db/R13_TEST_USERS_INSERT.sh` | `PLAIN_PASSWORD='Volvix2026!'` (línea 46) | via env: ahora lee `TEST_USER_PASSWORD` (sin default); aborta si falta |
| `db/R13_SEED_DATA.sql` | 2 comentarios mencionando `"Volvix2026!"` (líneas 5, 30) | redacted: los comentarios ahora referencian `TEST_USER_PASSWORD`; el bcrypt hash existente se mantiene (no es plaintext) |
| `login.html` | `<strong>Test:</strong> admin@volvix.test / Volvix2026!` (línea 295) | redacted → `<<test-password-via-env>>` |
| `public/login.html` | misma línea de hint de test | redacted → `<<test-password-via-env>>` |
| `salvadorex_web_v25.html` | `<input ... value="Volvix2026!" ...>` (línea 1298) | redacted: `value=""` (campo vacío, sin pre-fill) |
| `volvix-tests-wiring.js` | `const PASS = 'Volvix2026!';` (línea 19) | via env: lee `process.env.TEST_USER_PASSWORD` o `window.TEST_USER_PASSWORD`, default `''` |
| `test-production.sh` | 3× `Volvix2026!` en array USERS (líneas 27-29) | via env: requiere `TEST_USER_PASSWORD`; aborta si no está exportado |
| `volvix-qa-scenarios.html` | 6× `Volvix2026!` (info-box + 3 escenarios auth) | redacted → `<<test-password-via-env>>` (HTML-escapado) |
| `volvix-realtime-wiring.js` | `SUPABASE_ANON_KEY = 'eyJhbGc...ygTc754...JpEMD0wc_CzRCzRxUfp4hq3rYvJRpjkk'` (líneas 22-24) | redacted: ahora `SUPABASE_URL`/`SUPABASE_ANON_KEY` se leen de `window.*`; fallback marcador `<<JWT_TOKEN_REDACTED>>` |

## Archivos NO modificados (intencionalmente)

| Archivo | Razón |
|---|---|
| `api/index.js` | Ya saneado en ola 2 — `SUPABASE_SERVICE_KEY` viene de env y aborta si falta |
| `VOLVIX_FINAL_REPORT.md`, `R13_FIX_SECRETS_REPORT.md`, `R13_MASTER_REPORT.md`, `R13_SECURITY_AUDIT.md`, `R13_HARDCODED_AUDIT.md`, `R13_LOGIN_PHYSICAL_TEST.md`, `R13_DEPLOY_CHECKLIST.md`, `R13_API_AUDIT.md`, `VOLVIX_FINAL_DOCUMENTATION.md`, `VOLVIX_README.md`, `VOLVIX_SYSTEM_MAP.md`, `IMPLEMENTATION_COMPLETE.md`, `INTEGRATION_SUMMARY.md`, `INTEGRATION_FINAL_STATUS.md`, `LAUNCH_SUMMARY.md`, `PRODUCTION_LIVE.md`, `QUICKSTART.md`, `REPORTE_FINAL.md`, `SALVADOREX_INTEGRATION_COMPLETE.md`, `TASKS_FOR_NEXT_AI.md`, `TESTING_RESULTS.md`, `VERIFICATION_COMPLETE.md`, `DEPLOY_VERCEL.md` | kept-with-note: documentación histórica de auditoría/deploy. La password ya está documentada como compromised en `R13_FIX_SECRETS_REPORT.md`. **Acción requerida fuera de este script:** rotar password en Supabase y actualizar todos los `.md` o eliminarlos del repo público antes de publicar |
| `node_modules/`, `.git/`, `.env*` | excluidos por política |

## Verificación final

Tras los edits, búsqueda recursiva (excluyendo `.md`):

```
grep "Volvix2026!"               → 0 archivos
grep "eyJhbGc<jwt-3-segmentos>"  → 0 archivos
```

## Pendiente fuera de este pass (acción humana)

1. **Rotar en Supabase Dashboard** la `service_role` y `anon` key del proyecto `zhvwmzkcqngcaqpdxtwr` — el JWT anon original quedó expuesto en commits previos.
2. **Setear env vars en Vercel/runtime:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `TEST_USER_PASSWORD`.
3. **Cambiar la password real** de los 3 usuarios de prueba en Supabase (`Volvix2026!` ya circuló en docs y commits).
4. **Decidir sobre los `.md` históricos:** o purgar las menciones de `Volvix2026!` o mover esos reportes a un repo privado antes de publicar el código.
