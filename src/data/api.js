/* Единственная точка доступа к данным.

   Всё асинхронно с первого дня, хотя под низом localStorage. Это не
   украшательство: когда под api встанет PocketBase, интерфейс не изменится
   и ни один экран не придётся переписывать. Синхронный api пришлось бы
   менять в каждом вызове.

   Форма ответов — та же, что у будущих pub/groups/<id>.json. Студенческие
   экраны не знают и не должны знать, что сервера пока нет. */

import { loadState, saveState, clearState } from './demo-store.js';
import { buildSeed } from './seed.js';
import { domainCtx, occurrencesOf } from './ctx.js';
import { findConflicts, freeRooms } from '../domain/conflicts.js';
import { buildIcs } from '../domain/ics.js';
import { slotsOf, toMinutes } from '../domain/bells.js';
import { addDays, weekdayOf, compareIso, startOfWeek } from '../domain/dates.js';
import { today, now, nowMinutes } from './clock.js';

let state = null;
let ctx = null;

/* День показа. Сид привязывает замену к «сегодня», и если открыть демо
   накануне (как советует сценарий), замена уехала бы на 21.10, а на показе
   22.10 «Сегодня» осталось бы без неё. Раньше этой даты не якорим. */
const DEMO_DAY = '2026-10-22';
const seedDay = () => { const t = today(); return t < DEMO_DAY ? DEMO_DAY : t; };

function ensure() {
  if (state) return state;
  state = loadState();
  if (!state.lessons?.length) {
    state = { ...buildSeed({ today: seedDay() }), prefs: state.prefs, ephemeral: state.ephemeral };
    saveState(state);
  }
  ctx = domainCtx(state);
  return state;
}

function commit() {
  ctx = domainCtx(state);
  saveState(state);
}

const tick = () => new Promise(r => setTimeout(r, 0));   // сохранить асинхронность контракта

/* ---------- справочники и поиск ---------- */

export async function getIndex() {
  ensure(); await tick();
  return {
    units: state.units.map(u => ({
      id: u.id, name: u.name, short: u.short, kind: u.kind,
      groups: state.groups
        .filter(g => unitOfGroup(g.id) === u.id)
        .map(g => ({ id: g.id, code: g.code, course: g.course, subgroups: g.subgroups, demo: g.demo }))
        .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code)),
    })),
    teachers: state.teachers.map(t => ({ id: t.id, fio: t.fio, position: t.position, unitIds: t.unitIds })),
    buildings: state.buildings.map(b => ({ ...b })),
    updatedAt: state.terms[0]?.publishedAt || null,
  };
}

function unitOfGroup(groupId) {
  const g = state.groups.find(x => x.id === groupId);
  const p = g && state.programs.find(x => x.id === g.programId);
  return p?.unitId || null;
}

/* ---------- расписание ---------- */

/** Вхождения группы за семестр, с наложенными изменениями и расшифровками. */
export async function getGroupSchedule(groupId, { subgroup = null } = {}) {
  ensure(); await tick();
  const list = occurrencesOf(state, { groupId })
    .filter(o => subgroup == null || o.subgroup == null || o.subgroup === subgroup);
  return { groupId, subgroup, occurrences: list.map(decorate) };
}

export async function getTeacherSchedule(teacherId) {
  ensure(); await tick();
  return { teacherId, occurrences: occurrencesOf(state, { teacherId }).map(decorate) };
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
  if (subject?.groupId) return ctx.bellScheduleOf(subject.groupId);
  // У преподавателя своей сетки нет: он может вести и в институте, и в
  // колледже. Берём сетку группы его первой пары в этот день.
  return ctx.bellScheduleOf(occurrences[0]?.groupIds?.[0]);
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
  ensure(); await tick();
  const p = state.prefs;
  if (p.role === 'teacher' && p.teacherId) return { teacherId: p.teacherId };
  if (p.groupId) return { groupId: p.groupId, subgroup: p.subgroup };
  return null;
}

