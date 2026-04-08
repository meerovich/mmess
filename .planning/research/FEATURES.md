# Feature Landscape

**Domain:** Personal self-hosted WebSocket messenger
**Project:** mmess
**Researched:** 2026-04-08
**Context:** Small circle of friends, VPS self-hosted, web client only, text + files + images, group chats, voice/video deferred

---

## Table Stakes

Features users expect. Missing = product feels broken or users abandon it.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time message delivery | The entire point; latency > 500ms feels broken | Med | WebSocket is the right primitive; target < 200ms p99 |
| Private (1-on-1) chats | Baseline of every messenger since SMS | Low | Simple conversation model, well-understood |
| Group chats | Every friend group needs it; WhatsApp/Signal/Telegram normalized it | Med | Membership management, fan-out delivery, ordering |
| Persistent message history | Messages that vanish on refresh = catastrophic | Med | DB-backed; needs pagination for long histories |
| User accounts (register/login) | Required for identity and authorization | Med | Username + password sufficient; no OAuth needed for personal use |
| Online/offline presence indicators | Users expect to know who is available | Low | WebSocket connect/disconnect events drive this naturally |
| Typing indicators | Universally expected since iMessage popularized it; absence is jarring | Low | Debounced keypress events over WS; ephemeral, no persistence |
| Read receipts | Users expect confirmation their message landed | Med | Delivered (server received) + Read (recipient opened) states; privacy toggle optional |
| File and image sharing | Text-only feels like IRC; file/image sharing is table stakes by 2026 | Med | Upload endpoint, storage (local disk or object store), MIME type handling |
| Inline image preview | Sending a file path is not the same as seeing the image | Low | Render `<img>` for image MIME types; thumbnail generation optional |
| Unread message count/badge | Without this users miss messages silently | Low | Per-conversation unread counter; clear on read |
| Scroll-to-bottom / new message indicator | Without it users lose their place or miss new messages | Low | "N new messages" floating indicator when scrolled up |
| Message timestamps | Users need temporal context; always-visible or on-hover | Low | Store server-side UTC, display in local time |
| HTTPS/WSS transport | Browser blocks mixed content; users expect a lock icon | Low | Let's Encrypt + nginx reverse proxy; WSS = WS over TLS |
| Responsive web UI | Friends will use phones; non-responsive = unusable | Med | CSS flexbox/grid; mobile-first layout for chat |
| Notifications (in-browser) | Tab is in background; users need to know messages arrived | Low | Web Notifications API; requires user permission grant |

---

## Differentiators

Features that set the product apart for its specific use case. Not universally expected, but valued by this audience.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Message search | Find that link someone shared 2 weeks ago; killer feature once history accumulates | Med | Full-text search in DB (PostgreSQL `tsvector` or SQLite FTS5); scope to conversation or global |
| Message edit + delete | Typos happen; "edit" respects the person, "delete" removes mistakes | Low | Edit stores edit history or last-edit timestamp; delete sets a tombstone flag |
| Reply-to (quote message) | Preserves context in fast-moving group chats; Signal/Telegram users expect it | Med | Store `reply_to_message_id`; render quoted excerpt inline |
| Emoji reactions | Low-friction acknowledgment without spamming "lol" messages; reduces noise | Med | Small set of reactions (6-8 emoji); store as reaction table; render count under message |
| Link preview / URL unfurl | Makes shared URLs immediately useful without leaving the app | Med | Server-side fetch of Open Graph tags; cache previews; privacy note: server fetches the URL |
| Pin important messages in group | Useful for sharing group info (server address, plans, etc.) | Low | One pinned message per conversation; visible in header or pin bar |
| Drag-and-drop file upload | Reduces friction for file sharing; users expect it from Slack/Discord | Low | HTML5 drag-and-drop API + paste-from-clipboard for images |
| Admin controls for group chats | Creator can add/remove members, rename group, change avatar | Low | Role field on membership (owner, member); thin permission check |
| Dark mode | >80% of users prefer dark mode; absent = friction | Low | CSS custom properties + `prefers-color-scheme` media query; user toggle |
| Message copy / forward | Forward a message to another conversation; copy text quickly | Low | Copy: plain browser selection. Forward: select target conversation UI |
| Conversation mute | Silence noisy group without leaving it | Low | Per-user mute flag in membership table; suppress notifications |
| Session management / logout all devices | Security-conscious users want to revoke sessions | Low | JWT with stored token table or session invalidation |

---

## Anti-Features

