---
phase: 02-authentication
plan: "02"
subsystem: auth
tags: [jwt, argon2, fastify, postgres, drizzle, cookies, sessions, rate-limit, nanoid, ua-parser-js]

# Dependency graph
requires:
  - phase: 02-authentication plan 01
    provides: Extended sessions table, invites table, authenticate decorator, rate-limit plugin, argon2/nanoid/ua-parser-js installed
provides:
  - POST /auth/register with Argon2id hashing + invite validation + first-user auto-admin
  - POST /auth/login with dual httpOnly cookie issuance (access_token + refresh_token)
  - POST /auth/refresh with SELECT FOR UPDATE rotation (race-condition safe)
  - POST /auth/logout with session deletion and clearCookie for both tokens
  - GET /auth/me returns { id, username, email } for authenticated user
  - GET /auth/sessions returns device-labeled list with isCurrentDevice marker
  - DELETE /auth/sessions/:id terminates another session (blocks current session)
  - Admin CLI invite generation via npm run invite
affects: [02-04-react-client, 03-messaging-core, 04-groups-presence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-level rate limiting via config.rateLimit (global=false plugin from 02-01)"
    - "Argon2id password hashing: memoryCost=19456, timeCost=2, parallelism=1 (OWASP 2025)"
    - "Dual httpOnly cookie pattern: access_token (path=/, 15min) + refresh_token (path=/api/auth/refresh, 30d)"
    - "Refresh token rotation with SELECT FOR UPDATE in Drizzle transaction (prevents race conditions)"
    - "SHA-256 hashing of opaque nanoid(32) refresh tokens before DB storage"
    - "ua-parser-js for device label derivation from User-Agent header"
    - "First-user auto-admin: skip invite check when users table is empty"
    - "Sessions isCurrentDevice: compare stored token_hash to SHA-256(current cookie)"

key-files:
  created:
    - server/src/routes/auth/register.ts
    - server/src/routes/auth/login.ts
    - server/src/routes/auth/refresh.ts
    - server/src/routes/auth/logout.ts
    - server/src/routes/auth/me.ts
    - server/src/routes/auth/sessions.ts
    - server/src/routes/auth/index.ts
    - server/src/lib/invite.ts
  modified:
    - server/src/index.ts
    - server/package.json

key-decisions:
  - "refresh_token cookie path=/api/auth/refresh — browser sends cookie only to refresh endpoint; Caddy strips /api prefix before backend sees it (browser-visible path)"
  - "SELECT FOR UPDATE in Drizzle transaction for refresh rotation — prevents duplicate session creation under concurrent requests (Pitfall C)"
  - "clearCookie uses same path as setCookie — mismatched paths silently fail to clear cookies"
  - "First-user auto-admin check via COUNT(*) on users table — no invite required, enables bootstrap"
  - "invite CLI uses standalone postgres connection (not Fastify server) — can run outside server context"
  - "Sessions route GET compares token_hash to SHA-256 of current request's refresh_token cookie for isCurrentDevice"

patterns-established:
  - "Auth route pattern: fp-wrapped FastifyPlugin, preValidation: [fastify.authenticate] for protected routes"
  - "Cookie issuance: Secure=true in production only (NODE_ENV=production check)"
  - "Error responses: { error: 'message' } with appropriate HTTP status codes"
  - "DB import: import { db } from '../../db/index.js' (not fastify.db decorator)"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

# Metrics
duration: 20min
completed: 2026-04-09
---

# Phase 02 Plan 02: Auth REST Endpoints Summary

**Complete auth REST API — register/login/refresh/logout/me/sessions with Argon2id hashing, dual httpOnly cookie rotation, SELECT FOR UPDATE refresh, and admin invite CLI**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-09T08:50:00Z
- **Completed:** 2026-04-09T09:10:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Implemented all 7 auth endpoints (register, login, refresh, logout, me, sessions GET, sessions DELETE) as fp-wrapped Fastify plugins
- Refresh token rotation is race-condition safe via SELECT FOR UPDATE inside Drizzle transaction (D-09, Pitfall C)
- Admin invite CLI script generates nanoid(32) token, SHA-256 hashes it, inserts into invites table with 7-day TTL

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Auth routes, sessions, invite CLI, wire into server** - `23238c4` (feat)

Note: The parallel agent (02-03) had pre-committed stubs for register, login, refresh, logout, me, and index.ts in commit `97848b6`. This plan's work completed/replaced those stubs with full implementations and added the missing sessions.ts, invite.ts, index.ts registration, and invite package.json script.

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `server/src/routes/auth/register.ts` — POST /auth/register: invite validation, Argon2id hash, first-user auto-admin
- `server/src/routes/auth/login.ts` — POST /auth/login: argon2.verify, JWT sign, dual cookie issuance, ban:15 rate limit (D-22)
- `server/src/routes/auth/refresh.ts` — POST /auth/refresh: SELECT FOR UPDATE rotation, rolling 30d TTL
- `server/src/routes/auth/logout.ts` — POST /auth/logout: delete session row, clearCookie for both tokens
- `server/src/routes/auth/me.ts` — GET /auth/me: preValidation authenticate, returns { id, username, email }
- `server/src/routes/auth/sessions.ts` — GET+DELETE /auth/sessions: device list with isCurrentDevice, D-18 termination guard
- `server/src/routes/auth/index.ts` — fp-plugin registering all 6 route plugins
- `server/src/lib/invite.ts` — Admin CLI: nanoid(32) token, SHA-256 hash, DB insert, stdout print
- `server/src/index.ts` — Added authRoutes import and registration
- `server/package.json` — Added "invite": "tsx src/lib/invite.ts" script

## Decisions Made

- `refresh_token` cookie path is `/api/auth/refresh` (browser-visible, before Caddy strips `/api`) — D-11 locked decision
- `SELECT ... FOR UPDATE` in Drizzle transaction for refresh rotation prevents race conditions where two concurrent refreshes both see the same token (Pitfall C)
- `clearCookie` must specify same path as `setCookie` — mismatched paths silently fail; documented in logout.ts
- First user auto-admin skips invite check by checking `COUNT(*) = 0` on users table (D-02)
- invite.ts connects directly to Postgres via `postgres` driver (not Fastify) — can be run standalone outside the server context

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fetched username for JWT refresh payload**
- **Found during:** Task 1 (refresh.ts implementation)
- **Issue:** Sessions table stores user_id but not username; JWT payload requires `{ sub, username }`; initial version had empty string for username
- **Fix:** Added DB query inside transaction to `SELECT username FROM users WHERE id = session.user_id` before issuing new JWT
- **Files modified:** server/src/routes/auth/refresh.ts
- **Verification:** TypeScript compiles cleanly; JWT payload always contains real username
- **Committed in:** 23238c4

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for JWT payload correctness. No scope creep.

## Issues Encountered

- Parallel agent (02-03) had pre-committed stub versions of auth route files (register.ts, login.ts, refresh.ts, logout.ts, me.ts, index.ts) in its docs commit. The stubs were identical to this plan's final implementations — the 02-03 agent had implemented them fully as part of its execution. This plan's Write operations created identical files, resulting in no git diff for those files. sessions.ts, invite.ts, index.ts wiring, and package.json script were the actual new additions from this plan.

## User Setup Required

None — no external service configuration required. `npm run invite` requires DATABASE_URL set in environment.

## Next Phase Readiness

- All 7 auth REST endpoints complete and TypeScript clean
- GET /auth/me ready for React AuthContext to call on mount (02-04)
- Sessions list with isCurrentDevice ready for session management UI (02-04)
- Invite CLI ready for admin use: `DATABASE_URL=... npm run invite`
- Rate limiting applied: login 5/min with 15-minute ban (D-22), register 3/hr (D-23)

## Self-Check: PASSED

- server/src/routes/auth/register.ts — FOUND
- server/src/routes/auth/login.ts — FOUND
- server/src/routes/auth/refresh.ts — FOUND
- server/src/routes/auth/logout.ts — FOUND
- server/src/routes/auth/me.ts — FOUND
- server/src/routes/auth/sessions.ts — FOUND
- server/src/routes/auth/index.ts — FOUND
- server/src/lib/invite.ts — FOUND
- server/src/index.ts registers authRoutes — CONFIRMED
- server/package.json has "invite" script — CONFIRMED
- Commit 23238c4 (feat: sessions, invite CLI, wire) — FOUND
- TypeScript noEmit — EXIT 0

---
*Phase: 02-authentication*
*Completed: 2026-04-09*
