/* Генератор демо-данных.

   Две вещи, за которые он отвечает:

   1. Сценарии показа (docs/04) строятся ОТНОСИТЕЛЬНО текущей даты, чтобы
      в любой день демо было что показать: замена сегодня, отмена завтра.
   2. Опубликованное расписание не конфликтует само с собой. Единственная
      ошибка во всех данных — нарочно подложенный черновик из сценария 10.
      Иначе ловушка утонет в шуме, и главный аргумент показа пропадёт.

   Расписание раскладывает аллокатор, который держит занятость по реальному
   времени, а не по номеру пары: Ч-1 делят ВО и СПО с разными сетками. */

import { addDays, weekdayOf, compareIso } from '../domain/dates.js';
import { toMinutes, slotTime } from '../domain/bells.js';
import { BELLS_VO, BELLS_SPO, TERM, HOLIDAYS } from '../domain/fixtures.js';
import { UNITS, PROGRAMS, GROUPS, BUILDINGS, ROOMS, TEACHERS, ADMINS, DISCIPLINES } from './seed-data.js';
import { STATE_VERSION } from './demo-store.js';

const BELLS = { 'bells-vo': BELLS_VO, 'bells-spo': BELLS_SPO };

/** Детерминированный генератор: без него два вызова дали бы разные данные. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Занятость по реальному времени: аудитории, преподаватели, группы. */
class Allocator {
  constructor() { this.busy = new Map(); }

  _slots(key, weekday) {
    const k = `${key}@${weekday}`;
    if (!this.busy.has(k)) this.busy.set(k, []);
    return this.busy.get(k);
  }
  free(keys, weekday, from, to) {
    return keys.every(k => !this._slots(k, weekday).some(([a, b]) => from < b && a < to));
  }
  take(keys, weekday, from, to) {
    for (const k of keys) this._slots(k, weekday).push([from, to]);
  }
}

/* Ключи группы. Проверять и занимать надо РАЗНЫЕ наборы.

   Занятие на всю группу (subgroup null) мешает обеим подгруппам, поэтому
   занимает все три ключа. А лаба подгруппы 1 занимает только свой ключ:
   если бы она занимала и `all`, лаба подгруппы 2 в то же время оказалась
   бы невозможной — хотя это ровно то, что в расписании происходит каждый день. */
function checkKeys(groupId, subgroup) {
  return subgroup == null
    ? [`g:${groupId}:all`, `g:${groupId}:1`, `g:${groupId}:2`]
    : [`g:${groupId}:all`, `g:${groupId}:${subgroup}`];
}
function takeKeys(groupId, subgroup) {
  return subgroup == null
    ? [`g:${groupId}:all`, `g:${groupId}:1`, `g:${groupId}:2`]
    : [`g:${groupId}:${subgroup}`];
}
function bookKeys(groupIds, subgroup, teacherIds, roomId, mode) {
  const fn = mode === 'take' ? takeKeys : checkKeys;
  const keys = groupIds.flatMap(g => fn(g, subgroup));
  for (const t of teacherIds) keys.push(`t:${t}`);
  if (roomId && roomId !== 'r-online') keys.push(`r:${roomId}`);
  return keys;
}

const WEEKLY   = () => ({ parts: [{ type: 'range', from: TERM.termFrom, to: TERM.termTo, everyWeeks: 1 }], except: [...HOLIDAYS] });
const BIWEEKLY = () => ({ parts: [{ type: 'range', from: '2026-09-08', to: TERM.termTo, everyWeeks: 2 }], except: [...HOLIDAYS] });
const SPLIT    = () => ({ parts: [
  { type: 'range', from: '2026-09-09', to: '2026-10-28', everyWeeks: 1 },
  { type: 'range', from: '2026-11-11', to: '2026-12-23', everyWeeks: 1 },
], except: [] });

/** Отдельные даты — те дни недели занятия, что попали в сентябрь-октябрь. */
function LIST(weekday) {
  const out = [];
  let d = TERM.termFrom;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  for (let i = 0; i < 4; i++) { out.push(d); d = addDays(d, 14); }
  return { parts: [{ type: 'dates', list: out }], except: [] };
}

