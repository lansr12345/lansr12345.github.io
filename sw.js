// HaM Cartoon PWA - Advanced Service Worker (Fixed Syntax)
const CACHE_VERSION = 'v2.5.1';
const STATIC_CACHE = `ham-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `ham-dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `ham-images-${CACHE_VERSION}`;

// الملفات الأساسية التي يجب تخزينها فور تثبيت الـ SW
const STATIC_ASSETS = [
    '/HaM/',
    '/HaM/index.html',
    '/HaM/manifest.json',
    '/HaM/icons/favicon.ico',
    '/HaM/icons/icon-192x192.png',
    '/HaM/icons/icon-512x512.png',
    '/HaM/sounds/click.mp3',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap'
];

// قواعد التخزين المؤقت للصور (Cache First)
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i;

// قواعد التخزين للفيديوهات (Network First with timeout)
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg)$/i;

self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
        .then(cache => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
        .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
        .then(keys => {
            return Promise.all(
                keys.filter(key => {
                    return key.startsWith('ham-') && !key.includes(CACHE_VERSION);
                }).map(key => caches.delete(key))
            );
        })
        .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
        return;
    }

    // استراتيجية الصور: Cache First
    if (IMAGE_EXTENSIONS.test(request.url)) {
        event.respondWith(
            caches.match(request)
            .then(cached => {
                if (cached) {
                    fetch(request).then(response => {
                        if (response.ok) {
                            caches.open(IMAGE_CACHE).then(cache => cache.put(request, response));
                        }
                    }).catch(() => {});
                    return cached;
                }
                return fetch(request).then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    const cloned = response.clone();
                    caches.open(IMAGE_CACHE).then(cache => cache.put(request, cloned));
                    return response;
                });
            }).catch(() => {
                if (request.destination === 'image') {
                    return caches.match('/HaM/icons/fallback-image.png');
                }
            })
        );
        return;
    }

    // استراتيجية الفيديوهات: Network First
    if (VIDEO_EXTENSIONS.test(request.url)) {
        event.respondWith(
            new Promise((resolve) => {
                let timeoutId = setTimeout(() => {
                    caches.match(request).then(cached => {
                        if (cached) resolve(cached);
                    });
                }, 3000);

                fetch(request).then(response => {
                    clearTimeout(timeoutId);
                    if (response.ok) {
                        const cloned = response.clone();
                        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, cloned));
                        resolve(response);
                    } else {
                        caches.match(request).then(cached => {
                            if (cached) resolve(cached);
                        });
                    }
                }).catch(() => {
                    caches.match(request).then(cached => {
                        if (cached) resolve(cached);
                    });
                });
            })
        );
        return;
    }

    // استراتيجية افتراضية: Stale-While-Revalidate
    event.respondWith(
        caches.match(request)
        .then(cachedResponse => {
            const fetchPromise = fetch(request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const cloned = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, cloned));
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});

// ========== إشعارات Push (متوافقة مع جميع البيئات) ==========
self.addEventListener('push', (event) => {
    let notificationData = {
        title: 'HaM كرتون',
        body: 'تم إضافة فيلم جديد! شاهده الآن.',
        icon: '/HaM/icons/icon-192x192.png',
        badge: '/HaM/icons/badge-96x96.png',
        data: { url: '/HaM/' }
    };

    if (event.data) {
        try {
            const serverData = event.data.json();
            notificationData.title = serverData.title || notificationData.title;
            notificationData.body = serverData.body || notificationData.body;
            notificationData.icon = serverData.icon || notificationData.icon;
            notificationData.badge = serverData.badge || notificationData.badge;
            notificationData.data = serverData.data || notificationData.data;
        } catch (e) {
            const text = event.data.text();
            notificationData.body = text || notificationData.body;
        }
    }

    const options = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        vibrate: [200, 100, 200],
        dir: 'rtl',
        lang: 'ar',
        tag: 'ham-update',
        renotify: true,
        data: notificationData.data
    };

    event.waitUntil(
        self.registration.showNotification(notificationData.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    let targetUrl = '/HaM/';
    if (event.notification.data && event.notification.data.url) {
        targetUrl = event.notification.data.url;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(windowClients => {
            for (let client of windowClients) {
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(targetUrl);
        })
    );
});