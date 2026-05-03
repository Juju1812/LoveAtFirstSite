/* Glimpse service worker — handles web push and click-to-open. */

self.addEventListener('install', (event) => {
  // Activate immediately on first install so push works without a reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Glimpse', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Glimpse';
  const body = data.body || '';
  const url = data.url || '/';
  const tag = data.tag || 'glimpse';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // If a Glimpse tab is already open, focus it and navigate.
      for (const c of clientsArr) {
        if ('focus' in c) {
          c.focus();
          if ('navigate' in c) {
            try { c.navigate(targetUrl); } catch (e) { /* cross-origin nav */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
