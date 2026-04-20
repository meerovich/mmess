import WebSocket from 'ws';

type InboxMessage = {
  id: string;
  conversation_id: string;
  content: string | null;
  created_at: string;
  sender?: {
    id: string;
    username: string;
  } | null;
  file_id?: string | null;
  file_name?: string | null;
};

const API_BASE = process.env.MMESS_API_BASE_URL ?? 'http://api:3000';
const WS_URL = process.env.MMESS_WS_URL ?? 'ws://api:3000/ws';
const BOT_EMAIL = process.env.CODEX_BOT_EMAIL ?? 'codex@chatboris.local';
const BOT_PASSWORD = process.env.CODEX_BOT_PASSWORD ?? 'ClaudeBot2026!';
const TARGET_USERNAME = (process.env.CODEX_TARGET_USERNAME ?? 'miha').toLowerCase();
const BOT_USERNAME = (process.env.CODEX_BOT_USERNAME ?? 'Codex Bot').toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const SYSTEM_PROMPT = process.env.CODEX_BOT_SYSTEM_PROMPT ?? [
  'You are Codex Bot in a private messenger.',
  'Reply briefly, naturally, and helpfully.',
  'Default to Russian unless the user writes in another language.',
  'Do not invent access to tools, files, deployments, or secret project context.',
  'If a question needs unavailable context, say so plainly and ask one short follow-up question.',
].join(' ');

function decodeBotReadablePayload(content: string | null | undefined): { text: string | null } | null {
  if (!content?.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content) as { type?: unknown; bot_payload_b64?: unknown };
    if (parsed.type !== 'mmess-e2ee' || typeof parsed.bot_payload_b64 !== 'string') {
      return null;
    }
    const json = Buffer.from(parsed.bot_payload_b64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { text?: unknown };
    return {
      text: typeof payload.text === 'string' || payload.text === null ? payload.text : null,
    };
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Codex Bot login failed: ${response.status}`);
  }

  const cookies = response.headers.getSetCookie?.() ?? [];
  const accessCookie = cookies.find(cookie => cookie.startsWith('access_token='))?.split(';')[0];
  if (!accessCookie) {
    throw new Error('No access_token cookie returned for Codex Bot');
  }

  return accessCookie;
}

async function apiJson<T>(path: string, cookie: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${path} failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function ensureConversation(cookie: string): Promise<{ id: string }> {
  const userSearch = await apiJson<{ users: Array<{ id: string; username: string }> }>(
    `/users?q=${encodeURIComponent(TARGET_USERNAME)}`,
    cookie
  );
  const targetUser = userSearch.users.find(user => user.username?.toLowerCase() === TARGET_USERNAME);
  if (!targetUser) {
    throw new Error(`Target user ${TARGET_USERNAME} not found`);
  }

  return apiJson<{ id: string }>(
    '/conversations',
    cookie,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'direct', participant_ids: [targetUser.id] }),
    }
  );
}

async function fetchRecentMessages(cookie: string, conversationId: string, limit = 12): Promise<InboxMessage[]> {
  const data = await apiJson<{ messages: InboxMessage[] }>(
    `/conversations/${conversationId}/messages?limit=${limit}`,
    cookie,
    { method: 'GET' }
  );
  return (data.messages ?? []).map((message) => {
    const botPayload = decodeBotReadablePayload(message.content);
    return botPayload
      ? { ...message, content: botPayload.text }
      : message;
  });
}

async function generateReply(history: InboxMessage[]): Promise<string> {
  const transcript = history
    .map(message => {
      const speaker = message.sender?.username?.toLowerCase() === BOT_USERNAME ? 'assistant' : 'user';
      const text = message.file_id && !message.content
        ? `[attachment: ${message.file_name ?? 'file'}]`
        : (message.content ?? '').trim();
      return `${speaker}: ${text || '[empty]'}`;
    })
    .join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      input: transcript,
      max_output_tokens: 300,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI responses failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { output_text?: string };
  const text = data.output_text?.trim();
  if (!text) {
    throw new Error('OpenAI returned empty output_text');
  }
  return text;
}

async function markRead(ws: WebSocket, conversationId: string, messageId: string) {
  ws.send(JSON.stringify({
    type: 'read:mark',
    id: `read-${messageId}`,
    payload: {
      conversation_id: conversationId,
      message_id: messageId,
    },
  }));
}

async function sendReply(ws: WebSocket, conversationId: string, text: string) {
  ws.send(JSON.stringify({
    type: 'message:send',
    id: `reply-${crypto.randomUUID()}`,
    payload: {
      conversation_id: conversationId,
      content: text,
    },
  }));
}

async function runWorker() {
  if (!OPENAI_API_KEY) {
    console.warn('[Codex Bot] OPENAI_API_KEY is not configured. Worker is idle.');
    while (true) {
      await sleep(60_000);
    }
  }

  while (true) {
    try {
      const cookie = await login();
      const conversation = await ensureConversation(cookie);
      const seededMessages = await fetchRecentMessages(cookie, conversation.id, 20);
      const seenMessageIds = new Set(
        seededMessages
          .filter(message => message.sender?.username?.toLowerCase() !== BOT_USERNAME)
          .map(message => message.id)
      );

      const ws = new WebSocket(WS_URL, { headers: { Cookie: cookie } });
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });

      console.log(`[Codex Bot] watching DM ${conversation.id} for ${TARGET_USERNAME}`);
      let queue = Promise.resolve();

      ws.on('message', raw => {
        queue = queue.then(async () => {
          let envelope: { type?: string; payload?: { message?: InboxMessage } };
          try {
            envelope = JSON.parse(raw.toString());
          } catch {
            return;
          }

          const message = envelope.payload?.message;
          if (envelope.type !== 'message:new' || !message) return;
          if (message.conversation_id !== conversation.id) return;
          if (message.sender?.username?.toLowerCase() === BOT_USERNAME) return;
          if (seenMessageIds.has(message.id)) return;

          seenMessageIds.add(message.id);
          const history = await fetchRecentMessages(cookie, conversation.id, 12);
          const reply = await generateReply(history);
          await markRead(ws, conversation.id, message.id);
          await sendReply(ws, conversation.id, reply);
          console.log(`[Codex Bot] replied to ${message.sender?.username ?? 'unknown'}: ${reply.slice(0, 80)}`);
        }).catch(error => {
          console.error('[Codex Bot] message handling failed:', error instanceof Error ? error.message : error);
        });
      });

      await new Promise<void>((resolve, reject) => {
        ws.once('close', () => resolve());
        ws.once('error', reject);
      });
    } catch (error) {
      console.error('[Codex Bot] worker loop failed:', error instanceof Error ? error.message : error);
      await sleep(5_000);
    }
  }
}

runWorker().catch(error => {
  console.error('[Codex Bot] fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
