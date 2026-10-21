/* Поле «Даты» в форме занятия.

   Правило дат — то, как его пишет учебная часть: «каждую неделю с 09.09
   по 28.10 и с 11.11 по 23.12», «через неделю», «07.09, 21.09», «кроме
   04.11». Переключатель задаёт шаг для всех диапазонов, отдельные даты
   добавляются к ним, исключения вычитаются. Под полем — мини-календарь
   семестра: видно, что получилось, без чтения правила. */

import { esc } from '../../ui/search.js';
import { icon } from '../../ui/icons.js';
import { parseDayList, formatDayList, addDays, weekdayOf, compareIso } from '../../domain/dates.js';

const MODES = [
  { every: 1, label: 'Каждую неделю' },
  { every: 2, label: 'Через неделю' },
  { every: 0, label: 'По датам' },
];

/** Правило → значения полей. Шаг берётся у первого диапазона. */
function toForm(rule) {
  const ranges = (rule?.parts || []).filter(p => p.type === 'range');
  const list = (rule?.parts || []).filter(p => p.type === 'dates').flatMap(p => p.list || []);
  return {
    every: ranges.length ? (ranges[0].everyWeeks === 2 ? 2 : 1) : (list.length ? 0 : 1),
    ranges: ranges.map(r => ({ from: r.from, to: r.to || '' })),
    list: formatDayList([...new Set(list)].sort(compareIso)),
    except: formatDayList(rule?.except || []),
  };
}

/**
 * @param {object} rule DateRule
 * @param {{from:string, to:string}} term
 */
export function dateRuleHtml(rule, term) {
  const f = toForm(rule);
  if (!f.ranges.length) f.ranges.push({ from: '', to: '' });
  return `
    <fieldset class="lf-field lf-rule" data-rule>
      <legend class="lf-label">Даты</legend>
      <div class="segmented" role="radiogroup" aria-label="Как повторяется">
        ${MODES.map(m => `
          <label class="seg${f.every === m.every ? ' is-on' : ''}">
            <input class="vh" type="radio" name="every" value="${m.every}"${f.every === m.every ? ' checked' : ''}>${esc(m.label)}
          </label>`).join('')}
      </div>
      <div class="lf-ranges" data-ranges${f.every === 0 ? ' hidden' : ''}>
        ${f.ranges.map(r => rangeRow(r, term)).join('')}
        <button type="button" class="link lf-add" data-add-range>+ ещё диапазон</button>
        <p class="lf-hint">Если дату «по» не заполнить, занятие пойдёт до конца семестра.</p>
      </div>
      <label class="lf-sub">
        <span class="lf-sub-label" data-list-label>${f.every === 0 ? 'Даты' : 'Ещё отдельные даты'}</span>
        <input class="lf-input" name="list" inputmode="decimal" autocomplete="off" placeholder="07.09, 21.09" value="${esc(f.list)}">
      </label>
      <label class="lf-sub">
        <span class="lf-sub-label">Кроме</span>
        <input class="lf-input" name="except" inputmode="decimal" autocomplete="off" placeholder="04.11" value="${esc(f.except)}">
      </label>
      <div class="lf-cal" data-cal aria-hidden="true"></div>
    </fieldset>`;
}

function rangeRow(r, term) {
  return `
    <div class="lf-range" data-range>
      <label class="lf-date"><span>с</span>
        <input type="date" name="from" min="${term.from}" max="${term.to}" value="${esc(r.from)}" aria-label="Начало диапазона"></label>
      <label class="lf-date"><span>по</span>
        <input type="date" name="to" min="${term.from}" max="${term.to}" value="${esc(r.to)}" aria-label="Конец диапазона"></label>
      <button type="button" class="icon-btn" data-del-range aria-label="Убрать диапазон">${icon('close')}</button>
    </div>`;
}

/**
 * Обработчики внутри поля. Возвращают true, если поле перестроилось —
 * форма тогда перепроверит занятие.
 */
export function handleRuleClick(e, el, term) {
  const box = el.querySelector('[data-ranges]');
  if (e.target.closest('[data-add-range]')) {
    box.querySelector('[data-add-range]').insertAdjacentHTML('beforebegin', rangeRow({ from: '', to: '' }, term));
    box.querySelectorAll('[data-range]:last-of-type input[name="from"]')[0]?.focus();
    return true;
  }
  const del = e.target.closest('[data-del-range]');
  if (del) {
    // Последний диапазон не убираем, а очищаем: иначе нечего будет заполнить.
    if (box.querySelectorAll('[data-range]').length > 1) del.closest('[data-range]').remove();
    else del.closest('[data-range]').querySelectorAll('input').forEach(i => { i.value = ''; });
    return true;
  }
  return false;
}

/** Переключатель режима: подсветка и видимость диапазонов. */
export function syncRuleMode(el) {
  const every = Number(el.querySelector('input[name="every"]:checked')?.value ?? 1);
  el.querySelectorAll('[data-rule] .seg').forEach(s => s.classList.toggle('is-on', s.querySelector('input').checked));
  el.querySelector('[data-ranges]').hidden = every === 0;
  el.querySelector('[data-list-label]').textContent = every === 0 ? 'Даты' : 'Ещё отдельные даты';
}

/**
 * Поля → DateRule. bad — то, что не удалось разобрать, для панели проверки.
 * @returns {{rule:object, bad:string[]}}
 */
export function readRule(el, term) {
  const t = { termFrom: term.from, termTo: term.to };
  const every = Number(el.querySelector('input[name="every"]:checked')?.value ?? 1);
  const parts = [];
  if (every) {
    for (const row of el.querySelectorAll('[data-range]')) {
      const from = row.querySelector('[name="from"]').value;
      const to = row.querySelector('[name="to"]').value;
      if (from) parts.push({ type: 'range', from, to: to || null, everyWeeks: every });
    }
  }
  const list = parseDayList(el.querySelector('[name="list"]').value, t);
  const except = parseDayList(el.querySelector('[name="except"]').value, t);
  if (list.dates.length) parts.push({ type: 'dates', list: list.dates });
  return { rule: { parts, except: except.dates }, bad: [...list.bad, ...except.bad] };
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Мини-календарь семестра: занятия — заливка, исключения — перечёркнуты. */
export function renderCalendar(el, { dates, except, term, today }) {
  const host = el.querySelector('[data-cal]');
  if (!host) return;
  const on = new Set(dates || []), off = new Set(except || []);
  const months = [];
  let cur = `${term.from.slice(0, 7)}-01`;
  while (compareIso(cur, term.to) <= 0) {
    months.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  }
  host.innerHTML = months.map(first => {
    const cells = [];
    for (let i = 1; i < weekdayOf(first); i++) cells.push('<span></span>');
    for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) {
      const cls = [on.has(d) ? 'is-on' : '', off.has(d) ? 'is-off' : '', d === today ? 'is-today' : '',
        compareIso(d, term.from) < 0 || compareIso(d, term.to) > 0 ? 'is-out' : ''].filter(Boolean).join(' ');
      cells.push(`<span class="${cls}">${Number(d.slice(8))}</span>`);
    }
    return `<div class="cal-m"><p class="cal-name">${MONTHS[Number(first.slice(5, 7)) - 1]}</p>
      <div class="cal-g">${['п', 'в', 'с', 'ч', 'п', 'с', 'в'].map(x => `<b>${x}</b>`).join('')}${cells.join('')}</div></div>`;
  }).join('');
}
