import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export default fp(async (fastify: FastifyInstance) => {
  fastify.get('/auth/me', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar_url: users.avatar_url,
        profile_status: users.profile_status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return user;
  });

  fastify.patch<{
    Body: {
      avatar_url?: string | null;
      profile_status?: string | null;
    };
  }>('/auth/me', {
    preValidation: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          avatar_url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          profile_status: { anyOf: [{ type: 'string', maxLength: 140 }, { type: 'null' }] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const nextStatus =
      request.body.profile_status === undefined
        ? undefined
        : request.body.profile_status?.trim()
          ? request.body.profile_status.trim().slice(0, 140)
          : null;

    const updatePayload: Partial<typeof users.$inferInsert> = {};
    if (request.body.avatar_url !== undefined) {
      updatePayload.avatar_url = request.body.avatar_url;
    }
    if (nextStatus !== undefined) {
      updatePayload.profile_status = nextStatus;
    }

    if (Object.keys(updatePayload).length === 0) {
      return reply.code(400).send({ error: 'No profile fields to update' });
    }

    const [updatedUser] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar_url: users.avatar_url,
        profile_status: users.profile_status,
      });

    if (!updatedUser) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return updatedUser;
  });
});
