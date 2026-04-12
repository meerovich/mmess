# Post-v1.0 Hotfixes

Runtime bugs discovered during the production deployment to `https://chatboris.mooo.com`
on **2026-04-11**, fixed after the v1.0 MVP milestone was archived. Each entry
corresponds to one commit on `main` after `b6f6231`.

The v1.0 milestone is **not** re-opened for these — fixes are tracked here so
future GSD sessions can see why the head-of-main differs from
`milestones/v1.0-ROADMAP.md`.

---

## Hotfix 1 — Production deploy fixes (commit `d4c5465`)

Small corrections picked up during the initial VPS rollout before login even
worked. All details in the commit message; summary:

- `Dockerfile.server` — switched from `node:22-alpine` to `node:22-slim` so
  sharp/argon2 use prebuilt glibc binaries; dropped `npm ci --workspace=server`
  in favour of direct `npm install --legacy-peer-deps` in `/app` (the 961 MiB
  VPS OOM'd on workspace install).
- `client/package.json` — added `emoji-mart@^5.6.0` (runtime peer of
  `@emoji-mart/react`, was missing) and `@types/node@^22.0.0` (vite 6 type
  declarations reference `Buffer`).
- `client/src/types/chat.ts` — added `avatar_url: string | null` to
  `Conversation` (GroupSettingsModal read/wrote it, the server returned it,
  only the type was out of sync).
- `client/src/vite-env.d.ts` — removed duplicate `*.module.css` declaration
  that conflicted with `vite/client`'s own (TS2300 duplicate identifier
  `classes`).
- `client/src/components/chat/ConversationList.tsx` — null-safety on
  `conv.name.toLowerCase()` in the search filter (Phase 6 D-11 forgot that
  DMs have `name: null`).
- `package-lock.json` — regenerated to include the two new client deps.

---

## Hotfix 2 — Remove `/api` prefix from backend route paths (commit `b50dc06`)

Caddy strips `/api` before proxying to the api service (`uri strip_prefix
/api`), so any route declared in source as `/api/...` produced 404 after the
prefix was removed. The auth routes were already correct (`/auth/...`); these
10 were not:

| File | Was | Now |
|------|-----|-----|
| `routes/users/search.ts` | `/api/users` | `/users` |
| `routes/conversations/index.ts` | `/api/conversations` (GET list) | `/conversations` |
| `routes/conversations/create.ts` | `/api/conversations` (POST) | `/conversations` |
| `routes/conversations/messages.ts` | `/api/conversations/:id/messages` | `/conversations/:id/messages` |
| `routes/conversations/admin.ts` | 5 × `/api/conversations/:id*` | 5 × `/conversations/:id*` |
| `routes/ws/presence.ts` | `/api/presence` | `/presence` |

Cookie paths (`path: '/api/auth/refresh'` in login/logout/refresh) are NOT
touched — those are scopes visible to the browser, not backend routes.

Reproduced before fix:
```
GET /api/users?q=te   → Route GET:/users not found (404)
GET /api/conversations → Route GET:/conversations not found (404)
```

User-facing symptom: "New chat" modal could not find users, and the whole
sidebar/chat loading flow after login was broken (404s silently produced an
empty conversation list).

---

## Hotfix 3 — White-screen after send + mobile + reactions + back nav (this commit)

A burst of runtime bugs found on first real two-browser E2E test against the
live VPS. All shipped together because they were all discovered in one
session.

### 3.1 White screen after sending a message (server enrichment)

- **File:** `server/src/routes/ws/handlers/message.ts`
- **Root cause:** `handleMessageSend` acked/broadcast a raw `messages` DB row
  (only `id`, `conversation_id`, `sender_id`, `content`, `reply_to_id`,
  `file_id`, timestamps). The client `Message` type requires nested
  `sender: { id, username, avatar_url }`, `reactions: []`, and `reply_to`
  objects. `MessageItem.tsx` read `message.sender.username` unconditionally,
  throwing `TypeError: Cannot read properties of undefined (reading
  'username')` on the re-render that followed `OPTIMISTIC_MESSAGE_CONFIRM` —
  and React tore the whole tree down on the unhandled error, i.e. white
  screen.
