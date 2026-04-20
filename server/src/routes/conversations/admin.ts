import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { conversations, conversation_participants, messages, users } from '../../db/schema.js';
import { eq, ne, and, sql } from 'drizzle-orm';
import { broadcast } from '../ws/registry.js';

/**
 * Fetch full conversation object (same shape as create.ts fetchConversation).
 * Returns null if conversation does not exist.
 */
async function fetchConversation(conversationId: string, requestingUserId: string) {
  const rows = await db.select().from(conversations)
    .where(eq(conversations.id, conversationId)).limit(1);
  if (!rows.length) return null;
  const conv = rows[0];

  const participants = await db.select({
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
    .where(eq(conversation_participants.conversation_id, conversationId));

  const otherParticipants = participants.filter(p => p.user_id !== requestingUserId);
  const displayName =
    conv.type === 'direct' && otherParticipants.length > 0
      ? otherParticipants[0].username
      : conv.name ?? 'Group';

  let lastMessage = null;
  if (conv.last_message_id) {
    const [msg] = await db.select({
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
    participants: participants.map(p => ({
      user_id: p.user_id,
      username: p.username,
      avatar_url: p.avatar_url,
      is_admin: p.is_admin,
      can_edit_messages: p.can_edit_messages,
      status: p.status,
      last_read_message_id: p.last_read_message_id,
    })),
    updated_at: conv.updated_at.toISOString(),
    created_at: conv.created_at.toISOString(),
  };
}

/**
 * Check that userId is a participant of conversationId.
 * Returns the participant row or null.
 */
async function getParticipant(conversationId: string, userId: string) {
  const [row] = await db.select()
    .from(conversation_participants)
    .where(
      and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.user_id, userId)
      )
    ).limit(1);
  return row ?? null;
}

export default async function conversationsAdminRoutes(fastify: FastifyInstance) {

  // PATCH /conversations/:id — update group name/avatar (admin-only) (D-09)
  // Note: Caddy strips /api prefix before proxying — backend paths are unprefixed
  fastify.patch<{ Params: { id: string }; Body: { name?: string; avatar_url?: string | null } }>(
    '/conversations/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            avatar_url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id: conversationId } = request.params;
      const { name, avatar_url } = request.body;

      const participant = await getParticipant(conversationId, userId);
      if (!participant) return reply.code(403).send({ error: 'Not a participant' });
      if (!participant.is_admin) return reply.code(403).send({ error: 'Admin only' });

      const updatePayload: { name?: string; avatar_url?: string | null; updated_at: Date } = { updated_at: new Date() };
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return reply.code(400).send({ error: 'name is required' });
        updatePayload.name = trimmed;
      }
      if (avatar_url !== undefined) {
        updatePayload.avatar_url = avatar_url;
      }
      if (updatePayload.name === undefined && updatePayload.avatar_url === undefined) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      await db.update(conversations)
        .set(updatePayload)
        .where(eq(conversations.id, conversationId));

      const conversation = await fetchConversation(conversationId, userId);
      if (!conversation) return reply.code(404).send({ error: 'Not found' });

      const participantIds = conversation.participants.map(p => p.user_id);
      broadcast(participantIds, { type: 'conversation:updated', payload: { conversation } });

      return reply.send(conversation);
    }
  );

  // POST /conversations/:id/participants — add members (admin-only) (D-10)
  fastify.post<{ Params: { id: string }; Body: { user_ids: string[] } }>(
    '/conversations/:id/participants',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['user_ids'],
          properties: {
            user_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id: conversationId } = request.params;
      const { user_ids } = request.body;

      const participant = await getParticipant(conversationId, userId);
      if (!participant) return reply.code(403).send({ error: 'Not a participant' });
      if (!participant.is_admin) return reply.code(403).send({ error: 'Admin only' });

      // Check for existing members
      const existing = await db.select({ user_id: conversation_participants.user_id })
        .from(conversation_participants)
        .where(eq(conversation_participants.conversation_id, conversationId));
      const existingIds = new Set(existing.map(r => r.user_id));

      const duplicates = user_ids.filter(uid => existingIds.has(uid));
      if (duplicates.length > 0) {
        return reply.code(409).send({ error: 'Some users are already members', duplicates });
      }

      await db.insert(conversation_participants).values(
        user_ids.map(uid => ({
          conversation_id: conversationId,
          user_id: uid,
          is_admin: false,
          can_edit_messages: false,
        }))
      );

      // Touch updated_at so sidebar re-sorts
      await db.update(conversations)
        .set({ updated_at: new Date() })
        .where(eq(conversations.id, conversationId));

      const conversation = await fetchConversation(conversationId, userId);
      if (!conversation) return reply.code(404).send({ error: 'Not found' });

      const allParticipantIds = conversation.participants.map(p => p.user_id);
      broadcast(allParticipantIds, { type: 'conversation:updated', payload: { conversation } });

      return reply.send(conversation);
    }
  );

  // DELETE /conversations/:id/participants/:user_id — kick (admin-only) (D-11)
  fastify.delete<{ Params: { id: string; user_id: string } }>(
    '/conversations/:id/participants/:user_id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id', 'user_id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id: conversationId, user_id: targetUserId } = request.params;

      const participant = await getParticipant(conversationId, userId);
      if (!participant) return reply.code(403).send({ error: 'Not a participant' });
      if (!participant.is_admin) return reply.code(403).send({ error: 'Admin only' });

      // Cannot remove yourself if you are the only admin
      if (targetUserId === userId) {
        const adminCount = await db.select({ count: sql<string>`COUNT(*)` })
          .from(conversation_participants)
          .where(
            and(
              eq(conversation_participants.conversation_id, conversationId),
              eq(conversation_participants.is_admin, true)
            )
          );
        if (parseInt(adminCount[0]?.count ?? '0', 10) <= 1) {
          return reply.code(403).send({ error: 'Cannot remove yourself as the only admin' });
        }
      }

      // Fetch current participants before removal (for broadcast to remaining only)
      const beforeRemoval = await db.select({ user_id: conversation_participants.user_id })
        .from(conversation_participants)
        .where(eq(conversation_participants.conversation_id, conversationId));
      const remainingIds = beforeRemoval
        .map(r => r.user_id)
        .filter(uid => uid !== targetUserId);

      await db.delete(conversation_participants).where(
        and(
          eq(conversation_participants.conversation_id, conversationId),
          eq(conversation_participants.user_id, targetUserId)
        )
      );

      await db.update(conversations)
        .set({ updated_at: new Date() })
        .where(eq(conversations.id, conversationId));

      // Broadcast to remaining participants and explicitly remove the chat for the kicked user.
      const conversation = await fetchConversation(conversationId, userId);
      if (conversation) {
        broadcast(remainingIds, { type: 'conversation:updated', payload: { conversation } });
      }
      broadcast([targetUserId], { type: 'conversation:removed', payload: { conversation_id: conversationId } });

      return reply.code(204).send();
    }
  );

  // PATCH /conversations/:id/participants/:user_id — update permissions (admin-only) (D-12)
  fastify.patch<{
    Params: { id: string; user_id: string };
    Body: { can_edit_messages?: boolean };
  }>(
    '/conversations/:id/participants/:user_id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id', 'user_id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: { can_edit_messages: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id: conversationId, user_id: targetUserId } = request.params;
      const { can_edit_messages } = request.body;

      const participant = await getParticipant(conversationId, userId);
      if (!participant) return reply.code(403).send({ error: 'Not a participant' });
      if (!participant.is_admin) return reply.code(403).send({ error: 'Admin only' });

      if (can_edit_messages === undefined) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      await db.update(conversation_participants)
        .set({ can_edit_messages })
        .where(
          and(
            eq(conversation_participants.conversation_id, conversationId),
            eq(conversation_participants.user_id, targetUserId)
          )
        );

      const conversation = await fetchConversation(conversationId, userId);
      if (!conversation) return reply.code(404).send({ error: 'Not found' });

      const participantIds = conversation.participants.map(p => p.user_id);
      broadcast(participantIds, { type: 'conversation:updated', payload: { conversation } });

      return reply.send({ user_id: targetUserId, can_edit_messages });
    }
  );

  // DELETE /conversations/:id/me — leave group (D-13)
  fastify.delete<{ Params: { id: string } }>(
    '/conversations/:id/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { id: conversationId } = request.params;

      const participant = await getParticipant(conversationId, userId);
      if (!participant) return reply.code(403).send({ error: 'Not a participant' });

      // Fetch all participants before leaving
      const allParticipants = await db.select({ user_id: conversation_participants.user_id })
        .from(conversation_participants)
        .where(eq(conversation_participants.conversation_id, conversationId));

      const remainingIds = allParticipants
        .map(r => r.user_id)
        .filter(uid => uid !== userId);

      if (remainingIds.length === 0) {
        // Last participant — hard-delete the conversation (CASCADE handles messages, participants, reactions, reads)
        await db.delete(conversations).where(eq(conversations.id, conversationId));
        broadcast([userId], { type: 'conversation:removed', payload: { conversation_id: conversationId } });
        return reply.code(204).send();
      }

      if (participant.is_admin) {
        const remainingAdmins = await db.select({ user_id: conversation_participants.user_id })
          .from(conversation_participants)
          .where(
            and(
              eq(conversation_participants.conversation_id, conversationId),
              eq(conversation_participants.is_admin, true),
              ne(conversation_participants.user_id, userId)
            )
          );

        if (remainingAdmins.length === 0) {
          await db.update(conversation_participants)
            .set({ is_admin: true, can_edit_messages: true })
            .where(
              and(
                eq(conversation_participants.conversation_id, conversationId),
                eq(conversation_participants.user_id, remainingIds[0])
              )
            );
        }
      }

      // Remove this participant
      await db.delete(conversation_participants).where(
        and(
          eq(conversation_participants.conversation_id, conversationId),
          eq(conversation_participants.user_id, userId)
        )
      );

      await db.update(conversations)
        .set({ updated_at: new Date() })
        .where(eq(conversations.id, conversationId));

      // Broadcast to remaining participants (not the user who left)
      const conversation = await fetchConversation(conversationId, remainingIds[0]);
      if (conversation) {
        broadcast(remainingIds, { type: 'conversation:updated', payload: { conversation } });
      }
      broadcast([userId], { type: 'conversation:removed', payload: { conversation_id: conversationId } });

      return reply.code(204).send();
    }
  );
}
