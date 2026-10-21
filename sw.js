/* Расписание МГПУ — service worker.
   Взят из «Полки» (~/Documents/BOT/boardgames/sw.js) с правкой стратегий
   под расписание: оболочка и данные ведут себя по-разному. */
const SHELL = 'mgpu-shell-v1';   // html, css, js
const STATIC = 'mgpu-static-v2'; // шрифты и логотипы; v2 — новая иконка приложения
const DATA = 'mgpu-data-v1';     // расписание — меняется

const FILES = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './assets/brand.css',
  './src/main.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== STATIC && k !== DATA).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Шрифты и логотипы: кэш-первый. Они не меняются, а шрифт весит много —
  // ждать сеть на каждом открытии незачем.
  if (/\/assets\/(fonts|logo|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(STATIC).then(c => c.put(req, copy)).catch(err => console.warn('sw: не сохранил статику', err));
        return res;
      }))
    );
    return;
  }

  // Данные расписания: сеть с откатом в кэш. Отметку времени «показано
  // сохранённое от …» ставит страница, читая заголовок date из кэша.
  if (/\/pub\//.test(url.pathname) || url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(DATA).then(c => c.put(req, copy)).catch(err => console.warn('sw: не сохранил данные', err));
        return res;
      }).catch(() => caches.match(req, { ignoreVary: true, ignoreSearch: true })
        .then(hit => hit || offline()))
    );
    return;
  }

  // Своя оболочка: сеть с откатом в кэш, чтобы работало офлайн.
  // cache: 'no-cache' заставляет перепроверить файл на сервере по ETag.
  // Без этого GitHub Pages держит js в кэше браузера десять минут,
  // и свежая версия доезжает до устройства с опозданием.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy)).catch(err => console.warn('sw: не сохранил оболочку', err));
        return res;
      })
      .catch(() => fromCache(req))
  );
});

/* Офлайн-откат.

   ignoreVary здесь решающий. GitHub Pages отдаёт файлы с заголовком Vary,
   а запрос на открытие приложения с домашнего экрана несёт не те заголовки,
   с какими файл клали в кэш при установке. Из-за этого точное совпадение
   не находилось, и в авиарежиме приложение просто не запускалось —
   при том что все файлы лежали в кэше. */
async function fromCache(req) {
  const opts = { ignoreVary: true, ignoreSearch: true };

  const exact = await caches.match(req, opts);
  if (exact) return exact;

  // Любой переход внутри приложения — это одна и та же страница:
  // маршрут живёт в адресной строке после решётки и до сервера не доходит.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    const page = await caches.match('./index.html', opts) || await caches.match('./', opts);
    if (page) return page;
  }

  return offline();
}

function offline() {
  return new Response('Нет связи, а в кэше пусто', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
