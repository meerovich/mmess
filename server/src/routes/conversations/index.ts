import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  conversations,
  conversation_participants,
  messages,
  message_reads,
  users,
} from '../../db/schema.js';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';

export default async function conversationsListRoutes(fastify: FastifyInstance) {
  fastify.get('/conversations', {
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
        is_admin: conversation_participants.is_admin,
        can_edit_messages: conversation_participants.can_edit_messages,
        status: conversation_participants.status,
        last_read_message_id: conversation_participants.last_read_message_id,
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
    const participantsByConv = new Map<string, Array<{
      user_id: string;
      username: string;
      avatar_url: string | null;
      is_admin: boolean;
      can_edit_messages: boolean;
      status: string;
      last_read_message_id: string | null;
      last_read_at: string | null;
    }>>();
    for (const p of allParticipants) {
      const list = participantsByConv.get(p.conversation_id) ?? [];
      list.push({
        user_id: p.user_id,
        username: p.username,
        avatar_url: p.avatar_url,
        is_admin: p.is_admin,
        can_edit_messages: p.can_edit_messages,
        status: p.status,
        last_read_message_id: p.last_read_message_id ?? null,
        last_read_at: null,
      });
      participantsByConv.set(p.conversation_id, list);
    }

    // Populate last_read_at: fetch created_at of each participant's last_read_message_id
    const lastReadIds = allParticipants
      .map((p) => p.last_read_message_id)
      .filter((id): id is string => id !== null);

    if (lastReadIds.length > 0) {
      const lastReadMsgs = await db
        .select({ id: messages.id, created_at: messages.created_at })
        .from(messages)
        .where(
          sql`${messages.id} = ANY(ARRAY[${sql.join(
            lastReadIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )}])`
        );

      const msgCreatedAtMap = new Map<string, Date>(lastReadMsgs.map((m) => [m.id, m.created_at]));

      for (const [, participants] of participantsByConv.entries()) {
        for (const p of participants) {
          if (p.last_read_message_id) {
            const createdAt = msgCreatedAtMap.get(p.last_read_message_id);
            if (createdAt) {
              p.last_read_at = createdAt.toISOString();
            }
          }
        }
      }
    }

    // Fetch last messages for conversations that have one
    const convWithLastMsg = userConversations
      .filter((r) => r.conversation.last_message_id !== null)
      .map((r) => r.conversation.last_message_id as string);

    let lastMessageMap = new Map<string, { id: string; content: string | null; sender_id: string; created_at: Date }>();
    let pinnedMessageMap = new Map<string, {
      id: string;
      content: string | null;
      sender_id: string;
      created_at: Date;
      sender_username: string;
    }>();

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

    const convWithPinnedMsg = userConversations
      .filter((r) => r.conversation.pinned_message_id !== null)
      .map((r) => ({ conversation_id: r.conversation.id, message_id: r.conversation.pinned_message_id as string }));

    if (convWithPinnedMsg.length > 0) {
      const pinnedMessages = await db
        .select({
          id: messages.id,
          conversation_id: messages.conversation_id,
          content: messages.content,
          sender_id: messages.sender_id,
          created_at: messages.created_at,
          sender_username: users.username,
        })
        .from(messages)
        .innerJoin(users, eq(messages.sender_id, users.id))
        .where(
          sql`${messages.id} = ANY(ARRAY[${sql.join(
            convWithPinnedMsg.map((entry) => sql`${entry.message_id}::uuid`),
            sql`, `
          )}])`
        );

      for (const msg of pinnedMessages) {
        pinnedMessageMap.set(msg.conversation_id, msg);
      }
    }

    // Compute unread counts from message_reads, which is the canonical read
    // ledger. This avoids cursor edge-cases and keeps counts correct even when
    // multiple messages share the same timestamp.
    const unreadCounts = new Map<string, number>();

    for (const row of userConversations) {
      const convId = row.conversation.id;
      const myUserId = userId;
      const [result] = await db
        .select({ count: sql<string>`COUNT(*)` })
        .from(messages)
        .leftJoin(
          message_reads,
          and(
            eq(message_reads.message_id, messages.id),
            eq(message_reads.user_id, myUserId)
          )
        )
        .where(
          and(
            eq(messages.conversation_id, convId),
            sql`${messages.sender_id} != ${myUserId}::uuid`,
            isNull(message_reads.message_id)
          )
        );
      const count = parseInt(result?.count ?? '0', 10);

      unreadCounts.set(convId, count);
    }

    // Build response
    const result = userConversations.map((row) => {
      const conv = row.conversation;
      const convParticipants = participantsByConv.get(conv.id) ?? [];
      const otherParticipants = convParticipants.filter((p) => p.user_id !== userId);
      const lastMessage = lastMessageMap.get(conv.id) ?? null;
      const pinnedMessage = pinnedMessageMap.get(conv.id) ?? null;
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
        pinned_message: pinnedMessage
          ? {
              id: pinnedMessage.id,
              content: pinnedMessage.content,
              sender_id: pinnedMessage.sender_id,
              created_at: pinnedMessage.created_at.toISOString(),
              sender: {
                id: pinnedMessage.sender_id,
                username: pinnedMessage.sender_username,
              },
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
