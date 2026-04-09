import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { sessions, users } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export default fp(async (fastify: FastifyInstance) => {
  fastify.post('/auth/refresh', async (request, reply) => {
    const rawRefreshToken = request.cookies['refresh_token'];

    if (!rawRefreshToken) {
      return reply.code(401).send({ error: 'Refresh token missing' });
    }

    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    // Use SELECT FOR UPDATE inside a transaction to prevent race conditions (D-09, Pitfall C)
    let responded = false;

    await db.transaction(async (tx) => {
      const rows = await tx.execute<typeof sessions.$inferSelect>(
        sql`SELECT * FROM sessions WHERE token_hash = ${tokenHash} FOR UPDATE`
      );

      const session = rows[0] as typeof sessions.$inferSelect | undefined;

      if (!session) {
        await reply.code(401).send({ error: 'Invalid refresh token' });
        responded = true;
        return;
      }

      const now = new Date();
      if (new Date(session.expires_at) < now) {
        // Expired session — delete it
        await tx.delete(sessions).where(eq(sessions.id, session.id));
        await reply.code(401).send({ error: 'Refresh token expired' });
        responded = true;
        return;
      }

      // Fetch username for the new JWT payload
      const [user] = await tx
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, session.user_id))
        .limit(1);

      if (!user) {
        await reply.code(401).send({ error: 'User not found' });
        responded = true;
        return;
      }

      // Rotate: generate new refresh token
      const newRawToken = nanoid(32);
      const newTokenHash = createHash('sha256').update(newRawToken).digest('hex');
      const newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // rolling 30 days

      await tx
        .update(sessions)
        .set({
          token_hash: newTokenHash,
          last_seen_at: now,
          expires_at: newExpiresAt,
          updated_at: now,
        })
        .where(eq(sessions.id, session.id));

      const isProduction = process.env.NODE_ENV === 'production';

      // Issue new access JWT with both sub and username
      const accessToken = fastify.jwt.sign(
        { sub: session.user_id, username: user.username },
        { expiresIn: '15m' }
      );

      // Set both cookies with new tokens
      reply.setCookie('access_token', accessToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 900,
      });

      reply.setCookie('refresh_token', newRawToken, {
        path: '/api/auth/refresh',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 2592000,
      });
    });

    if (responded) {
      return;
    }

    return { ok: true };
  });
});