- **Fix:** new `enrichMessage(db, row, fileRecord)` helper that JOINs `users`
  for the sender, loads `reply_to` (+ its sender) if `reply_to_id` is set,
  initialises `reactions: []`, and merges the existing file-metadata branch.
  `handleMessageSend` and `handleMessageEdit` now both return enriched
  payloads, and both ack AND broadcast are wrapped in `{ payload: { message:
  enrichedMessage } }` so the client `handleIncoming` for both `ack` and
  `message:new` reads `msg.payload.message` consistently.

### 3.2 Reaction — one emoji per user per message (replace semantics)

- **Files:**
  - `server/src/routes/ws/handlers/reaction.ts` — replace `onConflictDoNothing`
    with explicit: load existing reaction for `(message_id, user_id)`; if
    equal emoji → delete (toggle-off); if different → delete old AND insert
    new, broadcast `reaction:removed` for the old emoji first, then
    `reaction:added` for the new. Defensive cleanup: delete ALL reactions by
    this user if there are multiple legacy rows.
  - `client/src/contexts/ChatContext.tsx` — `REACTION_ADDED` reducer now
    filters out ALL existing reactions by `action.reaction.user_id` before
    appending the new one. Idempotent: re-adding the same emoji produces the
    same single entry.
- **Rationale:** the UI spec wanted "one emoji per user" so that the reaction
  bar stays terse; previously a user could pile up unlimited reactions on a
  single message.

### 3.3 Reaction bar UI — compact inline `+` (no longer owns a row)

- **Files:** `client/src/components/chat/ReactionBar.tsx`,
  `ReactionBar.module.css`, `MessageItem.module.css`.
- `.reactionBarWrapper` → `display: inline-flex` with `max-width: 100%` so it
  occupies only the horizontal space its badges need.
- Add-reaction button shrunk to 22×22, matched to badge height.
- Desktop: `opacity: 0` by default; revealed via `.bubble:hover :global(.mmess-add-reaction-btn) { opacity: 1 }` from `MessageItem.module.css`.
- Mobile: always visible (`@media (max-width: 767px) { .addReactionBtn {
  opacity: 1 } }`).
- Empty reactions: `.mmess-reaction-bar-empty` gets `display: none` until bubble hover, so empty state no longer pushes layout.
- Picker while open: `.addReactionBtnOpen` modifier pins visibility.

### 3.4 Mobile layout — horizontal scroll + MessageInput below viewport

- **Files:** `client/src/components/chat/ChatLayout.module.css`,
  `ChatPane.module.css`.
- `.layout` now uses `height: 100dvh` with a `100vh` fallback — fixes iOS
  Safari `100vh` including the URL bar, which pushed MessageInput below the
  visible area.
- Added `width: 100vw; max-width: 100vw; overflow: hidden` on `.layout` —
  defensive cap against any child that might overflow horizontally.
- `.pane` got `min-height: 0; overflow: hidden` so flex children cannot
  overflow outside their container.
- `.sidebar` on mobile: `width: 100vw; max-width: 100vw`.

### 3.5 Mobile — emoji picker broke horizontal and vertical layout

- **File:** `client/src/components/chat/ReactionBar.module.css`.
- Desktop: `.pickerContainer` got `max-width: min(360px, 90vw); max-height:
  min(400px, 60vh); overflow: auto` so the emoji-mart picker can never expand
  past its own container.
- Mobile (`@media (max-width: 767px)`): `.pickerContainer` becomes a
  full-width **bottom sheet** — `position: fixed; bottom: 0; left/right: 0;
  max-height: 70vh; border-radius: 12px 12px 0 0`. Previously the picker
  floated as `bottom: 100%; left: 0`, which on a narrow viewport pushed
  itself off the left edge AND above the top of the viewport with no scroll
  reachability.

### 3.6 No way to return from chat to sidebar on mobile

- **Files:** `client/src/components/chat/ChatPane.tsx`,
  `ChatPane.module.css`.
- `ChatPane` now imports `useChatLayout()` directly instead of taking an
  `onBack` prop that was never passed. A `handleBack()` dispatches
  `SET_ACTIVE_CONVERSATION: null` and calls `setShowChat(false)`.
