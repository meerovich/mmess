---
phase: 2
slug: authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `server/vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npm run test --workspace=server -- --run` |
| **Full suite command** | `npm run test --workspace=server -- --run --reporter=verbose` |
| **Estimated runtime** | ~15–30 seconds (integration tests against Docker PostgreSQL) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test --workspace=server -- --run`
- **After every plan wave:** Run `npm run test --workspace=server -- --run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-01..05, INFRA-03 | — | `npx tsc --noEmit` (from server/) | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTH-01, AUTH-03 | unit (schema) | `npx tsc --noEmit` (from server/) | ✅ | ⬜ pending |
| 02-01-03 | 01 | 1 | INFRA-03 | — | `npx tsc --noEmit` (from server/) | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | AUTH-01, AUTH-02, AUTH-03, AUTH-04 | integration | `npm run test --workspace=server -- --run register.test login.test refresh.test logout.test` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | AUTH-05, AUTH-01..04 | integration | `npm run test --workspace=server -- --run sessions.test` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | INFRA-03 | integration | `npm run test --workspace=server -- --run ws.test` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | AUTH-01..05 | manual | See plan 02-04 checkpoint | n/a | ⬜ pending |
| 02-04-02 | 04 | 3 | AUTH-01..05 | manual | See plan 02-04 checkpoint | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 tasks must be completed at the start of plan 02-02 execution, before any auth route implementation begins.

- [ ] `server/vitest.config.ts` — vitest config pointing at `src/**/*.test.ts`, using `@testcontainers/postgresql` or `TEST_DATABASE_URL`
- [ ] `server/package.json` — add `"test": "vitest"` script + `vitest` + `@testcontainers/postgresql` devDependencies
- [ ] `server/src/test/helpers.ts` — shared test DB setup/teardown (create schema, seed minimal data, truncate between tests)
- [ ] `server/src/routes/auth/register.test.ts` — stubs for AUTH-01 (register, invite validation, first-user admin)
- [ ] `server/src/routes/auth/login.test.ts` — stubs for AUTH-02 (login success, wrong password 401, cookie headers)
- [ ] `server/src/routes/auth/refresh.test.ts` — stubs for AUTH-03 (token rotation, expired token 401)
- [ ] `server/src/routes/auth/logout.test.ts` — stubs for AUTH-04 (cookie clearance, session deletion)
- [ ] `server/src/routes/auth/sessions.test.ts` — stubs for AUTH-05 (list sessions, terminate session, block own-session termination)
- [ ] `server/src/routes/ws.test.ts` — stubs for INFRA-03 (401 without cookie, 101 with valid cookie)

---

## Per-Requirement Test Coverage

### AUTH-01: User can register

| Behavior | Test File | Command |
|----------|-----------|---------|
| POST /auth/register creates user with Argon2id hashed password | `register.test.ts` | `npm run test --workspace=server -- --run register.test` |
| Invite token validated and consumed (marked used_by, used_at) | `register.test.ts` | same |
| First user auto-provisioned (no invite required) | `register.test.ts` | same |
| Second+ user without invite returns 400/403 | `register.test.ts` | same |
| Duplicate email returns 409 | `register.test.ts` | same |

### AUTH-02: User can log in and receive tokens

| Behavior | Test File | Command |
|----------|-----------|---------|
| POST /auth/login with valid credentials sets access_token + refresh_token cookies | `login.test.ts` | `npm run test --workspace=server -- --run login.test` |
| POST /auth/login with wrong password returns 401 | `login.test.ts` | same |
| Cookies are httpOnly, SameSite=Lax | `login.test.ts` | same |
| GET /auth/me with valid access_token returns { id, username, email } | `login.test.ts` | same |

### AUTH-03: Session persists across restarts (refresh token rotation)

| Behavior | Test File | Command |
|----------|-----------|---------|
| POST /auth/refresh with valid refresh_token issues new cookie pair | `refresh.test.ts` | `npm run test --workspace=server -- --run refresh.test` |
| Old refresh token invalid after rotation | `refresh.test.ts` | same |
| Expired refresh token returns 401 | `refresh.test.ts` | same |

### AUTH-04: User can log out

| Behavior | Test File | Command |
|----------|-----------|---------|
| POST /auth/logout deletes session row | `logout.test.ts` | `npm run test --workspace=server -- --run logout.test` |
| POST /auth/logout clears both cookies (empty value + past expiry) | `logout.test.ts` | same |

### AUTH-05: View and terminate sessions

| Behavior | Test File | Command |
|----------|-----------|---------|
| GET /auth/sessions returns list with device_label, ip_address, isCurrentDevice | `sessions.test.ts` | `npm run test --workspace=server -- --run sessions.test` |
| DELETE /auth/sessions/:id removes a different session | `sessions.test.ts` | same |
| DELETE /auth/sessions/:id on current session returns 400 | `sessions.test.ts` | same |
| DELETE /auth/sessions/:id for another user's session returns 404 | `sessions.test.ts` | same |

### INFRA-03: WebSocket auth at handshake

| Behavior | Test File | Command |
|----------|-----------|---------|
| WS upgrade without access_token cookie returns HTTP 401 | `ws.test.ts` | `npm run test --workspace=server -- --run ws.test` |
| WS upgrade with expired/invalid JWT returns HTTP 401 | `ws.test.ts` | same |
| WS upgrade with valid access_token cookie establishes connection (101) | `ws.test.ts` | same |
| /health endpoint returns 200 without auth (WS hook does not bleed into global scope) | `ws.test.ts` | same |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session persistence across browser restart | AUTH-03 | Requires real browser with httpOnly cookie lifecycle | Open app, log in, close tab, reopen — should remain authenticated (see plan 02-04 checkpoint Test 4) |
| Device label displays as "Chrome on macOS" format | AUTH-05 | Requires real browser User-Agent | Check sessions page in real browser — device_label should be human-readable (see plan 02-04 checkpoint Test 5) |
| Rate limit 429 after 5 login attempts | AUTH-02, D-22 | Race-sensitive timing in automated tests | Hit POST /auth/login 6 times rapidly from same IP — 6th returns 429 (see plan 02-02 verification step 5) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
