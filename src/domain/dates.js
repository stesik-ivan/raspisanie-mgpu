/* Развёртка правил дат.

   Главное решение: дата здесь — строка 'YYYY-MM-DD', а не объект Date.
   ISO-строки сравниваются и сортируются лексикографически, поэтому вся
   работа идёт со строками, а Date появляется только внутри арифметики —
   и всегда с полднем по UTC.

   Почему полдень по UTC: `new Date('2026-10-22')` разбирается как полночь
   UTC, и в любом поясе западнее Гринвича `getDate()` вернёт 21-е число.
   А прибавление суток через локальное время спотыкается о переход на
   зимнее время, где в сутках 25 часов. Полдень по UTC не ломается ни там,
   ни там: до края суток остаётся двенадцать часов запаса. */

const DAY_MS = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → Date (полдень UTC). Невалидная строка → null. */
function toUtc(iso) {
  const m = ISO_RE.exec(String(iso ?? ''));
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, 12));
  // Отсекаем 31 февраля и прочее, что Date молча переносит на следующий месяц.
  if (date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  return date;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

/** Проверка, что строка — настоящая дата. */
export function isIso(iso) {
  return toUtc(iso) !== null;
}

/** Сдвиг на n суток. Возвращает ISO-строку. */
export function addDays(iso, n) {
  const d = toUtc(iso);
  if (!d) throw new TypeError(`addDays: не дата: ${iso}`);
  return toIso(new Date(d.getTime() + n * DAY_MS));
}

/** День недели по ISO 8601: понедельник = 1, воскресенье = 7. */
export function weekdayOf(iso) {
  const d = toUtc(iso);
  if (!d) throw new TypeError(`weekdayOf: не дата: ${iso}`);
  return d.getUTCDay() || 7;   // getUTCDay: вс = 0, у нас вс = 7
}

/** Сравнение дат для сортировки. */
export function compareIso(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(iso) {
  return addDays(iso, 1 - weekdayOf(iso));
}

/**
 * Разворачивает DateRule в список дат.
 *
 * @param {{parts: Array, except?: string[]}} rule
 * @param {{weekday: number, termFrom: string, termTo: string}} ctx
 * @returns {{dates: string[], warnings: string[]}}
 *
 * Части типа 'dates' берутся как есть: человек вписал конкретные числа,
 * и в образце ИЕСТ они стоят в колонке своего дня. Части типа 'range'
 * разворачиваются по дню недели занятия.
 *
 * Расхождения (чужой день недели, выход за границы семестра) не отбрасывают
 * дату, а попадают в warnings: в живом расписании это переносы, и терять
 * их молча нельзя.
 */
export function expandDateRule(rule, ctx) {
  const warnings = [];
  const parts = Array.isArray(rule?.parts) ? rule.parts : [];
  const except = new Set(Array.isArray(rule?.except) ? rule.except : []);
  const found = new Set();

  for (const part of parts) {
    if (part?.type === 'dates') {
      for (const iso of part.list || []) {
        if (!isIso(iso)) { warnings.push(`Не дата: ${iso}`); continue; }
        checkDate(iso, ctx, warnings);
        found.add(iso);
      }
    } else if (part?.type === 'range') {
      for (const iso of expandRange(part, ctx, warnings)) found.add(iso);
    } else if (part) {
      warnings.push(`Неизвестный тип правила дат: ${part.type}`);
    }
  }

  const dates = [...found].filter(iso => !except.has(iso)).sort(compareIso);
  return { dates, warnings };
}

function expandRange(part, ctx, warnings) {
  const out = [];
  const from = part.from;
  const to = part.to ?? ctx.termTo;

  if (!isIso(from)) { warnings.push(`Не дата начала диапазона: ${from}`); return out; }
  if (!isIso(to)) { warnings.push(`Не дата конца диапазона: ${to}`); return out; }
  if (compareIso(to, from) < 0) {
    warnings.push(`Диапазон кончается раньше, чем начинается: с ${ru(from)} по ${ru(to)}`);
    return out;
  }

  const step = part.everyWeeks === 2 ? 2 : 1;
  const weekday = ctx.weekday;

  // Первый день, совпадающий с днём недели занятия, начиная с from.
  let cur = from;
  const shift = (weekday - weekdayOf(from) + 7) % 7;
  if (shift) cur = addDays(cur, shift);

  while (compareIso(cur, to) <= 0) {
    checkDate(cur, ctx, warnings);
    out.push(cur);
    cur = addDays(cur, 7 * step);
  }
  return out;
}

function checkDate(iso, ctx, warnings) {
  if (ctx?.weekday && weekdayOf(iso) !== ctx.weekday) {
    warnings.push(`${ru(iso)} — ${DOW[weekdayOf(iso)]}, а занятие стоит в ${DOW_IN[ctx.weekday]}`);
  }
  if (ctx?.termFrom && compareIso(iso, ctx.termFrom) < 0) {
    warnings.push(`${ru(iso)} — раньше начала семестра`);
  }
  if (ctx?.termTo && compareIso(iso, ctx.termTo) > 0) {
    warnings.push(`${ru(iso)} — позже конца семестра`);
  }
}

const DOW = [, 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const DOW_IN = [, 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];

/** '2026-10-22' → '22.10' — для сообщений человеку. */
export function ru(iso) {
  const m = ISO_RE.exec(String(iso ?? ''));
  return m ? `${m[3]}.${m[2]}` : String(iso);
}
