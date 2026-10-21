/* Точка входа. Поднимает оболочку, роутер и service worker.
   Экраны подключаются по мере готовности — пока заглушки (Задача 1). */

import { initRouter, parseHash, transitionDir, prefersCalm } from './router.js';
import { renderShell, setActiveTab, paint, rememberScroll, restoreScroll } from './ui/shell.js';
import { emptyArc } from './ui/arc.js';

const STUDENT_TABS = [
  { id: 'today',   label: 'Сегодня',   icon: 'today',   href: '#/today' },
  { id: 'week',    label: 'Неделя',    icon: 'week',    href: '#/week' },
  { id: 'changes', label: 'Изменения', icon: 'changes', href: '#/changes' },
  { id: 'more',    label: 'Ещё',       icon: 'more',    href: '#/more' },
];

/* Вторичные маршруты, которые подсвечивают чужую вкладку. */
const TAB_ALIASES = { lesson: 'today', teacher: 'week', room: 'week' };

const STUBS = {
  today:   ['Сегодня', 'Лента пар на день'],
  week:    ['Неделя', 'Расписание по дням'],
  changes: ['Изменения', 'Замены, отмены и переносы'],
  more:    ['Ещё', 'Группа, календарь, тема'],
};

function render() {
  const { route, args, raw } = parseHash();
  const dir = prefersCalm() ? null : transitionDir(route, args.length);

  setActiveTab(route, TAB_ALIASES);

  const [title, sub] = STUBS[route] || STUBS.today;
  paint(`
    <div class="page">
      <header class="page-hdr">
        <h1 class="page-title">${title}</h1>
        <p class="page-sub">${sub}</p>
      </header>
      <div class="stub">
        <div class="stub-arc">${emptyArc(96)}</div>
        <p>Экран собирается. Каркас, шрифт, тёмная тема и переходы уже работают.</p>
      </div>
    </div>`, dir);

  restoreScroll(raw);
}

/* theme-color в метатеге не понимает var(), поэтому значение берём из
   токена уже после загрузки стилей. Статическое значение в index.html —
   запасной вариант на случай, если скрипт не дошёл. */
function syncThemeColor() {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (!bg) return;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = bg;
  } catch (err) {
    console.warn('main: не синхронизировал theme-color', err);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // По http с локального адреса (показ с ноутбука через serve.mjs) браузер
  // service worker не регистрирует. Это ожидаемо, не ошибка: офлайн и
  // установка на экран показываются только с HTTPS-ссылки.
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.info('main: service worker пропущен — нужен https или localhost');
    return;
  }
  navigator.serviceWorker.register('sw.js')
    .catch(err => console.warn('main: service worker не зарегистрирован', err));
}

function start() {
  syncThemeColor();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
  renderShell(STUDENT_TABS, { brand: 'Расписание' });
  addEventListener('beforeunload', () => rememberScroll(parseHash().raw));
  document.querySelector('#main')?.addEventListener('scroll', () => {
    rememberScroll(parseHash().raw);
  }, { passive: true });
  initRouter(render);
  registerServiceWorker();
}

start();
