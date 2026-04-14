import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { WebSocket } from 'ws';
import { message_reads, messages, conversation_participants } from '../../../db/schema.js';

type DB = PostgresJsDatabase<Record<string, never>>;

export async function handleReadMark(
  db: DB, socket: WebSocket, userId: string,
  payload: { message_id: string; conversation_id: string }, clientId: string
): Promise<void> {
  const { broadcastExcludeSocket } = await import('../registry.js');

  // Verify user is a participant
  const [cp] = await db.select({ last_read_message_id: conversation_participants.last_read_message_id })
    .from(conversation_participants)
    .where(and(
      eq(conversation_participants.conversation_id, payload.conversation_id),
      eq(conversation_participants.user_id, userId)
    ));
  if (!cp) return;

  // Get timestamp of the marked message to batch-mark all prior messages — D-31
  const [markedMsg] = await db.select({ created_at: messages.created_at })
    .from(messages).where(eq(messages.id, payload.message_id));
  if (!markedMsg) return;

  await db.execute(sql`
    INSERT INTO message_reads (message_id, user_id, read_at)
    SELECT id, ${userId}::uuid, NOW()
    FROM messages
    WHERE conversation_id = ${payload.conversation_id}::uuid
      AND created_at <= (
        SELECT created_at
        FROM messages
        WHERE id = ${payload.message_id}::uuid
      )
    ON CONFLICT DO NOTHING
  `);

  // Update last_read_message_id cursor
  await db.update(conversation_participants)
    .set({ last_read_message_id: payload.message_id })
    .where(and(
      eq(conversation_participants.conversation_id, payload.conversation_id),
      eq(conversation_participants.user_id, userId)
    ));

  // Broadcast read:by to other participants so senders can update check marks
  const participants = await db.select({ user_id: conversation_participants.user_id })
    .from(conversation_participants)
    .where(eq(conversation_participants.conversation_id, payload.conversation_id));

  // Exclude only the source socket so the user's OTHER sessions also update
  // their unread cursor (multi-session sync).
  broadcastExcludeSocket(
    participants.map(p => p.user_id),
    {
      type: 'read:by',
      payload: {
        conversation_id: payload.conversation_id,
        message_id: payload.message_id,
        user_id: userId,
        read_at: new Date().toISOString(),
      },
    },
    socket
  );
}
