---
phase: 05-file-sharing
plan: "01"
subsystem: infrastructure
tags: [schema, migration, sharp, file-type, caddy, docker, devops]
dependency_graph:
  requires: []
  provides: [files.thumbnail_path, files.conversation_id, messages.file_id-FK, sharp-pkg, file-type-pkg, caddy-file-routing, dev-node-modules-volume]
  affects: [server/src/db/schema.ts, Caddyfile, docker-compose.yml, docker-compose.dev.yml]
tech_stack:
  added: [sharp@0.34.5, file-type@22.0.1]
  patterns: [drizzle-kit generate migration, caddy request_body max_size, docker named volume for node_modules]
key_files:
  created: [server/drizzle/0003_curly_saracen.sql, server/drizzle/meta/0003_snapshot.json]
  modified: [server/src/db/schema.ts, server/package.json, Caddyfile, docker-compose.yml, docker-compose.dev.yml, package-lock.json]
decisions:
  - Files served through Fastify (JWT-gated), not statically by Caddy — removes /uploads/* Caddy block
  - Caddy /api/files* before /api/* — Caddy evaluates handles in definition order (more specific first)
  - Named mmess_node_modules volume shadows host bind-mount — prevents sharp musl/glibc binary mismatch in Alpine container
  - messages.file_id FK uses lazy arrow fn () => files.id — Drizzle forward-reference for circular schema order safety
metrics:
  duration_minutes: 3
  completed_date: "2026-04-11"
  tasks_completed: 2
  files_changed: 7
---

# Phase 5 Plan 1: Schema Extensions + Package Installs + Infrastructure Summary

**One-liner:** Extended files table with thumbnail_path/conversation_id columns, added formal FK on messages.file_id, installed sharp + file-type, restructured Caddyfile to route /api/files* through Fastify with 25MB body limit, and fixed Docker dev compose to prevent sharp binary mismatch via named node_modules volume.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install sharp + file-type; extend schema.ts | 36fa367 | server/package.json, server/src/db/schema.ts, server/drizzle/0003_curly_saracen.sql |
| 2 | Restructure Caddyfile and fix Docker Compose volumes | 5766c82 | Caddyfile, docker-compose.yml, docker-compose.dev.yml |

## What Was Built

### Schema Changes (server/src/db/schema.ts)

1. **files table — two new columns:**
   - `thumbnail_path: text('thumbnail_path')` — nullable, null for non-images (D-12)
   - `conversation_id: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' })` — nullable FK, set when file is attached to a message (D-06)

2. **messages.file_id — formal FK added:**
   - Was: `file_id: uuid('file_id'), // references files.id — set after files table` (comment only, no FK)
   - Now: `file_id: uuid('file_id').references(() => files.id, { onDelete: 'set null' })` (enforced FK constraint)
   - Uses lazy arrow function `() => files.id` — Drizzle forward-reference handles schema ordering

3. **Migration generated:** `server/drizzle/0003_curly_saracen.sql` adds the two columns and two FK constraints via `ALTER TABLE`.

### Packages Installed

- `sharp@^0.34.5` — image resizing/thumbnail generation for uploaded images
- `file-type@^22.0.1` — MIME type detection from file buffer (security: don't trust Content-Type header)

Both added to `server/package.json` dependencies (not root or client).

### Caddyfile Restructure

Block order is now:
1. `handle /ws*` — WebSocket proxy (unchanged)
2. `handle /api/files*` — **NEW**: enforces 25MB request body limit, then strips /api prefix and proxies to api:3000
3. `handle /api/*` — general API proxy (unchanged)
4. `handle` — SPA fallback (unchanged)

The `/uploads/*` block (which served files directly from the Docker volume) was **removed**. Files are now served through the Fastify API (JWT-gated), not publicly accessible via Caddy.

### Docker Compose Fixes

**docker-compose.yml:**
- Removed `mmess_uploads:/data/uploads:ro` from caddy service volumes
- `api` service still has `mmess_uploads:/data/uploads` for writing files

**docker-compose.dev.yml:**
- Removed `mmess_uploads_dev:/data/uploads:ro` from caddy service volumes
- Added `mmess_node_modules:/app/node_modules` to api service — shadows the host bind-mount's node_modules with a container-native volume, preventing sharp's pre-built Alpine binary from being replaced by the host's Windows/glibc binary
- Added `mmess_node_modules` to top-level volumes section

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Files routed through Fastify, not Caddy static | JWT auth gate on file downloads — unauthorized users cannot access files |
| /api/files* block placed before /api/* | Caddy evaluates `handle` blocks in order; more-specific path must come first |
| Named node_modules volume in dev compose | Prevents sharp musl/glibc mismatch: Alpine container needs musl binary, Windows host provides glibc binary |
| Lazy arrow fn for messages.file_id FK | Forward reference in Drizzle: files table defined after messages; arrow fn defers resolution |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan is infrastructure only (no UI or data flow stubs).

## Self-Check: PASSED

Files verified:
- `server/src/db/schema.ts` — contains thumbnail_path and conversation_id
- `server/package.json` — contains sharp and file-type
- `Caddyfile` — /api/files* block before /api/*; no /uploads/* block
- `docker-compose.yml` — caddy service has no mmess_uploads mount
- `docker-compose.dev.yml` — mmess_node_modules in api volumes and top-level volumes
- `server/drizzle/0003_curly_saracen.sql` — migration adds thumbnail_path, conversation_id, FKs

Commits verified:
- 36fa367 — feat(05-01): install sharp + file-type; extend schema
- 5766c82 — chore(05-01): restructure Caddyfile routing; fix Docker Compose volumes
