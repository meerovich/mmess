# Phase 3: Messaging Core - Research

**Researched:** 2026-04-09
**Domain:** Real-time WebSocket messaging, React chat UI, PostgreSQL message persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**WebSocket Protocol**
- D-01: JSON envelope `{ type: string, payload: object, id?: string }`
- D-02: Client→Server types: `message:send`, `message:edit`, `message:delete`, `reaction:add`, `reaction:remove`, `typing:start`, `typing:stop`, `read:mark`, `history:request`. Server→Client: `message:new`, `message:edited`, `message:deleted`, `reaction:added`, `reaction:removed`, `typing:user`, `read:by`, `error`, `ack`
- D-03: Client-generated `id` (nanoid) in each client→server message; server echoes in `ack`
- D-04: DB-first delivery — persist to PostgreSQL (in transaction with `conversations.last_message_id` update) BEFORE fanning out via WebSocket
- D-05: Fixed 5-second reconnect interval (not exponential backoff)
- D-06: On reconnect, client sends `history:request` with `last_seen_message_id` per conversation; server replays missed messages
- D-07: `sender_id` always from `request.user.sub` JWT claim, never from client payload
- D-08: No WS rate limiting in v1

**Chat UI Layout**
- D-09: Sidebar (280px) + chat split layout on desktop
- D-10: Mobile < 768px: single-pane toggle via React state boolean `showChat`, no router navigation change
- D-11: Conversation list items: name, avatar, last message preview (~50 chars), last activity time, unread count badge (0–99 then "99+"), online dot placeholder
- D-12: Conversation list sorted by `conversations.last_message_id`'s created_at DESC
- D-13: Initial load 50 messages. Auto-scroll to bottom only if user is already at bottom (within 100px). Never yank scroll while reading history.
- D-14: Cursor-based pagination using `(created_at, id)` cursor — never offset/limit

**Conversation Creation**
- D-15: `GET /api/users?q=...&limit=20` — up to 20 user matches
- D-16: Selecting a user creates DM or opens existing
- D-17: "New group" dialog: group name + multi-select users
- D-18: `POST /api/conversations` with `{ type, name?, participant_ids[] }` — creator auto-added; group creator is `is_admin: true`
- D-19: Direct conversation uniqueness — return existing if already exists
- D-20: User search excludes current user

**Edit/Delete/Reply/Reactions**
- D-21: Direct chats — nobody can edit/delete. Groups — admin always can on own messages; regular participant only if `can_edit_messages: true`
- D-22: Schema extension: `conversation_participants.can_edit_messages BOOLEAN NOT NULL DEFAULT false`
- D-23: Group admin toggle for `can_edit_messages` per participant (Phase 3: schema + endpoint; Phase 4: UI)
- D-24: Edited messages render with "(edited)" suffix on timestamp
- D-25: Deleted messages: `is_deleted = true`, render "Message deleted" placeholder
- D-26: Reply-to: `reply_to_id`, inline quote with sender + first ~80 chars
- D-27: Reactions: any emoji, toggle behavior, use `emoji-mart` library
- D-28: Reactions render as `[👍 3] [❤️ 1]` row below bubble; hover shows usernames

**Read Receipts (WhatsApp-style)**
- D-29: New table `message_reads (message_id, user_id, read_at)` with composite PK
- D-30: Client sends `read:mark` with latest visible `message_id`, debounced ~500ms
- D-31: Server marks all messages from `last_read+1` through marked id as read
- D-32: Single check = delivered (ack received); double check = read by all. Hover on group message shows tooltip with reader names + times
- D-33: `conversation_participants.last_read_message_id` is source of truth for unread count

**Typing Indicators**
- D-34: `typing:start` on first keystroke; 3s debounce reset; `typing:stop` on empty or 5s idle
- D-35: Ephemeral in-memory map, never persisted; fan out `typing:user` to other participants
- D-36: "Alice is typing…" / "Alice and Bob are typing…" / "Several people are typing…" (3+)

**Backend Endpoints**
- D-37: REST: `GET /api/conversations`, `GET /api/conversations/:id/messages?before=cursor&limit=50`, `POST /api/conversations`, `GET /api/users?q=&limit=20`
- D-38: WS handles real-time only; `conversation:new` WS broadcast when new conversation created via REST

### Claude's Discretion
- Specific React component structure (ChatSidebar, ChatPane, MessageList, MessageItem, MessageInput, etc.) — prescribes component names in UI-SPEC
- State management approach — UI-SPEC locks React Context + useReducer (see state shape below)
- emoji-mart vs alternatives — UI-SPEC locks `@emoji-mart/react` + `@emoji-mart/data`
- Date formatting library — UI-SPEC locks `date-fns`
- CSS framework — UI-SPEC locks CSS Modules + CSS custom properties
- WebSocket library on client side — native WebSocket (no additional library)

### Deferred Ideas (OUT OF SCOPE)
- Voice messages — V2 voice/video
- Message forwarding — explicitly out of scope
- Message search across conversations — V2-03
- Link previews — V2-04
- Pin messages — V2-05
- Conversation mute — V2-06
- Online/offline status logic — Phase 4
- Browser notifications — Phase 4
- Group admin UI for `can_edit_messages` toggle — Phase 4 (schema + endpoint in Phase 3 only)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSG-01 | User can send text messages in real-time via WebSocket | D-01..D-08 protocol decisions; DB-first delivery pattern; connection registry fan-out |
| MSG-02 | User can receive messages in real-time without page refresh | Connection registry `Map<userId, Set<WebSocket>>`; fan-out after DB write |
| MSG-03 | User can view paginated message history (scroll up to load older) | Cursor pagination `(created_at, id)`; existing composite index on `messages`; `history:request` WS message or REST endpoint |
| MSG-04 | User sees typing indicator when another user is composing | Ephemeral in-memory map; debounce 3s/5s; `typing:user` broadcast |
| MSG-05 | User sees read receipt status on sent messages (delivered/read) | `message_reads` table; `read:mark` WS message; IntersectionObserver 500ms debounce |
| MSG-06 | User sees unread message count per conversation | `last_read_message_id` cursor; `id > last_read_message_id` fast indexed query |
| MSG-07 | User can edit their own sent messages | `message:edit` WS; `edited_at` column exists; permission check via `can_edit_messages` |
| MSG-08 | User can delete their own sent messages | `message:delete` WS; `is_deleted = true` soft delete; permission check |
| MSG-09 | User can reply to a specific message (quoted reply) | `reply_to_id` column exists; reply preview UI component |
| MSG-10 | User can add emoji reactions to messages | `message_reactions` table exists; `reaction:add`/`reaction:remove` WS; `@emoji-mart/react` |
| CONV-01 | User can start a private (1-on-1) conversation with another user | `POST /api/conversations { type: 'direct' }`; uniqueness via unique partial index |
| CONV-02 | User can create a group conversation with multiple participants | `POST /api/conversations { type: 'group' }`; NewGroupModal |
| CONV-03 | User sees a list of all conversations sorted by last activity | `GET /api/conversations`; sort by `conversations.last_message_id` joined to messages.created_at |
</phase_requirements>

