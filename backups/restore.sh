#!/usr/bin/env bash
# Volvix POS - Restore desde dump
# Uso: DATABASE_URL=... ./restore.sh <archivo.sql.gz>
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL no definida}"

DUMP="${1:?Uso: restore.sh <archivo.sql.gz>}"
[ -f "$DUMP" ] || { echo "No existe: $DUMP" >&2; exit 1; }

echo "[restore] ATENCION: vas a restaurar sobre $DATABASE_URL"
echo "[restore] Archivo: $DUMP"
read -r -p "Escribe 'CONFIRMAR' para continuar: " CONFIRM
[ "$CONFIRM" = "CONFIRMAR" ] || { echo "Cancelado"; exit 1; }

echo "[restore] Aplicando dump..."
gunzip -c "$DUMP" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1

echo "[restore] OK"
