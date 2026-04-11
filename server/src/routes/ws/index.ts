import type { FastifyInstance } from 'fastify';
import { register, unregister } from './registry.js';
import { handleMessageSend, handleMessageEdit, handleMessageDelete } from './handlers/message.js';
import { handleReactionAdd, handleReactionRemove } from './handlers/reaction.js';
import { handleTypingStart, handleTypingStop, cleanupTypingForUser } from './handlers/typing.js';
import { handleReadMark } from './handlers/read.js';
import { db } from '../../db/index.js';

// NOT wrapped with fastify-plugin (fp) — keeps this plugin in its own encapsulated
// Fastify scope so the preValidation hook below is scoped to /ws only and does NOT
// affect /health or /auth/* routes.
//
// The `authenticate` decorator is still accessible here because auth.ts registers it
// with fp, which bubbles decorators to the parent scope.
export default async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  // preValidation fires AFTER @fastify/cookie (onRequest) has parsed cookies.
  // reply.code(401).send() here rejects the HTTP upgrade request BEFORE the
  // WebSocket connection is allocated — no socket is created on 401 (PITFALLS #3).
  fastify.addHook('preValidation', async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const userId = request.user.sub;
    const username = request.user.username;

    register(userId, socket);
    fastify.log.info({ userId }, 'WebSocket connection established');

    socket.on('message', async (raw) => {
      let envelope: { type: string; payload: Record<string, unknown>; id?: string };
      try {
        envelope = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }));
        return;
      }

      const { type, payload = {}, id: clientId = '' } = envelope;

      try {
        switch (type) {
          case 'message:send':
            await handleMessageSend(db as any, socket, userId, payload as any, clientId);
            break;
          case 'message:edit':
            await handleMessageEdit(db as any, socket, userId, payload as any, clientId);
            break;
          case 'message:delete':
            await handleMessageDelete(db as any, socket, userId, payload as any, clientId);
            break;
          case 'reaction:add':
            await handleReactionAdd(db as any, socket, userId, payload as any, clientId);
            break;
          case 'reaction:remove':
            await handleReactionRemove(db as any, socket, userId, payload as any, clientId);
            break;
          case 'typing:start':
            await handleTypingStart(userId, username, payload.conversation_id as string, db as any, clientId);
            break;
          case 'typing:stop':
            await handleTypingStop(userId, payload.conversation_id as string, db as any);
            break;
          case 'read:mark':
            await handleReadMark(db as any, socket, userId, payload as any, clientId);
            break;
          default:
            socket.send(JSON.stringify({ type: 'error', payload: { message: `Unknown type: ${type}` }, id: clientId }));
        }
      } catch (err) {
        fastify.log.error({ userId, type, err }, 'WS handler error');
        socket.send(JSON.stringify({ type: 'error', payload: { message: 'Internal error' }, id: clientId }));
      }
    });

    socket.on('close', () => {
      unregister(userId, socket);
      cleanupTypingForUser(userId);
      fastify.log.info({ userId }, 'WebSocket connection closed');
    });

    socket.on('error', (err) => {
      fastify.log.error({ userId, err }, 'WebSocket error');
    });
  });
}
