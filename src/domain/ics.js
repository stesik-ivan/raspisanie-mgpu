/* Выгрузка расписания в календарь (RFC 5545).

   Две вещи здесь не косметика, а условие работоспособности:

   1. Фолдинг строк на 75 октетов. iOS Calendar на длинной строке молча
      не подписывается на календарь — выглядит как «не работает», без
      единого сообщения. Считать надо октеты UTF-8, а не символы: русская
      буква весит два байта, и разрыв посередине даёт битый файл.
   2. VTIMEZONE. Без описания пояса Google Calendar не понимает
      TZID=Europe/Moscow и раскладывает пары по UTC — расписание уезжает
      на три часа. */

const CRLF = '\r\n';
const TZID = 'Europe/Moscow';

/**
 * @param {object[]} occurrences
 * @param {{name:string, titleOf:Function, locationOf?:Function, descriptionOf?:Function, domain?:string}} meta
 */
export function buildIcs(occurrences, meta) {
  const domain = meta.domain || 'raspisanie.mgpu';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//МГПУ//Расписание//RU`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(meta.name || 'Расписание')}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE,
  ];

  for (const o of occurrences || []) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${o.lessonId}-${o.date}-${o.slot}@${domain}`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;TZID=${TZID}:${dt(o.date, o.start)}`,
      `DTEND;TZID=${TZID}:${dt(o.date, o.end)}`,
      `SUMMARY:${escapeText(meta.titleOf?.(o) ?? '')}`,
      `STATUS:${o.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    );
    const where = meta.locationOf?.(o);
    if (where) lines.push(`LOCATION:${escapeText(where)}`);
    const desc = meta.descriptionOf?.(o);
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/* Москва без перехода на летнее время с 2014 года, поэтому блок статический. */
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0300',
  'TZNAME:MSK',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** '2026-10-22' + '10:30' → '20261022T103000' */
function dt(date, time) {
  return `${date.replace(/-/g, '')}T${String(time).replace(':', '')}00`;
}

function stamp() {
  // Фиксированная отметка: UID и так уникален, а меняющийся DTSTAMP делал бы
  // каждую выгрузку «изменённой» и заставлял календарь пересинхронизироваться.
  return '20260901T000000Z';
}

/** Экранирование по RFC 5545. Обратный слэш первым, иначе съест свои же вставки. */
export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Складывание длинной строки: не длиннее 75 октетов, продолжение начинается
 * с пробела. Режем по октетам UTF-8 и никогда посреди символа.
 */
export function foldLine(line) {
  if (bytesOf(line) <= 75) return line;

  const out = [];
  let rest = line;
  let limit = 75;

  while (bytesOf(rest) > limit) {
    let cut = 0;
    let bytes = 0;
    // Идём по кодовым точкам, чтобы не разрубить ни букву, ни суррогатную пару.
    for (const ch of rest) {
      const w = bytesOf(ch);
      if (bytes + w > limit) break;
      bytes += w;
      cut += ch.length;
    }
    if (cut === 0) break;   // один символ не влезает — дальше резать нечего
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    limit = 74;             // в продолжении первый октет занят пробелом
  }
  out.push(rest);

  return out[0] + out.slice(1).map(s => CRLF + ' ' + s).join('');
}

/* Длина в октетах UTF-8. TextEncoder, а не Buffer: Buffer есть только в
   Node, и в браузере на нём падала выгрузка календаря. */
const encoder = new TextEncoder();
function bytesOf(s) { return encoder.encode(s).length; }
