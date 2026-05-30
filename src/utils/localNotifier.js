// src/utils/localNotifier.js

export function scheduleNotificationAtTimestamp(
  title,
  message,
  targetTimestampMs,
) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Safety check: Make sure this specific browser version supports local triggers
        if (settingsInBrowserSupportsTriggers()) {
          registration
            .showNotification(title, {
              body: message,
              icon: "/logo192.png",
              badge: "/favicon.ico",
              tag: `reminder-${targetTimestampMs}`,
              // THIS IS THE TRIGGER: The phone schedules this notification at the exact timestamp offline!
              showTrigger: new window.TimestampTrigger(targetTimestampMs),
            })
            .catch((err) => {
              console.error("Local trigger configuration error:", err);
              // Fallback immediately if the device blocks it
              registration.showNotification(title, { body: message });
            });
        } else {
          console.warn(
            "Browser does not support native background TimestampTriggers.",
          );
        }
      });
    }
  }
}

// Check helper to see if the engine supports offline background triggers
function settingsInBrowserSupportsTriggers() {
  return (
    "showTrigger" in window.Notification?.prototype ||
    "TimestampTrigger" in window
  );
}
