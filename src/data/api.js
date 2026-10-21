/* Единственная точка доступа к данным.

   Всё асинхронно с первого дня, хотя под низом localStorage. Это не
   украшательство: когда под api встанет PocketBase, интерфейс не изменится
   и ни один экран не придётся переписывать. Синхронный api пришлось бы
   менять в каждом вызове.

   Форма ответов — та же, что у будущих pub/groups/<id>.json. Студенческие
   экраны не знают и не должны знать, что сервера пока нет. */

import { clearState } from './demo-store.js';
import { buildSeed } from './seed.js';
import { occurrencesOf } from './ctx.js';
import { ensure, getCtx, commit, replaceState, seedDay, tick } from './session.js';
import { findConflicts, freeRooms, orientConflict } from '../domain/conflicts.js';
import { buildIcs } from '../domain/ics.js';
import { slotsOf, toMinutes } from '../domain/bells.js';
import { addDays, weekdayOf, compareIso, startOfWeek } from '../domain/dates.js';
import { today, now, nowMinutes } from './clock.js';
import { decorator } from './decorate.js';
import { describeAudit } from './audit-view.js';

export * from './api-admin.js';
export * from './api-changes.js';
export * from './api-publish.js';

/* Состояние живёт в session.js. Здесь к нему обращаются через st()/cx(),
   чтобы чтение и запись (api-admin.js) видели одно и то же. */
const st = () => ensure();
const cx = () => getCtx();

/* ---------- справочники и поиск ---------- */

export async function getIndex() {
  await tick();
  return {
    units: st().units.map(u => ({
      id: u.id, name: u.name, short: u.short, kind: u.kind,
      groups: st().groups
        .filter(g => unitOfGroup(g.id) === u.id)
        .map(g => ({ id: g.id, code: g.code, course: g.course, subgroups: g.subgroups, demo: g.demo }))
        .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code)),
    })),
    teachers: st().teachers.map(t => ({ id: t.id, fio: t.fio, position: t.position, unitIds: t.unitIds })),
    buildings: st().buildings.map(b => ({ ...b })),
    updatedAt: st().terms[0]?.publishedAt || null,
  };
}

function unitOfGroup(groupId) {
  const g = st().groups.find(x => x.id === groupId);
  const p = g && st().programs.find(x => x.id === g.programId);
  return p?.unitId || null;
}

/* ---------- расписание ---------- */

/** Вхождения группы за семестр, с наложенными изменениями и расшифровками. */
export async function getGroupSchedule(groupId, { subgroup = null } = {}) {
  await tick();
  const list = occurrencesOf(st(), { groupId })
    .filter(o => subgroup == null || o.subgroup == null || o.subgroup === subgroup);
  return { groupId, subgroup, occurrences: list.map(decorate) };
}

export async function getTeacherSchedule(teacherId) {
  await tick();
  return { teacherId, occurrences: occurrencesOf(st(), { teacherId }).map(decorate) };
}

/* Студент и преподаватель смотрят на одно и то же расписание с двух сторон,
   поэтому «день» и «неделя» принимают subject: либо группу с подгруппой,
   либо преподавателя. Иначе пришлось бы держать два почти одинаковых
   набора функций и два набора экранов. */
async function scheduleOf(subject) {
  if (subject?.teacherId) return (await getTeacherSchedule(subject.teacherId)).occurrences;
  return (await getGroupSchedule(subject.groupId, { subgroup: subject.subgroup })).occurrences;
}

function bellsFor(subject, occurrences) {
  if (subject?.groupId) return cx().bellScheduleOf(subject.groupId);
  // У преподавателя своей сетки нет: он может вести и в институте, и в
  // колледже. Берём сетку группы его первой пары в этот день.
  return cx().bellScheduleOf(occurrences[0]?.groupIds?.[0]);
}

