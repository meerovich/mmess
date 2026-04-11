---
phase: 03-messaging-core
plan: "06"
subsystem: ui
tags: [react, typescript, websocket, css-modules, optimistic-ui, infinite-scroll, emoji, reactions]

# Dependency graph
requires:
  - phase: 03-04
    provides: ChatContext, WebSocketProvider, useSendMessage, CSS design tokens, Message/Conversation types
  - phase: 03-05
    provides: ChatLayout (renders ChatPane), Avatar component

provides:
  - client/src/components/chat/ChatPane.tsx: Chat header + reconnecting banner + MessageList + TypingIndicator + MessageInput
  - client/src/components/chat/MessageList.tsx: Infinite upward scroll, auto-scroll guard, IntersectionObserver sentinel
  - client/src/components/chat/MessageItem.tsx: Message bubble (own/other), read receipts, edit/delete menu, reply action
  - client/src/components/chat/ReplyPreview.tsx: Quoted reply block inside message bubble
  - client/src/components/chat/ReactionBar.tsx: Emoji reaction badges with toggle, lazy emoji-mart picker
  - client/src/components/chat/MessageInput.tsx: Textarea, optimistic send, reply/edit strips, typing:start/stop
  - client/src/components/chat/TypingIndicator.tsx: Fixed 20px height, 3-state copy

affects: []

# Tech tracking
tech-stack:
  added:
    - date-fns (format HH:mm for timestamps)
    - nanoid (tempId generation for optimistic messages)
    - "@emoji-mart/react + @emoji-mart/data (lazy-loaded emoji picker)"
  patterns:
    - "Optimistic UI: OPTIMISTIC_MESSAGE_ADD with tempId → OPTIMISTIC_MESSAGE_CONFIRM on ack"
    - "Infinite scroll: IntersectionObserver on sentinel div + scrollHeight delta for position preservation"
    - "Edit state lifted to ChatPane: editMessage + replyTo state passed down as props"
    - "React.lazy for emoji picker — keeps initial bundle lean, loads on first [+] click"
    - "IntersectionObserver on last message + 500ms debounce → read:mark WS send"
    - "Typing: typing:start on first keystroke, 3s debounce for typing:stop, immediate stop on empty"

key-files:
  created:
    - client/src/components/chat/ChatPane.tsx
    - client/src/components/chat/ChatPane.module.css
    - client/src/components/chat/MessageList.tsx
    - client/src/components/chat/MessageList.module.css
    - client/src/components/chat/MessageItem.tsx
    - client/src/components/chat/MessageItem.module.css
    - client/src/components/chat/ReplyPreview.tsx
    - client/src/components/chat/ReactionBar.tsx
    - client/src/components/chat/ReactionBar.module.css
    - client/src/components/chat/MessageInput.tsx
    - client/src/components/chat/MessageInput.module.css
    - client/src/components/chat/TypingIndicator.tsx
    - client/src/components/chat/TypingIndicator.module.css

key-decisions:
  - "editMessage + replyTo state lifted to ChatPane; passed as props to MessageInput; MessageItem calls onEdit/onReply callbacks"
  - "EmojiPicker loaded via React.lazy + Suspense with any-cast to bypass missing @emoji-mart/react TS declarations"
  - "read:mark sent from MessageList (not MessageItem) using IntersectionObserver on last message div ref"
  - "nanoid imported directly from root node_modules (hoisted from server/package.json per workspace setup)"

# Metrics
duration: 18min
completed: 2026-04-11
---

# Phase 03 Plan 06: Chat Pane UI — ChatPane, MessageList, MessageItem, MessageInput, ReactionBar, ReplyPreview Summary

**13-file chat pane implementation with infinite upward scroll, optimistic message send, emoji reactions via lazy-loaded emoji-mart, typed read receipts, and inline edit/delete with confirmation**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-11T10:40:00Z
- **Completed:** 2026-04-11T10:58:14Z
- **Tasks:** 2 (+ 1 checkpoint auto-approved)
- **Files created:** 13

## Accomplishments

- Created `ChatPane.tsx` with reconnecting banner (`#fdd663` per UI-SPEC), chat header, and composition of MessageList + TypingIndicator + MessageInput; holds `editMessage` and `replyTo` state
- Created `MessageList.tsx` with IntersectionObserver sentinel at list top for infinite upward scroll; scrollHeight delta technique for scroll position preservation; auto-scroll guard (within 100px of bottom); IntersectionObserver on last message with 500ms debounce for `read:mark` WS send; grouping consecutive same-sender messages within 5 min
- Created `MessageItem.tsx` with own/other bubble layout (right/left, asymmetric border-radius tail), read receipt unicode check marks, inline delete confirmation ("Delete this message?" / "Keep message" / "Delete message"), hover menu with Edit+Delete (group chats with `can_edit_messages` only per D-21), `onReply` and `onEdit` callback wiring
- Created `ReplyPreview.tsx` as inline component rendering quoted block with 3px accent left border inside MessageItem bubble
- Created `ReactionBar.tsx` with grouped emoji badges (count + reactor tooltip), badge toggle (reaction:add / reaction:remove), `React.lazy` emoji-mart Picker with `Suspense` fallback, positioned above message
- Created `MessageInput.tsx` with optimistic send (nanoid tempId → OPTIMISTIC_MESSAGE_ADD → WS send), Enter submits / Shift+Enter newline, reply strip and edit strip above textarea, typing:start/stop debounce (3s), unmount cleanup
- Created `TypingIndicator.tsx` with fixed 20px height (prevents layout shift per UI-SPEC D-36), 3-state copy ("is typing…" / "and … are typing…" / "Several people are typing…")

