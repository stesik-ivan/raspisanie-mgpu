/* Единственный источник «сейчас» во всём приложении.

   Нигде больше не вызываются Date.now() и new Date() без аргументов.
   Причина практическая: на показе время подменяется через ?now=, и если
   часть экранов спросит систему напрямую, «текущая пара» разъедется с
   лентой — на глазах у руководства.

   ?now=2026-10-22T10:45 читается один раз при загрузке. Мусор в параметре
   не роняет приложение и не превращается в Invalid Date, а откатывается
   на реальное время с записью в консоль. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Проверяет строку ?now=. Не время → null. Экспортируется ради теста. */
export function parseNowParam(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!ISO_DATE.test(s) && !ISO_DATETIME.test(s)) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  // Date молча переносит 30 февраля на март — сверяем, что число уцелело.
  if (String(d.getDate()).padStart(2, '0') !== s.slice(8, 10)) return null;
  return s;
}

let frozen = null;   // подменённое время, если его задали

function readParam() {
  if (typeof location === 'undefined') return null;
  try {
    const raw = new URLSearchParams(location.search).get('now');
    if (raw === null) return null;
    const ok = parseNowParam(raw);
    if (!ok) {
      console.warn(`clock: ?now=${raw} — не время, беру настоящее`);
      return null;
    }
    return new Date(ok.length === 10 ? `${ok}T00:00:00` : ok);
  } catch (err) {
    console.warn('clock: не разобрал ?now', err);
    return null;
  }
}

let initialised = false;
function init() {
  if (initialised) return;
  initialised = true;
  frozen = readParam();
  if (frozen) console.info('clock: демо-время', frozen.toLocaleString('ru-RU'));
}

/** Текущий момент — настоящий или подменённый. */
export function now() {
  init();
  return frozen ? new Date(frozen) : new Date();
}

/** Показ идёт на подменённом времени? */
export function isDemoTime() {
  init();
  return frozen !== null;
}

/** Date → 'YYYY-MM-DD' по местному времени, без сдвига на сутки. */
export function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Минуты от местной полуночи. */
export function toMinutesOfDay(d) {
  return d.getHours() * 60 + d.getMinutes();
}

/** Сегодняшняя дата в виде 'YYYY-MM-DD'. */
export function today() {
  return toIsoDate(now());
}

/** Сколько минут прошло с полуночи. */
export function nowMinutes() {
  return toMinutesOfDay(now());
}

/** Только для тестов: заморозить время, как ?now= в браузере. */
export function freezeClockForTests(iso) {
  const ok = parseNowParam(iso);
  if (!ok) throw new Error(`freezeClockForTests: не время: ${iso}`);
  initialised = true;
  frozen = new Date(ok.length === 10 ? `${ok}T00:00:00` : ok);
}

/** Только для тестов и кнопки «Сбросить демо-данные». */
export function resetClock() {
  initialised = false;
  frozen = null;
}