/** День: пары, окна и где сейчас по сетке звонков. */
export async function getDay(subject, date) {
  const occurrences = await scheduleOf(subject);
  const list = occurrences.filter(o => o.date === date).sort((a, b) => a.start.localeCompare(b.start));
  return {
    date,
    weekday: weekdayOf(date),
    lessons: list,
    gaps: gapsBetween(list),
    bells: slotsOf(bellsFor(subject, list), weekdayOf(date)),
    isToday: date === today(),
  };
}

/** Неделя: понедельник–суббота. Воскресенье не показываем. */
export async function getWeek(subject, anyDate) {
  const monday = startOfWeek(anyDate);
  const occurrences = await scheduleOf(subject);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const date = addDays(monday, i);
    days.push({
      date, weekday: i + 1, isToday: date === today(),
      lessons: occurrences.filter(o => o.date === date).sort((a, b) => a.start.localeCompare(b.start)),
    });
  }
  return { from: monday, to: addDays(monday, 5), days };
}

/** Кого показываем: группу студента или самого преподавателя. */
export async function getSubject() {
  await tick();
  const p = st().prefs;
  if (p.role === 'teacher' && p.teacherId) return { teacherId: p.teacherId };
  if (p.groupId) return { groupId: p.groupId, subgroup: p.subgroup };
  return null;
}

