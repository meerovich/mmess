import { createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  conversations,
  conversation_participants,
  messages,
  users,
} from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { broadcast } from '../ws/registry.js';

interface CreateConversationBody {
  type: 'direct' | 'group';
  name?: string;
  participant_ids: string[];
}

export default async function conversationsCreateRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: CreateConversationBody }>('/api/conversations', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['type', 'participant_ids'],
        properties: {
          type: { type: 'string', enum: ['direct', 'group'] },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          participant_ids: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
          },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { type, name, participant_ids } = request.body;

    if (type === 'direct') {
      return handleDirectConversation(fastify, request, reply, userId, participant_ids);
    } else {
      return handleGroupConversation(fastify, request, reply, userId, name, participant_ids);
    }
  });
}

async function handleDirectConversation(
  fastify: FastifyInstance,
  request: any,
  reply: any,
  userId: string,
  participantIds: string[]
) {
  // Direct conversation requires exactly one other participant
  if (participantIds.length !== 1) {
    return reply.code(400).send({ error: 'Direct conversation requires exactly one participant_id' });
  }

  const targetUserId = participantIds[0];

  if (targetUserId === userId) {
    return reply.code(400).send({ error: 'Cannot create a direct conversation with yourself' });
  }

  // Use advisory lock for race-safe uniqueness (RESEARCH.md Pattern 8)
  const lockKey = BigInt(
    `0x${createHash('md5')
      .update([userId, targetUserId].sort().join(':'))
      .digest('hex')
      .slice(0, 16)}`
  );

  const result = await db.transaction(async (tx) => {
    // Acquire advisory lock to prevent race conditions
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

    // Check if a direct conversation already exists between these two users
    // Use raw SQL via sql template so Drizzle returns typed Record[]
    const existingRows = await tx.execute<{ id: string }>(sql`
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp1
        ON cp1.conversation_id = c.id AND cp1.user_id = ${userId}::uuid
      JOIN conversation_participants cp2
        ON cp2.conversation_id = c.id AND cp2.user_id = ${targetUserId}::uuid
      WHERE c.type = 'direct'
      LIMIT 1
    `);

    // Drizzle's execute() with postgres-js returns a RowList that is array-like
    const existingArr = Array.from(existingRows);
    if (existingArr.length > 0) {
      const existingId = existingArr[0].id;
      return { conversationId: existingId, isNew: false };
    }

    // Create new direct conversation
    const [newConversation] = await tx
      .insert(conversations)
      .values({ type: 'direct' })
      .returning({ id: conversations.id });

    const convId = newConversation.id;

    // Add both participants (neither is admin in a direct chat)
    await tx.insert(conversation_participants).values([
      {
        conversation_id: convId,
        user_id: userId,
        is_admin: false,
        can_edit_messages: false,
      },
      {
        conversation_id: convId,
        user_id: targetUserId,
        is_admin: false,
        can_edit_messages: false,
      },
    ]);

    return { conversationId: convId, isNew: true };
  });

  const { conversationId, isNew } = result;

  // Fetch the full conversation object to return
  const conversation = await fetchConversation(conversationId, userId);

  // Broadcast conversation:new to all participants (D-38)
  // The WS registry is set up by plan 03-02; check at runtime to avoid hard coupling
  broadcastConversationNew(fastify, conversation);

  return reply.code(isNew ? 201 : 200).send(conversation);
}

async function handleGroupConversation(
  fastify: FastifyInstance,
  request: any,
  reply: any,
  userId: string,
  name: string | undefined,
  participantIds: string[]
) {
  if (!name || name.trim().length === 0) {
    return reply.code(400).send({ error: 'Group conversation requires a name' });
  }

  if (participantIds.length < 1) {
    return reply.code(400).send({ error: 'Group conversation requires at least one participant' });
  }

  const conversationId = await db.transaction(async (tx) => {
    // Create the group conversation
    const [newConversation] = await tx
      .insert(conversations)
      .values({ type: 'group', name: name.trim() })
      .returning({ id: conversations.id });

    const convId = newConversation.id;

    // Creator is admin + can edit messages (D-18)
    await tx.insert(conversation_participants).values({
      conversation_id: convId,
      user_id: userId,
      is_admin: true,
      can_edit_messages: true,
    });

    // Add other participants (not admin by default)
    if (participantIds.length > 0) {
      const otherParticipants = participantIds
        .filter((pid) => pid !== userId) // deduplicate if creator accidentally included
        .map((pid) => ({
          conversation_id: convId,
          user_id: pid,
          is_admin: false,
          can_edit_messages: false,
        }));

      if (otherParticipants.length > 0) {
        await tx.insert(conversation_participants).values(otherParticipants);
      }
    }

    return convId;
  });

  // Fetch the full conversation object to return
  const conversation = await fetchConversation(conversationId, userId);

  // Broadcast conversation:new to all participants (D-38)
  broadcastConversationNew(fastify, conversation);

  return reply.code(201).send(conversation);
}

/**
 * Fetch a conversation with its participants and last message for the response.
 */
async function fetchConversation(conversationId: string, requestingUserId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const participants = await db
    .select({
      user_id: users.id,
      username: users.username,
      avatar_url: users.avatar_url,
      is_admin: conversation_participants.is_admin,
      can_edit_messages: conversation_participants.can_edit_messages,
    })
    .from(conversation_participants)
    .innerJoin(users, eq(conversation_participants.user_id, users.id))
    .where(eq(conversation_participants.conversation_id, conversationId));

  // Derive display name for DMs
  const otherParticipants = participants.filter((p) => p.user_id !== requestingUserId);
  const displayName =
    conv.type === 'direct' && otherParticipants.length > 0
      ? otherParticipants[0].username
      : conv.name ?? 'Group';

  let lastMessage = null;
  if (conv.last_message_id) {
    const [msg] = await db
      .select({
        id: messages.id,
        content: messages.content,
        sender_id: messages.sender_id,
        created_at: messages.created_at,
      })
      .from(messages)
      .where(eq(messages.id, conv.last_message_id))
      .limit(1);

    if (msg) {
      lastMessage = {
        id: msg.id,
        content: msg.content,
        sender_id: msg.sender_id,
        created_at: msg.created_at.toISOString(),
      };
    }
  }

  return {
    id: conv.id,
    type: conv.type,
    name: displayName,
    avatar_url: conv.avatar_url,
    last_message: lastMessage,
    unread_count: 0,
    participants: participants.map((p) => ({
      user_id: p.user_id,
      username: p.username,
      avatar_url: p.avatar_url,
      is_admin: p.is_admin,
      can_edit_messages: p.can_edit_messages,
    })),
    updated_at: conv.updated_at.toISOString(),
    created_at: conv.created_at.toISOString(),
  };
}

/**
 * Broadcast conversation:new to all participants via WS registry (D-38).
 */
function broadcastConversationNew(fastify: FastifyInstance, conversation: unknown) {
  try {
    const participantIds = (conversation as any).participants.map((p: any) => p.user_id as string);
    broadcast(participantIds, { type: 'conversation:new', payload: conversation });
  } catch (err) {
    fastify.log.warn({ err }, 'Could not broadcast conversation:new');
  }
}
