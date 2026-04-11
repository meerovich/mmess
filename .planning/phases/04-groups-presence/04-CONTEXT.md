# Phase 4: Groups & Presence - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Group conversation management (admin UI for add/remove participants, rename, change avatar, grant can_edit_messages, leave group), online/offline presence tracking via WebSocket connection registry with last-seen timestamps, presence broadcast scoped to shared-conversation participants, and browser notifications for new messages when the tab is not focused. Offline message delivery already works via Phase 3's DB-first + REST replay — this phase adds the presence UI layer on top.

</domain>

<decisions>
## Implementation Decisions

### Group Admin UI

- **D-01:** Group settings open in a modal dialog triggered by clicking the group name/avatar in the chat header
- **D-02:** Modal has two sections: "About" (name, avatar, participant count) and "Members" (participant list)
- **D-03:** All participants can open the modal to view members. Admin actions (kick, rename, change avatar, grant permission, add members) render as buttons visible ONLY to the admin
- **D-04:** Non-admin users see a "Leave group" button at the bottom of the modal; admin does not see this (admin must transfer admin role or delete the group — deleting the group is deferred to v2)
- **D-05:** Each member row in the list shows: avatar, username, "admin" badge (if applicable), "Can edit messages" checkbox (visible to admin only, disabled for the admin row itself which is always true), "Remove" button (visible to admin only, not on admin's own row)
- **D-06:** "Add members" button at the bottom of the member list (admin-only) opens the same user search modal as NewGroupModal, pre-excluding existing members and the admin
- **D-07:** Rename: inline edit on the group name field (admin-only); Enter saves, Escape cancels
- **D-08:** Change avatar: file upload is deferred to Phase 5 (File Sharing). Phase 4 uses the same deterministic initial-hash avatar as direct chats, so group avatar = group name initial. The schema field `conversations.avatar_url` already exists and will be populated in Phase 5.

### Group REST Endpoints

- **D-09:** `PATCH /api/conversations/:id` — rename group (admin-only). Body: `{ name?: string, avatar_url?: string }`. Returns updated conversation.
- **D-10:** `POST /api/conversations/:id/participants` — add participants (admin-only). Body: `{ user_ids: uuid[] }`. Rejects if any user already a member.
- **D-11:** `DELETE /api/conversations/:id/participants/:user_id` — remove participant (admin-only; cannot remove self if you are the only admin)
- **D-12:** `PATCH /api/conversations/:id/participants/:user_id` — update permissions (admin-only). Body: `{ can_edit_messages?: boolean, is_admin?: boolean }`. Phase 4 only uses `can_edit_messages`; `is_admin` promotion is deferred to v2.
- **D-13:** `DELETE /api/conversations/:id/me` — leave group (any participant). If last participant, conversation is soft-deleted (schema has no soft-delete column yet — add `conversations.deleted_at` or hard-delete for simplicity, Claude's discretion).
- **D-14:** Each admin action broadcasts a WS `conversation:updated` event to all remaining participants so their sidebar and open modal refresh in real-time. New server→client WS type added.

### Presence (Online/Offline)

- **D-15:** Presence source of truth = WebSocket connection registry (`Map<user_id, Set<WebSocket>>`) from Phase 3. A user is online iff the registry has ≥1 socket for that user.
- **D-16:** On WS connect (after auth), server emits `presence:update` to all users who share at least one conversation with the connecting user. Payload: `{ user_id, online: true, last_seen_at: null }`.
- **D-17:** On WS disconnect (close event), server updates `users.last_seen_at = now()` in the DB, then emits `presence:update` to all users in shared conversations. Payload: `{ user_id, online: false, last_seen_at: ISO_string }`.
- **D-18:** Schema extension: add `users.last_seen_at TIMESTAMPTZ` column (nullable; populated on disconnect only, null means "never connected after this column was added")
- **D-19:** New REST endpoint: `GET /api/presence?user_ids=uuid,uuid,...` returns current presence for the given user IDs (max 50 per request). Used on initial conversation load to hydrate presence for all visible conversation participants at once.
- **D-20:** Client displays presence indicator per `ConversationItem` (sidebar) and per `MessageItem` sender avatar (chat pane)
- **D-21:** Offline users show "last seen X ago" using date-fns `formatDistanceToNow` (e.g. "last seen 2 hours ago"). If `last_seen_at` is null, show "last seen unknown"
- **D-22:** Online dot color: green (`#22c55e`); offline dot color: grey (`#9ca3af`) — new tokens added to `tokens.css`
- **D-23:** Presence broadcast scope = only users who share at least one conversation with the (dis)connecting user. The server computes this by: `SELECT DISTINCT user_id FROM conversation_participants WHERE conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = $connecting_user)`. Cached briefly per connection to avoid recomputing on fast reconnects.

### Offline Delivery (Reinforcement)

- **D-24:** No new backend work needed — Phase 3's DB-first delivery + REST history replay already handles offline delivery. Reconnect triggers a full `GET /api/conversations` refresh in `ChatContext` mount.
- **D-25:** No explicit "you missed N messages" banner — unread badges on conversation items are sufficient visual indicator per user request
- **D-26:** Phase 4 adds one small improvement: when the WS reconnects (after ≥5s gap indicating a real disconnect), `WebSocketProvider` re-triggers the initial `GET /api/conversations` fetch so the sidebar picks up any conversations created while offline. This is a one-line change to the existing reconnect handler.

### Browser Notifications

- **D-27:** Use the Web Notifications API (`window.Notification`). No service worker, no push — notifications only fire while the tab is open
- **D-28:** Permission request flow: after successful login, check `Notification.permission`. If `'default'`, show an unobtrusive banner at the top of the chat layout: "Enable notifications to be alerted when tabs are in the background." Clicking the banner's CTA triggers `Notification.requestPermission()`
- **D-29:** Banner persists for the session if user dismisses without enabling. Stored in `sessionStorage` to avoid re-nagging per page load. Not persisted to DB.
- **D-30:** Notification fires on incoming `message:new` WS event when: `Notification.permission === 'granted'` AND `document.visibilityState !== 'visible'` AND the message is from a different user (not self echo)
- **D-31:** Notification content:
  - **Title:** sender username (direct chat) or "group_name: sender_username" (group chat)
  - **Body:** first ~120 chars of message content. For file-only messages: "Sent a file" or "Sent an image"
  - **Icon:** favicon path `/favicon.ico` (Phase 1 ships a default; improve in Phase 6 if time)
  - **Tag:** `conversation_id` — replaces previous notification from same conversation so user doesn't get spammed with 10 notifications from one active chat
- **D-32:** Clicking the notification focuses the tab AND navigates to the conversation: `window.focus()` + React Router `navigate(/chat/${conversation_id})`. Requires the notification callback to live inside a React component with access to the navigate function.
- **D-33:** No notification sound in v1 (requires audio assets + autoplay permissions). Deferred.

### New WS Message Types (additions to Phase 3 protocol)

- **D-34:** Server→Client only:
  - `presence:update` — `{ user_id, online: boolean, last_seen_at: string | null }`
  - `conversation:updated` — `{ conversation: Conversation }` (full updated object for easy replacement)
  - `participant:added` — `{ conversation_id, participant: Participant }` (optional; could use conversation:updated instead)
  - `participant:removed` — `{ conversation_id, user_id }`
- **D-35:** No new client→server types needed — all admin actions go via REST, which triggers server-side broadcast

### Claude's Discretion

- Exact Drizzle query syntax for presence scope computation (derived from shared conversation_participants)
- Whether to cache per-connection the "people to notify" list
- Specific React component filename conventions for the admin modal (GroupSettingsModal? GroupAdminDialog?)
- Whether to use `sessionStorage` or `localStorage` for notification banner dismissal
- Exact placement of the permission banner in ChatLayout

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/ARCHITECTURE.md` — Connection registry pattern (Pattern 6)
- `.planning/research/PITFALLS.md` — #7 (online status flicker on transient disconnect — use a short debounce)

### Project
- `.planning/PROJECT.md` — Validated requirements
- `.planning/REQUIREMENTS.md` — CONV-04, CONV-05, CONV-06, PRES-01, PRES-02, PRES-03

### Prior Phases
- `.planning/phases/03-messaging-core/03-CONTEXT.md` — D-21 edit permission model (can_edit_messages)
- `.planning/phases/03-messaging-core/03-04-SUMMARY.md` — ChatContext + WebSocketProvider APIs
- `.planning/phases/03-messaging-core/03-UI-SPEC.md` — Design tokens (new colors extend existing scheme)

### Existing Code
- `server/src/routes/ws/registry.ts` — Connection registry (source of presence truth)
- `server/src/routes/ws/index.ts` — Where to add presence broadcast on connect/disconnect
- `server/src/routes/conversations/create.ts` — Reference for "broadcast to registry" pattern
- `server/src/db/schema.ts` — `users`, `conversation_participants` tables to extend
- `client/src/providers/WebSocketProvider.tsx` — Where to add `presence:update` handler and notification dispatch
- `client/src/contexts/ChatContext.tsx` — Where presence state lives; add `presenceByUser: Map<user_id, PresenceState>`
- `client/src/components/chat/ConversationItem.tsx` — Online dot placeholder already present (PLACEHOLDER from Phase 3)
- `client/src/components/chat/ChatPane.tsx` — Chat header click target for opening settings modal
- `client/src/components/chat/NewGroupModal.tsx` — Pattern for the "add members" sub-flow in GroupSettingsModal

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Connection registry: `Map<user_id, Set<WebSocket>>` already tracks who's online
- WS broadcast helper already exists in registry module (`broadcast`, `send` functions)
- `Modal` pattern established in NewChatModal / NewGroupModal — reuse the same structure (role=dialog, focus trap, Escape close)
- Avatar component with deterministic color hash — works for groups identically
- date-fns installed — `formatDistanceToNow` for "last seen 2h ago"
- ChatContext reducer — new actions: `SET_PRESENCE`, `CONVERSATION_UPDATED`, `PARTICIPANT_ADDED`, `PARTICIPANT_REMOVED`

### Established Patterns
- REST endpoints mount under `/api/conversations/*` via Fastify route plugin
- REST success broadcasts corresponding WS event via registry
- React Context + useReducer for chat state; `useChat()` hook
- CSS Modules + design tokens; all new colors go to `tokens.css`

### Schema Extensions Needed
1. `users.last_seen_at TIMESTAMPTZ NULL` — one new column
2. (Optional, Claude's discretion) `conversations.deleted_at TIMESTAMPTZ NULL` — for soft-delete when last user leaves a group. Alternative: hard-delete with ON DELETE CASCADE (messages, participants, reactions, reads all cascade).

### Integration Points
- WS `onConnection` handler in `routes/ws/index.ts` → emits `presence:update` + pre-computes broadcast scope
- WS `onClose` handler → updates `users.last_seen_at` + emits offline `presence:update`
- REST admin routes → broadcast `conversation:updated` on mutations
- Client `WebSocketProvider.handleIncoming` → handles presence:update, conversation:updated, fires browser notification
- Client `ChatPane` header → adds click-to-open settings modal
- Client `ChatContext` → new presence state + reducer actions

</code_context>

<specifics>
## Specific Ideas

- Presence flicker mitigation (PITFALLS #7): on WS disconnect, server waits 3 seconds before emitting offline event and updating last_seen_at. If the same user reconnects within 3 seconds, the offline event is cancelled and no presence change is broadcast. Prevents flickering during network blips.
- Notification tag uses `conversation_id` so opening one notification replaces existing ones from the same chat
- GroupSettingsModal reuses the existing UserSearch component from NewChatModal for the "add members" sub-flow

</specifics>

<deferred>
## Deferred Ideas

- Admin role transfer — promote another member to admin. Deferred to v2.
- Soft-delete vs hard-delete for leaving last participant — Claude's discretion; hard-delete is simpler
- Group avatar upload via file — depends on Phase 5 (File Sharing); schema field already exists
- Notification sound on new messages — requires audio + autoplay handling. Deferred.
- Web Push (background notifications while tab closed) — requires service worker + push subscription infrastructure. Out of v1 scope.
- "You were offline for 5 days" banner — deferred; unread badges sufficient per user decision
- Custom notification icon / branded assets — deferred to Phase 6 (UI & Deploy)
- "Do not disturb" / mute conversation — deferred to v2 (V2-06)

</deferred>

---

*Phase: 04-groups-presence*
*Context gathered: 2026-04-11*
