/* «Неделя» на широком экране: дни по горизонтали, пары по вертикали.

   Столбики дней разной высоты — главная беда раскладки карточками:
   во вторник четыре пары, в среду пять, и строки «10:30» в соседних днях
   стоят на разной высоте. Здесь строка — это время начала пары, и все
   дни выровнены по ней, как в бумажном расписании.

   Строки берутся по времени начала, а не по номеру пары: у преподавателя
   бывают пары и в институте, и в колледже, а там «2-я пара» начинается
   в разное время. */

import { esc } from '../../ui/search.js';
import { dowShort, dayMonth, kindName, changeNote } from '../../ui/format.js';

/**
 * @param {object} week ответ api.getWeek
 * @param {boolean} forTeacher в карточке вместо преподавателя — группы
 */
export function weekGridHtml(week, forTeacher) {
  const all = week.days.flatMap(d => d.lessons);
  const starts = [...new Set(all.map(o => o.start))].sort();
  const endOf = (start) => all.find(o => o.start === start)?.end || '';

  const head = week.days.map((d, i) => `
    <button class="wg-day${d.isToday ? ' is-today' : ''}" style="grid-column:${i + 2}" data-goday="${d.date}">
      <span class="wg-dow">${esc(dowShort(d.date))}</span>
      <span class="wg-date">${esc(dayMonth(d.date))}</span>
      ${d.isToday ? '<span class="wg-today">сегодня</span>' : ''}
    </button>`).join('');

  const rows = starts.map((start, r) => {
    const row = r + 2;
    const cells = week.days.map((d, i) => {
      const here = d.lessons.filter(o => o.start === start);
      const cls = `wg-cell${r % 2 ? ' is-odd' : ''}${d.isToday ? ' is-today' : ''}${here.length ? '' : ' is-free'}`;
      return `<div class="${cls}" style="grid-row:${row}; grid-column:${i + 2}">${here.map(o => block(o, forTeacher, endOf(start))).join('')}</div>`;
    }).join('');
    return `
      <div class="wg-time${r % 2 ? ' is-odd' : ''}" style="grid-row:${row}">
        <b>${esc(start)}</b><span>${esc(endOf(start))}</span>
      </div>${cells}`;
  }).join('');

  return `
    <div class="wg" role="table" aria-label="Расписание на неделю">
      <div class="wg-corner"></div>${head}${rows}
    </div>`;
}

function block(o, forTeacher, rowEnd) {
  const cancelled = o.status === 'cancelled';
  const changed = o.changeIds.length && !cancelled;
  // Время в карточке нужно, только если пара кончается не как остальные в строке.
  return `
    <button class="wg-lesson${cancelled ? ' is-cancelled' : ''}${changed ? ' is-changed' : ''}"
      data-lesson="${esc(o.lessonId)}" data-ldate="${esc(o.date)}">
      ${o.end !== rowEnd ? `<span class="wg-own-time">${esc(o.start)}–${esc(o.end)}</span>` : ''}
      <span class="wg-name">${esc(o.discipline)}</span>
      <span class="wg-meta">${esc(kindName(o.kind))} · ${esc(o.roomLabel)}${o.building ? `, ${esc(o.building.code)}` : ''}</span>
      <span class="wg-who">${forTeacher
        ? esc(o.groups.map(g => g.code).join(' + ')) + (o.subgroup ? `, подгр. ${esc(o.subgroup)}` : '')
        : esc(o.teachers.map(t => t.fio).join(', '))}${!forTeacher && o.subgroup ? ` · подгр. ${esc(o.subgroup)}` : ''}</span>
      ${o.changeIds.length ? `<span class="wg-note">${esc(changeNote(o))}</span>` : ''}
    </button>`;
}
