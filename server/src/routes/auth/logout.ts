import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { db } from '../../db/index.js';
import { sessions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export default fp(async (fastify: FastifyInstance) => {
  fastify.post('/auth/logout', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const rawRefreshToken = request.cookies['refresh_token'];

    if (rawRefreshToken) {
      const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
      // Delete the session row to invalidate the refresh token
      await db.delete(sessions).where(eq(sessions.token_hash, tokenHash));
    }

    // Clear both cookies regardless of whether session was found
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/api/auth/refresh' });

    return { ok: true };
  });
});
