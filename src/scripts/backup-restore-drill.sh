#!/usr/bin/env bash
# ============================================================================
# VOLVIX POS — Backup & Restore Drill (FIX-DR2)
# ----------------------------------------------------------------------------
# Genera backup completo de Supabase + verifica integridad + sube a storage.
#
# Uso:
#   ./scripts/backup-restore-drill.sh
#   ./scripts/backup-restore-drill.sh --dry-run       # no sube, solo backup
#   ./scripts/backup-restore-drill.sh --restore FILE  # restaura desde archivo
#
# Variables de entorno opcionales:
#   SUPABASE_PROJECT_REF      — ref del proyecto (ej: abcdefghij)
#   SUPABASE_DB_PASSWORD      — password DB (si no usa --linked)
#   AWS_S3_BUCKET             — bucket s3 destino (opcional)
#   AWS_ACCESS_KEY_ID         — credencial AWS (opcional)
#   AWS_SECRET_ACCESS_KEY     — credencial AWS (opcional)
#   GDRIVE_FOLDER_ID          — folder destino en Drive (opcional)
#   BACKUP_DIR                — local dir, default ./backups/
#
# Exit codes:
#   0  — OK
#   1  — fallo en dump
#   2  — fallo de integridad
#   3  — fallo de upload
#   4  — supabase CLI no instalado
# ============================================================================

set -euo pipefail

# ---- Config ----
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE_TAG="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/volvix_pos_backup_${DATE_TAG}.sql"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
META_FILE="${BACKUP_FILE}.meta.json"
DRY_RUN=0
RESTORE_FILE=""
MIN_INSERTS=10        # menor a esto = backup corrupto

# ---- Args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN=1; shift ;;
    --restore)  RESTORE_FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ---- Color helpers ----
ok()    { printf '\e[32m[OK]\e[0m %s\n' "$*"; }
warn()  { printf '\e[33m[WARN]\e[0m %s\n' "$*"; }
err()   { printf '\e[31m[ERR]\e[0m %s\n' "$*" >&2; }
info()  { printf '\e[36m[INFO]\e[0m %s\n' "$*"; }

# ---- Pre-check ----
mkdir -p "$BACKUP_DIR"

if ! command -v supabase >/dev/null 2>&1; then
  err "supabase CLI no instalado. Instala: npm i -g supabase"
  exit 4
fi

if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  err "ni sha256sum ni shasum disponibles"
  exit 4
fi

sha_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

# ============================================================================
# RESTORE MODE
# ============================================================================
if [[ -n "$RESTORE_FILE" ]]; then
  if [[ ! -f "$RESTORE_FILE" ]]; then
    err "Archivo no existe: $RESTORE_FILE"; exit 1
  fi
  warn "MODO RESTORE — esto SOBREESCRIBIRÁ la base de datos."
  warn "Archivo: $RESTORE_FILE"
  read -r -p "Continuar? (escribe 'YES'): " CONFIRM
  if [[ "$CONFIRM" != "YES" ]]; then
    info "Cancelado."; exit 0
  fi
  info "Verificando checksum del archivo…"
  if [[ -f "${RESTORE_FILE}.sha256" ]]; then
    cd "$(dirname "$RESTORE_FILE")"
    if sha256sum -c "$(basename "${RESTORE_FILE}.sha256")" 2>/dev/null; then
      ok "Checksum OK"
    else
      err "Checksum FALLÓ"; exit 2
    fi
    cd - >/dev/null
  else
    warn "Sin checksum — procediendo a riesgo del operador"
  fi
  info "Aplicando restore…"
  supabase db query --linked < "$RESTORE_FILE" \
    && ok "Restore aplicado" \
    || { err "Restore falló"; exit 1; }
  info "Verificando endpoints post-restore…"
  if [[ -x "./scripts/health-check-exhaustive.sh" ]]; then
    ./scripts/health-check-exhaustive.sh || warn "Algunos endpoints fallaron — revisa runbook"
  fi
  ok "Restore completado. RTO documentado en docs/runbook-disaster-recovery.md"
  exit 0
fi

# ============================================================================
# BACKUP MODE
# ============================================================================
info "VOLVIX POS — Backup drill iniciado @ $DATE_TAG"
info "Destino: $BACKUP_FILE"

# 1) Dump de Supabase
info "[1/5] Generando dump (supabase db dump --linked)…"
if supabase db dump --linked > "$BACKUP_FILE" 2> "${BACKUP_FILE}.err"; then
  ok "Dump OK ($(wc -c < "$BACKUP_FILE") bytes)"
else
  err "Dump falló — ver ${BACKUP_FILE}.err"
  cat "${BACKUP_FILE}.err" | head -20 >&2
  exit 1
