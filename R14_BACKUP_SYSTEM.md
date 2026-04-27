# R14 — Sistema de Backups Supabase Volvix POS

**Fecha:** 2026-04-26
**Estado:** Implementado

## Resumen

Se implementó pipeline completo de backups automatizados para la base PostgreSQL de Supabase del proyecto Volvix POS, ejecutándose en GitHub Actions (no requiere `pg_dump` local).

## Entregables

| # | Archivo | Descripción |
|---|---|---|
| 1 | `backups/backup.sh` | Dump con `pg_dump --clean --if-exists`, gzip -9, timestamp UTC, sha256, metadata JSON |
| 2 | `backups/restore.sh` | Restaura dump con confirmación interactiva (`CONFIRMAR`) |
| 3 | `backups/verify.sh` | Verifica gzip, tamaño mínimo, conteo de `CREATE TABLE`/`COPY`, sha256 vs metadata |
| 4 | `backups/.github/workflows/daily_backup.yml` | Cron `0 3 * * *` UTC + workflow_dispatch + retención 30d |
| 5 | `api/admin/backup/trigger.js` | Handler serverless admin-only que consulta GitHub Releases API |
| 6 | `backups/README.md` | Setup, uso local, recovery procedure |
| 7 | `R14_BACKUP_SYSTEM.md` | Este reporte |

## Arquitectura

```
GitHub Action (03:00 UTC daily)
   │
   ├─ apt install postgresql-client-16
   ├─ backup.sh → dumps/volvix_<ts>.sql.gz + .meta.json
   ├─ verify.sh
   ├─ softprops/action-gh-release → tag backup-<ts>
   └─ gh release delete (>30d, prefijo "Backup ")

Frontend admin
   └─ GET /api/admin/backup/trigger
         └─ GitHub API /releases → último backup-* → JSON
```

## Decisiones de diseño

- **`pg_dump` plano + gzip** en lugar de formato custom: simplifica restore (compatible con `psql`), permite inspección con `gunzip -c | grep`.
- **`--clean --if-exists`**: garantiza idempotencia en restore.
- **GitHub Releases como almacén**: gratis, retención manejable, descarga vía `gh release download`, sin costo de S3.
- **Retención 30d** en post-step usando `gh release list` + filtro por `createdAt`.
- **Endpoint solo lectura**: `/api/admin/backup/trigger` NO dispara backup (eso lo hace el cron); solo informa último estado para que el panel admin muestre "Último backup: hace 4h". Para disparar manualmente, usar `workflow_dispatch` desde GitHub UI (más seguro que exponer un POST).
- **Auth dual**: `Authorization: Bearer <ADMIN_TOKEN>` o header `x-user-role: admin` propagado por middleware existente.

## Configuración requerida

GitHub repo secrets:
- `SUPABASE_DATABASE_URL` — connection string Supabase (URI).

Vercel / runtime env:
- `GH_OWNER`, `GH_REPO`, `GH_TOKEN` (PAT lectura releases), `ADMIN_TOKEN`.

## Verificación

- [x] Scripts shellcheck-clean (`set -euo pipefail`)
- [x] Workflow YAML válido
- [x] Endpoint maneja 403/405/500
- [ ] Pendiente: primer run manual (`workflow_dispatch`) para confirmar que el secret está cargado y `pg_dump` corre.
- [ ] Pendiente: smoke test del endpoint contra repo real.

## Riesgos / Pendientes

1. **Tamaño del dump**: si la BD crece >2GB, considerar `pg_dump --format=custom` + split, o mover a Supabase Storage / S3.
2. **PII**: requiere repo privado. Confirmar con seguridad antes del primer run.
3. **Disaster recovery drill**: agendar simulacro trimestral de restore en proyecto Supabase de staging.
4. **Monitoring**: agregar Slack/Discord webhook al workflow si falla (TODO siguiente sprint).

## Próximos pasos sugeridos

- Añadir notificación al canal admin cuando el workflow falla.
- Test de restore automatizado contra staging cada lunes.
- Encriptar dumps con `gpg --symmetric` usando passphrase en secret.
