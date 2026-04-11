---
phase: 04-groups-presence
plan: "05"
subsystem: ui
tags: [react, typescript, presence, notifications, chat-ui]

# Dependency graph
requires:
  - phase: 04-03
    provides: presenceByUser in ChatState, --color-presence-online/offline CSS tokens

provides:
  - ConversationItem real presence dot (DM only, green/grey via presenceByUser)
  - MessageItem sender avatar presence dot (D-20)
  - NotificationBanner component with sessionStorage dismiss
  - WebSocketProvider notification fire logic (message:new with tab-hidden guard)
  - --color-on-accent CSS design token

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level refs (_currentUserId, _navigate) for handleIncoming access outside React component tree"
    - "presenceTargetId null guard hides dot entirely for group conversations"
    - "Notification tag=conversation_id deduplicates per-conversation browser notifications"

key-files:
  created:
    - client/src/components/chat/NotificationBanner.tsx
    - client/src/components/chat/NotificationBanner.module.css
  modified:
    - client/src/components/chat/ConversationItem.tsx
    - client/src/components/chat/ConversationItem.module.css
    - client/src/components/chat/MessageItem.tsx
    - client/src/components/chat/MessageItem.module.css
    - client/src/components/chat/ChatLayout.tsx
    - client/src/providers/WebSocketProvider.tsx
    - client/src/styles/tokens.css

key-decisions:
  - "Module-level _currentUserId and _navigate refs instead of closure — handleIncoming is defined outside component, refs avoid stale closure issues"
  - "Presence dot hidden entirely for group conversations (presenceTargetId null) — not just unstyled, completely absent from DOM"
  - "MessageItem dot is 8px vs ConversationItem 10px — denser chat pane layout requires slightly smaller indicator"
  - "--color-surface used for MessageItem dot border (not --color-surface-secondary) — chat pane bg matches --color-surface"

# Metrics
duration: 15min
completed: 2026-04-11
---

# Phase 4 Plan 05: Presence Dots + Browser Notifications Summary

**Presence dots wired to live presenceByUser state on ConversationItem (DM) and MessageItem (sender), plus NotificationBanner permission request and notification fire logic in WebSocketProvider**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-11T14:35:00Z
- **Completed:** 2026-04-11T14:51:00Z
- **Tasks:** 2
- **Files modified:** 7 + 2 created

## Accomplishments

- ConversationItem presence dot now reads `state.presenceByUser` for the DM other participant. Green dot for online, grey for offline. Tooltip shows "Online" or "Last seen X ago" via `date-fns formatDistanceToNow`. Dot is completely absent for group conversations (presenceTargetId is null for groups).
- MessageItem sender avatar wrapped in `avatarWrapper` div with a small 8px presence dot reflecting `state.presenceByUser[message.sender_id]` — satisfies D-20 (sender presence in chat pane). Dot hidden when message is grouped (avatarHidden state).
- NotificationBanner shows after login when `Notification.permission === 'default'` and sessionStorage key `notif-banner-dismissed` is not set. "Enable notifications" calls `Notification.requestPermission()`; "✕" dismisses. Both hide the banner and set the storage key.
- ChatLayout mounts NotificationBanner above the sidebar/pane split (full width).
- WebSocketProvider fires `new Notification(...)` inside `message:new` when `Notification.permission === 'granted'`, `document.visibilityState !== 'visible'`, and `sender_id !== _currentUserId`. Tag is `conversation_id` for per-conversation dedup. onclick: `window.focus() + navigate`.
- Added `--color-on-accent: #ffffff` to tokens.css; NotificationBanner.module.css uses only CSS vars (no hex values).

## Task Commits

1. **Task 1: ConversationItem + MessageItem — real presence dots (D-20)** - `e38a544` (feat)
2. **Task 2: NotificationBanner + browser notification fire logic (D-28 to D-32)** - `480bc76` (feat)

## Files Created/Modified

- `client/src/components/chat/ConversationItem.tsx` - Replaced static dot with presenceTargetId-gated dynamic dot using presenceByUser
- `client/src/components/chat/ConversationItem.module.css` - Replaced single .onlineDot with .onlineDot + .onlineDotOnline + .onlineDotOffline
- `client/src/components/chat/MessageItem.tsx` - Added avatarWrapper + presence dot on sender avatar
- `client/src/components/chat/MessageItem.module.css` - Added .avatarWrapper, .onlineDot, .onlineDotOnline, .onlineDotOffline
- `client/src/components/chat/NotificationBanner.tsx` - New: banner component with permission request + sessionStorage dismiss
- `client/src/components/chat/NotificationBanner.module.css` - New: CSS-var-only styles for banner
- `client/src/components/chat/ChatLayout.tsx` - Mounts NotificationBanner above layout
- `client/src/providers/WebSocketProvider.tsx` - Adds module-level refs + notification fire in message:new
- `client/src/styles/tokens.css` - Added --color-on-accent

## Decisions Made

- Module-level `_currentUserId` and `_navigate` refs sync from WebSocketProvider component on `[user, navigate]` changes — avoids stale closure in `handleIncoming` which is defined outside the component
- `presenceTargetId` null for groups ensures the dot element is never rendered for group conversations (complete DOM absence, not just invisible)
- MessageItem dot border uses `--color-surface` (not `--color-surface-secondary`) — chat pane background is `--color-surface`
- Dot hidden on grouped messages (`!isGrouped` guard) — avatar is visually hidden when grouped, showing a dot there would be confusing

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Presence data flows from live WebSocket events (SET_PRESENCE) and bulk REST fetch (SET_PRESENCE_BULK from Plan 04-03). All dots reflect real state.

## Self-Check: PASSED

- client/src/components/chat/ConversationItem.tsx: FOUND
- client/src/components/chat/ConversationItem.module.css: FOUND
- client/src/components/chat/MessageItem.tsx: FOUND
- client/src/components/chat/MessageItem.module.css: FOUND
- client/src/components/chat/NotificationBanner.tsx: FOUND
- client/src/components/chat/NotificationBanner.module.css: FOUND
- client/src/components/chat/ChatLayout.tsx: FOUND
- client/src/providers/WebSocketProvider.tsx: FOUND
- client/src/styles/tokens.css: FOUND
- commit e38a544 (Task 1): FOUND
- commit 480bc76 (Task 2): FOUND
- TypeScript compile: CLEAN (TS_OK)

---
*Phase: 04-groups-presence*
*Completed: 2026-04-11*