---

## Summary

Phase 3 builds on a solid Phase 1+2 foundation. The database schema is almost entirely in place (messages, conversations, conversation_participants, message_reactions tables all exist). The WS route exists with auth already wired. The primary work is: (1) implementing all WS message handlers in the server, (2) adding two missing schema elements (`can_edit_messages` column, `message_reads` table), (3) building REST endpoints for conversation/message history/user search, and (4) constructing the full React chat UI (13 components + CSS Modules).

The most architecturally complex pieces are the connection registry (Map<userId, Set<WebSocket>> for fan-out), the DB-first message delivery transaction, cursor pagination correctness, optimistic UI with temp-ID replacement, and the IntersectionObserver-based read receipt trigger. The UI-SPEC has locked all visual/library decisions, so the planner has no discretion on styling approach or library selection.

**Primary recommendation:** Build in dependency order — schema migration first, then connection registry + WS handler routing, then REST endpoints, then React context + WebSocket provider, then UI components layer by layer (layout → conversation list → message list → input → modals).

---

## Standard Stack

### New Packages for Phase 3

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `@emoji-mart/react` | 1.1.1 | React emoji picker component | npm registry (confirmed) |
| `@emoji-mart/data` | 1.2.1 | Emoji dataset for emoji-mart | npm registry (confirmed) |
| `date-fns` | 4.1.0 | Timestamp formatting (HH:mm, relative, dd/MM) | npm registry (confirmed) |
| `nanoid` | 5.1.7 | Already in server; needed in client for client-side message IDs | Already in server deps |

### Existing Packages (Already Installed — No New Install Needed)

| Library | Version | Role in Phase 3 |
|---------|---------|-----------------|
| `fastify` | ^5.8.0 | REST endpoint handlers for conversations/users |
| `@fastify/websocket` | ^11.0.0 | WS route (stub already registered) |
| `ws` | ^8.20.0 | Underlying WS library, `WebSocket` type for connection registry |
| `drizzle-orm` | ^0.45.0 | All DB queries — inserts, transactions, joins |
| `postgres` | ^3.4.0 | PostgreSQL driver |
| `nanoid` | ^5.1.7 | Already in server — used for client-side message `id` field |
| `react` | ^19.0.0 | UI framework |
| `react-router-dom` | ^6.0.0 | `/chat` and `/chat/:conversationId` routes |

**Installation (client):**
```bash
npm install --workspace=client @emoji-mart/react @emoji-mart/data date-fns
```

Note: `nanoid` is already in server deps but needed client-side too. Since workspaces hoist to root, check if it resolves; if not:
```bash
npm install --workspace=client nanoid
```

**Version note:** `@emoji-mart/react@1.1.1` and `@emoji-mart/data@1.2.1` are current as of npm registry check (April 2026). `date-fns@4.1.0` is the current stable release (v4 is a major rewrite with tree-shaking improvements, last published ~2024).

---

## Architecture Patterns

### Recommended Project Structure (New Files)

```
server/src/
├── routes/
│   ├── ws/
│   │   ├── index.ts          (existing — extend with handler registry)
│   │   ├── registry.ts       (NEW — connection Map<userId, Set<WebSocket>>)
│   │   ├── handlers/
│   │   │   ├── message.ts    (NEW — message:send, message:edit, message:delete)
│   │   │   ├── reaction.ts   (NEW — reaction:add, reaction:remove)
│   │   │   ├── typing.ts     (NEW — typing:start, typing:stop + in-memory map)
│   │   │   └── read.ts       (NEW — read:mark)
│   └── conversations/
│       ├── index.ts          (NEW — GET /api/conversations)
│       ├── messages.ts       (NEW — GET /api/conversations/:id/messages)
│       └── create.ts         (NEW — POST /api/conversations)
│   └── users/
│       └── search.ts         (NEW — GET /api/users?q=)

client/src/
├── styles/
│   ├── tokens.css            (NEW — all CSS custom properties)
│   └── reset.css             (NEW — box-sizing reset)
├── contexts/
│   └── ChatContext.tsx       (NEW — useReducer state + dispatch)
├── providers/
│   └── WebSocketProvider.tsx (NEW — WS singleton via useRef, reconnect logic)
└── components/
    ├── chat/
    │   ├── ChatLayout.tsx
    │   ├── ConversationList.tsx
    │   ├── ConversationItem.tsx
    │   ├── ChatPane.tsx
    │   ├── MessageList.tsx
    │   ├── MessageItem.tsx
    │   ├── ReplyPreview.tsx
    │   ├── ReactionBar.tsx
    │   ├── MessageInput.tsx
    │   ├── TypingIndicator.tsx
    │   ├── NewChatModal.tsx
    │   └── NewGroupModal.tsx
    └── common/
        └── Avatar.tsx
```

### Pattern 1: Connection Registry (Map-based Fan-out)

**What:** In-process `Map<string, Set<WebSocket>>` mapping user_id to all their active connections. Exported as a module singleton so all WS handlers share the same instance.

**Why:** Fastify's `@fastify/websocket` doesn't expose a built-in room abstraction. A module-level singleton is the standard approach for single-server deployments (no Redis needed at this scale).

