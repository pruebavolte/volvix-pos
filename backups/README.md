# Volvix POS — Sistema de Backups Supabase

Backups automatizados de la base PostgreSQL de Supabase para Volvix POS.

## Componentes

| Archivo | Función |
|---|---|
| `backup.sh` | Crea dump SQL comprimido con timestamp UTC |
| `restore.sh` | Restaura un dump (pide confirmación) |
| `verify.sh` | Valida integridad del último dump |
| `.github/workflows/daily_backup.yml` | Backup automático diario 03:00 UTC + retención 30d |
| `/api/admin/backup/trigger` | Endpoint admin: consulta último backup |

## Requisitos

- `pg_dump` / `psql` v15+ (se instala automáticamente en GitHub Actions)
- Variable de entorno `DATABASE_URL` con connection string de Supabase:
  ```
  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
  ```
  Obtenla en: Supabase Dashboard → Project Settings → Database → Connection string (URI).

## Setup GitHub Action

1. Mover el contenido de `backups/.github/workflows/` a `.github/workflows/` en la raíz del repo.
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DATABASE_URL` = connection string completa.
3. El workflow usa `GITHUB_TOKEN` (automático) para crear releases.
4. Verificar en **Actions** que `Daily Supabase Backup` aparece. Disparar manualmente con **Run workflow** la primera vez.

## Uso local

```bash
export DATABASE_URL="postgresql://..."
./backups/backup.sh           # genera dumps/volvix_YYYYMMDD_HHMMSSZ.sql.gz
./backups/verify.sh           # valida el último
./backups/restore.sh dumps/volvix_20260426_030000Z.sql.gz
```

## Endpoint admin

`GET /api/admin/backup/trigger` con header:
- `Authorization: Bearer <ADMIN_TOKEN>`, **o**
- `x-user-role: admin`

Variables de entorno requeridas en el servidor:
- `GH_OWNER` (default `GrupoVolvix`)
- `GH_REPO` (default `volvix-pos`)
- `GH_TOKEN` (PAT con permiso `repo` para repos privados)
- `ADMIN_TOKEN` (token compartido para auth simple)

Respuesta:
```json
{
  "ok": true,
  "latest_backup": {
    "tag": "backup-20260426-030012",
    "timestamp": "2026-04-26T03:00:12Z",
    "url": "https://github.com/.../releases/tag/backup-...",
    "asset": { "name": "volvix_20260426_030012Z.sql.gz", "size": 12345678 }
  }
}
```

## Retención

GitHub Releases con prefijo `Backup ` y antigüedad > 30 días se borran automáticamente al final de cada corrida.

## Recuperación de desastres

1. Crear nuevo proyecto Supabase (o resetear el actual).
2. Descargar último release: `gh release download backup-XXXX -p '*.sql.gz'`.
3. `./restore.sh volvix_YYYYMMDD.sql.gz`
4. Validar con queries de smoke test (conteo de tablas críticas: `tenants`, `products`, `sales`).

## Notas de seguridad

- El dump contiene datos PII de clientes. NUNCA subir como release público — el repo debe ser privado.
- Rotar `SUPABASE_DATABASE_URL` si se compromete.
- `restore.sh` usa `--clean --if-exists`: borra y recrea objetos. NO ejecutar en producción sin coordinación.
