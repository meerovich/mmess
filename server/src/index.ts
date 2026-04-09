import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { runMigrations } from './db/migrate.js';
import authPlugin from './plugins/auth.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import wsRoutes from './routes/ws/index.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

// Global plugins (order matters: cookie → jwt via authPlugin)
app.register(authPlugin);
app.register(rateLimitPlugin);
// @fastify/websocket must be registered before any route that uses { websocket: true }
app.register(fastifyWebsocket);

// Route plugins
// Note: authRoutes from plan 02-02 will be registered here once complete
app.register(wsRoutes);

app.get('/health', async (_request, _reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    // Run DB migrations before accepting any connections (D-10)
    await runMigrations();

    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? '0.0.0.0';
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
