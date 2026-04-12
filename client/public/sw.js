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

  const { title = 'mmess', body = '', tag, url } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a window with our app is already open, focus it and navigate to the chat
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // No existing window — open a new one pointing directly to the chat
      return self.clients.openWindow(targetUrl);
    })
  );
});
