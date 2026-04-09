---
phase: 02-authentication
plan: "03"
subsystem: auth
tags: [websocket, fastify-websocket, jwt, authentication, ws]

# Dependency graph
requires:
  - phase: 02-01
    provides: fastify.authenticate decorator registered via fp-wrapped auth plugin
provides:
  - WebSocket route /ws with HTTP 401 rejection at upgrade handshake for unauthenticated requests
  - Scoped preValidation hook pattern that leaves /health and /auth/* unprotected
  - Placeholder WebSocket handler with userId from JWT claim for Phase 3 to extend
affects:
  - 03-messaging-core

# Tech tracking
tech-stack:
  added: ["@fastify/websocket ^11.0.0 (already in package.json, now registered)"]
  patterns:
    - "Non-fp-wrapped plugin for hook scope isolation — hooks scoped to /ws only"
    - "preValidation (not onRequest) for WS auth — fires after @fastify/cookie parses cookies"
    - "fastify.authenticate called in preValidation to reject HTTP upgrade on 401 before socket allocation"

key-files:
  created:
    - server/src/routes/ws/index.ts
  modified:
    - server/src/index.ts

key-decisions:
  - "Plain async function (not fp-wrapped) for wsRoutes to isolate preValidation hook scope to /ws"
  - "preValidation over onRequest for WS auth — cookies available at preValidation; onRequest is too early"

patterns-established:
  - "Route plugins without fp wrapping when hook isolation is needed"
  - "Register fastifyWebsocket before route plugins that use websocket: true"

requirements-completed:
  - INFRA-03

# Metrics
duration: 15min
completed: 2026-04-09
---

# Phase 2 Plan 03: WebSocket Auth Enforcement Summary

**WebSocket /ws route stub that rejects unauthenticated HTTP upgrade requests with HTTP 401 at preValidation, before any socket is allocated**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-09T08:40:00Z
- **Completed:** 2026-04-09T08:55:00Z
- **Tasks:** 1 auto + 1 checkpoint (auto-approved, auto_advance=true)
- **Files modified:** 2

## Accomplishments

- Created `server/src/routes/ws/index.ts` as a plain async function (not fp-wrapped) to scope the `preValidation` hook to the /ws route only
- Registered `@fastify/websocket` and `wsRoutes` in `server/src/index.ts` with correct ordering
- `fastify.authenticate` called in `preValidation` so unauthenticated WebSocket upgrade attempts receive HTTP 401 before any socket is allocated (PITFALLS #3 prevention)
- `/health` and `/auth/*` routes are unaffected — WS auth scope is encapsulated to wsRoutes plugin

## Task Commits

1. **Task 1: WebSocket route stub with auth enforcement** - `acdbbb4` (feat)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `server/src/routes/ws/index.ts` — WebSocket route plugin with scoped preValidation auth hook and placeholder echo handler
- `server/src/index.ts` — Added fastifyWebsocket registration and wsRoutes plugin import/registration

## Decisions Made

- Used plain async function export (not `fp`-wrapped) for wsRoutes — `fp` would bubble hooks to parent scope, defeating the scope isolation needed to keep /health and /auth/* unprotected
- `preValidation` chosen over `onRequest` because `@fastify/cookie` runs in `onRequest` to parse cookies; `preValidation` fires after cookies are populated, so `access_token` cookie is available when `jwtVerify` runs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WebSocket auth boundary is in place; Phase 3 messaging can add message handlers inside the existing `/ws` route stub
- The placeholder echo handler (`socket.on('message', ...)`) returns `{"type":"connected","userId":"..."}` for smoke testing; Phase 3 replaces it with full message routing
- Requires a running user with valid `access_token` cookie for end-to-end WebSocket verification (plan 02-02 must complete first)

---
*Phase: 02-authentication*
*Completed: 2026-04-09*
