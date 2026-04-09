# Requirements: mmess

**Defined:** 2026-04-08
**Core Value:** Instant, reliable message delivery between users over a secure WebSocket connection

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can register with email and password
- [ ] **AUTH-02**: User can log in and receive JWT access + refresh tokens
- [ ] **AUTH-03**: User session persists across browser restarts via refresh token
- [ ] **AUTH-04**: User can log out from current session
- [ ] **AUTH-05**: User can view and terminate active sessions on other devices

### Messaging

- [ ] **MSG-01**: User can send text messages in real-time via WebSocket
- [ ] **MSG-02**: User can receive messages in real-time without page refresh
- [ ] **MSG-03**: User can view paginated message history (scroll up to load older)
- [ ] **MSG-04**: User sees typing indicator when another user is composing a message
- [ ] **MSG-05**: User sees read receipt status on sent messages (delivered/read)
- [ ] **MSG-06**: User sees unread message count per conversation
- [ ] **MSG-07**: User can edit their own sent messages
- [ ] **MSG-08**: User can delete their own sent messages
- [ ] **MSG-09**: User can reply to a specific message (quoted reply)
- [ ] **MSG-10**: User can add emoji reactions to messages

### Conversations

- [ ] **CONV-01**: User can start a private (1-on-1) conversation with another user
- [ ] **CONV-02**: User can create a group conversation with multiple participants
- [ ] **CONV-03**: User sees a list of all conversations sorted by last activity
- [ ] **CONV-04**: Group admin can add/remove participants
- [ ] **CONV-05**: Group admin can change group name and avatar
- [ ] **CONV-06**: User can leave a group conversation

### File Sharing

- [ ] **FILE-01**: User can upload and send files in a conversation
- [ ] **FILE-02**: User can upload and send images with inline preview
- [ ] **FILE-03**: User can drag-and-drop files into the chat to upload
- [ ] **FILE-04**: User can download received files

### Presence & Notifications

- [ ] **PRES-01**: User can see online/offline status of other users
- [ ] **PRES-02**: User receives browser notifications for new messages when tab is not focused
- [ ] **PRES-03**: Messages sent while user is offline are delivered when they reconnect

### UI & Experience

- [ ] **UI-01**: Responsive web interface that works on desktop and mobile browsers
- [ ] **UI-02**: User can toggle between light and dark theme
- [ ] **UI-03**: Conversation list with search/filter functionality

### Infrastructure

- [x] **INFRA-01**: All traffic encrypted via HTTPS and WSS (Caddy auto-TLS)
- [x] **INFRA-02**: Application deploys as Docker Compose stack on VPS
- [ ] **INFRA-03**: WebSocket authentication enforced at handshake (JWT validation)
- [x] **INFRA-04**: File storage persisted on Docker named volume

## v2 Requirements

### Communication

- **V2-01**: User can make voice calls via WebRTC
- **V2-02**: User can make video calls via WebRTC
- **V2-03**: User can search message history across conversations

### Enhanced Features

- **V2-04**: Link previews with URL unfurling
- **V2-05**: User can pin important messages in conversations
- **V2-06**: User can mute conversation notifications

## Out of Scope

| Feature | Reason |
|---------|--------|
| End-to-end encryption | TLS sufficient for personal use; E2E adds significant complexity |
| Desktop app (Electron) | Web app accessible from any device; not needed for v1 |
| Mobile native apps | Web PWA covers mobile use case |
| Bot/integration framework | Not needed for personal friend group |
| Slack-style threading | Overly complex for personal chat; reply-to covers this need |
| AI features | Out of scope for personal messenger |
| OAuth/social login | Email/password sufficient for small user base |
| Message forwarding | Low priority for personal use |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| INFRA-03 | Phase 2 | Pending |
| MSG-01 | Phase 3 | Pending |
| MSG-02 | Phase 3 | Pending |
| MSG-03 | Phase 3 | Pending |
| MSG-04 | Phase 3 | Pending |
| MSG-05 | Phase 3 | Pending |
| MSG-06 | Phase 3 | Pending |
| MSG-07 | Phase 3 | Pending |
| MSG-08 | Phase 3 | Pending |
| MSG-09 | Phase 3 | Pending |
| MSG-10 | Phase 3 | Pending |
| CONV-01 | Phase 3 | Pending |
| CONV-02 | Phase 3 | Pending |
| CONV-03 | Phase 3 | Pending |
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

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after roadmap creation*
