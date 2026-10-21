/* Форма занятия: создать, изменить, удалить.

   Проверка конфликтов идёт прямо при вводе: каждое изменение поля через
   150 мс отправляет черновик в api.checkLessonDraft, и панель внизу
   отвечает «Конфликтов нет» или объясняет, с кем пересечение и куда
   можно пересесть в один тап. Ничего не сохраняется, пока не нажата
   кнопка, — и кнопка неактивна, пока есть ошибка.

   Источник истины — сами поля формы: read() собирает занятие из DOM.
   Отдельного объекта состояния нет, и рассинхронизироваться нечему. */

import * as api from '../../data/api.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { kindName } from '../../ui/format.js';
import { humanError } from '../../data/errors.js';
import { dateRuleHtml, handleRuleClick, syncRuleMode, readRule, renderCalendar } from './date-rule-field.js';
import { checkPanel } from './check-panel.js';

const KINDS = { vo: ['лк', 'пр', 'лб', 'конс', 'зач', 'экз'], spo: ['урок', 'внеуроч', 'конс', 'экз'] };
const DAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб']];

/**
 * @param {{unitId:string, lessonId?:string, preset?:object, from?:string, onChanged?:Function}} o
 *   preset — поля нового занятия, например из пустой клетки сетки;
 *   from — с какой даты оно идёт (дата этой клетки)
 */
export async function openLessonForm({ unitId, lessonId = null, preset = {}, from = null, onChanged = null }) {
  let lesson = null;
  try {
    if (lessonId) {
      const got = await api.getLesson(lessonId);
      if (!got) { toast('Занятие не найдено: его удалили'); return; }
      if (!got.canEdit) { toast('Это расписание правит другой администратор'); return; }
      lesson = got.lesson;
      unitId = got.unitId;
    }
    const refs = await api.getLessonFormRefs(unitId);
    const start = lesson || defaults(refs, preset, from);
    openSheet({
      title: lesson ? 'Изменить занятие' : 'Новое занятие',
      html: formHtml(start, refs, !!lesson),
      onMount: (el) => bind(el, refs, lesson, onChanged),
    });
  } catch (err) {
    console.error('lesson-form: не открылась', err);
    toast(humanError(err));
  }
}

function defaults(refs, preset, cellDate) {
  // Новое занятие начинается с даты клетки, по которой нажали: иначе оно
  // встанет со следующей недели, и в открытой сетке его не будет видно.
  // Без клетки — с сегодняшнего дня, а не с 1 сентября: прошлые даты
  // задним числом не ставят.
  const inTerm = (d) => d && d >= refs.term.from && d <= refs.term.to;
  const from = inTerm(cellDate) ? cellDate : inTerm(refs.today) ? refs.today : refs.term.from;
  return {
    disciplineId: '', kind: KINDS[refs.unit?.kind || 'vo'][0], groupIds: [], subgroup: null,
    teacherIds: [], roomId: '', weekday: 1, slot: 1,
    dateRule: { parts: [{ type: 'range', from, to: null, everyWeeks: 1 }], except: refs.holidays.filter(h => h >= from) },
    ...preset,
  };
}

/* ---------- разметка ---------- */

