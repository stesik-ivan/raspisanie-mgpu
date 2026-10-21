/* Бронь аудитории преподавателем.

   Преподаватель видит, что аудитория свободна, и занимает её до нужного
   времени: «до 12:40, пока свободна» или на полчаса. Для остальных это
   такая же занятость, как пара: аудитория пропадает из свободных, а пару
   администратор туда поставить не сможет — проверка конфликтов увидит бронь.

   Бронь — не занятие: у неё нет групп и в расписание студентов она не
   попадает. Преподавателя в ней тоже нет (teacherIds пуст), иначе бронь
   конфликтовала бы с его же парой; кто занял — в bookedBy. */

import { isIso } from './dates.js';
import { toMinutes, fromMinutes } from './bells.js';

/** Брони → вхождения-занятости для проверки аудиторий. */
export function bookingOccurrences(bookings) {
  return (bookings || []).map(b => ({
    lessonId: `booking:${b.id}`, bookingId: b.id, bookedBy: b.teacherId,
    disciplineId: null, kind: 'бронь',
    date: b.date, slot: null, start: b.start, end: b.end,
    groupIds: [], subgroup: null, teacherIds: [], roomId: b.roomId,
    status: 'ok', changeIds: [],
  }));
}

const STEP = 30;          // отметки «до» — каждые полчаса
const MIN_LEN = 30;       // короче получаса занимать незачем
const DAY_END = 20 * 60;  // корпуса закрываются

/**
 * До какого времени можно занять: полчасовые отметки (не больше четырёх)
 * и последней — сама граница: начало следующей занятости или конец дня.
 * @param {number} nowMin минуты от полуночи
 * @param {number|null} limitMin когда аудиторию займут; null — свободна до вечера
 * @returns {string[]} 'HH:MM'
 */
export function bookingEnds(nowMin, limitMin) {
  const limit = Math.min(limitMin ?? DAY_END, DAY_END);
  if (limit - nowMin <= 0) return [];
  const out = [];
  for (let t = Math.ceil((nowMin + MIN_LEN) / STEP) * STEP; t < limit && out.length < 4; t += STEP) out.push(t);
  out.push(limit);
  return [...new Set(out)].map(fromMinutes);
}

/** @returns {{field:string, message:string}[]} */
export function validateBooking(b) {
  const out = [];
  if (!b?.roomId) out.push({ field: 'roomId', message: 'Не выбрана аудитория' });
  if (!isIso(b?.date)) out.push({ field: 'date', message: 'Не выбран день' });
  const s = toMinutes(b?.start), e = toMinutes(b?.end);
  if (s === null || e === null) out.push({ field: 'end', message: 'Не выбрано время' });
  else if (e <= s) out.push({ field: 'end', message: 'Время окончания раньше начала' });
  return out;
}
