# REQUIREMENTS — mmess v1.1

**Milestone:** v1.1 — Stabilization + UX polish + self-service accounts + DX research
**Started:** 2026-04-12
**Status:** Active
**Goal:** Take v1.0.3 to "daily-use ready" — close base-function bugs, add localization, self-service registration, logout, and deep routing. Design (not implement) a pre-deploy testing mechanism. Deliver a go/no-go recommendation on migrating the frontend from React to Angular.

---

## Stabilization (STAB)

- [ ] **STAB-01**: User can see check-mark read receipts on their own messages (sent → delivered → read) reflecting actual recipient read state
- [ ] **STAB-02**: Receiver's `read:mark` event propagates to sender within 1s and updates the check-mark without a page reload
- [ ] **STAB-03**: Regression sweep of v1.0.3 base features (auth, DM, group, text, reactions, files, typing, presence, unread counter, notifications, themes, mobile layout) passes without user-visible defects
- [ ] **STAB-04**: Any regression found during sweep is fixed and documented in `.planning/HOTFIXES.md` or phase VERIFICATION.md

## Localization (I18N)

- [ ] **I18N-01**: User can toggle UI language between Russian and English from the sidebar (near theme toggle)
- [ ] **I18N-02**: Selected language persists across page reloads (localStorage)
- [ ] **I18N-03**: All user-facing UI strings are rendered through a translation function — no hardcoded Russian or English text in components
- [ ] **I18N-04**: Server validation error messages are either language-neutral codes or translated on the client via a known error-code map
- [ ] **I18N-05**: Default language is inferred from `navigator.language` on first visit (ru or en, fallback en)

## Account self-service (REG)

- [ ] **REG-01**: Unauthenticated user can open `/register` and create an account with username + email + password without an admin invite
- [ ] **REG-02**: Registration endpoint is rate-limited (5 attempts / 15 min / IP) to resist spam
- [ ] **REG-03**: Server has an env flag `REGISTRATION_MODE=open | invite-only | closed` that controls self-registration; default `open` for v1.1
- [ ] **REG-04**: Password policy: min 8 chars, at least one letter and one digit (client-side hint + server enforcement)
- [ ] **REG-05**: Duplicate email/username returns a clear, localized error without revealing which of the two is taken (timing-safe)
- [ ] **REG-06**: "First user auto-admin" bootstrap from v1.0 still works — very first registered user becomes admin regardless of mode

## Session control (LOGOUT)

- [ ] **LOGOUT-01**: Authenticated user sees a Logout button in the sidebar (next to avatar + version + theme toggle)
- [ ] **LOGOUT-02**: Clicking Logout calls `POST /api/auth/logout`, clears all client state (ChatContext, AuthContext, WebSocket, localStorage auth flags), and redirects to `/login`
- [ ] **LOGOUT-03**: Logout clears both `access_token` and `refresh_token` cookies correctly (paths must match the login set-cookie paths)
- [ ] **LOGOUT-04**: After logout, attempting to navigate back to a `/chat/*` route shows the login screen (ProtectedRoute enforcement — verified)

## Deep routing (ROUTE)

- [ ] **ROUTE-01**: Reloading the page on `/chat/:conversationId` opens the same conversation and loads its messages without falling back to the empty home state
- [ ] **ROUTE-02**: The URL updates when the user switches conversations from the sidebar (no more state-only active conversation)
- [ ] **ROUTE-03**: Deep-linking to a conversation the user is not a participant in returns a 403 UI (or redirect to sidebar with a toast), not a blank screen
- [ ] **ROUTE-04**: Browser back/forward buttons navigate between previously-opened conversations correctly

## Pre-deploy test mechanism — design only (DEVX)

- [ ] **DEVX-01**: `.planning/v1.2-PRE-DEPLOY-TEST-DESIGN.md` documents a full design for running mmess locally in a production-like configuration (HTTPS, real TLS, real WebSocket, seed data) without touching the VPS
- [ ] **DEVX-02**: Design covers: docker-compose.dev profile, local Caddy with self-signed TLS or mkcert, seed script for admin + tester + DM, environment variable layering, and how to run the E2E WS test script inside the dev stack
- [ ] **DEVX-03**: Design explicitly lists what changes in each artifact (`docker-compose.dev.yml`, `Caddyfile.dev`, `scripts/seed-dev.mjs`, `.env.dev.template`) — no code changes, only the plan
- [ ] **DEVX-04**: Design is reviewed by user and explicitly marked as deferred to v1.2 for implementation

## Angular migration research — research only (ANGULAR)

- [ ] **ANGULAR-01**: `.planning/v1.2-ANGULAR-MIGRATION-RESEARCH.md` answers: what carries over unchanged, what must be rewritten, what libraries map to Angular equivalents, component-by-component migration effort estimate, coexistence strategy during migration, risk list, and a final go/no-go/partial recommendation
- [ ] **ANGULAR-02**: Report maps each current React dependency (React Router 6 → Angular Router, emoji-mart/react → ?, CSS Modules → Angular-scoped styles, Context+useReducer → Signals/Services, React 19 hooks patterns → equivalents) to its Angular counterpart with confidence level
- [ ] **ANGULAR-03**: Report quantifies effort in rough buckets (trivial / moderate / heavy / rewrite) for each feature area (auth, chat layout, message list, message input, reactions, file upload, typing indicator, presence, theme, deep routing)
- [ ] **ANGULAR-04**: Final recommendation is explicit: either "go ahead, here's the plan" or "not worth it, here's why", backed by evidence from the analysis
- [ ] **ANGULAR-05**: Research is a prerequisite for scoping v1.2 — no Angular code is written in v1.1

---

## Future Requirements (deferred)

| Requirement | Target | Depends on |
|---|---|---|
| Pre-deploy test mechanism **implementation** | v1.2 | DEVX design approved |
| Angular migration **implementation** | v1.2+ | ANGULAR recommendation "go" |
| Email verification for self-registration | future | SMTP provider choice |
| CAPTCHA / challenge-response for registration | future | 3rd-party integration |

## Out of Scope (v1.1)

- **End-to-end encryption** — out of project scope (TLS sufficient for personal use, decision from v1.0)
- **Voice/video calls (WebRTC)** — deferred to v2 (decision from v1.0)
- **Message full-text search across conversations** — deferred to v2
- **Link preview / URL unfurling** — deferred to v2
- **Conversation mute, message pinning** — deferred to v2
- **Native mobile apps** — web PWA sufficient (decision from v1.0)

---

## Traceability

*(filled in by the roadmapper — each requirement mapped to exactly one phase)*
