/* «Ещё»: группа, календарь, тема, установка, сброс демо-данных. */

import * as api from '../../data/api.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { toast } from '../../ui/toast.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { stamp, dayMonth } from '../../ui/format.js';
import { isDemoTime } from '../../data/clock.js';

export async function renderMore(host) {
  const [prefs, meta, index, ephemeral] = await Promise.all([
    api.getPrefs(), api.getMeta(), api.getIndex(), api.isEphemeral(),
  ]);
  const group = index.units.flatMap(u => u.groups).find(g => g.id === prefs.groupId);
  const unit = index.units.find(u => u.id === prefs.unitId);

  host.innerHTML = `
    <div class="page">
      <header class="page-hdr">
        <h1 class="page-title">Ещё</h1>
      </header>

      ${ephemeral ? `<p class="notice notice-warn">Браузер не даёт сохранять настройки — выбор группы забудется при перезагрузке. Обычно так бывает в приватном режиме.</p>` : ''}

      <section class="card">
        <h2 class="card-title">Моя группа</h2>
        <p class="card-main">${esc(group?.code || 'не выбрана')}${prefs.subgroup ? `, подгруппа ${esc(prefs.subgroup)}` : ''}</p>
        <p class="card-sub">${esc(unit?.name || '')}</p>
        <button class="btn" data-act="change-group">Сменить группу</button>
      </section>

      <section class="card">
        <h2 class="card-title">Календарь на телефоне</h2>
        <p class="card-sub">Пары появятся в обычном календаре и будут обновляться вместе с расписанием.</p>
        <button class="btn btn-primary" data-act="ics">${icon('today')} Скачать .ics</button>
        <button class="btn btn-ghost" data-act="ics-help">Как подписаться</button>
      </section>

      <section class="card">
        <h2 class="card-title">Тема</h2>
        <div class="segmented" role="group" aria-label="Тема оформления">
          ${['auto', 'light', 'dark'].map(v => `
            <button class="seg${prefs.theme === v ? ' is-on' : ''}" data-theme="${v}">
              ${v === 'auto' ? 'Авто' : v === 'light' ? 'Светлая' : 'Тёмная'}
            </button>`).join('')}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Установить приложение</h2>
        <p class="card-sub">Откроется с домашнего экрана и будет работать без интернета.</p>
        <button class="btn" data-act="install">Как установить</button>
      </section>

      <section class="card card-quiet">
        <h2 class="card-title">О приложении</h2>
        <p class="card-sub">
          Демо расписания МГПУ. Данные выдуманы, люди вымышлены.<br>
          ${meta.term ? `Семестр: ${esc(meta.term.name)}, с ${esc(dayMonth(meta.term.from))} по ${esc(dayMonth(meta.term.to))}.<br>` : ''}
          ${meta.term?.publishedAt ? `Опубликовано ${esc(stamp(meta.term.publishedAt))}.` : ''}
          ${isDemoTime() ? '<br><b>Время подменено параметром ?now=</b>' : ''}
        </p>
        <button class="btn btn-ghost" data-act="reset">Сбросить демо-данные</button>
      </section>
    </div>`;

  bind(host);
}

function bind(host) {
  host.addEventListener('click', async (e) => {
    const theme = e.target.closest('[data-theme]');
    if (theme) {
      await api.setPrefs({ theme: theme.dataset.theme });
      applyTheme(theme.dataset.theme);
      renderMore(host);
      return;
    }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;

    if (act === 'change-group') { location.hash = '#/setup'; return; }

    if (act === 'ics') {
      try {
        const prefs = await api.getPrefs();
        const text = await api.getIcsForGroup(prefs.groupId);
        const index = await api.getIndex();
        const code = index.units.flatMap(u => u.groups).find(g => g.id === prefs.groupId)?.code || 'raspisanie';
        download(`${code}.ics`, text);
        toast('Файл скачан — откройте его, чтобы добавить в календарь');
      } catch (err) {
        console.error('more: не собрал .ics', err);
        toast('Не удалось собрать календарь');
      }
      return;
    }

    if (act === 'ics-help') {
      openSheet({ title: 'Подписка на календарь', html: `
        <ol class="sh-steps">
          <li><b>iPhone.</b> Скачайте файл и откройте его — iOS предложит добавить события в календарь.</li>
          <li><b>Android.</b> Скачайте файл и откройте через «Google Календарь» ${icon('chevron')} «Импорт».</li>
          <li>В боевой версии вместо файла будет постоянная ссылка: календарь станет обновляться сам, когда учебная часть внесёт изменения.</li>
        </ol>` });
      return;
    }

    if (act === 'install') {
      openSheet({ title: 'Установить приложение', html: `
        <ol class="sh-steps">
          <li><b>iPhone, Safari.</b> Кнопка «Поделиться» внизу ${icon('chevron')} «На экран «Домой»».</li>
          <li><b>Android, Chrome.</b> Меню из трёх точек ${icon('chevron')} «Установить приложение».</li>
          <li>После установки расписание открывается как обычное приложение и показывает сохранённую копию, даже если нет сети.</li>
        </ol>` });
      return;
    }

    if (act === 'reset') {
      openSheet({ title: 'Сбросить демо-данные?', html: `
        <p class="sh-text">Расписание соберётся заново относительно сегодняшнего дня. Выбор группы сохранится.</p>
        <div class="sh-actions">
          <button class="btn btn-primary" data-confirm-reset>Сбросить</button>
          <button class="btn btn-ghost" data-sh-close>Отмена</button>
        </div>`, onMount: (el) => {
          el.querySelector('[data-confirm-reset]')?.addEventListener('click', async () => {
            try {
              await api.resetDemo();
              closeSheet();
              toast('Демо-данные пересобраны');
              renderMore(host);
            } catch (err) {
              console.error('more: не пересобрал демо-данные', err);
              toast('Не удалось пересобрать');
            }
          });
        } });
    }
  });
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