function formHtml(l, refs, isEdit) {
  const kinds = [...new Set([...KINDS[refs.unit?.kind || 'vo'], l.kind].filter(Boolean))];
  return `
    <form class="lf" data-form novalidate>
      <label class="lf-field">
        <span class="lf-label">Дисциплина</span>
        <select class="lf-input" name="disciplineId">
          <option value="">Выберите…</option>
          ${refs.disciplines.map(d => `<option value="${esc(d.id)}"${d.id === l.disciplineId ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </label>

      <fieldset class="lf-field">
        <legend class="lf-label">Вид</legend>
        <div class="lf-chips">${kinds.map(k => chip('radio', 'kind', k, kindName(k), k === l.kind)).join('')}</div>
      </fieldset>

      <fieldset class="lf-field">
        <legend class="lf-label">Группы <span class="lf-note">несколько — поток</span></legend>
        <div class="lf-chips">${refs.groups.map(g => chip('checkbox', 'group', g.id, g.code, l.groupIds.includes(g.id))).join('')}</div>
      </fieldset>

      <div data-sub>${subgroupHtml(refs, l.groupIds, l.subgroup)}</div>

      <fieldset class="lf-field">
        <legend class="lf-label">Преподаватель</legend>
        <ul class="lf-tlist" data-teachers>${l.teacherIds.map(id => teacherItem(refs, id)).join('')}</ul>
        <select class="lf-input" data-add-teacher aria-label="Добавить преподавателя">
          <option value="">+ Добавить преподавателя</option>
          <optgroup label="${esc(refs.unit?.short || 'Свои')}">${teacherOptions(refs.teachers.filter(t => t.own))}</optgroup>
          <optgroup label="Другие подразделения">${teacherOptions(refs.teachers.filter(t => !t.own))}</optgroup>
        </select>
      </fieldset>

      <label class="lf-field">
        <span class="lf-label">Аудитория</span>
        <select class="lf-input" name="roomId">
          <option value="">Выберите…</option>
          ${roomOptions(refs.rooms, l.roomId)}
        </select>
      </label>

      <fieldset class="lf-field">
        <legend class="lf-label">День</legend>
        <div class="segmented">${DAYS.map(([n, s]) => `
          <label class="seg${n === l.weekday ? ' is-on' : ''}"><input class="vh" type="radio" name="weekday" value="${n}"${n === l.weekday ? ' checked' : ''}>${s}</label>`).join('')}
        </div>
      </fieldset>

      <fieldset class="lf-field">
        <legend class="lf-label">Пара</legend>
        <div class="lf-chips" data-slots>${slotsHtml(refs, l.weekday, l.slot)}</div>
      </fieldset>

      ${dateRuleHtml(l.dateRule, refs.term)}

      <section class="lf-check" data-check aria-live="polite"></section>

      <div class="lf-foot">
        ${isEdit ? '<button type="button" class="btn btn-ghost lf-del" data-del>Удалить</button>' : ''}
        <button type="submit" class="btn btn-primary lf-save" data-save disabled>${isEdit ? 'Сохранить' : 'Добавить'}</button>
      </div>
    </form>`;
}

function chip(type, name, value, label, on) {
  return `<label class="lchip"><input class="vh" type="${type}" name="${name}" value="${esc(value)}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
}

/* Подгруппу показываем, только если она есть у всех выбранных групп. */
function subgroupHtml(refs, groupIds, current) {
  const chosen = refs.groups.filter(g => groupIds.includes(g.id));
  const common = chosen.length ? chosen.map(g => g.subgroups).reduce((a, b) => a.filter(x => b.includes(x))) : [];
  if (!common.length) return '';
  const opts = [['', 'Вся группа'], ...common.map(s => [s, `Подгруппа ${s}`])];
  return `
    <fieldset class="lf-field">
      <legend class="lf-label">Подгруппа</legend>
      <div class="lf-chips">${opts.map(([v, t]) => chip('radio', 'subgroup', v, t, (current ?? '') === v)).join('')}</div>
    </fieldset>`;
}

function teacherItem(refs, id) {
  const t = refs.teachers.find(x => x.id === id);
  return `<li class="lf-teacher" data-teacher-id="${esc(id)}">
    <span>${esc(t?.fio || id)} <span class="sh-dim">${esc(t?.position || '')}</span></span>
    <button type="button" class="icon-btn" data-del-teacher aria-label="Убрать ${esc(t?.fio || '')}">${icon('close')}</button></li>`;
}

function teacherOptions(list) {
  return list.map(t => `<option value="${esc(t.id)}">${esc(t.fio)}, ${esc(t.position)}</option>`).join('');
}

function roomOptions(rooms, current) {
  const byBuilding = new Map();
  for (const r of rooms) {
    const key = r.kind === 'online' ? 'Онлайн' : `Корпус ${r.building}`;
    if (!byBuilding.has(key)) byBuilding.set(key, []);
    byBuilding.get(key).push(r);
  }
  return [...byBuilding].map(([label, list]) => `<optgroup label="${esc(label)}">${list.map(r =>
    `<option value="${esc(r.id)}"${r.id === current ? ' selected' : ''}>${esc(r.name)}${KIND_NOTE[r.kind] || ''}</option>`).join('')}</optgroup>`).join('');
}
const KIND_NOTE = { comp: ' · комп.', lab: ' · лаб.', gym: ' · зал' };

function slotsHtml(refs, weekday, current) {
  const slots = refs.bells[weekday] || [];
  if (!slots.length) return '<p class="lf-hint">В этот день пар нет.</p>';
  return slots.map(s => chip('radio', 'slot', String(s.n), `${s.n} · ${s.start}`, s.n === current)).join('');
}

/* ---------- поведение ---------- */

function bind(el, refs, lesson, onChanged) {
  const form = el.querySelector('[data-form]');
  const q = (s) => form.querySelector(s);
  let ack = false, seq = 0, timer = null;

  function read() {
    const { rule, bad } = readRule(form, refs.term);
    return {
      bad,
      fields: {
        disciplineId: q('[name="disciplineId"]').value || null,
        kind: q('[name="kind"]:checked')?.value || null,
        groupIds: [...form.querySelectorAll('[name="group"]:checked')].map(i => i.value),
        subgroup: q('[name="subgroup"]:checked')?.value || null,
        teacherIds: [...form.querySelectorAll('[data-teacher-id]')].map(li => li.dataset.teacherId),
        roomId: q('[name="roomId"]').value || null,
        weekday: Number(q('[name="weekday"]:checked')?.value) || null,
        slot: Number(q('[name="slot"]:checked')?.value) || null,
        dateRule: rule,
      },
    };
  }

  async function check() {
    const my = ++seq;
    const { fields, bad } = read();
    try {
      const r = await api.checkLessonDraft(fields, { lessonId: lesson?.id });
      if (my !== seq) return;   // пока считали, поле уже поменяли
      const p = checkPanel(r, { bad, ack });
      q('[data-check]').innerHTML = p.html;
      q('[data-save]').disabled = !p.canSave;
      renderCalendar(form, { dates: r.dates, except: fields.dateRule.except, term: refs.term, today: refs.today });
    } catch (err) {
      console.error('lesson-form: проверка не прошла', err);
      q('[data-check]').innerHTML = `<p class="cf cf-error"><span class="cf-ico">${icon('warn')}</span><span>Не удалось проверить: ${esc(humanError(err))}</span></p>`;
      q('[data-save]').disabled = true;
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(check, 150); };

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'ack') { ack = t.checked; check(); return; }
    ack = false;   // поля поменялись — подтверждение старых предупреждений не в счёт
    if (t.name === 'group') {
      const cur = q('[name="subgroup"]:checked')?.value || null;
      q('[data-sub]').innerHTML = subgroupHtml(refs, read().fields.groupIds, cur);
    }
    if (t.name === 'weekday') {
      form.querySelectorAll('[name="weekday"]').forEach(i => i.closest('.seg').classList.toggle('is-on', i.checked));
      q('[data-slots]').innerHTML = slotsHtml(refs, Number(t.value), Number(q('[name="slot"]:checked')?.value));
    }
    if (t.name === 'every') syncRuleMode(form);
    if (t.matches('[data-add-teacher]')) {
      if (t.value && !form.querySelector(`[data-teacher-id="${CSS.escape(t.value)}"]`)) {
        q('[data-teachers]').insertAdjacentHTML('beforeend', teacherItem(refs, t.value));
      }
      t.value = '';
    }
    schedule();
  });

  form.addEventListener('input', (e) => {
    if (e.target.matches('[name="list"], [name="except"]')) schedule();
  });

  form.addEventListener('click', (e) => {
    if (handleRuleClick(e, form, refs.term)) { schedule(); return; }
    const delT = e.target.closest('[data-del-teacher]');
    if (delT) { delT.closest('[data-teacher-id]').remove(); schedule(); return; }
    const pick = e.target.closest('[data-pick-room]');
    if (pick) { q('[name="roomId"]').value = pick.dataset.pickRoom; ack = false; check(); return; }
    const del = e.target.closest('[data-del]');
    if (del) remove(del);
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  async function save() {
    const btn = q('[data-save]');
    btn.disabled = true;
    const { fields } = read();
    try {
      const res = lesson
        ? await api.saveLesson(lesson.id, fields, { version: lesson.version })
        : await api.createLesson(fields);
      closeSheet();
      if (!res.auditId) { toast('Ничего не изменилось'); return; }
      await onChanged?.();
      const msg = !lesson ? 'Занятие добавлено в черновик'
        : res.lesson.published ? 'Сохранено' : 'Сохранено в черновик. Студенты увидят после публикации';
      toast(msg, { label: 'Отменить', fn: () => undo(res.auditId, onChanged) });
    } catch (err) {
      console.error('lesson-form: не сохранил', err);
      toast(humanError(err));
      check();
    }
  }

  // Удаление в два тапа: первый спрашивает, второй удаляет. Отдельная
  // шторка подтверждения закрыла бы форму, а с ней и контекст.
  async function remove(btn) {
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm');
      btn.textContent = 'Точно удалить?';
      return;
    }
    btn.disabled = true;
    try {
      const { auditId } = await api.deleteLesson(lesson.id, { version: lesson.version });
      closeSheet();
      await onChanged?.();
      toast(lesson.published === false && !lesson.pub ? 'Черновик удалён' : 'Удалено. Студенты увидят после публикации',
        { label: 'Отменить', fn: () => undo(auditId, onChanged) });
    } catch (err) {
      console.error('lesson-form: не удалил', err);
      btn.disabled = false;
      toast(humanError(err));
    }
  }

  check();
}

async function undo(auditId, onChanged) {
  try {
    await api.revert(auditId);
    await onChanged?.();
    toast('Отменено');
  } catch (err) {
    console.error('lesson-form: не отменил', err);
    toast(humanError(err));
  }
}
