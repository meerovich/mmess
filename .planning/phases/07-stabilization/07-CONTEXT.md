# Phase 7: Stabilization - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix all known base-function bugs in v1.0.3 — primarily the broken read receipt pipeline — and run a regression sweep to surface any unknown issues. Every bug found in the sweep is fixed in this phase. The phase delivers a known-good baseline on which all subsequent v1.1 phases build.

</domain>

<decisions>
## Implementation Decisions

### Read Receipt Semantics
- **D-01:** 3-state read receipt: ✓ gray (sent/ack'd by server) → ✓✓ gray (delivered to at least one recipient socket) → ✓✓ blue (read by all participants)
- **D-02:** In group chats, ✓✓ blue means ALL participants have read. Partial read shows ✓✓ gray (delivered) until everyone reads.
- **D-03:** Tooltip on hover/long-press shows list of names who have read the message (already exists in ReadReceipt component — keep and fix).
- **D-04:** Delivery detection is server-side: when broadcast sends `message:new` to a recipient socket that is OPEN, the server immediately sends `message:delivered` back to the sender. No client-side delivery ack needed.

### Read Receipt Display
- **D-05:** WhatsApp-style: ✓ gray = sent, ✓✓ gray = delivered, ✓✓ blue (accent color) = read. Use `var(--color-accent)` for the read state color and `var(--color-text-muted)` for sent/delivered gray.
- **D-06:** No separate "sending" spinner or clock icon — optimistic insert shows ✓ gray immediately on ack.

### Read Receipt Bug Fixes (4 bugs from scout)
- **D-07:** Fix field name mismatch in `WebSocketProvider.tsx:126` — server sends `message_id` (singular), client expects `message_ids` (plural). Align to `message_id`.
- **D-08:** Fix `MARK_READ` reducer in `ChatContext.tsx` — must update `participants[].last_read_at` (not just set unread_count=0) so ReadReceipt component can compare timestamps and render check-marks.
- **D-09:** Fix messages REST endpoint — should return per-message read data (array of reader user_ids or a read_by count) OR return conversation participants with their `last_read_at` (simpler — already returned on conversation fetch, just needs to stay fresh via WS updates).
- **D-10:** New WS event type `message:delivered` — server sends this to the original sender after successfully broadcasting `message:new` to at least one recipient socket. Client handles this to transition from ✓ gray to ✓✓ gray.

### Regression Sweep Approach
- **D-11:** Extend existing `.vps-test-ws.mjs` to an E2E WS regression script covering: auth, message send/receive, reactions, typing, read:mark/read:by, presence. Run inside api container (`docker exec`).
- **D-12:** Manual checklist on live chatboris.mooo.com for UI-specific items: login/logout, sidebar, DM/group, file upload, theme toggle, mobile layout, notifications. Document in `07-VERIFICATION.md`.
- **D-13:** All bugs found during sweep are fixed in this phase (not deferred) and documented in `.planning/HOTFIXES.md` or `07-VERIFICATION.md`.

### Claude's Discretion
- How to structure the delivery tracking (in-memory per-message delivery map vs DB column) — planner decides based on scale constraints.
- Whether to include `read_by` array per message in REST response or rely solely on conversation-level `last_read_at` per participant — planner decides based on ReadReceipt component needs.
- E2E test script structure (one file vs split by feature area) — planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Read Receipt Pipeline (server)
- `server/src/routes/ws/handlers/read.ts` — `handleReadMark`: validates participant, batch-inserts into message_reads, updates last_read_message_id cursor, broadcasts `read:by`
- `server/src/routes/ws/registry.ts` — `broadcastExcludeSocket`: fan-out helper that excludes only source socket
- `server/src/routes/ws/index.ts:91-92` — handler registration for `read:mark` type
- `server/src/routes/conversations/index.ts:82-184` — GET conversations: converts last_read_message_id → last_read_at, calculates unread_count
- `server/src/db/schema.ts:109-125` — `message_reads` table + `conversation_participants.last_read_message_id`

### Read Receipt Pipeline (client)
- `client/src/providers/WebSocketProvider.tsx:121-129` — ❌ BUG: `read:by` handler expects `message_ids` (plural), server sends `message_id` (singular)
- `client/src/contexts/ChatContext.tsx:164-170` — ❌ BUG: `MARK_READ` reducer only zeros unread_count, doesn't update participants[].last_read_at
- `client/src/components/chat/MessageItem.tsx:20-64` — `ReadReceipt` component: shows ✓/✓✓ based on participant.last_read_at >= message.created_at
- `client/src/components/chat/MessageList.tsx:167-199` — IntersectionObserver trigger for read:mark (500ms debounce)
- `client/src/types/chat.ts:60-68` — Participant type with last_read_at, last_read_message_id

### Prior Hotfixes (context for regression)
- `.planning/HOTFIXES.md` — 6 hotfixes documenting every post-v1.0 production bug. Read to understand which areas were already patched.

### Existing E2E Test
- `.vps-test-ws.mjs` — existing WS test script (admin + tester login, DM create, message:send, ack/broadcast check). Baseline to extend.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ReadReceipt` component in MessageItem.tsx already renders ✓/✓✓ with tooltip — needs fix, not rewrite
- `.vps-test-ws.mjs` E2E test script — extend with new assertions for read:by, typing, reactions, presence
- `broadcastExcludeSocket` in registry.ts — reuse for message:delivered fan-out

### Established Patterns
- WS event handling: server handler → DB operation → broadcast → client handleIncoming → dispatch to reducer
- All WS types registered in `server/src/routes/ws/index.ts` switch statement
- Client state updates via ChatContext useReducer dispatch
- CSS tokens: `--color-accent` for primary action color, `--color-text-muted` for secondary text

### Integration Points
- New `message:delivered` event type needs: server handler in message.ts broadcast path, client case in WebSocketProvider handleIncoming, new ChatAction in types/chat.ts, new reducer case in ChatContext
- ReadReceipt component needs fresh `participants[].last_read_at` data — either from WS `read:by` updates to reducer or from conversation re-fetch
- E2E test runs inside api container via `docker exec mmess-api-1 node /app/<script>`

</code_context>

<specifics>
## Specific Ideas

- Read receipt delivery detection: server-side only — when broadcast of `message:new` successfully sends to an OPEN recipient socket, send `message:delivered` back to the sender. No client-side delivery ack round-trip needed.
- User wants WhatsApp-style triple-state (sent/delivered/read) with color change on read.
- All bugs found in regression sweep must be fixed in-phase, not deferred.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-stabilization*
*Context gathered: 2026-04-12*