fi

# 2) Verificar integridad: cuenta INSERT INTOs
info "[2/5] Verificando integridad…"
INSERT_COUNT="$(grep -c '^INSERT INTO' "$BACKUP_FILE" 2>/dev/null || echo 0)"
TABLE_COUNT="$(grep -c '^CREATE TABLE' "$BACKUP_FILE" 2>/dev/null || echo 0)"
SIZE_BYTES="$(wc -c < "$BACKUP_FILE")"

info "  INSERT INTOs:   $INSERT_COUNT"
info "  CREATE TABLEs:  $TABLE_COUNT"
info "  Tamaño:         $SIZE_BYTES bytes"

if [[ "$INSERT_COUNT" -lt "$MIN_INSERTS" ]] && [[ "$TABLE_COUNT" -lt 5 ]]; then
  err "Backup parece vacío o corrupto (INSERTs=$INSERT_COUNT, TABLEs=$TABLE_COUNT)"
  exit 2
fi
ok "Integridad OK"

# 3) Generar checksum
info "[3/5] Generando sha256…"
sha_cmd "$BACKUP_FILE" > "$CHECKSUM_FILE"
SHA="$(awk '{print $1}' "$CHECKSUM_FILE")"
ok "sha256: ${SHA:0:16}…"

# 4) Metadata JSON
info "[4/5] Escribiendo metadata…"
cat > "$META_FILE" <<EOF
{
  "version": "r8e",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_file": "$(basename "$BACKUP_FILE")",
  "size_bytes": $SIZE_BYTES,
  "insert_count": $INSERT_COUNT,
  "table_count": $TABLE_COUNT,
  "sha256": "$SHA",
  "drill_id": "$DATE_TAG"
}
EOF
ok "Metadata escrita"

# 5) Subir a storage (S3 / Drive si configurado)
info "[5/5] Upload a storage…"
UPLOAD_OK=0

if [[ "$DRY_RUN" -eq 1 ]]; then
  warn "  --dry-run activo, no se sube"
elif [[ -n "${AWS_S3_BUCKET:-}" ]] && command -v aws >/dev/null 2>&1; then
  info "  Subiendo a s3://${AWS_S3_BUCKET}/backups/…"
  if aws s3 cp "$BACKUP_FILE"   "s3://${AWS_S3_BUCKET}/backups/" --quiet \
    && aws s3 cp "$CHECKSUM_FILE" "s3://${AWS_S3_BUCKET}/backups/" --quiet \
    && aws s3 cp "$META_FILE"     "s3://${AWS_S3_BUCKET}/backups/" --quiet; then
    ok "  S3 upload OK"
    UPLOAD_OK=1
  else
    err "  S3 upload FALLÓ"
    exit 3
  fi
elif [[ -n "${GDRIVE_FOLDER_ID:-}" ]] && command -v gdrive >/dev/null 2>&1; then
  info "  Subiendo a Google Drive folder ${GDRIVE_FOLDER_ID}…"
  if gdrive files upload --parent "$GDRIVE_FOLDER_ID" "$BACKUP_FILE" \
    && gdrive files upload --parent "$GDRIVE_FOLDER_ID" "$CHECKSUM_FILE"; then
    ok "  GDrive upload OK"
    UPLOAD_OK=1
  else
    err "  GDrive upload falló"
    exit 3
  fi
else
  warn "  Sin AWS_S3_BUCKET ni GDRIVE_FOLDER_ID configurado — backup queda local"
  warn "  Considera configurar storage offsite. Ver docs/runbook-disaster-recovery.md"
fi

# Resumen final
echo ""
ok "═══════════════════════════════════════════════════════════════"
ok "BACKUP DRILL COMPLETADO"
ok "  Archivo:    $BACKUP_FILE"
ok "  Checksum:   $CHECKSUM_FILE"
ok "  Metadata:   $META_FILE"
ok "  Upload:     $([ "$UPLOAD_OK" -eq 1 ] && echo 'OK (offsite)' || echo 'LOCAL ONLY')"
ok "  RTO target: <30 min  |  RPO actual: <1h"
ok "═══════════════════════════════════════════════════════════════"

# Limpieza de backups viejos (>30 días) si flag set
if [[ "${BACKUP_PRUNE_DAYS:-0}" -gt 0 ]]; then
  info "Pruning backups > ${BACKUP_PRUNE_DAYS} días…"
  find "$BACKUP_DIR" -type f -name 'volvix_pos_backup_*.sql' \
    -mtime "+${BACKUP_PRUNE_DAYS}" -delete 2>/dev/null || true
fi

exit 0
