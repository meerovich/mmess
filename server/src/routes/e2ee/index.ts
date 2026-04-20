import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  conversation_key_shares,
  conversation_participants,
  user_key_bundles,
} from '../../db/schema.js';

type KeyShareInput = {
  user_id: string;
  wrapped_key: string;
  key_version?: number;
};

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
}
