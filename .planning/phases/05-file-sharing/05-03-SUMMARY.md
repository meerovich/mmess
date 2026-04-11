---
phase: 05-file-sharing
plan: "03"
subsystem: api
tags: [fastify, jwt, file-download, websocket, drizzle, access-control, streaming]

requires:
  - phase: 05-02
    provides: [POST /files endpoint, files table rows, storage.ts absolutePath, files.thumbnail_path, files.conversation_id]
  - phase: 05-01
    provides: [files table schema, sharp thumbnails, docker volume]

provides:
  - GET /files/:id endpoint (JWT-gated authenticated file download with 3-path access check)
  - GET /files/:id/thumb endpoint (JWT-gated WebP thumbnail, 404 when no thumbnail)
  - handleMessageSend extended with file_id validation and conversation_id locking

affects: [05-04, 06-ui-file-sharing, message:send callers]

tech-stack:
  added: []
  patterns:
    - checkFileAccess helper: uploader OR avatar_url exact string match OR conversation participant
    - reply.code(N).send({ error }) pattern for HTTP errors (consistent with existing routes)
    - db.transaction() for atomic message insert + files.conversation_id update (anti-reuse lock)
    - Streaming file delivery via createReadStream — no full-file buffering

key-files:
  created: []
  modified:
    - server/src/routes/files/index.ts
    - server/src/routes/ws/handlers/message.ts

key-decisions:
  - "reply.code(N).send({ error }) for download route 4xx — consistent with existing routes; httpErrors requires @fastify/sensible not installed"
  - "db cast as unknown as DB in GET routes — filesRoutes uses direct db import with full schema type; checkFileAccess takes DB generic; cast bridges the generic mismatch"
  - "void fileRecord at end of handleMessageSend — fileRecord assigned for type safety/validation path; suppress unused-var lint warning without removing the validation logic"

patterns-established:
  - "Access checks use three-path logic: uploader / avatar_url exact / conversation participant"
  - "File anti-reuse: conversation_id set atomically in same transaction as message insert"

requirements-completed: [FILE-01, FILE-04]

duration: 8min
completed: "2026-04-11"
---

# Phase 5 Plan 3: GET /files Download Endpoints + file_id in message:send Summary

**Authenticated file download (3-path access check) and WS message:send extended with file_id ownership/anti-reuse validation — completes two-step upload flow server side.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-11T15:47:00Z
- **Completed:** 2026-04-11T15:55:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `GET /api/files/:id` with `checkFileAccess` (uploader, avatar_url exact match, conversation participant) — streams file bytes with Content-Disposition, Content-Type, Cache-Control headers
- Added `GET /api/files/:id/thumb` returning WebP thumbnail bytes, 404 if no thumbnail_path stored
- Extended `handleMessageSend` payload: `content` optional, `file_id` optional; validates ownership and non-reuse; sets `files.conversation_id` atomically in the same transaction as message insert

## Task Commits

1. **Task 1: GET /files/:id and GET /files/:id/thumb download endpoints** - `8cca0c5` (feat)
2. **Task 2: Extend handleMessageSend with file_id validation** - `b48d7a3` (feat)

## Files Created/Modified

- `server/src/routes/files/index.ts` — added `checkFileAccess` helper + GET /:id and GET /:id/thumb routes; added imports for `createReadStream`, `existsSync`, `and/eq` (drizzle-orm), `messages`, `conversations`, `conversation_participants`, `absolutePath`
- `server/src/routes/ws/handlers/message.ts` — imported `files` from schema; payload `content` made optional, `file_id` added; file validation block (ownership + non-reuse); transaction updated to insert file_id and set files.conversation_id

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `reply.code(N).send({ error })` for download 4xx | Consistent with all existing routes; `fastify.httpErrors` requires `@fastify/sensible` which is not installed |
| `db as unknown as DB` cast in GET routes | `db` is imported with full schema type; `checkFileAccess` takes `PostgresJsDatabase<Record<string,never>>`; cast bridges the generic without changing behavior |
| `void fileRecord` after file validation | `fileRecord` assigned to hold inferred type, validation done inline; `void` suppresses unused-var warning cleanly |

## Deviations from Plan

None — plan executed exactly as written, with one adaptation:

The plan used `fastify.httpErrors.notFound()` / `fastify.httpErrors.forbidden()` but 05-02-SUMMARY documented that `@fastify/sensible` is not installed. Applied the `reply.code(N).send({ error })` pattern consistently (same as Task 1 auto-fix in 05-02). Counted as prior-known deviation, not a new deviation.

## Issues Encountered

None — TypeScript compiled clean on both tasks (`tsc --noEmit` exits 0).

## Known Stubs

None — all routes return real data from disk and database. No hardcoded values or placeholder responses.

## Next Phase Readiness

- `GET /api/files/:id` and `GET /api/files/:id/thumb` fully implemented and type-safe
- `message:send` WS handler accepts `file_id` with full ownership and anti-reuse guards
- Ready for plan 05-04 (client-side file attachment UI wiring)

## Self-Check: PASSED

Files verified:
- `server/src/routes/files/index.ts` — exists, has GET /:id and GET /:id/thumb with preHandler auth and checkFileAccess
- `server/src/routes/ws/handlers/message.ts` — exists, handleMessageSend has content?: string, file_id?: string, validation block, transaction sets files.conversation_id

Commits verified:
- `8cca0c5` — feat(05-03): add GET /files/:id and GET /files/:id/thumb download endpoints
- `b48d7a3` — feat(05-03): extend handleMessageSend to accept file_id with validation

---
*Phase: 05-file-sharing*
*Completed: 2026-04-11*
