/* Хэш-роутер.

   Основа — «Полка» (`app.js:979-1015`). Там он был сращён с её экранами:
   одна функция разбирала хэш, подсвечивала вкладки, считала счётчики и
   рисовала вид. Здесь оставлена только механика — разбор адреса, направление
   перехода и подписка на hashchange, — а что рисовать, решает вызывающий.

   Маршрут живёт после решётки и до сервера не доходит: поэтому GitHub Pages
   отдаёт один index.html на любой путь, и офлайн-откат в sw.js возвращает
   ту же страницу на любой переход. */

const DEFAULT = '#/today';

/** '#/week/2026-10-19' → { route: 'week', args: ['2026-10-19'], raw: 'week/2026-10-19' } */
export function parseHash(hash = location.hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  return { route: parts[0] || '', args: parts.slice(1), raw };
}

export function go(to) {
  location.hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
}

export function replace(to) {
  const hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
  history.replaceState(null, '', hash);
}

let prev = { route: null, depth: 0 };

/* Направление перехода: вглубь — справа, обратно — слева, смена вкладки —
   всплытие. Считаем по глубине пути, а не по истории браузера: так одинаково
   работают и наши ссылки, и кнопка «назад». */
export function transitionDir(route, depth = 0) {
  const moved = route !== prev.route || depth !== prev.depth;
  const dir = !moved ? null
    : depth > prev.depth ? 'v-fwd'
    : depth < prev.depth && route === prev.route ? 'v-back'
    : 'v-up';
  prev = { route, depth };
  return dir;
}

export function resetTransition() { prev = { route: null, depth: 0 }; }

export function prefersCalm() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Подписывается на hashchange и сразу рисует текущий маршрут. */
export function initRouter(render) {
  if (!location.hash) replace(DEFAULT);
  addEventListener('hashchange', () => {
    try { render(); } catch (err) { console.error('router: не отрисовал маршрут', err); }
  });
  render();
}
