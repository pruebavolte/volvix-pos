#!/usr/bin/env bash
# Volvix POS - Supabase Backup Script
# Requires: pg_dump (postgresql-client), gzip, env DATABASE_URL
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL no definida (Supabase connection string)}"

BACKUP_DIR="${BACKUP_DIR:-./dumps}"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
DUMP_FILE="${BACKUP_DIR}/volvix_${TIMESTAMP}.sql"
GZ_FILE="${DUMP_FILE}.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Iniciando dump $TIMESTAMP"
pg_dump \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --format=plain \
  --file="$DUMP_FILE" \
  "$DATABASE_URL"

echo "[backup] Comprimiendo..."
gzip -9 "$DUMP_FILE"

SIZE=$(du -h "$GZ_FILE" | cut -f1)
SHA=$(sha256sum "$GZ_FILE" | cut -d' ' -f1)

echo "[backup] OK: $GZ_FILE ($SIZE)"
echo "[backup] sha256: $SHA"

# Metadata
cat > "${GZ_FILE}.meta.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "file": "$(basename "$GZ_FILE")",
  "size": "$SIZE",
  "sha256": "$SHA",
  "tool": "pg_dump",
  "project": "volvix-pos"
}
EOF

echo "$GZ_FILE"
