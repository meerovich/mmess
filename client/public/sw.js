// Service Worker for Web Push Notifications
// This file runs in a separate thread and can receive push events even when
// the main page is not open or the screen is locked.
const NOTIFICATION_CONVERSATION_PARAM = 'mmessPushConversation';
const NOTIFICATION_MESSAGE_PARAM = 'mmessPushMessage';

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
  if (conversationId) {
    targetUrl.searchParams.set(NOTIFICATION_CONVERSATION_PARAM, conversationId);
  }
  if (messageId) {
    targetUrl.searchParams.set(NOTIFICATION_MESSAGE_PARAM, messageId);
  }
  const messagePayload = {
    type: 'mmess:notification-open',
    url: targetUrl.href,
    conversationId,
    messageId,
    replace: true,
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const sameOriginClients = clients.filter(
        client => new URL(client.url).origin === self.location.origin
      );

      if (sameOriginClients.length > 0) {
        const preferredClient =
          sameOriginClients.find(client => {
            const pathname = new URL(client.url).pathname;
            return pathname === '/' || pathname.startsWith('/chat/');
          }) ?? sameOriginClients[0];

        preferredClient.postMessage(messagePayload);
        try {
          await preferredClient.focus();
        } catch {
          // Keep going — navigate/openWindow below is still useful.
        }

        if (typeof preferredClient.navigate === 'function') {
          try {
            await preferredClient.navigate(targetUrl.href);
            return;
          } catch {
            // Some mobile WebKit builds reject navigate() for background tabs.
          }
        }

        return self.clients.openWindow(targetUrl.href);
      }
      // No existing window — open a new one pointing directly to the chat
      return self.clients.openWindow(targetUrl.href);
    })
  );
});
