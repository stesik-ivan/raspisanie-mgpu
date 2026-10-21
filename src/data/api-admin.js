/* Запись: всё, что меняет расписание. Только для администратора.

   Каждая запись проходит три проверки, и порядок у них не случайный:
   1. зона — чужое подразделение видно, но не правится;
   2. версия — если запись изменили, пока админ смотрел, тихой перезаписи
      нет (docs/02, оптимистичная блокировка);
   3. конфликты — ошибка блокирует сохранение.
   И каждая пишет журнал с полными «до» и «после»: по ним работает отмена.

   Реэкспортируется из api.js — для экранов точка входа одна. */

import { ensure, getCtx, commit, tick } from './session.js';
import { occurrencesOf } from './ctx.js';
import { ApiError } from './errors.js';
import { now, toIsoDate } from './clock.js';
import { lessonOccurrences, applyChanges } from '../domain/occurrences.js';
import { checkLesson, freeRoomsForAll } from '../domain/conflicts.js';
import { editLesson } from '../domain/drafts.js';

/* ---------- кто правит и что ему можно ---------- */

function currentAdmin(s) {
  const id = s.prefs.adminId || s.admins[0]?.id;
  return s.admins.find(a => a.id === id) || null;
}

function unitIdOfGroup(s, groupId) {
  const g = s.groups.find(x => x.id === groupId);
  return s.programs.find(p => p.id === g?.programId)?.unitId || null;
}

/** Все группы занятия должны быть в зоне админа: поток с чужой группой — чужой. */
function assertZone(s, admin, lesson) {
  if (!admin) throw new ApiError('foreign', 'Войдите как администратор, чтобы править расписание.');
  const foreign = (lesson.groupIds || []).map(g => unitIdOfGroup(s, g)).find(u => !admin.unitIds.includes(u));
  if (foreign !== undefined) {
    const unit = s.units.find(u => u.id === foreign);
    throw new ApiError('foreign',
      `Это расписание ведёт ${unit?.short || 'другое подразделение'}. Видеть его можно, править — только его администратору.`);
  }
}

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

/* ---------- вхождения и конфликты кандидата ---------- */

function candidateOccurrences(s, ctx, lesson) {
  const raw = lessonOccurrences(lesson, ctx).occurrences;
  return applyChanges(raw, s.changes.filter(c => c.lessonId === lesson.id), ctx);
}

function conflictsOf(s, ctx, lesson) {
  const existing = occurrencesOf(s, { includeDraft: true });
  return checkLesson(candidateOccurrences(s, ctx, lesson), existing, ctx);
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
  return freeRoomsForAll(candidateOccurrences(s, ctx, lesson), occurrencesOf(s, { includeDraft: true }), ctx,
    { buildingId: room.buildingId, kind: room.kind })
    .filter(r => r.id !== lesson.roomId)
    .map(r => ({ id: r.id, name: r.name, kind: r.kind, buildingId: r.buildingId }));
}

/* ---------- журнал ---------- */

function stamp() {
  const d = now();
  return `${toIsoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function writeAudit(s, admin, entry) {
  const id = `AU-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  // Журнал отсортирован от новых к старым — новая запись встаёт первой.
  s.audit.unshift({
    id, at: stamp(), adminId: admin.id, ...entry,
    before: entry.before ? structuredClone(entry.before) : null,
    after: entry.after ? structuredClone(entry.after) : null,
  });
  return id;
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
    throw new ApiError('stale', 'Запись изменили, пока вы редактировали. Откройте занятие заново — там актуальная версия.');
  }

  const after = editLesson(before, patch, stamp());
  if (after.version === before.version) return { lesson: structuredClone(before), auditId: null };
  assertZone(s, admin, after);

  const errors = conflictsOf(s, ctx, after).filter(c => c.level === 'error');
  if (errors.length) throw new ApiError('conflict', errors[0].message, { conflicts: errors });

  s.lessons[i] = after;
  const auditId = writeAudit(s, admin, { entity: 'Lesson', entityId: id, action: 'update', before, after });
  commit();
  return { lesson: structuredClone(after), auditId };
}

/**
 * Отменить правку из журнала. Журнал не переписывается: отмена — это
 * новая запись с обратными «до» и «после».
 */
export async function revert(auditId) {
  await tick();
  const s = ensure();
  const admin = currentAdmin(s);
  const entry = s.audit.find(a => a.id === auditId);
  if (!entry || entry.entity !== 'Lesson') throw new ApiError('missing', 'Эту правку отменить нельзя.');

  const i = s.lessons.findIndex(l => l.id === entry.entityId);
  const cur = i >= 0 ? s.lessons[i] : null;
  if ((cur?.version ?? null) !== (entry.after?.version ?? null)) {
    throw new ApiError('stale', 'После этой правки занятие уже меняли. Отменить её нельзя, поправьте вручную.');
  }
  assertZone(s, admin, cur || entry.before);

  // Конфликты здесь не проверяем: отмена возвращает ровно то, что было.
  let restored = null;
  if (!entry.before) s.lessons.splice(i, 1);
  else {
    restored = { ...structuredClone(entry.before), version: (cur?.version ?? entry.before.version) + 1, updatedAt: stamp() };
    if (cur) s.lessons[i] = restored; else s.lessons.push(restored);
  }

  const action = !entry.before ? 'delete' : !cur ? 'create' : 'update';
  writeAudit(s, admin, { entity: 'Lesson', entityId: entry.entityId, action, revertOf: auditId, before: cur, after: restored });
  commit();
  return { lesson: restored && structuredClone(restored) };
}
