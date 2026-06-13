const CACHE_NAME = 'roteirizador-v1';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './script.js'      // se você separar o JS
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