```typescript
// Source: ARCHITECTURE.md + ws library pattern
// server/src/routes/ws/registry.ts
import type { WebSocket } from 'ws';

const registry = new Map<string, Set<WebSocket>>();

export function register(userId: string, socket: WebSocket): void {
  if (!registry.has(userId)) registry.set(userId, new Set());
  registry.get(userId)!.add(socket);
}

export function unregister(userId: string, socket: WebSocket): void {
  registry.get(userId)?.delete(socket);
  if (registry.get(userId)?.size === 0) registry.delete(userId);
}

export function send(userId: string, data: unknown): void {
  const sockets = registry.get(userId);
  if (!sockets) return;
  const json = JSON.stringify(data);
  for (const socket of sockets) {
    if (socket.readyState === 1 /* OPEN */) socket.send(json);
  }
}

export function broadcast(userIds: string[], data: unknown, excludeUserId?: string): void {
  for (const uid of userIds) {
    if (uid !== excludeUserId) send(uid, data);
  }
}
```

**Important:** The `register` call goes in the WS route handler immediately after the existing `const userId = request.user.sub` line. The `unregister` call goes in the `socket.on('close', ...)` handler.

### Pattern 2: DB-First Message Delivery Transaction (D-04)

**What:** Single Drizzle transaction that: (1) INSERTs the message, (2) UPDATEs `conversations.last_message_id`, then returns the inserted message ID for fan-out.

**When to use:** Every `message:send` handler call.

```typescript
// Source: Drizzle ORM transactions docs + CONTEXT.md D-04
const [newMessage] = await db.transaction(async (tx) => {
  const [msg] = await tx
    .insert(messages)
    .values({
      conversation_id: payload.conversation_id,
      sender_id: userId,          // from JWT, never from payload
      content: payload.content,
      reply_to_id: payload.reply_to_id ?? null,
    })
    .returning();

  await tx
    .update(conversations)
    .set({ last_message_id: msg.id, updated_at: new Date() })
    .where(eq(conversations.id, payload.conversation_id));

  return [msg];
});
```

After the transaction, fetch conversation participants, then call `broadcast(participantIds, { type: 'message:new', payload: newMessage }, userId)`. Send `ack` back to the sender socket.

### Pattern 3: Cursor-Based Pagination with Composite Cursor

**What:** `(created_at, id)` as a stable compound cursor. Avoids duplicates/skips when messages arrive during pagination.

**SQL pattern (Drizzle):**
```typescript
// Source: ARCHITECTURE.md Pattern 3 + verified against Drizzle ORM docs
const result = await db
  .select()
  .from(messages)
  .where(
    and(
      eq(messages.conversation_id, conversationId),
      // Decode cursor: "ISO_TIMESTAMP|uuid"
      cursor
        ? or(
            lt(messages.created_at, cursorDate),
            and(
              eq(messages.created_at, cursorDate),
              lt(messages.id, cursorId)
            )
          )
        : undefined
    )
  )
  .orderBy(desc(messages.created_at), desc(messages.id))
  .limit(limit + 1); // fetch one extra to know if there's a next page
```

**Index:** Already exists — `idx_messages_conv_created` on `(conversation_id, created_at)`. This covers the WHERE filter efficiently. The UUID `id` comparison is a tiebreaker for same-timestamp rows; it doesn't need its own index for correctness, just for extreme edge-case performance.

**Cursor encoding:** Return cursor as `"${message.created_at.toISOString()}|${message.id}"`. Client passes it as `?before=` query param. Decode by splitting on `|`.

**Response shape:**
```typescript
{
  messages: Message[],   // ordered oldest-first for display (reverse the DESC result)
  nextCursor: string | null,
  hasMore: boolean
}
```

### Pattern 4: Optimistic UI with Temp-ID Replacement

**What:** Client inserts a temporary message with a `nanoid()` client ID and `status: 'sending'` immediately on send. On receiving server `ack`, replaces the temp message with the real server message.

**State action sequence:**
1. User presses Enter → dispatch `OPTIMISTIC_MESSAGE_ADD` with `{ tempId, content, conversation_id, sender_id }`
2. Send WS message with `{ type: 'message:send', id: tempId, payload: {...} }`
3. On `ack` received: dispatch `OPTIMISTIC_MESSAGE_CONFIRM` with `{ tempId, serverMessage }`
4. On send error / no ack timeout (10s): dispatch `OPTIMISTIC_MESSAGE_FAIL` with `{ tempId }` — show retry UI

**Reducer slice:**
```typescript
case 'OPTIMISTIC_MESSAGE_ADD':
  return {
    ...state,
    messages: {
      ...state.messages,
      [action.conversationId]: [
        ...(state.messages[action.conversationId] ?? []),
        { ...action.message, status: 'sending' },
      ],
    },
  };

case 'OPTIMISTIC_MESSAGE_CONFIRM':
  return {
    ...state,
    messages: {
      ...state.messages,
      [action.conversationId]: state.messages[action.conversationId].map(m =>
        m.id === action.tempId ? { ...action.serverMessage, status: 'sent' } : m
      ),
    },
  };
```

### Pattern 5: WebSocket Singleton via useRef (PITFALLS #5)

**What:** WebSocket instance held in `useRef` inside a `WebSocketProvider` component. Never stored in `useState`. Never created outside `useEffect`.

**Why:** Storing in `useState` causes re-renders on each message; creating outside `useEffect` causes multiple connections in React Strict Mode.

```typescript
// Source: PITFALLS.md #5
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { dispatch } = useChat();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      dispatch({ type: 'WS_STATUS', status: 'connected' });
      // On reconnect: replay missed messages per active conversation
    };

    ws.onmessage = (event) => {
      const envelope = JSON.parse(event.data);
      handleIncoming(envelope, dispatch);
    };

    ws.onclose = () => {
      dispatch({ type: 'WS_STATUS', status: 'reconnecting' });
      reconnectTimerRef.current = setTimeout(connect, 5000); // D-05: fixed 5s
    };

    ws.onerror = () => ws.close(); // triggers onclose → reconnect

    wsRef.current = ws;
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current ?? undefined);
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <WebSocketContext.Provider value={{ wsRef }}>{children}</WebSocketContext.Provider>;
}
```

**Critical:** The cleanup function in `useEffect` must close the WebSocket and clear the reconnect timer.

### Pattern 6: ChatContext + useReducer State Shape

