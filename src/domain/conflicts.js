/* Проверка конфликтов.

   Главный аргумент всей затеи: в Excel этого не видно. Корпус Ч-1 делят
   институты и колледж, у них разные сетки звонков — пара ВО 10:30–11:50
   и урок СПО 10:40–11:25 стоят под разными номерами, и глазами пересечение
   не ловится. Поэтому считаем по реальному времени и дате, а не по номеру пары.

   Интервалы полуоткрытые [start, end): пара, кончающаяся ровно когда
   начинается следующая, — это не конфликт, а обычное расписание. */

import { toMinutes } from './bells.js';
import { ru } from './dates.js';

/** Переезд между корпусами с перерывом в столько минут или меньше — предупреждение.

   Порог включающий. В docs/02 таблица говорит «меньше 20», но тестовый
   случай 9 ждёт предупреждения ровно на 20 минутах — и это не придирка:
   20 минут — настоящее окно в сетке СПО между 4-м и 5-м уроком
   (11:45–12:30 → 12:50–13:35). При строгом «меньше» система прозевала бы
   самый частый реальный переезд. */
export const TRAVEL_MIN_GAP = 20;

/** null — «вся группа», пересекается с любой подгруппой. */
export function subgroupsOverlap(a, b) {
  if (a == null || b == null) return true;
  return a === b;
}

function overlaps(a, b) {
  const as = toMinutes(a.start), ae = toMinutes(a.end);
  const bs = toMinutes(b.start), be = toMinutes(b.end);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}

function intersects(a = [], b = []) {
  return a.some(x => b.includes(x));
}

/**
 * Все конфликты в наборе вхождений.
 * @param {object[]} occurrences
 * @param {{rooms:object[], groups:object[], buildings:object[], disciplineName?:Function, teacherName?:Function}} ctx
 * @returns {{level:'error'|'warning', type:string, date:string, a:object, b:object|null, message:string}[]}
 */
export function findConflicts(occurrences, ctx) {
  const live = (occurrences || []).filter(o => o && o.status !== 'cancelled');
  const out = [];

  // Группируем по дате: сравнивать весь семестр попарно незачем.
  const byDate = new Map();
  for (const o of live) {
    if (!byDate.has(o.date)) byDate.set(o.date, []);
    byDate.get(o.date).push(o);
  }

  for (const [date, list] of byDate) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];

      const cap = capacityWarning(a, ctx);
      if (cap) out.push(cap);

      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!overlaps(a, b)) continue;

        if (a.roomId && a.roomId === b.roomId && !isOnline(a.roomId, ctx)) {
          out.push(mk('error', 'room', date, a, b, roomMessage(a, b, ctx)));
        }
        if (intersects(a.teacherIds, b.teacherIds)) {
          out.push(mk('error', 'teacher', date, a, b, teacherMessage(a, b, ctx)));
        }
        if (intersects(a.groupIds, b.groupIds) && subgroupsOverlap(a.subgroup, b.subgroup)) {
          out.push(mk('error', 'group', date, a, b, groupMessage(a, b, ctx)));
        }
      }
    }
    out.push(...travelWarnings(date, list, ctx));
  }

  return out;
}

/* Переезд: соседние по времени занятия одной группы или одного преподавателя
   в разных корпусах. Считаем по каждому «субъекту» отдельно, но одну и ту же
   пару занятий показываем один раз — иначе группа и её преподаватель дали бы
   два одинаковых предупреждения. */
function travelWarnings(date, list, ctx) {
  const out = [];
  const seen = new Set();
  const subjects = new Map();

  for (const o of list) {
    for (const g of o.groupIds) push(subjects, `g:${g}`, o);
    for (const t of o.teacherIds) push(subjects, `t:${t}`, o);
  }

  for (const [key, items] of subjects) {
    const sorted = [...items].sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const ba = buildingOf(a.roomId, ctx), bb = buildingOf(b.roomId, ctx);
      if (!ba || !bb || ba === bb) continue;   // онлайн и свой корпус переездом не считаются

      const gap = toMinutes(b.start) - toMinutes(a.end);
      if (gap < 0 || gap > TRAVEL_MIN_GAP) continue;

      const pair = [a.lessonId, b.lessonId, a.start, b.start].join('|');
      if (seen.has(pair)) continue;
      seen.add(pair);

      const who = key.startsWith('g:') ? groupCode(key.slice(2), ctx) : teacherName(key.slice(2), ctx);
      out.push(mk('warning', 'travel', date, a, b,
        `${who}: ${ru(date)} переезд из ${code(ba, ctx)} в ${code(bb, ctx)} за ${gap} мин ` +
        `(${a.end} → ${b.start}). Это впритык.`));
    }
  }
  return out;
}