/** Лента изменений вперёд на N дней — по группе или по преподавателю. */
export async function getChanges(subject, { fromDate = today(), days = 14 } = {}) {
  ensure(); await tick();
  const to = addDays(fromDate, days);
  const occurrences = await scheduleOf(typeof subject === 'string' ? { groupId: subject } : subject);
  return occurrences
    .filter(o => o.changeIds.length && compareIso(o.date, fromDate) >= 0 && compareIso(o.date, to) <= 0)
    .map(o => ({
      ...o,
      changes: o.changeIds.map(id => state.changes.find(c => c.id === id)).filter(Boolean),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/* ---------- админская сетка ---------- */

export async function getGridView({ unitId, course = null, weekFrom = today() }) {
  ensure(); await tick();
  const monday = startOfWeek(weekFrom);
  const to = addDays(monday, 5);

  const groups = state.groups
    .filter(g => unitOfGroup(g.id) === unitId && (course == null || g.course === course))
    .sort((a, b) => a.course - b.course || a.code.localeCompare(b.code));
  const ids = new Set(groups.map(g => g.id));

  const all = occurrencesOf(state, { includeDraft: true });
  const week = all.filter(o => compareIso(o.date, monday) >= 0 && compareIso(o.date, to) <= 0);
  const mine = week.filter(o => o.groupIds.some(g => ids.has(g)));

  // Конфликты считаем по ВСЕМ вхождениям недели, а не только по своим:
  // ровно в этом смысл — поймать пересечение с чужим подразделением.
  const conflicts = findConflicts(week, ctx);
  const byLesson = new Map();
  for (const c of conflicts) {
    for (const side of [c.a, c.b]) {
      if (!side) continue;
      const key = `${side.lessonId}|${side.date}`;
      if (!byLesson.has(key)) byLesson.set(key, []);
      byLesson.get(key).push(c);
    }
  }

  return {
    from: monday, to,
    unit: state.units.find(u => u.id === unitId),
    groups,
    bells: slotsOf(ctx.bellScheduleOf(groups[0]?.id), 1),
    cells: mine.map(o => ({
      ...decorate(o),
      // Вхождение не знает, опубликовано ли занятие: это свойство занятия,
      // а не его даты. Для сетки оно нужно — черновик помечается штриховкой.
      published: state.lessons.find(l => l.id === o.lessonId)?.published !== false,
      conflicts: (byLesson.get(`${o.lessonId}|${o.date}`) || []).map(c => ({
        level: c.level, type: c.type, message: c.message,
      })),
    })),
    draftCount: state.lessons.filter(l => !l.published).length,
  };
}

/* ---------- аудитории ---------- */

export async function getRoomBusy(roomId, date) {
  ensure(); await tick();
  return occurrencesOf(state, {})
    .filter(o => o.roomId === roomId && o.date === date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(decorate);
}

export async function getFreeRoomsNow({ buildingId = null, kind = null } = {}) {
  ensure(); await tick();
  const date = today();
  const m = nowMinutes();
  const all = occurrencesOf(state, {});
  const rooms = freeRooms(all, ctx, {
    date, start: pad(m), end: pad(m + 1), buildingId, kind,
  });
  return rooms.map(r => ({
    ...r,
    building: state.buildings.find(b => b.id === r.buildingId) || null,
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
  ensure(); await tick();
  return freeRooms(occurrencesOf(state, { includeDraft: true }), ctx,
    { date, start, end, buildingId, kind });
}

/** Текущий администратор: его зона ответственности. */
export async function getAdmin() {
  ensure(); await tick();
  const id = state.prefs.adminId || state.admins[0]?.id;
  return state.admins.find(a => a.id === id) || null;
}

export async function getIcsForGroup(groupId) {
  ensure(); await tick();
  const group = state.groups.find(g => g.id === groupId);
  const { occurrences } = await getGroupSchedule(groupId);
  return buildIcs(occurrences, {
    name: `Расписание ${group?.code || ''}`.trim(),
    titleOf: (o) => `${o.discipline}${o.status === 'cancelled' ? ' — отменено' : ` (${o.kind})`}`,
    locationOf: (o) => o.roomLabel + (o.address ? `, ${o.address}` : ''),
    descriptionOf: (o) => o.teachers.map(t => `${t.fio}, ${t.position}`).join('; '),
  });
}

/* ---------- настройки и демо ---------- */

export async function getPrefs() { ensure(); await tick(); return { ...state.prefs }; }

export async function setPrefs(patch) {
  ensure();
  state.prefs = { ...state.prefs, ...patch };
  commit();
  await tick();
  return { ...state.prefs };
}

export async function isEphemeral() { ensure(); return state.ephemeral === true; }

export async function resetDemo() {
  const prefs = state?.prefs;
  clearState();
  state = buildSeed({ today: seedDay() });
  if (prefs) state.prefs = prefs;
  commit();
  await tick();
  return true;
}

export async function getAudit({ limit = 50 } = {}) {
  ensure(); await tick();
  return state.audit.slice(0, limit).map(a => ({
    ...a,
    admin: state.admins.find(x => x.id === a.adminId) || null,
    label: auditLabel(a),
  }));
}

/* Человеческая подпись объекта журнала: «Геология, ГОБЩ-261» вместо L8.
   На показе спросят «а что это за L8», и ответить нечего. */
function auditLabel(a) {
  if (a.entity === 'Term') return '';
  const l = state.lessons.find(x => x.id === a.entityId);
  if (!l) return '';
  const groups = l.groupIds.map(id => ctx.groupOf(id)?.code).filter(Boolean).join(', ');
  return [ctx.disciplineName(l.disciplineId), groups].filter(Boolean).join(' · ');
}

export async function getMeta() {
  ensure(); await tick();
  return {
    term: state.terms[0] || null,
    generatedAt: now().toISOString(),
    draftCount: state.lessons.filter(l => !l.published).length,
    ephemeral: state.ephemeral === true,
  };
}

/* ---------- расшифровка вхождения для интерфейса ---------- */

function decorate(o) {
  const room = ctx.roomOf(o.roomId);
  const building = room && room.buildingId
    ? state.buildings.find(b => b.id === room.buildingId) : null;
  return {
    ...o,
    discipline: ctx.disciplineName(o.disciplineId),
    teachers: o.teacherIds.map(id => ctx.teacherOf(id)).filter(Boolean)
      .map(t => ({ id: t.id, fio: t.fio, position: t.position })),
    replacedTeachers: (o.replacedTeacherIds || []).map(id => ctx.teacherOf(id)).filter(Boolean)
      .map(t => ({ id: t.id, fio: t.fio, position: t.position })),
    groups: o.groupIds.map(id => ctx.groupOf(id)).filter(Boolean)
      .map(g => ({ id: g.id, code: g.code })),
    room,
    roomLabel: roomLabel(room),
    building,
    address: building?.address || null,
    isOnline: room?.kind === 'online',
  };
}

function roomLabel(room) {
  if (!room) return '—';
  if (room.kind === 'online') return room.name;
  const prefix = room.kind === 'gym' ? 'Зал' : room.kind === 'comp' ? 'Комп. класс' : room.kind === 'lab' ? 'Лаб.' : 'Ауд.';
  return `${prefix} ${room.name}`;
}

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
