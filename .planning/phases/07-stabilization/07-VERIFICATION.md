# Phase 7: Stabilization - Verification Results

**Date:** 2026-04-12
**Deploy Version:** 1.0.4 (previous: 1.0.3)
**Target:** https://chatboris.mooo.com

---

## 1. Deployment Health

### docker compose ps

```
NAME               IMAGE                COMMAND                  SERVICE    CREATED          STATUS                    PORTS
mmess-api-1        mmess-api            "docker-entrypoint.s…"   api        44 seconds ago   Up 32 seconds (healthy)   3000/tcp
mmess-caddy-1      caddy:2-alpine       "caddy run --config …"   caddy      33 seconds ago   Up 32 seconds (healthy)   0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 0.0.0.0:443->443/udp, [::]:443->443/udp, 2019/tcp
mmess-postgres-1   postgres:16-alpine   "docker-entrypoint.s…"   postgres   12 hours ago     Up 12 hours (healthy)     5432/tcp
```

**Result: PASS** - All 3 services (postgres, api, caddy) healthy.

### /api/health

```json
{"status":"ok","version":"1.0.4","timestamp":"2026-04-12T09:14:26.094Z"}
```

**Result: PASS** - Version 1.0.4 confirmed (> 1.0.3).

### Cache-Control Headers

```
HTTP/2 200
cache-control: no-store, must-revalidate
```

**Result: PASS** - index.html revalidates on every visit.

---

## 2. Automated E2E Regression Test

**Script:** `.vps-test-ws.mjs` (run via `docker exec mmess-api-1 node /app/test.mjs`)

### Full Output

```
--- TEST: Auth ---
[PASS] Admin login returns access_token cookie
[PASS] Tester login returns access_token cookie
[PASS] Admin /auth/me returns id and username
  admin: id=f2a1f310-3e8c-43ba-9e09-881187d045f6 username=admin
[PASS] Tester /auth/me returns id and username
  tester: id=0d68cb4d-4636-40d4-a630-c7c944dcbc2c username=tester

--- TEST: DM Setup ---
[PASS] DM conversation created/reused
  dm.id=d37e5824-49d7-450e-86fd-6e0f96122ae2

--- TEST: WS Connect ---
[PASS] Admin WS connected (OPEN)
[PASS] Tester WS connected (OPEN)

--- TEST: Message Send/Receive ---
[PASS] Ack has matching client id
[PASS] Ack payload has correct message content
[PASS] Ack payload contains server message id
[PASS] message:delivered has correct message_id
[PASS] message:delivered has correct conversation_id
[PASS] Tester receives message:new with correct content

--- TEST: Read Receipt ---
[PASS] read:by has singular payload.message_id matching sent message
[PASS] read:by user_id is tester
[PASS] read:by has read_at timestamp
[PASS] read:by has correct conversation_id
  (Tester read:by skip -- single socket excluded by broadcastExcludeSocket)

--- TEST: Reaction ---
[PASS] reaction:added has correct emoji
[PASS] reaction:added user_id is tester
[PASS] reaction:added has correct message_id
[PASS] Tester also receives reaction:added

--- TEST: Typing ---
[PASS] typing:user has typers array
[PASS] typing:user typers contains admin
[PASS] typing:stop -- typing:user has typers array
[PASS] typing:stop -- typers array is empty

--- TEST: Presence ---
[PASS] Admin receives presence:update for tester
[PASS] Tester presence is offline

=== ALL TESTS PASSED ===
```

### E2E Section Results

| Section | Tests | Result |
|---------|-------|--------|
| Auth | 4 | PASS |
| DM Setup | 1 | PASS |
| WS Connect | 2 | PASS |
| Message Send/Receive | 6 | PASS |
| Read Receipt | 4 | PASS |
| Reaction | 4 | PASS |
| Typing | 4 | PASS |
| Presence | 2 | PASS |
| **Total** | **27** | **ALL PASS** |

---

## 3. Manual Regression Sweep

*(Pending human verification -- Task 2 checkpoint)*

### Read Receipt Verification (STAB-01, STAB-02)

- [ ] Message shows single gray check on send (sent state)
- [ ] Transitions to double gray check within 1s (delivered state)
- [ ] Transitions to double blue check when recipient opens conversation (read state)
- [ ] Tooltip shows "Read by: [username]"

### Feature Regression (STAB-03)

- [ ] Auth: Login works on both browsers
- [ ] DM: Can send and receive text messages in both directions
- [ ] Group: Create group, send message, all members receive
- [ ] Text: Messages display correctly with timestamps
- [ ] Reactions: Add emoji reaction, visible to all participants immediately
- [ ] Files: Upload image, thumbnail appears inline, click opens lightbox
- [ ] Typing: "X is typing..." appears when other user types, disappears after stop
- [ ] Presence: Online dot shows for connected users, goes offline after disconnect
- [ ] Unread counter: Sidebar badge increments on new messages in non-active conversation
- [ ] Notifications: Browser notification fires for incoming messages
- [ ] Themes: Theme toggle switches between light/dark
- [ ] Mobile layout: On narrow viewport -- sidebar/chat pane toggle, back button, input stays in view

---

## 4. Bugs Found During Sweep

*(None found during automated E2E. Manual sweep pending.)*

---

*Phase: 07-stabilization*
*Verification date: 2026-04-12*
