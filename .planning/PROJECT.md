# mmess

## Current State

**Shipped:** v1.0 MVP — 2026-04-11 (6 phases, 32 plans, 35 requirements, 61 tasks)

mmess is a feature-complete self-hosted messenger running on Docker Compose with Caddy auto-TLS. All code-level acceptance criteria are verified; runtime E2E testing (two-browser flows, mobile PWA install, VPS deploy) remains as open UAT items in `.planning/phases/*/0*-HUMAN-UAT.md`.

## Next Milestone Goals

Not yet planned. Candidates from v2 backlog:
- Voice/video calls (WebRTC)
- Message full-text search across conversations
- Link preview with URL unfurling
- Conversation mute / notification settings
- Message pinning

Run `/gsd:new-milestone` to start questioning for v1.1 or v2.0.

## What This Is

A self-hosted HTTPS messenger with real-time WebSocket communication, designed for personal use among friends. Web-based client with support for text messages, file/image sharing, emoji reactions, group chats, presence indicators, dark mode, and PWA install.

## Core Value

Instant, reliable message delivery between users over a secure WebSocket connection — if messaging doesn't work flawlessly in real-time, nothing else matters.

## Requirements

### Validated

- ✓ HTTPS/WSS transport security — Phase 1
- ✓ Docker Compose deployment — Phase 1
- ✓ File storage on named Docker volume — Phase 1
- ✓ User registration and authentication — Phase 2
- ✓ Real-time text messaging via WebSocket — Phase 3
- ✓ Private (1-on-1) chats — Phase 3
- ✓ Group chats — Phase 3
- ✓ Message history and persistence — Phase 3
- ✓ Online/offline status indicators — Phase 4
- ✓ File and image sharing — Phase 5
- ✓ Responsive web UI — Phase 6
- ✓ Dark/light/system theme toggle — Phase 6
- ✓ Conversation search — Phase 6
- ✓ Production deploy artifacts (Docker healthchecks, env template, backup/restore, README) — Phase 6

### Active

(None — v1 milestone complete)

### Out of Scope

- Voice/video calls — deferred to v2 (WebRTC complexity)
- End-to-end encryption — TLS sufficient for personal use
- Desktop app (Electron) — web-only; PWA install covers desktop install
- Mobile native apps — web PWA sufficient
- Bot/integration framework — not needed for personal use
- Slack-style threading — reply-to covers this need
- OAuth/social login — email/password + invite-based registration sufficient

## Context

- Personal messenger for a small circle of friends
- Self-hosted on own VPS with Docker
- HTTPS with TLS certificates (Let's Encrypt via Caddy auto-TLS)
- WebSocket for real-time bidirectional communication
- No enterprise requirements (SSO, compliance, audit logs)

**Tech stack (shipped v1.0):**
- Backend: Node.js 22 + Fastify 5 + @fastify/websocket (ws) + PostgreSQL 16 + Drizzle ORM 0.45
- Auth: @fastify/jwt + @fastify/cookie + argon2 (Argon2id OWASP 2025 params) + rate-limit
- Files: @fastify/multipart + sharp (WebP thumbnails) + file-type (magic byte MIME validation)
- Frontend: React 19 + Vite 6 + React Router 6 + CSS Modules + CSS custom properties
- Libraries: emoji-mart (reactions), date-fns (timestamps), nanoid (tempIds), ua-parser-js (session labels)
- Infrastructure: Docker Compose (postgres + api + caddy) + named volumes + healthchecks

**Known open UAT items:** All 6 phases have HUMAN-UAT.md files tracking runtime verification items (two-browser E2E, mobile PWA install, VPS deploy with real TLS). No code-level gaps remain.

## Constraints

- **Deployment**: Self-hosted VPS with Docker — must be easy to deploy and maintain
- **Security**: TLS for all connections (HTTPS + WSS), no plaintext traffic
- **Scale**: Small user base (tens of users, not thousands)
- **Platform**: Web browser only for v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebSocket for real-time | Bidirectional, low latency, native browser support | ✓ Good — ws + @fastify/websocket shipped clean |
| TLS only (no E2E) | Personal use, simpler architecture, sufficient security | ✓ Good — Caddy auto-TLS zero-maintenance |
| Web-only client | Faster to ship, accessible from any device with a browser | ✓ Good — PWA covers desktop/mobile install |
| Self-hosted Docker | Full control, privacy, no third-party dependencies | ✓ Good — 3-service compose stack is simple |
| Voice/video deferred to v2 | WebRTC adds significant complexity, text/files first | ✓ Good — enabled clean v1 scope |
| Invite-based registration | Private friend group, not public product | ✓ Good — admin invite CLI + first-user-auto-admin |
| JWT in httpOnly cookies | Secure from XSS, automatic WS upgrade auth | ✓ Good — cookies carry through WS handshake cleanly |
| DB-first delivery + REST replay on reconnect | Pitfalls #2 silent loss prevention | ✓ Good — simpler than WS history:request dual-path |
| CSS Modules + tokens (no Tailwind, no shadcn) | Hand-rolled design system matches scale | ✓ Good — theme-ready via :root[data-theme="dark"] |
| Files route through Fastify (not Caddy direct) | Per-conversation access control | ⚠️ Revisit if user base grows — streaming through Node is the bottleneck |
| sharp thumbnails synchronous in upload handler | Small user base — no queue complexity | ✓ Good — acceptable at this scale |
| 3s flicker debounce on presence | PITFALLS #7 prevention | ✓ Good — no visible flicker on network blips |
| JSON envelope WS protocol | Simple, debuggable, extensible | ✓ Good — 9 server→client + 8 client→server message types |
| Client-side search, no full-text index | Tens of conversations, no server cost | ✓ Good — Cmd+K feels instant |
| Manual deploy (no CI/CD) | Personal project, low deploy frequency | ✓ Good — README + docker compose up is sufficient |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-11 after v1.0 milestone complete*
