// E2E WebSocket regression test for mmess v1.0.3+
// Runs inside the api container: docker exec mmess-api-1 node /app/.vps-test-ws.mjs
// Exercises: auth, WS connect, message send/receive, message:delivered,
//            read:mark/read:by, reactions, typing, presence.
// Exit codes: 0 = all pass, 1 = assertion failure, 2 = timeout

import WebSocket from 'ws';

const API = 'http://api:3000';
const WS_URL = 'ws://api:3000/ws';

// ─── Global timeout ────────────────────────────────────────────────
setTimeout(() => {
  console.error('\n[TIMEOUT] Tests did not complete within 30 seconds');
  process.exit(2);
}, 30_000);

// ─── Helpers ───────────────────────────────────────────────────────

function assert(condition, label) {
  if (!condition) {
    console.error(`[FAIL] ${label}`);
    process.exit(1);
  }
  console.log(`[PASS] ${label}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loginAs(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? res.headers.raw?.()['set-cookie'] ?? [];
  const accessCookie = setCookie.find(c => c.startsWith('access_token='));
  if (!accessCookie) throw new Error(`no access_token in Set-Cookie for ${email}: ${setCookie.join(' | ')}`);
  return accessCookie.split(';')[0]; // "access_token=..."
}

async function getConversations(cookie) {
  const res = await fetch(`${API}/conversations`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`get conversations failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createDM(cookie, otherUserId) {
  const res = await fetch(`${API}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ type: 'direct', participant_ids: [otherUserId] }),
  });
  if (!res.ok) throw new Error(`create dm failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function me(cookie) {
  const res = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`me failed: ${res.status}`);
  return res.json();
}

/**
 * Connect a WebSocket. Returns { ws, messages } where messages is an array
 * that collects all parsed incoming frames for later inspection.
 */
function connectWS(label, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { headers: { Cookie: cookie } });
    const collected = [];

    ws.on('open', () => {
      console.log(`[${label}] WS OPEN`);
      resolve({ ws, messages: collected });
    });
    ws.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString());
      console.log(`[${label}] <-- ${JSON.stringify(parsed).slice(0, 250)}`);
      collected.push(parsed);
    });
    ws.on('error', (err) => {
      console.error(`[${label}] ERROR`, err.message);
      reject(err);
    });
    ws.on('close', (code, reason) => {
      console.log(`[${label}] CLOSED code=${code} reason=${reason}`);
    });
  });
}

/**
 * Wait for the first message of a given type to arrive on a websocket.
 * Scans already-collected messages first, then listens for new ones.
 */
