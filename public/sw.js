// sw.js - Service Worker для PWA и офлайн режима

const CACHE_NAME = 'virusgift-v3';
const API_CACHE_NAME = 'virusgift-api-v3';
const STATIC_CACHE_NAME = 'virusgift-static-v3';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/404.html',
    '/robots.txt',
    '/sitemap.xml',
    '/assets/css/style.css',
    '/assets/css/animations.css',
    '/assets/css/themes.css',
    '/assets/css/responsive.css',
    '/assets/css/mechanics.css',
    '/assets/js/main.js',
    '/assets/js/telegram-web-app.js',
    '/assets/js/mechanics.js',
    '/assets/js/ui.js',
    '/assets/js/api.js',
    '/assets/js/utils.js',
    '/assets/js/vendor/swiper.min.js',
    '/assets/js/vendor/canvas-confetti.min.js',
    '/assets/img/logo.svg',
    '/assets/img/favicon.png',
    '/assets/img/icon-192.png',
    '/assets/img/icon-512.png',
    '/assets/img/placeholder.jpg',
    '/assets/img/default-avatar.jpg',
    '/assets/img/preview.jpg',
    '/assets/fonts/Inter-Regular.woff2',
    '/assets/fonts/Inter-Bold.woff2'
];

const API_ROUTES = [
    '/api/mechanics',
    '/api/gifts',
    '/api/rating',
    '/api/stats'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            return self.skipWaiting();
        })
    );
});

// Активация и очистка старых кэшей
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => {
                    return key !== STATIC_CACHE_NAME && 
                           key !== API_CACHE_NAME && 
                           key !== CACHE_NAME;
                }).map(key => caches.delete(key))
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Стратегия кэширования
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Для API запросов - Network First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(event.request));
    }
    // Для статических файлов - Cache First
    else if (STATIC_ASSETS.includes(url.pathname)) {
        event.respondWith(cacheFirst(event.request));
    }
    // Для всего остального - Stale While Revalidate
    else {
        event.respondWith(staleWhileRevalidate(event.request));
    }
});

// Cache First стратегия
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(STATIC_CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        return caches.match('/404.html');
    }
}

// Network First стратегия
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(API_CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Возвращаем заглушку для офлайн режима
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: 'offline',
                message: 'Нет подключения к интернету' 
            }),
            {
                status: 503,
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Offline-Mode': 'true'
                }
            }
        );
    }
}

// Stale While Revalidate стратегия
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    const networkPromise = fetch(request).then(networkResponse => {
        cache.put(request, networkResponse.clone());
        return networkResponse;
    }).catch(() => null);
    
    return cachedResponse || networkPromise;
}

// Обработка push-уведомлений
self.addEventListener('push', (event) => {
    const data = event.data.json();
    
    const options = {
        body: data.body,
        icon: '/assets/img/icon-192.png',
        badge: '/assets/img/badge.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: data.id || 1,
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Открыть' },
            { action: 'close', title: 'Закрыть' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'VirusGift.pro', options)
    );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});

// Фоновая синхронизация
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    const cache = await caches.open(API_CACHE_NAME);
    const requests = await cache.keys();
    
    for (const request of requests) {
        if (API_ROUTES.some(route => request.url.includes(route))) {
            try {
                await fetch(request);
                console.log('Sync successful for:', request.url);
            } catch (error) {
                console.log('Sync failed for:', request.url);
            }
        }
    }
}

// Периодическая фоновая синхронизация
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-content') {
        event.waitUntil(updateContent());
    }
});

async function updateContent() {
    const cache = await caches.open(STATIC_CACHE_NAME);
    
    for (const url of STATIC_ASSETS) {
        try {
            const request = new Request(url);
            const response = await fetch(request);
            
            if (response.ok) {
                await cache.put(request, response);
                console.log('Updated:', url);
            }
        } catch (error) {
            console.log('Update failed for:', url);
        }
    }
}

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

// Очистка кэша при необходимости
self.addEventListener('message', (event) => {
    if (event.data === 'cleanCache') {
        event.waitUntil(
            caches.keys().then(keys => {
                return Promise.all(
                    keys.filter(key => key !== STATIC_CACHE_NAME && key !== API_CACHE_NAME)
                        .map(key => caches.delete(key))
                );
            })
        );
    }
});
