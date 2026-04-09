import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { db } from '../../db/index.js';
import { sessions } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export default fp(async (fastify: FastifyInstance) => {
  // GET /auth/sessions — list all active sessions for current user (D-17)
  fastify.get('/auth/sessions', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const currentRefreshRaw = request.cookies['refresh_token'];
    const currentHash = currentRefreshRaw
      ? createHash('sha256').update(currentRefreshRaw).digest('hex')
      : null;

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.user_id, userId))
      .orderBy(desc(sessions.last_seen_at));

    return rows.map((s) => ({
      id: s.id,
      device_label: s.device_label ?? 'Unknown device',
      ip_address: s.ip_address,
      created_at: s.created_at,
      last_seen_at: s.last_seen_at,
      isCurrentDevice: currentHash !== null && s.token_hash === currentHash,
    }));
  });

  // DELETE /auth/sessions/:id — terminate another session by ID (D-18, D-19)
  fastify.delete('/auth/sessions/:id', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    // Find session belonging to current user
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.user_id, userId)))
      .limit(1);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    // D-18: block termination of current session — use logout instead
    const currentRefreshRaw = request.cookies['refresh_token'];
    if (currentRefreshRaw) {
      const currentHash = createHash('sha256').update(currentRefreshRaw).digest('hex');
      if (session.token_hash === currentHash) {
        return reply.code(400).send({
          error: 'Cannot terminate current session. Use logout instead.',
        });
      }
    }

    // Delete the session row (D-19: deleting row invalidates the refresh token)
    await db.delete(sessions).where(eq(sessions.id, id));

    return { ok: true };
  });
});
