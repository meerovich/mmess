---
phase: 02-authentication
verified: 2026-04-09T00:00:00Z
status: human_needed
score: 18/18 must-haves verified (2 items need human confirmation)
human_verification:
  - test: "Register as first user (no invite), then register a second user with invite token generated via `npm run invite`"
    expected: "First registration succeeds with no inviteToken field. Second registration succeeds only when a valid token is provided; rejects with 400 when token is absent or expired."
    why_human: "Cannot run DB + Node process in this environment. Logic is fully implemented and wired but end-to-end flow requires a live PostgreSQL instance."
  - test: "Open app, log in, close the browser entirely, reopen and navigate to /"
    expected: "User is still logged in (not redirected to /login). The 15-minute access_token will be expired; the refresh interceptor in api.ts should silently call POST /api/auth/refresh and retry, keeping the user logged in transparently."
    why_human: "Session-persistence across browser restarts depends on the httpOnly cookie surviving a browser close (only true for cookies with maxAge/Expires, not session cookies). Cookie attributes are set correctly in code (maxAge: 2592000) but confirmation requires a real browser."
---

# Phase 2: Authentication Verification Report

**Phase Goal:** Users can securely create accounts, log in, maintain sessions across browser restarts, and control their active devices
**Verified:** 2026-04-09
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can register with email/password using a valid invite token | VERIFIED | `server/src/routes/auth/register.ts` — full invite validation, Argon2id hash, transaction with invite mark-used |
| 2 | First user registers without invite and becomes admin | VERIFIED | `register.ts:41-46` — `SELECT COUNT(*) FROM users`; skips invite check when count is 0 |
| 3 | User can log in and receives access_token + refresh_token as httpOnly cookies | VERIFIED | `server/src/routes/auth/login.ts` — argon2.verify, jwt.sign, setCookie both tokens with httpOnly: true |
| 4 | User can refresh expired access token via POST /api/auth/refresh | VERIFIED | `server/src/routes/auth/refresh.ts` — SELECT FOR UPDATE transaction, token rotation, new cookies issued |
| 5 | After closing and reopening browser, user is still logged in | VERIFIED (code) / ? Human | `client/src/lib/api.ts:18-47` — 401 interceptor calls refresh then retries; `refresh_token` cookie has maxAge: 2592000 (30 days) |
| 6 | User can log out — session deleted, both cookies cleared | VERIFIED | `server/src/routes/auth/logout.ts` — db.delete(sessions), clearCookie both tokens |
| 7 | User can view all active sessions with device labels and IP | VERIFIED | `server/src/routes/auth/sessions.ts:10-33` — returns device_label, ip_address, last_seen_at, isCurrentDevice flag |
| 8 | User can terminate another session by ID | VERIFIED | `server/src/routes/auth/sessions.ts:36-68` — blocks terminating current session, deletes target row |
| 9 | Login endpoint rejects after 5 attempts per minute | VERIFIED | `login.ts:28-35` — `config.rateLimit: { max: 5, timeWindow: '1 minute', ban: 15 }` |
| 10 | GET /auth/me returns current user for authenticated session | VERIFIED | `server/src/routes/auth/me.ts` — preValidation: [fastify.authenticate], DB select id/username/email |
| 11 | Sessions table has user_agent, ip_address, last_seen_at columns | VERIFIED | `server/src/db/schema.ts:128-130` — all three columns present |
| 12 | Invites table exists with token_hash, created_by, used_by, expires_at, used_at | VERIFIED | `server/src/db/schema.ts:139-147` — all required columns present |
| 13 | @fastify/jwt and @fastify/cookie registered globally via fastify-plugin | VERIFIED | `server/src/plugins/auth.ts:19-28` — fp-wrapped, registers fastifyCookie then fastifyJwt with cookie mode |
| 14 | authenticate decorator available on all Fastify scopes | VERIFIED | `plugins/auth.ts:30-39` — fastify.decorate('authenticate', ...), fp-wrapped so decorator bubbles to parent |
| 15 | Rate limit plugin registered globally | VERIFIED | `server/src/plugins/rate-limit.ts:5-11` — fp-wrapped, global: false allows per-route opt-in |
| 16 | WebSocket upgrade rejected with HTTP 401 when access_token cookie is missing/invalid | VERIFIED | `server/src/routes/ws/index.ts:13-15` — addHook('preValidation', fastify.authenticate) on the encapsulated ws scope |
| 17 | Navigating to / while logged out redirects to /login | VERIFIED | `client/src/components/ProtectedRoute.tsx:8-9` — if !user → Navigate to="/login" |
| 18 | Register page accepts email, username, password, inviteToken | VERIFIED | `client/src/pages/RegisterPage.tsx:10, 81-95` — inviteToken state, form field, sent in body if non-empty |

