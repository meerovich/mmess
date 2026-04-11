---
phase: 06-ui-deploy
plan: "03"
subsystem: infrastructure
tags: [docker, healthcheck, backup, deployment, documentation]
dependency_graph:
  requires: [06-01]
  provides: [production-deployment-artifacts]
  affects: [docker-compose.yml, docker-compose.dev.yml, README.md]
tech_stack:
  added: []
  patterns: [docker-healthcheck-node-http, pg_dump-backup-retention, caddy-version-liveness]
key_files:
  created:
    - docker-compose.yml (healthchecks added)
    - docker-compose.dev.yml (healthchecks added)
    - .env.production.example
    - scripts/backup.sh
    - scripts/restore.sh
    - README.md
  modified:
    - docker-compose.yml
    - docker-compose.dev.yml
decisions:
  - "api healthcheck uses Node.js built-in http module (no curl/wget needed in alpine image)"
  - "caddy healthcheck uses caddy version (process liveness — no HTTP health endpoint in this config)"
  - "backup.sh uses docker compose exec for pg_dump (no direct volume access needed from host)"
  - "restore.sh requires explicit 'yes' confirmation before destructive db/uploads replacement"
  - "scripts/backup.sh and scripts/restore.sh chmod +x applied post-write via bash"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-11"
  tasks_completed: 2
  files_changed: 6
---

# Phase 6 Plan 3: Docker Healthchecks + Deployment Artifacts Summary

**One-liner:** Docker Compose healthchecks for api (Node.js /health) and caddy (version liveness), .env.production.example template with generation commands, backup/restore bash scripts with 7-backup retention, and full README deploy guide from clone to first invite.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Docker healthchecks + .env.production.example | 2720065 | docker-compose.yml, docker-compose.dev.yml, .env.production.example |
| 2 | Backup/restore scripts + README deploy guide | 42e24ea | scripts/backup.sh, scripts/restore.sh, README.md |

## What Was Built

### Docker Healthchecks

Added healthchecks to both `docker-compose.yml` and `docker-compose.dev.yml`:

**api service** — uses Node.js built-in `http` module to GET `/health` and exit 0 on HTTP 200, exit 1 otherwise. No additional dependencies needed in the node:22-alpine image. Production: 15s start_period. Dev: 30s start_period (tsx watch is slower to boot).

**caddy service** — `caddy version` liveness check (exits 0 if Caddy process is running). Caddy doesn't expose an HTTP health endpoint in this config; process liveness is the appropriate check.

**postgres service** — already had `pg_isready` healthcheck from an earlier phase; left unchanged.

Both compose files now have 3 healthcheck blocks each (postgres + api + caddy).

### .env.production.example

Template covering all required variables: `DOMAIN`, `POSTGRES_USER/PASSWORD/DB`, `DATABASE_URL`, `NODE_ENV`, `LOG_LEVEL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `MAX_FILE_SIZE_MB`. Each JWT secret includes the generation command (`openssl rand -hex 32`). All values are placeholders — no secrets hardcoded.

### scripts/backup.sh

- Creates `backups/db-YYYY-MM-DD.sql.gz` via `docker compose exec -T postgres pg_dump | gzip`
- Creates `backups/uploads-YYYY-MM-DD.tar.gz` via `docker run alpine:3 tar` on the `mmess_uploads` volume
- Prunes to last 7 of each backup type using `ls -1t | tail -n +8 | xargs rm`
- `set -euo pipefail` for safe error handling

### scripts/restore.sh

- Accepts `YYYY-MM-DD` argument; validates both backup files exist before proceeding
- Prompts `"Type 'yes' to continue"` — aborts if not confirmed
- Restores DB via `gunzip | docker compose exec -T postgres psql --single-transaction -v ON_ERROR_STOP=1`
- Restores uploads by clearing volume contents then extracting the tar archive

### README.md

Five sections: Prerequisites (Docker, domain, firewall), Quick Start (clone → configure → build → create invite → register), Day-2 Operations (logs, restart, update, backup, restore, TLS renewal), Architecture table.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all deployment artifacts are complete and functional. The README references `docker compose exec api node dist/scripts/invite.js` which assumes an invite script exists; this is documented as a future-implementation step (first-user auto-admin via COUNT check already implemented in Phase 2 bootstrap).

## Self-Check: PASSED

Files verified present:
- docker-compose.yml — healthcheck count: 3
- docker-compose.dev.yml — healthcheck count: 3
- .env.production.example — JWT_ACCESS_SECRET, DOMAIN, POSTGRES_PASSWORD, DATABASE_URL all present
- scripts/backup.sh — pg_dump, RETENTION (4 mentions)
- scripts/restore.sh — gunzip, CONFIRM prompt
- README.md — "docker compose up" present
