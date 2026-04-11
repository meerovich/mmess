# Phase 6: UI & Deploy - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-11
**Phase:** 06-ui-deploy
**Areas discussed:** Dark theme, Conversation search, Mobile polish, Production deploy

---

## Dark Theme

| Question | Selected |
|----------|----------|
| Toggle states | 3-state: light / dark / system (default system) |
| Button placement | Sidebar footer, next to user avatar |
| Persistence | localStorage (no DB sync) |

---

## Conversation Search

| Question | Selected |
|----------|----------|
| Search scope | Chat names + participant usernames |
| UI | Inline in sidebar header |
| Engine | Client-side (conversations already loaded) |

---

## Mobile Polish

Selected all four: viewport/safe-area meta, touch target audit, iOS 16px input fix, PWA manifest.

---

## Production Deploy

| Question | Selected |
|----------|----------|
| Artifacts | .env.production template, README deploy guide, docker-compose healthchecks, backup script |
| Deploy flow | Manual git pull + docker compose up -d |

---

## Deferred

- Service worker / offline → v2
- Desktop Web Push → v2
- Custom themes → v2
- DB theme sync → v2
- CI/CD → v2
- Message full-text search → V2-03
- i18n → out of v1
