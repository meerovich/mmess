# Roadmap: mmess

**Project:** mmess — self-hosted HTTPS WebSocket messenger
**Core Value:** Instant, reliable message delivery between users over a secure WebSocket connection
**Milestone:** v1
**Created:** 2026-04-08
**Granularity:** standard

---

## Phases

- [x] **Phase 1: Foundation** - Project scaffold, database schema, Docker Compose skeleton, Caddy TLS wiring (completed 2026-04-09)
- [x] **Phase 2: Authentication** - User registration, login, JWT sessions, device session management, WebSocket auth (completed 2026-04-09)
- [x] **Phase 3: Messaging Core** - Real-time WebSocket messaging, full message lifecycle, conversation management (completed 2026-04-11)
- [ ] **Phase 4: Groups & Presence** - Group administration, online/offline presence, offline delivery, browser notifications
- [ ] **Phase 5: File Sharing** - File and image upload/download, inline previews, drag-and-drop
- [ ] **Phase 6: UI & Deploy** - Responsive interface, theme toggle, conversation search, production Docker deployment

---

## Phase Details

### Phase 1: Foundation
**Goal**: The project runs locally with a working database, HTTP server skeleton, and Caddy reverse proxy wiring so all subsequent phases build on a verified base
**Depends on**: Nothing
**Requirements**: INFRA-01, INFRA-02, INFRA-04
**Success Criteria** (what must be TRUE):
  1. Running `docker compose up` brings up all services (Postgres, API, Caddy) without errors
  2. HTTPS is served via Caddy; HTTP requests redirect to HTTPS
  3. Database schema migrations run on startup and all tables exist
  4. Named Docker volume persists file storage data across container restarts
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold: root tooling, server workspace (Fastify+Drizzle+ws), client workspace (React+Vite)
- [x] 01-02-PLAN.md — Drizzle schema (all 7 tables), migration runner wired to Fastify startup
- [x] 01-03-PLAN.md — Docker Compose stack, Caddyfile with HTTPS+WebSocket proxy, verified end-to-end

### Phase 2: Authentication
**Goal**: Users can securely create accounts, log in, maintain sessions across browser restarts, and control their active devices
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, INFRA-03
**Success Criteria** (what must be TRUE):
  1. User can register with email and password and immediately use the app
  2. User can log in and receive a JWT access token and refresh token
  3. After closing and reopening the browser, the user is still logged in (refresh token persists)
  4. User can log out from the current session and is redirected to login
  5. User can view all active sessions and terminate any session from another device
  6. WebSocket connections are rejected if the handshake JWT is missing or invalid
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Schema extension (sessions + invites), new packages, global auth + rate-limit Fastify plugins
- [x] 02-02-PLAN.md — Auth API routes: register, login, refresh, logout, sessions list+terminate, invite CLI
- [x] 02-03-PLAN.md — WebSocket auth stub with preValidation enforcement (INFRA-03)
- [x] 02-04-PLAN.md — React client: AuthContext, protected routes, login/register/sessions pages

### Phase 3: Messaging Core
**Goal**: Users can have real-time text conversations — both private and group — with full message history and rich interaction (edit, delete, reply, reactions, typing, read receipts)
**Depends on**: Phase 2
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06, MSG-07, MSG-08, MSG-09, MSG-10, CONV-01, CONV-02, CONV-03
**Success Criteria** (what must be TRUE):
  1. A message sent by one user appears in the other user's chat instantly without page refresh
  2. Scrolling up in a conversation loads older messages in paginated batches
  3. A typing indicator appears when the other user is composing a message
  4. Sent messages show delivered/read status; conversations show unread message counts
  5. User can edit or delete their own messages, and reply to any message with a quote
  6. User can react to messages with emoji; reactions are visible to all participants
  7. User can start a private conversation with another user and a group conversation with multiple users
  8. Conversation list is sorted by most recent activity
**Plans**: 9 plans (6 original + 3 gap-closure)
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md — Schema migration (message_reads table + can_edit_messages column) + client package installs
- [x] 03-02-PLAN.md — WS connection registry + all WS message handlers (message, reaction, typing, read)
- [x] 03-03-PLAN.md — REST endpoints: GET /api/conversations, messages history, POST /api/conversations, user search
- [x] 03-04-PLAN.md — Frontend foundations: TypeScript types, ChatContext+useReducer, WebSocketProvider, CSS tokens, route wiring
- [x] 03-05-PLAN.md — Sidebar UI: Avatar, ChatLayout, ConversationList, ConversationItem, NewChatModal, NewGroupModal
- [x] 03-06-PLAN.md — Chat pane UI: ChatPane, MessageList, MessageItem, ReactionBar, MessageInput, TypingIndicator
- [x] 03-07-PLAN.md — Gap closure: Fix 4 client payload shape bugs (typing:user, conversation:new, 2x user search)
- [x] 03-08-PLAN.md — Gap closure: Extend server responses with reply_to.sender + participant last_read_at; update TS types
- [x] 03-09-PLAN.md — Gap closure: Wire ReadReceipt isAllRead computation + ReplyPreview sender name; human verify

