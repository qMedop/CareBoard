importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

const APP_VERSION = "1.0.1";
const CACHE_NAME = `calendar-app-${APP_VERSION}`;
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/logo192.png",
];

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

const allowedPaths = [
  "/",
  "/calendar",
  "/home",
  "/login",
  "/settings",
  "/games",
  "/money",
  "/time",
  "/profile",
  "/notes",
  "/to-do",
];

messaging.onBackgroundMessage((payload) => {
  const notificationTitle =
    typeof payload?.notification?.title === "string"
      ? payload.notification.title.slice(0, 100)
      : "CareBoard Alert";
  const targetUrl = allowedPaths.includes(payload?.data?.url)
    ? payload.data.url
    : "/calendar";
  const body =
    typeof payload?.notification?.body === "string"
      ? payload.notification.body.slice(0, 300)
      : "You have a new background event update!";
  const notificationOptions = {
    body: body,
    tag: "calendar-events",
    renotify: true,

    icon: "/logo192.png",
    badge: "/favicon.ico",
    vibrate: [200, 100, 200],
    data: {
      url: targetUrl,
    },
  };
  return self.registration
    .showNotification(notificationTitle, notificationOptions)
    .catch((err) => {
      console.error("Notification error:", err);
    });
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
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

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("chrome-extension") ||
    event.request.url.includes("hot-update")
  ) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/calendar";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          const clientPath = new URL(client.url).pathname;

          if (clientPath === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
