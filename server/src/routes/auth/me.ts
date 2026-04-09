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
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return user;
  });
});
