---
name: chat-miha-progress
description: Send progress updates to Miha in mmess as Codex Bot and inspect reply messages in the same DM
---

# /chat-miha-progress

Отправляет служебное сообщение о ходе работы пользователю `Miha` от имени `Codex Bot` и позволяет проверить входящие сообщения в том же DM.

## Usage

```bash
/chat-miha-progress <message>
node scripts/codex-bot-chat.mjs inbox
node scripts/codex-bot-chat.mjs watch
```

## Flow

1. Логин пользователем `Codex Bot` в mmess API.
2. Найти пользователя `miha` через `/api/users`.
3. Найти или создать direct conversation через `/api/conversations`.
4. Для отправки подключиться к `/ws` с cookie `Codex Bot` и выполнить `message:send`.
5. Для входящих читать `/api/conversations/:id/messages` или держать `watch` через `/ws`.

## Recommended usage

```bash
node scripts/codex-bot-chat.mjs send "Промежуточный статус"
node scripts/codex-bot-chat.mjs inbox
node scripts/codex-bot-chat.mjs watch
```

## Reference snippet

```bash
node -e "
(async () => {
  const WebSocket = require('ws');
  const text = process.argv.slice(1).join(' ');

  const loginRes = await fetch('https://chatboris.mooo.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'codex@chatboris.local', password: 'ClaudeBot2026!' }),
  });
  const cookies = loginRes.headers.getSetCookie();
  const access = cookies.find(c => c.startsWith('access_token='))?.split(';')[0];
  if (!access) throw new Error('No access_token cookie');

  const userRes = await fetch('https://chatboris.mooo.com/api/users?q=miha', {
    headers: { Cookie: access },
  });
  const { users } = await userRes.json();
  const miha = users.find(u => u.username?.toLowerCase() === 'miha');
  if (!miha) throw new Error('Miha user not found');

  const convRes = await fetch('https://chatboris.mooo.com/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: access },
    body: JSON.stringify({ type: 'direct', participant_ids: [miha.id] }),
  });
  const conv = await convRes.json();
  if (!conv?.id) throw new Error('Failed to get Miha conversation');

  const ws = new WebSocket('wss://chatboris.mooo.com/ws', { headers: { Cookie: access } });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({
    type: 'message:send',
    id: 'chat-miha-progress',
    payload: {
      conversation_id: conv.id,
      content: text,
    },
  }));

  const ack = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS timeout')), 10000);
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ack' || msg.type === 'error') {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });

  console.log(JSON.stringify(ack));
  ws.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
" "Статус задачи"
```

## Notes

- Sender: `Codex Bot` (`codex@chatboris.local`)
- Target user: `Miha`
- Password: `ClaudeBot2026!`
- Direct conversation with Miha is already prepared and accepted, so repeated calls reuse it.
- Для прогресс-апдейтов лучше писать коротко: что исследовано, что делается сейчас, есть ли блокер.
