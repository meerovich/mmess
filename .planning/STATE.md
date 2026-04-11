---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-11T12:00:00.000Z"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 13
  completed_plans: 10
  percent: 77
---

# State: mmess

## Project Reference

**Core Value:** Instant, reliable message delivery between users over a secure WebSocket connection
**Current Focus:** Phase 03 — messaging-core

---

## Current Position

Phase: 03 (messaging-core) — EXECUTING
Plan: 3 of 6
**Phase:** 3
**Plan:** 3 complete, starting plan 4
**Status:** Executing Phase 03

**Progress:**

[████████░░] 77%
[██████████] 100% (3/3 plans in Phase 1)
[Phase 1] [3/3] Foundation — COMPLETE
[Phase 2] [ ] Authentication
[Phase 3] [ ] Messaging Core
[Phase 4] [ ] Groups & Presence
[Phase 5] [ ] File Sharing
[Phase 6] [ ] UI & Deploy

```

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 0 |
| Plans complete | 0 |
| Requirements mapped | 35/35 |
| Requirements done | 0/35 |

---
| Phase 01-foundation P01 | 25 | 3 tasks | 15 files |
| Phase 01-foundation P03 | 90 | 2 tasks | 9 files |
| Phase 02-authentication P01 | 6 | 3 tasks | 8 files |
| Phase 02-authentication P03 | 15 | 1 tasks | 2 files |
| Phase 02-authentication P02 | 20 | 2 tasks | 10 files |
| Phase 02-authentication P04 | 12 | 2 tasks | 9 files |
| Phase 03-messaging-core P01 | 8 | 2 tasks | 5 files |
| Phase 03-messaging-core P02 | 15 | 2 tasks | 6 files |
| Phase 03-messaging-core P03 | 25 | 2 tasks | 5 files |

## Accumulated Context

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Node.js 22 + Fastify 5 | Modern, fast HTTP layer; good WebSocket support via ws |
| PostgreSQL 16 + Drizzle ORM | Type-safe schema, migrations, reliable persistence |
| React 19 + Vite | Fast client build, modern UI framework |
| Caddy reverse proxy | Auto-TLS via Let's Encrypt, minimal config |
| Docker Compose deployment | Full self-hosted stack, easy to run on VPS |
| ws library for WebSocket | Lightweight, no abstraction overhead |
| ESLint 9 flat config (eslint.config.js) | Legacy .eslintrc.json dropped in ESLint 9; @typescript-eslint v8 requires ESLint 9 |
| allowImportingTsExtensions in client tsconfig | Required for .tsx import paths with Vite Bundler moduleResolution |
| npm workspaces with hoisted node_modules | Shared deps (fastify, react) live in root node_modules |
| Full schema upfront (D-09) | All 7 tables defined in schema.ts now to avoid mid-feature migrations |
| UUID PKs with gen_random_uuid() (D-07) | Prevents ID enumeration, enables offline ID generation |
| Auto-migration on startup (D-10) | runMigrations() called before app.listen() ensures schema is always current |
| Separate migration postgres client (max:1) | Avoids pool conflicts during drizzle migrate on startup |
| Caddy uri strip_prefix /api | Backend routes at / not /api/; Caddyfile strips prefix when proxying /api/* |
| Dev ports 8081:80, 8443:443 | Windows HTTP.sys holds port 80; Keycloak holds 8080; dev uses non-standard ports |
| Dev container npm ci before tsx watch | node:22-alpine has no project deps; bind-mount provides source only, not node_modules |
| @fastify/cookie registered before @fastify/jwt | Hard peer dep for cookie-mode JWT; order matters in auth plugin |
| global=false on @fastify/rate-limit | Routes opt in individually with config.rateLimit for targeted rate limits |
| onlyCookie: true in jwtVerify | Prevents auth header token supply — access tokens only from httpOnly cookies |
| Plain async function (not fp-wrapped) for wsRoutes | fp bubbles hooks to parent scope; plain function keeps preValidation scoped to /ws only |
| preValidation over onRequest for WS auth | @fastify/cookie runs in onRequest; preValidation fires after cookies are parsed so access_token is available |
| refresh_token cookie path=/api/auth/refresh | Browser-visible path before Caddy strips /api; browser only sends cookie to this exact path |
| SELECT FOR UPDATE in Drizzle transaction for refresh | Prevents race condition where two concurrent refreshes both see same valid token (Pitfall C) |
| clearCookie must match setCookie path | Mismatched paths silently fail to clear; logout must use exact paths used at login |
| First-user auto-admin via COUNT(*) on users | Skip invite check when no users exist; enables bootstrap without initial invite |
| BrowserRouter in App.tsx, not main.tsx | AuthProvider needs Router context; App.tsx owns BrowserRouter so all children can use hooks |
| apiFetch refreshQueue serializes concurrent 401s | Multiple simultaneous expired-token requests share one refresh call — avoids token rotation race |
| inviteToken in form body, not URL | Prevents token leakage in browser history, logs, and referrer headers |
| --legacy-peer-deps for @emoji-mart/react | @emoji-mart/react@1.1.1 peer dep declares react@^18 but works with React 19; legacy flag avoids install failure |
| nanoid hoisted from server, not reinstalled in client | nanoid is in server/package.json and hoisted to root node_modules by npm workspaces; client can import directly |
| dynamic import('../registry.js') inside WS handlers | Avoids circular module dependency at load time; registry module is cached after first load so no runtime penalty |
| PostgresJsDatabase type with db cast as any in index.ts | Handlers use PostgresJsDatabase<Record<string,never>>; db has full schema type; cast bridges the generic mismatch |
| Direct ws/registry import in create.ts | Plain broadcast() import instead of Fastify decorator — cleaner coupling after 03-02 landed with module exports |
| Compound (created_at,id) cursor uses indexOf not split | indexOf('|') for cursor decode is unambiguous regardless of ISO timestamp format |

### Architecture Notes

- API server: Node.js 22 + Fastify 5
- WebSocket: ws library integrated with Fastify
- Database: PostgreSQL 16, accessed via Drizzle ORM
- File storage: Docker named volume (local filesystem)
- Reverse proxy: Caddy (handles TLS termination)
- Client: React 19 + Vite (SPA)
- Auth: JWT access tokens + refresh tokens, validated at WS handshake

### Todos

- (none yet)

### Blockers

- (none)

---

## Session Continuity

**Last updated:** 2026-04-11
**Last action:** Completed 03-03 — REST endpoints: GET /api/conversations, GET /api/conversations/:id/messages, POST /api/conversations, GET /api/users?q=
**Next action:** Execute Phase 03 Plan 04 — messaging-core next plan

---
*State initialized: 2026-04-08*
