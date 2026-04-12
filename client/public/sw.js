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

// When user clicks the notification, open or focus the chat
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a window is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes(self.registration.scope)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
