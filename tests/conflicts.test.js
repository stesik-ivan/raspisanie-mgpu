import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findConflicts, freeRooms, freeRoomsForAll, subgroupsOverlap, TRAVEL_MIN_GAP,
} from '../src/domain/conflicts.js';

const ROOMS = [
  { id: 'r304', buildingId: 'ch1', name: '304', kind: 'aud', capacity: 60 },
  { id: 'r307', buildingId: 'ch1', name: '307', kind: 'comp', capacity: 15 },
  { id: 'r215', buildingId: 'ch1', name: '215', kind: 'comp', capacity: 15 },
  { id: 'r103', buildingId: 'ch1', name: '103', kind: 'comp', capacity: 15 },
  { id: 'rB123', buildingId: 'ch3', name: 'Б-123', kind: 'gym', capacity: 40 },
  { id: 'online', buildingId: null, name: 'Сферум', kind: 'online', capacity: null },
];
const GROUPS = [
  { id: 'g-sht', code: 'ГШТ-261', size: 25 },
  { id: 'g-obsh', code: 'ГОБЩ-261', size: 25 },
  { id: 'g-a', code: 'ГА-251', size: 22 },
  { id: 'g-spo', code: '11СПш-261', size: 28 },
];
const DISC = { d1: 'Геология', d2: 'Картография', d3: 'Информатика' };

const ctx = {
  rooms: ROOMS,
  groups: GROUPS,
  buildings: [{ id: 'ch1', code: 'Ч-1' }, { id: 'ch3', code: 'Ч-3' }],
  disciplineName: (id) => DISC[id] || id,
};

let n = 0;
const occ = (o) => ({
  lessonId: o.lessonId || `L${++n}`, disciplineId: 'd1', kind: 'лк',
  date: '2026-10-14', slot: 1, groupIds: ['g-sht'], subgroup: null,
  teacherIds: ['t1'], roomId: 'r304', status: 'ok', changeIds: [], ...o,
});

const errors = (list, type) => findConflicts(list, ctx).filter(c => c.level === 'error' && (!type || c.type === type));
const warns = (list, type) => findConflicts(list, ctx).filter(c => c.level === 'warning' && (!type || c.type === type));

test('subgroupsOverlap: null пересекается со всем, 1 и 2 — нет', () => {
  assert.equal(subgroupsOverlap(null, '1'), true);
  assert.equal(subgroupsOverlap('1', null), true);
  assert.equal(subgroupsOverlap(null, null), true);
  assert.equal(subgroupsOverlap('1', '2'), false);
  assert.equal(subgroupsOverlap('1', '1'), true);
});

// docs/02, тестовый случай 4
test('пара ВО 10:30-11:50 и урок СПО 10:40-11:25 в одной аудитории — ошибка аудитории', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht'], teacherIds: ['t1'] }),
    occ({ start: '10:40', end: '11:25', groupIds: ['g-spo'], teacherIds: ['t2'] }),
  ];
  assert.equal(errors(list, 'room').length, 1);
});

// docs/02, тестовый случай 5
test('пара ВО 09:00-10:20 и урок СПО 10:40-11:25 в той же аудитории — конфликта нет', () => {
  const list = [
    occ({ start: '09:00', end: '10:20', groupIds: ['g-sht'], teacherIds: ['t1'] }),
    occ({ start: '10:40', end: '11:25', groupIds: ['g-spo'], teacherIds: ['t2'] }),
  ];
  assert.equal(errors(list).length, 0);
});

test('пара, кончающаяся ровно когда начинается другая, — не конфликт', () => {
  const list = [
    occ({ start: '09:00', end: '10:20', teacherIds: ['t1'], groupIds: ['g-sht'] }),
    occ({ start: '10:20', end: '11:40', teacherIds: ['t1'], groupIds: ['g-sht'] }),
  ];
  assert.equal(errors(list).length, 0);
});

test('одна аудитория в разные дни — не конфликт', () => {
  const list = [
    occ({ date: '2026-10-14', start: '10:30', end: '11:50' }),
    occ({ date: '2026-10-15', start: '10:30', end: '11:50', groupIds: ['g-a'], teacherIds: ['t2'] }),
  ];
  assert.equal(errors(list).length, 0);
});

// docs/02, тестовый случай 6
test('поток на всю группу и лаба подгруппы 2 той же группы в то же время — ошибка группы', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht', 'g-obsh'], subgroup: null,
          teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '10:30', end: '11:50', groupIds: ['g-obsh'], subgroup: '2',
          teacherIds: ['t2'], roomId: 'r307' }),
  ];
  assert.equal(errors(list, 'group').length, 1);
});

