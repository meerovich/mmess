# Milestones

## v1.0 MVP (Shipped: 2026-04-11)

**Phases completed:** 6 phases, 32 plans, 61 tasks

**Key accomplishments:**

- npm workspace monorepo with Fastify 5 server skeleton and React 19 + Vite 6 client, both compiling clean under TypeScript strict mode
- Full Drizzle ORM schema (7 tables, UUID PKs, snake_case) with auto-running migration runner wired to Fastify startup via separate postgres migration client
- Full Docker Compose stack (PostgreSQL 16 + Fastify API + Caddy HTTPS reverse proxy) running with auto-migrations, self-signed TLS on localhost, WebSocket proxy, and named volume persistence
- Sessions schema extended + invites table added + @fastify/jwt cookie auth plugin + rate-limit plugin wired globally via fastify-plugin
- Complete auth REST API — register/login/refresh/logout/me/sessions with Argon2id hashing, dual httpOnly cookie rotation, SELECT FOR UPDATE refresh, and admin invite CLI
- WebSocket /ws route stub that rejects unauthenticated HTTP upgrade requests with HTTP 401 at preValidation, before any socket is allocated
- React 19 auth UI with AuthContext, 401-intercepting apiFetch, ProtectedRoute, and login/register/sessions pages wired into React Router 6
- Drizzle schema extended with message_reads table and can_edit_messages column; client workspace gains emoji-mart, date-fns, and nanoid (hoisted)
- Full server-side WS protocol implemented: connection registry, message/reaction/typing/read handlers with DB-first fan-out, dispatching all 8 D-02 message types
- Four REST endpoints enabling conversation bootstrap, infinite-scroll history via (created_at,id) cursor pagination, race-safe DM creation with pg_advisory_xact_lock, and ILIKE user search
- React Context + useReducer state machine with typed ChatAction union, WebSocket singleton with 5s reconnect and full server message routing, and all 31 UI-SPEC design tokens as CSS custom properties
- 6 React components + 6 CSS Modules building the full sidebar layer: Avatar initials circle with deterministic hsl color hash, ChatLayout split grid with mobile single-pane toggle, ConversationList with New chat/New group modals, ConversationItem rows with unread badge
- 13-file chat pane implementation with infinite upward scroll, optimistic message send, emoji reactions via lazy-loaded emoji-mart, typed read receipts, and inline edit/delete with confirmation
- Four one-to-three-line payload shape fixes: typing indicators now consume the full typers array from server, new conversations arrive via WS correctly, and user search modals render results by unwrapping data.users
- ReadReceipt now computes double-check from participant last_read_at timestamps; ReplyPreview renders real sender username from server-joined reply_to.sender
- One-liner:
- Presence on-connect/on-disconnect with 3s flicker-prevention debounce and GET /api/presence REST hydration endpoint
- PresenceState type + ChatContext reducer cases + WebSocketProvider presence/conversation handlers + reconnect re-fetch + CSS design tokens wired end-to-end
- GroupSettingsModal with all admin actions (rename, add/remove members, toggle can_edit_messages) and non-admin leave-group flow, wired from a clickable ChatPane header for group conversations
- Presence dots wired to live presenceByUser state on ConversationItem (DM) and MessageItem (sender), plus NotificationBanner permission request and notification fire logic in WebSocketProvider
- One-liner:
- Multipart file upload API with streaming pipeline, magic-byte MIME validation, date-sharded UUID storage, and best-effort sharp thumbnail generation.
- Authenticated file download (3-path access check) and WS message:send extended with file_id ownership/anti-reuse validation — completes two-step upload flow server side.
- One-liner:
- One-liner:
- One-liner:
- WS ack/broadcast and history endpoint now carry full file metadata (file_name, file_mime, file_size, is_image, thumbnail_url) so FileCard and inline image thumbnails render for all participants and survive page reload.
- Dark-theme token block + CSS debt elimination + PWA manifest + safe-area insets — zero hardcoded color literals remain in client/src/
- ThemeToggle component (44px buttons, localStorage persistence, live OS tracking) + ConversationList search row + footer zone + 16px font-size floor on all chat inputs
- One-liner:
- Phase 6 UAT sign-off gate auto-approved (auto_advance=true) — 23-item checklist spanning theme toggle (UI-02), conversation search (UI-03), mobile responsiveness (UI-01), and deploy artifact verification documented for human execution against live deployment

---
