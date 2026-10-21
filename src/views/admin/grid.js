/* Сетка расписания: группы × дни и пары.

   Это привычный вид учебной части — тот же, что в Excel. Разница в одном:
   ячейки, которые конфликтуют, обведены. В Excel этого не видно никак,
   потому что пара ВО и урок СПО стоят под разными номерами, а пересекаются
   по времени.

   Нажатие на ячейку открывает разбор: там конфликт решается одним
   нажатием. Саму таблицу рисует grid-table.js. */

import * as api from '../../data/api.js';
import { spinner, emptyArc } from '../../ui/arc.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { rangeLabel } from '../../ui/format.js';
import { today } from '../../data/clock.js';
import { addDays, startOfWeek } from '../../domain/dates.js';
import { openConflictSheet } from './conflict-sheet.js';
import { openLessonForm } from './lesson-form.js';
import { gridTable } from './grid-table.js';
import { listen } from '../../ui/listen.js';
import { dragScroll } from '../../ui/drag-scroll.js';

let state = { unitId: null, course: null, weekFrom: null };

/**
 * @param {HTMLElement} host
 * @param {{quiet?:boolean}} [o] quiet — перерисовать без индикатора загрузки,
 *   после правки: иначе страница схлопнется до спиннера и потеряет прокрутку.
 */
export async function renderGrid(host, { quiet = false } = {}) {
  const scrollLeft = host.querySelector('.g-wrap')?.scrollLeft || 0;
  if (!quiet) host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;

  const [index, prefs] = await Promise.all([api.getIndex(), api.getPrefs()]);
  const admin = await api.getAdmin();
  const myUnits = index.units.filter(u => admin?.unitIds?.includes(u.id));
  // Проверяем по всем подразделениям, а не только по своим: чужое
  // админ видит (и не правит), выбор чужого не должен сбрасываться.
  if (!state.unitId || !index.units.some(u => u.id === state.unitId)) {
    state.unitId = myUnits[0]?.id || index.units[0].id;
  }
  if (!state.weekFrom) state.weekFrom = startOfWeek(today());

  const grid = await api.getGridView(state);
  const mine = admin?.unitIds?.includes(state.unitId) ?? false;
  const courses = [...new Set(index.units.find(u => u.id === state.unitId).groups.map(g => g.course))].sort();

  host.innerHTML = `
    <div class="page grid-page">
      <header class="grid-head">
        <div>
          <h1 class="page-title">Сетка расписания</h1>
          <p class="page-sub">${esc(grid.unit?.name || '')} · ${esc(rangeLabel(grid.from, grid.to))}</p>
        </div>
        <div class="grid-head-actions">
          ${grid.draftCount ? `<a class="badge badge-accent" href="#/publish">Неопубликованных: ${grid.draftCount}</a>` : ''}
          ${mine ? `<button class="btn btn-primary g-add" data-add>${icon('plus')} Занятие</button>` : ''}
          <button class="icon-btn" data-wk="-1" aria-label="Предыдущая неделя">${icon('back')}</button>
          <button class="badge badge-ghost" data-wk="today">Эта неделя</button>
          <button class="icon-btn" data-wk="1" aria-label="Следующая неделя">${icon('chevron')}</button>
        </div>
      </header>

      <div class="filters">
        <div class="chips-row" role="group" aria-label="Подразделение">
          ${myUnits.map(u => `<button class="fchip${state.unitId === u.id ? ' is-on' : ''}" data-unit="${u.id}">${esc(u.short)}</button>`).join('')}
          ${index.units.filter(u => !admin?.unitIds?.includes(u.id)).map(u =>
            `<button class="fchip is-foreign${state.unitId === u.id ? ' is-on' : ''}" data-unit="${u.id}" title="Чужая зона: видно, но править нельзя">${esc(u.short)} ${icon('warn')}</button>`).join('')}
        </div>
        <div class="chips-row" role="group" aria-label="Курс">
          <button class="fchip${state.course == null ? ' is-on' : ''}" data-course="">Все курсы</button>
          ${courses.map(c => `<button class="fchip${state.course === c ? ' is-on' : ''}" data-course="${c}">${c} курс</button>`).join('')}
        </div>
      </div>

      ${foreignNote(admin, grid)}
      ${grid.groups.length ? gridTable(grid, mine) : empty()}
      ${legend(mine)}
    </div>`;

  const wrap = host.querySelector('.g-wrap');
  if (wrap) {
    if (quiet) wrap.scrollLeft = scrollLeft;
    dragScroll(wrap, { vertical: document.querySelector('#main') });
  }
  bind(host, grid);
}

function foreignNote(admin, grid) {
  if (admin?.unitIds?.includes(grid.unit?.id)) return '';
  return `<p class="notice">Расписание ${esc(grid.unit?.short || '')} ведёт другой администратор. Смотреть можно, править нельзя.</p>`;
}

function legend(mine) {
  return `
    <ul class="g-legend">
      <li><span class="lg lg-error"></span>Конфликт: такое занятие нельзя сохранить</li>
      <li><span class="lg lg-warn"></span>Предупреждение: сохранить можно, но лучше проверить</li>
      <li><span class="lg lg-draft"></span>Черновик: студенты его пока не видят</li>
      ${mine ? '<li class="lg-desk"><span class="lg lg-slot"></span>Пустая клетка: нажмите, чтобы добавить занятие</li>' : ''}
      <li class="lg-desk">Сетку можно двигать мышью, зажав кнопку</li>
    </ul>`;
}

function empty() {
  return `<div class="stub stub-empty">
    <div class="stub-arc">${emptyArc(110)}</div>
    <p class="stub-title">Групп нет</p>
    <p>Снимите фильтр по курсу.</p>
  </div>`;
}

function bind(host, grid) {
  listen(host, 'click', (e) => {
    const wk = e.target.closest('[data-wk]');
    if (wk) {
      const v = wk.dataset.wk;
      state.weekFrom = v === 'today' ? startOfWeek(today()) : addDays(state.weekFrom, Number(v) * 7);
      return renderGrid(host);
    }
    const u = e.target.closest('[data-unit]');
    if (u) { state.unitId = u.dataset.unit; state.course = null; return renderGrid(host); }

    const c = e.target.closest('[data-course]');
    if (c) { state.course = c.dataset.course ? Number(c.dataset.course) : null; return renderGrid(host); }

    const onChanged = () => renderGrid(host, { quiet: true });
    const cell = e.target.closest('[data-cell]');
    if (cell) { openConflictSheet(cell.dataset.cell, cell.dataset.cdate, grid, { onChanged }); return; }

    if (e.target.closest('[data-add]')) { openLessonForm({ unitId: state.unitId, onChanged }); return; }
    const blank = e.target.closest('[data-new]');
    if (blank) {
      const d = blank.dataset;
      openLessonForm({ unitId: state.unitId, onChanged, from: d.date, preset: {
        groupIds: [d.gid], subgroup: d.sub || null, weekday: Number(d.wd), slot: Number(d.slot),
      } });
    }
  });
}
