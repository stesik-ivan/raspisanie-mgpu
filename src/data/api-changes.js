/* Изменения на дату: отмена, замена преподавателя, смена аудитории, перенос.

   В отличие от правки занятия, изменение действует сразу, без публикации:
   замена «сегодня, больничный» не может ждать кнопки. Студент видит его
   на «Сегодня», «Неделе» и в «Изменениях», если само занятие опубликовано.

   Те же три проверки, что у занятия: зона, версия, конфликты. И журнал. */

import { ensure, getCtx, commit, tick } from './session.js';
import { rawOccurrencesOf } from './ctx.js';
import { ApiError } from './errors.js';
import { currentAdmin, assertZone, stamp, writeAudit } from './admin-core.js';
import { decorator } from './decorate.js';
import { getLessonFormRefs } from './api-admin.js';
import { applyChanges } from '../domain/occurrences.js';
import { checkChange, validateChange, sameSlot } from '../domain/changes.js';
import { freeRooms } from '../domain/conflicts.js';

function lessonOf(s, lessonId) {
  const l = s.lessons.find(x => x.id === lessonId && !x.deleted);
  if (!l) throw new ApiError('missing', 'Занятие не найдено: его удалили, пока вы смотрели.');
  return l;
}

const rawOf = (raw, lessonId, date) => raw.find(o => o.lessonId === lessonId && o.date === date) || null;

/**
 * Всё для формы изменения: вхождение до изменений и после уже внесённых,
 * сами изменения, справочники подразделения.
 * @param {string} lessonId
 * @param {string} date исходная дата вхождения (для перенесённого — откуда)
 */
export async function getChangeContext(lessonId, date) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const lesson = lessonOf(s, lessonId);
  let canEdit = true;
  try { assertZone(s, currentAdmin(s), lesson); }
  catch (err) {
    if (!(err instanceof ApiError)) console.error('api-changes: проверка зоны упала', err);
    canEdit = false;
  }
  const raw = rawOccurrencesOf(s);
  const before = rawOf(raw, lessonId, date);
  if (!before) throw new ApiError('missing', 'В этот день занятия нет.');
  const changes = s.changes.filter(c => c.lessonId === lessonId && c.date === date);
  const [now] = applyChanges([before], changes, ctx);
  const decorate = decorator(s, ctx);
  const unitId = s.programs.find(p => p.id === s.groups.find(g => g.id === lesson.groupIds[0])?.programId)?.unitId;

  return {
    canEdit,
    before: decorate(before),
    current: decorate(now),
    changes: changes.map(c => structuredClone(c)),
    refs: await getLessonFormRefs(unitId),
  };
}

/**
 * Живая проверка изменения. Ничего не сохраняет.
 * Форма ответа та же, что у checkLessonDraft: панель проверки общая.
 */
export async function checkChangeDraft(draft) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const raw = rawOccurrencesOf(s);
  const before = rawOf(raw, draft.lessonId, draft.date);
  const problems = validateChange(draft, before);
  const out = { problems, dates: [], warnings: [], conflicts: [], freeRooms: [], target: null };
  if (problems.length) return out;

  const candidate = { ...draft, id: draft.id || '__change__' };
  const { target, conflicts } = checkChange(candidate, { raw, changes: s.changes }, ctx);
  out.conflicts = conflicts.map(c => ({ level: c.level, type: c.type, message: c.message, dates: [c.date] }));
  out.target = target && { date: target.date, slot: target.slot, start: target.start, end: target.end, status: target.status };

  // Куда пересесть при конфликте аудитории: свободные в это время того же
  // корпуса и типа. Без конфликта список не нужен — у формы смены
  // аудитории он свой, над полем выбора.
  if (target && target.status !== 'cancelled' && conflicts.some(c => c.type === 'room' && c.level === 'error')) {
    const others = applyChanges(raw, s.changes.filter(c => !sameSlot(c, candidate)), ctx)
      .filter(o => !(o.lessonId === target.lessonId && o.date === target.date));
    const room = ctx.roomOf(before.roomId);
    out.freeRooms = freeRooms(others, ctx, {
      date: target.date, start: target.start, end: target.end, buildingId: room?.buildingId, kind: room?.kind,
    }).filter(r => r.id !== target.roomId).slice(0, 8).map(r => ({ id: r.id, name: r.name }));
  }
  return out;
}

/**
 * Внести изменение. То же изменение того же типа на ту же дату заменяется.
 * @param {{lessonId:string, date:string, type:string, patch:object, reason?:string}} draft
 */
export async function saveChange(draft) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const admin = currentAdmin(s);
  assertZone(s, admin, lessonOf(s, draft.lessonId));

  const raw = rawOccurrencesOf(s);
  const [problem] = validateChange(draft, rawOf(raw, draft.lessonId, draft.date));
  if (problem) throw new ApiError('invalid', problem.message, { field: problem.field });

  const i = s.changes.findIndex(c => sameSlot(c, draft));
  const before = i >= 0 ? s.changes[i] : null;
  const change = {
    id: before?.id || `CH-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    lessonId: draft.lessonId, date: draft.date, type: draft.type,
    patch: structuredClone(draft.patch || {}),
    reason: String(draft.reason || '').trim(),
    adminId: admin.id, createdAt: stamp(),
    version: (before?.version ?? 0) + 1,
  };

  const { conflicts } = checkChange(change, { raw, changes: s.changes }, ctx);
  const errors = conflicts.filter(c => c.level === 'error');
  if (errors.length) throw new ApiError('conflict', errors[0].message, { conflicts: errors });

  if (before) s.changes[i] = change; else s.changes.push(change);
  const auditId = writeAudit(s, admin, { entity: 'Change', entityId: change.id, action: before ? 'update' : 'create', before, after: change });
  commit();
  return { change: structuredClone(change), auditId };
}

/** Снять изменение: занятие в этот день пойдёт как по расписанию. */
export async function deleteChange(id) {
  await tick();
  const s = ensure();
  const admin = currentAdmin(s);
  const i = s.changes.findIndex(c => c.id === id);
  if (i < 0) throw new ApiError('missing', 'Изменение уже сняли.');
  const before = s.changes[i];
  const lesson = s.lessons.find(l => l.id === before.lessonId);
  if (lesson) assertZone(s, admin, lesson);
  s.changes.splice(i, 1);
  const auditId = writeAudit(s, admin, { entity: 'Change', entityId: id, action: 'delete', before, after: null });
  commit();
  return { auditId };
}
