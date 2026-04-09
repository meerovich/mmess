---
phase: 3
slug: messaging-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (server) + TypeScript compiler (client) |
| **Config file** | `server/vitest.config.ts` — created in Phase 2 Wave 0 |
| **Quick run command** | `npm run test --workspace=server -- --run` |
| **Full suite command** | `npm run test --workspace=server -- --run --reporter=verbose` |
| **Client type-check** | `npx tsc --noEmit -p client/tsconfig.json` |
| **Server type-check** | `npx tsc --noEmit -p server/tsconfig.json` |
| **Estimated runtime** | ~20–40 seconds (server integration tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` for the affected workspace
- **After every plan wave:** Run server test suite + both workspace type-checks
- **Before `/gsd:verify-work`:** Full suite must be green; no TS errors in either workspace
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Test Type | Automated Command | File Exists | Status |
|---------|------|------|--------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | 1 | MSG-05, MSG-10, CONV-01, CONV-02 | static | `grep -n "message_reads\|can_edit_messages" server/src/db/schema.ts` | ✅ | ⬜ pending |
| 03-01-T2 | 01 | 1 | MSG-05, MSG-10 | static | `node -e "require('./node_modules/@emoji-mart/react'); require('./node_modules/date-fns'); console.log('ok')"` | ✅ | ⬜ pending |
| 03-02-T1 | 02 | 2 | MSG-01, MSG-02 | static + unit | `npx tsc --noEmit -p server/tsconfig.json 2>&1 \| grep -i "registry" \|\| echo "registry: no TS errors"` | ❌ W0 | ⬜ pending |
| 03-02-T2 | 02 | 2 | MSG-01, MSG-02, MSG-04, MSG-05, MSG-07, MSG-08, MSG-10 | static + integration | `npx tsc --noEmit -p server/tsconfig.json 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 03-03-T1 | 03 | 2 | MSG-03, MSG-06, CONV-03 | static + integration | `npx tsc --noEmit -p server/tsconfig.json 2>&1 \| grep -E "conversations\|users\|search" \|\| echo "No errors in new route files"` | ❌ W0 | ⬜ pending |
| 03-03-T2 | 03 | 2 | CONV-01, CONV-02 | static + integration | `npx tsc --noEmit -p server/tsconfig.json 2>&1 \| tail -10` | ❌ W0 | ⬜ pending |
| 03-04-T1 | 04 | 3 | MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, CONV-03 | static | `npx tsc --noEmit -p client/tsconfig.json 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 03-04-T2 | 04 | 3 | MSG-01, MSG-02 | static | `grep -n "tokens.css\|reset.css" client/src/main.tsx && grep -n "ChatProvider\|WebSocketProvider" client/src/App.tsx` | ❌ W0 | ⬜ pending |
| 03-05-T1 | 05 | 4 | CONV-01, CONV-02, CONV-03, MSG-06 | static | `npx tsc --noEmit -p client/tsconfig.json 2>&1 \| grep -E "Avatar\|ChatLayout\|ConversationList\|ConversationItem" \|\| echo "No TS errors in sidebar components"` | ❌ W0 | ⬜ pending |
| 03-05-T2 | 05 | 4 | CONV-01, CONV-02 | static | `npx tsc --noEmit -p client/tsconfig.json 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 03-05-CP | 05 | 4 | CONV-01, CONV-02, CONV-03, MSG-06 | manual | See plan 03-05 checkpoint | n/a | ⬜ pending |
| 03-06-T1 | 06 | 4 | MSG-01, MSG-02, MSG-03, MSG-04, MSG-05 | static | `npx tsc --noEmit -p client/tsconfig.json 2>&1 \| grep -E "ChatPane\|MessageList\|TypingIndicator" \|\| echo "No TS errors in pane components"` | ❌ W0 | ⬜ pending |
| 03-06-T2 | 06 | 4 | MSG-01, MSG-07, MSG-08, MSG-09, MSG-10 | static | `npx tsc --noEmit -p client/tsconfig.json 2>&1 \| tail -20` | ❌ W0 | ⬜ pending |
| 03-06-CP | 06 | 4 | MSG-01 through MSG-10 | manual | See plan 03-06 checkpoint | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 3 does not add new server integration tests (WS handlers and REST endpoints are tested via TypeScript compile + manual checkpoint). The existing Phase 2 test infrastructure remains. However, the following files must exist before any Phase 3 implementation begins:

- [ ] `server/vitest.config.ts` — carried from Phase 2; confirm it exists before starting 03-02
- [ ] `server/src/test/helpers.ts` — carried from Phase 2; confirm it exists before starting 03-02

Phase 3 adds no new Wave 0 test stubs because:
- WS handlers (plan 03-02): integration-tested manually via two-tab browser session; automated WS testing at unit level is blocked by `@fastify/websocket` test complexity
- REST endpoints (plan 03-03): TypeScript compile + curl integration tests documented in plan verification sections
- React components (plans 03-04 through 03-06): TypeScript compile is primary automated gate; visual/functional testing is via human checkpoint

---

## Per-Requirement Test Coverage

### MSG-01: User can send text messages in real-time via WebSocket

| Behavior | Verification | Command |
|----------|--------------|---------|
| `message:send` handler inserts message in DB transaction + updates conversations.last_message_id | TypeScript compile (no runtime errors) | `npx tsc --noEmit -p server/tsconfig.json` |
| `sender_id` never read from client payload — always from JWT | grep check | `grep "sender_id.*payload\|payload.*sender_id" server/src/routes/ws/handlers/message.ts` — must return 0 results |
| `db.transaction` used in message:send | grep check | `grep "db\.transaction" server/src/routes/ws/handlers/message.ts` |
| Sender receives `ack` with client `id` echoed (D-03) | manual | 03-06 checkpoint step 3 |
| Optimistic message appears immediately, replaced on ack | manual | 03-06 checkpoint step 3 |

### MSG-02: User can receive messages in real-time without page refresh

| Behavior | Verification | Command |
|----------|--------------|---------|
| `broadcast()` called after DB commit, excludes sender | grep check | `grep "broadcast(" server/src/routes/ws/handlers/message.ts` |
| Connection registry `unregister()` called on socket close | grep check | `grep "unregister\|cleanupTyping" server/src/routes/ws/index.ts` |
| Message appears in other tab without refresh | manual | 03-06 checkpoint step 3 |

### MSG-03: User can view paginated message history (scroll up to load older)

| Behavior | Verification | Command |
|----------|--------------|---------|
| Cursor uses `(created_at, id)` compound — no offset/limit | grep check | `grep "cursorDate.*cursorId\|split.*\|" server/src/routes/conversations/messages.ts` |
| Response includes `nextCursor` and `hasMore` | grep check | `grep "nextCursor\|hasMore" server/src/routes/conversations/messages.ts` |
| Messages returned oldest-first | grep check | `grep "reverse\|\.reverse()" server/src/routes/conversations/messages.ts` |
| Scroll position preserved on load-more | grep check | `grep "scrollHeight.*prevScrollHeight\|prevScrollHeight.*scrollHeight" client/src/components/chat/MessageList.tsx` |
| Older messages load when scrolling up | manual | 03-06 checkpoint step 4 |

### MSG-04: User sees typing indicator when another user is composing

| Behavior | Verification | Command |
|----------|--------------|---------|
| typing:start sent on first non-empty keystroke | grep check | `grep "typing:start" client/src/components/chat/MessageInput.tsx` |
| typing:stop sent on empty input or 3s idle | grep check | `grep "typing:stop" client/src/components/chat/MessageInput.tsx` |
| Ephemeral in-memory map (never persisted to DB) | grep check | `grep "Map\|typingMap" server/src/routes/ws/handlers/typing.ts` — confirm no DB insert |
| 3 text variants (1 / 2 / 3+ typers) | grep check | `grep "Several people\|and.*typing\|is typing" client/src/components/chat/TypingIndicator.tsx` |
| Typing indicator visible in other tab | manual | 03-06 checkpoint step 5 |

### MSG-05: User sees read receipt status on sent messages (delivered/read)

| Behavior | Verification | Command |
|----------|--------------|---------|
| `message_reads` table exists in schema | grep check | `grep "message_reads" server/src/db/schema.ts` |
| `read:mark` inserts into message_reads + updates last_read_message_id | grep check | `grep "message_reads\|last_read_message_id" server/src/routes/ws/handlers/read.ts` |
| `read:by` broadcast sent to other participants | grep check | `grep "read:by" server/src/routes/ws/handlers/read.ts` |
| IntersectionObserver on last message | grep check | `grep "IntersectionObserver" client/src/components/chat/MessageList.tsx` |
| Single check → double green check when read | manual | 03-06 checkpoint step 6 |

### MSG-06: User sees unread message count per conversation

| Behavior | Verification | Command |
|----------|--------------|---------|
| GET /api/conversations returns `unread_count` field | grep check | `grep "unread_count" server/src/routes/conversations/index.ts` |
| Unread badge renders when count > 0 | grep check | `grep "unread_count" client/src/components/chat/ConversationItem.tsx` |
| Badge shows "99+" when count > 99 | grep check | `grep "99+" client/src/components/chat/ConversationItem.tsx` |

### MSG-07: User can edit their own sent messages

| Behavior | Verification | Command |
|----------|--------------|---------|
| Direct chat edit rejected (D-21) | grep check | `grep "direct.*Edit not allowed\|type.*direct" server/src/routes/ws/handlers/message.ts` |
| Group chat: requires is_admin or can_edit_messages (D-21) | grep check | `grep "is_admin\|can_edit_messages" server/src/routes/ws/handlers/message.ts` |
| edited_at set on update | grep check | `grep "edited_at" server/src/routes/ws/handlers/message.ts` |
| "(edited)" suffix in client | grep check | `grep "edited_at\|edited" client/src/components/chat/MessageItem.tsx` |
| Edit flow: input fills with message text, Save changes | manual | 03-06 checkpoint step 7 |

### MSG-08: User can delete their own sent messages

| Behavior | Verification | Command |
|----------|--------------|---------|
| Soft delete (is_deleted = true, row kept) | grep check | `grep "is_deleted.*true\|soft" server/src/routes/ws/handlers/message.ts` |
| "Message deleted" placeholder | grep check | `grep "is_deleted\|Message deleted" client/src/components/chat/MessageItem.tsx` |
| Inline delete confirmation | manual | 03-06 checkpoint step 8 |

### MSG-09: User can reply to a specific message (quoted reply)

| Behavior | Verification | Command |
|----------|--------------|---------|
| reply_to_id sent in message:send payload | grep check | `grep "reply_to_id" client/src/components/chat/MessageInput.tsx` |
| Reply strip shows sender + 80 char preview | grep check | `grep "replyTo\|reply_to\|Replying" client/src/components/chat/MessageInput.tsx` |
| ReplyPreview renders in message bubble | grep check | `grep "ReplyPreview\|reply_to" client/src/components/chat/MessageItem.tsx` |
| Reply quoted preview visible in sent message | manual | 03-06 checkpoint step 9 |

### MSG-10: User can add emoji reactions to messages

| Behavior | Verification | Command |
|----------|--------------|---------|
| @emoji-mart/react installed | grep check | `grep "emoji-mart" client/package.json` |
| Emoji picker loaded lazily | grep check | `grep "React.lazy\|lazy.*Picker\|lazy.*emoji" client/src/components/chat/ReactionBar.tsx` |
| reaction:add / reaction:remove WS sent | grep check | `grep "reaction:add\|reaction:remove" client/src/components/chat/ReactionBar.tsx` |
| Toggle: own reaction removes on second click | grep check | `grep "reaction:remove" client/src/components/chat/ReactionBar.tsx` |
| Reaction badge visible; select emoji adds reaction | manual | 03-06 checkpoint step 10 |

### CONV-01: User can start a private (1-on-1) conversation

| Behavior | Verification | Command |
|----------|--------------|---------|
| POST /api/conversations accepts type:direct | grep check | `grep "type.*group\|type.*direct" server/src/routes/conversations/create.ts` |
| Direct conversation idempotent (returns existing) | grep check | `grep "pg_advisory_xact_lock" server/src/routes/conversations/create.ts` |
| NewChatModal user search debounced 300ms | grep check | `grep "debounce\|setTimeout.*300\|useEffect.*query" client/src/components/chat/NewChatModal.tsx` |
| DM creates/opens conversation on user select | manual | 03-05 checkpoint step 4 |

### CONV-02: User can create a group conversation with multiple participants

| Behavior | Verification | Command |
|----------|--------------|---------|
| Creator set as is_admin + can_edit_messages | grep check | `grep "is_admin.*true" server/src/routes/conversations/create.ts` |
| Minimum 1 participant_id required | grep check | `grep "participant_ids.length\|length.*1\|length.*===" server/src/routes/conversations/create.ts` |
| Create group button disabled until name + users selected | grep check | `grep "disabled.*groupName\|disabled.*selectedUsers" client/src/components/chat/NewGroupModal.tsx` |
| Multi-select chips with remove (×) | manual | 03-05 checkpoint step 5 |

### CONV-03: User sees a list of all conversations sorted by last activity

| Behavior | Verification | Command |
|----------|--------------|---------|
| GET /api/conversations sorted by updated_at DESC | grep check | `grep "updated_at\|orderBy.*desc" server/src/routes/conversations/index.ts` |
| Each item shows name, preview, time, unread badge | grep check | `grep "unread_count\|last_message\|updated_at" client/src/components/chat/ConversationItem.tsx` |
| DM name shows other participant's username | grep check | `grep "participant.*username\|userId.*!==\|user_id.*!==" client/src/components/chat/ConversationItem.tsx` |
| Conversation list renders on page load | manual | 03-05 checkpoint step 3 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time message delivery between two users | MSG-01, MSG-02 | Requires two authenticated browser sessions | 03-06 checkpoint step 3: open two tabs, send message from tab A, verify tab B receives without refresh |
| Typing indicator visible cross-tab | MSG-04 | Requires two browser sessions + timing | 03-06 checkpoint step 5 |
| Read receipt green ✓✓ when recipient reads | MSG-05 | Requires two browser sessions + scroll trigger | 03-06 checkpoint step 6 |
| Infinite scroll position preservation | MSG-03 | Requires 50+ messages + scroll interaction | 03-06 checkpoint step 4 |
| Desktop 280px sidebar + mobile single-pane | CONV-03, D-09, D-10 | Requires visual + DevTools resize | 03-05 checkpoint steps 3 + 6 |
| Reconnecting banner on network disconnect | MSG-01 | Requires DevTools network throttle | 03-06 checkpoint step 11 |
| Emoji picker opens on [+] hover | MSG-10 | Requires hover interaction | 03-06 checkpoint step 10 |
| D-21 edit/delete only in groups | MSG-07, MSG-08 | Requires creating direct + group chats | 03-06 checkpoint steps 7 + 8 |

---

## Key Invariants (Security + Correctness)

These must hold at all times — executor must grep-verify before committing each WS handler task:

| Invariant | Grep Command | Expected Result |
|-----------|--------------|-----------------|
| sender_id never from client payload | `grep "sender_id.*payload\|payload.*sender_id" server/src/routes/ws/handlers/message.ts` | 0 results |
| DB-first delivery: transaction wraps INSERT + UPDATE | `grep "db\.transaction" server/src/routes/ws/handlers/message.ts` | 1+ results |
| History:request NOT sent from client (REST-based replay per D-06) | `grep "history:request" client/src/providers/WebSocketProvider.tsx` | 0 results |
| WS reconnect uses fixed 5s interval (not exponential) | `grep "setTimeout.*connect.*5000" client/src/providers/WebSocketProvider.tsx` | 1 result |
| No hardcoded hex in CSS modules | `grep -rn "#[0-9a-fA-F]{3,6}" client/src/components/chat/*.module.css` | 0 results (except #fdd663 in ChatPane reconnect banner — 1 acceptable) |
| Direct chat blocks edit AND delete (D-21) | `grep "direct.*not allowed\|type.*direct" server/src/routes/ws/handlers/message.ts` | 2+ results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] Key invariants section populated
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
