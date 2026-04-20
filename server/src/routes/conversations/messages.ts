import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  conversations,
  conversation_participants,
  messages,
  message_deliveries,
  message_reads,
  message_reactions,
  users,
  files,
} from '../../db/schema.js';
import { eq, and, or, lt, desc, sql } from 'drizzle-orm';

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export default async function conversationsMessagesRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { id: string };
    Querystring: { before?: string; limit?: string };
  }>('/conversations/:id/messages', {
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
        forwarded_from_id: messages.forwarded_from_id,
        is_deleted: messages.is_deleted,
        edited_at: messages.edited_at,
        created_at: messages.created_at,
        sender_username: users.username,
        sender_avatar_url: users.avatar_url,
        file_id: messages.file_id,
        file_original_name: files.original_name,
        file_mimetype: files.mimetype,
        file_size_bytes: files.size_bytes,
        file_thumbnail_path: files.thumbnail_path,
      })
      .from(messages)
      .innerJoin(users, eq(messages.sender_id, users.id))
      .leftJoin(files, eq(messages.file_id, files.id))
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

    const deliveredResult = await db.execute(sql`
      INSERT INTO message_deliveries (message_id, user_id, delivered_at)
      SELECT id, ${userId}::uuid, NOW()
      FROM messages
      WHERE id = ANY(ARRAY[${sql.join(
        messageIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )}])
        AND sender_id != ${userId}::uuid
      ON CONFLICT DO NOTHING
      RETURNING message_id, delivered_at
    `);
    const newlyDelivered = Array.from(deliveredResult as unknown as Array<{ message_id: string; delivered_at: Date | string }>);
    if (newlyDelivered.length > 0) {
      const participantRows = await db
        .select({ user_id: conversation_participants.user_id })
        .from(conversation_participants)
        .where(eq(conversation_participants.conversation_id, conversationId));
      const { broadcast } = await import('../ws/registry.js');
      broadcast(participantRows.map(row => row.user_id), {
        type: 'messages:delivered',
        payload: {
          conversation_id: conversationId,
          user_id: userId,
          deliveries: newlyDelivered.map(row => ({
            message_id: row.message_id,
            delivered_at: toIsoTimestamp(row.delivered_at),
          })),
        },
      });
    }

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

    const deliveries = await db
      .select({
        message_id: message_deliveries.message_id,
        user_id: message_deliveries.user_id,
        username: users.username,
        delivered_at: message_deliveries.delivered_at,
      })
      .from(message_deliveries)
      .innerJoin(users, eq(message_deliveries.user_id, users.id))
      .where(
        sql`${message_deliveries.message_id} = ANY(ARRAY[${sql.join(
          messageIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )}])`
      );

    const deliveriesMap = new Map<string, Array<{ user_id: string; username: string; delivered_at: string }>>();
    for (const delivery of deliveries) {
      const list = deliveriesMap.get(delivery.message_id) ?? [];
      list.push({
        user_id: delivery.user_id,
        username: delivery.username,
        delivered_at: delivery.delivered_at.toISOString(),
      });
      deliveriesMap.set(delivery.message_id, list);
    }

    const reads = await db
      .select({
        message_id: message_reads.message_id,
        user_id: message_reads.user_id,
        username: users.username,
        read_at: message_reads.read_at,
      })
      .from(message_reads)
      .innerJoin(users, eq(message_reads.user_id, users.id))
      .where(
        sql`${message_reads.message_id} = ANY(ARRAY[${sql.join(
          messageIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )}])`
      );

    const readsMap = new Map<string, Array<{ user_id: string; username: string; read_at: string }>>();
    for (const read of reads) {
      const list = readsMap.get(read.message_id) ?? [];
      list.push({
        user_id: read.user_id,
        username: read.username,
        read_at: read.read_at.toISOString(),
      });
      readsMap.set(read.message_id, list);
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

    // Fetch forwarded_from messages (original sender info)
    const forwardedFromIds = pageMessages
      .map((m) => m.forwarded_from_id)
      .filter((id): id is string => id !== null);

    const forwardedFromMap = new Map<string, { id: string; sender: { id: string; username: string }; content_preview: string | null }>();

    if (forwardedFromIds.length > 0) {
      const forwardedMessages = await db
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
            forwardedFromIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )}])`
        );

      for (const fm of forwardedMessages) {
        forwardedFromMap.set(fm.id, {
          id: fm.id,
          sender: { id: fm.sender_id, username: fm.sender_username },
          content_preview: fm.content?.slice(0, 100) ?? null,
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
      forwarded_from_id: m.forwarded_from_id ?? null,
      forwarded_from: m.forwarded_from_id ? (forwardedFromMap.get(m.forwarded_from_id) ?? null) : null,
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
      deliveries: deliveriesMap.get(m.id) ?? [],
      reads: readsMap.get(m.id) ?? [],
      file_id: m.file_id ?? null,
      file_name: m.file_original_name ?? null,
      file_mime: m.file_mimetype ?? null,
      file_size: m.file_size_bytes ?? null,
      is_image: m.file_mimetype ? m.file_mimetype.startsWith('image/') : null,
      thumbnail_url: m.file_thumbnail_path && m.file_id
        ? `/api/files/${m.file_id}/thumb`
        : null,
    }));

    return reply.send({
      messages: responseMessages,
      nextCursor,
      hasMore,
    });
  });
}
