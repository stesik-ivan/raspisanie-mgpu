/* Изменение на дату: отменить, заменить преподавателя, сменить аудиторию,
   перенести. Действует сразу, без публикации: студенты видят его, как
   только админ нажал «Внести».

   Проверка та же, что у формы занятия, и та же панель: при каждой правке
   поля — конфликты и свободные аудитории. */

import * as api from '../../data/api.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { shortDate, dowShort, changeNote } from '../../ui/format.js';
import { humanError } from '../../data/errors.js';
import { weekdayOf } from '../../domain/dates.js';
import { checkPanel } from './check-panel.js';

const TYPES = [
  ['cancel', 'Отмена'], ['teacher', 'Замена'], ['room', 'Аудитория'], ['move', 'Перенос'],
];
const REASONS = {
  cancel: 'преподаватель на конференции', teacher: 'больничный',
  room: 'ремонт аудитории', move: 'совмещение с мероприятием',
};
const TITLES = { cancel: 'Отменено', teacher: 'Замена преподавателя', room: 'Другая аудитория', move: 'Перенос' };

/**
 * @param {{lessonId:string, date:string, onChanged?:Function}} o
 *   date — исходная дата вхождения (у перенесённого — откуда перенесли)
 */
export async function openChangeForm({ lessonId, date, onChanged = null }) {
  try {
    const data = await api.getChangeContext(lessonId, date);
    if (!data.canEdit) { toast('Это расписание правит другой администратор'); return; }
    openSheet({
      title: `Изменение на ${shortDate(date)}`,
      html: formHtml(data),
      onMount: (el) => bind(el, data, onChanged),
    });
  } catch (err) {
    console.error('change-form: не открылась', err);
    toast(humanError(err));
  }
}

function formHtml(data) {
  const b = data.before;
  return `
    <div class="cf-summary">
      <p class="cf-summary-name">${esc(b.discipline)} <span class="sh-dim">${esc(b.groups.map(g => g.code).join(' + '))}${b.subgroup ? `, подгр. ${esc(b.subgroup)}` : ''}</span></p>
      <p class="sh-dim">${esc(dowShort(b.date))}, ${esc(shortDate(b.date))} · ${esc(b.start)}–${esc(b.end)} · ${b.slot} пара · ${esc(b.roomLabel)} · ${esc(b.teachers.map(t => t.fio).join(', '))}</p>
      ${data.changes.length ? `<p class="cf-now">Сейчас: ${esc(changeNote(data.current))}</p>` : ''}
    </div>

    ${data.changes.length ? `
      <ul class="cf-existing">${data.changes.map(c => `
        <li><span>${esc(TITLES[c.type] || c.type)}${c.reason ? ` <span class="sh-dim">· ${esc(c.reason)}</span>` : ''}</span>
          <button type="button" class="btn btn-ghost" data-del-change="${esc(c.id)}">Снять</button></li>`).join('')}
      </ul>` : ''}

    <form class="lf" data-form novalidate>
      <fieldset class="lf-field">
        <legend class="lf-label">Что изменить</legend>
        <div class="segmented">${TYPES.map(([v, t], i) => `
          <label class="seg${i === 0 ? ' is-on' : ''}"><input class="vh" type="radio" name="type" value="${v}"${i === 0 ? ' checked' : ''}>${t}</label>`).join('')}
        </div>
      </fieldset>

      <div data-fields>${fieldsHtml('cancel', data)}</div>

      <label class="lf-field">
        <span class="lf-label">Причина <span class="lf-note">студенты её увидят</span></span>
        <input class="lf-input" name="reason" autocomplete="off" maxlength="80" placeholder="${esc(REASONS.cancel)}">
      </label>

      <p class="cf-target" data-target></p>
      <section class="lf-check" data-check aria-live="polite"></section>

      <div class="lf-foot">
        <button type="submit" class="btn btn-primary lf-save" data-save disabled>Внести изменение</button>
      </div>
    </form>`;
}

function fieldsHtml(type, data) {
  const b = data.before, refs = data.refs;
  if (type === 'cancel') {
    return '<p class="lf-hint">Пара останется в расписании зачёркнутой, студенты увидят причину.</p>';
  }
  if (type === 'teacher') {
    const list = refs.teachers.filter(t => !b.teacherIds.includes(t.id));
    return `
      <label class="lf-field"><span class="lf-label">Кто заменит</span>
        <select class="lf-input" name="teacher">
          <option value="">Выберите…</option>
          <optgroup label="${esc(refs.unit?.short || 'Свои')}">${options(list.filter(t => t.own))}</optgroup>
          <optgroup label="Другие подразделения">${options(list.filter(t => !t.own))}</optgroup>
        </select></label>`;
  }
  if (type === 'room') {
    return `
      <div class="lf-field">
        <span class="lf-label">Свободно в ${esc(b.start)}–${esc(b.end)}${b.building ? `, ${esc(b.building.code)}` : ''}</span>
        <div class="room-picks" data-free-now><span class="lf-hint">Ищу…</span></div>
      </div>
      <label class="lf-field"><span class="lf-label">Или любая</span>
        <select class="lf-input" name="room">
          <option value="">Выберите…</option>
          ${refs.rooms.filter(r => r.id !== b.roomId).map(r =>
            `<option value="${esc(r.id)}">${esc(r.kind === 'online' ? r.name : `${r.building} · ${r.name}`)}</option>`).join('')}
        </select></label>`;
  }
  return `
    <div class="lf-field">
      <span class="lf-label">Куда перенести</span>
      <label class="lf-date"><span>дата</span>
        <input type="date" name="moveDate" min="${refs.term.from}" max="${refs.term.to}" value="${esc(b.date)}"></label>
    </div>
    <fieldset class="lf-field">
      <legend class="lf-label">Пара</legend>
      <div class="lf-chips" data-move-slots>${slotChips(refs, b.date, null)}</div>
    </fieldset>`;
}