- The Back button is now always rendered in JSX, but `.backButton` has
  `@media (min-width: 768px) { display: none }` — only visible on mobile
  where the sidebar and chat pane cannot coexist.
- `min-width: 44px; min-height: 44px` on the button for D-19 touch target
  compliance.

---

## Hotfix 4 — App version mechanism (this commit, part 2)

Implemented because the user needs to tell from the UI which build is
running after repeated VPS deploys.

- Version source of truth: root `package.json` `version` field (bumped patch
  on each run of `scripts/deploy.sh`).
- `scripts/deploy.sh` — new shell script that does `git pull`, bumps
  package.json patch version, builds client with
  `VITE_APP_VERSION=$(node -p "require('./package.json').version")`, rebuilds
  api image, `docker compose up -d`. See the script header for usage.
- `client/vite.config.ts` — `define: { __APP_VERSION__: JSON.stringify(...) }`
  injected from `process.env.VITE_APP_VERSION`, fallback to package.json read
  at build config time.
- `client/src/vite-env.d.ts` — `declare const __APP_VERSION__: string;` so
  TS sees the injected global.
- `client/src/components/chat/ConversationList.tsx` — renders
  `v{__APP_VERSION__}` as a low-contrast footer label in the sidebar, next to
  user avatar + ThemeToggle.
- `client/src/components/chat/ConversationList.module.css` — `.versionLabel`
  style: `font-size: 11px; color: var(--color-text-muted); opacity: .6`.
- `server/src/index.ts` — `/health` endpoint now returns
  `{ status, version, timestamp }`. Version read from `APP_VERSION` env var
  at startup.
- `docker-compose.yml` — passes `APP_VERSION: ${APP_VERSION:-dev}` through
  to the api service.

---

## Hotfix 5 — Broadcast reaches only first visit, advisory lock crashes, WS disconnects (this commit)

Three mutually-independent bugs discovered during the first real two-browser
test of the v1.0.1 stack on https://chatboris.mooo.com. Fixed together and
deployed as v1.0.2.

### 5.1 Advisory lock BigInt overflow on DM creation

- **File:** `server/src/routes/conversations/create.ts`
- **Symptom:** `POST /api/conversations` (create DM) returns HTTP 500 with
  `value "9493293139307664153" is out of range for type bigint` for some
  user pairs. Admin↔tester happened to hit this (their md5-based hash
  produced an unsigned 64-bit integer whose MSB was set, > signed int64
  max).
- **Root cause:** `createHash('md5').digest('hex').slice(0, 16)` takes 16
  hex chars = 64 bits **unsigned**, but PostgreSQL BIGINT is signed int64
  (max 2^63 − 1). About 50% of user pairs produced hashes that overflowed.
- **Fix:** `slice(0, 15)` → 60 bits → always fits in signed BIGINT. Lock
  collision probability is still negligible for tens of users.
- **Latent bug** in Phase 3 plan 03-03 — only some user pairs triggered it,
  miha↔tester worked which is why it was not caught before.

### 5.2 Stale browser cache → users load old JS bundle

- **File:** `Caddyfile`
- **Symptom:** After deploy, real-time `message:new` broadcasts silently
  dropped on the receiver. Reload page → messages appeared via the REST
  history endpoint. Same pattern for reactions.
- **Root cause:** Caddy served `/index.html` with only an `ETag` header
  and no `Cache-Control`. Mobile browsers + desktop Chrome kept the old
  HTML in memory/disk cache across deploys; the stale HTML referenced an
  **old** content-hashed JS bundle (also cached) whose `handleIncoming`
  expected a different wire format than the new server was sending.
  Since wire contract changed in hotfix 3, clients using the old bundle
  silently ignored `message:new` events.
- **Fix:**
  ```
  handle /assets/* {
      header Cache-Control "public, max-age=31536000, immutable"
      root * /srv/www
      file_server
  }
  handle {
      header Cache-Control "no-store, must-revalidate"
      root * /srv/www
      try_files {path} /index.html
      file_server
  }
  ```
  Vite-built assets have content-hashed filenames so `immutable` is safe.
  `index.html` revalidates on every visit so new deploys propagate.
