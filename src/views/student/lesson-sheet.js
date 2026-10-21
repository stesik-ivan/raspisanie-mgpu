/* Шторка пары: подробности, все даты проведения и история изменений. */

import * as api from '../../data/api.js';
import { openSheet } from '../../ui/sheet.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { kindName, shortDate, longDate, stamp, durationShort } from '../../ui/format.js';
import { today } from '../../data/clock.js';
import { compareIso } from '../../domain/dates.js';
import { toMinutes } from '../../domain/bells.js';

export async function openLessonSheet(lessonId, date) {
  openSheet({ title: 'Пара', html: '<div class="center-block sh-loading"></div>' });
  try {
    const prefs = await api.getPrefs();
    const { occurrences } = await api.getGroupSchedule(prefs.groupId, { subgroup: prefs.subgroup });
    const mine = occurrences.filter(o => o.lessonId === lessonId);
    const o = mine.find(x => x.date === date) || mine[0];
    if (!o) { openSheet({ title: 'Пара', html: '<p class="sh-empty">Занятие не найдено</p>' }); return; }

    openSheet({ title: o.discipline, html: body(o, mine), onMount: (el) => bind(el, o) });
  } catch (err) {
    console.error('lesson-sheet: не открыл карточку', err);
    openSheet({ title: 'Пара', html: '<p class="sh-empty">Не удалось загрузить</p>' });
  }
}

function body(o, all) {
  const cancelled = o.status === 'cancelled';
  const dates = all.map(x => x.date).sort(compareIso);
  const len = toMinutes(o.end) - toMinutes(o.start);

  return `
    <div class="sh-hero${cancelled ? ' is-cancelled' : ''}">
      <p class="sh-kind">${esc(kindName(o.kind))}</p>
      <p class="sh-when">${esc(longDate(o.date))}</p>
      <p class="sh-time">${esc(o.start)} – ${esc(o.end)} <span class="sh-dim">· ${o.slot} пара · ${esc(durationShort(len))}</span></p>
      ${cancelled ? '<p class="sh-flag">Отменено' + (o.reason ? ` · ${esc(o.reason)}` : '') + '</p>' : ''}
    </div>

    <dl class="sh-rows">
      <div class="sh-row">
        <dt>${o.isOnline ? icon('online') : icon('pin')} Где</dt>
        <dd>
          ${o.isOnline
            ? esc(o.roomLabel)
            : `<button class="link" data-room="${esc(o.roomId)}">${esc(o.roomLabel)}</button>
               ${o.building ? `<span class="sh-dim">${esc(o.building.code)}, ${esc(o.building.address)}</span>` : ''}`}
        </dd>
      </div>
      <div class="sh-row">
        <dt>${icon('teacher')} Кто ведёт</dt>
        <dd>${o.teachers.map(t => `
          <button class="link" data-teacher="${esc(t.id)}">${esc(t.fio)}</button>
          <span class="sh-dim">${esc(t.position)}</span>`).join('<br>') || '—'}</dd>
      </div>
      <div class="sh-row">
        <dt>${icon('grid')} Группы</dt>
        <dd>${o.groups.map(g => esc(g.code)).join(' + ')}${o.subgroup ? `, подгруппа ${esc(o.subgroup)}` : ''}</dd>
      </div>
    </dl>

    <section class="sh-sect">
      <h3 class="sh-sect-title">Все даты проведения <span class="sh-dim">${dates.length}</span></h3>
      <ul class="date-chips">
        ${dates.map(d => `<li class="date-chip${compareIso(d, today()) < 0 ? ' is-past' : ''}${d === o.date ? ' is-current' : ''}">${esc(shortDate(d))}</li>`).join('')}
      </ul>
    </section>

    ${history(all)}`;
}

function history(all) {
  const changed = all.filter(x => x.changeIds.length);
  if (!changed.length) return '';
  return `
    <section class="sh-sect">
      <h3 class="sh-sect-title">Изменения</h3>
      <ul class="hist">
        ${changed.map(x => `
          <li class="hist-item">
            <span class="hist-date">${esc(shortDate(x.date))}</span>
            <span class="hist-text">
              ${x.status === 'cancelled' ? 'Отменено' : x.moved ? 'Перенесено' : x.isExtra ? 'Дополнительное занятие' : 'Замена'}
              ${x.reason ? `<span class="sh-dim">${esc(x.reason)}</span>` : ''}
            </span>
          </li>`).join('')}
      </ul>
    </section>`;
}

function bind(el, o) {
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-teacher],[data-room]');
    if (!t) return;
    if (t.dataset.teacher) location.hash = `#/teacher/${t.dataset.teacher}`;
    if (t.dataset.room) location.hash = `#/room/${t.dataset.room}/${o.date}`;
  });
}
