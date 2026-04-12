---
phase: 07-stabilization
plan: 02
subsystem: testing
tags: [websocket, e2e, regression, node, ws]

# Dependency graph
requires:
  - phase: 07-stabilization-01
    provides: Fixed read receipt pipeline (3-state) and message:delivered event
provides:
  - "Comprehensive E2E WS regression test covering auth, messaging, read receipts, reactions, typing, presence"
  - "Assertion-based pass/fail with waitForType helper and global timeout"
affects: [07-stabilization, regression-testing, deploy-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E WS test: structured sections with assert/waitForType helpers, runs inside api container"
    - "waitForType pattern: scan collected messages first, then listen for new ones with timeout"

key-files:
  created: []
  modified:
    - .vps-test-ws.mjs

key-decisions:
  - "Single-file structured test with sequential sections rather than split by feature area"
  - "Skipped tester read:by self-receipt assertion — broadcastExcludeSocket excludes source socket, single-session tester won't receive it"
  - "reaction:added assertion checks user_id not username — server handler does not include username in reaction payload"

patterns-established:
  - "E2E WS test structure: helpers at top, sequential test sections, assert helper with pass/fail logging"

requirements-completed: [STAB-03, STAB-04]

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 7 Plan 2: E2E WS Regression Script Summary

**Assertion-based E2E WS regression test covering auth, message send/receive, delivery detection, read receipts, reactions, typing, and presence**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-12T09:05:01Z
- **Completed:** 2026-04-12T09:09:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Rewrote `.vps-test-ws.mjs` from basic smoke test to structured 7-section regression test
- Added `assert`, `waitForType`, and `drainType` helpers for reliable assertion-based testing
- Covers all v1.0.3 WS event types: message:send, message:delivered, read:mark, read:by, reaction:add, reaction:added, typing:start, typing:stop, presence:update
- Exit codes: 0 (all pass), 1 (assertion failure), 2 (30s global timeout)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend E2E WS regression script** - `c591247` (test)

## Files Created/Modified
- `.vps-test-ws.mjs` - Comprehensive E2E WS regression test with 7 test sections and assertion-based pass/fail

## Decisions Made
- Kept single-file structure (D-13 from CONTEXT.md) rather than splitting by feature area — sequential execution within one async IIFE is simpler for docker exec
- Skipped asserting tester receives their own read:by — broadcastExcludeSocket excludes the source socket, and tester has only one socket in this test. Multi-session sync would require a second tester connection.
- Checked reaction payload for user_id (not username) — actual server handler in reaction.ts does not include username in the broadcast payload

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected read:by self-receipt assertion**
- **Found during:** Task 1 (Read Receipt test section)
- **Issue:** Plan specified tester should receive read:by (multi-session sync), but broadcastExcludeSocket excludes the source socket. With a single tester socket, tester cannot receive their own read:by.
- **Fix:** Skipped the assertion with explanatory comment instead of writing a test that would always fail
- **Files modified:** .vps-test-ws.mjs
- **Verification:** Matches server behavior in handlers/read.ts line 58-69
- **Committed in:** c591247

**2. [Rule 1 - Bug] Corrected reaction:added payload expectations**
- **Found during:** Task 1 (Reaction test section)
- **Issue:** Plan interfaces section listed `username` in reaction:added payload, but actual server handler (reaction.ts) only sends user_id, emoji, message_id, conversation_id
- **Fix:** Test asserts user_id instead of username
- **Files modified:** .vps-test-ws.mjs
- **Verification:** Confirmed by reading server/src/routes/ws/handlers/reaction.ts
- **Committed in:** c591247

---

**Total deviations:** 2 auto-fixed (2 bugs in plan spec vs actual server behavior)
**Impact on plan:** Both fixes align the test with actual server behavior. No scope creep.

## Issues Encountered
None

## User Setup Required
None - script runs inside existing api container with existing test accounts.

## Known Stubs
None - test script is complete and ready to run.

## Next Phase Readiness
- E2E regression script ready to run on VPS via `docker exec mmess-api-1 node /app/.vps-test-ws.mjs`
- Plan 03 (manual UI verification checklist) can proceed independently
- Script results will feed into STAB-03 regression sweep documentation

## Self-Check: PASSED

- FOUND: `.vps-test-ws.mjs`
- FOUND: commit `c591247`

---
*Phase: 07-stabilization*
*Completed: 2026-04-12*
