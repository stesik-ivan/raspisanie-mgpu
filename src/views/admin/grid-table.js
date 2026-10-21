/* Таблица сетки: группы × дни и пары. Только разметка, без обработчиков.

   Устроена как файл учебной части: группа сверху, под ней подгруппы,
   по колонке на каждую. Между группами промежуток шире, чем между
   подгруппами одной группы, а пустые клетки соседних групп разного
   оттенка, иначе на широкой неделе колонки сливаются.

   Поток растягивается на колонки своих групп, как объединённая ячейка
   в Excel. Но группы потока не обязаны стоять рядом: между ГШТ-261 и
   УЧБИХ-261 может оказаться МПБ-261м. Тогда поток рисуется кусками,
   по куску на каждую подряд идущую часть, и чужую пару не закрывает. */

import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { dowFull, kindName, shortDate } from '../../ui/format.js';
import { addDays } from '../../domain/dates.js';

const DAYS = [1, 2, 3, 4, 5, 6];
const TIME_COL = '64px';
const GROUP_GAP = '10px';
const CELL_COL = 'minmax(148px, 1fr)';

/** Колонки: группа, а если у неё есть подгруппы — по колонке на подгруппу. */
function columnsOf(groups) {
  const cols = [];
  groups.forEach((g, gi) => {
    for (const s of g.subgroups?.length ? g.subgroups : [null]) {
      cols.push({ groupId: g.id, code: g.code, subgroup: s, gi });
    }
  });
  return cols;
}

/* Линии CSS-сетки: первая колонка — время, перед каждой группой, кроме
   первой, — узкая пустая колонка-промежуток. line[i] — линия начала
   логической колонки i. */
function layoutOf(cols) {
  const line = [];
  const template = [TIME_COL];
  let next = 2;
  cols.forEach((c, i) => {
    if (i > 0 && c.gi !== cols[i - 1].gi) { template.push(GROUP_GAP); next++; }
    template.push(CELL_COL);
    line[i] = next++;
  });
  return { line, template: template.join(' ') };
}

/** Колонки, которые занимает ячейка, разбитые на подряд идущие куски. */
function runsOf(cell, cols) {
  const hits = new Set();
  for (const gid of cell.groupIds) {
    cols.forEach((c, i) => {
      if (c.groupId === gid && (cell.subgroup == null || c.subgroup === cell.subgroup)) hits.add(i);
    });
  }
  const sorted = [...hits].sort((a, b) => a - b);
  const runs = [];
  for (const i of sorted) {
    const last = runs.at(-1);
    if (last && i === last[1] + 1) last[1] = i; else runs.push([i, i]);
  }
  return runs;
}

/**
 * @param {object} grid ответ api.getGridView
 * @param {boolean} mine своя зона: пустые клетки — кнопки «добавить»
 */
export function gridTable(grid, mine) {
  const cols = columnsOf(grid.groups);
  const { line, template } = layoutOf(cols);
  const hasSub = cols.some(c => c.subgroup != null);
  const out = [];

  // Шапка: группа над своими подгруппами. Без подгрупп — на две строки.
  out.push(`<div class="g-corner" style="grid-row:1 / ${hasSub ? 3 : 2}"></div>`);
  grid.groups.forEach((g, gi) => {
    const own = cols.map((c, i) => [c, i]).filter(([c]) => c.groupId === g.id);
    const from = line[own[0][1]], to = line[own.at(-1)[1]] + 1;
    const rows = hasSub && !g.subgroups?.length ? '1 / 3' : '1';
    out.push(`<div class="g-group band-${gi % 2}" style="grid-row:${rows}; grid-column:${from} / ${to}">${esc(g.code)}</div>`);
    if (hasSub && g.subgroups?.length) {
      for (const [c, i] of own) {
        out.push(`<div class="g-sub band-${gi % 2}" style="grid-row:2; grid-column:${line[i]}">подгр. ${esc(c.subgroup)}</div>`);
      }
    }
  });

  let row = hasSub ? 3 : 2;
  for (const weekday of DAYS) {
    const date = addDays(grid.from, weekday - 1);
    out.push(`<div class="g-day" style="grid-row:${row}" role="rowheader">
      <span class="g-day-label">${esc(dowFull(date))} <span class="sh-dim">${esc(shortDate(date))}</span></span></div>`);
    row++;

    for (const slot of grid.bells) {
      out.push(`<div class="g-time" style="grid-row:${row}">
        <b>${slot.n}</b><span>${esc(slot.start)}</span><span class="sh-dim">${esc(slot.end)}</span></div>`);

      const busy = new Set();
      for (const cell of grid.cells.filter(c => c.date === date && c.slot === slot.n)) {
        const runs = runsOf(cell, cols);
        for (const [a, b] of runs) {
          for (let i = a; i <= b; i++) busy.add(i);
          out.push(cellBox(cell, row, line[a], line[b] + 1, runs.length > 1 ? streamNote(cell, cols, a, b) : ''));
        }
      }

      // Пустая клетка — полоса цвета своей группы. В своей зоне это кнопка
      // «добавить» с готовыми днём, парой и группой.
      cols.forEach((c, i) => {
        if (busy.has(i)) return;
        const place = `style="grid-row:${row}; grid-column:${line[i]}"`;
        out.push(mine
          ? `<button class="g-slot g-add-slot band-${c.gi % 2}" ${place}
              data-new data-gid="${esc(c.groupId)}" data-sub="${esc(c.subgroup ?? '')}" data-wd="${weekday}" data-slot="${slot.n}" data-date="${date}"
              aria-label="Добавить занятие: ${esc(c.code)}${c.subgroup ? `, подгруппа ${esc(c.subgroup)}` : ''}, ${esc(dowFull(date))}, ${slot.n} пара">${icon('plus')}</button>`
          : `<div class="g-slot band-${c.gi % 2}" ${place}></div>`);
      });
      row++;
    }
  }

  return `
    <div class="g-wrap" data-drag>
      <div class="g" style="grid-template-columns:${template}">${out.join('')}</div>
    </div>`;
}

/* Подпись у куска разорванного потока: с кем он ещё идёт. */
function streamNote(cell, cols, a, b) {
  const here = new Set(cols.slice(a, b + 1).map(c => c.groupId));
  const others = cell.groups.filter(g => !here.has(g.id)).map(g => g.code);
  return others.length ? `Поток, ещё ${others.join(', ')}` : '';
}

function cellBox(cell, row, from, to, note) {
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
      ${note ? `<span class="g-cell-stream">${esc(note)}</span>` : ''}
      ${cell.conflicts.length ? `<span class="g-cell-flag">${icon('warn')} ${err ? 'Конфликт' : 'Впритык'}</span>` : ''}
    </button>`;
}
