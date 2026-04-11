import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  conversations,
  conversation_participants,
  messages,
  message_reactions,
  users,
} from '../../db/schema.js';
import { eq, and, or, lt, desc, sql } from 'drizzle-orm';

export default async function conversationsMessagesRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { id: string };
    Querystring: { before?: string; limit?: string };
  }>('/api/conversations/:id/messages', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          before: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const conversationId = request.params.id;
    const rawLimit = Math.min(parseInt(request.query.limit ?? '50', 10), 50);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : rawLimit;
    const beforeCursor = request.query.before;

    // Verify user is a participant
    const [participant] = await db
      .select({ user_id: conversation_participants.user_id })
      .from(conversation_participants)
      .where(
        and(
          eq(conversation_participants.conversation_id, conversationId),
          eq(conversation_participants.user_id, userId)
        )
      )
      .limit(1);

    if (!participant) {
      return reply.code(403).send({ error: 'Not a participant of this conversation' });
    }

    // Decode cursor: "ISO_TIMESTAMP|uuid"
    let cursorDate: Date | undefined;
    let cursorId: string | undefined;

    if (beforeCursor) {
      const pipeIndex = beforeCursor.indexOf('|');
      if (pipeIndex !== -1) {
        const cursorDateStr = beforeCursor.slice(0, pipeIndex);
        cursorId = beforeCursor.slice(pipeIndex + 1);
        cursorDate = new Date(cursorDateStr);
      }
    }

    // Fetch messages with cursor-based pagination (Pattern 3 from RESEARCH.md)
    // Fetch limit+1 to determine hasMore
    const rawMessages = await db
      .select({
        id: messages.id,
        conversation_id: messages.conversation_id,
        sender_id: messages.sender_id,
        content: messages.content,
        reply_to_id: messages.reply_to_id,
        is_deleted: messages.is_deleted,
        edited_at: messages.edited_at,
        created_at: messages.created_at,
        sender_username: users.username,
        sender_avatar_url: users.avatar_url,
      })
      .from(messages)
      .innerJoin(users, eq(messages.sender_id, users.id))
      .where(
        and(
          eq(messages.conversation_id, conversationId),
          cursorDate && cursorId
            ? or(
                lt(messages.created_at, cursorDate),
                and(
                  eq(messages.created_at, cursorDate),
                  lt(messages.id, cursorId)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(messages.created_at), desc(messages.id))
      .limit(limit + 1);

    const hasMore = rawMessages.length > limit;
    const pageMessages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

    if (pageMessages.length === 0) {
      return reply.send({ messages: [], nextCursor: null, hasMore: false });
    }

    // Next cursor = oldest message in this page (last in DESC order = oldest)
    const oldestMessage = pageMessages[pageMessages.length - 1];
    const nextCursor = hasMore
      ? `${oldestMessage.created_at.toISOString()}|${oldestMessage.id}`
      : null;

    const messageIds = pageMessages.map((m) => m.id);

    // Fetch reactions for these messages
    const reactions = await db
      .select({
        message_id: message_reactions.message_id,
        emoji: message_reactions.emoji,
        user_id: message_reactions.user_id,
        username: users.username,
      })
      .from(message_reactions)
      .innerJoin(users, eq(message_reactions.user_id, users.id))
      .where(
        sql`${message_reactions.message_id} = ANY(ARRAY[${sql.join(
          messageIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )}])`
      );

    // Build reactions map: messageId -> reactions[]
    const reactionsMap = new Map<string, Array<{ emoji: string; user_id: string; username: string }>>();
    for (const r of reactions) {
      const list = reactionsMap.get(r.message_id) ?? [];
      list.push({ emoji: r.emoji, user_id: r.user_id, username: r.username });
      reactionsMap.set(r.message_id, list);
    }

    // Fetch reply_to messages for those that have one
    const replyToIds = pageMessages
      .map((m) => m.reply_to_id)
      .filter((id): id is string => id !== null);

    const replyToMap = new Map<string, { id: string; sender_id: string; content: string | null; sender: { id: string; username: string } }>();

    if (replyToIds.length > 0) {
      const replyMessages = await db
        .select({
          id: messages.id,
          sender_id: messages.sender_id,
          content: messages.content,
          sender_username: users.username,
        })
        .from(messages)
        .innerJoin(users, eq(messages.sender_id, users.id))
        .where(
          sql`${messages.id} = ANY(ARRAY[${sql.join(
            replyToIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )}])`
        );

      for (const rm of replyMessages) {
        replyToMap.set(rm.id, {
          id: rm.id,
          sender_id: rm.sender_id,
          content: rm.content,
          sender: { id: rm.sender_id, username: rm.sender_username },
        });
      }
    }

    // Build response — reverse to oldest-first order (DESC query was newest-first)
    const orderedMessages = [...pageMessages].reverse();

    const responseMessages = orderedMessages.map((m) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      content: m.content,
      reply_to_id: m.reply_to_id,
      is_deleted: m.is_deleted,
      edited_at: m.edited_at ? m.edited_at.toISOString() : null,
      created_at: m.created_at.toISOString(),
      sender: {
        id: m.sender_id,
        username: m.sender_username,
        avatar_url: m.sender_avatar_url,
      },
      reply_to: m.reply_to_id ? (replyToMap.get(m.reply_to_id) ?? null) : null,
      reactions: reactionsMap.get(m.id) ?? [],
    }));

    return reply.send({
      messages: responseMessages,
      nextCursor,
      hasMore,
    });
  });
}