### Phase 4: Groups & Presence
**Goal**: Group conversations are fully manageable by admins, and all users can see who is online with guaranteed delivery of messages sent while offline
**Depends on**: Phase 3
**Requirements**: CONV-04, CONV-05, CONV-06, PRES-01, PRES-02, PRES-03
**Success Criteria** (what must be TRUE):
  1. Group admin can add or remove participants from a group conversation
  2. Group admin can change the group name and avatar
  3. User can leave a group conversation they no longer want to be in
  4. Online/offline status indicators are visible next to other users
  5. Messages sent while a user is offline are delivered when they reconnect
  6. Browser notification appears for new messages when the tab is not focused
**Plans**: TBD

### Phase 5: File Sharing
**Goal**: Users can share files and images in conversations with inline previews and reliable download
**Depends on**: Phase 3
**Requirements**: FILE-01, FILE-02, FILE-03, FILE-04
**Success Criteria** (what must be TRUE):
  1. User can select and upload a file in any conversation; other participants can download it
  2. Images sent in a conversation display as inline previews without opening a new page
  3. User can drag and drop a file onto the chat input area to initiate upload
  4. Downloaded files arrive intact and with their original filenames
**Plans**: TBD
**UI hint**: yes

### Phase 6: UI & Deploy
**Goal**: The application has a polished, responsive interface with theme support and search, deployed to production via Docker Compose with full TLS
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. The interface is fully usable on both desktop and mobile browsers without horizontal scrolling or broken layout
  2. User can toggle between light and dark theme; preference persists across sessions
  3. User can search or filter the conversation list to find a specific conversation
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-04-09 |
| 2. Authentication | 4/4 | Complete   | 2026-04-09 |
| 3. Messaging Core | 9/9 | Complete   | 2026-04-11 |
| 4. Groups & Presence | 0/? | Not started | - |
| 5. File Sharing | 0/? | Not started | - |
| 6. UI & Deploy | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| AUTH-04 | Phase 2 | Complete |
| AUTH-05 | Phase 2 | Complete |
| INFRA-03 | Phase 2 | Complete |
| MSG-01 | Phase 3 | Pending |
| MSG-02 | Phase 3 | Pending |
| MSG-03 | Phase 3 | Complete |
| MSG-04 | Phase 3 | Pending |
| MSG-05 | Phase 3 | Pending |
| MSG-06 | Phase 3 | Complete |
| MSG-07 | Phase 3 | Pending |
| MSG-08 | Phase 3 | Pending |
| MSG-09 | Phase 3 | Pending |
| MSG-10 | Phase 3 | Pending |
| CONV-01 | Phase 3 | Complete |
| CONV-02 | Phase 3 | Complete |
| CONV-03 | Phase 3 | Complete |
| CONV-04 | Phase 4 | Pending |
| CONV-05 | Phase 4 | Pending |
| CONV-06 | Phase 4 | Pending |
| PRES-01 | Phase 4 | Pending |
| PRES-02 | Phase 4 | Pending |
| PRES-03 | Phase 4 | Pending |
| FILE-01 | Phase 5 | Pending |
| FILE-02 | Phase 5 | Pending |
| FILE-03 | Phase 5 | Pending |
| FILE-04 | Phase 5 | Pending |
| UI-01 | Phase 6 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |

**Total mapped: 35/35**

---
*Roadmap created: 2026-04-08*
*Updated: 2026-04-08 — Phase 1 plans defined (3 plans, 3 waves)*
*Updated: 2026-04-09 — Phase 2 plans defined (4 plans, 3 waves)*
*Updated: 2026-04-09 — Phase 2 complete (4/4 plans, AUTH-01 through AUTH-05 + INFRA-03 done)*
*Updated: 2026-04-09 — Phase 3 plans defined (6 plans, 4 waves)*
*Updated: 2026-04-11 — Phase 3 plan 03-03 complete (REST endpoints); 3/6 plans done*
*Updated: 2026-04-11 — Phase 3 gap-closure plans 03-07..09 added (3 plans, 2 waves)*