- **One-time user action**: existing sessions must do a **hard refresh**
  (Ctrl+Shift+R or mobile pull-to-refresh / clear site data) to drop the
  cached old bundle. Future deploys will be transparent.

### 5.3 WebSocket connections dropped every 50–60 seconds

- **File:** `server/src/routes/ws/index.ts`
- **Symptom:** Backend logs showed `WebSocket connection established` →
  `WebSocket connection closed` every ~50 seconds for idle clients. The
  5s client reconnect loop healed it, but any broadcast that landed
  during the reconnect gap was lost (server `broadcast()` is a no-op for
  users whose socket is not registered at the instant).
- **Root cause:** No app-level keepalive. Caddy's transport
  `read_header_timeout` or intermediate NAT/ISP idle timers were closing
  the TCP tunnel after ~50 seconds of silence.
- **Fix:** Added a 25-second ping/pong interval per connection.
  - `socket.ping()` every 25s.
  - `socket.on('pong', …)` resets an `isAlive` flag.
  - Next tick checks `isAlive`; if still false → `socket.terminate()`
    which triggers the client's normal reconnect loop immediately.
  - `clearInterval(pingInterval)` on close so no leaks per disconnect.
- This also fixes an adjacent symptom: users appearing "offline" to each
  other briefly every minute as presence:offline briefly fired on each
  transient disconnect.

### Smoke test performed before declaring done (per user directive)

- `docker compose ps` — all 3 services `(healthy)`.
- `curl / -I` — `HTTP/2 200`, `cache-control: no-store, must-revalidate`.
- `curl /assets/index-*.js -I` — `HTTP/2 200`, `cache-control: public,
  max-age=31536000, immutable`.
- `curl /api/health` — `{"status":"ok","version":"1.0.2","timestamp":…}`.
- `curl /api/auth/login` — 200 `{ok:true}`.
- `curl /api/users?q=te` — 200 `{users:[tester]}`.
- Direct E2E over WS inside the api container — admin connects, tester
  connects, admin sends `message:send` → admin receives `ack`, tester
  receives `message:new` (wrapped as `{payload: {message: …}}`). Verified
  live.

---

## Hotfix 6 — Multi-session sync + typing delay + picker overflow + auto-scroll + always-on notifications (v1.0.3)

Real-world issues reported during two-device testing (desktop + mobile) after v1.0.2.
All fixed together and deployed as v1.0.3.

### 6.1 Multi-session sender sync (same user, two devices)

- **Files:** `server/src/routes/ws/registry.ts`,
  `server/src/routes/ws/handlers/message.ts`,
  `server/src/routes/ws/handlers/read.ts`.
- **Symptom:** User A logs in to chat from both desktop and phone. Sending a
  message from desktop shows the message on desktop (optimistic), but phone
  does not see it until page reload. The receiver (user B) sees it fine.
- **Root cause:** The old `broadcast(userIds, event, excludeUserId?)` helper
  excluded the entire sender user from the fan-out — so none of the sender's
  OTHER sockets received `message:new`. The sender's own socket got the
  `ack`, but the sender's second device got nothing.
- **Fix:** New `broadcastExcludeSocket(userIds, data, excludeSocket)` helper
  that excludes only the source WebSocket, not the whole user. Applied to
  `message:new`, `message:edited`, `message:deleted`, and `read:by` fan-out.
  Sender's other devices now receive the same `message:new` that other
  participants do.
- Reactions deliberately use plain `broadcast(...)` with NO exclusion
  (see 6.5 below) because reaction acks carry a different payload shape.

### 6.2 Typing indicator flicker — grace period before hiding

- **File:** `client/src/components/chat/TypingIndicator.tsx`
- **Symptom:** "Alice is typing…" flashed on and off on every keystroke
  boundary because the server broadcasts an empty `typers` array the instant
  the client stops typing for a beat.
- **Fix:** Added 1.5s client-side grace — local `visibleTypers` state is
  updated immediately when typers arrive, but cleared with a debounced
  `setTimeout` when they go empty. Rapid start/stop cycles no longer flap;
  genuine stops fade within ~1.5s of the last keystroke.

### 6.3 Emoji picker overflows the right edge of the viewport

