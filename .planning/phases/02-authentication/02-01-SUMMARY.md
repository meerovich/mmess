---
phase: 02-authentication
plan: "01"
subsystem: auth
tags: [jwt, argon2, fastify, postgres, drizzle, rate-limit, cookies]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Fastify 5 server, Drizzle ORM + PostgreSQL schema, Docker Compose stack
provides:
  - Extended sessions table with user_agent, ip_address, last_seen_at columns
  - New invites table for invite-based registration
  - Global @fastify/jwt + @fastify/cookie plugin with authenticate decorator
  - Global @fastify/rate-limit plugin (per-route opt-in)
  - Migration 0001_silly_red_skull.sql applied on startup
affects: [02-02-auth-routes, 02-03-sessions-ui, 03-messaging-core, websocket-auth]

# Tech tracking
tech-stack:
  added:
    - "@fastify/cookie@^11.0.2 — httpOnly cookie read/write"
    - "@fastify/jwt@^10.0.0 — JWT sign/verify with cookie extraction"
    - "@fastify/rate-limit@^10.3.0 — per-route rate limiting"
    - "argon2@^0.44.0 — Argon2id password hashing (OWASP 2025)"
    - "ua-parser-js@^2.0.9 — User-Agent to device label parsing"
    - "nanoid@^5.1.7 — cryptographically secure opaque token generation"
  patterns:
    - "fastify-plugin (fp) wrapping for global plugin scope escape"
    - "@fastify/cookie registered before @fastify/jwt (peer dependency requirement)"
    - "fastify.authenticate decorator for route-level auth guard"
    - "JWT payload: { sub: string; username: string }"
    - "access_token cookie (httpOnly, path=/, SameSite=Lax)"

key-files:
  created:
    - server/src/plugins/auth.ts
    - server/src/plugins/rate-limit.ts
    - server/drizzle/0001_silly_red_skull.sql
    - server/drizzle/meta/0001_snapshot.json
  modified:
    - server/src/db/schema.ts
    - server/src/index.ts
    - server/package.json

key-decisions:
  - "fastifyCookie registered before fastifyJwt — @fastify/cookie is required peer dep for cookie mode"
  - "global=false on rate-limit plugin — routes opt in with config.rateLimit for targeted limiting"
  - "JWT_SECRET env var with fallback dev value — production must override"
  - "onlyCookie: true in jwtVerify — tokens only from httpOnly cookie, never Authorization header"

patterns-established:
  - "Plugin pattern: fp(async (fastify) => { ... }) for global decorator/plugin registration"
  - "Auth guard pattern: preHandler: [fastify.authenticate] on protected routes"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, INFRA-03]

# Metrics
duration: 6min
completed: 2026-04-09
---

# Phase 02 Plan 01: Authentication Foundation Summary

**Sessions schema extended + invites table added + @fastify/jwt cookie auth plugin + rate-limit plugin wired globally via fastify-plugin**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-09T08:26:59Z
- **Completed:** 2026-04-09T08:32:24Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Installed all six auth dependencies (@fastify/cookie, @fastify/rate-limit, argon2, ua-parser-js, nanoid, @fastify/jwt upgrade)
- Extended sessions table with user_agent, ip_address, last_seen_at; created invites table; generated Drizzle migration
- Created auth plugin (fp-wrapped, cookie-before-jwt, authenticate decorator) and rate-limit plugin; wired both into index.ts before routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Install new server dependencies** - `06f0749` (chore)
2. **Task 2: Extend schema — sessions columns + invites table** - `74b61a3` (feat)
3. **Task 3: Create auth + rate-limit plugins, wire into index.ts** - `db71177` (feat)

## Files Created/Modified

- `server/src/db/schema.ts` — Added user_agent, ip_address, last_seen_at to sessions; added invites table export
- `server/drizzle/0001_silly_red_skull.sql` — Migration: ALTER TABLE sessions + CREATE TABLE invites
- `server/drizzle/meta/0001_snapshot.json` — Drizzle meta snapshot
- `server/drizzle/meta/_journal.json` — Updated journal with new migration entry
- `server/src/plugins/auth.ts` — New: fp-wrapped @fastify/cookie + @fastify/jwt + authenticate decorator
- `server/src/plugins/rate-limit.ts` — New: fp-wrapped @fastify/rate-limit (global=false)
- `server/src/index.ts` — Added authPlugin + rateLimitPlugin registrations before routes
- `server/package.json` — Added 5 new deps, upgraded @fastify/jwt to ^10.0.0

## Decisions Made

- `@fastify/cookie` must be registered before `@fastify/jwt` — this is a hard peer dependency requirement for cookie-mode JWT; documented in auth plugin comments
- `global: false` on `@fastify/rate-limit` — routes opt in individually via `config.rateLimit`, enabling precise control per endpoint (login: 5/min, register: 3/hr)
- `onlyCookie: true` in `jwtVerify` — prevents clients from supplying JWT via Authorization header; tokens only flow through httpOnly cookies
- `JWT_SECRET` env var with `'dev-secret-change-in-production'` fallback — safe for local development, production Docker Compose must override

## Deviations from Plan

None — plan executed exactly as written. TypeScript compiled cleanly on first attempt. All acceptance criteria met without auto-fixes required.

## Issues Encountered

- `npm run db:generate` requires DATABASE_URL env var even for schema-only generation (drizzle.config.ts throws if missing). Resolved by passing a dummy URL: `DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npm run db:generate`. This is expected behavior for drizzle-kit; actual DB connection not needed for migration generation.

## User Setup Required

None — no external service configuration required. JWT_SECRET should be set in docker-compose.override.yml or .env for production but is not required for development.

## Next Phase Readiness

- `fastify.authenticate` decorator available on all Fastify scopes — ready for use in 02-02 auth routes
- `invites` table exists, will be populated by register/invite endpoints in 02-02
- `sessions.user_agent` / `ip_address` / `last_seen_at` columns ready for session creation in 02-02
- `argon2`, `nanoid`, `ua-parser-js` installed and ready for use in 02-02 route handlers
- Migration runs automatically on server startup via `runMigrations()` — no manual steps needed

## Self-Check: PASSED

- server/src/plugins/auth.ts — FOUND
- server/src/plugins/rate-limit.ts — FOUND
- server/drizzle/0001_silly_red_skull.sql — FOUND
- .planning/phases/02-authentication/02-01-SUMMARY.md — FOUND
- Commit 06f0749 (chore: install deps) — FOUND
- Commit 74b61a3 (feat: extend schema) — FOUND
- Commit db71177 (feat: plugins + index.ts) — FOUND
- Commit e526249 (docs: SUMMARY + STATE + ROADMAP) — FOUND

---
*Phase: 02-authentication*
*Completed: 2026-04-09*
