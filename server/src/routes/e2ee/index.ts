import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  messages,
  conversation_key_shares,
  conversation_participants,
  users,
  user_key_bundles,
} from '../../db/schema.js';

type KeyShareInput = {
  user_id: string;
  wrapped_key: string;
  key_version?: number;
};

type BotReadablePayload = {
  text: string | null;
  file?: {
    name: string;
    mime: string;
    size: number;
    iv: string;
  };
};

const BOT_READABLE_USERNAMES = new Set(['codex bot', 'claude bot']);

async function requireParticipant(conversationId: string, userId: string) {
  const [participant] = await db
    .select({ user_id: conversation_participants.user_id })
    .from(conversation_participants)
    .where(and(
      eq(conversation_participants.conversation_id, conversationId),
      eq(conversation_participants.user_id, userId)
    ))
    .limit(1);

  return participant;
}

function parseEncryptedEnvelope(content: string | null | undefined): Record<string, unknown> | null {
  if (!content?.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parsed.type === 'mmess-e2ee' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeBotReadablePayload(value: unknown): BotReadablePayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const text = payload.text;
  if (text !== null && typeof text !== 'string') return null;

  const fileValue = payload.file;
  let file: BotReadablePayload['file'];
  if (fileValue !== undefined) {
    if (!fileValue || typeof fileValue !== 'object') return null;
    const record = fileValue as Record<string, unknown>;
    if (
      typeof record.name !== 'string' ||
      typeof record.mime !== 'string' ||
      typeof record.size !== 'number' ||
      typeof record.iv !== 'string'
    ) {
      return null;
    }
    file = {
      name: record.name,
      mime: record.mime,
      size: record.size,
      iv: record.iv,
    };
  }

  return {
    text: text ?? null,
    file,
  };
}

async function conversationHasBotParticipant(conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ username: users.username })
    .from(conversation_participants)
    .innerJoin(users, eq(conversation_participants.user_id, users.id))
    .where(eq(conversation_participants.conversation_id, conversationId));

  return rows.some((row) => BOT_READABLE_USERNAMES.has(row.username.trim().toLowerCase()));
}

export default async function e2eeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/e2ee/me-key', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.sub;
    const [bundle] = await db
      .select({ public_key_jwk: user_key_bundles.public_key_jwk })
      .from(user_key_bundles)
      .where(eq(user_key_bundles.user_id, userId))
      .limit(1);

    return { public_key_jwk: bundle?.public_key_jwk ?? null };
  });

  fastify.post<{ Body: { public_key_jwk: string } }>('/e2ee/me-key', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['public_key_jwk'],
        properties: {
          public_key_jwk: { type: 'string', minLength: 20 },
        },
      },
    },
  }, async (request) => {
    const userId = request.user.sub;
    const now = new Date();
    await db
      .insert(user_key_bundles)
      .values({
        user_id: userId,
        public_key_jwk: request.body.public_key_jwk,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: user_key_bundles.user_id,
        set: {
          public_key_jwk: request.body.public_key_jwk,
          updated_at: now,
        },
      });

    return { ok: true };
  });

  fastify.get<{ Querystring: { ids?: string } }>('/e2ee/public-keys', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          ids: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const ids = (request.query.ids ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (ids.length === 0) return { keys: [] };

    const rows = await db
      .select({
        user_id: user_key_bundles.user_id,
        public_key_jwk: user_key_bundles.public_key_jwk,
      })
      .from(user_key_bundles)
      .where(inArray(user_key_bundles.user_id, ids));

    return { keys: rows };
  });

  fastify.get<{ Params: { id: string } }>('/e2ee/conversations/:id/key-shares', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const conversationId = request.params.id;
    const participant = await requireParticipant(conversationId, userId);
    if (!participant) return reply.code(403).send({ error: 'Not a participant' });

    const rows = await db
      .select({
        conversation_id: conversation_key_shares.conversation_id,
        user_id: conversation_key_shares.user_id,
        wrapped_key: conversation_key_shares.wrapped_key,
        algorithm: conversation_key_shares.algorithm,
        key_version: conversation_key_shares.key_version,
      })
      .from(conversation_key_shares)
      .where(and(
        eq(conversation_key_shares.conversation_id, conversationId),
        eq(conversation_key_shares.user_id, userId)
      ));

    return { shares: rows };
  });

  fastify.post<{
    Params: { id: string };
    Body: { shares: KeyShareInput[] };
  }>('/e2ee/conversations/:id/key-shares', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['shares'],
        properties: {
          shares: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['user_id', 'wrapped_key'],
              properties: {
                user_id: { type: 'string', format: 'uuid' },
                wrapped_key: { type: 'string', minLength: 20 },
                key_version: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const conversationId = request.params.id;
    const participant = await requireParticipant(conversationId, userId);
    if (!participant) return reply.code(403).send({ error: 'Not a participant' });

    const participants = await db
      .select({ user_id: conversation_participants.user_id })
      .from(conversation_participants)
      .where(eq(conversation_participants.conversation_id, conversationId));
    const participantIds = new Set(participants.map(row => row.user_id));

    const now = new Date();
    const values = request.body.shares
      .filter(share => participantIds.has(share.user_id))
      .map(share => ({
        conversation_id: conversationId,
        user_id: share.user_id,
        wrapped_key: share.wrapped_key,
        key_version: share.key_version ?? 1,
        created_by: userId,
        updated_at: now,
      }));

    if (values.length === 0) {
      return reply.code(400).send({ error: 'No participant shares to store' });
    }

    await db
      .insert(conversation_key_shares)
      .values(values)
      .onConflictDoUpdate({
        target: [
          conversation_key_shares.conversation_id,
          conversation_key_shares.user_id,
          conversation_key_shares.key_version,
        ],
        set: {
          wrapped_key: sql`excluded.wrapped_key`,
          updated_at: now,
        },
      });

    return { ok: true, stored: values.length };
  });

  fastify.post<{
    Params: { messageId: string };
    Body: { payload: BotReadablePayload };
  }>('/e2ee/messages/:messageId/bot-payload', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['payload'],
        properties: {
          payload: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const payload = normalizeBotReadablePayload(request.body.payload);
    if (!payload) return reply.code(400).send({ error: 'Invalid payload' });

    const [message] = await db
      .select({
        id: messages.id,
        sender_id: messages.sender_id,
        conversation_id: messages.conversation_id,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.id, request.params.messageId))
      .limit(1);

    if (!message) return reply.code(404).send({ error: 'Message not found' });
    if (message.sender_id !== userId) return reply.code(403).send({ error: 'Only sender can backfill payload' });

    const participant = await requireParticipant(message.conversation_id, userId);
    if (!participant) return reply.code(403).send({ error: 'Not a participant' });
    if (!(await conversationHasBotParticipant(message.conversation_id))) {
      return reply.code(400).send({ error: 'Backfill is allowed only in bot conversations' });
    }

    const envelope = parseEncryptedEnvelope(message.content);
    if (!envelope) return reply.code(400).send({ error: 'Message is not encrypted' });
    if (typeof envelope.bot_payload_b64 === 'string' && envelope.bot_payload_b64.length > 0) {
      return { ok: true, updated: false };
    }

    envelope.bot_payload_b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    await db
      .update(messages)
      .set({
        content: JSON.stringify(envelope),
        updated_at: new Date(),
      })
      .where(eq(messages.id, message.id));

    return { ok: true, updated: true };
  });
}