**Locked by UI-SPEC.** The state shape:
```typescript
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;  // keyed by conversationId
  typingUsers: Record<string, { userId: string; username: string }[]>;
  wsStatus: 'connected' | 'disconnected' | 'reconnecting';
}
```

Actions needed:
- `SET_CONVERSATIONS` — replace full list (on initial load)
- `UPSERT_CONVERSATION` — add or update one (on `conversation:new`)
- `SET_ACTIVE_CONVERSATION`
- `SET_MESSAGES` — replace message array for one conversation (initial load)
- `PREPEND_MESSAGES` — prepend older messages (infinite scroll load-more)
- `OPTIMISTIC_MESSAGE_ADD` / `OPTIMISTIC_MESSAGE_CONFIRM` / `OPTIMISTIC_MESSAGE_FAIL`
- `MESSAGE_EDITED` — update content + `edited_at` in cache
- `MESSAGE_DELETED` — set `is_deleted: true` in cache
- `REACTION_ADDED` / `REACTION_REMOVED` — update reactions array on a message
- `SET_TYPING_USERS` — replace typing list for one conversation
- `MARK_READ` — update `last_read_message_id` in conversation_participants locally
- `WS_STATUS`

### Pattern 7: Typing Indicator In-Memory Map (Server)

```typescript
// server/src/routes/ws/handlers/typing.ts
// Map structure: conversationId → Map<userId, { username, timer }>
const typingMap = new Map<string, Map<string, { username: string; timer: ReturnType<typeof setTimeout> }>>();

export function handleTypingStart(userId: string, username: string, conversationId: string, participantIds: string[]) {
  if (!typingMap.has(conversationId)) typingMap.set(conversationId, new Map());
  const convoMap = typingMap.get(conversationId)!;

  // Clear existing auto-expiry timer
  const existing = convoMap.get(userId);
  if (existing) clearTimeout(existing.timer);

  // Auto-expiry: 5s without typing:stop clears the entry
  const timer = setTimeout(() => {
    convoMap.delete(userId);
    broadcastTypingUpdate(conversationId, participantIds, userId);
  }, 5000);

  convoMap.set(userId, { username, timer });
  broadcastTypingUpdate(conversationId, participantIds, userId);
}

export function handleTypingStop(userId: string, conversationId: string, participantIds: string[]) {
  const convoMap = typingMap.get(conversationId);
  if (!convoMap) return;
  const existing = convoMap.get(userId);
  if (existing) clearTimeout(existing.timer);
  convoMap.delete(userId);
  broadcastTypingUpdate(conversationId, participantIds, userId);
}

// On socket close: cleanup all typing entries for this user
export function cleanupTypingForUser(userId: string) {
  for (const [convId, convoMap] of typingMap.entries()) {
    const entry = convoMap.get(userId);
    if (entry) { clearTimeout(entry.timer); convoMap.delete(userId); }
    if (convoMap.size === 0) typingMap.delete(convId);
  }
}
```

### Pattern 8: Direct Conversation Uniqueness (Race-safe)

**Problem:** Two users simultaneously clicking "start DM" could create duplicate direct conversations.

**Solution:** Use a unique partial index + `INSERT ... ON CONFLICT` logic at the application layer with Drizzle's transaction. The schema doesn't have a ready-made unique constraint for "two participants in a direct conversation," so enforce at application level using serialization.

**Approach:** In `POST /api/conversations` for `type: 'direct'`:

1. In a transaction, query: `SELECT c.id FROM conversations c JOIN conversation_participants cp1 ON ... JOIN conversation_participants cp2 ON ... WHERE c.type = 'direct'` — check if direct chat already exists
2. If found, return it (HTTP 200 with existing)
3. If not found, insert conversation + participants
4. Use PostgreSQL advisory lock to prevent race: `SELECT pg_advisory_xact_lock(hashtext(sorted_user_ids))` at the start of the transaction. `sorted_user_ids` = `[userId1, userId2].sort().join(':')`.

```typescript
// In transaction:
const lockKey = BigInt(`0x${createHash('md5').update([currentUserId, targetUserId].sort().join(':')).digest('hex').slice(0, 16)}`);
await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
// Then check existence + create if not found
```

**Confidence:** MEDIUM — advisory lock pattern is verified in PostgreSQL docs; the specific Drizzle SQL template syntax needs careful testing.

### Pattern 9: Infinite Upward Scroll with IntersectionObserver

**What:** A sentinel `<div>` at the TOP of `MessageList` observed by `IntersectionObserver`. When visible and `hasMore === true`, dispatch `history:request` (via WS) or call REST pagination endpoint.

