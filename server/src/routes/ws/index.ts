import type { FastifyInstance } from 'fastify';

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

    fastify.log.info({ userId }, 'WebSocket connection established');

    // Placeholder handlers — Phase 3 will implement full message routing
    socket.on('message', (_data) => {
      // Echo for smoke-testing auth; Phase 3 replaces this
      socket.send(JSON.stringify({ type: 'connected', userId }));
    });

    socket.on('close', () => {
      fastify.log.info({ userId }, 'WebSocket connection closed');
    });

    socket.on('error', (err) => {
      fastify.log.error({ userId, err }, 'WebSocket error');
    });
  });
}