function options(list) {
  return list.map(t => `<option value="${esc(t.id)}">${esc(t.fio)}, ${esc(t.position)}</option>`).join('');
}

function slotChips(refs, date, current) {
  const slots = refs.bells[weekdayOf(date)] || [];
  if (!slots.length) return '<p class="lf-hint">В этот день пар нет. Выберите другую дату.</p>';
  return slots.map(s => `<label class="lchip"><input class="vh" type="radio" name="moveSlot" value="${s.n}"${s.n === current ? ' checked' : ''}><span>${s.n} · ${esc(s.start)}</span></label>`).join('');
}

function bind(el, data, onChanged) {
  const form = el.querySelector('[data-form]');
  const q = (s) => form.querySelector(s);
  const b = data.before;
  let ack = false, seq = 0, timer = null;

  function read() {
    const type = q('[name="type"]:checked').value;
    const patch = {};
    if (type === 'teacher' && q('[name="teacher"]')?.value) patch.teacherIds = [q('[name="teacher"]').value];
    if (type === 'room' && q('[name="room"]')?.value) patch.roomId = q('[name="room"]').value;
    if (type === 'move') {
      patch.date = q('[name="moveDate"]')?.value || null;
      patch.slot = Number(q('[name="moveSlot"]:checked')?.value) || null;
    }
    return { lessonId: b.lessonId, date: b.date, type, patch, reason: q('[name="reason"]').value.trim() };
  }

  async function check() {
    const my = ++seq;
    const draft = read();
    try {
      const r = await api.checkChangeDraft(draft);
      if (my !== seq) return;
      const p = checkPanel(r, { ack, freeTitle: 'Свободны в это время:' });
      q('[data-check]').innerHTML = p.html;
      q('[data-save]').disabled = !p.canSave;
      const t = r.target;
      q('[data-target]').textContent = t && draft.type === 'move'
        ? `Новое время: ${dowShort(t.date)}, ${shortDate(t.date)}, ${t.start}–${t.end}` : '';
    } catch (err) {
      console.error('change-form: проверка не прошла', err);
      q('[data-check]').innerHTML = `<p class="cf cf-error"><span class="cf-ico">${icon('warn')}</span><span>Не удалось проверить: ${esc(humanError(err))}</span></p>`;
      q('[data-save]').disabled = true;
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(check, 150); };

  async function fillFreeNow() {
    const host = q('[data-free-now]');
    if (!host) return;
    try {
      const free = await api.getFreeRoomsAt({ date: b.date, start: b.start, end: b.end, buildingId: b.room?.buildingId, kind: b.room?.kind });
      const list = free.filter(r => r.id !== b.roomId).slice(0, 8);
      host.innerHTML = list.length
        ? list.map(r => `<button type="button" class="room-pick" data-pick-room="${esc(r.id)}" aria-label="Поставить в ${esc(r.name)}">${esc(r.name)}</button>`).join('')
        : '<span class="lf-hint">Свободных аудиторий этого типа в корпусе нет. Выберите любую в списке ниже.</span>';
    } catch (err) {
      console.error('change-form: не нашёл свободные аудитории', err);
      host.innerHTML = '';
    }
  }

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'ack') { ack = t.checked; check(); return; }
    ack = false;
    if (t.name === 'type') {
      form.querySelectorAll('[name="type"]').forEach(i => i.closest('.seg').classList.toggle('is-on', i.checked));
      q('[data-fields]').innerHTML = fieldsHtml(t.value, data);
      q('[name="reason"]').placeholder = REASONS[t.value];
      if (t.value === 'room') fillFreeNow();
    }
    if (t.name === 'moveDate' && t.value) q('[data-move-slots]').innerHTML = slotChips(data.refs, t.value, null);
    schedule();
  });
  form.addEventListener('input', (e) => { if (e.target.name === 'reason') schedule(); });

  form.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick-room]');
    if (!pick) return;
    // Тап по свободной — то же, что выбрать её в списке.
    const sel = q('[name="room"]');
    if (sel) {
      sel.value = pick.dataset.pickRoom;
      form.querySelectorAll('[data-pick-room]').forEach(x => x.setAttribute('aria-pressed', String(x === pick)));
    }
    ack = false;
    check();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = q('[data-save]');
    btn.disabled = true;
    try {
      const { auditId } = await api.saveChange(read());
      closeSheet();
      await onChanged?.();
      toast('Изменение внесено. Студенты уже видят', { label: 'Отменить', fn: () => undo(auditId, onChanged) });
    } catch (err) {
      console.error('change-form: не сохранил', err);
      toast(humanError(err));
      check();
    }
  });

  el.querySelectorAll('[data-del-change]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const { auditId } = await api.deleteChange(btn.dataset.delChange);
      closeSheet();
      await onChanged?.();
      toast('Изменение снято', { label: 'Отменить', fn: () => undo(auditId, onChanged) });
    } catch (err) {
      console.error('change-form: не снял изменение', err);
      btn.disabled = false;
      toast(humanError(err));
    }
  }));

  check();
}

async function undo(auditId, onChanged) {
  try {
    await api.revert(auditId);
    await onChanged?.();
    toast('Отменено');
  } catch (err) {
    console.error('change-form: не отменил', err);
    toast(humanError(err));
  }
}