Features to explicitly NOT build for v1. Deliberate omissions that reduce complexity without harming the core use case.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| End-to-end encryption | Adds massive key-management complexity (key exchange, device sync, key rotation); TLS is sufficient for trusted friends on a private server | Use HTTPS/WSS + server-side encryption at rest if needed |
| Voice/video calls (WebRTC) | WebRTC NAT traversal (STUN/TURN) is a separate infrastructure problem; v1 scope explicitly excludes it | Defer to v2; document the decision |
| Message reactions with custom emoji | Custom emoji upload/management is a feature project in itself (storage, moderation, rendering) | Use a fixed set of 6-8 unicode emoji |
| Bot / webhook framework | Zero need for personal use; adds API surface area and complexity | Skip entirely |
| Full message threading (Slack-style) | Thread hierarchy is complex to render and manage; reply-to (flat quotes) covers 90% of the use case | Use reply-to instead of full threaded conversations |
| Push notifications (mobile native) | Requires FCM/APNs integration and app store presence; PWA Web Push is the right scope | Web Notifications API covers the browser case adequately |
| Message scheduling | No user demand for personal friend chat; adds state machine complexity | Skip |
| Self-destructing / disappearing messages | Interesting but zero demand for a personal use case; complex to guarantee deletion | Skip |
| User discovery / public directory | Private server; all users are invited; discovery is unnecessary | Admin creates accounts or uses invite links |
| Audit logs / compliance exports | Enterprise feature; irrelevant for personal use | Skip |
| SSO / OAuth login | No identity provider in scope; username + password is fine for a small closed group | Simple credential auth with bcrypt |
| Message translation | Zero demand for a same-language friend group | Skip |
| AI summarization / chat assistants | Out of scope; adds external API dependency | Skip |

---

## Feature Dependencies

```
User accounts (register/login)
  → Private chats (requires identity)
  → Group chats (requires identity + membership)
  → Message history (requires author attribution)
  → Read receipts (requires per-user read state)
  → Unread counts (requires per-user read state)
  → Presence (online/offline) (requires session tracking)
  → Typing indicators (requires session/WS identity)
  → Notifications (requires user sessions)
  → Session management (builds on top of auth)

File/image sharing
  → Inline image preview (requires file upload working first)
  → Drag-and-drop upload (UX layer on top of file upload)

Message persistence
  → Message search (requires persisted messages + indexing)
  → Reply-to (requires stable message IDs)
  → Message edit/delete (requires stable message IDs)
  → Emoji reactions (requires stable message IDs)
  → Pin messages (requires stable message IDs)

Group chats
  → Admin controls (requires group membership model)
  → Conversation mute (requires per-user membership flags)
  → Pin messages (requires group context)

WebSocket connection
  → Real-time delivery (core)
  → Typing indicators (ephemeral over WS)
  → Presence indicators (WS connect/disconnect events)
  → Live reaction updates (real-time broadcast)
```

---

## MVP Recommendation

**Ship first — these are the core loop:**
1. User registration + login (JWT auth)
2. Real-time text messaging via WebSocket (private + group)
3. Persistent message history with pagination
4. Online/offline presence
5. Typing indicators
6. File and image sharing with inline image preview
7. Unread message count per conversation
8. HTTPS/WSS transport
9. Responsive web UI

**Add early (phase 2 — these complete the experience):**
10. Read receipts
11. Notifications (Web Notifications API)
12. Message edit + delete
13. Reply-to (quoted messages)
14. Dark mode
15. Emoji reactions (fixed set)
16. Group admin controls (add/remove members, rename)

**Defer to later phases:**
- Message search — high value but not day-one critical; add when history accumulates
- Link preview — nice polish; server-side fetch complexity worth deferring
- Conversation mute — needed when group volume gets high
- Pin messages — useful but not blocking

**Do not build in v1:**
- Voice/video (WebRTC)
- End-to-end encryption
- Bot framework
- Full Slack-style threading

---

## Sources

- [Ably: Chat and Messaging Application Features](https://ably.com/blog/chat-and-messaging-application-features) — HIGH confidence; vetted feature categorization
- [GetStream: Chat UX Best Practices](https://getstream.io/blog/chat-ux/) — HIGH confidence; practitioner source from a chat SDK company
- [Signal: Message Reactions](https://support.signal.org/hc/en-us/articles/360039929972-Message-Reactions) — HIGH confidence; official docs
- [Netguru: Messaging App UX](https://www.netguru.com/blog/messaging-app-ux) — MEDIUM confidence; WebSearch
- [BricxLabs: 16 Chat UI Design Patterns](https://bricxlabs.com/blogs/message-screen-ui-deisgn) — MEDIUM confidence; practitioner survey
- [Ably: Best Chat APIs for Realtime Messaging](https://ably.com/blog/best-chat-api) — MEDIUM confidence; vendor perspective but feature list is reliable
- [PubNub: Add Reactions to Messages](https://www.pubnub.com/how-to/chat-sdk-add-reactions-to-messages/) — MEDIUM confidence; implementation-level evidence reactions are expected
