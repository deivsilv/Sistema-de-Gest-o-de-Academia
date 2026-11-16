// Somente arquivos estáticos conhecidos entram neste cache. Auth, REST,
// Storage, páginas autenticadas e comprovantes não têm fallback de cache.
const CACHE_NAME = '__STEAKUP_CACHE_NAME__';
const STATIC_FILES = __STEAKUP_STATIC_FILES__;
const STATIC_URLS = new Set(STATIC_FILES.map(path => new URL(path, self.location.origin).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_FILES);
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('steakup-static-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Uma atualização só assume o controle quando a pessoa confirma na interface.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match('/offline.html') || Response.error();
    }));
    return;
  }
  if (STATIC_URLS.has(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(request) || fetch(request);
    })());
  }
});