// docs/02, тестовый случай 7
test('лабы подгрупп 1 и 2 в одно время в разных аудиториях — конфликта нет', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht'], subgroup: '1', teacherIds: ['t1'], roomId: 'r215' }),
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht'], subgroup: '2', teacherIds: ['t2'], roomId: 'r307' }),
  ];
  assert.equal(findConflicts(list, ctx).length, 0);
});

// docs/02, тестовый случай 8
test('онлайн у двух групп одновременно с разными преподавателями — конфликта нет', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht'], teacherIds: ['t1'], roomId: 'online' }),
    occ({ start: '10:30', end: '11:50', groupIds: ['g-a'], teacherIds: ['t2'], roomId: 'online' }),
  ];
  assert.equal(errors(list).length, 0);
});

test('пересечение teacherIds — ошибка преподавателя', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht'], teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '10:30', end: '11:50', groupIds: ['g-a'], teacherIds: ['t1'], roomId: 'r215' }),
  ];
  assert.equal(errors(list, 'teacher').length, 1);
});

test('один преподаватель на потоке не конфликтует сам с собой', () => {
  const list = [occ({ start: '10:30', end: '11:50', groupIds: ['g-sht', 'g-obsh'], teacherIds: ['t1', 't2'] })];
  assert.equal(findConflicts(list, ctx).length, 0);
});

// docs/02, тестовый случай 9 + решение спеки 4.1: порог включающий
test('перерыв ровно 20 минут между корпусами — предупреждение о переезде', () => {
  assert.equal(TRAVEL_MIN_GAP, 20);
  const list = [
    occ({ start: '11:45', end: '12:30', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '12:50', end: '13:35', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'rB123' }),
  ];
  assert.equal(warns(list, 'travel').length, 1);
});

test('перерыв 21 минута между корпусами — предупреждения нет', () => {
  const list = [
    occ({ start: '11:45', end: '12:29', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '12:50', end: '13:35', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'rB123' }),
  ];
  assert.equal(warns(list, 'travel').length, 0);
});

test('подряд в одном корпусе с перерывом 10 минут — предупреждения нет', () => {
  const list = [
    occ({ start: '09:00', end: '10:20', teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '10:30', end: '11:50', teacherIds: ['t1'], roomId: 'r215' }),
  ];
  assert.equal(warns(list, 'travel').length, 0);
});

test('переезд засчитывается и группе, и преподавателю, но не дублируется', () => {
  const list = [
    occ({ start: '11:45', end: '12:30', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '12:50', end: '13:35', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'rB123' }),
  ];
  assert.equal(warns(list, 'travel').length, 1);
});

test('онлайн между корпусами переездом не считается', () => {
  const list = [
    occ({ start: '11:45', end: '12:30', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '12:50', end: '13:35', groupIds: ['g-spo'], teacherIds: ['t1'], roomId: 'online' }),
  ];
  assert.equal(warns(list, 'travel').length, 0);
});

test('суммарная численность групп больше capacity — предупреждение', () => {
  const list = [occ({ start: '10:30', end: '11:50', groupIds: ['g-sht', 'g-obsh'], roomId: 'r307' })];
  assert.equal(warns(list, 'capacity').length, 1);
});

test('вместимость хватает — предупреждения нет', () => {
  const list = [occ({ start: '10:30', end: '11:50', groupIds: ['g-sht', 'g-obsh'], roomId: 'r304' })];
  assert.equal(warns(list, 'capacity').length, 0);
});

// docs/02, тестовый случай 10, вторая половина
test('перенос на занятую дату и время создаёт конфликт', () => {
  const list = [
    occ({ date: '2026-10-16', start: '10:30', end: '11:50', groupIds: ['g-a'], teacherIds: ['t2'], roomId: 'r304' }),
    occ({ date: '2026-10-16', start: '10:30', end: '11:50', groupIds: ['g-sht'], teacherIds: ['t1'],
          roomId: 'r304', changeIds: ['C2'], moved: true }),
  ];
  assert.equal(errors(list, 'room').length, 1);
});

test('отменённые вхождения в конфликтах не участвуют', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', roomId: 'r304', status: 'cancelled' }),
    occ({ start: '10:30', end: '11:50', roomId: 'r304', groupIds: ['g-a'], teacherIds: ['t2'] }),
  ];
  assert.equal(findConflicts(list, ctx).length, 0);
});

