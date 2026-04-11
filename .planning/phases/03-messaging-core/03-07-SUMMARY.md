---
phase: 03-messaging-core
plan: 07
subsystem: ui
tags: [react, websocket, typescript, chat, typing-indicators]

# Dependency graph
requires:
  - phase: 03-messaging-core
    provides: WebSocketProvider, ChatContext, NewChatModal, NewGroupModal
provides:
  - Corrected typing:user WS handler that reads msg.payload.typers array
  - Corrected conversation:new WS handler dispatching msg.payload directly
  - Correct /api/users response unwrapping in NewChatModal and NewGroupModal
affects: [03-messaging-core, 04-groups-presence]

# Tech tracking
tech-stack:
  added: []
  patterns: [WS payload shape alignment — client reads server schema directly without wrapper assumptions]

key-files:
  created: []
  modified:
    - client/src/providers/WebSocketProvider.tsx
    - client/src/components/chat/NewChatModal.tsx
    - client/src/components/chat/NewGroupModal.tsx

key-decisions:
  - "typing:user handler reads msg.payload.typers (full list) not scalar is_typing/user_id fields"
  - "conversation:new dispatches msg.payload directly — server sends conversation as payload root"
  - "GET /api/users returns { users: UserResult[] } — both modals now unwrap data.users"

patterns-established:
  - "WS handlers should map directly to server broadcast schema — no wrapper assumptions"
  - "API response unwrapping: always match exact server response shape, not assumed bare arrays"

requirements-completed: [MSG-04, CONV-01, CONV-02]

# Metrics
duration: 10min
completed: 2026-04-11
---

# Phase 03 Plan 07: Client Payload Shape Bug Fixes Summary

**Four one-to-three-line payload shape fixes: typing indicators now consume the full typers array from server, new conversations arrive via WS correctly, and user search modals render results by unwrapping data.users**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-11T11:00:00Z
- **Completed:** 2026-04-11T11:10:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Fixed typing:user WS handler to read msg.payload.typers array (was reading non-existent scalar fields is_typing/user_id/username)
- Fixed conversation:new WS handler to dispatch msg.payload directly (was checking msg.payload.conversation which is always undefined)
- Fixed NewChatModal search to call setResults(data.users ?? []) instead of setResults(data) on a { users: [] } object
- Fixed NewGroupModal search to call (data.users ?? []).filter() instead of data.filter() which threw TypeError on an object

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix typing:user and conversation:new handlers in WebSocketProvider** - `c6b40d2` (fix)
2. **Task 2: Fix user search response unwrapping in NewChatModal and NewGroupModal** - `5c665ec` (fix)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `client/src/providers/WebSocketProvider.tsx` - typing:user and conversation:new case bodies corrected to match server payload schema
- `client/src/components/chat/NewChatModal.tsx` - search response handling updated to unwrap data.users
- `client/src/components/chat/NewGroupModal.tsx` - search response handling updated to unwrap data.users

## Decisions Made
None - followed plan as specified. All fixes were exact patches described in the plan with no ambiguity.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. TypeScript compiled clean (exit 0) after both tasks with no new errors introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Typing indicators will now correctly show/hide based on the full typers list broadcast by server
- New conversation WS push will correctly upsert conversations into ChatContext state
- User search in both NewChatModal and NewGroupModal will render results correctly
- All four gap closure items from 03-VERIFICATION.md resolved; Phase 03 fully complete

---
*Phase: 03-messaging-core*
*Completed: 2026-04-11*
