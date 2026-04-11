import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { WebSocket } from 'ws';
import { message_reactions, messages, conversation_participants } from '../../../db/schema.js';

type DB = PostgresJsDatabase<Record<string, never>>;

async function getConvParticipants(db: DB, conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ user_id: conversation_participants.user_id })
    .from(conversation_participants)
    .where(eq(conversation_participants.conversation_id, conversationId));
  return rows.map(r => r.user_id);
}

export async function handleReactionAdd(
  db: DB, socket: WebSocket, userId: string,
  payload: { message_id: string; emoji: string }, clientId: string
): Promise<void> {
  const { broadcast } = await import('../registry.js');

  const [msg] = await db.select({ conversation_id: messages.conversation_id })
    .from(messages).where(eq(messages.id, payload.message_id));
  if (!msg) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Message not found' }, id: clientId }));
    return;
  }

  // Upsert — onConflictDoNothing ensures idempotency
  await db.insert(message_reactions)
    .values({ message_id: payload.message_id, user_id: userId, emoji: payload.emoji })
    .onConflictDoNothing();

  const participantIds = await getConvParticipants(db, msg.conversation_id);
  const event = {
    type: 'reaction:added',
    payload: {
      message_id: payload.message_id,
      user_id: userId,
      emoji: payload.emoji,
      conversation_id: msg.conversation_id,
    },
  };
  socket.send(JSON.stringify({ type: 'ack', payload: event.payload, id: clientId }));
  broadcast(participantIds, event, userId);
}

export async function handleReactionRemove(
  db: DB, socket: WebSocket, userId: string,
  payload: { message_id: string; emoji: string }, clientId: string
): Promise<void> {
  const { broadcast } = await import('../registry.js');

  const [msg] = await db.select({ conversation_id: messages.conversation_id })
    .from(messages).where(eq(messages.id, payload.message_id));
  if (!msg) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Message not found' }, id: clientId }));
    return;
  }

  await db.delete(message_reactions)
    .where(and(
      eq(message_reactions.message_id, payload.message_id),
      eq(message_reactions.user_id, userId),
      eq(message_reactions.emoji, payload.emoji)
    ));

  const participantIds = await getConvParticipants(db, msg.conversation_id);
  const event = {
    type: 'reaction:removed',
    payload: {
      message_id: payload.message_id,
      user_id: userId,
      emoji: payload.emoji,
      conversation_id: msg.conversation_id,
    },
  };
  socket.send(JSON.stringify({ type: 'ack', payload: event.payload, id: clientId }));
  broadcast(participantIds, event, userId);
}
