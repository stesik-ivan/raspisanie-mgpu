/* Сетка звонков.

   Время — строка 'HH:MM', расчёты идут в минутах от полуночи. Часовой пояс
   здесь не участвует вообще: звонок в 10:30 — это 10:30 по месту, а не
   момент на оси времени.

   Сетка своя у каждого подразделения и может отличаться по дням: у ВО пары
   по 80 минут, у СПО уроки по 45, а в субботу у СПО сдвинуты обеды. Отсюда
   byWeekday — переопределение на конкретный день недели. */

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

/** 'HH:MM' → минуты от полуночи. Не время → null (а не NaN, который молча расползается). */
export function toMinutes(hhmm) {
  const m = HHMM_RE.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Минуты от полуночи → 'HH:MM'. */
export function fromMinutes(n) {
  if (!Number.isFinite(n)) return null;
  const v = ((Math.round(n) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Сетка на конкретный день недели: byWeekday перекрывает основную. */
export function slotsOf(bellSchedule, weekday) {
  if (!bellSchedule) return [];
  const byDay = bellSchedule.byWeekday?.[weekday];
  return Array.isArray(byDay) ? byDay : (bellSchedule.slots || []);
}

/**
 * Время пары. Нет такой пары в сетке дня — null.
 * У ВО пять пар, и занятие с slot 7 — это ошибка набора, а не повод уронить экран.
 */
export function slotTime(bellSchedule, weekday, slot) {
  const found = slotsOf(bellSchedule, weekday).find(s => s.n === slot);
  if (!found) return null;
  return { start: found.start, end: found.end };
}

/**
 * Где мы сейчас относительно сетки дня.
 * @returns {{phase:'before'|'in'|'gap'|'after', slot:number|null, next:number|null, leftMin:number|null}}
 *   phase 'in'   — идёт пара `slot`, до её конца leftMin минут
 *   phase 'gap'  — окно, до начала пары `next` leftMin минут
 *   phase 'before' — день ещё не начался, первая пара `next` через leftMin
 *   phase 'after'  — пары кончились
 *
 * Границы: ровно в начало пары мы уже внутри, ровно в конец — уже нет.
 * Интервал полуоткрытый [start, end), так же как в проверке конфликтов.
 */
export function slotAt(bellSchedule, weekday, minutes) {
  const none = { phase: 'after', slot: null, next: null, leftMin: null };
  if (!Number.isFinite(minutes)) return none;

  const slots = slotsOf(bellSchedule, weekday)
    .map(s => ({ ...s, from: toMinutes(s.start), to: toMinutes(s.end) }))
    .filter(s => s.from !== null && s.to !== null)
    .sort((a, b) => a.from - b.from);

  if (!slots.length) return none;

  for (const s of slots) {
    if (minutes >= s.from && minutes < s.to) {
      return { phase: 'in', slot: s.n, next: null, leftMin: s.to - minutes };
    }
  }

  const ahead = slots.find(s => s.from > minutes);
  if (!ahead) return none;

  return {
    phase: minutes < slots[0].from ? 'before' : 'gap',
    slot: null,
    next: ahead.n,
    leftMin: ahead.from - minutes,
  };
}

/** Длительность пары в минутах, для подписей вроде «80 мин». */
export function slotLength(bellSchedule, weekday, slot) {
  const t = slotTime(bellSchedule, weekday, slot);
  if (!t) return null;
  return toMinutes(t.end) - toMinutes(t.start);
}
