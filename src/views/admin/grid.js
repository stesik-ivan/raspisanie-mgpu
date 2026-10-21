/* Сетка расписания: группы × дни и пары.

   Это привычный вид учебной части — тот же, что в Excel. Разница в одном:
   ячейки, которые конфликтуют, обведены. В Excel этого не видно никак,
   потому что пара ВО и урок СПО стоят под разными номерами, а пересекаются
   по времени.

   Тап по ячейке открывает разбор: там конфликт решается в один тап. */

import * as api from '../../data/api.js';
import { spinner, emptyArc } from '../../ui/arc.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { rangeLabel, dowFull, dayMonth, kindName, shortDate } from '../../ui/format.js';
import { today } from '../../data/clock.js';
import { addDays, startOfWeek, weekdayOf } from '../../domain/dates.js';
import { openConflictSheet } from './conflict-sheet.js';
import { listen } from '../../ui/listen.js';

const DAYS = [1, 2, 3, 4, 5, 6];

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
  const courses = [...new Set(index.units.find(u => u.id === state.unitId).groups.map(g => g.course))].sort();

  host.innerHTML = `
    <div class="page grid-page">
      <header class="grid-head">
        <div>
          <h1 class="page-title">Сетка расписания</h1>
          <p class="page-sub">${esc(grid.unit?.name || '')} · ${esc(rangeLabel(grid.from, grid.to))}</p>
        </div>
        <div class="grid-head-actions">
          ${grid.draftCount ? `<span class="badge badge-accent">Неопубликованных: ${grid.draftCount}</span>` : ''}
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
      ${grid.groups.length ? table(grid) : empty()}
      ${legend()}
    </div>`;

  if (quiet) { const w = host.querySelector('.g-wrap'); if (w) w.scrollLeft = scrollLeft; }
  bind(host, grid);
}

function foreignNote(admin, grid) {
  if (admin?.unitIds?.includes(grid.unit?.id)) return '';
  return `<p class="notice">Это чужая зона. ${esc(grid.unit?.short || '')} ведёт другой администратор — расписание видно, править его нельзя.</p>`;
}

/* Колонки: группа, а если у неё есть подгруппы — по колонке на подгруппу.
   Ровно так устроен файл учебной части: каждая группа занимает две колонки. */
function columnsOf(groups) {
  const cols = [];
  for (const g of groups) {
    if (g.subgroups?.length) {
      for (const s of g.subgroups) cols.push({ groupId: g.id, code: g.code, subgroup: s });
    } else {
      cols.push({ groupId: g.id, code: g.code, subgroup: null });
    }
  }
  return cols;
}

function table(grid) {
  const cols = columnsOf(grid.groups);
  const idx = new Map(cols.map((c, i) => [`${c.groupId}|${c.subgroup ?? ''}`, i]));

  let row = 2;                       // первая строка — шапка
  const rows = [];
  const placed = [];

  for (const weekday of DAYS) {
    const date = addDays(grid.from, weekday - 1);
    rows.push(`<div class="g-day" style="grid-row:${row}" role="rowheader">
      ${esc(dowFull(date))}<span class="sh-dim">${esc(shortDate(date))}</span></div>`);
    row++;

    for (const slot of grid.bells) {
      rows.push(`<div class="g-time" style="grid-row:${row}">
        <b>${slot.n}</b><span>${esc(slot.start)}</span><span class="sh-dim">${esc(slot.end)}</span></div>`);

      for (const cell of grid.cells.filter(c => c.date === date && c.slot === slot.n)) {
        placed.push(cellBox(cell, cols, idx, row));
      }
      row++;
    }
  }

  return `
    <div class="g-wrap">
      <div class="g" style="grid-template-columns: 62px repeat(${cols.length}, minmax(128px, 1fr)); grid-template-rows: auto;">
        <div class="g-corner" style="grid-row:1"></div>
        ${cols.map((c, i) => `
          <div class="g-col" style="grid-row:1; grid-column:${i + 2}">
            <span class="g-col-code">${esc(c.code)}</span>
            ${c.subgroup ? `<span class="g-col-sub">подгр. ${esc(c.subgroup)}</span>` : ''}
          </div>`).join('')}
        ${rows.join('')}
        ${placed.join('')}
      </div>
    </div>`;
}

function cellBox(cell, cols, idx, row) {
  // Поток занимает подряд идущие колонки своих групп — как объединённая
  // ячейка в Excel. Берём крайние и растягиваем между ними.
  const hits = [];
  for (const gid of cell.groupIds) {
    if (cell.subgroup == null) {
      cols.forEach((c, i) => { if (c.groupId === gid) hits.push(i); });
    } else {
      const i = idx.get(`${gid}|${cell.subgroup}`);
      if (i != null) hits.push(i);
    }
  }
  if (!hits.length) return '';
  const from = Math.min(...hits) + 2;
  const to = Math.max(...hits) + 3;

  const err = cell.conflicts.some(c => c.level === 'error');
  const warn = !err && cell.conflicts.length > 0;
  const cls = [
    'g-cell',
    err ? 'is-error' : '',
    warn ? 'is-warn' : '',
    cell.published === false ? 'is-draft' : '',
    cell.status === 'cancelled' ? 'is-cancelled' : '',
  ].filter(Boolean).join(' ');

  return `
    <button class="${cls}" style="grid-row:${row}; grid-column:${from} / ${to}"
      data-cell="${esc(cell.lessonId)}" data-cdate="${esc(cell.date)}">
      <span class="g-cell-name">${esc(cell.discipline)}</span>
      <span class="g-cell-meta">${esc(kindName(cell.kind))} · ${esc(cell.roomLabel)}</span>
      <span class="g-cell-who">${cell.teachers.map(t => esc(t.fio)).join(', ')}</span>
      ${cell.conflicts.length ? `<span class="g-cell-flag">${icon('warn')} ${err ? 'Конфликт' : 'Впритык'}</span>` : ''}
    </button>`;
}

function legend() {
  return `
    <ul class="g-legend">
      <li><span class="lg lg-error"></span>Конфликт — сохранить нельзя</li>
      <li><span class="lg lg-warn"></span>Предупреждение — можно подтвердить</li>
      <li><span class="lg lg-draft"></span>Черновик, не опубликован</li>
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

    const cell = e.target.closest('[data-cell]');
    if (cell) {
      openConflictSheet(cell.dataset.cell, cell.dataset.cdate, grid,
        { onChanged: () => renderGrid(host, { quiet: true }) });
    }
  });
}
