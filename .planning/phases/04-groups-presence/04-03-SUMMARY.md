---
phase: 04-groups-presence
plan: "03"
subsystem: ui
tags: [react, typescript, websocket, presence, chat-context]

# Dependency graph
requires:
  - phase: 04-01
    provides: REST group admin endpoints + conversation:updated WS broadcast shape
  - phase: 04-02
    provides: presence:update WS event shape + GET /api/presence endpoint
  - phase: 03-04
    provides: ChatContext reducer + WebSocketProvider base implementation
provides:
  - PresenceState type exported from types/chat.ts
  - presenceByUser: Record<string, PresenceState> in ChatState
  - SET_PRESENCE, SET_PRESENCE_BULK, CONVERSATION_UPDATED reducer cases
  - presence:update and conversation:updated WS event handlers in WebSocketProvider
  - Reconnect re-fetch of /api/conversations on WS status transition
  - --color-presence-online and --color-presence-offline CSS design tokens
affects: [04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useRef for previous-value tracking to detect state transitions (wsStatus reconnect detection)"
    - "SET_PRESENCE_BULK for batch presence initialization from REST fetch"
    - "CONVERSATION_UPDATED upserts to conversations array — prepend if new, replace if existing"

key-files:
  created: []
  modified:
    - client/src/types/chat.ts
    - client/src/contexts/ChatContext.tsx
    - client/src/providers/WebSocketProvider.tsx
    - client/src/styles/tokens.css

key-decisions:
  - "prevWsStatus useRef tracks wsStatus transitions to detect reconnecting→connected without extra state"
  - "CONVERSATION_UPDATED is distinct from UPSERT_CONVERSATION — used for server-push updates from group admin actions"
  - "Presence color tokens use different values from --color-online (#1e8e3e) per D-22: online=#22c55e, offline=#9ca3af"

patterns-established:
  - "Reconnect re-fetch pattern: prevWsStatus.current === 'reconnecting' && wsStatus === 'connected'"
  - "Bulk presence init: SET_PRESENCE_BULK for initial REST fetch; SET_PRESENCE for per-event updates"

requirements-completed: [PRES-01, PRES-03]

# Metrics
duration: 12min
completed: 2026-04-11
---

# Phase 4 Plan 03: Frontend Presence Plumbing Summary

**PresenceState type + ChatContext reducer cases + WebSocketProvider presence/conversation handlers + reconnect re-fetch + CSS design tokens wired end-to-end**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-11T14:35:00Z
- **Completed:** 2026-04-11T14:47:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added PresenceState interface and presenceByUser field to ChatState — Plans 04-04 and 04-05 can now read per-user online/offline state
- Wired presence:update and conversation:updated WS event handlers in WebSocketProvider, dispatching SET_PRESENCE and CONVERSATION_UPDATED to the reducer
- ChatProvider now re-fetches /api/conversations when WS reconnects (prevWsStatus useRef transition detection), satisfying PRES-03
- Added --color-presence-online (#22c55e) and --color-presence-offline (#9ca3af) CSS custom properties to tokens.css

## Task Commits

Each task was committed atomically:

1. **Task 1: types/chat.ts — add PresenceState + new ChatAction variants + ChatState field** - `9c4af57` (feat)
2. **Task 2: ChatContext, WebSocketProvider, tokens.css — wire state + WS handlers + tokens** - `66d3163` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `client/src/types/chat.ts` - Added PresenceState interface, presenceByUser to ChatState, SET_PRESENCE/SET_PRESENCE_BULK/CONVERSATION_UPDATED to ChatAction union
- `client/src/contexts/ChatContext.tsx` - Added 3 reducer cases (SET_PRESENCE, SET_PRESENCE_BULK, CONVERSATION_UPDATED), presenceByUser in initialState, reconnect re-fetch with prevWsStatus useRef
- `client/src/providers/WebSocketProvider.tsx` - Added presence:update and conversation:updated incoming handlers
- `client/src/styles/tokens.css` - Added --color-presence-online and --color-presence-offline tokens

## Decisions Made
- `prevWsStatus.current` useRef approach chosen over derived state — avoids extra re-renders and cleanly detects the transition from 'reconnecting' to 'connected'
- `CONVERSATION_UPDATED` kept separate from `UPSERT_CONVERSATION` — semantically distinct: `UPSERT_CONVERSATION` is for live-stream events (conversation:new), `CONVERSATION_UPDATED` is for admin mutations broadcasted from group endpoints
- Presence color values follow D-22 spec precisely — distinct from `--color-online` (#1e8e3e) used by read receipts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04-04 (PresenceDot component + ConversationItem presence display) has full state foundation: presenceByUser in ChatState, color tokens in CSS
- Plan 04-05 (group management UI — rename, add/remove participants) has CONVERSATION_UPDATED wired so server-push updates reflect in the sidebar immediately
- TypeScript compiles clean — zero errors after all changes

## Self-Check: PASSED

- client/src/types/chat.ts: FOUND
- client/src/contexts/ChatContext.tsx: FOUND
- client/src/providers/WebSocketProvider.tsx: FOUND
- client/src/styles/tokens.css: FOUND
- 04-03-SUMMARY.md: FOUND
- commit 9c4af57 (types): FOUND
- commit 66d3163 (wiring): FOUND
- TypeScript compile: CLEAN (TS_OK printed)

---
*Phase: 04-groups-presence*
*Completed: 2026-04-11*
