import { and, eq, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { WebSocket } from 'ws';
import { message_reads, messages, conversation_participants } from '../../../db/schema.js';

type DB = PostgresJsDatabase<Record<string, never>>;

export async function handleReadMark(
  db: DB, socket: WebSocket, userId: string,
  payload: { message_id: string; conversation_id: string }, clientId: string
): Promise<void> {
  const { broadcast } = await import('../registry.js');

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

  const unreadMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(
      eq(messages.conversation_id, payload.conversation_id),
      lte(messages.created_at, markedMsg.created_at)
    ));

  // Insert read receipts for each message up to and including the marked one
  if (unreadMessages.length > 0) {
    await db.insert(message_reads)
      .values(unreadMessages.map(m => ({ message_id: m.id, user_id: userId, read_at: new Date() })))
      .onConflictDoNothing();
  }

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

  broadcast(
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
    userId
  );
}
