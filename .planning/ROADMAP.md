# Roadmap: mmess

**Project:** mmess — self-hosted HTTPS WebSocket messenger
**Core Value:** Instant, reliable message delivery between users over a secure WebSocket connection

---

## Milestones

- [x] **v1.0 MVP** — Phases 1-6 (shipped 2026-04-11)
- [ ] **v1.1 Stabilization + UX polish + self-service + DX research** — Phases 7-12 (started 2026-04-12)

---

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) — SHIPPED 2026-04-11</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-04-09
- [x] Phase 2: Authentication (4/4 plans) — completed 2026-04-09
- [x] Phase 3: Messaging Core (9/9 plans) — completed 2026-04-11
- [x] Phase 4: Groups & Presence (5/5 plans) — completed 2026-04-11
- [x] Phase 5: File Sharing (7/7 plans) — completed 2026-04-11
- [x] Phase 6: UI & Deploy (4/4 plans) — completed 2026-04-11

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### v1.1 — Stabilization, UX polish, self-service, DX research

- [ ] **Phase 7: Stabilization** — Regression sweep of v1.0.3 + read receipts bug fix; all later v1.1 phases build on a known-good baseline
- [ ] **Phase 8: Account self-service & session control** — Self-registration endpoint/UI + logout UI + client state reset (merged: LOGOUT shares auth surface with REG)
- [ ] **Phase 9: Deep routing** — `/chat/:conversationId` as URL-driven source of truth, survives reload and back/forward
- [ ] **Phase 10: Localization (ru/en)** — Runtime i18n, language toggle, persisted preference; runs after routing so new error states get keys
- [ ] **Phase 11: Pre-deploy test mechanism — design only** — Pure documentation phase; writes `v1.2-PRE-DEPLOY-TEST-DESIGN.md`, no code
- [ ] **Phase 12: Angular migration research** — Pure research phase; writes `v1.2-ANGULAR-MIGRATION-RESEARCH.md` with final go/no-go, no code

---

## Phase Details

### Phase 7: Stabilization
**Goal**: v1.0.3 base features work without user-visible defects; read receipts reflect actual recipient state in real time
**Depends on**: v1.0.3 in production (hotfixes 1-6 shipped)
**Requirements**: STAB-01, STAB-02, STAB-03, STAB-04
**Success Criteria** (what must be TRUE):
  1. Sender sees own messages progress from sent → delivered → read check-marks that match actual recipient read state
  2. When the recipient opens a conversation, the sender's check-mark updates to "read" within 1 second without a page reload on the sender's side
  3. A manual regression sweep of v1.0.3 base features (auth, DM, group, text, reactions, files, typing, presence, unread counter, notifications, themes, mobile layout) completes with zero user-visible defects, or every found defect is fixed in the same phase
  4. Every fix is documented in `.planning/HOTFIXES.md` or the phase `VERIFICATION.md` with root cause + file-level change summary
  5. Phase ends with a production deploy to https://chatboris.mooo.com and a smoke test (docker compose ps healthy, /api/health returns new version, two-browser E2E for read receipts PASS)
**Plans**: 3 plans
Plans:
- [x] 07-01-PLAN.md — Fix read receipt pipeline + 3-state WhatsApp-style display
- [x] 07-02-PLAN.md — Extend E2E WS regression test script
- [ ] 07-03-PLAN.md — Production deploy, E2E run, manual regression sweep
**UI hint**: yes

### Phase 8: Account self-service & session control
**Goal**: New users can create an account without an admin invite, and any authenticated user can log out and return to a clean login screen
**Depends on**: Phase 7
**Requirements**: REG-01, REG-02, REG-03, REG-04, REG-05, REG-06, LOGOUT-01, LOGOUT-02, LOGOUT-03, LOGOUT-04
**Merge justification**: LOGOUT has only 4 criteria and touches the same auth/session surfaces as REG (cookie paths, ProtectedRoute, AuthContext reset). Shipping both under a single deploy+smoke cycle avoids a thin phase and keeps auth changes reviewed as one unit.
**Success Criteria** (what must be TRUE):
  1. A brand-new visitor can reach `/register`, submit username + email + password, land inside the chat UI without any admin touching the server
  2. Registration endpoint refuses a 6th attempt from the same IP within 15 minutes and returns a clear localized rate-limit error; password policy (min 8, at least one letter and one digit) is enforced on both client and server; duplicate email or username returns a single generic "credentials already in use" style error without revealing which field collided
  3. Setting `REGISTRATION_MODE=invite-only` or `closed` in the server env reverts self-registration to the v1.0 behavior on restart, and the very first user in a fresh database still becomes admin regardless of mode
  4. An authenticated user sees a Logout control in the sidebar; clicking it calls `POST /api/auth/logout`, clears both `access_token` and `refresh_token` cookies (paths matching login set-cookie), wipes ChatContext + AuthContext + localStorage auth flags, and redirects to `/login`
  5. After logout, manually navigating the browser to `/chat/<any-id>` returns the login screen (ProtectedRoute blocks it) — not a blank page or a cached conversation
  6. Phase ends with a production deploy to https://chatboris.mooo.com and a smoke test covering register-a-new-user, rate-limit trip, logout, and post-logout deep-link redirect
**Plans**: TBD
**UI hint**: yes

### Phase 9: Deep routing
**Goal**: The active conversation lives in the URL; reloads, deep links, and browser history all behave correctly
**Depends on**: Phase 8
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04
**Success Criteria** (what must be TRUE):
  1. Reloading the page on `/chat/:conversationId` reopens the same conversation with its message history loaded — user never lands on an empty home state after a refresh
  2. Clicking a different conversation in the sidebar updates the URL to that conversation's id (no more state-only active conversation); the URL is the source of truth
  3. Deep-linking to a conversation the user is not a participant in produces a 403 UI (or redirect to sidebar with a toast) — not a blank screen, not a client crash
  4. Browser back and forward buttons navigate between previously-opened conversations in the expected order
  5. Phase ends with a production deploy to https://chatboris.mooo.com and a smoke test covering reload-on-chat-route, sidebar switch updates URL, forbidden deep link, and back/forward navigation
