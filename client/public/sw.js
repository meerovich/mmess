// Service Worker for Web Push Notifications
// This file runs in a separate thread and can receive push events even when
// the main page is not open or the screen is locked.
const NOTIFICATION_CONVERSATION_PARAM = 'mmessPushConversation';
const NOTIFICATION_MESSAGE_PARAM = 'mmessPushMessage';
const NOTIFICATION_TARGET_CACHE = 'mmess-notification-target-v1';
const NOTIFICATION_TARGET_ENDPOINT = '/__mmess_notification_target';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function rememberNotificationTarget(target) {
  const cache = await caches.open(NOTIFICATION_TARGET_CACHE);
  await cache.put(
    NOTIFICATION_TARGET_ENDPOINT,
    new Response(JSON.stringify(target), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  );
}

async function clearNotificationTarget() {
  const cache = await caches.open(NOTIFICATION_TARGET_CACHE);
  await cache.delete(NOTIFICATION_TARGET_ENDPOINT);
}

async function rememberNotificationTargetOnServer(target) {
  try {
    await fetch('/api/push/open-target', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(target),
    });
  } catch {
    // Best effort: the Cache API fallback still exists for browsers where the
    // SW click can persist data locally but background auth fetch fails.
  }
}

function postNotificationTarget(client, payload) {
  try {
    client?.postMessage(payload);
  } catch {
    // Some iOS WebKit builds can reject postMessage for a just-opened client.
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname !== NOTIFICATION_TARGET_ENDPOINT) return;

  event.respondWith(
    caches.open(NOTIFICATION_TARGET_CACHE)
      .then(cache => cache.match(NOTIFICATION_TARGET_ENDPOINT))
      .then(response => response || new Response('', { status: 204 }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'mmess:clear-notification-target') {
    event.waitUntil(clearNotificationTarget());
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New message', body: event.data.text() };
  }

  const {
    title = 'mmess',
    body = '',
    tag,
    url,
    icon,
    conversation_id,
    message_id,
  } = payload;
  // Resolve icon to absolute URL — relative paths don't work in push notifications
  const iconUrl = icon
    ? new URL(icon, self.location.origin).href
    : new URL('/favicon.ico', self.location.origin).href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconUrl,
      badge: new URL('/favicon.ico', self.location.origin).href,
      tag: tag || undefined, // dedup per conversation
      data: {
        url: url || '/',
        conversationId: conversation_id || undefined,
        messageId: message_id || undefined,
      },
      // Require interaction on mobile so the notification stays visible
      requireInteraction: true,
    })
  );
});

// When user clicks the notification, open the specific chat it came from
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const path = event.notification.data?.url || '/';
  const conversationId = event.notification.data?.conversationId;
  const messageId = event.notification.data?.messageId;
  // Build absolute URL from SW origin + relative path. Include the target ids
  // in the URL as well so newly opened iOS standalone windows can recover the
  // destination even when there is no already-running client to postMessage.
  const targetUrl = new URL(path, self.location.origin);
  if (conversationId && !targetUrl.pathname.startsWith('/chat/')) {
    targetUrl.pathname = `/chat/${conversationId}`;
  }
  if (conversationId) {
    targetUrl.searchParams.set(NOTIFICATION_CONVERSATION_PARAM, conversationId);
  }
  if (messageId) {
    targetUrl.searchParams.set(NOTIFICATION_MESSAGE_PARAM, messageId);
  }
  const rememberedTarget = {
    path: conversationId ? `/chat/${conversationId}` : `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
    conversationId,
    messageId,
    replace: true,
  };
  const messagePayload = {
    type: 'mmess:notification-open',
    url: targetUrl.href,
    conversationId,
    messageId,
    replace: true,
  };

  event.waitUntil(
    Promise.all([
      rememberNotificationTarget(rememberedTarget),
      rememberNotificationTargetOnServer(rememberedTarget),
    ]).then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true })).then(async (clients) => {
      const sameOriginClients = clients.filter(
        client => new URL(client.url).origin === self.location.origin
      );

      if (sameOriginClients.length > 0) {
        const preferredClient =
          sameOriginClients.find(client => {
            const pathname = new URL(client.url).pathname;
            return pathname === '/' || pathname.startsWith('/chat/');
          }) ?? sameOriginClients[0];

        if (typeof preferredClient.navigate === 'function') {
          try {
            const navigatedClient = await preferredClient.navigate(targetUrl.href);
            postNotificationTarget(navigatedClient ?? preferredClient, messagePayload);
            try {
              await (navigatedClient ?? preferredClient).focus();
            } catch {
              // Navigation already happened; focusing is best-effort on iOS.
            }
            return;
          } catch {
            // Some mobile WebKit builds reject navigate() for background tabs.
          }
        }

        // Fallback for mobile WebKit builds where client.navigate() is absent
        // or rejected: tell the running app to persist the target and route.
        postNotificationTarget(preferredClient, messagePayload);
        try {
          await preferredClient.focus();
          return;
        } catch {
          const openedClient = await self.clients.openWindow(targetUrl.href);
          postNotificationTarget(openedClient, messagePayload);
          return openedClient;
        }
      }
      // No existing window — open a new one pointing directly to the chat
      const openedClient = await self.clients.openWindow(targetUrl.href);
      postNotificationTarget(openedClient, messagePayload);
      return openedClient;
    })
  );
});
