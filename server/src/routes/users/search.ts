import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { and, ne, sql } from 'drizzle-orm';

export default async function usersSearchRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { q?: string; limit?: string };
  }>('/api/users', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const query = request.query.q ?? '';
    const rawLimit = Math.min(parseInt(request.query.limit ?? '20', 10), 20);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit;

    // Require at least 2 characters to prevent full-table dump (D-20)
    if (query.trim().length < 2) {
      return reply.send({ users: [] });
    }

    // Search by username or email with ILIKE, excluding current user (D-20)
    const results = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar_url: users.avatar_url,
      })
      .from(users)
      .where(
        and(
          ne(users.id, userId),
          sql`(${users.username} ILIKE ${'%' + query + '%'} OR ${users.email} ILIKE ${'%' + query + '%'})`
        )
      )
      .limit(limit);

    return reply.send({ users: results });
  });
}
