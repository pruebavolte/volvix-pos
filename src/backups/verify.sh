#!/usr/bin/env bash
# Volvix POS - Verifica integridad del último dump
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./dumps}"
LATEST=$(ls -t "$BACKUP_DIR"/volvix_*.sql.gz 2>/dev/null | head -n1 || true)

if [ -z "$LATEST" ]; then
  echo "[verify] ERROR: no hay dumps en $BACKUP_DIR" >&2
  exit 1
fi

echo "[verify] Último dump: $LATEST"

# 1. gzip integrity
gzip -t "$LATEST" && echo "[verify] gzip OK"

# 2. Tamaño
SIZE=$(stat -c%s "$LATEST" 2>/dev/null || stat -f%z "$LATEST")
echo "[verify] tamaño: $SIZE bytes"
[ "$SIZE" -gt 1024 ] || { echo "[verify] ERROR: dump < 1KB"; exit 1; }

# 3. Conteo CREATE TABLE
TABLES=$(gunzip -c "$LATEST" | grep -c "^CREATE TABLE" || true)
echo "[verify] CREATE TABLE: $TABLES"
[ "$TABLES" -gt 0 ] || { echo "[verify] ERROR: 0 tablas"; exit 1; }

# 4. Conteo COPY (data rows blocks)
COPIES=$(gunzip -c "$LATEST" | grep -c "^COPY " || true)
echo "[verify] COPY blocks: $COPIES"

# 5. SHA256 vs meta
if [ -f "${LATEST}.meta.json" ]; then
  EXPECTED=$(grep -oE '"sha256": "[a-f0-9]+"' "${LATEST}.meta.json" | cut -d'"' -f4)
  ACTUAL=$(sha256sum "$LATEST" | cut -d' ' -f1)
  if [ "$EXPECTED" = "$ACTUAL" ]; then
    echo "[verify] sha256 OK"
  else
    echo "[verify] ERROR sha256 mismatch"; exit 1
  fi
fi

echo "[verify] OK - dump válido"
