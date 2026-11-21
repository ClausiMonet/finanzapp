/* Service Worker: macht die App komplett offline nutzbar.
   Speichert nur die App-Dateien – niemals deine Finanzdaten (die liegen verschlüsselt in IndexedDB). */
const VERSION = 'finanzapp-v3';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/store.js', 'js/charts.js', 'js/importer.js', 'js/analysis.js', 'js/prices.js', 'js/features.js', 'js/sync.js', 'js/bio.js', 'js/views.js', 'js/views2.js', 'js/dialogs.js', 'js/dialogs2.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./'))); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Kurs-/Sync-Abfragen gehen direkt ans Netz
  // Erst Cache (schnell & offline), im Hintergrund aktualisieren
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});
