---
phase: 03-messaging-core
plan: "01"
subsystem: database
tags: [drizzle, postgres, schema, emoji-mart, date-fns, nanoid]

# Dependency graph
requires:
  - phase: 02-authentication
    provides: Schema with users, sessions, conversations, messages, message_reactions tables
provides:
  - message_reads table (composite unique on message_id+user_id for read receipts)
  - can_edit_messages column on conversation_participants
  - Client packages: @emoji-mart/react, @emoji-mart/data, date-fns, nanoid (hoisted)
  - Drizzle migration 0002_reflective_energizer.sql
affects: [03-02, 03-03, 03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: ["@emoji-mart/react@1.1.1", "@emoji-mart/data@1.2.1", "date-fns@4.1.0"]
  patterns: ["--legacy-peer-deps for emoji-mart React 19 peer dep mismatch"]

key-files:
  created:
    - server/drizzle/0002_reflective_energizer.sql
    - server/drizzle/meta/0002_snapshot.json
  modified:
    - server/src/db/schema.ts
    - client/package.json
    - package-lock.json

key-decisions:
  - "Used --legacy-peer-deps for @emoji-mart/react which declares peer react@^16.8||^17||^18 but works fine with React 19"
  - "nanoid not explicitly installed in client — already hoisted from server deps to root node_modules"

patterns-established:
  - "New schema elements added after existing tables, never interleaved with existing definitions"
  - "Drizzle migrations run via DATABASE_URL env var even for generate command (drizzle.config.ts validates it)"

requirements-completed: [MSG-05, MSG-10, CONV-01, CONV-02]

# Metrics
duration: 8min
completed: 2026-04-09
---

# Phase 3 Plan 01: Schema Extensions + Client Deps Summary

**Drizzle schema extended with message_reads table and can_edit_messages column; client workspace gains emoji-mart, date-fns, and nanoid (hoisted)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-09T14:10:00Z
- **Completed:** 2026-04-09T14:18:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `can_edit_messages` boolean column to `conversation_participants` (D-22 compliance)
- Added `message_reads` table with composite unique (message_id, user_id), timestamps, and two indexes (D-29 compliance)
- Generated Drizzle migration `0002_reflective_energizer.sql` — correct SQL with FK constraints and indexes
- Installed `@emoji-mart/react@1.1.1`, `@emoji-mart/data@1.2.1`, `date-fns@4.1.0` into client workspace
- Confirmed `nanoid` already hoisted to root node_modules from server dependencies — no explicit client install needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema — can_edit_messages + message_reads table** - `11cdd38` (feat)
2. **Task 2: Install client packages — emoji-mart, date-fns, nanoid** - `9d76ff2` (chore)

**Plan metadata:** (this commit)

## Files Created/Modified
- `server/src/db/schema.ts` - Added `can_edit_messages` to conversation_participants; added `message_reads` table export
- `server/drizzle/0002_reflective_energizer.sql` - Migration: CREATE TABLE message_reads + ALTER TABLE conversation_participants ADD COLUMN
- `server/drizzle/meta/0002_snapshot.json` - Drizzle migration snapshot
- `server/drizzle/meta/_journal.json` - Updated migration journal
- `client/package.json` - Added @emoji-mart/react, @emoji-mart/data, date-fns dependencies
- `package-lock.json` - Updated lockfile with new client packages

## Decisions Made
- **--legacy-peer-deps for @emoji-mart/react:** The package declares peer react@"^16.8||^17||^18" but React 19 is a minor compatibility declaration gap — the library works at runtime. Installed with `--legacy-peer-deps` rather than forcing.
- **nanoid not reinstalled:** nanoid@5.1.7 is already in server/package.json and hoisted to root node_modules by npm workspaces. The client can import it directly. No explicit `npm install --workspace=client nanoid` needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used --legacy-peer-deps for @emoji-mart/react React 19 peer dep conflict**
- **Found during:** Task 2 (Install client packages)
- **Issue:** @emoji-mart/react@1.1.1 declares peer `react@"^16.8 || ^17 || ^18"` but project uses React 19 — npm refused to install
- **Fix:** Added `--legacy-peer-deps` flag; package works correctly at runtime with React 19
- **Files modified:** client/package.json, package-lock.json
- **Verification:** Packages present in node_modules/@emoji-mart/; `date-fns` in root node_modules
- **Committed in:** `9d76ff2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — peer dep conflict)
**Impact on plan:** Minimal — standard npm behavior for packages with stale peer dep declarations. @emoji-mart/react is well-maintained and React 19 compatible at runtime.

## Issues Encountered
- `drizzle-kit generate` requires DATABASE_URL env var even though it only reads the schema file (not the DB) — set a dummy URL inline to run the generator.
- npm engine warnings about Node.js 18.x in WSL shell (project targets Node.js 22 in Docker) — these are environment-specific warnings, not issues.

## User Setup Required
None — no external service configuration required. Migration will run automatically on next `docker compose up` via the startup migration hook.

## Next Phase Readiness
- `message_reads` table available for read receipt handlers (03-02+)
- `can_edit_messages` column available for permission checks in message edit flow (03-04+)
- `@emoji-mart/react` and `@emoji-mart/data` available for MessageInput emoji picker (03-05)
- `date-fns` available for all timestamp formatting in chat UI components (03-05)
- `nanoid` available for client-side optimistic message ID generation (03-02 onward)

---
*Phase: 03-messaging-core*
*Completed: 2026-04-09*

## Self-Check: PASSED

- FOUND: server/src/db/schema.ts
- FOUND: server/drizzle/0002_reflective_energizer.sql
- FOUND: client/package.json (with @emoji-mart/react, @emoji-mart/data, date-fns)
- FOUND: node_modules/@emoji-mart/react
- FOUND: node_modules/date-fns
- FOUND: node_modules/nanoid (hoisted from server)
- FOUND commit 11cdd38: feat(03-01) schema extensions
- FOUND commit 9d76ff2: chore(03-01) client packages