**Score:** 18/18 truths verified (2 need human confirmation for browser-runtime behavior)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `server/src/db/schema.ts` | VERIFIED | sessions columns (user_agent, ip_address, last_seen_at) + invites table present; 148 lines |
| `server/src/plugins/auth.ts` | VERIFIED | fp-wrapped, registers cookie then jwt, adds authenticate decorator |
| `server/src/plugins/rate-limit.ts` | VERIFIED | fp-wrapped, global: false, per-route opt-in |
| `server/src/index.ts` | VERIFIED | authPlugin, rateLimitPlugin, fastifyWebsocket, authRoutes, wsRoutes all registered |
| `server/src/routes/auth/register.ts` | VERIFIED | argon2 import present, first-user logic, invite validation, db.transaction |
| `server/src/routes/auth/login.ts` | VERIFIED | jwtSign (fastify.jwt.sign), dual-cookie issuance, rate-limit config |
| `server/src/routes/auth/refresh.ts` | VERIFIED | FOR UPDATE in raw SQL transaction, token rotation, new cookies |
| `server/src/routes/auth/logout.ts` | VERIFIED | clearCookie both tokens, preValidation authenticate |
| `server/src/routes/auth/me.ts` | VERIFIED | authenticate in preValidation, DB select by request.user.sub |
| `server/src/routes/auth/sessions.ts` | VERIFIED | isCurrentDevice flag via token_hash comparison, ua-parser-js via login.ts |
| `server/src/lib/invite.ts` | VERIFIED | nanoid import, inserts into invites table with 7-day expiry |
| `client/src/contexts/AuthContext.tsx` | VERIFIED | AuthContext, useEffect calls /api/auth/me on mount, login/logout helpers |
| `client/src/components/ProtectedRoute.tsx` | VERIFIED | useAuth hook, Navigate to /login when not authenticated |
| `client/src/pages/LoginPage.tsx` | VERIFIED | form submits via login(), navigate('/') on success |
| `client/src/pages/RegisterPage.tsx` | VERIFIED | inviteToken field, optional for first user, POSTs to /api/auth/register |
| `client/src/pages/SessionsPage.tsx` | VERIFIED | isCurrentDevice rendering, Terminate button (disabled for current), fetches from /api/auth/sessions |
| `client/src/lib/api.ts` | VERIFIED | auth/refresh call in 401 interceptor, retry original request after refresh |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `plugins/auth.ts` | `@fastify/cookie` | register before @fastify/jwt | WIRED | Line 21: `await fastify.register(fastifyCookie)` before line 22: `fastifyJwt` |
| `index.ts` | `plugins/auth.ts` | `fastify.register(authPlugin)` | WIRED | `index.ts:16`: `app.register(authPlugin)` |
| `routes/auth/login.ts` | `db/schema.ts (sessions)` | db.insert(sessions) with all extended columns | WIRED | Lines 78-86: inserts token_hash, device_label, user_agent, ip_address, last_seen_at, expires_at |
| `routes/auth/refresh.ts` | sessions table | SELECT FOR UPDATE in transaction | WIRED | Lines 22-24: `sql\`SELECT * FROM sessions WHERE token_hash = ${tokenHash} FOR UPDATE\`` |
| `routes/auth/register.ts` | `db/schema.ts (invites)` | db.update(invites) after user created | WIRED | Lines 118-124: tx.update(invites).set({ used_by, used_at }) |
| `routes/ws/index.ts` | `plugins/auth.ts` | preValidation: [fastify.authenticate] | WIRED | Line 13: `addHook('preValidation', async (req, reply) => { await fastify.authenticate(req, reply) })` |
| `routes/ws/index.ts` | `@fastify/websocket` | `websocket: true` | WIRED | Line 17: `fastify.get('/ws', { websocket: true }, ...)` |
| `contexts/AuthContext.tsx` | `/api/auth/me` | fetch on mount | WIRED | Lines 25-29: `apiFetch('/api/auth/me')` in useEffect |
| `lib/api.ts` | `/api/auth/refresh` | 401 interceptor | WIRED | Line 29: `fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })` |
| `ProtectedRoute.tsx` | `contexts/AuthContext.tsx` | useAuth() hook | WIRED | Line 2: `import { useAuth } from '../hooks/useAuth'`; useAuth() called line 5 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SessionsPage.tsx` | `sessions` (state) | `apiFetch('/api/auth/sessions')` → `sessions.ts` GET handler → `db.select().from(sessions).where(eq(sessions.user_id, userId))` | Yes — DB query with user filter | FLOWING |
| `AuthContext.tsx` | `user` (state) | `apiFetch('/api/auth/me')` → `me.ts` → `db.select({ id, username, email }).from(users).where(eq(users.id, userId))` | Yes — DB select by authenticated user ID | FLOWING |
| `LoginPage.tsx` | form only — no data fetch, writes only | `login()` → POST /api/auth/login → server issues cookies | N/A (write path) | N/A |
| `RegisterPage.tsx` | form only — no data fetch, writes only | POST /api/auth/register | N/A (write path) | N/A |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — server requires a running PostgreSQL instance; no in-process runnable entry points.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 02-01, 02-02, 02-04 | User can register with email and password | SATISFIED | register.ts (server) + RegisterPage.tsx (client), argon2id hashing, invite system |
| AUTH-02 | 02-01, 02-02, 02-04 | User can log in and receive JWT access + refresh tokens | SATISFIED | login.ts issues dual httpOnly cookies; AuthContext.tsx handles client flow |
| AUTH-03 | 02-01, 02-02, 02-04 | Session persists across browser restarts via refresh token | SATISFIED (code) / ? Human | refresh_token cookie has maxAge: 2592000; api.ts 401 interceptor calls /api/auth/refresh transparently |
| AUTH-04 | 02-01, 02-02, 02-04 | User can log out from current session | SATISFIED | logout.ts deletes session row + clears both cookies; AuthContext.logout() calls POST /api/auth/logout |
| AUTH-05 | 02-01, 02-02, 02-04 | User can view and terminate active sessions on other devices | SATISFIED | sessions.ts returns list with isCurrentDevice; SessionsPage.tsx renders Terminate button (blocked on current device) |
| INFRA-03 | 02-01, 02-03 | WebSocket authentication enforced at handshake | SATISFIED | ws/index.ts addHook preValidation calls fastify.authenticate — rejects upgrade before socket allocation |

No orphaned requirements — all 6 IDs appear in plan frontmatter and have implementation evidence.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server/src/routes/ws/index.ts` | 23 | `// Placeholder handlers — Phase 3 will implement full message routing` | Info | Expected — WS stub is intentional per plan 02-03 objective. Auth enforcement is complete; message routing is Phase 3 scope. |
| `client/src/App.tsx` | 19-22 | `<h2>Chat (Phase 3)</h2>` placeholder main page | Info | Expected — main chat UI is Phase 3. Auth flows are complete; the "/" route is a temporary placeholder acknowledged in the plan. |

