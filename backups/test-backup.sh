#!/usr/bin/env bash
# Volvix POS - Test local del sistema de backup SIN pg_dump real.
# Genera un dump fake con echo, comprime, calcula sha256 y ejecuta verify.sh.
# Uso: ./backups/test-backup.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${HERE}/dumps}"
TIMESTAMP=$(date -u +%Y%m%d_%H%M%SZ)
DUMP_FILE="${BACKUP_DIR}/volvix_${TIMESTAMP}.sql"
GZ_FILE="${DUMP_FILE}.gz"

mkdir -p "$BACKUP_DIR"

echo "[test-backup] Generando dump fake $TIMESTAMP"
cat > "$DUMP_FILE" <<'SQL'
-- Fake dump for local test (no pg_dump required)
SET statement_timeout = 0;
SET client_encoding = 'UTF8';

CREATE TABLE "public"."tenants" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL
);

CREATE TABLE "public"."products" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid,
  "sku" text,
  "price" numeric
);

CREATE TABLE "public"."sales" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid,
  "total" numeric,
  "created_at" timestamptz
);

COPY "public"."tenants" ("id","name") FROM stdin;
00000000-0000-0000-0000-000000000001	Volvix Demo
\.

COPY "public"."products" ("id","tenant_id","sku","price") FROM stdin;
11111111-1111-1111-1111-111111111111	00000000-0000-0000-0000-000000000001	SKU-001	19.99
\.
SQL

# Pad para asegurar > 1KB tras compresión
for i in $(seq 1 50); do
  echo "-- pad line $i $(date -u +%s%N)" >> "$DUMP_FILE"
done

echo "[test-backup] Comprimiendo..."
gzip -9 -f "$DUMP_FILE"

SIZE=$(du -h "$GZ_FILE" | cut -f1)
SHA=$(sha256sum "$GZ_FILE" | cut -d' ' -f1)

echo "[test-backup] OK fake dump: $GZ_FILE ($SIZE)"
echo "[test-backup] sha256: $SHA"

cat > "${GZ_FILE}.meta.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "file": "$(basename "$GZ_FILE")",
  "size": "$SIZE",
  "sha256": "$SHA",
  "tool": "fake-test",
  "project": "volvix-pos"
}
EOF

echo "[test-backup] Ejecutando verify.sh..."
BACKUP_DIR="$BACKUP_DIR" "${HERE}/verify.sh"

echo "[test-backup] PASS: backup pipeline (fake) verificado"
