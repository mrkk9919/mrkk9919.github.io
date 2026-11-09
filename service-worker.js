"use strict";

const CACHE_PREFIX = "mb-cambodia-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v27";
const APP_ROOT = new URL("./", self.location.href);
const PRECACHE = [
  "index.html",
  "transfer.html",
  "international-transfer.html",
  "savings-investment.html",
  "cash-to-atm.html",
  "manifest.webmanifest",
  "favicon.svg",
  "app-icon-192.png",
  "app-icon-512.png",
  "apple-touch-icon.png",
  "pwa-install.css",
  "pwa-install.js",
  "assets/index-tGulQzRr.js?v=2",
  "assets/index-BIeGMN93.css",
  "scan.css?v=5",
  "pay-flow.css?v=10",
  "account.css?v=7",
  "referral.css?v=1",
  "notifications.css?v=3",
  "settings.css?v=1",
  "transfer.css?v=1",
  "international-transfer.css",
  "savings-investment.css",
  "cash-to-atm.css",
  "jsqr.min.js",
  "qrcode.min.js",
  "kh-banks.js?v=1",
  "lang.js?v=2",
  "bakong-service.js?v=1",
  "./assets/myqr-sokha-chan.png",
  "scan.js?v=31",
  "transfer-entry.js?v=1",
  "account.js?v=17",
  "home-balance.js?v=2",
  "referral.js?v=1",
  "notifications.js?v=4",
  "settings.js?v=2",
  "transfer.js?v=1",
  "international-transfer.js",
  "savings-investment.js",
  "cash-to-atm.js",
  "mb-cambodia-logo.png",
  "acleda-bank-logo.png",
  "mb-bottom-nav.png",
  "mb-enrich-banner.jpeg",
  "payment-providers.png",
  "myqr-demo.png",
  "promo-enrich.png",
  "promo-savings.png",
  "promo-transfer.png",
  "qr-camera-feed.jpg",
  "assets/banks/aba-confirmation.webp",
  "assets/banks/aba-user-logo.jpg",
  "assets/banks/aba.png",
  "assets/banks/acleda.png",
  "assets/banks/maybank.png",
  "assets/banks/mb-confirmation.webp",
  "assets/banks/wing.png"
].map(function (path) {
  return new URL(path, APP_ROOT).href;
});

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME
            ? caches.delete(key)
            : Promise.resolve(false);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.indexOf(new URL(APP_ROOT).pathname) !== 0) return;
  if (requestUrl.pathname.indexOf("/api/") !== -1) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request, { ignoreSearch: true })
            .then(function (cached) {
              return cached || caches.match(new URL("index.html", APP_ROOT).href);
            });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});

