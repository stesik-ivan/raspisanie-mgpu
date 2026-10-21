/* Разбор ячейки сетки: что это за занятие и, если есть конфликт,
   с кем именно оно пересеклось и куда его можно переставить.

   Тексты конфликтов приходят готовыми из domain/conflicts.js. Они написаны
   так, чтобы их можно было прочитать вслух: на показе именно это и
   произойдёт. */

import * as api from '../../data/api.js';
import { openSheet } from '../../ui/sheet.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { kindName, longDate, shortDate } from '../../ui/format.js';

export async function openConflictSheet(lessonId, date, grid) {
  const cell = grid.cells.find(c => c.lessonId === lessonId && c.date === date);
  if (!cell) return;

  const err = cell.conflicts.filter(c => c.level === 'error');
  const warn = cell.conflicts.filter(c => c.level === 'warning');

  openSheet({
    title: cell.discipline,
    html: `
      <div class="sh-hero${err.length ? ' is-error' : ''}">
        <p class="sh-kind">${esc(kindName(cell.kind))}${cell.published === false ? ' · черновик' : ''}</p>
        <p class="sh-when">${esc(longDate(cell.date))}</p>
        <p class="sh-time">${esc(cell.start)} – ${esc(cell.end)} <span class="sh-dim">· ${cell.slot} пара</span></p>
      </div>

      <dl class="sh-rows">
        <div class="sh-row"><dt>${icon('pin')} Где</dt>
          <dd>${esc(cell.roomLabel)}${cell.building ? `<span class="sh-dim">${esc(cell.building.code)}, ${esc(cell.building.address)}</span>` : ''}</dd></div>
        <div class="sh-row"><dt>${icon('teacher')} Кто ведёт</dt>
          <dd>${cell.teachers.map(t => `${esc(t.fio)} <span class="sh-dim">${esc(t.position)}</span>`).join('<br>') || '—'}</dd></div>
        <div class="sh-row"><dt>${icon('grid')} Группы</dt>
          <dd>${cell.groups.map(g => esc(g.code)).join(' + ')}${cell.subgroup ? `, подгруппа ${esc(cell.subgroup)}` : ''}</dd></div>
      </dl>

      ${err.length ? problem('Конфликт', err, 'error') : ''}
      ${warn.length ? problem('Предупреждение', warn, 'warn') : ''}
      ${!cell.conflicts.length ? `<p class="sh-ok">${icon('clock')} Конфликтов нет</p>` : ''}

      <div class="sh-free" data-free></div>
    `,
    onMount: (el) => { if (err.length) fillFreeRooms(el, cell); },
  });
}

function problem(title, list, kind) {
  return `
    <section class="sh-sect">
      <h3 class="sh-sect-title">${esc(title)}</h3>
      <ul class="cf-list">
        ${list.map(c => `<li class="cf cf-${kind}"><span class="cf-ico">${icon('warn')}</span>
          <span>${esc(c.message)}</span></li>`).join('')}
      </ul>
      ${kind === 'error'
        ? '<p class="sh-text">В Excel этого не видно: пара и урок стоят под разными номерами, а идут в одно время в одной аудитории.</p>'
        : '<p class="sh-text">Сохранить можно, но лучше знать заранее.</p>'}
    </section>`;
}

/* Свободные аудитории того же типа в том же корпусе — чтобы конфликт
   можно было не просто увидеть, а сразу решить. */
async function fillFreeRooms(el, cell) {
  const host = el.querySelector('[data-free]');
  if (!host || !cell.room) return;
  try {
    const free = await api.getFreeRoomsAt({
      date: cell.date, start: cell.start, end: cell.end,
      buildingId: cell.room.buildingId, kind: cell.room.kind,
    });
    host.innerHTML = `
      <section class="sh-sect">
        <h3 class="sh-sect-title">Свободно в это время${cell.building ? `, ${esc(cell.building.code)}` : ''}</h3>
        ${free.length
          ? `<ul class="date-chips">${free.map(r => `<li class="date-chip">${esc(r.name)}</li>`).join('')}</ul>
             <p class="sh-text sh-dim">В боевой версии — переставить в один тап.</p>`
          : '<p class="sh-text sh-dim">Свободных аудиторий того же типа в этом корпусе нет.</p>'}
      </section>`;
  } catch (err) {
    console.error('conflict-sheet: не собрал свободные аудитории', err);
    host.innerHTML = '';
  }
}
