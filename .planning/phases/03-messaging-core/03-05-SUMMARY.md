---
phase: 03-messaging-core
plan: "05"
subsystem: ui
tags: [react, typescript, css-modules, css-custom-properties, date-fns, modal, sidebar]

# Dependency graph
requires:
  - phase: 03-04
    provides: ChatContext (useChat, dispatch, ChatState), Conversation/Participant types, WebSocketProvider, CSS design tokens

provides:
  - client/src/components/common/Avatar.tsx: Circular initials avatar with hsl color hash from name
  - client/src/components/chat/ChatLayout.tsx: Split sidebar+pane layout, mobile showChat toggle, ChatLayoutContext + useChatLayout()
  - client/src/components/chat/ConversationList.tsx: Sidebar with New chat/New group buttons, empty state
  - client/src/components/chat/ConversationItem.tsx: Sidebar row with avatar, name, preview, time, unread badge, online dot
  - client/src/components/chat/NewChatModal.tsx: User search (debounced 300ms) → POST /api/conversations direct
  - client/src/components/chat/NewGroupModal.tsx: Group name + multi-select user chips → POST /api/conversations group
  - client/src/vite-env.d.ts: CSS module type declarations for TypeScript

affects: [03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS Modules + var(--token) pattern: zero hardcoded hex/px values in component CSS"
    - "ChatLayoutContext local context pattern: exposes setShowChat to descendants without prop drilling"
    - "Debounced search pattern: useEffect + setTimeout(300) + cleanup on query change"
    - "Focus trap in modals: querySelectorAll focusable elements + Tab/Shift+Tab cycle"

key-files:
  created:
    - client/src/components/common/Avatar.tsx
    - client/src/components/common/Avatar.module.css
    - client/src/components/chat/ChatLayout.tsx
    - client/src/components/chat/ChatLayout.module.css
    - client/src/components/chat/ConversationList.tsx
    - client/src/components/chat/ConversationList.module.css
    - client/src/components/chat/ConversationItem.tsx
    - client/src/components/chat/ConversationItem.module.css
    - client/src/components/chat/NewChatModal.tsx
    - client/src/components/chat/NewChatModal.module.css
    - client/src/components/chat/NewGroupModal.tsx
    - client/src/components/chat/NewGroupModal.module.css
    - client/src/vite-env.d.ts
  modified:
    - client/src/App.tsx

key-decisions:
  - "ChatLayout takes no props — imports ChatPane directly from ./ChatPane (Plan 06 provides the file)"
  - "ChatLayoutContext is file-local (not exported as a module-level context) — exposes only useChatLayout() hook"
  - "vite-env.d.ts auto-fix: CSS module type declarations missing, added to unblock TypeScript compilation"
  - "NewChatModal and NewGroupModal use onClose prop pattern — parent owns open/close state"

patterns-established:
  - "Pattern: useChatLayout() hook for setShowChat access in ConversationItem (descendant of ChatLayout)"
  - "Pattern: modal onClose prop — ConversationList holds showNewChat/showNewGroup state, modals call onClose()"
  - "Pattern: ConversationItem click = dispatch SET_ACTIVE_CONVERSATION + setShowChat(true)"

requirements-completed: [CONV-01, CONV-02, CONV-03, MSG-06]

# Metrics
duration: 25min
completed: 2026-04-11
---

# Phase 03 Plan 05: Sidebar UI — ChatLayout, ConversationList, Avatar, NewChatModal, NewGroupModal Summary

**6 React components + 6 CSS Modules building the full sidebar layer: Avatar initials circle with deterministic hsl color hash, ChatLayout split grid with mobile single-pane toggle, ConversationList with New chat/New group modals, ConversationItem rows with unread badge**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-11T10:51:31Z
- **Completed:** 2026-04-11T11:16:00Z
- **Tasks:** 2 (plus auto-approved checkpoint)
- **Files modified:** 14

## Accomplishments

- Created `Avatar.tsx` with deterministic `hsl((charCode(name[0]) * 137) % 360, 60%, 65%)` color formula, 3 sizes (sm/md/lg), inline background only (required for dynamic value)
- Created `ChatLayout.tsx` with `ChatLayoutContext` exposing `setShowChat` to descendants via `useChatLayout()` hook; imports `ChatPane` directly (Plan 06 will create that file)
- Created `ConversationList.tsx` with header "New chat"/"New group" buttons, empty state copy per UI-SPEC, conversation list from `useChat().state.conversations`
- Created `ConversationItem.tsx` with `date-fns` time formatting (< 24h → relative, this year → dd/MM, older → dd/MM/yy), unread badge capped at "99+", online dot placeholder
- Created `NewChatModal.tsx` with debounced 300ms GET /api/users search, POST /api/conversations direct, `role="dialog"` + `aria-modal` + focus trap + Escape close
- Created `NewGroupModal.tsx` with group name input + multi-select user chips (×-removable) + disabled "Create group" button until name+users valid, same a11y pattern
- Updated `App.tsx` to replace `ChatPage` placeholder with `ChatLayout` on `/` and `/chat/:conversationId` routes

## Task Commits

1. **Task 1: Avatar, ChatLayout, ConversationList, ConversationItem** - `f354af1` (feat)
2. **Task 2: NewChatModal, NewGroupModal, App.tsx wired to ChatLayout** - `33e7f2b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `client/src/components/common/Avatar.tsx` — Circular avatar with initials + deterministic hsl color
- `client/src/components/common/Avatar.module.css` — sm/md/lg size classes, border-radius: 50%
- `client/src/components/chat/ChatLayout.tsx` — Split layout, ChatLayoutContext, useChatLayout(), imports ChatPane directly
- `client/src/components/chat/ChatLayout.module.css` — .layout flex, .sidebar 280px, .pane flex-1, @media mobile hidden toggle
- `client/src/components/chat/ConversationList.tsx` — Header + New chat/New group buttons + list + empty state
- `client/src/components/chat/ConversationList.module.css` — Header padding, scrollable list, action button styles
- `client/src/components/chat/ConversationItem.tsx` — Avatar, name, preview, time, unread badge, online dot; click handler
- `client/src/components/chat/ConversationItem.module.css` — Flex row, active left border, unread badge pill
- `client/src/components/chat/NewChatModal.tsx` — User search modal, debounced API call, POST conversation, accessibility
- `client/src/components/chat/NewChatModal.module.css` — Fixed overlay, centered modal, results list
- `client/src/components/chat/NewGroupModal.tsx` — Group name + user multi-select chips + Create group button
- `client/src/components/chat/NewGroupModal.module.css` — Same overlay pattern, chip styles with --color-accent-muted
- `client/src/vite-env.d.ts` — CSS module type declarations (auto-fix)
- `client/src/App.tsx` — ChatLayout replaces ChatPage on / and /chat/:conversationId routes

## API Contracts for Plan 06

### ChatLayout: no props
```typescript
// Import: import { ChatLayout } from './components/chat/ChatLayout';
// Usage: <ChatLayout />  — no props
export function ChatLayout() { ... }
```

### useChatLayout() — for ConversationItem descendants
```typescript
import { useChatLayout } from './ChatLayout';
const { showChat, setShowChat } = useChatLayout();
// Call setShowChat(true) on conversation click to show chat pane on mobile
// ChatPane will need: setShowChat(false) for the back button
```

### ConversationItem click pattern
```typescript
dispatch({ type: 'SET_ACTIVE_CONVERSATION', conversationId: conversation.id });
setShowChat(true);  // from useChatLayout()
```

### NewChatModal + NewGroupModal — onClose prop
```typescript
// Parent holds open state:
const [showNewChat, setShowNewChat] = useState(false);
// Render: <NewChatModal onClose={() => setShowNewChat(false)} />
// Modals dispatch UPSERT_CONVERSATION + SET_ACTIVE_CONVERSATION on success, then call onClose()
```

## Decisions Made

- `ChatLayout` imports `ChatPane` directly (not via prop slot) — TypeScript error on ChatPane import is expected and resolves when Plan 06 creates the file
- `ChatLayoutContext` is file-local — only `useChatLayout()` hook is exported, keeping the context implementation private
- `vite-env.d.ts` created as auto-fix (Rule 3: blocking) — CSS module type declarations were missing, preventing TypeScript compilation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created vite-env.d.ts with CSS module type declarations**
- **Found during:** Task 1 (Avatar, ChatLayout, ConversationList, ConversationItem)
- **Issue:** TypeScript could not resolve `*.module.css` imports — no type declaration file existed for CSS modules
- **Fix:** Created `client/src/vite-env.d.ts` with `declare module '*.module.css'` and `/// <reference types="vite/client" />`
- **Files modified:** client/src/vite-env.d.ts (new file)
- **Verification:** TypeScript compilation no longer reports CSS module errors for task 1 files
- **Committed in:** f354af1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for TypeScript compilation. No scope creep.

## Issues Encountered

- CSS module type declarations were absent — standard Vite setup includes `vite-env.d.ts` but this project had none (likely because earlier phases used inline styles only). Auto-fixed per Rule 3.
- TypeScript errors in Plan 06 files (`ChatPane.tsx`, `ReactionBar.tsx`, `MessageList.tsx`) are out of scope and not fixed — they resolve when Plan 06 completes.

## Known Stubs

- `ChatLayout` imports `ChatPane` from `./ChatPane` which does not exist yet — TypeScript error until Plan 06 creates it. This is intentional per plan spec and resolves when both plans complete.
- Online dot in `ConversationItem` is always rendered (green) — Phase 3 placeholder per D-11. Actual presence tracking deferred to Phase 4.

## Self-Check: PASSED

- FOUND: client/src/components/common/Avatar.tsx
- FOUND: client/src/components/common/Avatar.module.css
- FOUND: client/src/components/chat/ChatLayout.tsx
- FOUND: client/src/components/chat/ChatLayout.module.css
- FOUND: client/src/components/chat/ConversationList.tsx
- FOUND: client/src/components/chat/ConversationList.module.css
- FOUND: client/src/components/chat/ConversationItem.tsx
- FOUND: client/src/components/chat/ConversationItem.module.css
- FOUND: client/src/components/chat/NewChatModal.tsx
- FOUND: client/src/components/chat/NewChatModal.module.css
- FOUND: client/src/components/chat/NewGroupModal.tsx
- FOUND: client/src/components/chat/NewGroupModal.module.css
- FOUND: client/src/vite-env.d.ts
- FOUND: client/src/App.tsx (modified)
- FOUND commit f354af1: feat(03-05) Avatar, ChatLayout, ConversationList, ConversationItem
- FOUND commit 33e7f2b: feat(03-05) NewChatModal, NewGroupModal, App.tsx wired

---
*Phase: 03-messaging-core*
*Completed: 2026-04-11*
