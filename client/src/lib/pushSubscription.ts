import { apiFetch } from './api';

/**
 * Register the Service Worker and subscribe to Web Push notifications.
 * Called once after the user logs in. Idempotent — safe to call multiple times.
 *
 * Flow:
 * 1. Register /sw.js Service Worker
 * 2. Fetch VAPID public key from server
 * 3. Subscribe to push via the Push API (browser prompts for permission)
 * 4. Send the subscription to the server for storage
 */
export async function registerPushSubscription(): Promise<void> {
  // Guard: Service Worker + Push API must be available
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] Not supported in this browser');
    return;
  }

  try {
    // 1. Register Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    void registration.update().catch(() => undefined);
    await navigator.serviceWorker.ready;

    // 2. Check if already subscribed
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — make sure server has the subscription
      await sendSubscriptionToServer(existing);
      return;
    }

    // 3. Fetch VAPID public key from server
    const vapidRes = await apiFetch('/api/push/vapid-key');
    if (!vapidRes.ok) {
      console.log('[Push] Server does not support push notifications');
      return;
    }
    const { publicKey } = await vapidRes.json() as { publicKey: string };
    if (!publicKey) return;

    // 4. Subscribe (browser will prompt for permission if not already granted)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    // 5. Send to server
    await sendSubscriptionToServer(subscription);
    console.log('[Push] Subscribed successfully');
  } catch (err) {
    console.warn('[Push] Registration failed:', err);
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
