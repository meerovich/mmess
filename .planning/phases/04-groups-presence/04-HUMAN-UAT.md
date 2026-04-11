---
status: partial
phase: 04-groups-presence
source: [04-VERIFICATION.md]
started: 2026-04-11
updated: 2026-04-11
---

## Current Test

[awaiting two-browser-session E2E testing on running stack]

## Tests

### 1. Group admin add/remove participants
expected: User A (group admin) opens GroupSettingsModal via chat header. Clicks "Add members", searches for User C, selects and confirms. User C appears in member list. Click × next to User B; User B is removed and receives conversation:updated WS event so their sidebar drops the group.
result: [pending]

### 2. Group admin rename
expected: Admin clicks group name, inline edit appears. Types new name, presses Enter. Name updates for all participants in real-time (conversation:updated broadcast).
result: [pending]

### 3. Leave group
expected: Non-admin user opens modal, sees "Leave group" button (admin does not). Click shows inline confirm. Confirm removes user from group, sidebar drops the conversation, chat pane clears.
result: [pending]

### 4. Grant can_edit_messages
expected: Admin ticks the "Can edit messages" checkbox next to User B. User B (in another tab) now sees edit/delete options in message hover menu on their own messages. Unticking removes the ability.
result: [pending]

### 5. Presence online/offline status
expected: User B opens the app. User A sees green dot next to User B in DM sidebar within 1 second. User B closes browser tab. After 3+ seconds, User A sees grey dot with "last seen X seconds ago" tooltip.
result: [pending]

### 6. Flicker debounce works
expected: User B refreshes tab (brief disconnect). User A does NOT see the dot flicker off/on — the 3s debounce cancels the pending offline event when B reconnects.
result: [pending]

### 7. MessageItem sender presence dot
expected: In a chat with messages from multiple senders, each message bubble shows a small presence dot on the sender avatar. Dot colour matches current online status.
result: [pending]

### 8. Browser notification when tab hidden
expected: User A switches to another browser tab. User B sends a message. User A's browser shows a notification ("B: Hey" or similar). Clicking notification focuses the tab and navigates to the conversation.
result: [pending]

### 9. Notification permission banner
expected: First login after this phase ships shows "Enable notifications" banner above chat layout. Clicking "Enable" triggers browser permission prompt. Clicking dismiss hides the banner until next session (sessionStorage).
result: [pending]

### 10. Offline message delivery on reconnect
expected: User A is offline (network disabled). User B sends 3 messages. User A comes back online. Within 5 seconds, User A sees all 3 messages in the conversation and unread badge on sidebar.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

### Non-blocking issues noted by verifier

1. **CSS anti-pattern (pre-existing from Phase 3):** `ConversationItem.module.css` `.unreadBadge` and `MessageItem.module.css` `.deleteBtn` use `color: white` instead of `var(--color-on-accent)`. Not introduced by Phase 4. Fix alongside Phase 5 or Phase 6 cleanup.

2. **Initial presence hydration missing (observation, not a scoped gap):** `presenceByUser` starts empty on page load. Users already online appear offline until they trigger a WS event. Should call `GET /api/presence?user_ids=...` on `ChatContext` mount with all visible participant IDs. Recommend adding to Phase 5 or Phase 6 polish pass.

3. **CONV-05 group avatar upload:** Deferred by design (D-08). Avatar field exists in schema and endpoint; file upload will be implemented in Phase 5 (File Sharing).
