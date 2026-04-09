# Phase 3: Messaging Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-09
**Phase:** 03-messaging-core
**Areas discussed:** WebSocket protocol, Chat UI layout, Conversation creation, Edit/Delete/Reply/Reactions UX

---

## WebSocket Protocol

| Question | Selected |
|----------|----------|
| Format | JSON envelope `{type, payload, id?}` |
| Delivery guarantee | DB-first + replay on reconnect |
| Reconnect strategy | Fixed 5s retry (user override of recommended exp backoff) |

---

## Chat UI Layout

| Question | Selected |
|----------|----------|
| Layout | Sidebar + chat split (single-pane on mobile) |
| Sidebar fields | name/avatar, last message preview, unread badge, online dot |
| History UX | Infinite upward scroll |

---

## Conversation Creation

| Question | Selected |
|----------|----------|
| New DM | Search by username |
| New group | Name + multi-select participants in one dialog |
| User search endpoint | `GET /api/users?q=…` |

---

## Edit/Delete/Reply/Reactions

| Question | Selected |
|----------|----------|
| Edit/delete restriction | Special permission required |
| Deleted message rendering | Placeholder ("Message deleted") |
| Reactions emoji set | Any emoji (free-form picker) |
| Read receipts style | WhatsApp-style — show who read and when |

### Edit permission clarification
**Group context:** Group admin always can edit/delete own messages. Regular users can edit/delete own messages ONLY if group admin granted `can_edit_messages` permission.
**Direct chats:** Nobody can edit/delete (immutable).

---

## Deferred Ideas

- Voice messages → V2 (voice/video)
- Message forwarding → out of scope
- Search/link previews/pin/mute → V2
- Online/offline logic → Phase 4
- Browser notifications → Phase 4
- Group admin UI for can_edit_messages toggle → Phase 4
