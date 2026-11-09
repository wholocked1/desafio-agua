// Service worker simples: abre rápido, atualiza sozinho e deixa o app abrir sem internet.
// Guarda os arquivos do próprio site e a biblioteca do Supabase; dados e fotos sempre vão direto à rede.
const CACHE = "agua-v8";
const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
const SHELL = ["./", "index.html", "app.css", "app.js", "qrcode.js", "config.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL).then(() => c.add(new Request(LIB, { mode: "cors" })).catch(() => {})))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;
  if (req.url === LIB) { // biblioteca do Supabase: guardada, para o app abrir sem internet
    e.respondWith(caches.match(LIB).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(LIB, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // rede primeiro (pega a versão nova); se estiver sem internet, usa o que está guardado
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

// Lembretes (Web Push)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Desafio da Água", {
    body: d.body || "Hora de beber água! 💧",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: d.url || "/" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ("focus" in w) return w.focus();
    return clients.openWindow(url);
  }));
});