const CACHE = "finanzflips-shell-v8";
const shell = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./app.js?v=3",
  "./model.mjs",
  "./forecast.mjs",
  "./bank-sync.mjs",
  "./planning-ui.mjs",
  "./bank-ui.mjs",
  "./fints-ui.mjs",
  "./agent.mjs",
  "./ui.mjs",
  "./views.mjs",
  "./dialogs.mjs",
  "./bank-catalog.mjs",
  "./manifest.webmanifest",
  "./icon.svg",
  "./savings-ui.mjs",
  "./browser-crypto.mjs",
];
const base = new URL("./", self.location.href);
const urls = shell.map((p) => new URL(p, base).href);
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(urls))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("finanzflips-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || !urls.includes(u.href)) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || Response.error())),
  );
});
self.addEventListener("push", (e) => {
  let p;
  try {
    p = e.data.json();
  } catch {
    return;
  }
  e.waitUntil(
    self.registration.showNotification("Finanzflips – Sparbetrag bereit", {
      body: "Deine Sparberechnung ist abgeschlossen. Öffne Finanzflips zum Prüfen.",
      icon: new URL("./icon.svg", base).href,
      tag: "finanzflips-" + p.operationId,
      data: { id: p.operationId },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL("./", base);
  url.hash =
    "/savings?operation=" + encodeURIComponent(e.notification.data?.id || "");
  e.waitUntil(self.clients.openWindow(url.href));
});
