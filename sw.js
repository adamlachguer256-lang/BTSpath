// BTSPath service worker: makes the site work offline and installable.
// - App files and data: network first (always fresh when online), cached copy when offline.
// - Course files (resources/): cached the first time a student opens or downloads them.
// Change VERSION when you change app files, so old caches get cleaned up.

const VERSION = "btspath-v11";
const APP = `${VERSION}-app`;
const FILES = `${VERSION}-files`;

const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "assets/css/style.css",
  "assets/js/app.js", "assets/js/store.js", "assets/js/quiz.js", "assets/js/icons.js",
  "assets/js/config.js", "assets/js/subnet.js", "assets/js/terminal.js",
  "assets/img/logo.svg", "assets/img/icon-192.png",
  "data/manifest.json", "data/quizzes/index.json", "data/labs/index.json",
];

self.addEventListener("install", (e) => {
  // one put() per file (cache.addAll fails as a whole if two installs overlap)
  e.waitUntil(caches.open(APP).then((c) => Promise.all(SHELL.map((url) =>
    fetch(url, { cache: "reload" }).then((res) => { if (res.ok) return c.put(url, res); }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: cache first
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req, APP));
    return;
  }
  if (url.origin !== location.origin) return;

  if (url.pathname.includes("/resources/")) {
    // PDF viewers sometimes ask for byte ranges: answer from cache if we have the whole file.
    if (req.headers.has("range")) {
      e.respondWith(caches.match(url.href, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
      return;
    }
    e.respondWith(cacheFirst(req, FILES));
    return;
  }
  e.respondWith(networkFirst(req));
});

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200) (await caches.open(APP)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return caches.match("index.html");
    throw new Error("offline");
  }
}
