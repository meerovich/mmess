import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyRateLimit, {
    global: false, // per-route config; routes opt in with config.rateLimit
    max: 100,
    timeWindow: '1 minute',
  });
});
