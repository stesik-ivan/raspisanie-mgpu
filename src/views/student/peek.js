/* Врезки: неделя преподавателя и занятость аудитории за день.
   Открываются из карточки пары, своего экрана не занимают. */

import * as api from '../../data/api.js';
import { openSheet } from '../../ui/sheet.js';
import { esc } from '../../ui/search.js';
import { shortDate, dowShort, kindName, longDate } from '../../ui/format.js';
import { today } from '../../data/clock.js';
import { startOfWeek, addDays, compareIso } from '../../domain/dates.js';


export async function openTeacherSheet(teacherId) {
  openSheet({ title: 'Преподаватель', html: '<div class="center-block sh-loading"></div>' });
  try {
    const [{ occurrences }, index] = await Promise.all([
      api.getTeacherSchedule(teacherId), api.getIndex(),
    ]);
    const t = index.teachers.find(x => x.id === teacherId);
    const from = startOfWeek(today()), to = addDays(from, 5);
    const week = occurrences
      .filter(o => compareIso(o.date, from) >= 0 && compareIso(o.date, to) <= 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

    openSheet({
      title: t?.fio || 'Преподаватель',
      html: `
        <p class="sh-text sh-dim">${esc(t?.position || '')} · эта неделя, ${esc(shortDate(from))}–${esc(shortDate(to))}</p>
        ${week.length ? `<ul class="peek">${week.map(o => `
          <li class="peek-row${o.status === 'cancelled' ? ' is-cancelled' : ''}">
            <span class="peek-when">${esc(dowShort(o.date))} ${esc(o.start)}</span>
            <span class="peek-body">
              <span class="peek-name">${esc(o.discipline)} <span class="sh-dim">${esc(kindName(o.kind))}</span></span>
              <span class="sh-dim">${o.groups.map(g => esc(g.code)).join(' + ')} · ${esc(o.roomLabel)}</span>
            </span>
          </li>`).join('')}</ul>` : '<p class="sh-empty">На этой неделе пар нет</p>'}`,
    });
  } catch (err) {
    console.error('peek: не показал преподавателя', err);
    openSheet({ title: 'Преподаватель', html: '<p class="sh-empty">Не удалось загрузить</p>' });
  }
}

export async function openRoomSheet(roomId, date = today()) {
  openSheet({ title: 'Аудитория', html: '<div class="center-block sh-loading"></div>' });
  try {
    const busy = await api.getRoomBusy(roomId, date);
    const label = busy[0]?.roomLabel || 'Аудитория';
    const building = busy[0]?.building;

    openSheet({
      title: label,
      html: `
        <p class="sh-text sh-dim">${building ? `${esc(building.code)}, ${esc(building.address)} · ` : ''}${esc(longDate(date))}</p>
        ${busy.length ? `<ul class="peek">${busy.map(o => `
          <li class="peek-row${o.status === 'cancelled' ? ' is-cancelled' : ''}">
            <span class="peek-when">${esc(o.start)}<br><span class="sh-dim">${esc(o.end)}</span></span>
            <span class="peek-body">
              <span class="peek-name">${esc(o.discipline)} <span class="sh-dim">${esc(kindName(o.kind))}</span></span>
              <span class="sh-dim">${o.groups.map(g => esc(g.code)).join(' + ')} · ${o.teachers.map(t => esc(t.fio)).join(', ')}</span>
            </span>
          </li>`).join('')}</ul>` : '<p class="sh-empty">В этот день аудитория свободна весь день</p>'}`,
    });
  } catch (err) {
    console.error('peek: не показал аудиторию', err);
    openSheet({ title: 'Аудитория', html: '<p class="sh-empty">Не удалось загрузить</p>' });
  }
}
