/* Запись через api на настоящем сиде. Хранилища в Node нет — api работает
   в памяти, ровно как в приватном Safari. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/data/api.js';
import { ApiError } from '../src/data/errors.js';

const TRAP_DATE = '2026-10-21';
const IEST = 'u-iest';

async function trapCell() {
  const grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  return grid.cells.find(c => c.published === false && c.date === TRAP_DATE && c.slot === 2);
}

beforeEach(async () => { await api.resetDemo(); });

test('ловушка на месте: черновик в ауд. 133 конфликтует с уроком СПО', async () => {
  const cell = await trapCell();
  assert.ok(cell, 'черновик-ловушка есть в сетке');
  assert.equal(cell.room.name, '133');
  assert.ok(cell.conflicts.some(c => c.level === 'error' && c.type === 'room'));
});

test('предлагаются ровно 212, 234, 346, 143 — как в сценарии показа', async () => {
  const cell = await trapCell();
  const rooms = await api.getRoomOptions(cell.lessonId);
  assert.deepEqual(rooms.map(r => r.name), ['212', '234', '346', '143']);
});

test('замена аудитории снимает конфликт, оставляет черновик и пишет журнал', async () => {
  const cell = await trapCell();
  const [r212] = await api.getRoomOptions(cell.lessonId);
  const { auditId } = await api.saveLesson(cell.lessonId, { roomId: r212.id });

  const after = await trapCell();
  assert.equal(after.room.name, '212');
  assert.deepEqual(after.conflicts.filter(c => c.level === 'error'), []);
  assert.equal(after.published, false, 'правка не публикует');

  const [entry] = await api.getAudit({ limit: 1 });
  assert.equal(entry.id, auditId);
  assert.equal(entry.action, 'update');
  assert.equal(entry.before.roomId, 'r-133');
  assert.equal(entry.after.roomId, r212.id);
});

test('отмена возвращает аудиторию и конфликт, а журнал растёт, а не переписывается', async () => {
  const cell = await trapCell();
  const [r212] = await api.getRoomOptions(cell.lessonId);
  const { auditId } = await api.saveLesson(cell.lessonId, { roomId: r212.id });
  await api.revert(auditId);

  const back = await trapCell();
  assert.equal(back.room.name, '133');
  assert.ok(back.conflicts.some(c => c.level === 'error' && c.type === 'room'));

  const [last, prev] = await api.getAudit({ limit: 2 });
  assert.equal(last.revertOf, auditId);
  assert.equal(prev.id, auditId);
});

test('занятие чужого подразделения править нельзя', async () => {
  const grid = await api.getGridView({ unitId: 'u-ispo', weekFrom: TRAP_DATE });
  const spo = grid.cells[0];
  assert.equal(await api.canEditLesson(spo.lessonId), false);
  await assert.rejects(api.saveLesson(spo.lessonId, { slot: 1 }),
    (e) => e instanceof ApiError && e.code === 'foreign');
});

test('правка по устаревшей версии отклоняется', async () => {
  const cell = await trapCell();
  const [a, b] = await api.getRoomOptions(cell.lessonId);
  await api.saveLesson(cell.lessonId, { roomId: a.id });
  await assert.rejects(api.saveLesson(cell.lessonId, { roomId: b.id }, { version: 1 }),
    (e) => e instanceof ApiError && e.code === 'stale');
});

test('пересадка в занятую аудиторию — ошибка, сохранения нет', async () => {
  const cell = await trapCell();
  const grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  // Аудитория, где в то же время уже кто-то сидит.
  const busy = grid.cells.find(c => c.date === TRAP_DATE && c.slot === 2 && c.lessonId !== cell.lessonId && c.roomId);
  await assert.rejects(api.saveLesson(cell.lessonId, { roomId: busy.roomId }),
    (e) => e instanceof ApiError && e.code === 'conflict');
  assert.equal((await trapCell()).room.name, '133');
});

/* ---------- форма занятия ---------- */

const groupCode = async (code) => (await api.getIndex()).units.flatMap(u => u.groups).find(g => g.code === code);
const weekOf = async (groupId) => (await api.getWeek({ groupId }, TRAP_DATE)).days.flatMap(d => d.lessons);

/** Свободная клетка у группы ИЕСТ: суббота, у ВО она пустая. */
async function freeSaturday() {
  const refs = await api.getLessonFormRefs(IEST);
  const g = refs.groups.find(x => !x.subgroups.length) || refs.groups[0];
  const room = refs.rooms.find(r => r.kind === 'aud');
  return {
    refs,
    fields: {
      disciplineId: refs.disciplines[0].id, kind: 'лк', groupIds: [g.id], subgroup: null,
      teacherIds: [refs.teachers.find(t => t.own).id], roomId: room.id, weekday: 6, slot: 1,
      dateRule: { parts: [{ type: 'range', from: '2026-10-19', to: null, everyWeeks: 1 }], except: ['2026-11-04'] },
    },
  };
}

