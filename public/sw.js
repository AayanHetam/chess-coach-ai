/* Chess Masti service worker — Web Push only (no offline caching).
 * Handles `push` (show the training reminder) and `notificationclick`
 * (focus an open tab or open /learn). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "Chess Masti";
  const options = {
    body: data.body || "Your training is ready — keep your streak alive.",
    icon: "/android-chrome-192x192.png",
    badge: "/android-chrome-192x192.png",
    tag: data.tag || "training-reminder",
    renotify: true,
    data: { url: data.url || "/plan" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/plan";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (w.url.includes(target) && "focus" in w) return w.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      })
  );
});