function push(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
}

function capacityWarning(o, ctx) {
  const room = roomOf(o.roomId, ctx);
  if (!room?.capacity) return null;
  // Подгруппа — это примерно половина группы, целую численность ей не считаем.
  const total = o.groupIds.reduce((sum, id) => {
    const size = ctx.groups?.find(g => g.id === id)?.size || 0;
    return sum + (o.subgroup ? Math.ceil(size / 2) : size);
  }, 0);
  if (total <= room.capacity) return null;
  return mk('warning', 'capacity', o.date, o, null,
    `${roomLabel(o.roomId, ctx)}: вмещает ${room.capacity}, а групп набралось на ${total} человек.`);
}

function mk(level, type, date, a, b, message) {
  return { level, type, date, a, b, message };
}

/* ---------- Тексты. Их читают вслух на показе, поэтому они живут здесь,
   рядом с правилом, а не собираются по кусочкам в интерфейсе. ---------- */

function roomMessage(a, b, ctx) {
  return `${roomLabel(a.roomId, ctx)} ${ru(a.date)} в ${a.start}–${a.end} занята: ` +
    `${groupList(b, ctx)}, ${discipline(b, ctx)} (${b.kind}) в ${b.start}–${b.end}.`;
}

function teacherMessage(a, b, ctx) {
  const who = a.teacherIds.filter(t => b.teacherIds.includes(t))
    .map(t => teacherName(t, ctx)).join(', ');
  return `${who} ${ru(a.date)} в ${a.start}–${a.end} уже ведёт ` +
    `${discipline(b, ctx)} у ${groupList(b, ctx)} (${b.start}–${b.end}).`;
}

function groupMessage(a, b, ctx) {
  const who = a.groupIds.filter(g => b.groupIds.includes(g)).map(g => groupCode(g, ctx)).join(', ');
  const sub = a.subgroup || b.subgroup ? ` (подгруппа ${a.subgroup || b.subgroup})` : '';
  return `${who}${sub} ${ru(a.date)} в ${a.start}–${a.end} уже занята: ` +
    `${discipline(b, ctx)} (${b.kind}) в ${roomLabel(b.roomId, ctx)}.`;
}

function roomOf(roomId, ctx) { return ctx.rooms?.find(r => r.id === roomId) || null; }
function isOnline(roomId, ctx) { return roomOf(roomId, ctx)?.kind === 'online'; }
function buildingOf(roomId, ctx) {
  const r = roomOf(roomId, ctx);
  return r && r.kind !== 'online' ? r.buildingId : null;
}
function code(buildingId, ctx) {
  return ctx.buildings?.find(b => b.id === buildingId)?.code || buildingId;
}
function roomLabel(roomId, ctx) {
  const r = roomOf(roomId, ctx);
  if (!r) return 'Аудитория';
  if (r.kind === 'online') return r.name;
  const prefix = r.kind === 'gym' ? 'Зал' : r.kind === 'comp' ? 'Комп. класс' : 'Ауд.';
  return `${prefix} ${r.name} (${code(r.buildingId, ctx)})`;
}
function groupCode(id, ctx) { return ctx.groups?.find(g => g.id === id)?.code || id; }
function groupList(o, ctx) { return o.groupIds.map(g => groupCode(g, ctx)).join(' + '); }
function discipline(o, ctx) { return ctx.disciplineName?.(o.disciplineId) || o.disciplineId; }
function teacherName(id, ctx) { return ctx.teacherName?.(id) || id; }

/**
 * Свободные аудитории на интервал.
 * @param {object[]} occurrences все вхождения, среди которых ищем занятость
 * @param {object} ctx
 * @param {{date:string, start:string, end:string, buildingId?:string, kind?:string}} q
 */
