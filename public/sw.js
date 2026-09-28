/* Allsvenskantipset service worker – push-notiser */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Allsvenskantipset", body: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Allsvenskantipset", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      image: data.image,
      tag: data.tag,
      data: { url: data.url || "/notiser" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notiser";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
