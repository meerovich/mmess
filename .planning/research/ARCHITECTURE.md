# Architecture Patterns

**Domain:** Self-hosted WebSocket messenger (personal use)
**Project:** mmess
**Researched:** 2026-04-08
**Confidence:** HIGH (patterns verified across multiple authoritative sources)

---

## Recommended Architecture

A single-server monolith is the right fit for mmess. The scale is tens of users, not thousands, so microservices add operational burden without benefit. One backend process handles HTTP REST (auth, file uploads, history) and WebSocket (real-time messaging) simultaneously. All services run in a Docker Compose stack.

```
Browser Client
     |
     | HTTPS/WSS (TLS termination at reverse proxy)
     v
[Reverse Proxy: Caddy/Nginx]
     |
     +---> HTTP REST  -----> [API Server]
     |                            |
     +---> WebSocket  ----------> [WS Handler] --- in-process ---+
                                       |                          |
                                  [Auth Middleware]               |
                                       |                          |
                                  [Message Router]               |
                                       |                          |
                                  [Presence Store (in-memory)]   |
                                       |                          |
                              [PostgreSQL DB] <------------------+
                                       |
                              [File Storage (local volume)]
```

For a single server, Redis is optional — a Node.js Map in the WS handler suffices as a connection registry. If the project ever needs horizontal scaling, Redis pub/sub slots in without rewriting application logic.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Reverse Proxy (Caddy) | TLS termination, HTTP upgrade to WSS, static file serving | Client, API Server |
| API Server (HTTP) | Auth (register/login/token), message history, file upload/download endpoints | PostgreSQL, File Storage, Client |
| WebSocket Handler | Accept WS connections, maintain connection registry, route messages in real-time | Presence Store, Message Router, PostgreSQL, Client |
| Auth Middleware | Validate JWT on both HTTP requests and WS handshake | API Server, WS Handler |
| Message Router | Fan out a message to all connected recipients in the target conversation | WS Handler, Connection Registry |
| Connection Registry | Map `user_id -> [ws_connection, ...]` for online users (in-memory Map) | WS Handler, Presence Store |
| Presence Store | Track online/offline status, broadcast status changes | WS Handler, Connection Registry |
| PostgreSQL | Persist users, conversations, messages, participants, file metadata | API Server, WS Handler |
| File Storage (volume) | Store uploaded files/images as binary blobs on disk | API Server |

---

## Data Flow

### Sending a Text Message

```
Client A                 WS Handler              DB              Client B
   |                         |                    |                   |
   |--send {type: "message"} |                    |                   |
   |                         |--validate JWT      |                   |
   |                         |--INSERT message -> |                   |
   |                         |<-- message_id ---- |                   |
   |<-- ack {message_id}     |                    |                   |
   |                         |--lookup registry: is B online?        |
   |                         |--push {type: "message"} ------------> |
```

If Client B is offline, no push occurs. B fetches history via REST when they reconnect.

### Sending a File/Image

```
Client A           API Server (HTTP)          File Storage          WS Handler
   |                     |                         |                     |
   |--POST /upload -----> |                         |                     |
   |                     |--write to volume ------> |                     |
   |                     |--INSERT file metadata -> DB                    |
   |<-- {file_id, url}   |                         |                     |
   |                                                                      |
   |--send {type:"message", file_id} via WS -----> WS Handler            |
   |                                               |--same as text flow-> B
```

Files travel via HTTP (not WebSocket binary frames) — this avoids WebSocket framing overhead and allows resumable uploads in future.

### Connection Lifecycle

```
Client                 WS Handler              Presence Store
   |                       |                        |
   |--WS Upgrade (+ JWT)-> |                        |
   |                       |--verify JWT            |
   |                       |--register conn in Map  |
   |                       |--broadcast "online" -> |-> all contacts
   |<--- established ------                         |
   |                                                |
   | ... active session ...                         |
   |                                                |
   |--close / timeout ----> |                        |
                            |--remove from Map       |
                            |--broadcast "offline"-> |-> all contacts
```

Heartbeat: server sends a ping every 30s; clients that miss 2 consecutive pongs are evicted from the registry.

### Loading History

```
Client --> GET /conversations/:id/messages?before=<cursor>
                 |
                 v
           API Server --> SELECT * FROM messages WHERE ... ORDER BY created_at DESC LIMIT 50
                 |
                 v
           Client <-- paginated message array (JSON)
```

History is always fetched over HTTP, not WebSocket. This separates concerns cleanly: WebSocket = new events only, HTTP = historical data.

---

## Key Data Model (Logical)

```
users
  id, username, password_hash, avatar_url, created_at

conversations
  id, type (direct | group), name (nullable), created_at

conversation_participants
  conversation_id, user_id, joined_at
  (unique index on conversation_id + user_id)

messages
  id, conversation_id, sender_id, content (text), file_id (nullable), created_at
  (index on conversation_id + created_at for pagination)

files
  id, uploader_id, filename, mimetype, size_bytes, storage_path, created_at

sessions (or use stateless JWT — see note below)
  id, user_id, token_hash, expires_at
```

**JWT vs server-side sessions:** For personal use, stateless JWTs are simpler — no session table needed. Use short-lived access tokens (15m) + longer refresh tokens (7d) stored in httpOnly cookies.

---

## Patterns to Follow

### Pattern 1: Separate WebSocket Events from HTTP Endpoints

WebSocket handles only real-time delivery. It does NOT serve history, handle file uploads, or manage auth flows. This keeps the WS handler simple and stateless (beyond the connection registry).

