/* Точка входа: оболочка, роутер, service worker, онбординг. */

import { initRouter, parseHash, transitionDir, prefersCalm, replace } from './router.js';
import { renderShell, setActiveTab, rememberScroll, restoreScroll } from './ui/shell.js';
import { initSheet, closeSheet } from './ui/sheet.js';
import { spinner } from './ui/arc.js';
import * as api from './data/api.js';
import { humanError } from './data/errors.js';
import { startOnboarding } from './views/student/onboarding.js';
import { renderToday } from './views/student/today.js';
import { renderWeek } from './views/student/week.js';
import { renderChanges } from './views/student/changes.js';
import { renderMore, applyTheme } from './views/student/more.js';
import { openTeacherSheet, openRoomSheet } from './views/student/peek.js';
import { renderRooms } from './views/teacher/rooms.js';
import { renderGrid } from './views/admin/grid.js';
import { renderAudit } from './views/admin/audit.js';

const STUDENT_TABS = [
  { id: 'today',   label: 'Сегодня',   icon: 'today',   href: '#/today' },
  { id: 'week',    label: 'Неделя',    icon: 'week',    href: '#/week' },
  { id: 'changes', label: 'Изменения', icon: 'changes', href: '#/changes' },
  { id: 'more',    label: 'Ещё',       icon: 'more',    href: '#/more' },
];

/* У преподавателя вместо ленты изменений — свободные аудитории: изменения
   он видит прямо в своих парах, а вот «куда сесть с группой прямо сейчас»
   не отвечает сегодня ни один источник. */
const TEACHER_TABS = [
  { id: 'today', label: 'Мои пары', icon: 'today', href: '#/today' },
  { id: 'week',  label: 'Неделя',   icon: 'week',  href: '#/week' },
  { id: 'rooms', label: 'Аудитории', icon: 'rooms', href: '#/rooms' },
  { id: 'more',  label: 'Ещё',      icon: 'more',  href: '#/more' },
];

/* Админ в демо входит кнопкой в «Ещё». Сетка — на просмотр: форма ввода
   и публикация следующим этапом, и обещать их вкладкой нечестно. */
const ADMIN_TABS = [
  { id: 'grid',  label: 'Сетка',  icon: 'grid',    href: '#/grid' },
  { id: 'audit', label: 'Журнал', icon: 'changes', href: '#/audit' },
  { id: 'more',  label: 'Ещё',    icon: 'more',    href: '#/more' },
];

const TAB_ALIASES = { lesson: 'today', teacher: 'week', room: 'week', setup: 'more', changes: 'today' };

const VIEWS = {
  today:   (host, args) => renderToday(host, { date: args[0] }),
  week:    (host, args) => renderWeek(host, { date: args[0] }),
  changes: (host) => renderChanges(host),
  rooms:   (host) => renderRooms(host),
  grid:    (host) => renderGrid(host),
  audit:   (host) => renderAudit(host),
  more:    (host) => renderMore(host),
};

let shellRole = null;

let busy = false;

async function render() {
  const { route, args, raw } = parseHash();
  const host = document.querySelector('#view');

  // Шторка не должна пережить смену экрана: иначе остаётся висеть поверх
  // чужого содержимого и выглядит как зависание.
  closeSheet();

  const prefs = await api.getPrefs();
  if (!prefs.onboarded || route === 'setup') {
    document.querySelector('#tabbar').hidden = true;
    document.querySelector('#sidebar').hidden = true;
    shellRole = null;
    return startOnboarding(() => { replace('#/today'); render(); });
  }
  document.querySelector('#tabbar').hidden = false;
  document.querySelector('#sidebar').hidden = false;

  // Набор вкладок зависит от роли. Перерисовываем оболочку только при
  // смене роли: иначе каждая навигация пересобирала бы таб-бар.
  const role = ['teacher', 'admin'].includes(prefs.role) ? prefs.role : 'student';
  const tabs = role === 'admin' ? ADMIN_TABS : role === 'teacher' ? TEACHER_TABS : STUDENT_TABS;
  if (shellRole !== role) {
    shellRole = role;
    renderShell(tabs, { brand: role === 'admin' ? 'Администратор' : 'Расписание' });
  }

  // Вкладки, которых у этой роли нет, ведут на её главный экран.
  const allowed = tabs.map(t => t.id);
  if (VIEWS[route] && !allowed.includes(route) && !TAB_ALIASES[route]) {
    replace(role === 'admin' ? '#/grid' : '#/today');
    return;
  }
  if (route === 'today' && role === 'admin') { replace('#/grid'); return; }

  // Своя вкладка важнее псевдонима: у студента «Изменения» — отдельная вкладка,
  // псевдоним на «Сегодня» нужен только ролям, у которых её нет.
  setActiveTab(route, allowed.includes(route) ? {} : TAB_ALIASES);

  // Шторки-врезки поверх текущего экрана, а не вместо него.
  if (route === 'teacher' && args[0]) { openTeacherSheet(args[0]); return; }
  if (route === 'room' && args[0]) { openRoomSheet(args[0], args[1]); return; }

  const fn = VIEWS[route] || VIEWS.today;
  const dir = prefersCalm() ? null : transitionDir(route, args.length);

  host.classList.remove('v-fwd', 'v-back', 'v-up');
  if (busy) return;
  busy = true;
  try {
    await fn(host, args);
    if (dir) { void host.offsetWidth; host.classList.add(dir); }
    restoreScroll(raw);
  } catch (err) {
    console.error('main: экран не отрисовался', err);
    host.innerHTML = `<div class="page"><div class="stub">
      <p class="stub-title">Не удалось показать расписание</p>
      <p>${humanError(err)}</p>
      <button class="btn" data-reload>Обновить</button>
    </div></div>`;
  } finally {
    busy = false;
  }
}

/* Кнопка «Обновить» на экране ошибки. Обработчик, а не inline onclick:
   атрибут выполняется как код из разметки и первым ломается под CSP. */
addEventListener('click', (e) => {
  if (e.target.closest('[data-reload]')) location.reload();
});

/* theme-color в метатеге не понимает var(), поэтому значение берём из
   токена уже после загрузки стилей. Статика в index.html — запасной вариант. */
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
  /* Только по https.

     По http с локального адреса (показ с ноутбука через serve.mjs) браузер
     его и так не зарегистрирует — офлайн и установка на экран работают
     только с HTTPS-ссылки. А на localhost он регистрируется, но при
     разработке лишь мешает: отдаёт вчерашний JS и каждую правку приходится
     выковыривать из кэша. */
  if (location.protocol !== 'https:') {
    console.info('main: service worker пропущен — нужен https');
    return;
  }
  navigator.serviceWorker.register('sw.js')
    .catch(err => console.warn('main: service worker не зарегистрирован', err));
}

function watchOffline() {
  const show = () => {
    const el = document.querySelector('#offline');
    if (el) el.hidden = navigator.onLine;
  };
  addEventListener('online', show);
  addEventListener('offline', show);
  show();
}

async function start() {
  document.querySelector('#view').innerHTML = `<div class="center-block">${spinner(44)}</div>`;
  syncThemeColor();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);

  try {
    const prefs = await api.getPrefs();
    applyTheme(prefs.theme);
  } catch (err) {
    console.warn('main: не применил тему', err);
  }

  initSheet();
  watchOffline();

  document.querySelector('#main')?.addEventListener('scroll', () => {
    rememberScroll(parseHash().raw);
  }, { passive: true });

  initRouter(render);
  registerServiceWorker();
}

start();
