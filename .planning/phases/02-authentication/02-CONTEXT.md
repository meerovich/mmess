# Phase 2: Authentication - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

User registration (invite-based), login with email+password, JWT tokens stored in httpOnly cookies, refresh token rotation, session management UI with device list and termination, WebSocket authentication enforced at the HTTP upgrade handshake via cookie. Password reset is explicitly deferred.

</domain>

<decisions>
## Implementation Decisions

### Registration Flow
- **D-01:** Invite-based registration — admin generates one-time invite tokens; no open signup
- **D-02:** First user on a fresh database auto-provisions as admin; all subsequent users require invite
- **D-03:** Registration fields: email, password, username (display name)
- **D-04:** No email verification in v1 (no SMTP dependency)
- **D-05:** Password hashing with `argon2` (Argon2id variant, OWASP 2025 default parameters: 19MB memory, 2 iterations, parallelism 1)
- **D-06:** Invite tokens are single-use, expire after 7 days, stored hashed in DB (new `invites` table)

### Token Strategy
- **D-07:** JWT for access tokens, random opaque tokens for refresh (stored in `sessions` table)
- **D-08:** Access token TTL: 15 minutes
- **D-09:** Refresh token TTL: 30 days (rolling — extended on use)
- **D-10:** Access token stored in httpOnly `access_token` cookie (path=/, SameSite=Lax, Secure in prod)
- **D-11:** Refresh token stored in httpOnly `refresh_token` cookie (path=/api/auth/refresh, SameSite=Lax, Secure in prod)
- **D-12:** CSRF protection via double-submit cookie pattern OR SameSite=Lax (which is sufficient for this app's flows — no cross-site POSTs expected)
- **D-13:** `@fastify/jwt` for JWT signing and verification; secret loaded from `JWT_SECRET` env var

### WebSocket Authentication
- **D-14:** WS handshake validates JWT from `access_token` cookie at the HTTP upgrade request
- **D-15:** Reject with HTTP 401 before allocating connection if token is missing, expired, or invalid
- **D-16:** User ID extracted from JWT claim and attached to the socket context; never trust client-sent user IDs

### Session Management UI
- **D-17:** Active sessions list shows: device label (User-Agent parsed to "Chrome on macOS"), IP address, created_at, last_seen_at, "this device" marker
- **D-18:** User can terminate any session except current (must log out to terminate current)
- **D-19:** Terminating a session deletes the row from `sessions` table and invalidates the refresh token
- **D-20:** `sessions` schema needs extending: add `user_agent`, `ip_address`, `last_seen_at` columns

### Password Reset
- **D-21:** Deferred from v1 — if a user forgets password, admin resets manually via CLI/DB. Document this in README.

### Rate Limiting
- **D-22:** Login endpoint rate-limited via `@fastify/rate-limit`: 5 attempts per IP per minute, 15-minute lockout after threshold
- **D-23:** Registration endpoint rate-limited: 3 attempts per IP per hour (invite token is the primary gate)

### Claude's Discretion
- Exact Fastify plugin wiring and middleware ordering
- Specific JWT payload structure (beyond `sub` = user_id)
- Argon2 tuning parameters (use OWASP 2025 defaults)
- Error response format (follow Fastify's schema validation errors)
- UI layout for login/register/sessions pages — will be handled during execution

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/STACK.md` — JWT + Argon2id auth stack details
- `.planning/research/ARCHITECTURE.md` — WebSocket auth-at-handshake pattern
- `.planning/research/PITFALLS.md` — Critical pitfalls: #3 (WS auth left open), #14 (token-in-URL leakage)

### Project
- `.planning/PROJECT.md` — Validated INFRA requirements from Phase 1
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, INFRA-03
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions (schema structure, Caddy routing)

### Existing Code
- `server/src/db/schema.ts` — `users` and `sessions` tables already exist; schema extension needed
- `server/src/index.ts` — Fastify server entry; will need auth routes and JWT middleware
- `server/src/db/migrate.ts` — Migration runner to pick up schema changes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `users` table: `id`, `username`, `email`, `password_hash`, `avatar_url`, timestamps — schema is ready
- `sessions` table: `id`, `user_id`, `token_hash`, `device_label`, `expires_at`, timestamps — needs `user_agent`, `ip_address`, `last_seen_at` columns added
- Fastify 5 server with Drizzle DB client wired up
- `@fastify/cors` dependency already listed in server/package.json

### Established Patterns
- Drizzle schema migrations run automatically on Fastify startup
- snake_case column names throughout
- UUID primary keys via `gen_random_uuid()`
- httpOnly cookies + SameSite=Lax decision establishes cookie pattern for all subsequent phases

### Integration Points
- New auth routes mount under `/api/auth/*` in Fastify
- WS handshake handler (to be created in Phase 3) reads cookie set by auth routes
- Schema migration adds columns to existing `sessions` table + creates new `invites` table

</code_context>

<specifics>
## Specific Ideas

- User-Agent parsing with a small library (e.g., `ua-parser-js`) to produce "Chrome on macOS" style labels
- First-user-is-admin pattern: check `users` count on registration, if 0 skip invite requirement and mark user as admin
- CLI command for admin to generate invites: `npm run invite` in server workspace

</specifics>

<deferred>
## Deferred Ideas

- Password reset flow via email — deferred to v2 when SMTP infrastructure is added
- Email verification on registration — deferred to v2
- 2FA/TOTP — not planned for v1 or v2 (personal use, invite-gated)
- OAuth/social login — explicitly out of scope per REQUIREMENTS.md
- Password strength meter UI — rely on minimum length validation for v1

</deferred>

---

*Phase: 02-authentication*
*Context gathered: 2026-04-09*
