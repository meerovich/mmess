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
  // Broadcast to ALL participants including the sender's own sockets so that
  // the sender sees their own reaction immediately (reducer is idempotent).
  // `ack` alone is insufficient — the client handleIncoming `ack` case only
  // handles message:send acks (has .message field), not reaction acks.
  const { broadcast } = await import('../registry.js');

  const [msg] = await db.select({ conversation_id: messages.conversation_id })
    .from(messages).where(eq(messages.id, payload.message_id));
  if (!msg) {
    socket.send(JSON.stringify({ type: 'error', payload: { message: 'Message not found' }, id: clientId }));
    return;
  }

  // Fetch any existing reactions by this user on this message.
  // Invariant (new): at most one row per (message_id, user_id). We still tolerate
  // multiple rows defensively for legacy data.
  const existing = await db
    .select({ emoji: message_reactions.emoji })
    .from(message_reactions)
    .where(and(
      eq(message_reactions.message_id, payload.message_id),
      eq(message_reactions.user_id, userId)
    ));

  const participantIds = await getConvParticipants(db, msg.conversation_id);

  // Toggle-off: user clicked the same emoji they already have (and only that one).
  if (existing.length === 1 && existing[0].emoji === payload.emoji) {
    await db.delete(message_reactions)
      .where(and(
        eq(message_reactions.message_id, payload.message_id),
        eq(message_reactions.user_id, userId),
        eq(message_reactions.emoji, payload.emoji)
      ));

    const removedEvent = {
      type: 'reaction:removed',
      payload: {
        message_id: payload.message_id,
        user_id: userId,
        emoji: payload.emoji,
        conversation_id: msg.conversation_id,
      },
    };
    socket.send(JSON.stringify({ type: 'ack', payload: removedEvent.payload, id: clientId }));
    broadcast(participantIds, removedEvent);
    return;
  }

  // Replace or add path: drop any prior reaction(s) from this user, then insert new.
  // Capture previous emojis (distinct) so we can emit reaction:removed for the old one(s).
  const previousEmojis = Array.from(new Set(existing.map(r => r.emoji)))
    .filter(e => e !== payload.emoji);

  if (existing.length > 0) {
    await db.delete(message_reactions)
      .where(and(
        eq(message_reactions.message_id, payload.message_id),
        eq(message_reactions.user_id, userId)
      ));
  }

  // Emit reaction:removed for each prior emoji BEFORE the new reaction:added so
  // client reducers stay consistent (remove old, then add new).
  for (const oldEmoji of previousEmojis) {
    const removedEvent = {
      type: 'reaction:removed',
      payload: {
        message_id: payload.message_id,
        user_id: userId,
        emoji: oldEmoji,
        conversation_id: msg.conversation_id,
      },
    };
    socket.send(JSON.stringify(removedEvent));
    broadcast(participantIds, removedEvent);
  }

  await db.insert(message_reactions)
    .values({ message_id: payload.message_id, user_id: userId, emoji: payload.emoji })
    .onConflictDoNothing();

  const addedEvent = {
    type: 'reaction:added',
    payload: {
      message_id: payload.message_id,
      user_id: userId,
      emoji: payload.emoji,
      conversation_id: msg.conversation_id,
    },
  };
  socket.send(JSON.stringify({ type: 'ack', payload: addedEvent.payload, id: clientId }));
  broadcast(participantIds, addedEvent);
}

export async function handleReactionRemove(
  db: DB, socket: WebSocket, userId: string,
  payload: { message_id: string; emoji: string }, clientId: string
): Promise<void> {
  // Broadcast to ALL participants including the sender's own sockets so that
  // the sender sees their own reaction immediately (reducer is idempotent).
  // `ack` alone is insufficient — the client handleIncoming `ack` case only
  // handles message:send acks (has .message field), not reaction acks.
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
  broadcast(participantIds, event);
}
