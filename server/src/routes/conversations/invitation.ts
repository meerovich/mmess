import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { conversation_participants } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { broadcast } from '../ws/registry.js';

export default async function invitationRoutes(fastify: FastifyInstance) {
  // Accept a DM invitation
  fastify.post<{ Params: { id: string } }>('/conversations/:id/accept', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const conversationId = request.params.id;

    const [participant] = await db
      .select({ status: conversation_participants.status })
      .from(conversation_participants)
      .where(and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.user_id, userId),
      ))
      .limit(1);

    if (!participant) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    if (participant.status !== 'pending') {
      return reply.code(400).send({ error: 'No pending invitation' });
    }

    await db.update(conversation_participants)
      .set({ status: 'accepted' })
      .where(and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.user_id, userId),
      ));

    // Get all participant IDs for broadcast
    const allParticipants = await db
      .select({ user_id: conversation_participants.user_id })
      .from(conversation_participants)
      .where(eq(conversation_participants.conversation_id, conversationId));

    broadcast(
      allParticipants.map(p => p.user_id),
      {
        type: 'invitation:accepted',
        payload: { conversation_id: conversationId, user_id: userId },
      }
    );

    return reply.send({ ok: true });
  });

  // Decline a DM invitation
  fastify.post<{ Params: { id: string } }>('/conversations/:id/decline', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const conversationId = request.params.id;

    const [participant] = await db
      .select({ status: conversation_participants.status })
      .from(conversation_participants)
      .where(and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.user_id, userId),
      ))
      .limit(1);

    if (!participant) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }

    if (participant.status !== 'pending') {
      return reply.code(400).send({ error: 'No pending invitation' });
    }

    await db.update(conversation_participants)
      .set({ status: 'declined' })
      .where(and(
        eq(conversation_participants.conversation_id, conversationId),
        eq(conversation_participants.user_id, userId),
      ));

    // Broadcast so creator sees the decline
    const allParticipants = await db
      .select({ user_id: conversation_participants.user_id })
      .from(conversation_participants)
      .where(eq(conversation_participants.conversation_id, conversationId));

    broadcast(
      allParticipants.map(p => p.user_id),
      {
        type: 'invitation:declined',
        payload: { conversation_id: conversationId, user_id: userId },
      }
    );

    return reply.send({ ok: true });
  });
}