/** Лента изменений вперёд на N дней — по группе или по преподавателю. */
export async function getChanges(subject, { fromDate = today(), days = 14 } = {}) {
  await tick();
  const to = addDays(fromDate, days);
  const occurrences = await scheduleOf(typeof subject === 'string' ? { groupId: subject } : subject);
  return occurrences
    .filter(o => o.changeIds.length && compareIso(o.date, fromDate) >= 0 && compareIso(o.date, to) <= 0)
    .map(o => ({
      ...o,
      changes: o.changeIds.map(id => st().changes.find(c => c.id === id)).filter(Boolean),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/* ---------- админская сетка ---------- */

export async function getGridView({ unitId, course = null, weekFrom = today() }) {
  await tick();
  const monday = startOfWeek(weekFrom);
  const to = addDays(monday, 5);

  const groups = st().groups
    .filter(g => unitOfGroup(g.id) === unitId && (course == null || g.course === course))
    .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code));
  const ids = new Set(groups.map(g => g.id));

  const all = occurrencesOf(st(), { includeDraft: true });
  const week = all.filter(o => compareIso(o.date, monday) >= 0 && compareIso(o.date, to) <= 0);
  const mine = week.filter(o => o.groupIds.some(g => ids.has(g)));

  // Конфликты считаем по ВСЕМ вхождениям недели, а не только по своим:
  // ровно в этом смысл — поймать пересечение с чужим подразделением.
  const conflicts = findConflicts(week, cx());
  const byLesson = new Map();
  for (const c of conflicts) {
    for (const side of [c.a, c.b]) {
      if (!side) continue;
      const key = `${side.lessonId}|${side.date}`;
      if (!byLesson.has(key)) byLesson.set(key, []);
      // У каждой ячейки своя сторона: «занято тем-то» — про соседа, а не про себя.
      byLesson.get(key).push(orientConflict(c, side.lessonId, cx()));
    }
  }

  return {
    from: monday, to,
    unit: st().units.find(u => u.id === unitId),
    groups,
    bells: slotsOf(cx().bellScheduleOf(groups[0]?.id), 1),
    cells: mine.map(o => {
      const lesson = st().lessons.find(l => l.id === o.lessonId);
      return {
        ...decorate(o),
        // Вхождение не знает, опубликовано ли занятие: это свойство занятия,
        // а не его даты. Для сетки оно нужно — черновик помечается штриховкой.
        published: lesson?.published !== false,
        // Версия — для правки: если занятие изменили, пока админ смотрел, api откажет.
        version: lesson?.version ?? null,
        conflicts: (byLesson.get(`${o.lessonId}|${o.date}`) || []).map(c => ({
          level: c.level, type: c.type, message: c.message,
        })),
      };
    }),
    // Счётчик — по своему подразделению: чужие черновики публикует не этот админ.
    draftCount: st().lessons.filter(l => l.published === false && l.groupIds.some(g => ids.has(g))).length,
  };
}

/* ---------- аудитории ---------- */

export async function getRoomBusy(roomId, date) {
  await tick();
  return occurrencesOf(st(), {})
    .filter(o => o.roomId === roomId && o.date === date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(decorate);
}

export async function getFreeRoomsNow({ buildingId = null, kind = null } = {}) {
  await tick();
  const date = today();
  const m = nowMinutes();
  const all = occurrencesOf(st(), {});
  const rooms = freeRooms(all, cx(), {
    date, start: pad(m), end: pad(m + 1), buildingId, kind,
  });
  return rooms.map(r => ({
    ...r,
    building: st().buildings.find(b => b.id === r.buildingId) || null,
    freeUntil: nextBusy(all, r.id, date, m),
  }));
}

function pad(m) {
  const v = Math.max(0, Math.min(1439, m));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

function nextBusy(all, roomId, date, m) {
  const next = all
    .filter(o => o.roomId === roomId && o.date === date && toMinutes(o.start) > m)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  return next ? next.start : null;
}

/* ---------- календарь ---------- */

/** Свободные аудитории на произвольный интервал — для разбора конфликта. */
export async function getFreeRoomsAt({ date, start, end, buildingId = null, kind = null }) {
  await tick();
  return freeRooms(occurrencesOf(st(), { includeDraft: true }), cx(),
    { date, start, end, buildingId, kind });
}

/** Текущий администратор: его зона ответственности. */
export async function getAdmin() {
  await tick();
  const id = st().prefs.adminId || st().admins[0]?.id;
  return st().admins.find(a => a.id === id) || null;
}

export async function getIcsForGroup(groupId) {
  await tick();
  const group = st().groups.find(g => g.id === groupId);
  const { occurrences } = await getGroupSchedule(groupId);
  return buildIcs(occurrences, {
    name: `Расписание ${group?.code || ''}`.trim(),
    titleOf: (o) => `${o.discipline}${o.status === 'cancelled' ? ' — отменено' : ` (${o.kind})`}`,
    locationOf: (o) => o.roomLabel + (o.address ? `, ${o.address}` : ''),
    descriptionOf: (o) => o.teachers.map(t => `${t.fio}, ${t.position}`).join('; '),
  });
}

/* ---------- настройки и демо ---------- */

export async function getPrefs() { await tick(); return { ...st().prefs }; }

export async function setPrefs(patch) {
  const s = st();
  s.prefs = { ...s.prefs, ...patch };
  commit();
  await tick();
  return { ...s.prefs };
}

export async function isEphemeral() { return st().ephemeral === true; }

export async function resetDemo() {
  const prefs = st().prefs;
  clearState();
  const fresh = buildSeed({ today: seedDay() });
  if (prefs) fresh.prefs = prefs;
  replaceState(fresh);
  await tick();
  return true;
}

export async function getAudit({ limit = 50 } = {}) {
  await tick();
  return st().audit.slice(0, limit).map(a => ({
    ...a,
    admin: st().admins.find(x => x.id === a.adminId) || null,
    ...describeAudit(a, st(), cx()),
  }));
}

export async function getMeta() {
  await tick();
  return {
    term: st().terms[0] || null,
    generatedAt: now().toISOString(),
    draftCount: st().lessons.filter(l => !l.published).length,
    ephemeral: st().ephemeral === true,
  };
}

/* ---------- расшифровка вхождения для интерфейса ---------- */

const decorate = (o) => decorator(st(), cx())(o);

function gapsBetween(list) {
  const out = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i], b = list[i + 1];
    if (a.status === 'cancelled') continue;
    const gap = toMinutes(b.start) - toMinutes(a.end);
    if (gap > 15) {
      out.push({
        afterIndex: i, minutes: gap, from: a.end, to: b.start,
        moveTo: a.building && b.building && a.building.id !== b.building.id ? b.building : null,
      });
    }
  }
  return out;
}
