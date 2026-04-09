#!/usr/bin/env node
/**
 * Admin invite generation script.
 * Usage: npm run invite
 *
 * Generates a one-time invite token and inserts it into the invites table.
 * The token is printed to stdout and should be shared with the new user.
 * The new user includes it as `inviteToken` in their POST /auth/register body.
 */

import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

async function generateInvite(): Promise<void> {
  try {
    // Find the first (admin) user
    const [adminUser] = await db.execute<{ id: string }>(
      sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`
    );

    if (!adminUser) {
      console.error(
        'Error: No users found in database. Register the first (admin) user before generating invites.'
      );
      process.exit(1);
    }

    const adminId = adminUser.id;

    // Generate cryptographically secure opaque token
    const rawToken = nanoid(32);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // 7-day expiry (D-06)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(schema.invites).values({
      token_hash: tokenHash,
      created_by: adminId,
      expires_at: expiresAt,
    });

    console.log('\nInvite token (share with the new user):');
    console.log(rawToken);
    console.log(`\nExpires: ${expiresAt.toISOString()}`);
    console.log(
      '\nThe new user should include this token as "inviteToken" in their POST /auth/register request.'
    );
  } finally {
    await client.end();
  }
}

generateInvite().catch((err) => {
  console.error('Failed to generate invite:', err);
  process.exit(1);
});
