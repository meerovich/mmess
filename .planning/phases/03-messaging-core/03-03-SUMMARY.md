---
phase: 03-messaging-core
plan: "03"
subsystem: api
tags: [fastify, drizzle, postgresql, rest, pagination, cursor]

requires:
  - phase: 03-01
    provides: schema with conversations, messages, conversation_participants, message_reactions tables
  - phase: 03-02
    provides: ws/registry.ts broadcast() function for conversation:new WS events

provides:
  - GET /api/conversations — list with unread count, last message, participants
  - GET /api/conversations/:id/messages — cursor-paginated history (oldest-first)
  - POST /api/conversations — create direct (idempotent) or group conversation
  - GET /api/users?q= — user search excluding self

affects:
  - 03-04 (client UI will call these endpoints for bootstrap and infinite scroll)
  - 03-05 (WS handlers will update conversation.updated_at triggering list reorder)

tech-stack:
  added: []
  patterns:
    - Compound cursor pagination (created_at, id) DESC fetch + reverse for oldest-first
    - pg_advisory_xact_lock for race-safe direct conversation uniqueness
    - ILIKE search with minimum 2-char guard against full-table dumps
    - Direct import of ws/registry broadcast() — no Fastify decorator indirection

key-files:
  created:
    - server/src/routes/conversations/index.ts
    - server/src/routes/conversations/messages.ts
    - server/src/routes/conversations/create.ts
    - server/src/routes/users/search.ts
  modified:
    - server/src/index.ts

key-decisions:
  - "Direct ws/registry import in create.ts instead of Fastify decorator — cleaner coupling after 03-02 landed"
  - "Unread count: COUNT messages after last_read_message's created_at (D-33 pattern)"
  - "Cursor decode uses indexOf('|') not split('|') — handles ISO timestamps with no | ambiguity"

patterns-established:
  - "Pattern: cursor-based pagination fetchs limit+1 rows; hasMore = (result.length > limit)"
  - "Pattern: pg_advisory_xact_lock with MD5 hash of sorted user IDs for DM uniqueness"

requirements-completed:
  - MSG-03
  - MSG-06
  - CONV-01
  - CONV-02
  - CONV-03

duration: 25min
completed: 2026-04-11
---

# Phase 03 Plan 03: REST Endpoints — Conversations, Message History, User Search Summary

**Four REST endpoints enabling conversation bootstrap, infinite-scroll history via (created_at,id) cursor pagination, race-safe DM creation with pg_advisory_xact_lock, and ILIKE user search**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-11T00:00:00Z
- **Completed:** 2026-04-11T00:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /api/conversations returns all user conversations with unread count (via last_read_message_id cursor), last message preview, and participant list; DM names derived server-side from the other participant's username
- GET /api/conversations/:id/messages implements RESEARCH.md Pattern 3 compound cursor pagination, returns messages oldest-first with sender info, reactions, and reply_to preview
- POST /api/conversations handles both direct (idempotent with advisory lock) and group (creator auto-admin) creation, broadcasts conversation:new to participants via ws/registry
- GET /api/users?q= ILIKE searches username+email, excludes self, requires 2+ chars, capped at 20 results

## REST Endpoint Reference (for Plan 04 TypeScript types)

### GET /api/conversations
**Response:** `Array<ConversationListItem>`
```typescript
{
  id: string;          // uuid
  type: 'direct' | 'group';
  name: string;        // derived: other username for DMs, name field for groups
  avatar_url: string | null;
  last_message: {
    id: string;
    content: string | null;
    sender_id: string;
    created_at: string;  // ISO
  } | null;
  unread_count: number;
  participants: Array<{ user_id: string; username: string; avatar_url: string | null }>;
  updated_at: string;  // ISO
  created_at: string;  // ISO
}
```

### GET /api/conversations/:id/messages
**Query params:** `before` (cursor string), `limit` (default 50, max 50)
**Response:**
```typescript
{
  messages: Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string | null;
    reply_to_id: string | null;
    is_deleted: boolean;
    edited_at: string | null;
    created_at: string;
    sender: { id: string; username: string; avatar_url: string | null };
    reply_to: { id: string; sender_id: string; content: string | null } | null;
    reactions: Array<{ emoji: string; user_id: string; username: string }>;
  }>;
  nextCursor: string | null;  // format: "ISO_TIMESTAMP|uuid"
  hasMore: boolean;
}
```
Messages ordered **oldest-first** (DESC query reversed before return).

