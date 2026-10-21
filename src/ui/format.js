/* Форматирование дат, времени и чисел по-русски.
   Intl здесь не берём для дней и месяцев: нужны именно родительный падеж
   («21 октября») и короткие формы, а Intl даёт их непоследовательно
   в разных движках. Для показа важно, чтобы везде было одинаково. */

import { weekdayOf } from '../domain/dates.js';

const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DOW_FULL = [, 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DOW_SHORT = [, 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const parts = (iso) => String(iso).split('-').map(Number);

/** '2026-10-21' → 'Среда, 21 октября' */
export function longDate(iso) {
  const [, m, d] = parts(iso);
  return `${DOW_FULL[weekdayOf(iso)]}, ${d} ${MONTH_GEN[m - 1]}`;
}

/** '2026-10-21' → '21 октября' */
export function dayMonth(iso) {
  const [, m, d] = parts(iso);
  return `${d} ${MONTH_GEN[m - 1]}`;
}

/** '2026-10-21' → '21.10' */
export function shortDate(iso) {
  const [, m, d] = parts(iso);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

export function dowFull(iso) { return DOW_FULL[weekdayOf(iso)]; }
export function dowShort(iso) { return DOW_SHORT[weekdayOf(iso)]; }

/** '2026-10-19' + '2026-10-24' → '19–24 окт' или '28 сен – 3 окт' */
export function rangeLabel(fromIso, toIso) {
  const [, m1, d1] = parts(fromIso);
  const [, m2, d2] = parts(toIso);
  return m1 === m2
    ? `${d1}–${d2} ${MONTH_SHORT[m2 - 1]}`
    : `${d1} ${MONTH_SHORT[m1 - 1]} – ${d2} ${MONTH_SHORT[m2 - 1]}`;
}

/** Склонение по числу: plural(5, 'минута','минуты','минут') → 'минут' */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** 95 → '1 ч 35 мин', 34 → '34 мин' */
export function duration(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} ${plural(m, 'минута', 'минуты', 'минут')}`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ${plural(h, 'час', 'часа', 'часов')}`;
}

/** Короткая форма для подписей: 50 → '50 мин', 95 → '1 ч 35 мин' */
export function durationShort(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}

/** 'лк' → 'Лекция' — в карточке вид пишем словом, а не сокращением. */
const KINDS = {
  'лк': 'Лекция', 'пр': 'Практика', 'лб': 'Лабораторная',
  'урок': 'Урок', 'внеуроч': 'Внеурочное', 'конс': 'Консультация',
  'экз': 'Экзамен', 'зач': 'Зачёт',
};
export function kindName(kind) { return KINDS[kind] || kind; }

/** '2026-10-21T08:12' → '21.10, 08:12' */
export function stamp(iso) {
  const [date, time] = String(iso).split('T');
  return `${shortDate(date)}, ${(time || '').slice(0, 5)}`;
}
