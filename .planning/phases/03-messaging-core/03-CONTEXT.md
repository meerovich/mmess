# Phase 3: Messaging Core - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time WebSocket text messaging with full message lifecycle: send/receive instantly, paginated history (infinite scroll), typing indicators, WhatsApp-style read receipts, edit/delete with admin-controlled permissions, reply-with-quote, emoji reactions (any emoji), and conversation list with private + group chats. Frontend chat UI with sidebar+chat split layout.

</domain>

<decisions>
## Implementation Decisions

### WebSocket Protocol
- **D-01:** JSON envelope format: `{ type: string, payload: object, id?: string }`
- **D-02:** Message types (initial set):
  - Client→Server: `message:send`, `message:edit`, `message:delete`, `reaction:add`, `reaction:remove`, `typing:start`, `typing:stop`, `read:mark`, `history:request`
  - Server→Client: `message:new`, `message:edited`, `message:deleted`, `reaction:added`, `reaction:removed`, `typing:user`, `read:by`, `error`, `ack`
- **D-03:** Each client→server message includes a client-generated `id` (nanoid); server echoes it in `ack` for optimistic UI confirmation
- **D-04:** DB-first delivery: server persists message to PostgreSQL FIRST (in transaction with conversation.last_message_id update), then fans out via WebSocket to other participants (resolves PITFALLS #2)
- **D-05:** Reconnect strategy: fixed 5-second retry interval (per user preference; simpler than exponential backoff)
- **D-06:** On reconnect, client sends `history:request` with `last_seen_message_id` per conversation; server replays missed messages (resolves silent loss)
- **D-07:** WebSocket auth already enforced at handshake (Phase 2); sender_id always read from `request.user.sub` JWT claim — never from client payload
- **D-08:** No rate limiting on WS messages in v1 (small user base); enforced via PostgreSQL connection pool back-pressure

### Chat UI Layout
- **D-09:** Sidebar + chat split layout for desktop. Sidebar shows conversation list, main pane shows active chat
- **D-10:** Mobile (< 768px): single-pane navigation — sidebar OR chat, with back button on chat to return to list
- **D-11:** Conversation list items show: name (other participant for DMs, group name for groups), avatar, last message preview (~50 chars), last activity time, unread count badge (0–99 then "99+"), online dot for DM (placeholder, populated in Phase 4)
- **D-12:** Conversation list sorted by `conversations.last_message_id`'s created_at descending
- **D-13:** Message history uses infinite upward scroll. Initial load: 50 most recent messages. Scrolling near top loads next 50 older. Auto-scroll to bottom on new incoming message ONLY if user is already at bottom (don't yank scroll if user is reading history)
- **D-14:** Cursor-based pagination using `(created_at, id)` cursor (per ARCHITECTURE.md Pattern 3); never offset/limit

### Conversation Creation
- **D-15:** "New chat" button opens user search modal. User types username/email substring → server returns up to 20 matches via `GET /api/users?q=…&limit=20`
- **D-16:** Selecting a user from search creates a new direct conversation (or opens existing if one already exists between the two users)
- **D-17:** "New group" button opens dialog: enter group name + multi-select users (using same search) + "Create" button
- **D-18:** Conversation creation is a single REST POST: `POST /api/conversations` with body `{ type: 'direct' | 'group', name?, participant_ids: uuid[] }`. Creator is automatically added as participant; for groups, creator is `is_admin: true`
- **D-19:** Direct conversations enforce uniqueness: if a direct chat already exists between the same two users, return existing instead of creating duplicate
- **D-20:** User search excludes the current user from results

### Edit/Delete/Reply/Reactions
- **D-21:** Edit/delete permission model:
  - **Direct chats:** Nobody can edit/delete. Messages are immutable.
  - **Group chats:** Group admin (`conversation_participants.is_admin`) can always edit/delete their OWN messages. Regular participants can edit/delete their OWN messages ONLY if the group admin has granted them the per-participant `can_edit_messages` permission (default false).
- **D-22:** Schema extension: add `conversation_participants.can_edit_messages BOOLEAN NOT NULL DEFAULT false`. When a participant is added to a group as admin, this is set true automatically.
- **D-23:** Group admin UI exposes a per-participant toggle to grant/revoke edit-messages permission (in Phase 4 Groups admin work — for Phase 3, the schema field exists and the toggle exists in admin endpoint)
- **D-24:** Edited messages: render content with subtle "(edited)" suffix on the timestamp
- **D-25:** Deleted messages: keep the row in DB with `is_deleted = true`. Render placeholder "Message deleted" in the message position to preserve thread context and reply references
- **D-26:** Reply-to: clicking "reply" on a message attaches that message's `id` as `reply_to_id`. The reply renders inline with a quoted preview (sender + first ~80 chars of original) above the new message content
- **D-27:** Reactions: any emoji allowed. Use `emoji-mart` (or equivalent lightweight library) for the picker. Reactions are toggle: clicking the same emoji on the same message removes the reaction (one row per user/message/emoji)
- **D-28:** Reactions render as a horizontal row of badges below each message: `[👍 3] [❤️ 1]`. Hovering a badge shows usernames of reactors

### Read Receipts (WhatsApp-style)
- **D-29:** Show who read a message and when. Schema: new table `message_reads (message_id, user_id, read_at)` — each row marks one user reading one message
- **D-30:** Client sends `read:mark` with the latest visible message_id in a conversation when scrolled into view (debounced to fire ~500ms after stop scrolling)
- **D-31:** Server batches: marks all messages from `last_read_message_id+1` through the marked id as read for that user
- **D-32:** Sender's own messages display read indicators: single check (delivered) → double check (read by all participants in DM, or by all in group). Hovering check on group messages shows tooltip with "Read by Alice 14:32, Bob 14:35"
- **D-33:** `conversation_participants.last_read_message_id` (already in schema from Phase 1) is the source of truth for unread count: `SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND id > last_read_message_id`

### Typing Indicators
- **D-34:** Client sends `typing:start` on first keystroke, then debounces 3-second timer; sends `typing:stop` when input is empty or after 5 seconds idle
- **D-35:** Typing state is ephemeral (in-memory map on server, never persisted). Server fans out `typing:user` to other participants
- **D-36:** UI: "Alice is typing…" below message list. For groups: "Alice and Bob are typing…" or "Several people are typing…" (3+)

### Backend Endpoints (REST + WS)
- **D-37:** REST endpoints for non-real-time data:
  - `GET /api/conversations` — list user's conversations with denormalized last message + unread count
  - `GET /api/conversations/:id/messages?before=cursor&limit=50` — paginated history
  - `POST /api/conversations` — create direct or group
  - `GET /api/users?q=&limit=20` — search users
- **D-38:** WS handles real-time only; new conversations created via REST trigger a `conversation:new` WS broadcast to all participants

### Claude's Discretion
- Specific React component structure (ChatSidebar, ChatPane, MessageList, MessageItem, MessageInput, etc.)
- State management approach (Context vs Zustand vs local state — research will recommend)
- emoji-mart vs alternatives library choice
- Exact debounce timings beyond stated values
- CSS framework or styling approach (Tailwind already in plan? Vanilla CSS? CSS modules?)
- Date formatting library (date-fns vs dayjs vs Intl.RelativeTimeFormat)
- WebSocket library on client side (native WebSocket vs ws-reconnect helper)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research
- `.planning/research/STACK.md` — ws library, React state management options
- `.planning/research/ARCHITECTURE.md` — Pattern 3 (cursor pagination), Pattern 4 (denormalized last_message), Pattern 5 (DB-first delivery)
- `.planning/research/PITFALLS.md` — #2 (silent message loss), #5 (React WS connection leaks), #8 (unread COUNT(*)), #13 (reconnect storm)

### Project
- `.planning/PROJECT.md` — Validated requirements
- `.planning/REQUIREMENTS.md` — MSG-01..10, CONV-01..03

### Prior Phases
- `.planning/phases/01-foundation/01-CONTEXT.md` — Schema patterns established
- `.planning/phases/02-authentication/02-CONTEXT.md` — Cookie-based JWT, WS auth at handshake

### Existing Code
- `server/src/db/schema.ts` — messages, conversations, conversation_participants, message_reactions tables already exist
- `server/src/routes/ws/index.ts` — Existing WS stub with preValidation auth (Phase 2)
- `server/src/routes/auth/me.ts` — Reference for authenticated REST routes
- `client/src/contexts/AuthContext.tsx` — Auth state pattern
- `client/src/lib/api.ts` — REST client with refresh interceptor
- `client/src/components/ProtectedRoute.tsx` — Route guard pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Schema:** `messages`, `conversations`, `conversation_participants`, `message_reactions` tables exist with correct structure
  - `messages.reply_to_id` — already supports reply-to
  - `messages.is_deleted` + `messages.edited_at` — already supports the deletion/edit lifecycle
  - `conversation_participants.last_read_message_id` — already supports unread counts
  - `conversations.last_message_id` — denormalized for sidebar sorting
- **WS skeleton:** `server/src/routes/ws/index.ts` already authenticates connections; just needs message handler routing
- **REST patterns:** `server/src/routes/auth/*` shows the Fastify route + JSON schema validation + error handling pattern
- **Client API helper:** `client/src/lib/api.ts` already handles 401 → refresh → retry; new `/api/conversations` and `/api/users` endpoints will inherit this

### Schema Extensions Needed
1. `conversation_participants.can_edit_messages BOOLEAN NOT NULL DEFAULT false`
2. New table `message_reads (message_id, user_id, read_at)` with composite PK + indices

### Established Patterns
- Drizzle migrations run automatically on Fastify startup
- snake_case columns, UUID PKs
- Cookie-based auth (already wired to WS handshake)
- React Router 6 protected routes via AuthContext
- Dual-cookie JWT pattern from Phase 2

### Integration Points
- New WS message handlers attach to existing `/ws` route in Phase 2
- New REST routes mount under `/api/conversations`, `/api/users`
- Frontend gets new `/chat` and `/chat/:conversationId` routes inside ProtectedRoute
- AuthContext provides `user.id` for sender attribution

</code_context>

<specifics>
## Specific Ideas

- WhatsApp-style read receipts: per-message `read_by` list visible on hover
- Reply-with-quote preview shows sender + first 80 chars
- "Several people are typing…" for 3+ typers in a group
- emoji-mart library for free-form emoji reactions
- Initial history page = 50 messages
- Reconnect: simple 5-second fixed interval (no exponential backoff)

</specifics>

<deferred>
## Deferred Ideas

- Voice messages — out of scope (V2 voice/video)
- Message forwarding — explicitly out of scope per REQUIREMENTS.md
- Message search across conversations — V2-03
- Link previews — V2-04
- Pin messages — V2-05
- Conversation mute — V2-06
- Online/offline status logic — Phase 4 (Groups & Presence). Phase 3 reserves UI placeholder.
- Browser notifications — Phase 4
- Group admin UI for granting `can_edit_messages` permission to participants — Phase 4. Phase 3 implements the schema field and the backend endpoint to toggle it; Phase 4 builds the admin UI.

</deferred>

---

*Phase: 03-messaging-core*
*Context gathered: 2026-04-09*
