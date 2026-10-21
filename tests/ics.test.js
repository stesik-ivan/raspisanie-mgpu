import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, foldLine, escapeText } from '../src/domain/ics.js';

const occ = (o = {}) => ({
  lessonId: 'L1', date: '2026-10-22', slot: 2, start: '10:30', end: '11:50',
  groupIds: ['g1'], subgroup: null, teacherIds: ['t1'], roomId: 'r304',
  status: 'ok', changeIds: [], ...o,
});

const meta = {
  name: 'ГШТ-261',
  titleOf: (o) => o.status === 'cancelled' ? 'Геология (отменено)' : 'Геология (лк)',
  locationOf: () => 'Ауд. 304, Ч-1, ул. Чечулина, д. 1',
  descriptionOf: () => 'Иванова А.Б., доц.',
};

test('на каждое вхождение один VEVENT', () => {
  const ics = buildIcs([occ(), occ({ date: '2026-10-29' })], meta);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 2);
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('строки разделены CRLF и ни одного голого LF', () => {
  const ics = buildIcs([occ()], meta);
  assert.ok(ics.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(ics));
});

test('DTSTART и DTEND с TZID Europe/Moscow и локальным временем', () => {
  const ics = buildIcs([occ()], meta);
  assert.match(ics, /DTSTART;TZID=Europe\/Moscow:20261022T103000/);
  assert.match(ics, /DTEND;TZID=Europe\/Moscow:20261022T115000/);
});

test('календарь несёт описание часового пояса, иначе Google его не разберёт', () => {
  const ics = buildIcs([occ()], meta);
  assert.match(ics, /BEGIN:VTIMEZONE/);
  assert.match(ics, /TZID:Europe\/Moscow/);
});

test('UID стабилен между вызовами и различается у разных дат', () => {
  const a = buildIcs([occ()], meta);
  const b = buildIcs([occ()], meta);
  assert.equal(uid(a), uid(b));
  const c = buildIcs([occ({ date: '2026-10-29' })], meta);
  assert.notEqual(uid(a), uid(c));
});

test('отменённое вхождение даёт STATUS:CANCELLED', () => {
  const ics = buildIcs([occ({ status: 'cancelled' })], meta);
  assert.match(ics, /STATUS:CANCELLED/);
  const ok = buildIcs([occ()], meta);
  assert.match(ok, /STATUS:CONFIRMED/);
});

test('строка длиннее 75 октетов сложена с пробелом в начале продолжения', () => {
  const long = 'SUMMARY:' + 'Литература'.repeat(12);
  const folded = foldLine(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(byteLen(l) <= 75, `строка ${byteLen(l)} октетов: ${l}`);
  for (const l of lines.slice(1)) assert.equal(l[0], ' ');
});

test('фолдинг считает октеты, а не символы, и не рвёт букву пополам', () => {
  const folded = foldLine('DESCRIPTION:' + 'я'.repeat(80));
  for (const l of folded.split('\r\n')) {
    assert.ok(byteLen(l) <= 75);
    assert.ok(!l.includes('�'));
  }
  assert.equal(unfold(folded), 'DESCRIPTION:' + 'я'.repeat(80));
});

test('короткая строка не складывается', () => {
  assert.equal(foldLine('SUMMARY:Геология'), 'SUMMARY:Геология');
});

test('запятые, точки с запятой, обратные слэши и переводы строк экранированы', () => {
  assert.equal(escapeText('а, б; в\\г\nд'), 'а\\, б\; в\\\\г\\nд');
});

test('экранирование доезжает до готового календаря', () => {
  const ics = buildIcs([occ()], { ...meta, titleOf: () => 'Геология, общая; курс' });
  assert.match(ics, /Геология\\, общая\; курс/);
});

test('пустой список вхождений даёт валидный пустой календарь', () => {
  const ics = buildIcs([], meta);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 0);
});

test('имя календаря попадает в X-WR-CALNAME', () => {
  assert.match(buildIcs([], meta), /X-WR-CALNAME:ГШТ-261/);
});

function uid(ics) { return /UID:(.+)\r\n/.exec(ics)?.[1]; }
function byteLen(s) { return Buffer.byteLength(s, 'utf8'); }
function unfold(s) { return s.split('\r\n ').join(''); }

/* В браузере нет Buffer — он есть только в Node. Тесты гонялись в Node и
   этого не видели, а кнопка «Скачать .ics» на телефоне падала. */
test('foldLine и buildIcs работают без Buffer, как в браузере', () => {
  const saved = globalThis.Buffer;
  globalThis.Buffer = undefined;
  try {
    const folded = foldLine('DESCRIPTION:' + 'я'.repeat(80));
    assert.ok(folded.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
    assert.equal(foldLine('SUMMARY:Геология'), 'SUMMARY:Геология');
  } finally {
    globalThis.Buffer = saved;
  }
});
