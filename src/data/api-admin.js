/* Запись: всё, что меняет расписание. Только для администратора.

   Каждая запись проходит три проверки, и порядок у них не случайный:
   1. зона — чужое подразделение видно, но не правится;
   2. версия — если запись изменили, пока админ смотрел, тихой перезаписи
      нет (docs/02, оптимистичная блокировка);
   3. конфликты — ошибка блокирует сохранение.
   И каждая пишет журнал с полными «до» и «после»: по ним работает отмена.

   Реэкспортируется из api.js — для экранов точка входа одна. */

import { ensure, getCtx, commit, tick } from './session.js';
import { occurrencesOf, withBookings } from './ctx.js';
import { ApiError } from './errors.js';
import { today } from './clock.js';
import {
  currentAdmin, unitIdOfGroup, assertZone, stamp, writeAudit, candidateOccurrences, conflictsOf,
} from './admin-core.js';
import { lessonOccurrences, applyChanges } from '../domain/occurrences.js';
import { checkLesson, freeRoomsForAll, groupConflicts } from '../domain/conflicts.js';
import { editLesson, newLesson, removeLesson, validateLesson, LESSON_FIELDS } from '../domain/drafts.js';
import { slotsOf } from '../domain/bells.js';
import { HOLIDAYS } from '../domain/fixtures.js';

/** Можно ли текущему админу править занятие — для экранов, чтобы не показывать кнопки зря. */
export async function canEditLesson(lessonId) {
  await tick();
  const s = ensure();
  const lesson = s.lessons.find(l => l.id === lessonId);
  if (!lesson) return false;
  try { assertZone(s, currentAdmin(s), lesson); return true; }
  catch (err) {
    if (err instanceof ApiError) return false;
    console.error('api-admin: проверка зоны упала', err);
    return false;
  }
}

/**
 * Куда пересадить занятие: аудитории того же корпуса и типа, свободные
 * на всех его датах. Тап по любой из них решает конфликт целиком.
 */
export async function getRoomOptions(lessonId) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const lesson = s.lessons.find(l => l.id === lessonId);
  if (!lesson) return [];
  const room = ctx.roomOf(lesson.roomId);
  if (!room || room.kind === 'online') return [];
  return freeRoomsForAll(candidateOccurrences(s, ctx, lesson), withBookings(s, occurrencesOf(s, { includeDraft: true })), ctx,
    { buildingId: room.buildingId, kind: room.kind })
    .filter(r => r.id !== lesson.roomId)
    .map(r => ({ id: r.id, name: r.name, kind: r.kind, buildingId: r.buildingId }));
}

/* ---------- правка занятия ---------- */

/**
 * Правка занятия. Опубликованное становится черновиком (см. domain/drafts.js).
 * @param {string} id
 * @param {object} patch смысловые поля занятия
 * @param {{version?:number}} [opts] версия, которую видел админ
 * @returns {Promise<{lesson:object, auditId:string|null}>}
 */
export async function saveLesson(id, patch, { version = null } = {}) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const admin = currentAdmin(s);
  const i = s.lessons.findIndex(l => l.id === id);
  if (i < 0) throw new ApiError('missing', 'Занятие не найдено: его удалили, пока вы смотрели.');
  const before = s.lessons[i];

  assertZone(s, admin, before);
  if (version != null && version !== before.version) {
    throw new ApiError('stale', 'Запись изменили, пока вы редактировали. Откройте занятие заново, чтобы увидеть актуальную версию.');
  }

  const after = editLesson(before, patch, stamp());
  if (after.version === before.version) return { lesson: structuredClone(before), auditId: null };
  assertZone(s, admin, after);
  assertValid(s, ctx, after);

  const errors = conflictsOf(s, ctx, after).filter(c => c.level === 'error');
  if (errors.length) throw new ApiError('conflict', errors[0].message, { conflicts: errors });

  s.lessons[i] = after;
  const auditId = writeAudit(s, admin, { entity: 'Lesson', entityId: id, action: 'update', before, after });
  commit();
  return { lesson: structuredClone(after), auditId };
}

/* Что отменяется: занятия и изменения на дату. Зона у изменения — зона
   его занятия. */
const COLLECTIONS = { Lesson: 'lessons', Change: 'changes' };

/**
 * Отменить правку из журнала. Журнал не переписывается: отмена — это
 * новая запись с обратными «до» и «после».
 */
