import type { FastifyInstance } from 'fastify';
import { eq, and, gt, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { messages, users, files } from '../../db/schema.js';
import { broadcastExcludeSocket } from '../ws/registry.js';

// Bot config — hardcoded for simplicity during dev/testing.
// In production, move to env vars.
const BOT_SECRET = process.env.BOT_SECRET ?? 'mmess-claude-bot-2026';
const BOT_EMAIL = 'claude@chatboris.local';
const BOT_CONV_MIHA = 'd6cfdac1-91ce-4e53-be31-432ab05d3a3f';

function checkSecret(secret: string | undefined): boolean {
  return secret === BOT_SECRET;
}

export default async function botRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /bot/send — send message as Claude Bot to miha DM
  fastify.post('/bot/send', {
    schema: {
      body: {
        type: 'object',
        required: ['text', 'secret'],
        properties: {
          text: { type: 'string' },
          secret: { type: 'string' },
          conversation_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { text, secret, conversation_id } = request.body as {
      text: string;
      secret: string;
      conversation_id?: string;
    };

    if (!checkSecret(secret)) {
      return reply.code(403).send({ error: 'Invalid secret' });
    }

    const convId = conversation_id ?? BOT_CONV_MIHA;

    // Find bot user
    const [botUser] = await (db as any)
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.email, BOT_EMAIL));

    if (!botUser) {
      return reply.code(500).send({ error: 'Bot user not found' });
    }

    // Insert message
    const [msg] = await (db as any)
      .insert(messages)
      .values({
        conversation_id: convId,
        sender_id: botUser.id,
        content: text.trim(),
      })
      .returning();

    // Build enriched message for broadcast
    const enriched = {
      ...msg,
      sender: { id: botUser.id, username: botUser.username, avatar_url: null },
      reactions: [],
      reply_to: null,
      file_name: null,
      file_mime: null,
      file_size: null,
      is_image: null,
      thumbnail_url: null,
    };

    // Broadcast via WS to all participants (if they're online)
    const { broadcast } = await import('../ws/registry.js');
    // Get participant IDs
    const { conversation_participants } = await import('../../db/schema.js');
    const participants = await (db as any)
      .select({ user_id: conversation_participants.user_id })
      .from(conversation_participants)
      .where(eq(conversation_participants.conversation_id, convId));
    const participantIds = participants.map((p: { user_id: string }) => p.user_id);

    broadcast(participantIds, { type: 'message:new', payload: { message: enriched } });

    // Also send push notification to offline participants
    const { sendPushToUser, isPushConfigured } = await import('../../lib/push.js');
    const { isOnline } = await import('../ws/registry.js');
    if (isPushConfigured()) {
      for (const pid of participantIds) {
        if (pid !== botUser.id && !isOnline(pid)) {
          sendPushToUser(db as any, pid, {
            title: botUser.username,
            body: text.slice(0, 120),
            tag: convId,
            url: `/chat/${convId}`,
          }).catch(() => {});
        }
      }
    }

    return { ok: true, message_id: msg.id };
  });

  // GET /bot/inbox — read messages from miha (or others) in the bot DM
  fastify.get('/bot/inbox', {
    schema: {
      querystring: {
        type: 'object',
        required: ['secret'],
        properties: {
          secret: { type: 'string' },
          after: { type: 'string' },  // ISO timestamp — only messages after this
          limit: { type: 'string' },
          conversation_id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { secret, after, limit: rawLimit, conversation_id } = request.query as {
      secret: string;
      after?: string;
      limit?: string;
      conversation_id?: string;
    };

    if (!checkSecret(secret)) {
      return reply.code(403).send({ error: 'Invalid secret' });
    }

    const convId = conversation_id ?? BOT_CONV_MIHA;
    const msgLimit = Math.min(parseInt(rawLimit ?? '20', 10) || 20, 100);

    // Find bot user to exclude their own messages
    const [botUser] = await (db as any)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, BOT_EMAIL));

    let query = (db as any)
      .select({
        id: messages.id,
        content: messages.content,
        sender_id: messages.sender_id,
        file_id: messages.file_id,
        created_at: messages.created_at,
      })
      .from(messages)
      .where(
        after
          ? and(
              eq(messages.conversation_id, convId),
              gt(messages.created_at, new Date(after))
            )
          : eq(messages.conversation_id, convId)
      )
      .orderBy(desc(messages.created_at))
      .limit(msgLimit);

    const rows = await query;

    // Enrich with sender name and file URLs
    const enriched = await Promise.all(
      rows.map(async (row: any) => {
        const [sender] = await (db as any)
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, row.sender_id));

        let file_url = null;
        if (row.file_id) {
          file_url = `/api/files/${row.file_id}`;
        }

        return {
          id: row.id,
          content: row.content,
          sender: sender?.username ?? 'unknown',
          is_bot: row.sender_id === botUser?.id,
          file_url,
          created_at: row.created_at,
        };
      })
    );

    // Return in chronological order (oldest first)
    return { messages: enriched.reverse() };
  });
}
