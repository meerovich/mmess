import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  conversations,
  conversation_participants,
  messages,
  users,
} from '../../db/schema.js';
import { eq, desc, and, gt, isNull, sql } from 'drizzle-orm';

export default async function conversationsListRoutes(fastify: FastifyInstance) {
  fastify.get('/api/conversations', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;

    // Get all conversations where the current user is a participant, ordered by last activity
    const userConversations = await db
      .select({
        conversation: conversations,
        participant: conversation_participants,
      })
      .from(conversation_participants)
      .innerJoin(
        conversations,
        eq(conversation_participants.conversation_id, conversations.id)
      )
      .where(eq(conversation_participants.user_id, userId))
      .orderBy(desc(conversations.updated_at));

    if (userConversations.length === 0) {
      return reply.send([]);
    }

    const conversationIds = userConversations.map((r) => r.conversation.id);

    // Fetch all participants for these conversations (for DM name resolution + avatars)
    const allParticipants = await db
      .select({
        conversation_id: conversation_participants.conversation_id,
        user_id: users.id,
        username: users.username,
        avatar_url: users.avatar_url,
      })
      .from(conversation_participants)
      .innerJoin(users, eq(conversation_participants.user_id, users.id))
      .where(
        sql`${conversation_participants.conversation_id} = ANY(ARRAY[${sql.join(
          conversationIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )}])`
      );

    // Build a map: conversationId -> participants
    const participantsByConv = new Map<string, Array<{ user_id: string; username: string; avatar_url: string | null }>>();
    for (const p of allParticipants) {
      const list = participantsByConv.get(p.conversation_id) ?? [];
      list.push({ user_id: p.user_id, username: p.username, avatar_url: p.avatar_url });
      participantsByConv.set(p.conversation_id, list);
    }

    // Fetch last messages for conversations that have one
    const convWithLastMsg = userConversations
      .filter((r) => r.conversation.last_message_id !== null)
      .map((r) => r.conversation.last_message_id as string);

    let lastMessageMap = new Map<string, { id: string; content: string | null; sender_id: string; created_at: Date }>();

    if (convWithLastMsg.length > 0) {
      const lastMessages = await db
        .select({
          id: messages.id,
          conversation_id: messages.conversation_id,
          content: messages.content,
          sender_id: messages.sender_id,
          created_at: messages.created_at,
        })
        .from(messages)
        .where(
          sql`${messages.id} = ANY(ARRAY[${sql.join(
            convWithLastMsg.map((id) => sql`${id}::uuid`),
            sql`, `
          )}])`
        );

      // Map by conversation_id (last_message_id uniquely identifies one message per conversation)
      for (const msg of lastMessages) {
        lastMessageMap.set(msg.conversation_id, msg);
      }
    }

    // Compute unread counts per conversation
    // For each user-conversation pair: COUNT messages after last_read_message_id
    const unreadCounts = new Map<string, number>();

    for (const row of userConversations) {
      const convId = row.conversation.id;
      const lastReadId = row.participant.last_read_message_id;

      let count: number;

      if (lastReadId === null) {
        // No read record — count all messages in conversation
        const [result] = await db
          .select({ count: sql<string>`COUNT(*)` })
          .from(messages)
          .where(eq(messages.conversation_id, convId));
        count = parseInt(result?.count ?? '0', 10);
      } else {
        // Count messages after last read message (by created_at of the last read message)
        const [lastReadMsg] = await db
          .select({ created_at: messages.created_at })
          .from(messages)
          .where(eq(messages.id, lastReadId))
          .limit(1);

        if (!lastReadMsg) {
          count = 0;
        } else {
          const [result] = await db
            .select({ count: sql<string>`COUNT(*)` })
            .from(messages)
            .where(
              and(
                eq(messages.conversation_id, convId),
                gt(messages.created_at, lastReadMsg.created_at)
              )
            );
          count = parseInt(result?.count ?? '0', 10);
        }
      }

      unreadCounts.set(convId, count);
    }

    // Build response
    const result = userConversations.map((row) => {
      const conv = row.conversation;
      const convParticipants = participantsByConv.get(conv.id) ?? [];
      const otherParticipants = convParticipants.filter((p) => p.user_id !== userId);
      const lastMessage = lastMessageMap.get(conv.id) ?? null;
      const unreadCount = unreadCounts.get(conv.id) ?? 0;

      // For DMs: derive name from the other participant's username
      const displayName =
        conv.type === 'direct' && otherParticipants.length > 0
          ? otherParticipants[0].username
          : (conv.name ?? 'Group');

      return {
        id: conv.id,
        type: conv.type,
        name: displayName,
        avatar_url: conv.avatar_url,
        last_message: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              sender_id: lastMessage.sender_id,
              created_at: lastMessage.created_at.toISOString(),
            }
          : null,
        unread_count: unreadCount,
        participants: convParticipants,
        updated_at: conv.updated_at.toISOString(),
        created_at: conv.created_at.toISOString(),
      };
    });

    return reply.send(result);
  });
}
