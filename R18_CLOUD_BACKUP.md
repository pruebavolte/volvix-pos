# R18 - Cloud Backup (S3 / R2 / B2)

## Resumen
Backup automatico a almacenamiento S3-compatible. Soporta AWS S3, Cloudflare R2 y Backblaze B2 mediante el mismo protocolo (Sig v4).

## Endpoints (api/index.js)
- `POST /api/admin/backup/cloud` (admin/owner/superadmin) -> genera dump SQL y sube objeto al bucket. Devuelve `{ id, type, provider, location, size_bytes }`. **503** si faltan credenciales.
- `GET  /api/admin/backup/list` (admin/owner/superadmin) -> top 50 backups recientes. Filtra por tenant; superadmin ve todo.
- `POST /api/admin/backup/restore/:id` (superadmin) -> requiere body `{ "confirm": true }`. Encola job y devuelve `job_id`.

## Variables de entorno
| Var | Requerido | Descripcion |
|-----|-----------|-------------|
| `AWS_ACCESS_KEY` | si | Access key (AWS / R2 / B2) |
| `AWS_SECRET` | si | Secret key |
| `S3_BUCKET` | si | Nombre del bucket |
| `S3_ENDPOINT` | no | `*.r2.cloudflarestorage.com` o `s3.*.backblazeb2.com` |
| `S3_REGION` | no | default `us-east-1` |

Sin las 3 primeras -> respuesta `503 cloud_storage_not_configured`.

## Provider auto-detect
- Endpoint contiene `r2.cloudflarestorage.com` -> `r2`
- Endpoint contiene `backblazeb2.com` -> `b2`
- Resto / vacio -> `s3`

## SQL: db/R18_CLOUD_BACKUP.sql
Tabla `cloud_backups`:
- `id UUID PK`, `tenant_id UUID`, `type` (full/incremental), `size_bytes`, `location`, `status` (running/success/error), `started_at`, `completed_at`, `error`.
- Indices por tenant, fecha, status. RLS por tenant + bypass superadmin.

## Cliente
`public/volvix-cloud-backup-admin.js` -> expone `window.VolvixCloudBackup.render('#anchor')` con tabla, botones full/incremental, restore con confirm.

## Flujo
1. Admin pulsa "Backup completo".
2. Servidor inserta fila `running`, genera dump (manifiesto + metadata; en produccion conecta worker pg_dump contra replica), firma con Sig v4, sube via `https.request PUT`.
3. Marca fila `success` con `location` y `size_bytes` (o `error` con mensaje).
4. Restore: superadmin confirma, se encola job (worker ejecuta `psql`/`pg_restore` desde la URL).

## Seguridad
- Restore exige rol `superadmin` + `confirm: true`.
- RLS en `cloud_backups` evita lectura cross-tenant.
- 503 explicito cuando faltan secretos (no se intenta firma).
