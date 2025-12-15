// Service Worker for SokoInn Marketplace
// Version: 2.0.0

const CACHE_NAME = 'sokoinn-v2';
const OFFLINE_URL = '/offline.html';
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/jobs.html',
  '/skills.html',
  '/rentals.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  
  // Styles and Fonts
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  
  // Core Images
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  
  // Fallback Images
  '/images/logo.png',
  '/images/placeholder-product.png',
  
  // Fallback hero images
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w-800&q-80',
  
  // Critical Scripts
  '/js/app.js',
  '/js/products.js',
  '/js/chatbot.js'
];

// Dynamic Cache Strategy
const DYNAMIC_CACHE_NAME = 'sokoinn-dynamic-v2';

// API Endpoints to cache
const API_CACHE_URLS = [
  'https://script.google.com/macros/s/AKfycbzrOY9Lqu1feQJmqgZXn368Lo-HQ14-1LVRsY5pob7hNlo7uo2YlwlseeiI6GHTAanWnw/exec'
];

// Install Event - Cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting on install');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Cache installation failed:', error);
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  const cacheWhitelist = [CACHE_NAME, DYNAMIC_CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch Event - Network-first with cache fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle API requests
  if (url.href.includes('script.google.com/macros/s/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // Handle image requests
  if (event.request.destination === 'image') {
    event.respondWith(handleImageRequest(event.request));
    return;
  }
  
  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached response and update cache in background
          updateCacheInBackground(event.request);
          return cachedResponse;
        }
        
        // If not in cache, fetch from network
        return fetch(event.request)
          .then(networkResponse => {
            // Cache the response if valid
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(DYNAMIC_CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseClone);
                });
            }
            return networkResponse;
          })
          .catch(error => {
            console.error('[Service Worker] Fetch failed:', error);
            
            // If offline and requesting HTML, show offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
            
            // For images, return a fallback image
            if (event.request.destination === 'image') {
              return caches.match('/images/placeholder-product.png');
            }
            
            // Return empty response for other requests
            return new Response('Network error occurred', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Handle API requests with cache-first then network strategy
function handleApiRequest(request) {
  const requestUrl = new URL(request.url);
  const cacheKey = request.url;
  
  return caches.open(DYNAMIC_CACHE_NAME)
    .then(cache => {
      return cache.match(cacheKey)
        .then(cachedResponse => {
          // If we have cached data, return it immediately
          if (cachedResponse) {
            // Update cache in background
            fetchAndCache(request, cache, cacheKey);
            return cachedResponse;
          }
          
          // If no cache, fetch fresh data
          return fetchAndCache(request, cache, cacheKey);
        });
    })
    .catch(error => {
      console.error('[Service Worker] API request failed:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'You are offline. Cached data not available.',
          cached: false 
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });
}

// Handle image requests with cache-first strategy
function handleImageRequest(request) {
  return caches.match(request)
    .then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(request)
        .then(networkResponse => {
          // Cache the image if successful
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE_NAME)
              .then(cache => {
                cache.put(request, responseClone);
              });
          }
          return networkResponse;
        })
        .catch(() => {
          // Return fallback image if fetch fails
          return caches.match('/images/placeholder-product.png');
        });
    });
}

// Helper function to fetch and cache
function fetchAndCache(request, cache, cacheKey) {
  return fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        const responseClone = networkResponse.clone();
        cache.put(cacheKey, responseClone);
        
        // Set expiration for API cache (1 hour)
        const expiration = Date.now() + (60 * 60 * 1000);
        const meta = { 
          cachedAt: Date.now(),
          expiresAt: expiration 
        };
        
        return caches.open(DYNAMIC_CACHE_NAME)
          .then(cache => {
            return cache.put(
              `${cacheKey}.meta`, 
              new Response(JSON.stringify(meta))
            );
          })
          .then(() => networkResponse);
      }
      return networkResponse;
    });
}

// Update cache in background without blocking response
function updateCacheInBackground(request) {
  // For HTML pages, always try to update
  if (request.headers.get('accept').includes('text/html')) {
    fetch(request)
      .then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE_NAME)
            .then(cache => {
              cache.put(request, responseClone);
            });
        }
      })
      .catch(() => {
        // Silently fail if network is unavailable
      });
  }
  
  // For API requests, check if cache is stale (older than 1 hour)
  const requestUrl = new URL(request.url);
  if (requestUrl.href.includes('script.google.com/macros/s/')) {
    const cacheKey = request.url;
    const metaKey = `${cacheKey}.meta`;
    
    caches.open(DYNAMIC_CACHE_NAME)
      .then(cache => {
        return cache.match(metaKey)
          .then(metaResponse => {
            if (!metaResponse) {
              // No metadata, fetch fresh data
              fetchAndCache(request, cache, cacheKey);
              return;
            }
            
            return metaResponse.json()
              .then(meta => {
                const now = Date.now();
                if (now > meta.expiresAt) {
                  // Cache expired, fetch fresh data
                  fetchAndCache(request, cache, cacheKey);
                }
              });
          });
      });
  }
}

// Background Sync for offline actions
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-products') {
    event.waitUntil(syncProducts());
  }
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Push Notification handler
self.addEventListener('push', event => {
  console.log('[Service Worker] Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update from SokoInn',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Browse Products'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('SokoInn Marketplace', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click:', event.action);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  // Handle custom actions
  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  })
  .then(windowClients => {
    // Check if there's already a window/tab open
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url.includes('/index.html') && 'focus' in client) {
        return client.focus();
      }
    }
    
    // If no window is open, open a new one
    if (clients.openWindow) {
      return clients.openWindow('/index.html');
    }
  });
  
  event.waitUntil(promiseChain);
});

// Helper function to sync products
function syncProducts() {
  console.log('[Service Worker] Syncing products...');
  // This would sync any pending product uploads
  // Currently a placeholder for future implementation
  return Promise.resolve();
}

// Helper function to sync messages
function syncMessages() {
  console.log('[Service Worker] Syncing messages...');
  // This would sync chat messages
  // Currently a placeholder for future implementation
  return Promise.resolve();
}

// Periodically clean up expired cache entries
setInterval(() => {
  caches.open(DYNAMIC_CACHE_NAME)
    .then(cache => {
      return cache.keys()
        .then(requests => {
          requests.forEach(request => {
            if (request.url.includes('.meta')) {
              cache.match(request.url)
                .then(response => {
                  if (response) {
                    return response.json()
                      .then(meta => {
                        if (Date.now() > meta.expiresAt) {
                          // Delete expired cache entry
                          const dataKey = request.url.replace('.meta', '');
                          cache.delete(dataKey);
                          cache.delete(request.url);
                        }
                      });
                  }
                });
            }
          });
        });
    });
}, 60 * 60 * 1000); // Run every hour
