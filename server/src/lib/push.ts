import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { push_subscriptions } from '../db/schema.js';

type DB = PostgresJsDatabase<Record<string, never>>;

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@chatboris.mooo.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC && VAPID_PRIVATE);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC;
}

/**
 * Send a push notification to all subscriptions for a given user.
 * Silently removes expired/invalid subscriptions (410 Gone).
 */
export async function sendPushToUser(
  db: DB,
  userId: string,
  payload: { title: string; body: string; tag?: string; url?: string; icon?: string }
): Promise<void> {
  if (!isPushConfigured()) return;

  const subs = await db
    .select()
    .from(push_subscriptions)
    .where(eq(push_subscriptions.user_id, userId));

  if (subs.length === 0) return;

  const jsonPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
        { TTL: 60 * 60 } // 1 hour TTL
      )
    )
  );

  // Clean up expired subscriptions (410 Gone or 404)
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await db.delete(push_subscriptions)
          .where(eq(push_subscriptions.id, subs[i].id));
      }
    }
  }
}