No blockers found. Both anti-patterns are intentional stubs for Phase 3 scope, not incomplete Phase 2 work.

---

### Notable Design Observations

**refresh_token cookie path is `/api/auth/refresh` (not `/auth/refresh`):** The backend registers the route at `/auth/refresh` but sets the cookie with `path: '/api/auth/refresh'`. The Caddyfile strips the `/api` prefix before forwarding to the backend (line 17-20 of Caddyfile). So from the browser's perspective the URL is `/api/auth/refresh`, which matches the cookie path. This is correct and consistent — the cookie will be sent by the browser to the backend's actual endpoint.

**WS auth uses `addHook` not route-level `preValidation`:** `ws/index.ts` uses `fastify.addHook('preValidation', ...)` instead of `{ preValidation: [fastify.authenticate] }` in the route options. This is correct — it applies the hook to all routes in the encapsulated ws scope (just `/ws` in this case), achieving the same result while allowing easy expansion of ws routes in Phase 3.

---

### Human Verification Required

#### 1. End-to-end Registration + Invite Flow

**Test:** Start the Docker Compose stack (`docker compose up`). Navigate to `https://<host>/register`. Submit the form with no invite token (first user). Then run `docker compose exec api npm run invite` to generate an invite. Register a second user using that token. Try registering a third user without a token — should get a 400 error.

**Expected:** First registration creates user and redirects to `/login`. Second registration with valid token succeeds. Registration without token returns `{ error: 'Invite token is required' }`.

**Why human:** Cannot run PostgreSQL + Node.js server in this verification environment. All code paths are fully implemented; correctness requires a live stack.

#### 2. Session Persistence Across Browser Restart

**Test:** Log in at `https://<host>/login`. Note the "This device" badge in `/settings/sessions`. Close the browser window entirely (not just the tab). Reopen the browser and navigate to `https://<host>/`. Confirm you land on the chat page, not `/login`.

**Expected:** User remains logged in. The expired access_token triggers the 401 interceptor in `api.ts`, which calls `POST /api/auth/refresh` with the persisted `refresh_token` cookie (maxAge 30 days survives browser close), receives new cookies, and retries the original `/api/auth/me` call — all transparent to the user.

**Why human:** Browser cookie survival across a full browser close requires a real browser. Code correctness (maxAge set, interceptor wired) is verified; actual browser behavior must be confirmed.

---

### Gaps Summary

No gaps. All 18 must-haves verified at all applicable levels (existence, substance, wiring, data flow). The 2 human verification items are runtime/browser confirmation of code that is correctly implemented — they are not gaps blocking goal achievement.

---

_Verified: 2026-04-09_
_Verifier: Claude (gsd-verifier)_