export async function revert(auditId) {
  await tick();
  const s = ensure();
  const admin = currentAdmin(s);
  const entry = s.audit.find(a => a.id === auditId);
  const key = COLLECTIONS[entry?.entity];
  if (!entry || !key || (!entry.before && !entry.after)) throw new ApiError('missing', 'Эту правку отменить нельзя.');
  const list = s[key];

  const i = list.findIndex(x => x.id === entry.entityId);
  const cur = i >= 0 ? list[i] : null;
  if ((cur?.version ?? null) !== (entry.after?.version ?? null)) {
    throw new ApiError('stale', 'После этой правки запись уже меняли. Отменить её нельзя, поправьте вручную.');
  }
  const subject = cur || entry.before;
  const lesson = entry.entity === 'Lesson' ? subject : s.lessons.find(l => l.id === subject.lessonId);
  if (lesson) assertZone(s, admin, lesson);

  // Конфликты здесь не проверяем: отмена возвращает ровно то, что было.
  let restored = null;
  if (!entry.before) list.splice(i, 1);
  else {
    restored = { ...structuredClone(entry.before), version: (cur?.version ?? entry.before.version ?? 0) + 1 };
    if (entry.entity === 'Lesson') restored.updatedAt = stamp();
    if (cur) list[i] = restored; else list.push(restored);
  }

  const action = !entry.before ? 'delete' : !cur ? 'create' : 'update';
  writeAudit(s, admin, { entity: entry.entity, entityId: entry.entityId, action, revertOf: auditId, before: cur, after: restored });
  commit();
  return { [entry.entity === 'Lesson' ? 'lesson' : 'change']: restored && structuredClone(restored) };
}

/* ---------- форма занятия ---------- */

function assertValid(s, ctx, lesson) {
  const [problem] = problemsOf(s, ctx, lesson);
  if (problem) throw new ApiError('invalid', problem.message, { field: problem.field });
}

/** Незаполненные поля и правило дат, которое не дало ни одной даты. */
function problemsOf(s, ctx, lesson) {
  const out = validateLesson(lesson);
  if (!out.length && !lessonOccurrences(lesson, ctx).occurrences.length) {
    out.push({ field: 'dateRule', message: 'По этому правилу не выходит ни одной даты' });
  }
  return out;
}

/**
 * Всё, что нужно форме: справочники подразделения, сетки звонков по дням,
 * границы семестра. Одним запросом, чтобы форма открывалась сразу.
 */
export async function getLessonFormRefs(unitId) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const unit = s.units.find(u => u.id === unitId);
  const bells = s.bellSchedules.find(b => b.id === unit?.bellScheduleId);
  const buildings = new Map(s.buildings.map(b => [b.id, b]));
  const own = (t) => t.unitIds?.includes(unitId) ? 0 : 1;

  return {
    unit: unit && { id: unit.id, short: unit.short, name: unit.name, kind: unit.kind },
    term: { from: ctx.termFrom, to: ctx.termTo },
    today: today(),
    holidays: [...HOLIDAYS],
    disciplines: s.disciplines.filter(d => d.unitId === unitId)
      .map(d => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)),
    groups: s.groups.filter(g => unitIdOfGroup(s, g.id) === unitId)
      .map(g => ({ id: g.id, code: g.code, course: g.course, subgroups: g.subgroups || [] }))
      .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code)),
    // Свои преподаватели первыми, но чужие тоже доступны: один человек
    // ведёт и в институте, и в колледже.
    teachers: s.teachers.map(t => ({ id: t.id, fio: t.fio, position: t.position, own: own(t) === 0 }))
      .sort((a, b) => (a.own === b.own ? 0 : a.own ? -1 : 1) || a.fio.localeCompare(b.fio)),
    rooms: s.rooms.map(r => ({
      id: r.id, name: r.name, kind: r.kind, buildingId: r.buildingId,
      building: buildings.get(r.buildingId)?.code || null,
    })).sort((a, b) => (a.kind === 'online') - (b.kind === 'online') ||
      String(a.building).localeCompare(String(b.building)) || a.name.localeCompare(b.name, 'ru', { numeric: true })),
    bells: Object.fromEntries([1, 2, 3, 4, 5, 6].map(wd => [wd, slotsOf(bells, wd)])),
  };
}