test('message называет аудиторию, корпус, дату, время и кем занято', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-a'], teacherIds: ['t2'], roomId: 'r304', disciplineId: 'd1' }),
    occ({ start: '10:40', end: '11:25', groupIds: ['g-spo'], teacherIds: ['t3'], roomId: 'r304', disciplineId: 'd3' }),
  ];
  const c = errors(list, 'room')[0];
  assert.match(c.message, /Ауд\. 304 \(Ч-1\)/);
  assert.match(c.message, /14\.10/);
  assert.match(c.message, /10:30–11:50|10:40–11:25/);
  assert.match(c.message, /ГА-251|11СПш-261/);
  assert.match(c.message, /Геология|Информатика/);
});

test('конфликт преподавателя и группы тоже объясняется словами', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', groupIds: ['g-sht'], teacherIds: ['t1'], roomId: 'r304' }),
    occ({ start: '10:30', end: '11:50', groupIds: ['g-a'], teacherIds: ['t1'], roomId: 'r215' }),
  ];
  assert.ok(errors(list, 'teacher')[0].message.length > 10);
});

test('freeRooms возвращает аудитории того же типа и корпуса, свободные в интервале', () => {
  const list = [occ({ date: '2026-10-14', start: '10:30', end: '11:50', roomId: 'r307' })];
  const free = freeRooms(list, ctx, {
    date: '2026-10-14', start: '10:30', end: '11:50', buildingId: 'ch1', kind: 'comp',
  });
  const ids = free.map(r => r.id).sort();
  assert.deepEqual(ids, ['r103', 'r215']);
});

test('freeRooms не считает занятой аудиторию, освободившуюся к началу', () => {
  const list = [occ({ date: '2026-10-14', start: '09:00', end: '10:20', roomId: 'r307' })];
  const free = freeRooms(list, ctx, {
    date: '2026-10-14', start: '10:30', end: '11:50', buildingId: 'ch1', kind: 'comp',
  });
  assert.ok(free.some(r => r.id === 'r307'));
});

test('freeRooms без фильтров отдаёт все свободные, кроме онлайна', () => {
  const free = freeRooms([], ctx, { date: '2026-10-14', start: '10:30', end: '11:50' });
  assert.ok(!free.some(r => r.kind === 'online'));
  assert.equal(free.length, 5);
});

test('пустой список вхождений не даёт конфликтов', () => {
  assert.deepEqual(findConflicts([], ctx), []);
  assert.deepEqual(findConflicts(null, ctx), []);
});

test('вхождение без аудитории не конфликтует по аудитории', () => {
  const list = [
    occ({ start: '10:30', end: '11:50', roomId: null, groupIds: ['g-sht'], teacherIds: ['t1'] }),
    occ({ start: '10:30', end: '11:50', roomId: null, groupIds: ['g-a'], teacherIds: ['t2'] }),
  ];
  assert.equal(errors(list, 'room').length, 0);
});

/* Замена аудитории в один тап меняет её во всём занятии, а не на одну дату.
   Значит, предлагать можно только те, что свободны на ВСЕХ его датах. */
test('freeRoomsForAll: аудитория занята хотя бы на одной дате занятия — не предлагается', () => {
  const cand = [
    occ({ lessonId: 'X', date: '2026-10-14', start: '10:30', end: '11:50', roomId: 'r307' }),
    occ({ lessonId: 'X', date: '2026-10-21', start: '10:30', end: '11:50', roomId: 'r307' }),
  ];
  const existing = [
    occ({ date: '2026-10-21', start: '10:40', end: '11:25', roomId: 'r215', groupIds: ['g-spo'], teacherIds: ['t9'] }),
    occ({ date: '2026-10-28', start: '10:40', end: '11:25', roomId: 'r103', groupIds: ['g-spo'], teacherIds: ['t9'] }),
  ];
  const free = freeRoomsForAll(cand, existing, ctx, { buildingId: 'ch1', kind: 'comp' });
  assert.deepEqual(free.map(r => r.id).sort(), ['r103', 'r307']);
});

test('freeRoomsForAll не считает занятостью само проверяемое занятие и отменённые', () => {
  const cand = [occ({ lessonId: 'X', date: '2026-10-14', start: '10:30', end: '11:50', roomId: 'r307' })];
  const existing = [
    ...cand,
    occ({ date: '2026-10-14', start: '10:30', end: '11:50', roomId: 'r215', status: 'cancelled' }),
  ];
  const free = freeRoomsForAll(cand, existing, ctx, { buildingId: 'ch1', kind: 'comp' });
  assert.deepEqual(free.map(r => r.id).sort(), ['r103', 'r215', 'r307']);
});
