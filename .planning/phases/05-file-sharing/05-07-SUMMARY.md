---
phase: 05-file-sharing
plan: 07
subsystem: api
tags: [websocket, drizzle, postgres, file-sharing, history]

requires:
  - phase: 05-file-sharing
    provides: File upload routes, files table with original_name/mimetype/size_bytes/thumbnail_path columns, file_id on messages

provides:
  - WS ack payload enriched with file_name, file_mime, file_size, is_image, thumbnail_url for sender
  - WS broadcast (message:new) enriched with same file metadata for all recipients
  - GET /api/conversations/:id/messages returns file metadata via LEFT JOIN on files table
  - FileCard and inline image thumbnails renderable for all participants including on page reload

affects: [05-file-sharing, ui-deploy, file-rendering]

tech-stack:
  added: []
  patterns:
    - "Enrich WS payload post-transaction using already-fetched domain record"
    - "LEFT JOIN on optional FK for nullable file metadata in paginated history query"

key-files:
  created: []
  modified:
    - server/src/routes/ws/handlers/message.ts
    - server/src/routes/conversations/messages.ts

key-decisions:
  - "Reuse already-fetched fileRecord instead of re-querying — zero extra DB round-trip for file metadata in WS flow"
  - "LEFT JOIN (not INNER JOIN) on files so text-only messages are not filtered out"

patterns-established:
  - "Pattern: post-transaction payload enrichment — build enrichedMessage spread after tx completes"
  - "Pattern: leftJoin + ?? null coercion for optional FK columns in Drizzle select"

requirements-completed: [FILE-01, FILE-02, FILE-04]

duration: 5min
completed: 2026-04-11
---

# Phase 05 Plan 07: WS Ack/Broadcast + History File Metadata (GAP-1 & GAP-2) Summary

**WS ack/broadcast and history endpoint now carry full file metadata (file_name, file_mime, file_size, is_image, thumbnail_url) so FileCard and inline image thumbnails render for all participants and survive page reload.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-11T17:00:04Z
- **Completed:** 2026-04-11T17:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- GAP-1 closed: WS `message:send` ack and `message:new` broadcast now include complete file metadata derived from the already-fetched `fileRecord` — zero extra DB queries
- GAP-2 closed: History endpoint joins the `files` table via LEFT JOIN, mapping `original_name`, `mimetype`, `size_bytes`, `thumbnail_path` to the client-expected field names
- `void fileRecord` suppression line removed — fileRecord is now genuinely used

## Task Commits

1. **Task 1: Enrich WS ack and broadcast with file metadata (GAP-1)** - `ae56c68` (feat)
2. **Task 2: Add LEFT JOIN on files to history endpoint (GAP-2)** - `e7b6b3c` (feat)

## Files Created/Modified

- `server/src/routes/ws/handlers/message.ts` - Build `enrichedMessage` spread with file metadata from `fileRecord`; send in ack and broadcast
- `server/src/routes/conversations/messages.ts` - Import `files`, add 5 file columns to select, add `.leftJoin(files, ...)`, map to `file_name/file_mime/file_size/is_image/thumbnail_url` in response

## Decisions Made

- Reused already-fetched `fileRecord` rather than re-querying — keeps the ack path at zero extra DB round-trips
- Used LEFT JOIN so text-only messages (file_id = null) are still returned and all file fields coerce to null via `?? null`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 05 (file sharing) gap closure complete — file attachments are now visible to all participants
- FileCard and inline image thumbnail rendering requires no further server changes
- Ready to proceed to Phase 06 (UI & Deploy) or final integration verification

---
*Phase: 05-file-sharing*
*Completed: 2026-04-11*
