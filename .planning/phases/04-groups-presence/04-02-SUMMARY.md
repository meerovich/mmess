---
phase: 04-groups-presence
plan: "02"
subsystem: api
tags: [websocket, presence, real-time, debounce, rest]

# Dependency graph
requires:
  - phase: 04-01
    provides: last_seen_at column on users table
provides:
  - WS presence broadcasts on connect/disconnect (D-16, D-17)
  - 3-second offline debounce preventing flicker during reconnects (PITFALLS #7)
  - isOnline() helper for checking per-user WS connection status
  - GET /api/presence endpoint for client hydration on page load (D-19)
affects: [04-03, client presence indicators, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level Map for timer debounce — offlineTimers persists across requests"
    - "Direct db import in route files (not fastify decorator)"
    - "Fire-and-forget presence broadcast on WS connect (no blocking)"

key-files:
  created:
    - server/src/routes/ws/presence.ts
  modified:
    - server/src/routes/ws/registry.ts
    - server/src/routes/ws/index.ts
    - server/src/index.ts

key-decisions:
  - "schedulePresenceOffline uses module-level Map (not closure) so timer survives across multiple socket close events for the same user"
  - "broadcastPresenceOnline/schedulePresenceOffline use direct db import (no Fastify decorator) matching existing codebase pattern"
  - "3000ms grace period per PITFALLS #7 — absorbs network blips without showing offline flicker"
  - "getPresenceScope filters to conversation-sharing users only — minimizes broadcast fanout"

patterns-established:
  - "Presence scope query: DISTINCT user_id from conversation_participants subquery — scope broadcast to contacts only"

requirements-completed: [PRES-01, PRES-03]

# Metrics
duration: 18min
completed: 2026-04-11
---

# Phase 04 Plan 02: WS Presence Infrastructure Summary

**Presence on-connect/on-disconnect with 3s flicker-prevention debounce and GET /api/presence REST hydration endpoint**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-11T14:30:00Z
- **Completed:** 2026-04-11T14:48:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `isOnline(userId)` helper to registry.ts, enabling O(1) presence checks without DB queries
- Created presence.ts with broadcast helpers scoped to shared-conversation participants only (D-16, D-17); 3s debounce via module-level `offlineTimers` Map (PITFALLS #7)
- Wired presence hooks into ws/index.ts connect/close lifecycle and registered GET /api/presence in server/src/index.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: registry.ts — add isOnline() helper** - `e85a174` (feat)
2. **Task 2: presence.ts + ws/index.ts hooks + server/src/index.ts registration** - `cbe416a` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `server/src/routes/ws/registry.ts` - Added `isOnline(userId)` export
- `server/src/routes/ws/presence.ts` - New file: `broadcastPresenceOnline`, `schedulePresenceOffline`, `presenceRoutes` (GET /api/presence)
- `server/src/routes/ws/index.ts` - Added presence hooks at connect and close
- `server/src/index.ts` - Registered `presenceRoutes` plugin

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The plan's NOTE to check whether routes use direct db import vs fastify decorator was evaluated: existing routes use `import { db } from '../../db/index.js'` directly. presence.ts uses the same pattern, avoiding the `(fastify as any).db` approach mentioned as fallback.

## Known Stubs

None — all data sources wired. `last_seen_at` read from DB, `isOnline` reads live registry.

## Self-Check: PASSED

- FOUND: server/src/routes/ws/presence.ts
- FOUND: server/src/routes/ws/registry.ts (with isOnline)
- FOUND commit e85a174 (Task 1)
- FOUND commit cbe416a (Task 2)
