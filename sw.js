const CACHE_NAME = 'metro-sp-v5'; // Subimos para v5 para forçar a limpeza do cache antigo

const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './mapa_sp.jpg',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Força a nova versão do Service Worker a assumir imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ' + CACHE_NAME + ' aberto com sucesso');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Apagando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Assume o controle das abas abertas sem precisar recarregar a página
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 🚨 PROTEÇÃO: Ignora chamadas de API, Analytics e extensões de navegador
  if (
      url.origin.includes('workers.dev') || 
      url.pathname.includes('/api/') || 
      url.origin.includes('google-analytics.com') ||
      event.request.url.startsWith('chrome-extension') // Ignora extensões para evitar bugs no desktop
  ) {
      return; 
  }

  // NOVA ESTRATÉGIA: Network First (Tenta a rede primeiro, se não tiver, usa o Cache)
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Se a internet funcionou, nós clonamos a resposta nova, atualizamos o cache 
        // silenciosamente por trás e entregamos o arquivo fresco pro usuário.
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Se o fetch falhou (usuário está offline no túnel do metrô), entrega a cópia salva no cache!
        return caches.match(event.request);
      })
  );
});
