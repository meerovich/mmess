---
phase: 03-messaging-core
plan: "04"
subsystem: ui
tags: [react, typescript, websocket, context, css-custom-properties, css-modules]

# Dependency graph
requires:
  - phase: 03-02
    provides: WS server→client message types (ack, message:new, message:edited, message:deleted, reaction:added, reaction:removed, typing:user, read:by, error)
  - phase: 03-03
    provides: REST endpoint shapes for GET /api/conversations and message pagination

provides:
  - client/src/types/chat.ts: TypeScript types for all chat entities and state actions
  - client/src/contexts/ChatContext.tsx: ChatContext + useReducer state machine + useChat() hook
  - client/src/providers/WebSocketProvider.tsx: WS singleton, 5s reconnect, incoming message router
  - client/src/styles/tokens.css: All 31 UI-SPEC CSS custom property tokens on :root
  - client/src/styles/reset.css: Box-sizing reset + body margin/font baseline
  - client/src/pages/ChatPage.tsx: Placeholder for Plan 05 ChatLayout
  - App.tsx: / and /chat/:conversationId routes with ChatProvider+WebSocketProvider wiring

affects: [03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChatContext + useReducer pattern mirroring AuthContext — createContext<T|null>(null) + throwing hook"
    - "WebSocket singleton via useRef inside provider, never useState"
    - "handleIncoming defined outside component for referential stability"
    - "CSS custom properties on :root — all design tokens accessible everywhere via var(--token)"
    - "Optimistic UI: OPTIMISTIC_MESSAGE_ADD → WS send → OPTIMISTIC_MESSAGE_CONFIRM on ack"

key-files:
  created:
    - client/src/types/chat.ts
    - client/src/contexts/ChatContext.tsx
    - client/src/providers/WebSocketProvider.tsx
    - client/src/styles/tokens.css
    - client/src/styles/reset.css
    - client/src/pages/ChatPage.tsx
  modified:
    - client/src/main.tsx
    - client/src/App.tsx

key-decisions:
  - "WebSocketProvider is a child of ChatProvider — it calls useChat() dispatch internally"
  - "ChatProvider + WebSocketProvider are instantiated per route, not at app root — keeps providers scoped to chat pages"
  - "typing:user handler uses SET_TYPING_USERS with individual user signal; Plan 05 can extend to full typer-list merge"
  - "conversation:new handled in WebSocketProvider to dispatch UPSERT_CONVERSATION"

patterns-established:
  - "Pattern: ChatProvider wraps WebSocketProvider wraps chat components in route tree"
  - "Pattern: apiFetch('/api/conversations') on ChatProvider mount for initial state"
  - "Pattern: wsRef.current?.readyState === 1 guard before WebSocket.send()"

requirements-completed: [MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, CONV-03]

# Metrics
duration: 30min
completed: 2026-04-11
---

# Phase 03 Plan 04: Frontend Foundations — Types, ChatContext, WebSocketProvider, Design Tokens Summary

**React Context + useReducer state machine with typed ChatAction union, WebSocket singleton with 5s reconnect and full server message routing, and all 31 UI-SPEC design tokens as CSS custom properties**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-11T10:43:00Z
- **Completed:** 2026-04-11T11:13:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created `client/src/types/chat.ts` with all shared types: `Conversation`, `Message`, `MessageReaction`, `Participant`, `ChatState`, `ChatAction` (16 action types), `MessagePaginationState`
- Created `ChatContext.tsx` with `chatReducer` implementing all action cases including optimistic UI (add/confirm/fail), soft-delete for messages, reaction add/remove, typing users, read marking; `ChatProvider` fetches `GET /api/conversations` on mount
- Created `WebSocketProvider.tsx` with WS singleton via `useRef`, 5s fixed reconnect (D-05), no `history:request` WS message on reconnect (REST-based per D-06), `handleIncoming` routes all 9 server→client message types
- Created `tokens.css` with 31 CSS custom property design tokens on `:root` (all from UI-SPEC)
- Created `reset.css` with box-sizing reset and body font/color/margin baseline using token variables
- Updated `main.tsx` to import `tokens.css` and `reset.css` as first two imports
- Updated `App.tsx` to wire `/` and `/chat/:conversationId` routes through `ChatProvider → WebSocketProvider → ChatPage`

## Task Commits

1. **Task 1: TypeScript types, ChatContext, WebSocketProvider** - `35c8bb3` (feat)
2. **Task 2: CSS tokens, reset, main.tsx imports, App.tsx routes** - `1b3b10d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `client/src/types/chat.ts` — All chat TypeScript types and the ChatAction discriminated union
- `client/src/contexts/ChatContext.tsx` — ChatProvider, chatReducer, useChat() hook, pagination state
- `client/src/providers/WebSocketProvider.tsx` — WS singleton, reconnect timer, handleIncoming router, useSendMessage() hook
- `client/src/styles/tokens.css` — 31 CSS custom property design tokens on :root
- `client/src/styles/reset.css` — Box-sizing reset, body baseline with token variables
- `client/src/pages/ChatPage.tsx` — Placeholder for Plan 05 ChatLayout
- `client/src/main.tsx` — Added CSS imports at top
- `client/src/App.tsx` — Added /chat routes with provider wiring

## API Contracts for Plans 05 + 06

### ChatState Interface (verbatim)
```typescript
interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;  // keyed by conversationId
  typingUsers: Record<string, { userId: string; username: string }[]>;
  wsStatus: 'connected' | 'disconnected' | 'reconnecting';
}
```

### ChatContextValue (what useChat() returns)
```typescript
interface ChatContextValue {
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
  messagePagination: Record<string, MessagePaginationState>;
}
```

### useSendMessage() usage
```typescript
// Import from providers/WebSocketProvider
const sendMessage = useSendMessage();
sendMessage({ type: 'message:send', id: tempId, payload: { conversation_id, content, reply_to_id } });
// Requirement: wsRef.current.readyState === 1 (OPEN) — silently drops if disconnected
```

### Provider import paths
- `ChatProvider` — `import { ChatProvider } from './contexts/ChatContext'`
- `useChat` — `import { useChat } from './contexts/ChatContext'`
- `WebSocketProvider` — `import { WebSocketProvider } from './providers/WebSocketProvider'`
- `useSendMessage` — `import { useSendMessage } from './providers/WebSocketProvider'`

### All CSS Token Variables (for Plans 05/06 — no need to re-read UI-SPEC)
```css
/* Layout */
--sidebar-width: 280px

