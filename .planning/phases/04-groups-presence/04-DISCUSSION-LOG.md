# Phase 4: Groups & Presence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-11
**Phase:** 04-groups-presence
**Areas discussed:** Group admin UI, Presence, Offline delivery, Browser notifications

---

## Group Admin UI

| Question | Selected |
|----------|----------|
| Admin panel location | Modal dialog (opened from chat header) |
| Visibility | All see modal, admin-only buttons |
| can_edit_messages grant | Checkbox per participant |

---

## Presence

| Question | Selected |
|----------|----------|
| Source of truth | WS registry (≥1 connection = online) |
| Last seen display | Yes, show "last seen X ago" for offline |
| Broadcast scope | Only users who share conversations |

---

## Offline Delivery

Already covered by Phase 3's DB-first + REST replay. No explicit "missed messages" banner — unread badges are sufficient. Small reconnect improvement: re-fetch conversations list after ≥5s gap.

---

## Browser Notifications

| Question | Selected |
|----------|----------|
| When to show | Tab not in focus (`visibilityState !== 'visible'`) |
| Permission request timing | After first login, non-intrusive banner |

---

## Deferred

- Admin role transfer → v2
- Group avatar upload → Phase 5 (file sharing)
- Notification sound → v2
- Web Push (service worker) → out of v1
- Conversation mute → V2-06
