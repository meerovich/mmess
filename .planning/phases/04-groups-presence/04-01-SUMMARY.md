---
phase: 04-groups-presence
plan: "01"
subsystem: backend
tags: [schema, rest-api, groups, admin, presence]
dependency_graph:
  requires: []
  provides: [users.last_seen_at, group-admin-endpoints, conversation:updated-broadcast]
  affects: [04-02, 04-03, 04-04]
tech_stack:
  added: []
  patterns: [admin-guard pattern (getParticipant + is_admin check), fetchConversation helper in admin.ts]
key_files:
  created:
    - server/src/routes/conversations/admin.ts
  modified:
    - server/src/db/schema.ts
    - server/src/index.ts
decisions:
  - Route registration added to server/src/index.ts (not conversations/index.ts) because conversations/index.ts IS the list route, not a sub-router index
  - getParticipant() helper replaces plan's getAdminParticipant() — both admin guard and leave endpoint use the same helper, with is_admin check inline
metrics:
  duration: 3
  completed: "2026-04-11T14:28:00Z"
  tasks: 2
  files: 3
---

# Phase 4 Plan 01: Schema Extension + Group Admin REST Endpoints Summary

**One-liner:** users.last_seen_at nullable TIMESTAMPTZ + 5 group admin REST endpoints (rename, add/remove participants, update permissions, leave) each broadcasting conversation:updated WS event.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add users.last_seen_at nullable TIMESTAMPTZ | 827e691 | server/src/db/schema.ts |
| 2 | Create 5 group admin REST endpoints + register | 0e7d7b1 | server/src/routes/conversations/admin.ts, server/src/index.ts |

## What Was Built

### Task 1: Schema Extension
Added `last_seen_at` nullable TIMESTAMPTZ column to the `users` table in Drizzle schema. Null means "never seen since column was added" (D-18). The column will be updated on WS disconnect by Plan 04-02. Auto-migration runs on next container start via existing `runMigrations()`.

### Task 2: Group Admin REST Endpoints

Created `server/src/routes/conversations/admin.ts` with all 5 endpoints:

1. **PATCH /api/conversations/:id** — Rename group (admin-only). Returns 200 with updated conversation. Broadcasts `conversation:updated`.
2. **POST /api/conversations/:id/participants** — Add members (admin-only). Returns 409 if any user already a member. Broadcasts `conversation:updated` to all (including newly added).
3. **DELETE /api/conversations/:id/participants/:user_id** — Kick participant (admin-only). Returns 403 if trying to remove self as sole admin. Broadcasts `conversation:updated` to remaining participants only (kicked user excluded).
4. **PATCH /api/conversations/:id/participants/:user_id** — Update `can_edit_messages` permission (admin-only). Returns 200 with updated participant. Broadcasts `conversation:updated`.
5. **DELETE /api/conversations/:id/me** — Leave group (any participant). If last participant: hard-deletes the conversation (CASCADE removes everything). Otherwise: removes participant row and broadcasts `conversation:updated` to remaining participants.

All 5 endpoints:
- Verify caller is a participant (403 if not)
- Admin endpoints additionally verify `is_admin=true` (403 if not)
- Import `broadcast` from `../ws/registry.js` and call with `{ type: 'conversation:updated', payload: { conversation } }`

Registered in `server/src/index.ts` following the existing pattern (`app.register(conversationsAdminRoutes)`).

## Deviations from Plan

None - plan executed exactly as written.

**Minor implementation note:** The plan's `getAdminParticipant()` helper was renamed to `getParticipant()` since the leave endpoint also needs to look up the participant without requiring admin status. The is_admin check is done inline after the participant lookup in each admin endpoint handler. This is functionally equivalent.

## Known Stubs

None. All endpoints are fully wired with real DB operations.

## Self-Check: PASSED

- [x] server/src/db/schema.ts contains `last_seen_at` at line 34 (users table)
- [x] server/src/routes/conversations/admin.ts created with 5 route handlers
- [x] server/src/index.ts imports and registers conversationsAdminRoutes
- [x] commit 827e691 exists (Task 1)
- [x] commit 0e7d7b1 exists (Task 2)
- [x] TypeScript compiles clean (exit 0)