export function buildSeed({ today, groupCount = null } = {}) {
  const t0 = today || TERM.termFrom;
  const rand = rng(20261021);
  const alloc = new Allocator();

  const state = {
    version: STATE_VERSION,
    units: clone(UNITS),
    programs: clone(PROGRAMS),
    groups: clone(GROUPS),
    buildings: clone(BUILDINGS),
    rooms: clone(ROOMS),
    teachers: clone(TEACHERS),
    disciplines: clone(DISCIPLINES),
    admins: clone(ADMINS),
    bellSchedules: [clone(BELLS_VO), clone(BELLS_SPO)],
    terms: UNITS.map(u => ({
      id: `term-${u.id}`, unitId: u.id, name: '1 семестр 2026/27',
      from: TERM.termFrom, to: TERM.termTo,
      status: 'published', version: 3, validFrom: '2026-09-22', publishedAt: '2026-09-18T12:00',
    })),
    lessons: [],
    changes: [],
    audit: [],
    prefs: { role: null, unitId: null, groupId: null, subgroup: null, teacherId: null, adminId: null, theme: 'auto', onboarded: false },
    ephemeral: false,
  };

  const unitOf = (groupId) => {
    const g = state.groups.find(x => x.id === groupId);
    return state.programs.find(p => p.id === g.programId).unitId;
  };
  const bellsOf = (groupId) => BELLS[state.units.find(u => u.id === unitOf(groupId)).bellScheduleId];

  let n = 0;
  /** Кладёт занятие, если время свободно. Вернёт занятие или null. */
  function place({ groupIds, subgroup = null, disciplineId, kind, teacherIds, roomId, weekday, slot, rule, published = true, force = false }) {
    const time = slotTime(bellsOf(groupIds[0]), weekday, slot);
    if (!time) return null;
    const from = toMinutes(time.start), to = toMinutes(time.end);
    // force относится ТОЛЬКО к проверке аудитории. Черновик-ловушка обязан
    // столкнуться с уроком СПО по аудитории — и ни по чему больше: группа и
    // преподаватель у него проверяются честно. Занимает он при этом всё,
    // включая аудиторию, чтобы автозаполнение не подселило туда третьего и
    // один внятный конфликт не превратился в три необъяснимых.
    if (!alloc.free(bookKeys(groupIds, subgroup, teacherIds, force ? null : roomId, 'check'), weekday, from, to)) return null;
    alloc.take(bookKeys(groupIds, subgroup, teacherIds, roomId, 'take'), weekday, from, to);

    const lesson = {
      id: `L${++n}`, termId: `term-${unitOf(groupIds[0])}`,
      disciplineId, kind, groupIds: [...groupIds], subgroup,
      teacherIds: [...teacherIds], roomId, weekday, slot,
      dateRule: rule, published,
      updatedAt: '2026-09-18T12:00', version: 1,
    };
    state.lessons.push(lesson);
    return lesson;
  }

  /* Свободный ресурс из пула — но не всегда первый.

     Если брать первый подходящий, у группы весь день ведёт один человек
     в одной аудитории: расписание получается формально корректное и
     совершенно неправдоподобное. Поэтому обходим список по кругу со
     сдвигом, который зависит от дня и пары. Сдвиг детерминирован, так что
     сид остаётся воспроизводимым. */
  let spin = 0;
  function pick(list, keyPrefix, weekday, slot, groupId) {
    const time = slotTime(bellsOf(groupId), weekday, slot);
    if (!time) return null;
    const from = toMinutes(time.start), to = toMinutes(time.end);
    if (!list.length) return null;
    const start = (weekday * 7 + slot * 3 + (spin++)) % list.length;
    for (let i = 0; i < list.length; i++) {
      const x = list[(start + i) % list.length];
      if (alloc.free([`${keyPrefix}${x.id}`], weekday, from, to)) return x;
    }
    return null;
  }

  // Автозаполнение не выпускает группу из её корпуса: иначе расписание
  // обрастает переездами из Шереметьевской на Чечулина за десять минут,
  // и настоящий переезд из сценария 8 в этом шуме не разглядеть.
  const roomPool = (unitId, kind) => {
    const home = state.units.find(u => u.id === unitId).homeBuildingId;
    return state.rooms.filter(r =>
      r.kind === (kind || 'aud') && r.kind !== 'online' &&
      r.buildingId === home &&
      (r.pool === 'any' || r.pool === (unitId === 'u-ispo' ? 'spo' : 'vo')));
  };
  const teacherPool = (unitId) => state.teachers.filter(t => t.unitIds.includes(unitId));
  // «Разговоры о важном» ставятся вручную в понедельник первым уроком и
  // в автоподбор не идут: это еженедельный ритуал, а не обычный предмет.
  const discPool = (unitId) => state.disciplines.filter(d => d.unitId === unitId && d.id !== 'd-razg');

  const G = (code) => state.groups.find(g => g.code === code).id;

  /* ---------- Сценарии показа (docs/04) ---------- */

  // 1. Поток: лекция на все три группы 1 курса ИЕСТ
  place({ groupIds: [G('ГШТ-261'), G('ГОБЩ-261'), G('УЧБИХ-261')],
    disciplineId: 'd-geo', kind: 'лк', teacherIds: ['t-1'], roomId: 'r-304',
    weekday: 1, slot: 1, rule: WEEKLY() });

  // 3. Правила дат всех четырёх видов
  place({ groupIds: [G('ГШТ-261')], disciplineId: 'd-kart', kind: 'лк',
    teacherIds: ['t-2'], roomId: 'r-212', weekday: 3, slot: 1, rule: SPLIT() });
  place({ groupIds: [G('ГА-251')], disciplineId: 'd-meteo', kind: 'пр',
    teacherIds: ['t-4'], roomId: 'r-234', weekday: 2, slot: 2, rule: BIWEEKLY() });
  place({ groupIds: [G('МПБ-261м')], disciplineId: 'd-gidro', kind: 'лк',
    teacherIds: ['t-5'], roomId: 'r-315', weekday: 5, slot: 3, rule: LIST(5) });

  // 2. Подгруппы: лабы в одно время в разных аудиториях
  place({ groupIds: [G('ГОБЩ-261')], subgroup: '1', disciplineId: 'd-pochv', kind: 'лб',
    teacherIds: ['t-6'], roomId: 'r-215', weekday: 2, slot: 3, rule: WEEKLY() });
  place({ groupIds: [G('ГОБЩ-261')], subgroup: '2', disciplineId: 'd-pochv', kind: 'лб',
    teacherIds: ['t-7'], roomId: 'r-307', weekday: 2, slot: 3, rule: WEEKLY() });

  // 9. «Разговоры о важном» — понедельник, первый урок
  place({ groupIds: [G('11СПш-261')], disciplineId: 'd-razg', kind: 'внеуроч',
    teacherIds: ['t-19'], roomId: 'r-131', weekday: 1, slot: 1, rule: WEEKLY() });

  // 4. Урок, у которого сегодня будет замена преподавателя
  const spoWed = place({ groupIds: [G('11СПш-261')], disciplineId: 'd-mat', kind: 'урок',
    teacherIds: ['t-20'], roomId: 'r-132', weekday: 3, slot: 2, rule: WEEKLY() });

  // 10. Урок СПО в Ч-1, с которым столкнётся черновик ИЕСТ
  place({ groupIds: [G('11СПш-261')], disciplineId: 'd-rus', kind: 'урок',
    teacherIds: ['t-21'], roomId: 'r-133', weekday: 3, slot: 3, rule: WEEKLY() });

  // 5. Пара, которую завтра отменят
  const gaThu = place({ groupIds: [G('ГА-251')], disciplineId: 'd-bio', kind: 'лк',
    teacherIds: ['t-8'], roomId: 'r-204', weekday: 4, slot: 2, rule: WEEKLY() });

  // 8. Переезд: Ч-1 → Ч-3 за 20 минут (окно сетки СПО между 4-м и 5-м уроком)
  place({ groupIds: [G('11СПш-261')], disciplineId: 'd-obzh', kind: 'урок',
    teacherIds: ['t-22'], roomId: 'r-134', weekday: 5, slot: 4, rule: WEEKLY() });
  place({ groupIds: [G('11СПш-261')], disciplineId: 'd-fiz2', kind: 'урок',
    teacherIds: ['t-23'], roomId: 'r-Б-123', weekday: 5, slot: 5, rule: WEEKLY() });

  // 7. Суббота у СПО — в Сферуме
  place({ groupIds: [G('11СПш-261')], disciplineId: 'd-inf', kind: 'урок',
    teacherIds: ['t-24'], roomId: 'r-online', weekday: 6, slot: 1, rule: WEEKLY() });
  place({ groupIds: [G('НХТфш-251')], disciplineId: 'd-psih', kind: 'урок',
    teacherIds: ['t-25'], roomId: 'r-online', weekday: 6, slot: 2, rule: WEEKLY() });

  /* ---------- 10. Ловушка: неопубликованный черновик ---------- */

  // Аудитория 133 в Ч-1 занята уроком русского у 11СПш-261 в 10:40–11:25.
  // Пара ИЕСТ в 10:30–11:50 туда не влезает — но в Excel этого не видно:
  // там она стоит под номером 2, а урок под номером 3, и глазами номера
  // не сравнишь. Ставим ДО автозаполнения, чтобы слот группы остался за ней.
  place({ groupIds: [G('УЧБИХ-261')], disciplineId: 'd-anat', kind: 'пр',
    teacherIds: ['t-9'], roomId: 'r-133', weekday: 3, slot: 2,
    rule: WEEKLY(), published: false, force: true });

  /* ---------- Остальное расписание ---------- */

  fill(state.groups.filter(g => !g.synthetic));

  function fill(groups) {
    for (const g of groups) {
      const unitId = unitOf(g.id);
      const spo = unitId === 'u-ispo';
      // ФК-242 нарочно учится три дня: сценарий 11 требует группы с пустым
      // учебным днём, чтобы показать экран «Сегодня пар нет».
      const days = g.code === 'ФК-242' ? [1, 2, 3] : [1, 2, 3, 4, 5];
      const slots = spo ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
      const discs = discPool(unitId);
      // Плотность подобрана под живое расписание: у СПО 4-5 уроков в день,
      // у ВО 3-4 пары. Реже — и на экране «Сегодня» пусто в середине дня,
      // а на показе это читается как «система ничего не знает».
      const target = spo ? 22 : 15;
      let made = 0;

      for (const weekday of days) {
        // Одна дисциплина — один раз в день. Два «Русского языка» подряд
        // выглядят как ошибка набора, даже когда формально всё сходится.
        const usedToday = new Set();
        for (const slot of slots) {
          if (made >= target) break;
          if (rand() < 0.12) continue;
          const kind = spo ? 'урок' : ['лк', 'пр', 'лб'][Math.floor(rand() * 3)];
          // Аудитория должна вмещать группу. Лаборатория на 16 мест рассчитана
          // на подгруппу, и сажать туда курс целиком — значит засыпать сетку
          // админа предупреждениями, среди которых настоящие не разглядеть.
          const fits = (list) => list.filter(r => !r.capacity || r.capacity >= g.size);
          const room = pick(fits(roomPool(unitId, kind === 'лб' ? 'lab' : 'aud')), 'r:', weekday, slot, g.id)
            || pick(fits(roomPool(unitId, 'aud')), 'r:', weekday, slot, g.id);
          const teacher = pick(teacherPool(unitId), 't:', weekday, slot, g.id);
          if (!room || !teacher) continue;
          const free = discs.filter(d => !usedToday.has(d.id));
          if (!free.length) continue;
          const disc = free[Math.floor(rand() * free.length)];
          const made1 = place({ groupIds: [g.id], disciplineId: disc.id, kind,
            teacherIds: [teacher.id], roomId: room.id, weekday, slot, rule: WEEKLY() });
          if (made1) { made++; usedToday.add(disc.id); }
        }
      }
    }
  }

  /* ---------- Раздувание для нагрузочной проверки ---------- */

  if (groupCount && groupCount > state.groups.length) {
    const extra = [];
    for (let i = state.groups.length; i < groupCount; i++) {
      extra.push({ id: `g-x${i}`, programId: 'p-ico', code: `ДЕМО-${100 + i}`,
        course: (i % 4) + 1, subgroups: [], size: 20 + (i % 8), synthetic: true, demo: true });
    }
    state.groups.push(...extra);
    fill(extra);
  }

  /* ---------- Изменения (сценарии 4, 5, 6) ---------- */

  const dateFor = (lesson, wanted) => {
    const { dates } = expandOf(lesson);
    if (dates.includes(wanted)) return wanted;
    return dates.find(d => compareIso(d, wanted) >= 0) || dates.at(-1) || wanted;
  };

  /* Выбираем занятие, которое ДЕЙСТВИТЕЛЬНО идёт в нужный день.

     Привязывать «замену сегодня» к заранее назначенной паре нельзя: показ
     может прийтись на любой день недели, и если у группы в этот день этой
     пары нет, замена уезжает на неделю вперёд — а на экране «Сегодня»
     пусто. Поэтому ищем занятие по дню недели нужной даты. */
  const lessonOnDay = (groupId, date, fallback) => {
    const wd = weekdayOf(date);
    const hit = state.lessons.find(l =>
      l.published && l.groupIds.includes(groupId) && l.weekday === wd &&
      expandOf(l).dates.includes(date));
    return hit || fallback;
  };

  const subDate = t0;
  const subLesson = lessonOnDay(G('11СПш-261'), subDate, spoWed);
  if (subLesson) {
    // Подменяющий должен быть свободен в это время. Иначе замена сама
    // родит конфликт преподавателя, и на показе это выглядит как брак.
    const sub = pick(teacherPool('u-ispo').filter(x => !subLesson.teacherIds.includes(x.id)),
      't:', subLesson.weekday, subLesson.slot, subLesson.groupIds[0]);
    if (sub) {
      state.changes.push({
        id: 'CH1', date: dateFor(subLesson, subDate), lessonId: subLesson.id, type: 'teacher',
        patch: { teacherIds: [sub.id] }, reason: 'больничный',
        adminId: 'a-ispo', createdAt: `${subDate}T08:12`,
      });
    }
  }

  /* Отмену ставим у ГА-251, а если завтра у неё пар нет — у любой группы ВО,
     у которой они есть. Сценарий «отмена завтра» важнее конкретной группы:
     без него на показе нечего показать на вкладке «Изменения». */
  const cancelDate = addDays(t0, 1);
  const cancelLesson = lessonOnDay(G('ГА-251'), cancelDate, null)
    || state.groups
        .filter(g => !g.synthetic)
        .map(g => lessonOnDay(g.id, cancelDate, null))
        .find(Boolean)
    || gaThu;
  if (cancelLesson) {
    state.changes.push({
      id: 'CH2', date: dateFor(cancelLesson, cancelDate), lessonId: cancelLesson.id, type: 'cancel',
      patch: {}, reason: 'преподаватель на конференции',
      adminId: 'a-iest', createdAt: `${t0}T09:40`,
    });
  }
  // Переносим во вторник → субботу: у ВО суббота пустая, значит перенос
  // гарантированно никуда не врежется. Выбор не косметический — перенос
  // на занятый слот был бы вторым конфликтом поверх ловушки.
  const movable = state.lessons.find(l =>
    l.published && l.weekday === 2 && l.groupIds.length === 1 && l.subgroup === null &&
    state.units.find(u => u.id === unitOf(l.groupIds[0])).kind === 'vo');
  if (movable) {
    const from = dateFor(movable, addDays(t0, 2));
    state.changes.push({
      id: 'CH3', date: from, lessonId: movable.id, type: 'move',
      patch: { date: addDays(from, 4), slot: movable.slot },
      reason: 'совмещение с общеуниверситетским мероприятием',
      adminId: 'a-iest', createdAt: `${t0}T10:05`,
    });
  }

  function expandOf(lesson) {
    // Локальная развёртка без изменений — нужна только чтобы выбрать дату.
    const bells = bellsOf(lesson.groupIds[0]);
    const dates = [];
    for (const part of lesson.dateRule.parts) {
      if (part.type === 'dates') { dates.push(...part.list); continue; }
      let d = part.from;
      while (weekdayOf(d) !== lesson.weekday) d = addDays(d, 1);
      const end = part.to || TERM.termTo;
      while (compareIso(d, end) <= 0) {
        if (!lesson.dateRule.except.includes(d) && slotTime(bells, lesson.weekday, lesson.slot)) dates.push(d);
        d = addDays(d, 7 * (part.everyWeeks || 1));
      }
    }
    return { dates: [...new Set(dates)].sort(compareIso) };
  }

  /* ---------- 12. Журнал ---------- */

  const actions = ['create', 'update', 'update', 'publish', 'update', 'delete'];
  const entities = ['Lesson', 'Lesson', 'Change', 'Term', 'Lesson', 'Lesson'];
  for (let i = 0; i < 18; i++) {
    const admin = state.admins[i % 2];
    // От вчера до недели назад: журнал сида — прошлое, а правки на показе
    // встают сверху, по времени.
    const day = addDays(t0, -(i % 7) - 1);
    const hh = String(9 + (i % 8)).padStart(2, '0');
    const mm = String((i * 7) % 60).padStart(2, '0');
    state.audit.push({
      id: `AU${i + 1}`, at: `${day}T${hh}:${mm}`, adminId: admin.id,
      entity: entities[i % entities.length], entityId: state.lessons[i % state.lessons.length]?.id || 'L1',
      action: actions[i % actions.length],
      before: null, after: null,
    });
  }
  state.audit.sort((a, b) => b.at.localeCompare(a.at));

  return state;
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }
