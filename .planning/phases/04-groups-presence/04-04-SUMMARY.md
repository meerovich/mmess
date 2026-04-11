---
phase: 04-groups-presence
plan: "04"
subsystem: ui
tags: [react, typescript, modal, group-settings, chat-header]

# Dependency graph
requires:
  - phase: 04-01
    provides: REST group admin endpoints (PATCH rename, POST add participants, DELETE remove participant, PATCH can_edit_messages, DELETE leave)
  - phase: 04-03
    provides: CONVERSATION_UPDATED action wired in ChatContext + WebSocketProvider so server-push updates refresh the modal automatically
provides:
  - GroupSettingsModal component (full admin + non-admin UI)
  - ChatPane header click-to-open group settings
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Modal with focus trap + Escape handler + overlay click (copied from NewGroupModal pattern)"
    - "Debounced user search reused for Add Members inline panel"
    - "Optimistic-free UI: all mutations rely on CONVERSATION_UPDATED WS event for state refresh"
    - "isAdmin derived from participants array at render time — no extra state needed"

key-files:
  created:
    - client/src/components/chat/GroupSettingsModal.tsx
    - client/src/components/chat/GroupSettingsModal.module.css
  modified:
    - client/src/components/chat/ChatPane.tsx
    - client/src/components/chat/ChatPane.module.css

key-decisions:
  - "Leave group path dispatches SET_ACTIVE_CONVERSATION(null) + calls onClose() after 204 — no WS event needed since user is no longer a participant"
  - "Admin check derived from participants array (currentUserParticipant.is_admin) — no separate API call"
  - "CONVERSATION_UPDATED WS event (from 04-03) automatically refreshes modal state — no manual dispatch after mutations"
  - "headerInfoClickable CSS class added to ChatPane for group-only cursor:pointer + underline hover"

requirements-completed: [CONV-04, CONV-05, CONV-06]

# Metrics
duration: 15min
completed: 2026-04-11
---

# Phase 4 Plan 04: GroupSettingsModal + ChatPane Header Wiring Summary

**GroupSettingsModal with all admin actions (rename, add/remove members, toggle can_edit_messages) and non-admin leave-group flow, wired from a clickable ChatPane header for group conversations**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-11T14:39:00Z
- **Completed:** 2026-04-11T14:54:00Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- Created `GroupSettingsModal.tsx` with full admin feature set: inline group rename (PATCH), add members inline search (POST), remove member (DELETE), can_edit_messages toggle (PATCH), and non-admin leave group (DELETE + dispatches SET_ACTIVE_CONVERSATION(null))
- All mutations rely on `CONVERSATION_UPDATED` WS event (wired in Plan 04-03) for state refresh — no manual dispatch needed after successful API calls except for leave group
- CSS Modules (`GroupSettingsModal.module.css`) uses only `var(--*)` design tokens — zero hex values
- Updated `ChatPane.tsx` to import `useAuth` for correct `getConversationName` display (previously passed empty string), added `showSettings` state, made group header clickable with `role="button"`, shows participant count subtitle
- Added `headerInfoClickable`, `headerInfoClickable:hover .headerName`, and `headerSubtitle` CSS to `ChatPane.module.css`

## Task Commits

1. **Task 1: GroupSettingsModal component** - `f688b0f` (feat)
2. **Task 2: ChatPane header click wiring** - `5874820` (feat)

## Files Created/Modified

- `client/src/components/chat/GroupSettingsModal.tsx` — Full group settings modal (new)
- `client/src/components/chat/GroupSettingsModal.module.css` — Modal styles using design tokens only (new)
- `client/src/components/chat/ChatPane.tsx` — Added useAuth, showSettings state, clickable group header, GroupSettingsModal render
- `client/src/components/chat/ChatPane.module.css` — Added headerInfoClickable, headerSubtitle classes

## Decisions Made

- `Leave group` dispatches `SET_ACTIVE_CONVERSATION(null)` and calls `onClose()` immediately after 204 — WS event is not sent to the user who left, so manual cleanup is required
- `isAdmin` is derived at render time from `conversation.participants.find(p => p.user_id === currentUserId).is_admin` — no extra API calls
- After rename/add/remove/permission mutations, state refreshes via `CONVERSATION_UPDATED` WS broadcast from the server (established in Plan 04-01 + 04-03) — no manual `dispatch` in success handlers
- `useAuth` added to `ChatPane` so `getConversationName` can resolve the "other" participant in DM conversations (previously used empty string `''`, which could show wrong name)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all API endpoints are wired to real REST calls established in Plan 04-01.

## Self-Check: PASSED

- client/src/components/chat/GroupSettingsModal.tsx: FOUND
- client/src/components/chat/GroupSettingsModal.module.css: FOUND
- client/src/components/chat/ChatPane.tsx: FOUND (showSettings, GroupSettingsModal import, useAuth)
- client/src/components/chat/ChatPane.module.css: FOUND (headerInfoClickable, headerSubtitle)
- commit f688b0f (Task 1): FOUND
- commit 5874820 (Task 2): FOUND
- TypeScript compile: CLEAN (TS_OK)
- No hex colors in GroupSettingsModal.module.css: CONFIRMED

---
*Phase: 04-groups-presence*
*Completed: 2026-04-11*