export function freeRooms(occurrences, ctx, q) {
  const busy = new Set(
    (occurrences || [])
      .filter(o => o && o.status !== 'cancelled' && o.date === q.date && overlaps(o, q))
      .map(o => o.roomId)
  );
  return (ctx.rooms || []).filter(r =>
    r.kind !== 'online' &&
    !busy.has(r.id) &&
    (!q.buildingId || r.buildingId === q.buildingId) &&
    (!q.kind || r.kind === q.kind)
  );
}

/**
 * Сворачивает повторы: недельное занятие в занятой аудитории даёт конфликт
 * на каждую дату, а человеку нужна одна строка и список дат. Повтором
 * считается тот же тип конфликта с тем же вторым занятием.
 * Сообщение берётся у ближайшей даты. Ошибки идут раньше предупреждений.
 * @returns {object[]} конфликты с полем dates
 */
export function groupConflicts(conflicts) {
  const groups = new Map();
  for (const c of [...(conflicts || [])].sort((x, y) => x.date.localeCompare(y.date))) {
    const key = [c.level, c.type, c.a?.lessonId, c.b?.lessonId ?? ''].join('|');
    if (!groups.has(key)) groups.set(key, { ...c, dates: [] });
    groups.get(key).dates.push(c.date);
  }
  return [...groups.values()].sort((x, y) =>
    (x.level === 'error' ? 0 : 1) - (y.level === 'error' ? 0 : 1) || x.date.localeCompare(y.date));
}

/**
 * Аудитории, свободные на ВСЕХ вхождениях занятия.
 *
 * Аудитория меняется у занятия целиком, а не на одну дату. Конфликт
 * обычно недельный, и аудитория, свободная в эту среду и занятая в
 * следующую, решила бы его на один раз и родила бы новый.
 *
 * @param {object[]} candidateOccurrences вхождения занятия, которому ищем место
 * @param {object[]} existing все вхождения (само занятие среди них не мешает)
 * @param {{buildingId?:string, kind?:string}} q
 */
export function freeRoomsForAll(candidateOccurrences, existing, ctx, q = {}) {
  const ids = new Set((candidateOccurrences || []).map(o => o.lessonId));
  const busy = new Set();
  for (const o of existing || []) {
    if (!o || o.status === 'cancelled' || ids.has(o.lessonId) || !o.roomId) continue;
    if ((candidateOccurrences || []).some(c => c.date === o.date && c.status !== 'cancelled' && overlaps(c, o))) {
      busy.add(o.roomId);
    }
  }
  return (ctx.rooms || []).filter(r =>
    r.kind !== 'online' &&
    !busy.has(r.id) &&
    (!q.buildingId || r.buildingId === q.buildingId) &&
    (!q.kind || r.kind === q.kind)
  );
}

/**
 * Проверка одного занятия против уже существующих — для формы ввода.
 * @param {object[]} candidateOccurrences вхождения проверяемого занятия
 * @param {object[]} existing вхождения всего остального
 */
export function checkLesson(candidateOccurrences, existing, ctx) {
  const ids = new Set(candidateOccurrences.map(o => o.lessonId));
  const others = (existing || []).filter(o => !ids.has(o.lessonId));
  const all = [...others, ...candidateOccurrences];
  return findConflicts(all, ctx)
    .filter(c => ids.has(c.a?.lessonId) || ids.has(c.b?.lessonId))
    .map(c => (ids.has(c.a?.lessonId) ? c : orientConflict(c, c.b.lessonId, ctx)));
}

/**
 * Конфликт с позиции заданного занятия: оно становится `a`, и сообщение
 * называет занятым второе. Переезд и вместимость не разворачиваются —
 * у них текст про субъекта, а не про пару.
 */
export function orientConflict(c, lessonId, ctx) {
  if (!c?.b || c.a?.lessonId === lessonId || c.b.lessonId !== lessonId) return c;
  const text = MESSAGES[c.type];
  if (!text) return c;
  return { ...c, a: c.b, b: c.a, message: text(c.b, c.a, ctx) };
}

const MESSAGES = { room: roomMessage, teacher: teacherMessage, group: groupMessage };
