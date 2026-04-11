# mmess

## What This Is

A self-hosted HTTPS messenger with real-time WebSocket communication, designed for personal use among friends. Web-based client with support for text messages, file/image sharing, and both private and group chats.

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

### Active

- [ ] File and image sharing
- [ ] Responsive web UI

### Out of Scope

- Voice/video calls — deferred to v2 (WebRTC complexity)
- End-to-end encryption — TLS sufficient for personal use
- Desktop app (Electron) — web-only for v1
- Mobile native apps — web PWA sufficient for v1
- Message reactions/threads — nice-to-have, not v1
- Bot/integration framework — not needed for personal use

## Context

- Personal messenger for a small circle of friends
- Self-hosted on own VPS with Docker
- HTTPS with TLS certificates (Let's Encrypt)
- WebSocket for real-time bidirectional communication
- No enterprise requirements (SSO, compliance, audit logs)

## Constraints

- **Deployment**: Self-hosted VPS with Docker — must be easy to deploy and maintain
- **Security**: TLS for all connections (HTTPS + WSS), no plaintext traffic
- **Scale**: Small user base (tens of users, not thousands)
- **Platform**: Web browser only for v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| WebSocket for real-time | Bidirectional, low latency, native browser support | — Pending |
| TLS only (no E2E) | Personal use, simpler architecture, sufficient security | — Pending |
| Web-only client | Faster to ship, accessible from any device with a browser | — Pending |
| Self-hosted Docker | Full control, privacy, no third-party dependencies | — Pending |
| Voice/video deferred to v2 | WebRTC adds significant complexity, text/files first | — Pending |

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
*Last updated: 2026-04-11 after Phase 4: Groups & Presence*