```
// Good: WS message handler is a thin router
ws.on('message', (raw) => {
  const msg = JSON.parse(raw)
  if (msg.type === 'chat_message') handleChatMessage(ws, msg)
  if (msg.type === 'typing')       handleTyping(ws, msg)
  // NOT: if (msg.type === 'get_history') ... -- this belongs in REST
})
```

### Pattern 2: Authenticate the WebSocket Handshake, Not Each Message

Validate the JWT at connection time (during the HTTP upgrade). Attach `user_id` to the socket object. All subsequent messages from that socket are trusted as that user — no per-message token re-validation needed.

### Pattern 3: Cursor-Based Pagination for Message History

Use `created_at` + `id` as a stable cursor, not page numbers. Page numbers break when new messages arrive during pagination.

```sql
SELECT * FROM messages
WHERE conversation_id = $1 AND created_at < $cursor
ORDER BY created_at DESC
LIMIT 50
```

### Pattern 4: Denormalize "Last Message" Per Conversation for List View

The conversation list view needs each conversation's latest message and unread count. Computing this on the fly is expensive. Maintain a `last_message_id` column on `conversations` and update it on insert. Unread count can be a separate `conversation_participants.last_read_at` timestamp.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sending File Bytes Over WebSocket

**What:** Encoding file data as base64 in a WebSocket message frame.
**Why bad:** Saturates the WebSocket connection, blocks real-time messages, wastes 33% overhead from base64 encoding, no retry on partial failure.
**Instead:** Upload via HTTP POST, reference by `file_id` in the WebSocket message.

### Anti-Pattern 2: Storing All State in Memory Only

**What:** Using only in-process Maps/Sets for messages, no database.
**Why bad:** Server restart loses all messages and history.
**Instead:** Connection registry lives in memory (ephemeral), all messages written to PostgreSQL (durable).

### Anti-Pattern 3: Fetching History Over WebSocket

**What:** Client sends `{type: "get_history", conversation_id: "..."}` over the WS connection and server responds inline.
**Why bad:** Mixes request/response semantics into an event stream; complex to correlate responses; blocks the event pipe.
**Instead:** HTTP GET with cursor pagination — native request/response semantics.

### Anti-Pattern 4: Polling for Online Status

**What:** Client polls `GET /users/online` every N seconds.
**Why bad:** N×users HTTP requests/second, constant DB load, latency = polling interval.
**Instead:** Push presence events over the existing WebSocket connection when users connect/disconnect.

---

## Suggested Build Order

The build order follows strict dependency chains — nothing can be built before its dependencies.

```
1. Data layer         PostgreSQL schema, migrations tool (foundational — everything depends on it)
      |
2. Auth               Register, login, JWT issue/validate (required by every other layer)
      |
3. REST API skeleton  Express/Fastify app, auth middleware, basic user endpoints
      |
4. WebSocket server   WS handler, connection registry, auth-at-handshake
      |
5. Messaging core     Send/receive text messages, persist to DB, fan-out to recipients
      |
6. History API        Paginated message history endpoint, conversation list
      |
7. Presence           Online/offline tracking, heartbeat, broadcast to contacts
      |
8. File uploads       HTTP upload endpoint, storage layer, file message type in WS
      |
9. Group chats        Multi-participant conversations (conversations table already supports it)
      |
10. Web client        React/Vite SPA consuming all of the above
      |
11. Docker Compose    Wire everything together: proxy, server, db, volumes
      |
12. TLS / production  Caddy/Nginx with Let's Encrypt, WSS, security hardening
```

**Why this order:**
- Schema first because all code depends on it; changing schema late is expensive
- Auth before anything else because endpoints need protection from the start
- WebSocket after REST because auth middleware is shared
- Messaging before presence because presence is a side-effect of messaging connections
- Files after core messaging because they are an extension of the message model
- Group chats late because the schema already supports it; only the UI and participant management logic is new
- Docker last for dev convenience, but the schema and config should be Docker-ready from day one (env vars for DB URL, etc.)

---

## Scalability Considerations

This is a personal project with tens of users. Enterprise scale is explicitly out of scope. That said, these decisions keep the door open without over-engineering:

| Concern | Current approach | If it ever matters |
|---------|------------------|--------------------|
| Multiple WS servers | Single server, in-memory registry | Add Redis pub/sub, registry moves to Redis |
| File storage | Local Docker volume | Swap storage path to an S3-compatible endpoint (MinIO) |
| DB load | Single Postgres instance | Add read replica; queries already use indexes |
| Connection limits | ~60k per Node.js process, far exceeds personal use | Not a real concern |

---

## Sources

- [WebSocket Architecture Best Practices — Ably](https://ably.com/topic/websocket-architecture-best-practices) (HIGH confidence)
- [Designing a Messaging App Like WhatsApp — Hello Interview](https://www.hellointerview.com/learn/system-design/problem-breakdowns/whatsapp) (MEDIUM confidence — enterprise scale, adapted for personal use)
- [How to Implement Presence Detection with WebSockets — OneUptime](https://oneuptime.com/blog/post/2026-02-02-websocket-presence-detection/view) (HIGH confidence)
- [Efficient Schema Design for a Chat App using PostgreSQL — tome01](https://www.tome01.com/efficient-schema-design-for-a-chat-app-using-postgresql) (MEDIUM confidence)
- [Designing a Layered WebSocket Architecture — Medium](https://medium.com/@jamala.zawia/designing-a-layered-websocket-architecture-for-scalable-real-time-systems-1ba3591e3ffb) (MEDIUM confidence)
- [File Upload in WebSocket Chat — SuperDevAcademy](https://www.superdevacademy.com/en/blogs/file-upload-websocket-chat) (MEDIUM confidence)
