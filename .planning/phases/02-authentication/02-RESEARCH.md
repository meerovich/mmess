# Phase 2: Authentication - Research

**Researched:** 2026-04-09
**Domain:** JWT auth, Argon2id password hashing, refresh token rotation, WebSocket auth-at-handshake, session management
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Invite-based registration — admin generates one-time invite tokens; no open signup
- **D-02:** First user on a fresh database auto-provisions as admin; all subsequent users require invite
- **D-03:** Registration fields: email, password, username (display name)
- **D-04:** No email verification in v1 (no SMTP dependency)
- **D-05:** Password hashing with `argon2` (Argon2id variant, OWASP 2025 default parameters: 19MB memory, 2 iterations, parallelism 1)
- **D-06:** Invite tokens are single-use, expire after 7 days, stored hashed in DB (new `invites` table)
- **D-07:** JWT for access tokens, random opaque tokens for refresh (stored in `sessions` table)
- **D-08:** Access token TTL: 15 minutes
- **D-09:** Refresh token TTL: 30 days (rolling — extended on use)
- **D-10:** Access token stored in httpOnly `access_token` cookie (path=/, SameSite=Lax, Secure in prod)
- **D-11:** Refresh token stored in httpOnly `refresh_token` cookie (path=/api/auth/refresh, SameSite=Lax, Secure in prod)
- **D-12:** CSRF protection via SameSite=Lax (sufficient for this app's flows — no cross-site POSTs expected)
- **D-13:** `@fastify/jwt` for JWT signing and verification; secret loaded from `JWT_SECRET` env var
- **D-14:** WS handshake validates JWT from `access_token` cookie at the HTTP upgrade request
- **D-15:** Reject with HTTP 401 before allocating connection if token is missing, expired, or invalid
- **D-16:** User ID extracted from JWT claim and attached to the socket context; never trust client-sent user IDs
- **D-17:** Active sessions list shows: device label (User-Agent parsed to "Chrome on macOS"), IP address, created_at, last_seen_at, "this device" marker
- **D-18:** User can terminate any session except current (must log out to terminate current)
- **D-19:** Terminating a session deletes the row from `sessions` table and invalidates the refresh token
- **D-20:** `sessions` schema needs extending: add `user_agent`, `ip_address`, `last_seen_at` columns
- **D-22:** Login endpoint rate-limited via `@fastify/rate-limit`: 5 attempts per IP per minute, 15-minute lockout after threshold
- **D-23:** Registration endpoint rate-limited: 3 attempts per IP per hour

### Claude's Discretion

- Exact Fastify plugin wiring and middleware ordering
- Specific JWT payload structure (beyond `sub` = user_id)
- Argon2 tuning parameters (use OWASP 2025 defaults)
- Error response format (follow Fastify's schema validation errors)
- UI layout for login/register/sessions pages — will be handled during execution

### Deferred Ideas (OUT OF SCOPE)

- Password reset flow via email — deferred to v2 when SMTP infrastructure is added
- Email verification on registration — deferred to v2
- 2FA/TOTP — not planned for v1 or v2 (personal use, invite-gated)
- OAuth/social login — explicitly out of scope per REQUIREMENTS.md
- Password strength meter UI — rely on minimum length validation for v1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can register with email and password | Invite-based flow + Argon2id hashing + `invites` table schema |
| AUTH-02 | User can log in and receive JWT access + refresh tokens | @fastify/jwt sign + opaque refresh token, dual httpOnly cookies |
| AUTH-03 | User session persists across browser restarts via refresh token | Refresh token in httpOnly cookie (path restricted), rolling 30-day rotation |
| AUTH-04 | User can log out from current session | DELETE session row + clear both cookies |
| AUTH-05 | User can view and terminate active sessions on other devices | Sessions list endpoint + ua-parser-js device labels + terminate endpoint |
| INFRA-03 | WebSocket authentication enforced at handshake (JWT validation) | preValidation hook reads access_token cookie, rejects with 401 before WS allocation |
</phase_requirements>

---

## Summary

Phase 2 builds the complete authentication layer on top of the existing Fastify 5 + PostgreSQL + Drizzle foundation. The locked decisions are prescriptive: `@fastify/jwt` + `@fastify/cookie` handle the dual-token cookie mechanism; `argon2` with OWASP 2025 parameters handles password hashing; opaque refresh tokens stored hashed in the `sessions` table provide session management.

The most technically interesting constraints are (1) refresh token rotation with race condition prevention using a PostgreSQL `SELECT ... FOR UPDATE` lock inside a Drizzle transaction, and (2) WebSocket auth-at-handshake using `@fastify/websocket`'s standard hook lifecycle — Fastify's `preValidation` hook fires before the WebSocket upgrade is accepted, so JWT rejection returns HTTP 401 without allocating a socket.

The frontend starts from a blank React 19 + Vite SPA. React Router 6 `<Outlet>`-based protected routes and a single `AuthContext` are the standard pattern for this stack. The `sessions` table needs three new columns before any auth logic is written; the schema change triggers a new Drizzle migration.

**Primary recommendation:** Register `@fastify/cookie` globally (via `fastify-plugin` to escape encapsulation), register `@fastify/jwt` globally with `cookie.cookieName: 'access_token'`, and build a separate `jwtVerify` decorator that the WS preValidation hook can reuse. Refresh tokens bypass `@fastify/jwt` entirely — they are raw crypto random strings looked up against `token_hash` in the DB.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/jwt` | 10.0.0 | JWT sign/verify, cookie extraction | Official Fastify plugin, hooks into request lifecycle, TypeScript module augmentation for `request.user` |
| `@fastify/cookie` | 11.0.2 | Cookie read/write, httpOnly + SameSite options | Required peer dep for `@fastify/jwt` cookie mode; official Fastify plugin |
| `@fastify/rate-limit` | 10.3.0 | Per-endpoint rate limiting + ban threshold | Official Fastify plugin, `ban` option enables 15-min lockout semantics |
| `argon2` | 0.44.0 | Argon2id password hashing | OWASP 2025 gold standard, memory-hard against GPU attacks |
| `ua-parser-js` | 2.0.9 | User-Agent → "Chrome on macOS" label | 11 KB minified, actively maintained, Node.js + browser isomorphic |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 5.1.7 | Cryptographically secure opaque refresh tokens | URL-safe, 128-bit entropy default — no need for `crypto.randomBytes` + hex manually |
| `fastify-plugin` | (already transitive) | Escape Fastify encapsulation for global plugins | Required so `@fastify/cookie` and `@fastify/jwt` decorators are visible across all route plugins |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@fastify/jwt` | raw `jsonwebtoken` | `jsonwebtoken` v9.0.3 is available but requires manual Fastify integration; `@fastify/jwt` adds `request.jwtVerify()` + `reply.jwtSign()` with no boilerplate |
| `nanoid` | `crypto.randomBytes(32).toString('hex')` | Both are fine; `nanoid` is slightly shorter (21 chars default) and URL-safe |
| `ua-parser-js` | `bowser` | `bowser` is browser-only; `ua-parser-js` runs in Node.js for server-side label generation |

**Installation (new packages to add):**
```bash
# From server/ workspace
npm install @fastify/cookie @fastify/rate-limit argon2 ua-parser-js nanoid
```

`@fastify/jwt` is already listed in `server/package.json` (^9.0.0 — note: latest is 10.0.0, version bump needed).

---

## Architecture Patterns

### Recommended Project Structure

```
server/src/
├── plugins/
│   ├── auth.ts          # registers @fastify/jwt + @fastify/cookie globally (fastify-plugin)
│   └── rate-limit.ts    # registers @fastify/rate-limit globally
├── routes/
│   └── auth/
│       ├── index.ts     # mounts all auth routes under /auth
│       ├── register.ts  # POST /auth/register
│       ├── login.ts     # POST /auth/login
│       ├── refresh.ts   # POST /auth/refresh
│       ├── logout.ts    # POST /auth/logout
│       └── sessions.ts  # GET /auth/sessions, DELETE /auth/sessions/:id
├── db/
│   ├── schema.ts        # EXTEND sessions table + ADD invites table
│   └── migrate.ts       # already exists
└── index.ts             # register plugins + routes
```

```
client/src/
├── contexts/
│   └── AuthContext.tsx   # user state, login/logout helpers, token refresh coordination
├── hooks/
│   └── useAuth.ts        # consumes AuthContext
├── components/
│   └── ProtectedRoute.tsx # wraps Outlet, redirects to /login if no user
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   └── SessionsPage.tsx
└── main.tsx              # BrowserRouter + AuthProvider + route tree
```

---

### Pattern 1: @fastify/jwt + @fastify/cookie Plugin Registration

Register both plugins globally using `fastify-plugin` so decorators are visible in all route scopes:

```typescript
// server/src/plugins/auth.ts
import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'

export default fp(async (fastify) => {
  await fastify.register(fastifyCookie)
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  })

  // Decorator for routes that require auth
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify({ onlyCookie: true })
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })
})

// TypeScript: augment request.user type
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; username: string }
    user: { sub: string; username: string }
  }
}
```

**Key detail:** `onlyCookie: true` in `jwtVerify` restricts extraction to the `access_token` cookie only — prevents Authorization header bypass. The cookie plugin must be registered before the JWT plugin.

---

### Pattern 2: Dual-Cookie Token Issuance at Login

Access token in `access_token` cookie (path=/), refresh token in `refresh_token` cookie (path=/api/auth/refresh):

```typescript
// After successful credential check:
const accessToken = await reply.jwtSign(
  { sub: user.id, username: user.username },
  { expiresIn: '15m' }
)

const refreshToken = nanoid(32) // opaque, 32 URL-safe chars = ~192 bits entropy
const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex')

// Store hash in sessions table (never store raw token)
await db.insert(sessions).values({
  user_id: user.id,
  token_hash: refreshTokenHash,
  device_label: parseUserAgent(request.headers['user-agent']),
  ip_address: request.ip,
  last_seen_at: new Date(),
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
})

const isProduction = process.env.NODE_ENV === 'production'

reply
  .setCookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })
  .setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth/refresh',  // Caddy strips /api prefix → backend sees /auth/refresh
    maxAge: 30 * 24 * 60 * 60,
  })
  .send({ ok: true })
```

**Caddy path note:** The Caddyfile strips the `/api` prefix before proxying (established in Phase 1: `uri strip_prefix /api`). The `refresh_token` cookie's `path` must be `/api/auth/refresh` as seen by the **browser** — this is the external path before Caddy strips it. Verify this matches the Caddyfile configuration.

---

### Pattern 3: Refresh Token Rotation with Race-Condition Safety

Race conditions occur when concurrent tab refreshes both attempt to rotate the same token. Prevention: use PostgreSQL `SELECT ... FOR UPDATE` inside a Drizzle transaction to serialize access.

```typescript
// POST /auth/refresh handler
const rawToken = request.cookies.refresh_token
if (!rawToken) return reply.code(401).send({ error: 'No refresh token' })

const tokenHash = createHash('sha256').update(rawToken).digest('hex')

await db.transaction(async (tx) => {
  // Lock the row — concurrent refresh requests queue behind this lock
  const [session] = await tx.execute(
    sql`SELECT * FROM sessions WHERE token_hash = ${tokenHash} FOR UPDATE`
  )

  if (!session || session.expires_at < new Date()) {
    throw new Error('Invalid or expired refresh token')
  }

  const newRefreshToken = nanoid(32)
  const newHash = createHash('sha256').update(newRefreshToken).digest('hex')

  await tx.update(sessions)
    .set({
      token_hash: newHash,
      last_seen_at: new Date(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .where(eq(sessions.id, session.id))

  // Issue new access token + set new cookies on reply
  // (reply object must be closed over from the outer scope)
  newRefreshTokenForCookie = newRefreshToken
  userId = session.user_id
})

// Set cookies after transaction commits
```

**Why not JWT for refresh tokens:** Refresh tokens are looked up in the DB on every use anyway. An opaque random string hashed with SHA-256 is simpler, leaks no information if intercepted in logs, and requires no signature verification overhead.

---

### Pattern 4: WebSocket Authentication at Handshake

`@fastify/websocket` routes run the full Fastify hook lifecycle before upgrading. Use `preValidation` (not `onRequest`) so that `@fastify/cookie` has already parsed cookies into `request.cookies`:

```typescript
// In the WebSocket route plugin (Phase 3 will own this handler,
// but auth enforcement is set up in Phase 2)
fastify.addHook('preValidation', async (request, reply) => {
  // Only applies to WS upgrade requests to /ws — scope via plugin encapsulation
  await fastify.authenticate(request, reply)
})

fastify.get('/ws', { websocket: true }, (socket, request) => {
  // request.user.sub is guaranteed set — auth passed
  const userId = request.user.sub
  socket.on('message', (msg) => { /* Phase 3 */ })
})
```

**Hook timing:** The `preValidation` hook fires after `onRequest` (where cookies are parsed by `@fastify/cookie`) and before the WebSocket upgrade is accepted. A `reply.code(401).send()` in this hook returns an HTTP 401 to the client — no WebSocket connection is created.

**Scoping:** Register the WS preValidation hook inside the WS route plugin only (not globally) to avoid requiring auth on public routes like `/health` and `/api/auth/*`.

---

### Pattern 5: Rate Limiting Login Endpoint

```typescript
fastify.post('/auth/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute',
      ban: 15,  // After 15 violations (3 minutes of hitting the limit) → 403 for 15 min
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (_request, context) => ({
        statusCode: context.ban ? 403 : 429,
        error: context.ban ? 'Forbidden' : 'Too Many Requests',
        message: context.ban
          ? 'Too many failed attempts. Try again in 15 minutes.'
          : `Rate limit exceeded, retry in ${context.after}`,
      }),
    }
  }
}, loginHandler)
```

**Note on ban semantics:** `@fastify/rate-limit`'s `ban` option counts how many times a key has exceeded the `max` limit (not raw request count). With `max: 5` and `ban: 15`, a client gets banned after 15 rate-limit violations — effectively after 5 × 15 = 75 excess requests in the window. For a tighter lockout, set `ban: 1` (ban immediately on first violation after hitting the limit). The decision log says "15-minute lockout after threshold" — implement with `ban: 1` + a `timeWindow` of 15 minutes on the ban itself, OR use a custom in-memory store. The simplest correct implementation: `max: 5, timeWindow: '1 minute', ban: 3` so after 3 rate-limit trips (within 1 minute each) the IP gets a 403.

---

### Pattern 6: React Router 6 Protected Routes

```tsx
// client/src/components/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null  // Avoid flash-redirect during initial token check
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}

// client/src/main.tsx route tree
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/:inviteToken" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<ChatLayout />} />
        <Route path="/settings/sessions" element={<SessionsPage />} />
      </Route>
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

**AuthContext responsibilities:** `user` state (null = logged out), `loading` flag for initial `/api/auth/me` check on mount, `login()` and `logout()` helpers. The context does NOT manage the refresh token — that lives in the httpOnly cookie and is handled transparently by the backend's `/api/auth/refresh` endpoint on 401 responses.

**Token refresh strategy for the SPA:** On any API call that returns 401, the client makes one attempt to call `/api/auth/refresh` (silently), then retries the original request. If the refresh also returns 401, redirect to `/login`. Implement this as a fetch wrapper or Axios interceptor — not inside AuthContext.

---

### Pattern 7: ua-parser-js Device Label

```typescript
import { UAParser } from 'ua-parser-js'

function parseUserAgent(ua: string | undefined): string {
  if (!ua) return 'Unknown device'
  const parser = new UAParser(ua)
  const browser = parser.getBrowser().name ?? 'Unknown browser'
  const os = parser.getOS().name ?? 'Unknown OS'
  return `${browser} on ${os}`  // e.g. "Chrome on macOS"
}
```

`ua-parser-js` v2 introduced a breaking change: the constructor now takes the UA string directly (not set via `setUA()`), and `getResult()` is still available but individual getters (`getBrowser()`, `getOS()`) remain the same API.

---

### Pattern 8: Drizzle Schema Extension — sessions + invites

```typescript
// Extend existing sessions table (new migration)
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  device_label: varchar('device_label', { length: 100 }),
  // NEW columns for D-20:
  user_agent: text('user_agent'),
  ip_address: varchar('ip_address', { length: 45 }),   // IPv6 max 45 chars
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
}, (t) => ({
  idx_user_sessions: index('idx_sessions_user').on(t.user_id),
}))

