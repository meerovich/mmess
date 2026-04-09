import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { UAParser } from 'ua-parser-js';
import { db } from '../../db/index.js';
import { users, sessions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const loginBodySchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 1 },
  },
} as const;

function parseUserAgent(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const parser = new UAParser(ua);
  return `${parser.getBrowser().name ?? 'Unknown'} on ${parser.getOS().name ?? 'Unknown'}`;
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        ban: 15,  // ban for 15 minutes after repeated violations (D-22)
        keyGenerator: (request) => request.ip,
      },
    },
    schema: {
      body: loginBodySchema,
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    // Look up user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      // Use constant-time response to prevent user enumeration
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Verify password with Argon2id
    const isValid = await argon2.verify(user.password_hash, password);
    if (!isValid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Issue access token (JWT, 15 min TTL)
    const accessToken = fastify.jwt.sign(
      { sub: user.id, username: user.username },
      { expiresIn: '15m' }
    );

    // Generate opaque refresh token (nanoid 32 = 192-bit entropy)
    const rawRefreshToken = nanoid(32);
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    // Parse user agent for device label
    const userAgentString = request.headers['user-agent'];
    const deviceLabel = parseUserAgent(userAgentString);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Insert session record
    await db.insert(sessions).values({
      user_id: user.id,
      token_hash: tokenHash,
      device_label: deviceLabel,
      user_agent: userAgentString ?? null,
      ip_address: request.ip,
      last_seen_at: now,
      expires_at: expiresAt,
    });

    const isProduction = process.env.NODE_ENV === 'production';

    // Set access_token cookie (short-lived, accessible on all routes)
    reply.setCookie('access_token', accessToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 900, // 15 minutes in seconds
    });

    // Set refresh_token cookie (long-lived, restricted to refresh path)
    reply.setCookie('refresh_token', rawRefreshToken, {
      path: '/api/auth/refresh',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 2592000, // 30 days in seconds
    });

    return { ok: true };
  });
});
