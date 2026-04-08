# Domain Pitfalls: Self-Hosted WebSocket Messenger

**Domain:** Self-hosted real-time web messenger (WebSocket, Docker, file uploads, group chats)
**Researched:** 2026-04-08
**Project:** mmess

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or the app being unusable.

---

### Pitfall 1: Nginx Reverse Proxy Silently Drops WebSocket Connections

**What goes wrong:** The app works perfectly in development (direct connection, no proxy) but WebSocket connections fail immediately in production behind Nginx. Connections either refuse immediately or drop after ~60 seconds with no data.

**Why it happens:** Nginx is an HTTP/1.1 proxy by default. WebSocket requires an HTTP Upgrade handshake, and the `Upgrade` header is a hop-by-hop header — Nginx does not forward it unless explicitly configured. Without `proxy_http_version 1.1` and the `Upgrade`/`Connection` header pass-through, Nginx treats the handshake as a malformed HTTP request and drops it. Additionally, Nginx's default `proxy_read_timeout` is 60 seconds — any idle WebSocket connection gets killed.

**Consequences:**
- App appears completely broken in production
- May work fine locally (no proxy), leading to confusion
- Idle chat windows disconnect every 60 seconds
- WSS (wss://) over HTTP will trigger mixed-content browser errors

**Prevention:**
```nginx
# Required in every WebSocket location block:
location /ws {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;   # 1 hour; heartbeats keep it alive
    proxy_send_timeout 3600s;
}
```
Also configure application-layer ping/pong heartbeats every 25–30 seconds. This keeps connections alive through idle timeouts on both Nginx and upstream firewalls.

**Warning signs:** `WebSocket connection to 'wss://...' failed` in browser console; connections succeed in dev but fail in prod; connections drop exactly at 60s.

**Phase:** Infrastructure / deployment phase (before any feature work on prod). Must be solved and verified before declaring "WebSocket works."

---

### Pitfall 2: No Message Delivery Guarantee for Offline / Reconnecting Users

**What goes wrong:** A user's phone goes to sleep, they reconnect 10 minutes later, and messages sent while they were disconnected are silently lost. The sender sees their message was sent; the recipient never sees it.

**Why it happens:** WebSocket is a transport, not a messaging protocol. It provides no delivery guarantee. Socket.IO's default mode is "at-most-once" — if the connection drops during delivery, the message is gone. There is no server-side buffer by default. When the client reconnects, the server has no idea what was missed.

**Consequences:**
- Silent message loss with no error feedback
- Users distrust the app ("did they see my message?")
- Rewrite required to add persistence-backed delivery later

**Prevention:**
- Persist every message to the database **before** attempting WebSocket delivery
- Assign each message a monotonically increasing ID per conversation
- On reconnect, client sends its `last_seen_message_id`; server replays everything after it
- Implement acknowledgment callbacks: server marks message as delivered only after client ACK
- For users who are offline at send time, delivery happens on their next connection via the replay mechanism

**Warning signs:** No `last_seen_message_id` concept in your schema; no reconnect-and-replay logic; "messages are delivered live or not at all."

**Phase:** Core messaging phase. Design the schema with `message_id` sequencing from day one — retrofitting this onto an existing schema and client is painful.

---

### Pitfall 3: WebSocket Authentication Left Open Until "Later"

**What goes wrong:** During development, authentication on the WebSocket connection is skipped for speed. The connection is left open or authenticated only at the HTTP layer. In production, unauthenticated sockets can be opened by anyone, sending messages as any user or flooding the server.

**Why it happens:** HTTP authentication (cookies, Authorization header) does not automatically apply to WebSocket connections. After the upgrade, the connection is a raw TCP-like stream — there are no per-request auth checks. Developers often validate auth on HTTP routes but forget the WebSocket handshake path is a different handler.

**Consequences:**
- Unauthenticated users can open unlimited connections (DoS vector)
- Message spoofing if sender identity is taken from the message payload instead of the authenticated session
- Cannot revoke access without restarting the server if session tokens are never checked

**Prevention:**
- Validate session/JWT during the HTTP upgrade handshake (before accepting the connection)
- Reject the handshake immediately with HTTP 401 if auth fails — no WebSocket connection allocated
- Never pass JWT as a URL query parameter (it ends up in server logs)
- Use cookies or a first-message auth protocol (send token as first WebSocket message, close if invalid within 5 seconds)
- Implement a per-IP connection limit to cap unauthenticated abuse

**Warning signs:** WebSocket handler has no auth check at connection time; sender ID is read from the client's message body; no connection limit per user.

**Phase:** Authentication phase. Must be enforced before any real feature work. Retrofitting auth onto established socket code requires touching every handler.

---

### Pitfall 4: File Uploads Served Directly from the App Container

**What goes wrong:** Uploaded files (images, documents) are written to the local filesystem inside the Docker container. On container restart, redeploy, or Docker volume misconfiguration, all uploaded files are permanently deleted. Additionally, serving large binary files through the Node.js/app process blocks the event loop and kills WebSocket performance.

**Why it happens:** The simplest implementation of `multer` or equivalent writes to `./uploads/` inside the container. Developers don't set up named volumes or external storage. File serving gets added to the app server as a static route.

**Consequences:**
- All media lost on every deploy
- Event loop blocked during large file transfers, causing WebSocket message delays
- No access control on files (anyone who guesses the URL gets the file)
- Disk fills up with no cleanup strategy

**Prevention:**
- Mount a named Docker volume for uploads, mapped to a predictable host path (`/data/uploads`)
- Serve files via Nginx `location /uploads { ... }` — never through the app process
- Randomize filenames at upload time (UUID + original extension); never use user-supplied names
- Validate MIME type from file contents (not just extension) using magic bytes
- Enforce file size limits at both Nginx (`client_max_body_size`) and application layer
- Add Nginx `proxy_buffering off` for WebSocket location but configure it properly for upload routes

**Warning signs:** `multer({ dest: './uploads' })` without a Docker volume mount; serving uploads via `express.static()`; no filename sanitization; no file size limit.

**Phase:** File upload phase. Volume configuration must be in `docker-compose.yml` from the start of this phase — not added after first deploy.

---

### Pitfall 5: React / Frontend Creates New WebSocket Connections on Every Render

**What goes wrong:** The WebSocket connection is created inside a `useState` or directly in a component body. React's strict mode and re-renders create multiple parallel connections. Old connections are never closed, accumulating on the server until it runs out of memory or file descriptors.

**Why it happens:** It's the natural-looking way to write it: `const [socket, setSocket] = useState(new WebSocket(...))`. React renders components multiple times. Each render creates a new connection. Without a cleanup function in `useEffect`, the old connection is orphaned.

**Consequences:**
- Server accumulates thousands of zombie connections
- Memory leak on both client (stale closures) and server
- Users receive duplicate messages (multiple connections for same user)
- Server OOM crash with no obvious cause

**Prevention:**
- Create the WebSocket connection in `useEffect` with an empty dependency array
- Store the socket in `useRef`, not `useState`
- Return a cleanup function from `useEffect` that calls `socket.close()`
- Better: lift WebSocket lifecycle out of React components entirely — create a singleton connection manager at app initialization
- On the server: track all connections per user, close old ones when a new connection arrives from the same authenticated user

**Warning signs:** `new WebSocket(...)` called outside `useEffect`; socket stored in `useState`; no cleanup function in effect; server connection count grows without bound.

**Phase:** Frontend / client phase. Architecture decision (singleton vs. per-component) must be made before writing any socket-consuming components.

---

## Moderate Pitfalls

Mistakes that create significant technical debt or poor UX, but don't require full rewrites.

---

### Pitfall 6: Group Chat Delivered as N Individual Queries (Fan-Out N+1)

**What goes wrong:** Sending a message to a group with 20 members triggers 20 separate database queries (one per member) or 20 separate WebSocket send operations in a loop. Performance degrades linearly with group size.

**Prevention:**
- Fetch all group members in a single query: `SELECT user_id FROM group_members WHERE group_id = ?`
- Send to all connected members in a single loop over the pre-fetched list
- Design schema so group membership is indexed on `group_id` from the start
- Use a pub/sub pattern (even in-process EventEmitter for single-server scale) so the sender publishes once and all subscribers receive

**Warning signs:** `forEach(member => db.query(...))` inside message send handler; no group member cache.

**Phase:** Group chat phase.

---

### Pitfall 7: Online/Offline Status Based Only on WebSocket Connection State

**What goes wrong:** A user's status is set to "online" when their WebSocket connects and "offline" when it disconnects. Network interruptions (mobile switching networks, brief disconnects) cause the user to flicker online/offline every few seconds. Users appear offline when they're actually about to reconnect.

**Prevention:**
- Implement a grace period (30–60 seconds) before marking a user offline after disconnect
- Use server-sent heartbeats (ping/pong) to distinguish intentional disconnects from transient drops
- Store last-seen timestamp in the database, not just a boolean in memory
- Broadcast status changes at the grace period boundary, not immediately on disconnect

**Warning signs:** Status toggle fires in the `disconnect` event handler without any delay or debounce.

**Phase:** Online status feature.

---

### Pitfall 8: Unread Message Count Computed with SELECT COUNT(*) on Every Load

**What goes wrong:** Unread counts are computed at query time: `SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND created_at > ?`. With many conversations and messages, this becomes slow and blocks the UI on load.

**Prevention:**
- Store a `last_read_message_id` per user per conversation (a cursor)
- Compute unread count as: messages where `id > last_read_message_id` — indexable and fast
- Denormalize: maintain an `unread_count` column on `conversation_participants` and update it incrementally
- Update read cursor when user opens a conversation; broadcast the update to their other connected devices

**Warning signs:** No `last_read` tracking in schema; unread count recalculated on every page load.

**Phase:** Message history / UI phase.

---

### Pitfall 9: TLS Certificate Renewal Breaks Under Docker + Nginx

**What goes wrong:** Let's Encrypt certificates expire every 90 days. The renewal process requires Certbot to write new certificate files and Nginx to reload them. Inside Docker, Nginx does not automatically detect new certificate files, so it keeps serving the expired certificate until the container is manually restarted.

**Prevention:**
- Use a certbot container with a deploy hook that sends `SIGHUP` or `nginx -s reload` to the Nginx container after successful renewal
- Mount certificates on a shared named volume accessible to both the Nginx container and the Certbot container
- Configure Certbot to renew every 12 hours (default); certificates renew when less than 30 days remain
- Test renewal before the first expiry with `certbot renew --dry-run`
- Port 80 must remain accessible for the HTTP-01 challenge — don't block it in docker-compose

**Warning signs:** Certbot running as a one-shot container with no post-hook; no mechanism to reload Nginx after cert renewal.

**Phase:** Infrastructure / TLS phase.

---

### Pitfall 10: No Rate Limiting on WebSocket Messages or HTTP Endpoints

**What goes wrong:** A user (or script) sends thousands of messages per second, flooding all other connected clients. The database write queue backs up. The server runs out of memory buffering outbound messages.

**Prevention:**
- Implement per-connection message rate limiting (e.g., max 5 messages/second per user)
- Apply rate limiting at Nginx level for HTTP endpoints (auth, file upload)
- Track message counts in memory per connection; close connections that exceed limits
- Set a maximum WebSocket message size to prevent oversized payloads

**Warning signs:** No message throttle in WebSocket `message` handler; no `client_max_body_size` in Nginx config.

**Phase:** Any phase involving user-generated WebSocket messages.

---

## Minor Pitfalls

---

### Pitfall 11: Sending Auth Tokens in WebSocket URL Query Parameters

**What goes wrong:** Token appears in server access logs, browser history, and referrer headers.

**Prevention:** Use cookies (sent automatically in the upgrade handshake) or pass auth as the first message after connection. Never put tokens in the URL.

**Phase:** Authentication phase.

---

### Pitfall 12: Docker Database Container Without Named Volume

**What goes wrong:** `docker-compose down` destroys all chat history because Postgres/SQLite data is in an anonymous volume tied to the container.

**Prevention:** Always use named volumes in `docker-compose.yml`:
```yaml
volumes:
  db_data:
    driver: local
services:
  db:
    volumes:
      - db_data:/var/lib/postgresql/data
```

**Phase:** Infrastructure phase, day one.

---

### Pitfall 13: Serving wss:// from an http:// Page (Mixed Content)

**What goes wrong:** HTTPS page tries to open a `ws://` (not `wss://`) connection. Browser blocks it as mixed content with no helpful error.

**Prevention:** Always use `wss://` on HTTPS pages. Configure Nginx to terminate TLS and proxy to the backend over `ws://` (plain) internally. Derive WebSocket URL from `window.location.protocol` on the client.

**Phase:** Infrastructure / TLS phase.

---

### Pitfall 14: No Reconnection Logic with Exponential Backoff on the Client

**What goes wrong:** When the WebSocket drops, the client either gives up entirely or hammers the server with reconnect attempts every 100ms. If many users disconnect simultaneously (server restart), the thundering herd overwhelms reconnection.

**Prevention:**
- Implement exponential backoff with jitter: start at 500ms, double each attempt, cap at 30s
- Add random jitter (±20%) to prevent synchronized reconnect storms
- Maximum 10–15 retry attempts before surfacing a "disconnected" UI state
- On reconnect, send `last_seen_message_id` to recover missed messages (see Pitfall 2)

**Phase:** Frontend / client phase.

---

## Phase-Specific Warning Map

| Phase Topic | Likely Pitfall | Must Address |
|-------------|---------------|--------------|
| Infrastructure / Docker setup | Named volume missing (Pitfall 12), TLS cert renewal (Pitfall 9) | Before first deploy |
| Nginx + TLS configuration | WebSocket headers missing (Pitfall 1), wss mixed content (Pitfall 13) | Before any WebSocket testing in prod |
| Authentication | Auth not enforced on WebSocket handshake (Pitfall 3), token in URL (Pitfall 11) | Before any user data exists |
| Core WebSocket messaging | No delivery guarantee / message loss (Pitfall 2), React connection leak (Pitfall 5), no rate limit (Pitfall 10) | Core messaging phase |
| File uploads | Uploads in container filesystem (Pitfall 4) | File upload phase |
| Group chats | Fan-out N+1 queries (Pitfall 6) | Group chat phase |
| Online/offline status | Status flicker on disconnect (Pitfall 7) | Status feature |
| Message history / UI | Unread count via full COUNT(*) (Pitfall 8) | History / UI phase |
| Client reconnection | No exponential backoff (Pitfall 14) | Frontend phase |

---

## Sources

- Ably WebSocket Architecture Best Practices: https://ably.com/topic/websocket-architecture-best-practices
- WebSocket.org Production Best Practices: https://websocket.org/guides/best-practices/
- WebSocket.org Reconnection Guide: https://websocket.org/guides/reconnection/
- WebSocket.org Nginx Proxy Guide: https://websocket.org/guides/infrastructure/nginx/
- Socket.IO Delivery Guarantees: https://socket.io/docs/v4/delivery-guarantees
- Socket.IO Memory Usage: https://socket.io/docs/v4/memory-usage/
- Ably WebSocket Security: https://ably.com/topic/websocket-security
- Ably Essential Guide to WebSocket Authentication: https://ably.com/blog/websocket-authentication
- Ably WebSocket Reliability: https://ably.com/topic/websocket-reliability-in-realtime-infrastructure
- WebSocket Memory Leak Fix (OneUptime): https://oneuptime.com/blog/post/2026-01-24-websocket-memory-leak-issues/view
- Nginx for Developers (WebSocket timeout + upload issues): https://blog.devops.dev/nginx-for-developers-practical-guide-to-websocket-timeout-https-wss-and-upload-size-issues-in-24f286132ab9
- OWASP Unrestricted File Upload: https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload
- Chatwoot WebSocket Docker SSL issue (real-world example): https://github.com/chatwoot/chatwoot/issues/3704
- Docker-Nginx-Certbot setup: https://blog.jarrousse.org/2022/04/09/an-elegant-way-to-use-docker-compose-to-obtain-and-renew-a-lets-encrypt-ssl-certificate-with-certbot-and-configure-the-nginx-service-to-use-it/
- Devgem: WebSocket Connection Leaks in Node.js: https://www.devgem.io/posts/understanding-websocket-connection-leaks-and-active-handles-in-node-js
- MoldStud: Common Socket.IO Pitfalls: https://moldstud.com/articles/p-common-pitfalls-when-using-socketio-and-how-to-avoid-them-essential-tips-for-developers
- Robust WebSocket Reconnection with Exponential Backoff: https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1
