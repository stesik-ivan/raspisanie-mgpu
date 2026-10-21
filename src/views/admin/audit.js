/* Журнал: кто, когда и что поменял. Данные уже есть в сиде, поэтому
   экран сделан сразу — на показе вопрос «а кто это внёс» звучит всегда. */

import * as api from '../../data/api.js';
import { emptyArc, spinner } from '../../ui/arc.js';
import { esc } from '../../ui/search.js';
import { stamp, dowShort } from '../../ui/format.js';

const ACTIONS = {
  create: 'добавил', update: 'изменил', delete: 'удалил', publish: 'опубликовал',
};
const ENTITIES = {
  Lesson: 'занятие', Change: 'изменение на дату', Term: 'расписание семестра',
};

let who = null;

export async function renderAudit(host) {
  host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;

  const [list, index] = await Promise.all([api.getAudit({ limit: 100 }), api.getIndex()]);
  const admins = [...new Map(list.map(a => [a.adminId, a.admin])).entries()];
  const shown = who ? list.filter(a => a.adminId === who) : list;

  host.innerHTML = `
    <div class="page">
      <header class="page-hdr">
        <h1 class="page-title">Журнал</h1>
        <p class="page-sub">${shown.length} ${plural(shown.length)} за последнюю неделю</p>
      </header>

      <div class="chips-row" role="group" aria-label="Администратор">
        <button class="fchip${!who ? ' is-on' : ''}" data-who="">Все</button>
        ${admins.map(([id, a]) => `<button class="fchip${who === id ? ' is-on' : ''}" data-who="${id}">${esc(a?.fio || id)}</button>`).join('')}
      </div>

      ${shown.length ? `<ul class="log">${shown.map(row).join('')}</ul>` : `
        <div class="stub stub-empty">
          <div class="stub-arc">${emptyArc(110)}</div>
          <p class="stub-title">Записей нет</p>
        </div>`}
    </div>`;

  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-who]');
    if (t) { who = t.dataset.who || null; renderAudit(host); }
  });
}

function row(a) {
  const [date] = String(a.at).split('T');
  return `
    <li class="log-row">
      <span class="log-when">
        <b>${esc(stamp(a.at).split(', ')[1] || '')}</b>
        <span class="sh-dim">${esc(dowShort(date))} ${esc(stamp(a.at).split(', ')[0])}</span>
      </span>
      <span class="log-body">
        <span class="log-who">${esc(a.admin?.fio || a.adminId)}</span>
        <span class="log-what">${esc(ACTIONS[a.action] || a.action)} ${esc(ENTITIES[a.entity] || a.entity)}
          <span class="sh-dim">${esc(a.entityId)}</span></span>
      </span>
    </li>`;
}

function plural(n) {
  const x = n % 100, y = x % 10;
  if (x > 10 && x < 20) return 'записей';
  if (y === 1) return 'запись';
  if (y > 1 && y < 5) return 'записи';
  return 'записей';
}