/* Spacing */
--space-xs: 4px     --space-sm: 8px    --space-md: 16px
--space-lg: 24px    --space-xl: 32px   --space-2xl: 48px   --space-3xl: 64px

/* Typography */
--text-body: 15px   --text-label: 13px   --text-heading: 17px   --text-display: 20px
--font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

/* Colors — surface */
--color-surface: #ffffff               --color-surface-secondary: #f4f5f7

/* Colors — accent */
--color-accent: #0b57d0                --color-accent-muted: #e8f0fe

/* Colors — semantic */
--color-destructive: #c5221f           --color-success: #1e8e3e   --color-online: #1e8e3e

/* Colors — text */
--color-text-primary: #1f1f1f          --color-text-secondary: #5f6368
--color-text-muted: #9aa0a6            --color-text-placeholder: #bdc1c6

/* Colors — borders */
--color-border: #e0e0e0                --color-border-focus: #0b57d0

/* Colors — bubbles */
--color-bubble-own: #e8f0fe            --color-bubble-other: #ffffff
--color-bubble-own-border: #c5d9fb

/* Colors — reactions */
--color-reaction-bg: #f1f3f4           --color-reaction-bg-active: #e8f0fe
```

## Decisions Made

- `ChatProvider` + `WebSocketProvider` are scoped per route (not at app root) — keeps chat state isolated to chat pages
- `handleIncoming` defined outside the `WebSocketProvider` component for zero dependency on component state
- `typing:user` handler dispatches `SET_TYPING_USERS` with single user; Plan 05 can extend to merge-per-user list if needed
- `conversation:new` handled in WebSocketProvider (not just in REST) to live-update the conversation list when another user creates a group or DM

## Deviations from Plan

None — plan executed exactly as written. The `handleIncoming` function adapted from the plan's verbatim snippet to properly extract `conversationId` from the message payload (the plan's snippet had some action type mismatches with the ChatAction union, e.g. `SET_TYPING_USER` vs `SET_TYPING_USERS`); aligned to the action types actually defined in chat.ts.

## Issues Encountered

- Shell working directory initialization fails in this environment (bash cwd temp file error) but commands execute correctly
- TypeScript compile verified via `node E:/dev/mmess/node_modules/typescript/bin/tsc --noEmit -p E:/dev/mmess/client/tsconfig.json` with output redirected to file — confirmed exit 0, empty error output

## Known Stubs

- `client/src/pages/ChatPage.tsx` — placeholder rendering "Chat — loading UI (Phase 3)"; intentional stub, replaced by `ChatLayout` in Plan 05
- `typing:user` in WebSocketProvider dispatches a simplified single-user update (not a full list merge); Plan 05 can extend the reducer if server sends full typer lists

## Self-Check: PASSED

- FOUND: client/src/types/chat.ts
- FOUND: client/src/contexts/ChatContext.tsx
- FOUND: client/src/providers/WebSocketProvider.tsx
- FOUND: client/src/styles/tokens.css
- FOUND: client/src/styles/reset.css
- FOUND: client/src/pages/ChatPage.tsx
- FOUND: client/src/main.tsx (updated)
- FOUND: client/src/App.tsx (updated)
- FOUND commit 35c8bb3: feat(03-04) types, ChatContext, WebSocketProvider
- FOUND commit 1b3b10d: feat(03-04) CSS tokens, routes

---
*Phase: 03-messaging-core*
*Completed: 2026-04-11*