// NEW invites table for D-06
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  token_hash: text('token_hash').notNull().unique(),   // store hash, send raw
  created_by: uuid('created_by').notNull().references(() => users.id),
  used_by: uuid('used_by').references(() => users.id),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  ...timestamps(),
})
```

**Migration note:** Drizzle detects schema diffs via `drizzle-kit generate`. Since `sessions` already exists in the DB from Phase 1, `drizzle-kit generate` will produce an `ALTER TABLE sessions ADD COLUMN` migration — not a drop/recreate. This is safe. Auto-migration on startup (established in Phase 1) will apply it.

---

### Anti-Patterns to Avoid

- **JWT refresh tokens:** Never make the refresh token a JWT. It's looked up in the DB on every use; opaque random strings are simpler and leak no information.
- **Token in URL query param:** PITFALLS.md #11 — tokens in URLs appear in server logs, browser history, and Referrer headers. Always use cookies.
- **Trust client-sent user ID in WS messages:** PITFALLS.md #3 and D-16 — extract user identity from the verified JWT claim only; never from the message payload.
- **Global preValidation hook for WS auth:** Scoping the hook inside the WS plugin prevents it from firing on `/api/auth/*` routes that need to be unauthenticated.
- **Cookie path for refresh token set to `/`:** The refresh token path `/api/auth/refresh` ensures the browser only sends it on that specific endpoint, not on every API call — minimizes exposure window.
- **Storing raw refresh token in DB:** Always store SHA-256 hash; if the DB is dumped, raw tokens remain valid for 30 days.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT sign/verify | Custom HMAC logic | `@fastify/jwt` | Algorithm confusion attacks, exp/iat validation edge cases |
| Cookie parsing | Manual `request.headers.cookie` split | `@fastify/cookie` | Encoding edge cases, multi-value cookies, signing support |
| Rate limiting | In-memory Map + setTimeout cleanup | `@fastify/rate-limit` | Proper TTL management, X-RateLimit headers, ban semantics, cluster-safe |
| Password hashing | SHA-256 or MD5 | `argon2` Argon2id | No work factor, no salt, trivially GPU-crackable |
| UA string parsing | Manual regex split | `ua-parser-js` | 2000+ UA string patterns; regex will miss mobile Chrome, Samsung Internet, etc. |
| Opaque token generation | `Math.random()` or `Date.now()` | `nanoid` or `crypto.randomBytes` | Not cryptographically secure; predictable |

**Key insight:** The auth domain has a long tail of subtle security bugs in custom implementations. Every hand-rolled component above has a known class of exploits that the library already handles.

---

## Common Pitfalls

### Pitfall A: @fastify/cookie Must Register Before @fastify/jwt

**What goes wrong:** `@fastify/jwt` with `cookie` config depends on `request.cookies` being populated by `@fastify/cookie`. If JWT is registered first, cookie-based token extraction silently fails — requests get 401 on every protected route even with valid cookies.

**How to avoid:** Always `register(fastifyCookie)` before `register(fastifyJwt, { cookie: ... })`. Keep both in the same plugin file in dependency order.

**Warning signs:** `request.jwtVerify()` throws even though the browser is sending the cookie; `request.cookies` is undefined in the JWT plugin.

---

### Pitfall B: Caddy /api Prefix Strip + Refresh Cookie Path Mismatch

**What goes wrong:** The refresh token cookie is set with `path: '/api/auth/refresh'` (browser-visible path). Caddy strips `/api` before proxying to backend. If the backend route is registered at `/auth/refresh` and the cookie path is `/auth/refresh`, the browser never sends the cookie to `/api/auth/refresh` because the paths don't match.

**How to avoid:** The cookie `path` must match what the **browser** sends the request to, not what the backend sees. Since the browser hits `https://host/api/auth/refresh` and Caddy strips `/api` before proxying, the cookie `path` must be `/api/auth/refresh`.

**Verification:** After login, inspect the cookie in DevTools → Application → Cookies. The path shown there must match the URL the browser calls for refresh.

---

### Pitfall C: Refresh Token Rotation Race Condition

**What goes wrong:** Two browser tabs simultaneously hit 401 and both call `/api/auth/refresh`. The first rotation succeeds; the second attempt uses the now-invalidated old token and gets 401, triggering a forced logout even though the user is actively using the app.

**How to avoid:** Use `SELECT ... FOR UPDATE` inside a Drizzle transaction on the sessions row. The second concurrent request blocks until the first transaction commits, then finds `token_hash` changed and returns 401 gracefully. The frontend should serialize refresh calls — queue the second tab's 401 retry behind the first refresh completion.

**Severity for this app:** Low. Small user base with few concurrent tabs. But the pattern is cheap to implement correctly and avoids confusing session invalidations.

---

### Pitfall D: preValidation vs onRequest for WebSocket Auth

**What goes wrong:** Using `onRequest` for cookie-based JWT verification fails because `@fastify/cookie` populates `request.cookies` during `onRequest` — but plugin registration order determines which `onRequest` hook runs first. If auth runs before cookie parsing, `request.cookies` is empty.

**How to avoid:** Use `preValidation` for WebSocket auth. By `preValidation`, all `onRequest` hooks (including cookie parsing) have completed. `request.cookies.access_token` is reliably available.

**Confirmed by:** `@fastify/websocket` README states routes "run any hooks that have been registered" — the full lifecycle applies including `preValidation`.

---

### Pitfall E: users Table Missing is_admin Column

**What goes wrong:** D-02 requires the first user to be auto-provisioned as admin. The existing `users` table has no `is_admin` column. Implementing admin features without the column means a second schema migration mid-phase or runtime errors.

**How to avoid:** Add `is_admin: boolean('is_admin').notNull().default(false)` to the `users` table in the same migration that adds the `sessions` columns and creates the `invites` table. Do all schema changes in a single migration wave at the start of Phase 2.

---

### Pitfall F: @fastify/rate-limit ban Option Semantics

**What goes wrong:** The `ban` option counts rate-limit violations, not raw requests. `ban: 15` means the IP must hit the rate limit 15 separate times before being banned — that's potentially 75+ requests with `max: 5`. This is far too permissive for a login endpoint.

**How to avoid:** Use `ban: 1` (ban immediately after the first violation) combined with `timeWindow: '15 minutes'` so the ban itself lasts 15 minutes. Or use `max: 5, timeWindow: '15 minutes'` without `ban` — this imposes a hard 5-attempt cap per 15 minutes, which matches D-22 intent exactly.

---

### Pitfall G: Argon2 npm Package — Not argon2-browser

**What goes wrong:** The `argon2` npm package (RealNickk's) is a Node.js native addon. It requires compilation during `npm install` inside Docker. If the Docker image does not have `python3` + `make` + `g++` (build tools), the install fails silently or falls back to a slower JS implementation.

**How to avoid:** Use `node:22-alpine` base image and add `RUN apk add --no-cache python3 make g++` before `npm ci` in the Dockerfile. Verify by checking that the native `.node` file exists in `node_modules/argon2/` after build. Alternatively, use `@node-rs/argon2` which ships pre-built binaries for common platforms (but is a different package).

**Current state:** Phase 1's Dockerfile for the backend already runs `npm ci` in a node:22-alpine container. The Dockerfile should be checked to confirm build tools are present.

---

## CSRF Assessment

**Decision D-12 verdict: SameSite=Lax is sufficient for this specific application.** Reasoning:

1. This is a same-origin SPA — all API calls originate from `https://same-domain`, not cross-site. SameSite=Lax only matters when a different origin attempts a cross-site POST.
2. No embeddable widgets, iframes, or third-party integrations exist.
3. The attack surface requires a malicious site the user visits to make a POST to `https://messenger-host/api/auth/login` — meaningless since the attacker doesn't benefit from logging the victim in.
4. OWASP recommends double-submit as "defense in depth," not as a minimum requirement. For a personal invite-gated messenger with no sensitive same-site GET triggers, SameSite=Lax alone satisfies the threat model.

**Do not implement double-submit pattern** — it adds complexity (non-httpOnly CSRF cookie, custom header on every request) for zero practical security gain in this deployment scenario.

---

## Code Examples

### Argon2id Hash and Verify

```typescript
// Source: argon2 npm README + OWASP Password Storage Cheat Sheet
import argon2 from 'argon2'

// Hash on registration
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,   // 19 MiB — OWASP minimum
  timeCost: 2,         // 2 iterations
  parallelism: 1,
})

// Verify on login
const valid = await argon2.verify(storedHash, password)
// argon2.verify returns boolean; throws on malformed hash
```

### JWT Payload Structure (Claude's discretion)

```typescript
// Minimal payload — only what's needed in handlers
interface JwtPayload {
  sub: string        // user.id (UUID)
  username: string   // for display without DB lookup
  iat: number        // issued-at (auto-set by @fastify/jwt)
  exp: number        // expiry (auto-set)
}
```

### Invite Token Generation (admin CLI)

```typescript
// npm run invite → server/src/scripts/create-invite.ts
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'

const rawToken = nanoid(32)
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

await db.insert(invites).values({ token_hash: tokenHash, created_by: adminId, expires_at: expiresAt })

console.log(`Invite URL: https://host/register/${rawToken}`)
// Print raw token once; only hash stored in DB
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt for password hashing | Argon2id | PHC 2015, OWASP updated 2023+ | Argon2id is memory-hard; bcrypt is still secure at cost≥12 but inferior against GPU farms |
| JWT refresh tokens (long-lived JWT) | Opaque random token for refresh | Industry shift ~2020 | Opaque token hashed in DB = instant revocation; JWT refresh cannot be revoked without a denylist |
| Stateful server sessions | JWT access + opaque refresh hybrid | 2018–present | JWT avoids per-request DB lookup for access; opaque refresh enables clean session termination |
| `@fastify/jwt` v8/v9 | v10.0.0 (current) | 2024 | server/package.json has `^9.0.0`; v10 is the latest — update the constraint |

**Deprecated / Outdated:**
- `express-session` + Redis for WebSocket auth: requires per-message DB lookup or session store lookup; JWT eliminates this at WS connection time.
- Token in `Authorization` header for WebSockets: Browsers cannot set custom headers on WebSocket upgrade requests; cookies are the correct mechanism.
- `passport.js`: Heavy abstraction for simple email+password auth; unnecessary given direct `argon2` + `@fastify/jwt` usage.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Backend runtime | Already containerized in Phase 1 | 22.x | — |
| PostgreSQL 16 | Sessions + users + invites tables | Running in Docker Compose from Phase 1 | 16.x | — |
| `argon2` native build tools (python3, make, g++) | argon2 npm compilation | Unknown — Dockerfile must be verified | — | Use `@node-rs/argon2` (pre-built binaries) if build tools absent |

**Missing dependencies with no fallback:**
- None that block execution.

**Missing dependencies with fallback:**
- `argon2` native compilation: if Alpine image lacks build tools, add `RUN apk add --no-cache python3 make g++` to server Dockerfile, or switch to `@node-rs/argon2` which ships pre-compiled WASM/native binaries for Linux/macOS/Windows without build tools.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — Wave 0 must install |
| Config file | Wave 0: `server/vitest.config.ts` |
| Quick run command | `npm run test --workspace=server -- --run` |
| Full suite command | `npm run test --workspace=server -- --run --reporter=verbose` |

No test files exist in the repo outside node_modules. The client has no test scripts. Server `package.json` has no `test` script.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | POST /auth/register creates user with hashed password | Integration | `vitest run server/src/routes/auth/register.test.ts` | Wave 0 |
| AUTH-01 | Invite token validated and consumed on register | Integration | same file | Wave 0 |
| AUTH-01 | First user auto-provisioned as admin (no invite required) | Integration | same file | Wave 0 |
| AUTH-02 | POST /auth/login sets access_token + refresh_token cookies | Integration | `vitest run server/src/routes/auth/login.test.ts` | Wave 0 |
| AUTH-02 | Wrong password returns 401 | Integration | same file | Wave 0 |
| AUTH-03 | POST /auth/refresh rotates refresh token and sets new cookies | Integration | `vitest run server/src/routes/auth/refresh.test.ts` | Wave 0 |
| AUTH-03 | Expired refresh token returns 401 | Integration | same file | Wave 0 |
| AUTH-04 | POST /auth/logout clears cookies and deletes session | Integration | `vitest run server/src/routes/auth/logout.test.ts` | Wave 0 |
| AUTH-05 | GET /auth/sessions returns device list with labels | Integration | `vitest run server/src/routes/auth/sessions.test.ts` | Wave 0 |
| AUTH-05 | DELETE /auth/sessions/:id removes session, blocks own-session termination | Integration | same file | Wave 0 |
| INFRA-03 | WS upgrade with invalid/missing cookie returns HTTP 401 | Integration | `vitest run server/src/routes/ws.test.ts` | Wave 0 |
| INFRA-03 | WS upgrade with valid cookie establishes connection | Integration | same file | Wave 0 |

**Testing strategy note:** Integration tests against a real PostgreSQL instance (Docker) are more valuable here than unit tests with mocked DB. Use `@testcontainers/postgresql` or a dedicated `TEST_DATABASE_URL` pointing at the dev Compose DB.

### Sampling Rate

- **Per task commit:** `npm run test --workspace=server -- --run` (fast, all auth tests)
- **Per wave merge:** same (no separate slow suite yet)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `server/vitest.config.ts` — test framework config
- [ ] `server/package.json` — add `"test": "vitest"` script + `vitest` devDependency
- [ ] `server/src/routes/auth/register.test.ts`
- [ ] `server/src/routes/auth/login.test.ts`
- [ ] `server/src/routes/auth/refresh.test.ts`
- [ ] `server/src/routes/auth/logout.test.ts`
- [ ] `server/src/routes/auth/sessions.test.ts`
- [ ] `server/src/routes/ws.test.ts`
- [ ] `server/src/test/helpers.ts` — shared test DB setup/teardown

---

## Open Questions

1. **Dockerfile build tools for argon2**
   - What we know: Phase 1 Dockerfile uses `node:22-alpine`; `argon2` npm requires native compilation
   - What's unclear: Whether `python3 make g++` are already in the image
   - Recommendation: Wave 0 task should verify Dockerfile and add build tools or switch to `@node-rs/argon2` pre-built

2. **@fastify/jwt version in server/package.json**
   - What we know: `server/package.json` lists `"@fastify/jwt": "^9.0.0"`; latest is v10.0.0
   - What's unclear: Whether v9 → v10 has breaking changes relevant to this implementation
   - Recommendation: Update to `^10.0.0` at the start of Phase 2; verify changelog for breaking changes (likely none for the patterns used here)

3. **Refresh cookie path and Caddy uri strip**
   - What we know: Phase 1 Caddyfile strips `/api` prefix; cookie path must be browser-visible path
   - What's unclear: Whether Phase 3 WebSocket path (`/ws`) is also under `/api` or at root
   - Recommendation: Document and verify cookie path in Phase 2 integration tests by inspecting Set-Cookie headers directly

---

## Sources

### Primary (HIGH confidence)

- `@fastify/jwt` GitHub README + types/jwt.d.ts — cookie config, `onlyCookie`, TypeScript augmentation
- `@fastify/cookie` GitHub README — httpOnly/SameSite/Secure options, registration order
- `@fastify/websocket` GitHub README — preValidation hook timing for WS handshake auth
- `@fastify/rate-limit` GitHub README — `ban` semantics, `keyGenerator`, `errorResponseBuilder`
- OWASP Password Storage Cheat Sheet 2025 — Argon2id: memoryCost 19456, timeCost 2, parallelism 1
- Drizzle ORM Transactions docs — `db.transaction()` + isolation levels; `sql` template for raw `FOR UPDATE`

### Secondary (MEDIUM confidence)

- npm registry versions verified: `@fastify/cookie@11.0.2`, `@fastify/rate-limit@10.3.0`, `argon2@0.44.0`, `ua-parser-js@2.0.9`, `@fastify/jwt@10.0.0`, `nanoid@5.1.7`
- Fastify Hooks reference — preValidation vs onRequest lifecycle ordering
- WebSearch: CSRF SameSite=Lax analysis cross-referenced with OWASP CSRF Prevention Cheat Sheet

### Tertiary (LOW confidence — flag for validation)

- ua-parser-js v2 API change (constructor signature): documented in npm page + GitHub; verify against actual import at implementation time
- Race condition in parallel tab refresh: described in community articles; practical severity LOW for this app's scale but pattern is cheap to implement correctly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions npm-verified
- Architecture patterns: HIGH — based on official plugin READMEs and Fastify docs
- Pitfalls: HIGH — drawn from PITFALLS.md (pre-researched) + official docs verification
- CSRF assessment: MEDIUM — OWASP is definitive but application-specific threat model assessment is reasoned, not empirically verified

**Research date:** 2026-04-09
**Valid until:** 2026-07-09 (90 days — stable ecosystem; @fastify/jwt v10 is current)
