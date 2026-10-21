/* Журнал: кто, когда и что поменял — и что было до этого.

   Каждая правка в админке пишет сюда запись с полными «до» и «после».
   Экран показывает разницу словами («Аудитория: Ауд. 133 → Ауд. 212»),
   фильтр по администратору и по группе. На показе вопрос «а кто это
   внёс» звучит всегда. */

import * as api from '../../data/api.js';
import { emptyArc, spinner } from '../../ui/arc.js';
import { esc } from '../../ui/search.js';
import { stamp, dowShort } from '../../ui/format.js';
import { listen } from '../../ui/listen.js';

const ACTIONS = {
  create: 'добавил', update: 'изменил', delete: 'удалил', publish: 'опубликовал',
};
const ENTITIES = {
  Lesson: 'занятие', Change: 'изменение на дату', Term: 'расписание семестра',
};
// «изменил изменение на дату» читается как опечатка — для замен свои глаголы.
const CHANGE_VERBS = { create: 'внёс', update: 'поправил', delete: 'снял' };

let who = null;
let group = null;

export async function renderAudit(host) {
  host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;

  const [list, index] = await Promise.all([api.getAudit({ limit: 100 }), api.getIndex()]);
  const admins = [...new Map(list.map(a => [a.adminId, a.admin])).entries()];
  const codeOf = new Map(index.units.flatMap(u => u.groups).map(g => [g.id, g.code]));
  const groups = [...new Set(list.flatMap(a => a.groupIds))]
    .map(id => [id, codeOf.get(id) || id]).sort((a, b) => a[1].localeCompare(b[1]));
  if (group && !groups.some(([id]) => id === group)) group = null;
  const shown = list.filter(a => (!who || a.adminId === who) && (!group || a.groupIds.includes(group)));

  host.innerHTML = `
    <div class="page">
      <header class="page-hdr">
        <h1 class="page-title">Журнал</h1>
        <p class="page-sub">${shown.length} ${plural(shown.length)} за последнюю неделю</p>
      </header>

      <div class="log-filters">
        <div class="chips-row" role="group" aria-label="Администратор">
          <button class="fchip${!who ? ' is-on' : ''}" data-who="">Все</button>
          ${admins.map(([id, a]) => `<button class="fchip${who === id ? ' is-on' : ''}" data-who="${id}">${esc(a?.fio || id)}</button>`).join('')}
        </div>
        <select class="lf-input log-group" data-group aria-label="Группа">
          <option value="">Все группы</option>
          ${groups.map(([id, code]) => `<option value="${esc(id)}"${group === id ? ' selected' : ''}>${esc(code)}</option>`).join('')}
        </select>
      </div>

      ${shown.length ? `<ul class="log">${shown.map(row).join('')}</ul>` : `
        <div class="stub stub-empty">
          <div class="stub-arc">${emptyArc(110)}</div>
          <p class="stub-title">Записей нет</p>
          <p>Снимите фильтр.</p>
        </div>`}
    </div>`;

  listen(host, 'change', (e) => {
    if (e.target.matches('[data-group]')) { group = e.target.value || null; renderAudit(host); }
  });
  listen(host, 'click', (e) => {
    const t = e.target.closest('[data-who]');
    if (t) { who = t.dataset.who || null; renderAudit(host); }
  });
}

function row(a) {
  const [date] = String(a.at).split('T');
  // Отмена правки — тоже правка, но читается иначе: «вернул как было».
  const verb = a.revertOf ? 'вернул как было:'
    : (a.entity === 'Change' && CHANGE_VERBS[a.action]) || ACTIONS[a.action] || a.action;
  return `
    <li class="log-row">
      <span class="log-when">
        <b>${esc(stamp(a.at).split(', ')[1] || '')}</b>
        <span class="sh-dim">${esc(dowShort(date))} ${esc(stamp(a.at).split(', ')[0])}</span>
      </span>
      <span class="log-body">
        <span class="log-who">${esc(a.admin?.fio || a.adminId)}</span>
        <span class="log-what">${esc(verb)} ${esc(ENTITIES[a.entity] || a.entity)}${a.note ? ` · ${esc(a.note)}` : ''}</span>
        ${a.title ? `<span class="log-title">${esc(a.title)}</span>` : ''}
        ${a.details.length ? `<ul class="pub-diff">${a.details.map(d => `
          <li><span class="pub-diff-label">${esc(d.label)}:</span>
            ${d.from ? `<span class="pub-was">${esc(d.from)}</span> → ` : ''}<span>${esc(d.to)}</span></li>`).join('')}</ul>` : ''}
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
