import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, invites } from '../../db/schema.js';
import { eq, sql, and, isNull } from 'drizzle-orm';

const registerBodySchema = {
  type: 'object',
  required: ['email', 'password', 'username'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8, maxLength: 72 },
    username: { type: 'string', minLength: 2, maxLength: 50 },
    inviteToken: { type: 'string' },
  },
} as const;

export default fp(async (fastify: FastifyInstance) => {
  fastify.post('/auth/register', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour',
        keyGenerator: (request) => request.ip,
      },
    },
    schema: {
      body: registerBodySchema,
    },
  }, async (request, reply) => {
    const { email, password, username, inviteToken } = request.body as {
      email: string;
      password: string;
      username: string;
      inviteToken?: string;
    };

    // Check if first user (auto-admin, no invite needed)
    const [countResult] = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM users`
    );
    const userCount = parseInt(countResult.count, 10);
    const isFirstUser = userCount === 0;

    let invite: typeof invites.$inferSelect | null = null;

    if (!isFirstUser) {
      // Require invite token for all subsequent users
      if (!inviteToken) {
        return reply.code(400).send({ error: 'Invite token is required' });
      }

      const tokenHash = createHash('sha256').update(inviteToken).digest('hex');

      const [foundInvite] = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.token_hash, tokenHash),
            isNull(invites.used_by),
            sql`${invites.expires_at} > NOW()`
          )
        )
        .limit(1);

      if (!foundInvite) {
        return reply.code(400).send({ error: 'Invalid or expired invite token' });
      }

      invite = foundInvite;
    }

    // Check for duplicate email/username
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUsername) {
      return reply.code(409).send({ error: 'Username already taken' });
    }

    // Hash password with Argon2id (OWASP 2025 defaults)
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // Create user (in transaction with invite update)
    await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: email.toLowerCase(),
          username,
          password_hash: passwordHash,
        })
        .returning({ id: users.id });

      // Mark invite as used
      if (invite && newUser) {
        await tx
          .update(invites)
          .set({
            used_by: newUser.id,
            used_at: new Date(),
          })
          .where(eq(invites.id, invite.id));
      }
    });

    return reply.code(201).send({ ok: true });
  });
});
