import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandDateRule, addDays, weekdayOf, compareIso } from '../src/domain/dates.js';

const TERM = { termFrom: '2026-09-01', termTo: '2026-12-30' };
const r = (...parts) => ({ parts, except: [] });

test('weekdayOf: ISO-нумерация, пн=1, вс=7', () => {
  assert.equal(weekdayOf('2026-10-21'), 3);  // среда
  assert.equal(weekdayOf('2026-09-05'), 6);  // суббота
  assert.equal(weekdayOf('2026-11-01'), 7);  // воскресенье
  assert.equal(weekdayOf('2026-11-02'), 1);  // понедельник
});

test('addDays не съезжает через переход на зимнее время', () => {
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('compareIso сравнивает даты как даты', () => {
  assert.ok(compareIso('2026-09-09', '2026-10-01') < 0);
  assert.equal(compareIso('2026-09-09', '2026-09-09'), 0);
  assert.ok(compareIso('2026-10-01', '2026-09-09') > 0);
});

// docs/02, тестовый случай 1
test('два диапазона с разрывом по средам дают 15 дат и не содержат 04.11', () => {
  const { dates } = expandDateRule(r(
    { type: 'range', from: '2026-09-09', to: '2026-10-28', everyWeeks: 1 },
    { type: 'range', from: '2026-11-11', to: '2026-12-23', everyWeeks: 1 },
  ), { weekday: 3, ...TERM });
  assert.equal(dates.length, 15);
  assert.equal(dates[0], '2026-09-09');
  assert.equal(dates.at(-1), '2026-12-23');
  assert.ok(!dates.includes('2026-11-04'));
});

// docs/02, тестовый случай 2
test('отдельные даты берутся как есть', () => {
  const { dates } = expandDateRule(
    r({ type: 'dates', list: ['2026-09-10', '2026-09-24', '2026-10-08', '2026-10-22'] }),
    { weekday: 4, ...TERM });
  assert.deepEqual(dates, ['2026-09-10', '2026-09-24', '2026-10-08', '2026-10-22']);
});

// docs/02, тестовый случай 3
test('everyWeeks: 2 шагает через неделю, except вычитается последним', () => {
  const { dates } = expandDateRule({
    parts: [{ type: 'range', from: '2026-10-21', to: '2026-12-02', everyWeeks: 2 }],
    except: ['2026-11-04'],
  }, { weekday: 3, ...TERM });
  assert.deepEqual(dates, ['2026-10-21', '2026-11-18', '2026-12-02']);
});

test('открытый конец идёт до конца семестра', () => {
  const { dates } = expandDateRule(
    r({ type: 'range', from: '2026-12-01', to: null, everyWeeks: 1 }),
    { weekday: 3, ...TERM });
  assert.deepEqual(dates, ['2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23', '2026-12-30']);
});

test('диапазон начинается с первого совпадающего дня недели, а не с from', () => {
  const { dates } = expandDateRule(
    r({ type: 'range', from: '2026-09-01', to: '2026-09-20', everyWeeks: 1 }),
    { weekday: 6, ...TERM });  // суббота
  assert.deepEqual(dates, ['2026-09-05', '2026-09-12', '2026-09-19']);
});

test('пересекающиеся части не дают дублей и результат отсортирован', () => {
  const { dates } = expandDateRule(r(
    { type: 'range', from: '2026-09-09', to: '2026-09-23', everyWeeks: 1 },
    { type: 'dates', list: ['2026-09-16'] },
  ), { weekday: 3, ...TERM });
  assert.deepEqual(dates, ['2026-09-09', '2026-09-16', '2026-09-23']);
});

// Review Focus 1
test('to раньше from даёт пустой список и предупреждение, без зацикливания', () => {
  const { dates, warnings } = expandDateRule(
    r({ type: 'range', from: '2026-10-28', to: '2026-09-09', everyWeeks: 1 }),
    { weekday: 3, ...TERM });
  assert.deepEqual(dates, []);
  assert.equal(warnings.length, 1);
});

// Review Focus 5
test('пустые parts дают пустой список без падения', () => {
  assert.deepEqual(expandDateRule({ parts: [], except: [] }, { weekday: 3, ...TERM }).dates, []);
});

test('except может съесть все даты', () => {
  assert.deepEqual(expandDateRule({
    parts: [{ type: 'dates', list: ['2026-09-09'] }], except: ['2026-09-09'],
  }, { weekday: 3, ...TERM }).dates, []);
});

test('дата из list с чужим днём недели проходит, но предупреждает', () => {
  const { dates, warnings } = expandDateRule(
    r({ type: 'dates', list: ['2026-10-22'] }), { weekday: 3, ...TERM });  // четверг при weekday=3
  assert.deepEqual(dates, ['2026-10-22']);
  assert.equal(warnings.length, 1);
});

test('дата вне границ семестра проходит, но предупреждает', () => {
  const { dates, warnings } = expandDateRule(
    r({ type: 'dates', list: ['2027-02-10'] }), { weekday: 3, ...TERM });
  assert.deepEqual(dates, ['2027-02-10']);
  assert.equal(warnings.length, 1);
});

test('правило без parts и без except не роняет разбор', () => {
  assert.deepEqual(expandDateRule({}, { weekday: 3, ...TERM }).dates, []);
  assert.deepEqual(expandDateRule(null, { weekday: 3, ...TERM }).dates, []);
});