**Key nuance (PITFALLS #8 / UI-SPEC):** When prepending older messages to the list, the scroll position must be preserved. Use `scrollHeight` delta technique:

```typescript
const handleLoadMore = useCallback(() => {
  if (!hasMore || isLoadingMore || !listRef.current) return;
  const prevScrollHeight = listRef.current.scrollHeight;
  // fetch older messages...
  // after state update:
  requestAnimationFrame(() => {
    if (listRef.current) {
      listRef.current.scrollTop += listRef.current.scrollHeight - prevScrollHeight;
    }
  });
}, [hasMore, isLoadingMore]);
```

**Auto-scroll-to-bottom logic (D-13):** Only auto-scroll on new incoming message if user is within 100px of the bottom:
```typescript
const isAtBottom = () => {
  if (!listRef.current) return false;
  const { scrollTop, scrollHeight, clientHeight } = listRef.current;
  return scrollHeight - scrollTop - clientHeight < 100;
};
```

### Pattern 10: Read Receipt with IntersectionObserver (D-30)

**What:** Observe the last visible message in the current conversation. When it's in view and 500ms has elapsed, send `read:mark` WS message.

**Implementation note:** Don't observe every message individually (too many observers). Observe only the last message in the list. When it enters view, debounce 500ms, then send `read:mark` with that message's `id`.

```typescript
useEffect(() => {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.sender_id === currentUserId) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      const timer = setTimeout(() => {
        sendWs({ type: 'read:mark', payload: { message_id: lastMessage.id, conversation_id: activeConversationId } });
      }, 500);
      return () => clearTimeout(timer);
    },
    { threshold: 0.5 }
  );

  const el = lastMessageRef.current;
  if (el) observer.observe(el);
  return () => observer.disconnect();
}, [messages.length, activeConversationId]);
```

### Pattern 11: Server-side `read:mark` Batch Update

**What:** On receiving `read:mark { message_id, conversation_id }`, mark all unread messages up to that point as read for the current user.

```typescript
// In a transaction:
// 1. Get participant's current last_read_message_id
// 2. INSERT INTO message_reads (message_id, user_id, read_at) 
//    SELECT m.id, $userId, NOW()
//    FROM messages m
//    WHERE m.conversation_id = $convId
//      AND m.id > $lastReadId  (use created_at ordering, not uuid comparison)
//      AND m.id <= $markedMessageId
//      AND m.sender_id != $userId
//    ON CONFLICT DO NOTHING
// 3. UPDATE conversation_participants SET last_read_message_id = $markedMessageId
//    WHERE conversation_id = $convId AND user_id = $userId
// 4. Fan out read:by event to senders of affected messages
```

**CAUTION with UUID comparison:** UUIDs are not monotonically ordered by value even though they sort lexicographically. The `id > $lastReadId` comparison for "messages after the last read" is NOT reliable with UUID v4. Use `created_at` column for ordering. Query pattern: `WHERE created_at >= (SELECT created_at FROM messages WHERE id = $lastReadId)`.

### Anti-Patterns to Avoid

- **Storing WS socket in React state:** causes re-renders per message, multiple connections in Strict Mode. Use `useRef`.
- **UUID ordering for message sequencing:** UUID v4 is random. Use `created_at DESC, id DESC` for ordering. Store `last_read_message_id` by joining to `created_at` for range queries.
- **Blocking fan-out on DB write:** Do `broadcast()` AFTER the transaction commits, not inside the transaction callback.
- **Reading sender_id from WS payload:** Always use `request.user.sub` (D-07). WS connection is trusted post-auth; individual message payload is not.
- **Fetching full conversation list on every WS message:** Use targeted state updates (`UPSERT_CONVERSATION`) to avoid full list re-renders.
- **COUNT(*) for unread:** Use `id > last_read_message_id` with the `created_at` join approach. `COUNT(*)` with no cursor is O(n) — use indexed cursor comparison (PITFALLS #8).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Emoji picker | Custom emoji grid component | `@emoji-mart/react` | Full Unicode emoji dataset, skin tone support, search, keyboard nav — weeks of work to replicate |
| Date formatting | Custom relative-time logic | `date-fns` (`format`, `formatDistanceToNow`) | Edge cases: DST transitions, locale, year boundaries, leap years |
| Client message IDs | Custom random string | `nanoid` (already in server) | Cryptographically random, URL-safe, collision-resistant |
| Intersection Observer hook | Raw DOM API in multiple components | Use native API directly in a custom hook `useIntersectionObserver` | Lightweight enough; no library needed, but don't duplicate in each component |
| WebSocket reconnection | Manual setInterval loops | Pattern 5 (`useRef` + `useEffect` + `setTimeout`) | Correct cleanup prevents zombie connections; don't add a library (reconnecting-websocket adds unnecessary abstraction) |

**Key insight:** The emoji picker is the only genuine "don't hand-roll" candidate — it involves full Unicode 15 emoji catalog, compound characters, skin tones, and search. Everything else can be done with standard patterns using existing dependencies.

---

## Common Pitfalls

### Pitfall A: Multiple WS Connections in React Strict Mode (PITFALLS #5)
**What goes wrong:** `useEffect` fires twice in development (Strict Mode mounts, unmounts, remounts). If the cleanup function doesn't properly close the WS and clear the reconnect timer, two connections are established.
**Prevention:** Ensure `useEffect` cleanup calls `ws.close()` AND `clearTimeout(reconnectTimerRef.current)`. Test by checking server logs for duplicate `userId` registrations on startup.
**Warning sign:** Server logs show two `WebSocket connection established` events for same userId on page load.

### Pitfall B: UUID Ordering for Message Gaps (Phase-specific)
**What goes wrong:** On reconnect, client sends `last_seen_message_id` as a UUID. Server tries `WHERE id > $last_seen_message_id` — this is a lexicographic UUID comparison, not a chronological one. UUID v4 has no time component. Missed messages may not be found.
**Prevention:** Join `messages` on `created_at`: replay messages `WHERE created_at > (SELECT created_at FROM messages WHERE id = $lastSeenId)`. Or switch to ULID/UUID v7 — but schema uses `gen_random_uuid()` (v4), so the join approach is correct for this project.
**Confidence:** HIGH — UUID v4 ordering behavior is well-documented.

### Pitfall C: Scroll Anchor on Prepend
**What goes wrong:** Prepending 50 older messages to the list resets scroll position to the top of the new content, yanking the user's viewport.
**Prevention:** Capture `scrollHeight` before state update; after DOM update, set `scrollTop += newScrollHeight - oldScrollHeight`. Use `requestAnimationFrame` to ensure DOM has updated.

### Pitfall D: Typing Cleanup on Disconnect
**What goes wrong:** User closes browser mid-typing. `typing:stop` is never sent. The `typing:user` event persists for other users indefinitely (or until the 5s auto-expiry timer fires).
**Prevention:** In the WS `close` handler, call `cleanupTypingForUser(userId)` which clears all typing entries and timers for that user, then broadcasts the updated typing list to affected conversations.

### Pitfall E: Fan-out to Self (Duplicate Message)
**What goes wrong:** Sender receives their own `message:new` via the connection registry broadcast PLUS sees it from optimistic UI insertion — resulting in a duplicate visible message.
**Prevention:** In `broadcast(participantIds, data, excludeUserId)`, pass `excludeUserId = senderId`. The sender gets only the `ack` (with real server ID), not a second `message:new`. The optimistic message is replaced by `OPTIMISTIC_MESSAGE_CONFIRM`.

### Pitfall F: Reaction Toggle Race
**What goes wrong:** User double-clicks emoji badge rapidly. Two `reaction:add` WS messages fly before first ack — both succeed, duplicating the reaction.
**Prevention:** The `message_reactions` table has a `unique(message_id, user_id, emoji)` constraint. The server should use `INSERT ... ON CONFLICT DO NOTHING` for add, and check existence for remove. The client should disable the badge click until ack is received.

### Pitfall G: `history:request` on Reconnect Before Auth
**What goes wrong:** Client reconnects, fires `history:request` immediately in `ws.onopen` — but the auth validation is at the HTTP handshake level, so the connection is already authenticated. This is safe. But if the client sends `history:request` before the `WebSocketProvider` has the `activeConversationId` in scope (stale closure), it may send for wrong or null conversation.
**Prevention:** Pass the current `activeConversationId` as a ref (not closure) into the reconnect handler, or read it from a `useRef` that's always current.

---

## Schema Extensions Required

These must be the first tasks in the plan (Wave 0 / migration wave):

### Extension 1: `conversation_participants.can_edit_messages` (D-22)
```typescript
// Add to conversation_participants table in schema.ts
can_edit_messages: boolean('can_edit_messages').notNull().default(false),
```
Run `drizzle-kit generate` to produce migration SQL, then it auto-runs on startup.

### Extension 2: `message_reads` table (D-29)
```typescript
export const message_reads = pgTable(
  'message_reads',
  {
    message_id: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    read_at: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: unique().on(t.message_id, t.user_id),
    idx_message: index('idx_message_reads_message').on(t.message_id),
    idx_user_read: index('idx_message_reads_user').on(t.user_id),
  })
);
```

### Index: Users search (D-15, CONV-01)
Add a GIN or B-tree index on `users.username` and `users.email` for the ILIKE query:
```typescript
// In users table definition, add:
idx_username_search: index('idx_users_username').on(t.username),
idx_email_search: index('idx_users_email').on(t.email),
```
For ILIKE with prefix-wildcards (`%query%`), a standard B-tree index doesn't help — but for small tables (tens of users), a seqscan is acceptable. If the table grows, use `pg_trgm` GIN index. For Phase 3 scope, B-tree index is sufficient.

---

## REST Endpoint Specifications

### GET /api/conversations

Returns all conversations the authenticated user participates in, with denormalized last message + unread count.

```sql
-- Conceptual query (Drizzle equivalent)
SELECT
  c.id, c.type, c.name, c.avatar_url, c.created_at,
  m.content AS last_message_content,
  m.created_at AS last_message_at,
  u.username AS last_message_sender,
  COUNT(CASE WHEN msgs.id > cp.last_read_message_id THEN 1 END) AS unread_count
FROM conversations c
JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = $userId
LEFT JOIN messages m ON c.last_message_id = m.id
LEFT JOIN users u ON m.sender_id = u.id
LEFT JOIN messages msgs ON msgs.conversation_id = c.id
GROUP BY c.id, m.id, u.id, cp.last_read_message_id
ORDER BY m.created_at DESC NULLS LAST
```

**Note:** The unread count subquery using `COUNT(CASE WHEN ...)` is simpler than a correlated subquery but requires care. Alternative: compute unread count as a separate subquery per conversation. For Phase 3 scale (small user base, few conversations per user), either approach is acceptable.

**Preferred Drizzle pattern:** Use `.leftJoin()` chain + `sql<number>` for the unread count to stay type-safe.

### GET /api/conversations/:id/messages

```typescript
// Query params: before (cursor string), limit (default 50, max 50)
// Returns: { messages: Message[], nextCursor: string | null, hasMore: boolean }
// Authorization: verify current user is participant in conversation
```

### POST /api/conversations

```typescript
// Body: { type: 'direct' | 'group', name?: string, participant_ids: string[] }
// For 'direct': enforce uniqueness via advisory lock + existence check
// For 'group': creator auto-added as is_admin: true, can_edit_messages: true
// Returns: { conversation: Conversation } — HTTP 200 if existing DM returned, 201 if new
```

### GET /api/users?q=&limit=20

```typescript
// Returns up to 20 users matching q in username OR email (ILIKE '%q%')
// Excludes current user (D-20)
// Returns: { users: { id, username, email }[] }
```

---

## Code Examples

### WS Message Handler Router (server)

```typescript
// server/src/routes/ws/index.ts — extend existing file
import { register, unregister } from './registry.js';
import { handleMessageSend, handleMessageEdit, handleMessageDelete } from './handlers/message.js';
import { handleReactionAdd, handleReactionRemove } from './handlers/reaction.js';
import { handleTypingStart, handleTypingStop, cleanupTypingForUser } from './handlers/typing.js';
import { handleReadMark } from './handlers/read.js';

// Inside the websocket handler:
const userId = request.user.sub;
register(userId, socket);

socket.on('message', async (data) => {
  let envelope: { type: string; payload: unknown; id?: string };
  try {
    envelope = JSON.parse(data.toString());
  } catch {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }));
    return;
  }

  const { type, payload, id } = envelope;

  try {
    switch (type) {
      case 'message:send':   await handleMessageSend(userId, payload, id, socket); break;
      case 'message:edit':   await handleMessageEdit(userId, payload, id, socket); break;
      case 'message:delete': await handleMessageDelete(userId, payload, id, socket); break;
      case 'reaction:add':   await handleReactionAdd(userId, payload, id, socket); break;
      case 'reaction:remove': await handleReactionRemove(userId, payload, id, socket); break;
      case 'typing:start':   handleTypingStart(userId, request.user.username, payload, socket); break;
      case 'typing:stop':    handleTypingStop(userId, payload, socket); break;
      case 'read:mark':      await handleReadMark(userId, payload, id, socket); break;
      case 'history:request': await handleHistoryRequest(userId, payload, socket); break;
      default:
        socket.send(JSON.stringify({ type: 'error', payload: { message: `Unknown type: ${type}` } }));
    }
  } catch (err) {
    fastify.log.error({ userId, type, err }, 'WS handler error');
    socket.send(JSON.stringify({ type: 'error', id, payload: { message: 'Internal error' } }));
  }
});

socket.on('close', () => {
  unregister(userId, socket);
  cleanupTypingForUser(userId);
  fastify.log.info({ userId }, 'WebSocket connection closed');
});
```

### ChatContext + useReducer (client)

```typescript
// client/src/contexts/ChatContext.tsx
import React, { createContext, useContext, useReducer } from 'react';

// ... type definitions for Message, Conversation, ChatState, ChatAction ...

const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  wsStatus: 'disconnected',
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };
    case 'WS_STATUS':
      return { ...state, wsStatus: action.status };
    // ... all other cases
    default:
      return state;
  }
}

const ChatStateContext = createContext<ChatState | null>(null);
const ChatDispatchContext = createContext<React.Dispatch<ChatAction> | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  return (
    <ChatStateContext.Provider value={state}>
      <ChatDispatchContext.Provider value={dispatch}>
        {children}
      </ChatDispatchContext.Provider>
    </ChatStateContext.Provider>
  );
}

// Split contexts: consumers that only dispatch never re-render on state changes
export const useChatState = () => { /* ... */ };
export const useChatDispatch = () => { /* ... */ };
```

**Split context pattern:** Separate `ChatStateContext` and `ChatDispatchContext`. Components that only dispatch (like `MessageInput`) don't re-render when messages arrive. Follows React team recommendation for `useReducer`-backed context.

### Avatar Color Hash (UI-SPEC)

```typescript
// Deterministic background color from name:
function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) ?? 65;
  const hue = (code * 137) % 360;
  return `hsl(${hue}, 60%, 65%)`;
}
```

### emoji-mart Integration (Lazy-loaded)

```typescript
// client/src/components/chat/MessageInput.tsx
import React, { lazy, Suspense } from 'react';

const EmojiPicker = lazy(() =>
  import('@emoji-mart/react').then(mod => ({ default: mod.default }))
);

// In render, when pickerOpen:
{pickerOpen && (
  <Suspense fallback={null}>
    <EmojiPicker
      data={emojiData}
      onEmojiSelect={(emoji: { native: string }) => {
        handleEmojiSelect(emoji.native);
        setPickerOpen(false);
      }}
      theme="light"
      set="native"
    />
  </Suspense>
)}
```

Import emoji data statically at module level (not lazy — small JSON):
```typescript
import emojiData from '@emoji-mart/data';
```

### date-fns Formatting Pattern (UI-SPEC)

```typescript
import { format, formatDistanceToNow, isThisYear } from 'date-fns';

function formatSidebarTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 24 * 60 * 60 * 1000) {
    // < 24h: relative without suffix
    return formatDistanceToNow(date); // "5 minutes", "2 hours"
  }
  if (isThisYear(date)) {
    return format(date, 'dd/MM');
  }
  return format(date, 'dd/MM/yy');
}

function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm'); // 24-hour, always
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Socket.IO for WS | Native `ws` library | ~2022 onwards | Less overhead, no fallback complexity |
| Redux for chat state | React Context + useReducer | ~2021 onwards | Sufficient for single-conversation-at-a-time scope |
| Offset pagination | Cursor/keyset pagination | ~2019 onwards | Stable pagination as messages arrive |
| bcrypt for passwords | Argon2id | OWASP 2022+ recommendation | Already used in Phase 2 |
| `emoji-mart` v3 (React component) | `emoji-mart` v5 + `@emoji-mart/react` wrapper | 2022 (v5 split packages) | The old `emoji-mart` React component is now in `@emoji-mart/react`; installing just `emoji-mart` doesn't give a React component |

**Deprecated/outdated:**
- `emoji-mart` imported directly as a React component: package split in v5 — must install `@emoji-mart/react` separately
- `date-fns` v2 import paths (`date-fns/esm`): v4 uses direct named exports, tree-shaking is automatic
- `window.WebSocket` created in component body: always use `useEffect` + `useRef` pattern

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Schema migrations, all DB queries | Running in Docker | 16.x | — |
| Node.js | Backend server | Available (project uses node:22-alpine in Docker) | 22.x LTS | — |
| npm workspaces | Package installation | Configured in root package.json | npm 10.x | — |
| `@emoji-mart/react` | Emoji picker | Not yet installed | 1.1.1 (npm) | — (install required) |
| `@emoji-mart/data` | Emoji picker dataset | Not yet installed | 1.2.1 (npm) | — (install required) |
| `date-fns` | Timestamp formatting | Not yet installed | 4.1.0 (npm) | Use `Intl.RelativeTimeFormat` (more complex) |

**Missing dependencies with no fallback:**
- `@emoji-mart/react` and `@emoji-mart/data` — install in first wave

**Missing dependencies with fallback:**
- `date-fns` — could use `Intl.RelativeTimeFormat` + `Intl.DateTimeFormat` (more complex, less ergonomic), but date-fns is the locked decision from UI-SPEC

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently configured |
| Config file | none — Wave 0 must add test infrastructure |
| Quick run command | `npm test --workspace=server` (after setup) |
| Full suite command | `npm test` (root, runs both workspaces) |

No test files exist in the current codebase. Phases 1 and 2 were executed without test infrastructure. For Phase 3's complexity (transaction correctness, cursor pagination edge cases, WS handler routing), minimal smoke tests are recommended but not currently set up.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-01 | message:send handler persists to DB and sends ack | unit | `npm test --workspace=server -- message.test` | No — Wave 0 gap |
| MSG-02 | message:new fanout reaches participants | unit | `npm test --workspace=server -- registry.test` | No — Wave 0 gap |
| MSG-03 | Cursor pagination returns correct 50-message page | unit | `npm test --workspace=server -- pagination.test` | No — Wave 0 gap |
| MSG-04 | typing:start fans out to participants, cleanup on disconnect | unit | manual smoke test | No |
| MSG-05 | read:mark marks all messages up to ID as read | unit | `npm test --workspace=server -- read.test` | No — Wave 0 gap |
| MSG-06 | Unread count query is correct | unit | included in pagination.test | No |
| MSG-07 | message:edit checks can_edit_messages permission | unit | `npm test --workspace=server -- message.test` | No |
| MSG-08 | message:delete sets is_deleted, not hard-delete | unit | `npm test --workspace=server -- message.test` | No |
| MSG-09 | reply_to_id flows through message:send → message:new | integration | manual smoke test | No |
| MSG-10 | reaction:add toggles correctly, unique constraint honored | unit | `npm test --workspace=server -- reaction.test` | No |
| CONV-01 | POST /api/conversations direct: returns existing on second call | unit | `npm test --workspace=server -- conversations.test` | No |
| CONV-02 | POST /api/conversations group: creator is admin | unit | included in conversations.test | No |
| CONV-03 | GET /api/conversations returns sorted list with unread count | unit | included in conversations.test | No |

### Wave 0 Gaps
- [ ] `server/src/routes/ws/handlers/message.test.ts` — covers MSG-01, MSG-07, MSG-08
- [ ] `server/src/routes/ws/registry.test.ts` — covers MSG-02
- [ ] `server/src/routes/conversations/messages.test.ts` — covers MSG-03, MSG-06
- [ ] `server/src/routes/conversations/create.test.ts` — covers CONV-01, CONV-02, CONV-03

**Note:** Full test infrastructure setup (vitest or jest, DB fixture setup/teardown) is a significant effort. Given the project's current zero-test state and Phase 3 complexity, the planner should decide whether Wave 0 includes minimal test scaffolding or defers testing to a dedicated testing phase. The plan should explicitly state this decision.

---

## Open Questions

1. **`history:request` via WS vs REST for replay**
   - What we know: D-06 says "client sends `history:request` with `last_seen_message_id`" and D-37 says `GET /api/conversations/:id/messages?before=cursor` is the history endpoint. These serve different purposes: REST is for initial load + infinite scroll; WS `history:request` is for reconnect replay.
   - What's unclear: Should `history:request` via WS be implemented, or should reconnect use the REST endpoint instead? The REST endpoint already exists and handles pagination correctly.
   - Recommendation: Use REST for both initial load and reconnect replay. Simplifies WS handler. Client on reconnect calls `GET /api/conversations/:id/messages` for each active conversation. WS `history:request` type in D-02 can be removed from the WS protocol. This aligns with ARCHITECTURE.md Pattern 3 ("History is always fetched over HTTP").

2. **`conversation:new` WS broadcast scope (D-38)**
   - What we know: When a new conversation is created via REST, a `conversation:new` WS event should go to all participants.
   - What's unclear: For a direct conversation, the other user needs to receive `conversation:new` to add it to their sidebar. The REST handler needs access to the WS registry (which lives in the `ws` module). This creates a cross-module dependency.
   - Recommendation: Export the registry as a shared module singleton (Pattern 1 already handles this). The REST conversation route imports `broadcast` from `registry.ts`. Clean dependency without circular imports.

3. **Unread count computation strategy**
   - What we know: `conversation_participants.last_read_message_id` exists. D-33 specifies `COUNT(*) WHERE id > last_read_message_id`.
   - What's unclear: UUID comparison (`id > uuid`) sorts lexicographically, not chronologically. For Phase 3 scope, unread count via `COUNT(*) WHERE created_at > (SELECT created_at FROM messages WHERE id = $lastReadId)` is correct but requires a join.
   - Recommendation: In `GET /api/conversations`, compute unread count as a correlated subquery using `created_at` ordering: `(SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND created_at > (SELECT created_at FROM messages WHERE id = cp.last_read_message_id))`. This is O(n) per conversation but for the small scale of this project it's acceptable.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 3 |
|-----------|-------------------|
| Node.js 22.x LTS | Backend server runtime — already locked |
| Fastify 5.8.x | REST endpoint framework — already installed |
| ws 8.20.x + @fastify/websocket | WS handler — already installed |
| PostgreSQL 16 + Drizzle ORM | All DB work — already installed |
| React 19 + Vite 6 | Client — already installed |
| JWT auth (cookie-based) | WS auth already wired; `request.user.sub` is always populated |
| No rate limiting in v1 (D-08) | Don't add per-message rate limiting |
| Docker Compose deployment | No operational changes in Phase 3 |
| TLS via Caddy | No WS protocol changes needed — Caddy already proxies /ws correctly |
| GSD Workflow: use `/gsd:execute-phase` | All file changes through GSD workflow |

---

## Sources

### Primary (HIGH confidence)
- `server/src/db/schema.ts` — confirmed existing tables, indices, UUID PKs
- `server/src/routes/ws/index.ts` — confirmed WS stub structure, `request.user.sub` pattern
- `server/src/plugins/auth.ts` — confirmed JWT cookie pattern, `authenticate` decorator
- `client/src/contexts/AuthContext.tsx` — confirmed Context + useState pattern (useReducer is the upgrade)
- `.planning/research/ARCHITECTURE.md` — Pattern 3 (cursor pagination), Pattern 4 (denormalized last_message), Pattern 5 (DB-first)
- `.planning/research/PITFALLS.md` — #2 (silent loss), #5 (React WS leaks), #8 (unread COUNT), #13 (reconnect)
- `03-CONTEXT.md` — all 38 locked decisions
- `03-UI-SPEC.md` — component inventory, CSS Modules approach, emoji-mart + date-fns locked

### Secondary (MEDIUM confidence)
- npm registry search: `@emoji-mart/react` 1.1.1, `@emoji-mart/data` 1.2.1, `date-fns` 4.1.0 — verified current versions
- Drizzle ORM transactions docs (https://orm.drizzle.team/docs/transactions) — `.returning()` pattern confirmed
- cursor pagination guide (https://bun.uptrace.dev/guide/cursor-pagination.html) — compound cursor pattern confirmed
- PostgreSQL advisory locks for race-safe uniqueness (https://firehydrant.com/blog/using-advisory-locks-to-avoid-race-conditions-in-rails/) — pattern confirmed

### Tertiary (LOW confidence)
- WebSearch: React 19 useReducer + Context patterns — consistent with React docs, no React 19-specific changes to useReducer API
- WebSearch: IntersectionObserver + debounce in React — standard pattern, no library required

---

## Metadata

**Confidence breakdown:**
- Schema extensions: HIGH — reading actual schema.ts, extensions are additive
- WS handler architecture: HIGH — ws library + Fastify pattern verified against existing stub
- Cursor pagination: HIGH — verified against ARCHITECTURE.md + Drizzle docs + keyset pagination guides
- React Context + useReducer: HIGH — standard React 19 pattern, confirmed by existing AuthContext pattern
- emoji-mart integration: MEDIUM — package versions confirmed; lazy-load pattern is standard React
- Advisory lock for DM uniqueness: MEDIUM — PostgreSQL docs confirm the lock API; Drizzle SQL template usage needs care

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable libraries; emoji-mart and date-fns are unlikely to have breaking changes in 30 days)
