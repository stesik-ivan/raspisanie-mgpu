/* «Изменения»: что поменялось у группы на ближайшие две недели. */

import * as api from '../../data/api.js';
import { emptyArc, spinner } from '../../ui/arc.js';
import { esc } from '../../ui/search.js';
import { longDate, shortDate, kindName, stamp } from '../../ui/format.js';
import { today } from '../../data/clock.js';
import { openLessonSheet } from './lesson-sheet.js';

const TITLES = {
  cancel: 'Отменено', teacher: 'Замена преподавателя',
  room: 'Другая аудитория', move: 'Перенос', extra: 'Дополнительное занятие',
};

export async function renderChanges(host) {
  host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;

  const subject = await api.getSubject();
  if (!subject) { location.hash = '#/today'; return; }

  const list = await api.getChanges(subject, { fromDate: today(), days: 14 });

  host.innerHTML = `
    <div class="page">
      <header class="page-hdr">
        <h1 class="page-title">Изменения</h1>
        <p class="page-sub">Ближайшие две недели</p>
      </header>
      ${list.length ? `<ul class="chg-list">${list.map(item).join('')}</ul>` : empty()}
    </div>`;

  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lesson]');
    if (t) openLessonSheet(t.dataset.lesson, t.dataset.ldate);
  });
}

function item(o) {
  const ch = o.changes[0] || {};
  return `
    <li><button class="chg" data-lesson="${esc(o.lessonId)}" data-ldate="${esc(o.date)}">
      <span class="chg-mark" aria-hidden="true"></span>
      <span class="chg-body">
        <span class="chg-head">
          <span class="chg-type">${esc(TITLES[ch.type] || 'Изменение')}</span>
          <span class="chg-date">${esc(longDate(o.date))}</span>
        </span>
        <span class="chg-name${o.status === 'cancelled' ? ' is-cancelled' : ''}">
          ${esc(o.discipline)} <span class="sh-dim">${esc(kindName(o.kind))}</span>
        </span>
        <span class="chg-when">${esc(o.start)}–${esc(o.end)} · ${esc(o.roomLabel)}${o.building ? `, ${esc(o.building.code)}` : ''}</span>
        <span class="chg-who">${o.teachers.map(t => esc(t.fio)).join(', ')}</span>
        ${ch.reason ? `<span class="chg-reason">Причина: ${esc(ch.reason)}</span>` : ''}
        ${ch.createdAt ? `<span class="chg-stamp">внесено ${esc(stamp(ch.createdAt))}</span>` : ''}
      </span>
    </button></li>`;
}

function empty() {
  return `<div class="stub stub-empty">
    <div class="stub-arc">${emptyArc(120)}</div>
    <p class="stub-title">Изменений нет</p>
    <p>Расписание на ближайшие две недели идёт как опубликовано.</p>
  </div>`;
}