/** Рабочая копия занятия для формы и можно ли её править. */
export async function getLesson(id) {
  await tick();
  const s = ensure();
  const l = s.lessons.find(x => x.id === id && !x.deleted);
  if (!l) return null;
  let canEdit = true;
  try { assertZone(s, currentAdmin(s), l); }
  catch (err) {
    if (!(err instanceof ApiError)) console.error('api-admin: проверка зоны упала', err);
    canEdit = false;
  }
  return { lesson: structuredClone(l), canEdit, unitId: unitIdOfGroup(s, l.groupIds[0]) };
}

/**
 * Живая проверка формы: незаполненное, даты, конфликты и куда пересесть.
 * Ничего не сохраняет. Конфликты свёрнуты: недельное занятие в занятой
 * аудитории — одна строка и список дат, а не пятнадцать одинаковых.
 * @param {object} draft смысловые поля занятия
 * @param {{lessonId?:string}} [o] id, если правим существующее
 */
export async function checkLessonDraft(draft, { lessonId = null } = {}) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const base = lessonId ? s.lessons.find(l => l.id === lessonId) : null;
  const lesson = { ...(base || { id: '__draft__' }) };
  for (const f of LESSON_FIELDS) if (f in (draft || {})) lesson[f] = draft[f];

  const missing = validateLesson(lesson);
  const empty = { problems: missing, dates: [], warnings: [], conflicts: [], freeRooms: [] };
  // Без групп, дня или пары не из чего строить вхождения — сначала заполнить.
  if (missing.some(p => ['groupIds', 'weekday', 'slot', 'dateRule'].includes(p.field))) return empty;

  const { occurrences, warnings } = lessonOccurrences(lesson, ctx);
  const problems = problemsOf(s, ctx, lesson);
  const cand = applyChanges(occurrences, s.changes.filter(c => c.lessonId === lesson.id), ctx);
  const existing = withBookings(s, occurrencesOf(s, { includeDraft: true }));
  const conflicts = groupConflicts(checkLesson(cand, existing, ctx), { from: today() });

  let freeRooms = [];
  if (conflicts.some(c => c.type === 'room' && c.level === 'error')) {
    const room = ctx.roomOf(lesson.roomId);
    freeRooms = freeRoomsForAll(cand, existing, ctx, { buildingId: room?.buildingId, kind: room?.kind })
      .filter(r => r.id !== lesson.roomId).slice(0, 8)
      .map(r => ({ id: r.id, name: r.name }));
  }

  return {
    problems,
    dates: [...new Set(occurrences.map(o => o.date))],
    warnings,
    conflicts: conflicts.map(c => ({ level: c.level, type: c.type, message: c.message, dates: c.dates })),
    freeRooms,
  };
}

/** Новое занятие — сразу черновик. */
export async function createLesson(fields) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const admin = currentAdmin(s);
  const id = `L-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const unitId = unitIdOfGroup(s, fields?.groupIds?.[0]);
  const lesson = newLesson(fields, { id, termId: `term-${unitId}`, at: stamp() });

  assertZone(s, admin, lesson);
  assertValid(s, ctx, lesson);
  const errors = conflictsOf(s, ctx, lesson).filter(c => c.level === 'error');
  if (errors.length) throw new ApiError('conflict', errors[0].message, { conflicts: errors });

  s.lessons.push(lesson);
  const auditId = writeAudit(s, admin, { entity: 'Lesson', entityId: id, action: 'create', before: null, after: lesson });
  commit();
  return { lesson: structuredClone(lesson), auditId };
}

/** Удаление. Опубликованное остаётся у студентов до публикации удаления. */
export async function deleteLesson(id, { version = null } = {}) {
  await tick();
  const s = ensure();
  const admin = currentAdmin(s);
  const i = s.lessons.findIndex(l => l.id === id && !l.deleted);
  if (i < 0) throw new ApiError('missing', 'Занятие не найдено: его удалили, пока вы смотрели.');
  const before = s.lessons[i];
  assertZone(s, admin, before);
  if (version != null && version !== before.version) {
    throw new ApiError('stale', 'Запись изменили, пока вы редактировали. Откройте занятие заново, чтобы увидеть актуальную версию.');
  }

  const after = removeLesson(before, stamp());
  if (after) s.lessons[i] = after; else s.lessons.splice(i, 1);
  const auditId = writeAudit(s, admin, { entity: 'Lesson', entityId: id, action: 'delete', before, after });
  commit();
  return { auditId };
}
