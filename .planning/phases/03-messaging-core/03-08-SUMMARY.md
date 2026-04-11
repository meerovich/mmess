---
phase: 03-messaging-core
plan: "08"
subsystem: server-rest + client-types
tags: [rest, reply-to, read-receipts, type-extensions, gap-closure]
dependency_graph:
  requires: []
  provides: [reply_to.sender, participant.last_read_message_id, participant.last_read_at]
  affects: [03-09]
tech_stack:
  added: []
  patterns: [drizzle-innerJoin, sql-array-any, optional-ts-fields]
key_files:
  created: []
  modified:
    - server/src/routes/conversations/messages.ts
    - server/src/routes/conversations/index.ts
    - client/src/types/chat.ts
decisions:
  - "ReplyTo.sender is optional (?) to keep WS message:new broadcasts compatible — raw DB rows lack the join"
  - "Participant read fields are optional (?) to avoid breaking optimistic conversation creation paths"
  - "last_read_at derived from last_read_message_id.created_at rather than message_reads.read_at to avoid extra join complexity"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-11"
  tasks_completed: 3
  files_modified: 3
requirements:
  - MSG-05
  - MSG-09
---

# Phase 03 Plan 08: REST Contract Extensions + Client Types Summary

REST response enrichment for reply sender names and read-receipt participant fields; zero WS changes required.

## What Was Built

Two server REST endpoint extensions and one client type update to close gaps identified in 03-VERIFICATION.md.

### Task 1: messages.ts — reply_to sender join

The `GET /api/conversations/:id/messages` endpoint's `replyToMap` build now performs an `innerJoin` with the `users` table on `sender_id` when fetching replied-to messages. Each reply_to object in the response now includes `sender: { id, username }`.

- **Before:** `reply_to: { id, sender_id, content }` — ReplyPreview always showed "Unknown"
- **After:** `reply_to: { id, sender_id, content, sender: { id, username } }`

### Task 2: index.ts — participants enrichment

The `GET /api/conversations` endpoint's `allParticipants` query now SELECTs `is_admin`, `can_edit_messages`, and `last_read_message_id` from `conversation_participants`. A follow-up query fetches `created_at` for each participant's `last_read_message_id` and populates `last_read_at` as an ISO string.

- **Before:** participants had only `{ user_id, username, avatar_url }`
- **After:** participants include `is_admin`, `can_edit_messages`, `last_read_message_id`, `last_read_at`

### Task 3: chat.ts — type extensions

- `ReplyTo.sender` added as optional `{ id: string; username: string }` — optional to stay backward-compatible with WS raw rows
- `Participant.last_read_message_id` added as optional `string | null`
- `Participant.last_read_at` added as optional `string | null`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- Server TypeScript: `npx tsc --noEmit --project server/tsconfig.json` exits 0
- Client TypeScript: `npx tsc --noEmit --project client/tsconfig.json` exits 0

## Known Stubs

None — all data is wired from real DB columns via existing Drizzle schema.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4e874c4 | feat(03-08): join sender username into reply_to objects in messages endpoint |
| 2 | 430039e | feat(03-08): extend conversations list participants with is_admin, can_edit_messages, last_read_message_id, last_read_at |
| 3 | 44595bc | feat(03-08): add sender to ReplyTo and read receipt fields to Participant types |

## Self-Check: PASSED

- server/src/routes/conversations/messages.ts — modified, committed 4e874c4
- server/src/routes/conversations/index.ts — modified, committed 430039e
- client/src/types/chat.ts — modified, committed 44595bc
- Both TypeScript workspaces compile clean (TSC exit 0)
