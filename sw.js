// Service Worker - Pemindai & Verifikasi Peserta Ujian
// Naikkan angka versi ini setiap kali file aplikasi diubah agar perangkat memperbarui cache.
const CACHE_NAME = 'cek-peserta-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// Pustaka eksternal yang dipakai index.html (disimpan agar aplikasi tetap tampil saat sinyal buruk/offline)
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // CDN: best-effort, kegagalan satu file tidak membatalkan instalasi
    await Promise.allSettled(
      CDN_ASSETS.map(async (url) => {
        try {
          await cache.add(url);
        } catch {
          await cache.add(new Request(url, { mode: 'no-cors' }));
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase API & foto peserta UNSRI: SELALU langsung ke jaringan (tidak di-cache)
  if (
    url.hostname.endsWith('supabase.co') ||
    url.hostname.endsWith('unsri.ac.id') ||
    url.hostname.endsWith('google.com') ||
    url.hostname.endsWith('googleusercontent.com')
  ) {
    return;
  }

  // File aplikasi sendiri: coba jaringan dulu (agar update langsung terbaca), cadangan dari cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          if (hit) return hit;
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return Response.error();
        })
    );
    return;
  }

  // Pustaka CDN (Tailwind, Font Awesome, QR, Supabase): cache dulu, perbarui di latar belakang
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
});
