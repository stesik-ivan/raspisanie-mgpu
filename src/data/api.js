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

function ensure() {
  if (state) return state;
  state = loadState();
  if (!state.lessons?.length) {
    state = { ...buildSeed({ today: today() }), prefs: state.prefs, ephemeral: state.ephemeral };
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

/** День группы: пары, окна и где сейчас находимся по сетке звонков. */
export async function getDay(groupId, date, { subgroup = null } = {}) {
  const { occurrences } = await getGroupSchedule(groupId, { subgroup });
  const list = occurrences.filter(o => o.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const bells = ctx.bellScheduleOf(groupId);
  return {
    date,
    weekday: weekdayOf(date),
    lessons: list,
    gaps: gapsBetween(list),
    bells: slotsOf(bells, weekdayOf(date)),
    isToday: date === today(),
  };
}

/** Неделя группы: семь дней начиная с понедельника. */
export async function getWeek(groupId, anyDate, { subgroup = null } = {}) {
  const monday = startOfWeek(anyDate);
  const { occurrences } = await getGroupSchedule(groupId, { subgroup });
  const days = [];
  for (let i = 0; i < 6; i++) {           // воскресенье не показываем
    const date = addDays(monday, i);
    days.push({
      date, weekday: i + 1, isToday: date === today(),
      lessons: occurrences.filter(o => o.date === date).sort((a, b) => a.start.localeCompare(b.start)),
    });
  }
  return { from: monday, to: addDays(monday, 5), days };
}

/** Лента изменений по группе вперёд на N дней. */
export async function getChanges(groupId, { fromDate = today(), days = 14 } = {}) {
  ensure(); await tick();
  const to = addDays(fromDate, days);
  const { occurrences } = await getGroupSchedule(groupId);
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
  state = buildSeed({ today: today() });
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
  }));
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
