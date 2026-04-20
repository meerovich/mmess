import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { push_subscriptions } from '../../db/schema.js';
import { getVapidPublicKey, isPushConfigured } from '../../lib/push.js';

const PUSH_OPEN_TARGET_TTL_MS = 2 * 60_000;
const pendingOpenTargets = new Map<string, {
  path: string;
  conversationId?: string;
  messageId?: string;
  replace?: boolean;
  expiresAt: number;
}>();

export default async function pushRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /push/vapid-key — returns public VAPID key for client subscription
  fastify.get('/push/vapid-key', async (_request, reply) => {
    if (!isPushConfigured()) {
      return reply.code(503).send({ error: 'Push notifications not configured' });
    }
    return { publicKey: getVapidPublicKey() };
  });

  // POST /push/subscribe — save push subscription for authenticated user
  fastify.post('/push/subscribe', {
    schema: {
      body: {
        type: 'object',
        required: ['endpoint', 'keys'],
        properties: {
          endpoint: { type: 'string' },
          keys: {
            type: 'object',
            required: ['p256dh', 'auth'],
            properties: {
              p256dh: { type: 'string' },
              auth: { type: 'string' },
            },
          },
        },
      },
    },
    preValidation: [async (request, reply) => {
      await fastify.authenticate(request, reply);
    }],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { endpoint, keys } = request.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    // Upsert: if endpoint exists, update keys (they rotate)
    await (db as any).insert(push_subscriptions)
      .values({
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: [push_subscriptions.endpoint],
        set: {
          user_id: userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          updated_at: new Date(),
        },
      });

    return { ok: true };
  });

  // POST /push/unsubscribe — remove push subscription
  fastify.post('/push/unsubscribe', {
    schema: {
      body: {
        type: 'object',
        required: ['endpoint'],
        properties: {
          endpoint: { type: 'string' },
        },
      },
    },
    preValidation: [async (request, reply) => {
      await fastify.authenticate(request, reply);
    }],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { endpoint } = request.body as { endpoint: string };

    await (db as any).delete(push_subscriptions)
      .where(and(
        eq(push_subscriptions.user_id, userId),
        eq(push_subscriptions.endpoint, endpoint)
      ));

    return { ok: true };
  });

  fastify.post('/push/open-target', {
    schema: {
      body: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
          conversationId: { type: 'string' },
          messageId: { type: 'string' },
          replace: { type: 'boolean' },
        },
      },
    },
    preValidation: [async (request, reply) => {
      await fastify.authenticate(request, reply);
    }],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = request.body as {
      path: string;
      conversationId?: string;
      messageId?: string;
      replace?: boolean;
    };

    pendingOpenTargets.set(userId, {
      path: body.path,
      conversationId: body.conversationId,
      messageId: body.messageId,
      replace: body.replace ?? true,
      expiresAt: Date.now() + PUSH_OPEN_TARGET_TTL_MS,
    });

    return { ok: true };
  });

  fastify.get('/push/open-target', {
    preValidation: [async (request, reply) => {
      await fastify.authenticate(request, reply);
    }],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const pending = pendingOpenTargets.get(userId);

    if (!pending) {
      return reply.code(204).send();
    }

    if (pending.expiresAt <= Date.now()) {
      pendingOpenTargets.delete(userId);
      return reply.code(204).send();
    }

    pendingOpenTargets.delete(userId);
    return {
      path: pending.path,
      conversationId: pending.conversationId,
      messageId: pending.messageId,
      replace: pending.replace ?? true,
    };
  });
}
