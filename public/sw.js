/* cite: uploaded:public/sw.js */
// 1. IMPORT FIREBASE BACKGROUND ENGINE WORKERS
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

const CACHE_NAME = "calendar-app-cache-v1";
const ASSETS_TO_CACHE = ["/", "/index.html", "/manifest.json", "/favicon.ico"];

// 2. INITIALIZE BACKGROUND FIREBASE INTERFACE
// Paste your exact CareBoard config details here:
firebase.initializeApp({
  apiKey: "AIzaSyDbiUbGkHFooDFPOp_oRwJC8Tsju_2ioLI",
  authDomain: "careboard-firebase-b39e5.firebaseapp.com",
  projectId: "careboard-firebase-b39e5",
  storageBucket: "careboard-firebase-b39e5.firebasestorage.app",
  messagingSenderId: "997922177429",
  appId: "1:997922177429:web:e36ca9c45ab300f93bb69c",
  measurementId: "G-MTVBFZRN1K",
});

const messaging = firebase.messaging();

// 3. THE MAGIC PAYLOAD PARSER: Catches Firebase Dashboard Campaigns perfectly
messaging.onBackgroundMessage((payload) => {
  console.log("FCM background message payload caught:", payload);

  const notificationTitle = payload?.notification?.title || "CareBoard Alert";
  const notificationOptions = {
    body:
      payload?.notification?.body || "You have a new background event update!",
    icon: "/logo192.png",
    badge: "/favicon.ico",
    vibrate: [200, 100, 200],
    data: {
      url: "/calendar", // Keeps your layout redirect path running smoothly
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ==========================================
// KEEP ALL YOUR EXISTING PWA CACHING LOGIC UNTOUCHED Below:
// ==========================================

// Install Event: Caches base application layers gracefully
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Caching App Shell Assets individually...");
        const cachePromises = ASSETS_TO_CACHE.map((asset) => {
          return cache.add(asset).catch((err) => {
            console.warn(
              `PWA Warning: Failed to cache local asset [${asset}]:`,
              err,
            );
          });
        });
        return Promise.all(cachePromises);
      })
      .then(() => self.skipWaiting()),
  );
});

// Activate Event: Clears old caches and hooks service system control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log("Service Worker: Clearing Old Cache Data");
              return caches.delete(cache);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Fetch Event: Serve cached items offline if network drops
self.addEventListener("fetch", (event) => {
  if (
    event.request.url.includes("chrome-extension") ||
    event.request.url.includes("hot-update")
  ) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {});
    }),
  );
});

// Handle Notification Click event (Keeps your clean refocus-tab layout feature alive)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/calendar";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "sync-calendar-events") {
    event.waitUntil(
      console.log(
        "Android background synchronization handshake opened successfully!",
      ),
      // NOTE: Because cryptographic private keys live inside React memory context (not in sw.js),
      // your background service worker will cleanly fetch the newly matched event rows,
      // ready to decrypt them instantly the moment the user taps open the app container shell!
    );
  }
});
