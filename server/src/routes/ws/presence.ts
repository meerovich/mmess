import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { broadcast, isOnline } from './registry.js';

// Module-level debounce map: userId -> pending offline timer
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Returns the set of userIds who share at least one conversation with userId.
 * Excludes userId itself. Used to scope presence broadcasts.
 */
async function getPresenceScope(userId: string): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT user_id
    FROM conversation_participants
    WHERE conversation_id IN (
      SELECT conversation_id FROM conversation_participants WHERE user_id = ${userId}::uuid
    )
    AND user_id != ${userId}::uuid
  `);
  return Array.from(rows).map(r => r.user_id);
}

/**
 * Call on WS connect: cancel any pending offline timer, broadcast online to scope.
 */
export async function broadcastPresenceOnline(userId: string): Promise<void> {
  // Cancel pending offline event for this user (flicker mitigation — PITFALLS #7)
  const existing = offlineTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    offlineTimers.delete(userId);
  }

  const scope = await getPresenceScope(userId);
  if (scope.length === 0) return;

  broadcast(scope, {
    type: 'presence:update',
    payload: { user_id: userId, online: true, last_seen_at: null },
  });
}

/**
 * Call on WS close: schedule offline broadcast after 3s debounce.
 * If user reconnects within 3s, the timer is cancelled in broadcastPresenceOnline.
 */
export function schedulePresenceOffline(userId: string): void {
  // Don't schedule if there's already a timer (multiple sockets closing)
  if (offlineTimers.has(userId)) return;

  const timer = setTimeout(async () => {
    offlineTimers.delete(userId);

    // Check if user reconnected in the meantime
    if (isOnline(userId)) return;

    // Update last_seen_at in DB
    const now = new Date();
    await db.update(users)
      .set({ last_seen_at: now })
      .where(eq(users.id, userId));

    const scope = await getPresenceScope(userId);
    if (scope.length === 0) return;

    broadcast(scope, {
      type: 'presence:update',
      payload: { user_id: userId, online: false, last_seen_at: now.toISOString() },
    });
  }, 3000); // 3-second grace period per PITFALLS #7

  offlineTimers.set(userId, timer);
}

/**
 * REST route: GET /api/presence?user_ids=uuid,uuid,...
 * Returns online status for up to 50 user IDs. (D-19)
 */
export default async function presenceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { user_ids?: string } }>(
    '/presence',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const raw = request.query.user_ids ?? '';
      const userIds = raw
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 50); // max 50 per D-19

      if (userIds.length === 0) {
        return reply.send({ presence: [] });
      }

      // Fetch last_seen_at for each userId
      const userRows = await db.select({
        id: users.id,
        last_seen_at: users.last_seen_at,
      })
        .from(users)
        .where(
          sql`${users.id} = ANY(ARRAY[${sql.join(
            userIds.map(id => sql`${id}::uuid`),
            sql`, `
          )}])`
        );

      const lastSeenMap = new Map<string, Date | null>(
        userRows.map(r => [r.id, r.last_seen_at])
      );

      const presence = userIds.map(uid => ({
        user_id: uid,
        online: isOnline(uid),
        last_seen_at: lastSeenMap.get(uid)?.toISOString() ?? null,
      }));

      return reply.send({ presence });
    }
  );
}
