/* Copyright (c) 2026 Marina Bay's Cafe. All rights reserved. */
var CACHE = 'mbc-v41';
/* Old page addresses (before the move into folders) and where they are now. Installed apps and bookmarks keep working. */
var LEGACY = {
  "pos.html": "apps/pos/",
  "receipts.html": "apps/receipts/",
  "shift.html": "apps/shift/",
  "inventory.html": "apps/inventory/",
  "recipes.html": "apps/recipes/",
  "menu.html": "apps/menu/",
  "expenses.html": "apps/expenses/",
  "money-counter.html": "apps/money-counter/",
  "calendar.html": "apps/calendar/",
  "analytics.html": "apps/analytics/",
  "checks.html": "apps/checks/",
  "data.html": "apps/data/",
  "settings.html": "apps/settings/",
  "printers.html": "apps/printers/",
  "security.html": "apps/security/",
  "sync.html": "apps/sync/",
  "qr-print.html": "apps/qr-print/",
  "menu-public.html": "apps/public-menu/",
  "tests.html": "tests/"
};
var FILES = [
  './',
  './index.html',
  './apps/home/',
  './apps/money-counter/',
  './apps/expenses/',
  './apps/printers/',
  './apps/pos/',
  './apps/receipts/',
  './shared/js/money.js',
  './shared/js/menu-snapshot.js',
  './apps/public-menu/',
  './apps/qr-print/',
  './apps/qr-print/qrcode.js',
  './shared/js/storage-guard.js',
  './tests/index.html',
  './tests/tests-money.js',
  './apps/menu/',
  './apps/recipes/',
  './apps/inventory/',
  './shared/js/inventory-default.js',
  './shared/css/app.css',
  './shared/css/wide.css',
  './shared/css/brand.css',
  './apps/shift/',
  './apps/calendar/',
  './apps/data/',
  './shared/js/shift-lib.js',
  './shared/js/checks.js',
  './apps/checks/',
  './apps/analytics/',
  './shared/js/guard.js',
  './shared/js/pos-config.js',
  './apps/pos/barcodes.js',
  './shared/js/inv-log.js',
  './apps/settings/',
  './shared/js/app-data.js',
  './shared/js/menu-default.js',
  './shared/js/printer.js',
  './shared/js/security.js',
  './shared/js/cloud.js',
  './shared/js/firebase-config.js',
  './apps/sync/',
  './apps/security/',
  './shared/js/receipt-logo.js',
  './shared/icons/receipt-logo.png',
  './shared/icons/sea.jpg',
  './apps/money-counter/manifest.webmanifest',
  './apps/expenses/manifest.webmanifest',
  './shared/icons/favicon-32.png',
  './shared/icons/logo-64.png',
  './shared/icons/counter-192.png',
  './shared/icons/counter-512.png',
  './shared/icons/counter-apple-touch-icon.png',
  './shared/icons/expenses-192.png',
  './shared/icons/expenses-512.png',
  './shared/icons/expenses-apple-touch-icon.png',
  './apps/home/manifest.webmanifest',
  './shared/icons/app-192.png',
  './shared/icons/app-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Cache first, refreshed in the background. Pages open at once even on a weak connection;
// the newest files are picked up on the next open (and the version number above forces a full refresh).
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u = new URL(e.request.url);
  if (e.request.mode === 'navigate' && u.origin === self.location.origin && u.href.indexOf(self.registration.scope) === 0) {
    var oldPage = u.pathname.slice(new URL(self.registration.scope).pathname.length);
    if (LEGACY[oldPage]) { e.respondWith(Response.redirect(self.registration.scope + LEGACY[oldPage] + u.search, 302)); return; }
  }
  // only handle our own files and the Firebase library files; leave all Firebase network traffic alone
  if (u.origin !== self.location.origin && u.hostname !== 'www.gstatic.com') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (cached) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok) { var copy = res.clone(), key = (u.search && u.origin === self.location.origin) ? u.pathname : e.request; caches.open(CACHE).then(function (c) { c.put(key, copy); }); }
        return res;
      }).catch(function () { return cached || (e.request.mode === 'navigate' ? caches.match('./apps/home/') : Response.error()); });
      if (cached) { e.waitUntil(net.catch(function () {})); return cached; }
      return net;
    })
  );
});
