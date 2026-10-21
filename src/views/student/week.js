/* «Неделя»: полоса дней с точками, навигатор недель, список по дням.
   От 900px — сетка дней × пар, как привыкли смотреть на бумаге. */

import * as api from '../../data/api.js';
import { emptyArc, spinner } from '../../ui/arc.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { rangeLabel, dowShort, dayMonth, kindName } from '../../ui/format.js';
import { today } from '../../data/clock.js';
import { addDays, startOfWeek, compareIso } from '../../domain/dates.js';
import { openLessonSheet } from './lesson-sheet.js';

export async function renderWeek(host, { date = today() } = {}) {
  host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;

  const subject = await api.getSubject();
  if (!subject) { location.hash = '#/today'; return; }
  const forTeacher = !!subject.teacherId;

  const week = await api.getWeek(subject, date);
  const meta = await api.getMeta();
  const outOfTerm = meta.term && (compareIso(week.to, meta.term.from) < 0 || compareIso(week.from, meta.term.to) > 0);

  host.innerHTML = `
    <div class="page week-page">
      <header class="week-head">
        <div class="day-nav">
          <button class="icon-btn" data-week="-1" aria-label="Предыдущая неделя">${icon('back')}</button>
          <h1 class="week-title">${esc(rangeLabel(week.from, week.to))}</h1>
          <button class="icon-btn" data-week="1" aria-label="Следующая неделя">${icon('chevron')}</button>
        </div>
        ${startOfWeek(today()) !== week.from ? '<button class="badge badge-ghost" data-week="today">Эта неделя</button>' : ''}
      </header>

      <ul class="dayline">
        ${week.days.map(d => `
          <li><button class="dayline-day${d.isToday ? ' is-today' : ''}${!d.lessons.length ? ' is-free' : ''}"
            data-goday="${d.date}">
            <span class="dayline-dow">${esc(dowShort(d.date))}</span>
            <span class="dayline-num">${Number(d.date.slice(8))}</span>
            <span class="dayline-dots">${dots(d.lessons)}</span>
          </button></li>`).join('')}
      </ul>

      ${outOfTerm ? `<p class="notice">Эта неделя вне семестра. Семестр идёт с ${esc(dayMonth(meta.term.from))} по ${esc(dayMonth(meta.term.to))}.</p>` : ''}
      ${week.days.some(d => d.lessons.length) ? list(week, forTeacher) : emptyWeek()}
    </div>`;

  bind(host, week.from);
}

function dots(lessons) {
  const n = Math.min(lessons.length, 5);
  return Array.from({ length: n }, (_, i) =>
    `<i class="dot${lessons[i]?.status === 'cancelled' ? ' is-off' : ''}"></i>`).join('');
}

function list(week, forTeacher) {
  return `<div class="week-list">${week.days.map(d => `
    <section class="week-day${d.isToday ? ' is-today' : ''}">
      <h2 class="week-day-head">
        <span>${esc(dowShort(d.date))}</span>
        <span class="week-day-date">${esc(dayMonth(d.date))}</span>
        ${d.isToday ? '<span class="badge badge-accent">сегодня</span>' : ''}
      </h2>
      ${d.lessons.length ? `<ul class="week-rows">${d.lessons.map(o => row(o, forTeacher)).join('')}</ul>`
        : '<p class="week-free">Пар нет</p>'}
    </section>`).join('')}</div>`;
}

function row(o, forTeacher) {
  return `
    <li><button class="week-row${o.status === 'cancelled' ? ' is-cancelled' : ''}${o.changeIds.length && o.status !== 'cancelled' ? ' is-changed' : ''}"
      data-lesson="${esc(o.lessonId)}" data-ldate="${esc(o.date)}">
      <span class="week-row-time">${esc(o.start)}<br><span class="sh-dim">${esc(o.end)}</span></span>
      <span class="week-row-body">
        <span class="week-row-name">${esc(o.discipline)}</span>
        <span class="week-row-sub">${esc(kindName(o.kind))} · ${esc(o.roomLabel)}${o.building ? `, ${esc(o.building.code)}` : ''}</span>
        <span class="week-row-who">${forTeacher ? esc(o.groups.map(g => g.code).join(' + ')) : o.teachers.map(t => esc(t.fio)).join(', ')}</span>
      </span>
    </button></li>`;
}

function emptyWeek() {
  return `<div class="stub stub-empty">
    <div class="stub-arc">${emptyArc(120)}</div>
    <p class="stub-title">На этой неделе пар нет</p>
  </div>`;
}

function bind(host, from) {
  host.addEventListener('click', (e) => {
    const w = e.target.closest('[data-week]');
    if (w) {
      const v = w.dataset.week;
      location.hash = v === 'today' ? '#/week' : `#/week/${addDays(from, Number(v) * 7)}`;
      return;
    }
    const d = e.target.closest('[data-goday]');
    if (d) { location.hash = `#/today/${d.dataset.goday}`; return; }

    const l = e.target.closest('[data-lesson]');
    if (l) openLessonSheet(l.dataset.lesson, l.dataset.ldate);
  });
}