### POST /api/conversations
**Body:**
```typescript
{
  type: 'direct' | 'group';
  name?: string;           // required for group
  participant_ids: string[];  // other users (creator auto-added)
}
```
**Response:** Full `ConversationListItem` + participants with `is_admin`/`can_edit_messages`
**Status:** 201 (new), 200 (existing direct conversation returned)

### GET /api/users?q=&limit=
**Response:** `{ users: Array<{ id, username, email, avatar_url }> }`
Returns empty array if `q.length < 2`.

## Conversation List Query Approach

Used two queries:
1. `conversation_participants INNER JOIN conversations WHERE user_id = ? ORDER BY updated_at DESC` — gets all conversation+participant rows
2. Batch fetch: all participants for those conversations via `= ANY(ARRAY[...])`, last messages via message IDs, then per-conversation unread counts (individual queries per conversation)

The N+1 for unread counts is acceptable at this scale (tens of users). A future optimization could use a single `LEFT JOIN LATERAL` subquery.

## Drizzle Query Patterns (vs RESEARCH.md)

- `tx.execute<{id: string}>(sql\`...\`)` returns `RowList` — used `Array.from()` to iterate
- `sql\`= ANY(ARRAY[...])\`` with `sql.join()` for batch UUID array filters
- Cursor condition uses Drizzle `or(lt(...), and(eq(...), lt(...)))` matching RESEARCH.md Pattern 3 exactly

## Task Commits

1. **Task 1: Conversations list, messages history, and user search routes** - `5cc0a65` (feat)
2. **Task 2: Conversation creation endpoint + route registration** - `42ff979` (feat)
3. **Fix: Wire create.ts to ws registry broadcast** - `3a2474a` (fix - Rule 1 deviation)

## Files Created/Modified
- `server/src/routes/conversations/index.ts` — GET /api/conversations with unread counts
- `server/src/routes/conversations/messages.ts` — GET /api/conversations/:id/messages with cursor pagination
- `server/src/routes/conversations/create.ts` — POST /api/conversations (direct + group)
- `server/src/routes/users/search.ts` — GET /api/users?q= user search
- `server/src/index.ts` — all 4 route plugins registered

## Decisions Made
- Used `indexOf('|')` for cursor decode instead of `split('|')` — more explicit and avoids off-by-one if cursor encoding ever changes
- Unread count computed per-conversation using `created_at` of last read message as boundary (avoids UUID comparison ordering issues)
- Direct import of `broadcast()` from `ws/registry.ts` rather than checking for a Fastify decorator — 03-02 landed first in parallel execution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed WS broadcast to use direct registry import**
- **Found during:** Post-Task 2 (after 03-02 completed)
- **Issue:** Task 2 used a conditional Fastify decorator check (`f.wsBroadcastToUsers`), but 03-02's registry exports `broadcast()` as a plain function, not a Fastify decorator
- **Fix:** Replaced conditional decorator lookup with `import { broadcast } from '../ws/registry.js'`
- **Files modified:** `server/src/routes/conversations/create.ts`
- **Committed in:** `3a2474a`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in broadcast wiring)
**Impact on plan:** Correctness fix — conversation:new broadcast would silently fail without this. No scope creep.

## Issues Encountered
- Shell working directory initialization fails in this environment (bash cwd temp file error) but commands execute correctly. TypeScript compile verified via direct `node typescript/bin/tsc` invocation with output captured to `/C:/Users/Public/`.

## Known Stubs
None — all endpoints are fully wired to the database.

## Next Phase Readiness
- All REST endpoints ready for Plan 04 (React client chat UI)
- Response shapes documented above provide TypeScript type definitions for client
- Cursor format `"ISO_TIMESTAMP|uuid"` is established — client must encode/decode this
- WS `conversation:new` broadcast is live — client can listen for new conversations without polling

---
*Phase: 03-messaging-core*
*Completed: 2026-04-11*
