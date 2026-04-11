---
status: partial
phase: 03-messaging-core
source: [03-VERIFICATION.md]
started: 2026-04-09
updated: 2026-04-09
---

## Current Test

[awaiting two-browser-session E2E testing on running stack]

## Tests

### 1. Real-time send/receive between two users
expected: Open the app in two browsers (User A + User B, pre-registered via invite). User A sends a message in a shared conversation. User B sees the message appear instantly without page refresh. Reverse test also works.
result: [pending]

### 2. Typing indicator appears for other user
expected: User B starts typing in a conversation. User A sees "B is typing…" within 500ms. When B stops typing for 5+ seconds (or sends), indicator disappears.
result: [pending]

### 3. New DM creation with conversation:new broadcast
expected: User A opens "New chat", searches for User B by username, clicks the result. A new direct conversation opens for A. User B, who already has the app open, sees the new conversation appear in their sidebar without refresh.
result: [pending]

### 4. New group creation with multiple participants
expected: User A clicks "New group", enters a name, selects User B + User C from search, clicks "Create group". All three users see the new group in their sidebar without refresh.
result: [pending]

### 5. Read receipt double-check upgrade
expected: User A sends a message. Initially shows single grey check (delivered). User B opens the conversation and scrolls to the message. User A's check mark upgrades to double green check (read by all). Hover shows "Read by: B" with timestamp.
result: [pending]

### 6. Infinite upward scroll loads older messages
expected: With 100+ messages in a conversation, scrolling near the top loads the previous 50 messages. Scroll position remains on the currently-visible message (no viewport jump).
result: [pending]

### 7. Edit/delete permission enforcement
expected: In a direct chat, neither participant can edit or delete messages (no edit/delete in hover menu). In a group chat, only the admin can edit/delete their own messages; regular users see no edit/delete unless admin has granted `can_edit_messages` permission.
result: [pending]

### 8. Emoji reactions toggle correctly
expected: User clicks reaction button on a message, picks an emoji. Reaction badge appears with count 1. Clicking the same emoji again removes the reaction (count decrements / badge disappears). Other participants see reactions update in real-time.
result: [pending]

### 9. Reply-to quoted preview with sender name
expected: User right-clicks/hovers a message and clicks "Reply". Reply strip appears above input showing sender name (not "Unknown") and first ~80 chars. Sending the reply shows the quoted block inside the new message bubble.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
