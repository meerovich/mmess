#!/usr/bin/env bash
# restore.sh — restores PostgreSQL and uploads from a dated backup
# Usage: ./scripts/restore.sh YYYY-MM-DD
# Example: ./scripts/restore.sh 2026-04-11

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 YYYY-MM-DD"
  exit 1
fi

DATE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
DB_BACKUP="$BACKUP_DIR/db-$DATE.sql.gz"
UPLOADS_BACKUP="$BACKUP_DIR/uploads-$DATE.tar.gz"

# Validate inputs
if [[ ! -f "$DB_BACKUP" ]]; then
  echo "[restore] ERROR: Database backup not found: $DB_BACKUP"
  exit 1
fi
if [[ ! -f "$UPLOADS_BACKUP" ]]; then
  echo "[restore] ERROR: Uploads backup not found: $UPLOADS_BACKUP"
  exit 1
fi

echo "[restore] WARNING: This will REPLACE the current database and uploads with the $DATE backup."
read -r -p "Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "[restore] Aborted."
  exit 0
fi

# ── 1. Restore PostgreSQL ─────────────────────────────────────────────────────
echo "[restore] Restoring database from $DB_BACKUP..."
gunzip -c "$DB_BACKUP" | docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
  psql -U "${POSTGRES_USER:-mmess}" -d "${POSTGRES_DB:-mmess}" \
  --single-transaction -v ON_ERROR_STOP=1

# ── 2. Restore uploads volume ─────────────────────────────────────────────────
echo "[restore] Restoring uploads from $UPLOADS_BACKUP..."
docker run --rm \
  -v mmess_uploads:/data/uploads \
  -v "$BACKUP_DIR":/backups:ro \
  alpine:3 \
  sh -c "rm -rf /data/uploads/* && tar xzf /backups/uploads-$DATE.tar.gz -C /data"

echo "[restore] Restore complete. Restart services to apply:"
echo "  docker compose restart api"
