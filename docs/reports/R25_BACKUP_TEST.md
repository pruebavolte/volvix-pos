# R25 — Backup System Test

Fecha: 2026-04-27
Path base: `C:\Users\DELL\Downloads\verion 340`

## 1. Sintaxis `backups/backup.sh`
- Comando: `bash -n backups/backup.sh`
- Resultado: EXIT=0 → **OK**

## 2. Workflow `backups/.github/workflows/daily_backup.yml`
- Parser: `node + js-yaml` (instalado temporalmente con `npm install --no-save js-yaml`).
- Top-level keys: `name, on, permissions, jobs`
- Jobs: `backup`
- Resultado: **YAML válido**.
- Nota: existe duplicado en `.github/workflows/daily-backup.yml` (raíz). Conservar uno, no ambos.

## 3. `GET /api/admin/backup/list`
- Servidor local no estaba corriendo (curl → 000). Verificación estática en `api/index.js:6922`:
  - `requireAuth` con roles admin/owner/superadmin.
  - Si `_s3Configured()` falso → `503 cloud_storage_not_configured`.
  - Si configurado → array de objetos S3 (vacío permitido). **Lógica correcta**.

## 4. `POST /api/admin/backup/cloud`
- Verificación estática en `api/index.js:6871`:
  - `503 {error:'cloud_storage_not_configured', missing:['AWS_ACCESS_KEY','AWS_SECRET','S3_BUCKET']}` cuando faltan vars.
  - `202 {job_id}` con `crypto.randomUUID()` cuando configurado.
- `.env.example` confirma vars vacías por default → 503 esperado en dev. **OK**.

## 5. `backups/manual-backup.js`
- Creado. `node -c` → EXIT=0.
- Carga `.env.local`/`.env`/`.env.production` sin dotenv.
- Intenta Management API `/v1/projects/{ref}/database/backups` con `SUPABASE_PAT`.
- Fallback: PostgREST (`SUPABASE_SERVICE_KEY`) sobre `pos_users, pos_products, pos_sales, customers` → genera `INSERT ... ON CONFLICT DO NOTHING`.
- Output: `backups/snapshots/YYYY-MM-DD.sql.gz` (gzip in-process). Directorio creado.

## Pendientes / Recomendaciones
- Configurar `SUPABASE_PAT` + `SUPABASE_PROJECT_REF` en `.env.local` para activar Management API.
- Probar `node backups/manual-backup.js` con credenciales reales.
- Resolver duplicado de workflows daily-backup.