- **File:** `client/src/components/chat/ReactionBar.module.css`
- **Symptom:** On desktop, clicking the `+` button on the current user's own
  messages (right column) opened the emoji-mart picker off the right edge of
  the screen, unreachable.
- **Fix:** `.pickerContainer` was anchored `left: 0` → pinned to `right: 0;
  left: auto` so the picker expands LEFT from the trigger instead of RIGHT.
  Mobile bottom-sheet override is unchanged.

### 6.4 New incoming messages don't auto-scroll the list to the bottom

- **File:** `client/src/components/chat/MessageList.tsx`
- **Symptom:** When a new message arrived, the list did NOT scroll to show
  it even though the user was already at the bottom.
- **Root cause:** The old `isAtBottom()` helper was called from inside the
  new-message effect, which runs AFTER React has committed the new DOM.
  The inserted message had already extended `scrollHeight`, so the
  pre-insert "at bottom" user was no longer within the 100px threshold —
  the condition evaluated false and auto-scroll was skipped.
- **Fix:** Replaced the callback with `isAtBottomRef`, a React ref updated
  on every scroll event (via a passive `scroll` listener) BEFORE the new
  message arrives. The new-message effect reads `isAtBottomRef.current`
  which reflects the LAST observed scroll state, so the "am I at bottom?"
  question is answered against the pre-insert layout. Double-rAF is used
  to scroll AFTER React has committed the DOM and layout has been applied.
  Initial load also sets `isAtBottomRef.current = true` so the first batch
  of messages triggers auto-scroll correctly.
- **Threshold:** widened from 100px to 150px for more forgiving behaviour.

### 6.5 Notifications should fire on every incoming message, not only replies

- **File:** `client/src/providers/WebSocketProvider.tsx`
- **Symptom:** Browser notifications only fired for a subset of incoming
  messages — users reported missing notifications when the chat tab was a
  background tab in a multi-window session.
- **Root cause:** Previous code gated notifications on
  `document.visibilityState !== 'visible'`. In a multi-window setup the
  visibility API reports the chat tab as 'visible' even when the user is
  actually looking at another monitor/window, so the notification was
  suppressed.
- **Fix:** Removed the visibility gate entirely. Notifications now fire on
  every incoming `message:new` from another user, regardless of tab
  visibility. `newMsg.sender_id !== _currentUserId` still prevents
  self-notifications. Dedup per conversation is preserved via
  `tag: newMsg.conversation_id`.

### 6.6 Sender's own reactions not visible until page reload

- **File:** `server/src/routes/ws/handlers/reaction.ts`
- **Symptom:** User A reacts to a message. Receiver B sees the reaction
  badge appear. Sender A sees NOTHING on their own bubble until reload.
- **Root cause:** Reaction handler was changed to `broadcastExcludeSocket`
  during 6.1 work. Unlike `message:send`, the client's `handleIncoming`
  `ack` case ONLY processes acks that carry a `.message` field
  (`OPTIMISTIC_MESSAGE_CONFIRM`). Reaction acks carry only
  `{message_id, user_id, emoji, conversation_id}` and are NOT dispatched
  to the reducer. So excluding the source socket meant the source socket's
  reducer never got the `reaction:added` event.
- **Fix:** Reverted reaction handlers to plain `broadcast(participantIds,
  event)` with NO exclusion — every participant, INCLUDING the sender's
  own socket, receives `reaction:added` / `reaction:removed`. The reducer
  is idempotent (filters out existing reactions by the same user before
  appending), so re-receiving one's own event is a no-op on the data.

### Smoke test performed before declaring done (per user directive)

- `docker compose ps` — all 3 services `(healthy)`.
- `curl / -I` — `HTTP/2 200`, `cache-control: no-store, must-revalidate`.
- `curl /api/health` — `{"status":"ok","version":"1.0.3",…}`.
- Two desktop browser sessions as admin: send from session A → session A
  shows optimistic + ack, session B receives `message:new` live.
- Admin + tester E2E: both directions working, typing indicator lingers
  ~1.5s after typing stops, reactions visible immediately to the sender.
- Emoji picker no longer overflows right on own-column messages.
- Auto-scroll triggers on incoming messages when at bottom.

---

*Last updated: 2026-04-12 — hotfix 6 batch deployed as v1.0.3.*
