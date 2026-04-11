---
phase: 03-messaging-core
plan: "02"
subsystem: websocket
tags: [websocket, registry, handlers, real-time, drizzle, typescript]

# Dependency graph
requires:
  - phase: 03-01
    provides: message_reads table, can_edit_messages column
  - phase: 02-authentication
    provides: JWT auth, fastify.authenticate decorator
provides:
  - registry.ts: Map<userId, Set<WebSocket>> fan-out singleton
  - handlers/message.ts: handleMessageSend, handleMessageEdit, handleMessageDelete
  - handlers/reaction.ts: handleReactionAdd, handleReactionRemove
  - handlers/typing.ts: handleTypingStart, handleTypingStop, cleanupTypingForUser
  - handlers/read.ts: handleReadMark
  - ws/index.ts: full dispatch loop for all 8 D-02 message types
affects: [03-03, 03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level Map singleton for WS registry (no class instantiation needed)"
    - "DB-first message delivery: INSERT + UPDATE conversations in one drizzle transaction"
    - "Soft delete pattern: is_deleted=true, row preserved"
    - "dynamic import('../registry.js') in handlers to avoid circular dep at module load"
    - "PostgresJsDatabase type used (not NodePgDatabase) — project uses drizzle-orm/postgres-js"
    - "db cast as any in index.ts to bridge PostgresJsDatabase<Record<string,never>> to full schema DB type"

key-files:
  created:
    - server/src/routes/ws/registry.ts
    - server/src/routes/ws/handlers/message.ts
    - server/src/routes/ws/handlers/reaction.ts
    - server/src/routes/ws/handlers/typing.ts
    - server/src/routes/ws/handlers/read.ts
  modified:
    - server/src/routes/ws/index.ts

key-decisions:
  - "Used dynamic import('../registry.js') inside handlers to avoid circular module dependency at load time"
  - "PostgresJsDatabase<Record<string,never>> used as DB type in handlers; db cast as any in index.ts"
  - "handleTypingStart signature accepts (userId, username, conversationId, db, clientId) to match index.ts dispatch"

patterns-established:
  - "All WS handlers follow signature: (db, socket, userId, payload, clientId) for consistency"
  - "sender_id always sourced from JWT userId, never from client payload"
  - "broadcast() excludes sender via excludeUserId param — sender gets ack instead"

requirements-completed: [MSG-01, MSG-02, MSG-04, MSG-05, MSG-07, MSG-08, MSG-10]

# Metrics
duration: 15min
completed: 2026-04-11
---

# Phase 3 Plan 02: WebSocket Handlers + Connection Registry Summary

**Full server-side WS protocol implemented: connection registry, message/reaction/typing/read handlers with DB-first fan-out, dispatching all 8 D-02 message types**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-11
- **Completed:** 2026-04-11
- **Tasks:** 2
- **Files created/modified:** 6

## Accomplishments

- Created `registry.ts` as a module-level singleton `Map<string, Set<WebSocket>>` with register/unregister/send/broadcast
- Created `handlers/message.ts` with send/edit/delete — DB-first transaction for send, D-21 permission model for edit/delete
- Created `handlers/reaction.ts` with add/remove, idempotent via `onConflictDoNothing()`
- Created `handlers/typing.ts` with in-memory timer map, auto-expiry at 5s, `cleanupTypingForUser` on socket close
- Created `handlers/read.ts` with batch mark-read receipts up to marked message + `last_read_message_id` cursor update
- Updated `index.ts` to dispatch all 8 WS message types with registry lifecycle on connect/close

## Task Commits

Each task was committed atomically:

1. **Task 1: Create connection registry module** - `24b2c2e` (feat)
2. **Task 2: Implement WS message handlers and dispatch loop** - `e5db4f9` (feat)

**Plan metadata:** (this commit)

## Handler Function Signatures (for Plan 04 client context)

```typescript
// registry.ts
register(userId: string, socket: WebSocket): void
unregister(userId: string, socket: WebSocket): void
send(userId: string, data: unknown): void
broadcast(userIds: string[], data: unknown, excludeUserId?: string): void

// handlers/message.ts
handleMessageSend(db, socket, userId, payload: { conversation_id, content, reply_to_id? }, clientId): Promise<void>
handleMessageEdit(db, socket, userId, payload: { message_id, content }, clientId): Promise<void>
handleMessageDelete(db, socket, userId, payload: { message_id }, clientId): Promise<void>

// handlers/reaction.ts
handleReactionAdd(db, socket, userId, payload: { message_id, emoji }, clientId): Promise<void>
handleReactionRemove(db, socket, userId, payload: { message_id, emoji }, clientId): Promise<void>

// handlers/typing.ts
handleTypingStart(userId, username, conversationId, db, clientId): Promise<void>
handleTypingStop(userId, conversationId, db): Promise<void>
cleanupTypingForUser(userId: string): void

// handlers/read.ts
handleReadMark(db, socket, userId, payload: { message_id, conversation_id }, clientId): Promise<void>
```

## DB Import Path

`db` is imported from `../../db/index.js` (relative to `ws/index.ts`). It is `drizzle(postgres(DATABASE_URL), { schema })` — uses `drizzle-orm/postgres-js`, so the type is `PostgresJsDatabase<typeof schema>`.

## WS Message Type Coverage

| Client → Server | Handler | Server → Client events |
|-----------------|---------|------------------------|
| `message:send` | `handleMessageSend` | `ack` (sender) + `message:new` (others) |
| `message:edit` | `handleMessageEdit` | `ack` (sender) + `message:edited` (others) |
| `message:delete` | `handleMessageDelete` | `ack` (sender) + `message:deleted` (others) |
| `reaction:add` | `handleReactionAdd` | `ack` (sender) + `reaction:added` (others) |
| `reaction:remove` | `handleReactionRemove` | `ack` (sender) + `reaction:removed` (others) |
| `typing:start` | `handleTypingStart` | `typing:user` (others) |
| `typing:stop` | `handleTypingStop` | `typing:user` (others, typers list updated) |
| `read:mark` | `handleReadMark` | `read:by` (others) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Dynamic import for registry to avoid circular deps**
- **Found during:** Task 2
- **Issue:** Handler files import from registry.ts, and if registry imported from handlers there'd be a circular dep. Static imports at top of handlers work fine but dynamic import used as a safety measure.
- **Fix:** Used `const { broadcast } = await import('../registry.js')` inside handler functions
- **Impact:** Zero runtime impact — module is cached after first load

**2. [Rule 1 - Type Adaptation] db cast as `any` in index.ts**
- **Found during:** Task 2
- **Issue:** `drizzle-orm/postgres-js` exports `PostgresJsDatabase<TSchema>` but handlers use `PostgresJsDatabase<Record<string, never>>`. The actual db has the full schema type. TypeScript reports narrowing mismatch.
- **Fix:** Used `db as any` at call sites in index.ts to bridge the generic type parameter difference
- **Impact:** No runtime impact; full type safety preserved within each handler file

## TypeScript Compile

`npx tsc --noEmit -p server/tsconfig.json` — EXIT 0, no errors.

`grep -r "sender_id.*payload" server/src/routes/ws/handlers/` — no matches (sender_id is ALWAYS from JWT).

## Known Stubs

None — all handler implementations are fully wired.

## Self-Check: PASSED

- FOUND: server/src/routes/ws/registry.ts
- FOUND: server/src/routes/ws/handlers/message.ts
- FOUND: server/src/routes/ws/handlers/reaction.ts
- FOUND: server/src/routes/ws/handlers/typing.ts
- FOUND: server/src/routes/ws/handlers/read.ts
- FOUND: server/src/routes/ws/index.ts (updated)
- FOUND commit 24b2c2e: feat(03-02) registry module
- FOUND commit e5db4f9: feat(03-02) WS handlers

---
*Phase: 03-messaging-core*
*Completed: 2026-04-11*
