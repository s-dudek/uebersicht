// Speichert die App-Dateien, damit sie auch bei schlechtem Netz schnell startet.
// Bei jeder neuen Version die Nummer erhöhen.
const CACHE = 'uebersicht-v16';
const FILES = [
  './', 'index.html', 'style.css', 'config.js', 'manifest.json',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'js/actions.js',
  'js/auth.js',
  'js/calendar.js',
  'js/categories.js',
  'js/control.js',
  'js/core.js',
  'js/data.js',
  'js/dates.js',
  'js/drag.js',
  'js/events.js',
  'js/folders.js',
  'js/groups.js',
  'js/home.js',
  'js/icons.js',
  'js/items.js',
  'js/main.js',
  'js/meals.js',
  'js/menu.js',
  'js/nav.js',
  'js/notes.js',
  'js/panels.js',
  'js/pins.js',
  'js/reminders.js',
  'js/render.js',
  'js/sheet.js',
  'js/todos.js',
  'js/vendor/supabase.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eigene Dateien: zuerst Netz (immer aktuell), sonst Cache. Supabase-Anfragen nie cachen.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {   // nur erfolgreiche Antworten merken
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
    );
  }
});

// Tippen auf eine Erinnerung öffnet die App
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((x) => 'focus' in x);
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});

// Push-Mitteilung vom Server (Erinnerungen)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Erinnerung', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Erinnerung', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag,
    data: d,
  }));
});
