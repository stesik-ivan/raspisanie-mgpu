/* «Сегодня» — главный экран демо.

   Показывает ленту пар на день: что идёт сейчас с кольцом прогресса,
   сколько осталось, окна между парами, переход в другой корпус, замены
   и отмены. День листается свайпом и стрелками. */

import * as api from '../../data/api.js';
import { arc, emptyArc, spinner } from '../../ui/arc.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { longDate, durationShort, kindName, shortDate, plural } from '../../ui/format.js';
import { today, nowMinutes, isDemoTime } from '../../data/clock.js';
import { addDays } from '../../domain/dates.js';
import { toMinutes } from '../../domain/bells.js';
import { openLessonSheet } from './lesson-sheet.js';

export async function renderToday(host, { date = today() } = {}) {
  host.innerHTML = `<div class="page">${loading()}</div>`;

  const prefs = await api.getPrefs();
  if (!prefs.groupId) { host.innerHTML = needGroup(); return; }

  const [day, changes] = await Promise.all([
    api.getDay(prefs.groupId, date, { subgroup: prefs.subgroup }),
    api.getChanges(prefs.groupId, { fromDate: date, days: 1 }),
  ]);
  const group = (await api.getIndex()).units.flatMap(u => u.groups).find(g => g.id === prefs.groupId);

  host.innerHTML = `
    <div class="page day-page" data-date="${date}">
      ${header(date, group, prefs, changes.length)}
      ${day.lessons.length ? feed(day) : empty(date)}
    </div>`;

  bind(host, date);
}

function loading() {
  return `<div class="center-block">${spinner(44)}</div>`;
}

function needGroup() {
  return `<div class="page"><div class="stub">
    <div class="stub-arc">${emptyArc(96)}</div>
    <p>Группа не выбрана.</p>
    <a class="btn btn-primary" href="#/more">Выбрать группу</a>
  </div></div>`;
}

function header(date, group, prefs, changeCount) {
  const sub = prefs.subgroup ? `, подгруппа ${prefs.subgroup}` : '';
  return `
    <header class="day-head">
      <div class="day-nav">
        <button class="icon-btn" data-day="-1" aria-label="Предыдущий день">${icon('back')}</button>
        <div class="day-head-text">
          <h1 class="day-title">${esc(longDate(date))}</h1>
          <p class="day-sub">${esc(group?.code || '')}${esc(sub)}</p>
        </div>
        <button class="icon-btn" data-day="1" aria-label="Следующий день">${icon('chevron')}</button>
      </div>
      <div class="day-badges">
        ${date !== today() ? `<button class="badge badge-ghost" data-day="today">Сегодня</button>` : ''}
        ${changeCount ? `<a class="badge badge-accent" href="#/changes">Изменения: ${changeCount}</a>` : ''}
        ${isDemoTime() ? `<span class="badge badge-ghost" title="Время подменено параметром ?now=">демо-время</span>` : ''}
      </div>
    </header>`;
}

function feed(day) {
  const live = day.isToday ? nowMinutes() : null;
  const items = [];

  day.lessons.forEach((lesson, i) => {
    items.push(card(lesson, live));
    const gap = day.gaps.find(g => g.afterIndex === i);
    if (gap) items.push(gapRow(gap));
  });

  return `<ul class="feed">${items.join('')}</ul>`;
}

function card(o, live) {
  const cancelled = o.status === 'cancelled';
  const from = toMinutes(o.start), to = toMinutes(o.end);
  const running = live !== null && !cancelled && live >= from && live < to;
  const left = running ? to - live : 0;
  const progress = running ? (live - from) / (to - from) : 0;
  const changed = o.changeIds.length > 0 && !cancelled;

  return `
    <li class="feed-item">
      <article class="lesson${cancelled ? ' is-cancelled' : ''}${running ? ' is-now' : ''}${changed ? ' is-changed' : ''}"
        data-lesson="${esc(o.lessonId)}" data-ldate="${esc(o.date)}" tabindex="0" role="button">
        <div class="lesson-time">
          <span class="lesson-start">${esc(o.start)}</span>
          <span class="lesson-end">${esc(o.end)}</span>
          <span class="lesson-slot">${o.slot} пара</span>
        </div>
        <div class="lesson-ring">${running ? arc({ progress, size: 44, width: 3 }) : ''}</div>
        <div class="lesson-body">
          <h3 class="lesson-name">${esc(o.discipline)}</h3>
          <p class="lesson-kind">${esc(kindName(o.kind))}</p>
          <p class="lesson-where">
            ${o.isOnline ? icon('online') : icon('pin')}
            <span>${esc(o.roomLabel)}${o.building ? `, ${esc(o.building.code)}` : ''}</span>
          </p>
          <p class="lesson-who">${o.teachers.map(t => esc(t.fio)).join(', ') || '—'}</p>
          ${running ? `<p class="lesson-now">Идёт сейчас · до конца ${esc(durationShort(left))}</p>` : ''}
          ${cancelled ? `<p class="lesson-flag">Отменено${reason(o)}</p>` : ''}
          ${changed ? `<p class="lesson-flag">${esc(changeNote(o))}</p>` : ''}
        </div>
      </article>
    </li>`;
}

function reason(o) { return o.reason ? ` · ${esc(o.reason)}` : ''; }

function changeNote(o) {
  if (o.isExtra) return 'Дополнительное занятие';
  if (o.moved) return 'Перенесено';
  const was = o.replacedTeachers?.map(t => t.fio).join(', ');
  const note = was ? `Замена: вместо ${was}` : 'Изменено';
  return o.reason ? `${note} · ${o.reason}` : note;
}

function gapRow(gap) {
  return `
    <li class="gap">
      <span class="gap-line"></span>
      <span class="gap-text">
        Окно ${esc(durationShort(gap.minutes))}
        ${gap.moveTo ? ` · переход в ${esc(gap.moveTo.code)}, ${esc(gap.moveTo.address)}` : ''}
      </span>
    </li>`;
}

function empty(date) {
  return `
    <div class="stub stub-empty">
      <div class="stub-arc">${emptyArc(132)}</div>
      <p class="stub-title">${date === today() ? 'Сегодня пар нет' : `${esc(shortDate(date))} пар нет`}</p>
      <p>Можно выдохнуть.</p>
    </div>`;
}

function bind(host, date) {
  host.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-day]');
    if (nav) {
      const v = nav.dataset.day;
      location.hash = v === 'today' ? '#/today' : `#/today/${addDays(date, Number(v))}`;
      return;
    }
    const card = e.target.closest('[data-lesson]');
    if (card) openLessonSheet(card.dataset.lesson, card.dataset.ldate);
  });

  host.addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-lesson]');
    if (card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openLessonSheet(card.dataset.lesson, card.dataset.ldate);
    }
  });

  // Свайп влево-вправо листает день. Порог в 60px и проверка на то, что
  // жест горизонтальный, — иначе страница перестаёт прокручиваться.
  let x0 = null, y0 = null;
  const page = host.querySelector('.day-page');
  page?.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  page?.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      location.hash = `#/today/${addDays(date, dx < 0 ? 1 : -1)}`;
    }
  }, { passive: true });
}