## Task Commits

1. **Task 1: ChatPane, MessageList, TypingIndicator** - `b286d9e`
2. **Task 2: MessageItem, ReplyPreview, ReactionBar, MessageInput** - `cb882e5`

## MessageItem Props Interface

```typescript
interface MessageItemProps {
  message: Message;
  isGrouped?: boolean;          // true = avatar hidden + reduced gap (within 5min same sender)
  onReply?: (message: Message) => void;   // called when user clicks ↩ reply button
  onEdit?: (message: Message) => void;    // called when user clicks Edit in overflow menu
}
```

## editMessage State Sharing Solution

`editMessage` and `replyTo` state are both lifted to `ChatPane` (the common ancestor of `MessageItem` and `MessageInput`). `MessageList` accepts `onReply` and `onEdit` callbacks and forwards them to each `MessageItem`. When a user clicks Edit or Reply on a message, the callback updates ChatPane's state, which re-renders MessageInput with the new `editMessage` / `replyTo` prop. This avoids a separate context while keeping state management simple.

## ChatPane Composition Order

1. Reconnecting banner (conditional, fixed top — `wsStatus === 'reconnecting'`)
2. `<header>` — back button (mobile) + avatar initial + conversation name
3. `<MessageList>` — flex: 1, scroll container
4. `<TypingIndicator>` — fixed 20px height
5. `<MessageInput>` — reply strip + edit strip + textarea row

## WS Message Types

No deviations from RESEARCH.md patterns. All WS types used:
- Send: `message:send`, `message:edit`, `message:delete`, `reaction:add`, `reaction:remove`, `read:mark`, `typing:start`, `typing:stop`
- Receive (handled in WebSocketProvider from Plan 04): `ack`, `message:new`, `message:edited`, `message:deleted`, `reaction:added`, `reaction:removed`, `typing:user`, `read:by`

## Emoji Picker: Lazy vs Eager Loading

**Decision: Lazy (React.lazy + Suspense)**

`@emoji-mart/react` ships a large bundle. Loading it lazily via `React.lazy(() => import('@emoji-mart/react'))` keeps the initial bundle lean. The picker only loads when the user first clicks the `[+]` button. A "Loading…" Suspense fallback is shown briefly. The `@emoji-mart/react` package has no TypeScript declarations so the lazy component is cast as `React.ComponentType<any>` to satisfy the TS compiler.

Import path used: `import('@emoji-mart/react')` (default export accessed via `(mod as any).default ?? mod`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @emoji-mart/react has no TypeScript declarations**
- **Found during:** Task 2 TypeScript compile
- **Issue:** `Property 'Picker' does not exist on type` — @emoji-mart/react exports no named `Picker`, only default export with no TS types
- **Fix:** Changed lazy import to access `.default` via any-cast; cast the lazy component as `React.ComponentType<any>`
- **Files modified:** `client/src/components/chat/ReactionBar.tsx`
- **Commit:** cb882e5

## Known Stubs

- `ReadReceipt` component in `MessageItem.tsx` always renders single check (not green double check) because `Participant` type doesn't carry `last_read_message_id`. The `read:by` WS event updates `unread_count` via `MARK_READ` in ChatContext but doesn't update per-participant read positions tracked in message list. This is a known limitation — true per-participant read tracking requires server-side `last_read_message_id` per participant in the Conversation/Participant types. The visual check marks display is functional but always shows grey single check rather than green double. This does not block the messaging flow (MSG-01/02/03/04) but MSG-05 (read receipts) is partially implemented. This can be wired in a future iteration when participant read positions are included in the conversation API response.

## Self-Check: PASSED

- FOUND: client/src/components/chat/ChatPane.tsx
- FOUND: client/src/components/chat/ChatPane.module.css
- FOUND: client/src/components/chat/MessageList.tsx
- FOUND: client/src/components/chat/MessageList.module.css
- FOUND: client/src/components/chat/MessageItem.tsx
- FOUND: client/src/components/chat/MessageItem.module.css
- FOUND: client/src/components/chat/ReplyPreview.tsx
- FOUND: client/src/components/chat/ReactionBar.tsx
- FOUND: client/src/components/chat/ReactionBar.module.css
- FOUND: client/src/components/chat/MessageInput.tsx
- FOUND: client/src/components/chat/MessageInput.module.css
- FOUND: client/src/components/chat/TypingIndicator.tsx
- FOUND: client/src/components/chat/TypingIndicator.module.css
- FOUND commit b286d9e: feat(03-06) ChatPane, MessageList, TypingIndicator
- FOUND commit cb882e5: feat(03-06) MessageItem, ReplyPreview, ReactionBar, MessageInput

---
*Phase: 03-messaging-core*
*Completed: 2026-04-11*