function waitForType(ws, collected, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    // Check already-collected messages
    const existing = collected.find(m => m.type === type);
    if (existing) return resolve(existing);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for type="${type}" after ${timeoutMs}ms`));
    }, timeoutMs);

    function onMessage(raw) {
      const parsed = JSON.parse(raw.toString());
      if (parsed.type === type) {
        cleanup();
        resolve(parsed);
      }
    }

    function cleanup() {
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
    }

    ws.on('message', onMessage);
  });
}

/**
 * Drain collected messages of a given type (removes and returns them).
 */
function drainType(collected, type) {
  const matches = collected.filter(m => m.type === type);
  // Remove matched items from collected array
  for (const m of matches) {
    const idx = collected.indexOf(m);
    if (idx !== -1) collected.splice(idx, 1);
  }
  return matches;
}

// ─── Main test ─────────────────────────────────────────────────────

(async () => {
  let adminConn, testerConn;

  try {
    // ─── TEST: Auth ──────────────────────────────────────────────
    console.log('\n--- TEST: Auth ---');

    const adminCookie = await loginAs('admin@chatboris.local', 'AdminPass123!');
    assert(adminCookie.includes('access_token='), 'Admin login returns access_token cookie');

    const testerCookie = await loginAs('tester@chatboris.local', 'TesterPass123!');
    assert(testerCookie.includes('access_token='), 'Tester login returns access_token cookie');

    const admin = await me(adminCookie);
    assert(admin.id && admin.username, 'Admin /auth/me returns id and username');
    console.log(`  admin: id=${admin.id} username=${admin.username}`);

    const tester = await me(testerCookie);
    assert(tester.id && tester.username, 'Tester /auth/me returns id and username');
    console.log(`  tester: id=${tester.id} username=${tester.username}`);

    // ─── TEST: DM setup ──────────────────────────────────────────
    console.log('\n--- TEST: DM Setup ---');
    const dm = await createDM(adminCookie, tester.id);
    assert(dm.id, 'DM conversation created/reused');
    console.log(`  dm.id=${dm.id}`);

    // ─── TEST: WS Connect ────────────────────────────────────────
    console.log('\n--- TEST: WS Connect ---');

    adminConn = await connectWS('ADMIN', adminCookie);
    assert(adminConn.ws.readyState === WebSocket.OPEN, 'Admin WS connected (OPEN)');

    testerConn = await connectWS('TESTER', testerCookie);
    assert(testerConn.ws.readyState === WebSocket.OPEN, 'Tester WS connected (OPEN)');

    await sleep(500); // connection stability

    // ─── TEST: Message Send/Receive ──────────────────────────────
    console.log('\n--- TEST: Message Send/Receive ---');

    const msgContent = 'e2e-test-' + Date.now();
    const tempId = `t${Date.now()}`;

    // Clear any collected messages from connect phase (presence etc.)
    adminConn.messages.length = 0;
    testerConn.messages.length = 0;

    adminConn.ws.send(JSON.stringify({
      type: 'message:send',
      id: tempId,
      payload: {
        conversation_id: dm.id,
        content: msgContent,
      },
    }));

    // Wait for ack on admin side
    const ack = await waitForType(adminConn.ws, adminConn.messages, 'ack', 5000);
    assert(ack.id === tempId, 'Ack has matching client id');
    assert(ack.payload.message && ack.payload.message.content === msgContent, 'Ack payload has correct message content');
    const messageId = ack.payload.message.id;
    assert(messageId, 'Ack payload contains server message id');

    // Wait for message:delivered on admin side (tester socket is OPEN)
    const delivered = await waitForType(adminConn.ws, adminConn.messages, 'message:delivered', 5000);
    assert(delivered.payload.message_id === messageId, 'message:delivered has correct message_id');
    assert(delivered.payload.conversation_id === dm.id, 'message:delivered has correct conversation_id');

    // Wait for message:new on tester side
    const msgNew = await waitForType(testerConn.ws, testerConn.messages, 'message:new', 5000);
    assert(msgNew.payload.message && msgNew.payload.message.content === msgContent, 'Tester receives message:new with correct content');

    // ─── TEST: Read Receipt ──────────────────────────────────────
    console.log('\n--- TEST: Read Receipt ---');

    // Clear collected messages
    adminConn.messages.length = 0;
    testerConn.messages.length = 0;

    testerConn.ws.send(JSON.stringify({
      type: 'read:mark',
      id: `read-${Date.now()}`,
      payload: {
        message_id: messageId,
        conversation_id: dm.id,
      },
    }));

    // Admin should receive read:by with singular message_id (D-07 verified)
    const readByAdmin = await waitForType(adminConn.ws, adminConn.messages, 'read:by', 5000);
    assert(readByAdmin.payload.message_id === messageId, 'read:by has singular payload.message_id matching sent message');
    assert(readByAdmin.payload.user_id === tester.id, 'read:by user_id is tester');
    assert(readByAdmin.payload.read_at, 'read:by has read_at timestamp');
    assert(readByAdmin.payload.conversation_id === dm.id, 'read:by has correct conversation_id');

    // Tester should also receive read:by (multi-session sync — excludes only source socket,
    // but tester has only one socket so they may NOT get it). Check if received within 2s.
    // Note: broadcastExcludeSocket excludes the SOURCE socket. Since tester only has one
    // socket, tester will NOT receive their own read:by. This is correct behavior.
    // We skip asserting tester receives read:by — they would only get it with a second session.
    console.log('  (Tester read:by skip — single socket excluded by broadcastExcludeSocket)');

    // ─── TEST: Reaction ──────────────────────────────────────────
    console.log('\n--- TEST: Reaction ---');

    // Clear collected messages
    adminConn.messages.length = 0;
    testerConn.messages.length = 0;

    testerConn.ws.send(JSON.stringify({
      type: 'reaction:add',
      id: `react-${Date.now()}`,
      payload: {
        message_id: messageId,
        conversation_id: dm.id,
        emoji: '\u{1F44D}',
      },
    }));

    // Admin should receive reaction:added (reactions use plain broadcast, all participants)
    const reactionAdmin = await waitForType(adminConn.ws, adminConn.messages, 'reaction:added', 5000);
    assert(reactionAdmin.payload.emoji === '\u{1F44D}', 'reaction:added has correct emoji');
    assert(reactionAdmin.payload.user_id === tester.id, 'reaction:added user_id is tester');
    assert(reactionAdmin.payload.message_id === messageId, 'reaction:added has correct message_id');

    // Tester should also receive reaction:added (broadcast to all participants)
    const reactionTester = await waitForType(testerConn.ws, testerConn.messages, 'reaction:added', 5000);
    assert(reactionTester.payload.emoji === '\u{1F44D}', 'Tester also receives reaction:added');

    // ─── TEST: Typing ────────────────────────────────────────────
    console.log('\n--- TEST: Typing ---');

    // Clear collected messages
    adminConn.messages.length = 0;
    testerConn.messages.length = 0;

    adminConn.ws.send(JSON.stringify({
      type: 'typing:start',
      id: `typing-start-${Date.now()}`,
      payload: {
        conversation_id: dm.id,
      },
    }));

    // Tester should receive typing:user with admin in typers
    const typingStart = await waitForType(testerConn.ws, testerConn.messages, 'typing:user', 5000);
    assert(Array.isArray(typingStart.payload.typers), 'typing:user has typers array');
    const adminTyper = typingStart.payload.typers.find(t => t.userId === admin.id || t.user_id === admin.id);
    assert(adminTyper, 'typing:user typers contains admin');

    // Clear and send typing:stop
    testerConn.messages.length = 0;

    adminConn.ws.send(JSON.stringify({
      type: 'typing:stop',
      id: `typing-stop-${Date.now()}`,
      payload: {
        conversation_id: dm.id,
      },
    }));

    // Tester should receive typing:user with empty typers
    const typingStop = await waitForType(testerConn.ws, testerConn.messages, 'typing:user', 5000);
    assert(Array.isArray(typingStop.payload.typers), 'typing:stop — typing:user has typers array');
    assert(typingStop.payload.typers.length === 0, 'typing:stop — typers array is empty');

    // ─── TEST: Presence ──────────────────────────────────────────
    console.log('\n--- TEST: Presence ---');

    // Clear collected messages
    adminConn.messages.length = 0;

    // Close tester WS — server schedules offline after 3s grace period
    testerConn.ws.close();

    // Wait 4s (3s grace + 1s buffer)
    console.log('  Waiting 4s for presence offline broadcast...');
    await sleep(4000);

    // Admin should receive presence:update with tester going offline
    const presenceOffline = adminConn.messages.find(
      m => m.type === 'presence:update' && m.payload.user_id === tester.id
    );
    assert(presenceOffline, 'Admin receives presence:update for tester');
    assert(presenceOffline.payload.online === false, 'Tester presence is offline');

    // ─── Done ────────────────────────────────────────────────────
    console.log('\n=== ALL TESTS PASSED ===');

    // Cleanup
    adminConn.ws.close();
    await sleep(200);
    process.exit(0);

  } catch (err) {
    console.error(`\n[FAIL] ${err.message}`);
    // Cleanup on failure
    try { adminConn?.ws?.close(); } catch {}
    try { testerConn?.ws?.close(); } catch {}
    process.exit(1);
  }
})();
