#!/usr/bin/env node

import WebSocket from 'ws';

const API = 'https://chatboris.mooo.com/api';
const WS_URL = 'wss://chatboris.mooo.com/ws';
const BOT_EMAIL = 'codex@chatboris.local';
const BOT_PASSWORD = 'ClaudeBot2026!';
const TARGET_USERNAME = 'miha';
const BOT_USERNAME = 'codex bot';

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status}`);
  }

  const cookies = res.headers.getSetCookie?.() ?? [];
  const access = cookies.find(cookie => cookie.startsWith('access_token='))?.split(';')[0];
  if (!access) {
    throw new Error('No access_token cookie');
  }
  return access;
}

async function ensureMihaConversation(cookie) {
  const searchRes = await fetch(`${API}/users?q=${encodeURIComponent(TARGET_USERNAME)}`, {
    headers: { Cookie: cookie },
  });
  if (!searchRes.ok) {
    throw new Error(`User search failed: ${searchRes.status}`);
  }

  const { users } = await searchRes.json();
  const miha = users.find(user => user.username?.toLowerCase() === TARGET_USERNAME);
  if (!miha) {
    throw new Error('Miha user not found');
  }

  const convRes = await fetch(`${API}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ type: 'direct', participant_ids: [miha.id] }),
  });
  if (!convRes.ok) {
    throw new Error(`Conversation lookup failed: ${convRes.status}`);
  }

  const conversation = await convRes.json();
  if (!conversation?.id) {
    throw new Error('Failed to resolve Codex Bot <-> Miha conversation');
  }
  return conversation;
}

async function openSocket(cookie) {
  const ws = new WebSocket(WS_URL, { headers: { Cookie: cookie } });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}

async function markConversationRead(cookie, conversationId, messageId) {
  const ws = await openSocket(cookie);
  ws.send(JSON.stringify({
    type: 'read:mark',
    id: `codex-bot-chat-read-${messageId}`,
    payload: {
      conversation_id: conversationId,
      message_id: messageId,
    },
  }));
  await new Promise(resolve => setTimeout(resolve, 250));
  ws.close();
}

async function sendMessage(text) {
  const cookie = await login();
  const conversation = await ensureMihaConversation(cookie);
  const ws = await openSocket(cookie);

  ws.send(JSON.stringify({
    type: 'message:send',
    id: 'codex-bot-chat-send',
    payload: {
      conversation_id: conversation.id,
      content: text,
    },
  }));

  const ack = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout')), 10000);
    ws.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'ack' || message.type === 'error') {
        clearTimeout(timer);
        resolve(message);
      }
    });
    ws.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });

  console.log(JSON.stringify(ack, null, 2));
  ws.close();
}

async function fetchInbox(after, limit = 20) {
  const cookie = await login();
  const conversation = await ensureMihaConversation(cookie);
  const res = await fetch(
    `${API}/conversations/${conversation.id}/messages?limit=${limit}`,
    { headers: { Cookie: cookie } }
  );
  if (!res.ok) {
    throw new Error(`Inbox fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const messages = (data.messages ?? []).filter(message =>
    message.sender?.username?.toLowerCase() !== BOT_USERNAME
  );
  const filtered = after
    ? messages.filter(message => new Date(message.created_at).getTime() > new Date(after).getTime())
    : messages;

  const latestIncoming = [...filtered].reverse().find(message =>
    message.sender?.username?.toLowerCase() !== BOT_USERNAME
  );
  if (latestIncoming?.id) {
    await markConversationRead(cookie, conversation.id, latestIncoming.id);
  }

  console.log(JSON.stringify({
    conversationId: conversation.id,
    markedReadMessageId: latestIncoming?.id ?? null,
    messages: filtered,
  }, null, 2));
}

async function watchInbox(after) {
  const cookie = await login();
  const conversation = await ensureMihaConversation(cookie);

  if (after) {
    await fetchInbox(after, 50);
  }

  const ws = await openSocket(cookie);
  console.log(JSON.stringify({
    status: 'watching',
    conversationId: conversation.id,
    target: TARGET_USERNAME,
  }));

  ws.on('message', raw => {
    try {
      const envelope = JSON.parse(raw.toString());
      const message = envelope.payload?.message;
      if (envelope.type !== 'message:new' || !message) return;
      if (message.conversation_id !== conversation.id) return;
      if (message.sender?.username?.toLowerCase() === BOT_USERNAME) return;
      if (after && new Date(message.created_at).getTime() <= new Date(after).getTime()) return;
      ws.send(JSON.stringify({
        type: 'read:mark',
        id: `codex-bot-chat-watch-read-${message.id}`,
        payload: {
          conversation_id: conversation.id,
          message_id: message.id,
        },
      }));
      console.log(JSON.stringify({
        id: message.id,
        sender: message.sender?.username,
        content: message.content,
        created_at: message.created_at,
      }));
    } catch {
      // Ignore malformed events.
    }
  });

  ws.on('close', () => process.exit(0));
  ws.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function main() {
  const [command = 'inbox', ...rest] = process.argv.slice(2);

  if (command === 'send') {
    const text = rest.join(' ').trim();
    if (!text) {
      throw new Error('Usage: node scripts/codex-bot-chat.mjs send <message>');
    }
    await sendMessage(text);
    return;
  }

  if (command === 'inbox') {
    await fetchInbox(rest[0]);
    return;
  }

  if (command === 'watch') {
    await watchInbox(rest[0]);
    return;
  }

  throw new Error('Usage: node scripts/codex-bot-chat.mjs <send|inbox|watch> [args]');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
