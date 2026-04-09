import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import registerRoute from './register.js';
import loginRoute from './login.js';
import refreshRoute from './refresh.js';
import logoutRoute from './logout.js';
import meRoute from './me.js';
import sessionsRoute from './sessions.js';

export default fp(async (fastify: FastifyInstance) => {
  fastify.register(registerRoute);
  fastify.register(loginRoute);
  fastify.register(refreshRoute);
  fastify.register(logoutRoute);
  fastify.register(meRoute);
  fastify.register(sessionsRoute);
});
