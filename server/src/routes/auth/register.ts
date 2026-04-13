import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { db } from '../../db/index.js';
import { users, invites } from '../../db/schema.js';
import { eq, sql, and, isNull } from 'drizzle-orm';

const REGISTRATION_MODE = process.env.REGISTRATION_MODE ?? 'open'; // open | invite-only | closed

const PASSWORD_RE = /^(?=.*[a-zA-Zа-яА-ЯёЁ])(?=.*\d).{8,}$/;

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
  // Expose registration mode so the client can adapt UI
  fastify.get('/auth/registration-mode', async () => {
    return { mode: REGISTRATION_MODE };
  });

  fastify.post('/auth/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: (request) => request.ip,
      },
    },
    schema: {
      body: registerBodySchema,
    },
  }, async (request, reply) => {
    // Check if registration is allowed
    if (REGISTRATION_MODE === 'closed') {
      return reply.code(403).send({ error: 'Registration is currently closed' });
    }

    const { email, password, username, inviteToken } = request.body as {
      email: string;
      password: string;
      username: string;
      inviteToken?: string;
    };

    // Password policy: min 8 chars, at least 1 letter + 1 digit
    if (!PASSWORD_RE.test(password)) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters with at least 1 letter and 1 digit' });
    }

    // Check if first user (auto-admin, no invite needed)
    const [countResult] = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM users`
    );
    const userCount = parseInt(countResult.count, 10);
    const isFirstUser = userCount === 0;

    let invite: typeof invites.$inferSelect | null = null;

    if (!isFirstUser && REGISTRATION_MODE === 'invite-only') {
      // Require invite token
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

    // Timing-safe duplicate check: always hash password before responding
    // to prevent timing-based user enumeration.
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // Check duplicates (generic error to avoid enumeration)
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail) {
      return reply.code(409).send({ error: 'Account creation failed. Please check your details and try again.' });
    }

    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUsername) {
      return reply.code(409).send({ error: 'Account creation failed. Please check your details and try again.' });
    }

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
