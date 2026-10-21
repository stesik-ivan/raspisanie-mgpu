/* Экспорт недели группы: Excel (.xlsx), CSV и календарь (.ics).

   Выгружается то, что видят студенты: опубликованная версия с изменениями
   на дату. Файл для сайта и для МЭШ — это расписание, которое уже
   действует, а не черновик администратора. */

import * as api from '../../data/api.js';
import { esc } from '../../ui/search.js';
import { toast } from '../../ui/toast.js';
import { download } from '../../ui/download.js';
import { rangeLabel, dowShort, shortDate, kindName, changeNote } from '../../ui/format.js';
import { humanError } from '../../data/errors.js';
import { today } from '../../data/clock.js';
import { addDays, startOfWeek } from '../../domain/dates.js';
import { toCsv } from '../../domain/export-csv.js';
import { buildXlsx } from '../../domain/export-xlsx.js';

const COLUMNS = [
  { header: 'День', width: 11 }, { header: 'Пара', width: 6 }, { header: 'Время', width: 12 },
  { header: 'Дисциплина', width: 30 }, { header: 'Вид', width: 13 }, { header: 'Аудитория', width: 16 },
  { header: 'Корпус', width: 8 }, { header: 'Преподаватель', width: 22 }, { header: 'Подгруппа', width: 11 },
  { header: 'Изменения', width: 36 },
];
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let pick = { groupId: null, week: 0 };   // выбор переживает перерисовку вкладки

/** Разметка панели. Группы — своей зоны. */
export function exportPanelHtml(groups) {
  if (!groups.length) return '';
  if (!groups.some(g => g.id === pick.groupId)) pick.groupId = groups[0].id;
  const from = startOfWeek(addDays(today(), pick.week * 7));
  return `
    <section class="pub-sect exp" data-export>
      <h2 class="sh-sect-title">Экспорт недели группы</h2>
      <div class="exp-row">
        <select class="lf-input exp-group" data-exp-group aria-label="Группа">
          ${groups.map(g => `<option value="${esc(g.id)}"${g.id === pick.groupId ? ' selected' : ''}>${esc(g.code)}</option>`).join('')}
        </select>
        <div class="chips-row" role="group" aria-label="Неделя">
          <button class="fchip${pick.week === 0 ? ' is-on' : ''}" data-exp-week="0">Эта неделя</button>
          <button class="fchip${pick.week === 1 ? ' is-on' : ''}" data-exp-week="1">Следующая</button>
        </div>
      </div>
      <p class="lf-hint">${esc(rangeLabel(from, addDays(from, 5)))} · опубликованная версия с изменениями на дату</p>
      <div class="exp-btns">
        <button class="btn btn-primary" data-exp="xlsx">Excel (.xlsx)</button>
        <button class="btn" data-exp="csv">CSV</button>
        <button class="btn" data-exp="ics">Календарь (.ics)</button>
      </div>
    </section>`;
}

/** Обработчики панели. rerender — перерисовать вкладку после смены выбора. */
export function bindExportPanel(root, groups, rerender) {
  const el = root.querySelector('[data-export]');
  if (!el) return;
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-exp-group]')) pick.groupId = e.target.value;
  });
  el.addEventListener('click', (e) => {
    const w = e.target.closest('[data-exp-week]');
    if (w) { pick.week = Number(w.dataset.expWeek); rerender(); return; }
    const b = e.target.closest('[data-exp]');
    if (b) run(b, groups.find(g => g.id === pick.groupId));
  });
}

async function run(btn, group) {
  if (!group) return;
  btn.disabled = true;
  try {
    const from = startOfWeek(addDays(today(), pick.week * 7));
    if (btn.dataset.exp === 'ics') {
      download(`${group.code}.ics`, await api.getIcsForGroup(group.id), 'text/calendar;charset=utf-8');
      return;
    }
    const week = await api.getWeek({ groupId: group.id }, from);
    const rows = week.days.flatMap(d => d.lessons.length ? d.lessons.map(o => [
      `${dowShort(d.date)} ${shortDate(d.date)}`, String(o.slot), `${o.start}–${o.end}`,
      o.discipline, kindName(o.kind), o.roomLabel, o.building?.code || '',
      o.teachers.map(t => t.fio).join(', '),
      o.subgroup ? `подгр. ${o.subgroup}` : 'вся группа',
      o.changeIds.length ? changeNote(o) : '',
    ]) : [[`${dowShort(d.date)} ${shortDate(d.date)}`, '', '', 'пар нет', '', '', '', '', '', '']]);
    const name = `Расписание ${group.code} ${shortDate(week.from)}–${shortDate(week.to)}`;
    if (btn.dataset.exp === 'csv') {
      download(`${name}.csv`, toCsv([COLUMNS.map(c => c.header), ...rows]), 'text/csv;charset=utf-8');
    } else {
      const title = `${group.code} · расписание на ${rangeLabel(week.from, week.to)}`;
      download(`${name}.xlsx`, buildXlsx({ sheetName: group.code, title, columns: COLUMNS, rows }), XLSX);
    }
  } catch (err) {
    console.error('export-panel: не выгрузил', err);
    toast(humanError(err));
  } finally {
    btn.disabled = false;
  }
}
