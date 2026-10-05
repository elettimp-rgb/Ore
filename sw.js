/************************************************************
 * SERVICE WORKER — Ore Elettra
 * 
 * ⚠️ IMPORTANTE: Cambia CACHE_VERSION ogni volta che aggiorni
 * i file dell'app (script.js, index.html, styles.css, ecc.)
 * per forzare il refresh della cache.
 ************************************************************/

// ⬇️ INCREMENTA QUESTO NUMERO AD OGNI AGGIORNAMENTO
const CACHE_VERSION = "v3";
const CACHE_NAME = "ore-elettra-" + CACHE_VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./logo-elettra.png"
];

// Install: salva gli asset in cache
self.addEventListener("install", function(e) {
  self.skipWaiting(); // ← attiva subito il nuovo SW
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
});

// Activate: cancella tutte le cache vecchie
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      // Prende il controllo di tutte le schede aperte senza ricaricare
      return self.clients.claim();
    })
  );
});

// Fetch: strategia network-first per i file dell'app
self.addEventListener("fetch", function(e) {
  // Non cachare le chiamate API
  if (e.request.url.indexOf("workers.dev") !== -1) return;
  if (e.request.url.indexOf("script.google.com") !== -1) return;

  // Solo GET
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        // Aggiorna la cache con la risposta fresca
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // Offline: usa la cache
        return caches.match(e.request).then(function(cached) {
          if (cached) return cached;
          // Fallback per la navigazione
          if (e.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});
