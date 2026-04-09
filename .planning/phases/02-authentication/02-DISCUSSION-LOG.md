# Phase 2: Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-09
**Phase:** 02-authentication
**Areas discussed:** Registration, Tokens & sessions, Password reset, Sessions UI

---

## Registration

| Option | Description | Selected |
|--------|-------------|----------|
| Invite-based | Admin generates one-time invite links | ✓ |
| Open | Anyone can register with email/password | |
| First admin + invite | First user auto-admin, rest by invite | (implied from recommendation) |

**User's choice:** Invite-based. Interpreted with "first user is admin" convention.

**Fields:** Email, password, username. No email verification.

---

## Tokens & Sessions

| Question | Selected |
|----------|----------|
| Storage | httpOnly cookies |
| TTL | 15 min access / 30 days refresh |
| WS auth | Cookie (automatic via browser) |

---

## Password Reset

| Option | Selected |
|--------|----------|
| Skip in v1 | ✓ |
| Via email | |
| Admin resets | |

**User's choice:** Deferred. Admin will reset manually via CLI if needed.

---

## Sessions UI

| Field | Selected |
|-------|----------|
| User-Agent (browser/OS) | ✓ |
| IP address | ✓ |
| Login/activity time | ✓ |
| Current session marker | ✓ |

**Rate limiting:** Yes (5 attempts/min per IP, 15-min lockout).

## Deferred Ideas

- Password reset via email → v2
- Email verification → v2
- 2FA, OAuth — not planned
