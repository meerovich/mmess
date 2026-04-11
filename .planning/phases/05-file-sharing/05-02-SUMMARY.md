---
phase: 05-file-sharing
plan: "02"
subsystem: api
tags: [multipart, file-upload, sharp, file-type, fastify, stream, validation]

requires:
  - phase: 05-01
    provides: [sharp-pkg, file-type-pkg, files.thumbnail_path, files.conversation_id, caddy-file-routing]

provides:
  - POST /files endpoint (multipart upload → UploadedFileResponse)
  - server/src/lib/upload/storage.ts (getUploadPath, ensureUploadDir, absolutePath, thumbnailPath, thumbnailRelativePath)
  - server/src/lib/upload/validate.ts (validateMime, BLOCKED_EXTENSIONS, BLOCKED_MIMES)
  - server/src/lib/upload/thumbnail.ts (generateThumbnail)
  - server/src/routes/files/index.ts (filesRoutes Fastify plugin)

affects: [05-03, 05-04, message:send file attachment flow]

tech-stack:
  added: []
  patterns:
    - Scoped @fastify/multipart registration (inside plugin, not global) to avoid conflicts
    - Stream-to-disk via pipeline() to avoid buffering 25MB in memory
    - Post-pipeline truncation check + cleanup on oversized files
    - Magic-byte MIME detection after streaming (reads first 4100 bytes from saved file)
    - Best-effort thumbnail generation (failure does not fail the request)
    - reply.code(N).send({ error }) for HTTP errors (consistent with existing routes)

key-files:
  created:
    - server/src/lib/upload/storage.ts
    - server/src/lib/upload/validate.ts
    - server/src/lib/upload/thumbnail.ts
    - server/src/routes/files/index.ts
  modified:
    - server/src/index.ts

key-decisions:
  - "reply.code(N).send({ error }) instead of fastify.httpErrors — consistent with existing route error pattern; httpErrors requires @fastify/sensible which is not installed"
  - "4xx/5xx wildcard response schemas added to satisfy Fastify TypeScript generic constraints when using non-200 reply.code()"
  - "Direct db import from db/index.ts — consistent with all existing routes (no fastify.db decorator)"

patterns-established:
  - "Upload helper modules live in server/src/lib/upload/ — storage, validate, thumbnail are separate concerns"
  - "Files are stream-written to disk before any validation — truncation guard runs after pipeline completes"

requirements-completed: [FILE-01, FILE-02]

duration: 10min
completed: "2026-04-11"
---

# Phase 5 Plan 2: POST /files Upload Endpoint Summary

**Multipart file upload API with streaming pipeline, magic-byte MIME validation, date-sharded UUID storage, and best-effort sharp thumbnail generation.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-11T15:48:33Z
- **Completed:** 2026-04-11T15:58:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created three upload helper modules (`storage.ts`, `validate.ts`, `thumbnail.ts`) as separate concerns under `server/src/lib/upload/`
- Implemented `POST /files` Fastify route with scoped `@fastify/multipart`, stream-to-disk pipeline, truncation guard, MIME validation, thumbnail generation, and DB insert
- Wired `filesRoutes` into `server/src/index.ts` at prefix `/files`; TypeScript compiles clean (`tsc --noEmit` exits 0)

## Task Commits

1. **Task 1: Upload helper modules (storage, validate, thumbnail)** - `909e047` (feat)
2. **Task 2: POST /files route and wire into server** - `30732d8` (feat)

## Files Created/Modified

- `server/src/lib/upload/storage.ts` — date-sharded UUID path generation, path traversal guard, thumbnail path helpers
- `server/src/lib/upload/validate.ts` — magic-byte MIME detection via `file-type`, extension + MIME blocklists
- `server/src/lib/upload/thumbnail.ts` — sharp 640×640 WebP thumbnail, best-effort (failure returns null)
- `server/src/routes/files/index.ts` — POST / Fastify handler: multipart stream, truncation guard, MIME validation, DB insert
- `server/src/index.ts` — added `filesRoutes` import and `app.register(filesRoutes, { prefix: '/files' })`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `reply.code(N).send({ error })` for HTTP errors | Consistent with all existing routes; `fastify.httpErrors` requires `@fastify/sensible` which is not installed |
| 4xx/5xx wildcard response schemas | Required to satisfy Fastify TypeScript generic constraints when replying with non-200 codes within a typed schema |
| Direct `db` import from `db/index.ts` | All existing routes use this pattern — no `fastify.db` decorator |
| Scoped `@fastify/multipart` registration | Registered inside `filesRoutes` plugin, not globally, to avoid conflicts with other routes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced `fastify.httpErrors.*` with `reply.code(N).send({ error })`**
- **Found during:** Task 2 (POST /files route)
- **Issue:** Plan's code used `fastify.httpErrors.badRequest()` / `fastify.httpErrors.payloadTooLarge()` which require `@fastify/sensible` — not installed. TypeScript error: `Property 'httpErrors' does not exist on type 'FastifyInstance'`
- **Fix:** Replaced all three error throw sites with `return reply.code(N).send({ error: '...' })` matching the established pattern in all existing routes; added `4xx`/`5xx` wildcard response schemas to satisfy TypeScript generics
- **Files modified:** `server/src/routes/files/index.ts`
- **Verification:** `tsc --noEmit` exits 0
- **Committed in:** `30732d8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix for missing dependency incompatibility)
**Impact on plan:** Required for TypeScript compilation. No functional scope change — error responses are identical in behavior.

## Issues Encountered

None beyond the httpErrors deviation above.

## Known Stubs

None — no UI, no hardcoded data. The route writes real files to disk and inserts real rows. `conversation_id` is intentionally NULL (set on `message:send` per D-19, tracked in plan 05-03).

## Next Phase Readiness

- `POST /api/files` is fully implemented and type-safe
- Ready for plan 05-03 (`GET /api/files/:id` download + thumbnail endpoint)
- Ready for plan 05-04 (wire `file_id` into `message:send` WebSocket handler)

## Self-Check: PASSED

Files verified:
- `server/src/lib/upload/storage.ts` — exists, exports getUploadPath, ensureUploadDir, absolutePath, thumbnailPath, thumbnailRelativePath
- `server/src/lib/upload/validate.ts` — exists, exports validateMime, BLOCKED_EXTENSIONS, BLOCKED_MIMES
- `server/src/lib/upload/thumbnail.ts` — exists, exports generateThumbnail
- `server/src/routes/files/index.ts` — exists, scoped multipart, POST / handler, auth preHandler, rate limit config
- `server/src/index.ts` — filesRoutes imported and registered at prefix '/files'

Commits verified:
- `909e047` — feat(05-02): add upload helper modules
- `30732d8` — feat(05-02): POST /files route with multipart upload, validation, thumbnail

---
*Phase: 05-file-sharing*
*Completed: 2026-04-11*
