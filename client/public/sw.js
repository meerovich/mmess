// Service Worker for Web Push Notifications
// This file runs in a separate thread and can receive push events even when
// the main page is not open or the screen is locked.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New message', body: event.data.text() };
  }

  const { title = 'mmess', body = '', tag, url, icon } = payload;
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
      data: { url: url || '/' },
      // Require interaction on mobile so the notification stays visible
      requireInteraction: true,
    })
  );
});

// When user clicks the notification, open the specific chat it came from
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const path = event.notification.data?.url || '/';
  // Build absolute URL from SW origin + relative path
  const targetUrl = new URL(path, self.location.origin).href;

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

        await Promise.all(
          sameOriginClients.map(async (client) => {
            client.postMessage({ type: 'mmess:notification-open', url: targetUrl });
            if (typeof client.navigate === 'function') {
              try {
                await client.navigate(targetUrl);
              } catch {
                // Some mobile WebKit builds reject navigate() for background tabs.
              }
            }
          })
        );

        await preferredClient.focus();
        return;
      }
      // No existing window — open a new one pointing directly to the chat
      return self.clients.openWindow(targetUrl);
    })
  );
});