test('справочники формы: свои группы, сетка звонков по дням, семестр', async () => {
  const refs = await api.getLessonFormRefs(IEST);
  assert.ok(refs.groups.length && refs.disciplines.length && refs.rooms.length);
  assert.equal(refs.bells[1][1].start, '10:30');
  assert.equal(refs.term.from, '2026-09-01');
  assert.ok(refs.teachers[0].own, 'свои преподаватели первыми');
});

test('живая проверка ловушки: ошибка аудитории свёрнута в одну строку, есть куда пересесть', async () => {
  const cell = await trapCell();
  const { lesson } = await api.getLesson(cell.lessonId);
  const r = await api.checkLessonDraft(lesson, { lessonId: lesson.id });
  const room = r.conflicts.filter(c => c.type === 'room' && c.level === 'error');
  assert.equal(room.length, 1);
  assert.ok(room[0].dates.length > 5, 'все среды в одной строке');
  assert.deepEqual(r.freeRooms.map(x => x.name), ['212', '234', '346', '143']);
  assert.deepEqual(r.problems, []);
});

test('живая проверка пустой формы называет, чего не хватает, и не падает', async () => {
  const r = await api.checkLessonDraft({ groupIds: [], teacherIds: [], dateRule: { parts: [], except: [] } });
  assert.ok(r.problems.some(p => p.field === 'groupIds'));
  assert.deepEqual(r.conflicts, []);
});

test('новое занятие — черновик: в сетке есть, у студента нет', async () => {
  const { fields } = await freeSaturday();
  const { lesson, auditId } = await api.createLesson(fields);
  const grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  const cell = grid.cells.find(c => c.lessonId === lesson.id);
  assert.ok(cell && cell.published === false);
  assert.ok(!(await weekOf(fields.groupIds[0])).some(o => o.lessonId === lesson.id));
  const [entry] = await api.getAudit({ limit: 1 });
  assert.equal(entry.id, auditId);
  assert.equal(entry.action, 'create');
});

test('создать занятие в занятую аудиторию нельзя', async () => {
  const cell = await trapCell();
  const { lesson } = await api.getLesson(cell.lessonId);
  const { fields } = await freeSaturday();
  await assert.rejects(api.createLesson({ ...fields, roomId: 'r-133', weekday: 3, slot: 2,
    dateRule: lesson.dateRule }), (e) => e instanceof ApiError && e.code === 'conflict');
});

test('незаполненное занятие не сохраняется', async () => {
  const { fields } = await freeSaturday();
  await assert.rejects(api.createLesson({ ...fields, teacherIds: [] }),
    (e) => e instanceof ApiError && e.code === 'invalid' && e.field === 'teacherIds');
});

test('правка опубликованного: студент видит старое до публикации', async () => {
  const g = await groupCode('ГОБЩ-261');
  const before = (await weekOf(g.id)).find(o => o.status === 'ok' && !o.changeIds.length && o.room?.kind === 'aud');
  const { lesson } = await api.getLesson(before.lessonId);
  const options = await api.getRoomOptions(lesson.id);
  await api.saveLesson(lesson.id, { roomId: options[0].id });

  const student = (await weekOf(g.id)).find(o => o.lessonId === lesson.id && o.date === before.date);
  assert.equal(student.roomId, before.roomId, 'у студента старая аудитория');
  const grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  assert.equal(grid.cells.find(c => c.lessonId === lesson.id && c.date === before.date).roomId, options[0].id);
});

test('удаление опубликованного: из сетки пропадает, у студента остаётся; отмена возвращает', async () => {
  const g = await groupCode('ГОБЩ-261');
  const occ = (await weekOf(g.id)).find(o => o.status === 'ok');
  const { auditId } = await api.deleteLesson(occ.lessonId);

  let grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  assert.ok(!grid.cells.some(c => c.lessonId === occ.lessonId));
  assert.ok((await weekOf(g.id)).some(o => o.lessonId === occ.lessonId));

  await api.revert(auditId);
  grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  const back = grid.cells.find(c => c.lessonId === occ.lessonId);
  assert.ok(back);
  assert.equal(back.published, true, 'вернулось ровно как было — опубликованным');
});

test('удаление нового черновика убирает его совсем, отмена возвращает', async () => {
  const { fields } = await freeSaturday();
  const { lesson } = await api.createLesson(fields);
  const { auditId } = await api.deleteLesson(lesson.id);
  assert.equal(await api.getLesson(lesson.id), null);
  await api.revert(auditId);
  assert.ok(await api.getLesson(lesson.id));
});
