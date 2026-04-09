import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; username: string };
    user: { sub: string; username: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  // MUST register cookie before jwt (Pitfall A — @fastify/cookie required peer for cookie mode)
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
  });

  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
