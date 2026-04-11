#!/usr/bin/env bash
# backup.sh — backs up PostgreSQL and uploads to ./backups/
# Usage: ./scripts/backup.sh
# Retention: keeps last 7 backups of each type

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
DATE=$(date +%Y-%m-%d)
RETENTION=7

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup for $DATE..."

# ── 1. PostgreSQL dump ────────────────────────────────────────────────────────
DB_BACKUP="$BACKUP_DIR/db-$DATE.sql.gz"
echo "[backup] Dumping database to $DB_BACKUP"
docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-mmess}" "${POSTGRES_DB:-mmess}" \
  | gzip > "$DB_BACKUP"

# ── 2. Uploads volume archive ─────────────────────────────────────────────────
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$DATE.tar.gz"
echo "[backup] Archiving uploads to $UPLOADS_BACKUP"
docker run --rm \
  -v mmess_uploads:/data/uploads:ro \
  -v "$BACKUP_DIR":/backups \
  alpine:3 \
  tar czf "/backups/uploads-$DATE.tar.gz" -C /data uploads

# ── 3. Retention: keep last N of each type ────────────────────────────────────
echo "[backup] Pruning old backups (keeping last $RETENTION)..."
ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm --
ls -1t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +$((RETENTION + 1)) | xargs -r rm --

echo "[backup] Done. Backups in $BACKUP_DIR/"
ls -lh "$BACKUP_DIR/"