**Plans**: TBD
**UI hint**: yes

### Phase 10: Localization (ru/en)
**Goal**: Every UI string renders through a translation function; the user can toggle between Russian and English and the choice sticks
**Depends on**: Phase 9 (so routing error states can be localized in the same pass)
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04, I18N-05
**Success Criteria** (what must be TRUE):
  1. A language toggle lives in the sidebar near the theme toggle; switching it instantly re-renders all visible UI strings in the chosen language
  2. The selected language persists across page reloads via localStorage; on a brand-new visit the default is inferred from `navigator.language` (ru if Russian, en otherwise)
  3. A grep over `client/src/**/*.tsx` finds no hardcoded user-facing Russian or English strings — every label, button, placeholder, toast, and error goes through the translation function
  4. Server validation error responses are either language-neutral error codes or are translated on the client via a documented error-code map; no raw server strings leak into the UI
  5. Phase ends with a production deploy to https://chatboris.mooo.com and a smoke test covering: toggle ru→en, reload persistence, first-visit default inference, and at least one server-error path rendering in the active language
**Plans**: TBD
**UI hint**: yes

### Phase 11: Pre-deploy test mechanism — design only
**Goal**: A reviewed, written design for running mmess locally in a production-like configuration exists and is explicitly scoped to v1.2 for implementation
**Depends on**: Phase 10 (no hard dependency, but sequenced last among doc phases before ANGULAR)
**Requirements**: DEVX-01, DEVX-02, DEVX-03, DEVX-04
**Success Criteria** (what must be TRUE):
  1. `.planning/v1.2-PRE-DEPLOY-TEST-DESIGN.md` exists and documents a full design for running mmess locally with HTTPS, real TLS (self-signed or mkcert), real WebSocket, and seed data — without touching the VPS
  2. The design explicitly covers: `docker-compose.dev.yml` profile, local Caddy config, seed script for admin + tester + a seeded DM, environment variable layering, and how to run the existing E2E WS test script inside the dev stack
  3. The design lists each new artifact (`docker-compose.dev.yml`, `Caddyfile.dev`, `scripts/seed-dev.mjs`, `.env.dev.template`) with the specific changes each file needs — and explicitly states that no runtime/application code changes are in scope for this phase
  4. The user has reviewed the document and it carries an explicit "deferred to v1.2 for implementation" marker
  5. Phase ends by writing an entry to `.planning/HOTFIXES.md` or the phase `VERIFICATION.md` confirming the doc was reviewed; no deploy is required because there is no code change, but the already-deployed v1.1 state is re-smoke-tested (docker compose ps healthy, /api/health) to confirm nothing drifted during the doc phase
**Plans**: TBD

### Phase 12: Angular migration research
**Goal**: A written, evidence-backed go/no-go recommendation on migrating the frontend from React to Angular exists and scopes v1.2 direction
**Depends on**: Phase 11 (sequenced last so its recommendation lands with maximum milestone context)
**Requirements**: ANGULAR-01, ANGULAR-02, ANGULAR-03, ANGULAR-04, ANGULAR-05
**Success Criteria** (what must be TRUE):
  1. `.planning/v1.2-ANGULAR-MIGRATION-RESEARCH.md` exists and answers: what carries over unchanged, what must be rewritten, library-to-library mapping, component-by-component effort estimate, coexistence strategy during migration, and a risk list
  2. Every current React dependency (React Router 6, emoji-mart/react, CSS Modules, Context+useReducer, React 19 hooks patterns) is mapped to its Angular counterpart with an explicit confidence level
  3. Effort for each feature area (auth, chat layout, message list, message input, reactions, file upload, typing indicator, presence, theme, deep routing, i18n) is quantified into rough buckets: trivial / moderate / heavy / full rewrite
  4. The document carries a single explicit final recommendation — either "go ahead, here's the plan" or "not worth it, here's why" — with the evidence that backs it; no v1.1 Angular code is written
  5. Phase ends by writing the final recommendation summary to `.planning/HOTFIXES.md` or the phase `VERIFICATION.md`; no deploy is required, but the deployed v1.1 stack is re-smoke-tested (docker compose ps healthy, /api/health reports v1.1.x) to confirm the milestone baseline is still clean before v1.1 is declared complete
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-04-09 |
| 2. Authentication | v1.0 | 4/4 | Complete | 2026-04-09 |
| 3. Messaging Core | v1.0 | 9/9 | Complete | 2026-04-11 |
| 4. Groups & Presence | v1.0 | 5/5 | Complete | 2026-04-11 |
| 5. File Sharing | v1.0 | 7/7 | Complete | 2026-04-11 |
| 6. UI & Deploy | v1.0 | 4/4 | Complete | 2026-04-11 |
| 7. Stabilization | v1.1 | 1/3 | In Progress|  |
| 8. Account self-service & session control | v1.1 | 0/? | Not started | — |
| 9. Deep routing | v1.1 | 0/? | Not started | — |
| 10. Localization | v1.1 | 0/? | Not started | — |
| 11. Pre-deploy test design | v1.1 | 0/? | Not started | — |
| 12. Angular migration research | v1.1 | 0/? | Not started | — |

---
*Roadmap created: 2026-04-08*
*v1.0 MVP shipped: 2026-04-11*
*v1.1 roadmap appended: 2026-04-12*
