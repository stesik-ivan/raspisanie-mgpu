import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../src/data/seed.js';
import { domainCtx, occurrencesOf } from '../src/data/ctx.js';
import { findConflicts } from '../src/domain/conflicts.js';
import { lessonOccurrences } from '../src/domain/occurrences.js';

const TODAY = '2026-10-21';            // среда
const seed = buildSeed({ today: TODAY });
const ctx = domainCtx(seed);
const byCode = (code) => seed.groups.find(g => g.code === code);
const published = seed.lessons.filter(l => l.published);

const occOf = (lesson) => lessonOccurrences(lesson, ctx).occurrences;

test('справочники заполнены по docs/04', () => {
  assert.equal(seed.units.length, 4);
  assert.ok(seed.units.some(u => u.kind === 'spo'));
  assert.ok(seed.teachers.length >= 30);
  assert.equal(seed.admins.length, 2);
  assert.ok(seed.buildings.some(b => b.code === 'Ч-1'));
  assert.ok(seed.buildings.some(b => b.code === 'Ч-3'));
  assert.ok(seed.rooms.some(r => r.kind === 'online'));
  for (const code of ['ГШТ-261', 'ГОБЩ-261', 'УЧБИХ-261', 'ГА-251', 'ФК-241', 'ФК-242', 'МПБ-261м', '11СПш-261', 'НХТфш-251']) {
    assert.ok(byCode(code), `нет группы ${code}`);
  }
});

test('реальные ФИО из samples в демо-данные не попали', () => {
  const fios = seed.teachers.map(t => t.fio).join(' ');
  for (const real of ['Еленская', 'Ульянова']) assert.ok(!fios.includes(real), `просочилось: ${real}`);
});

test('у преподавателей есть должности, и кто-то работает и в ВО, и в СПО', () => {
  assert.ok(seed.teachers.every(t => t.position));
  assert.ok(seed.teachers.some(t => t.unitIds.length > 1));
});

// docs/04, сценарий 1
test('1. поток: лекция на трёх группах 1 курса ИЕСТ в одной аудитории', () => {
  const flow = published.find(l => l.groupIds.length === 3);
  assert.ok(flow, 'нет занятия на поток из трёх групп');
  assert.equal(flow.subgroup, null);
  assert.ok(flow.roomId);
});

// docs/04, сценарий 2
test('2. подгруппы: лабы в одно время в разных аудиториях', () => {
  const labs = published.filter(l => l.subgroup);
  assert.ok(labs.length >= 2);
  const pair = labs.filter(l => l.weekday === labs[0].weekday && l.slot === labs[0].slot
    && l.groupIds[0] === labs[0].groupIds[0]);
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map(l => l.subgroup).sort(), ['1', '2']);
  assert.notEqual(pair[0].roomId, pair[1].roomId);
});

// docs/04, сценарий 3
test('3. в данных есть все четыре вида правил дат', () => {
  const kinds = { weekly: 0, biweekly: 0, list: 0, split: 0 };
  for (const l of published) {
    const parts = l.dateRule.parts;
    if (parts.length > 1 && parts.every(p => p.type === 'range')) kinds.split++;
    else if (parts.some(p => p.type === 'dates')) kinds.list++;
    else if (parts.some(p => p.everyWeeks === 2)) kinds.biweekly++;
    else if (parts.some(p => p.type === 'range')) kinds.weekly++;
  }
  for (const [k, v] of Object.entries(kinds)) assert.ok(v > 0, `нет правила вида ${k}`);
});

// docs/04, сценарий 4
test('4. замена преподавателя сегодня у 11СПш-261 с причиной', () => {
  const ch = seed.changes.find(c => c.type === 'teacher' && c.date === TODAY);
  assert.ok(ch, 'нет замены на сегодня');
  assert.ok(ch.reason);
  const lesson = seed.lessons.find(l => l.id === ch.lessonId);
  assert.ok(lesson.groupIds.includes(byCode('11СПш-261').id));
});

// docs/04, сценарий 5
test('5. отмена завтра у ГА-251', () => {
  const ch = seed.changes.find(c => c.type === 'cancel');
  assert.ok(ch);
  assert.equal(ch.date, '2026-10-22');
  const lesson = seed.lessons.find(l => l.id === ch.lessonId);
  assert.ok(lesson.groupIds.includes(byCode('ГА-251').id));
});

// docs/04, сценарий 6
test('6. перенос пары на другой день', () => {
  const ch = seed.changes.find(c => c.type === 'move');
  assert.ok(ch);
  assert.ok(ch.patch.date && ch.patch.date !== ch.date);
});

// docs/04, сценарий 7
test('7. субботние уроки СПО идут в Сферуме', () => {
  const online = seed.rooms.find(r => r.kind === 'online');
  const sat = published.filter(l => l.weekday === 6 && l.roomId === online.id);
  assert.ok(sat.length > 0, 'нет субботних онлайн-уроков');
  const spoUnit = seed.units.find(u => u.kind === 'spo');
  assert.ok(sat.every(l => unitOfLesson(l) === spoUnit.id));
});

// docs/04, сценарий 8
test('8. переезд: у 11СПш-261 урок в Ч-1, следующий в Ч-3 — findConflicts даёт travel', () => {
  const all = published.flatMap(occOf);
  const travel = findConflicts(all, ctx).filter(c => c.type === 'travel');
  assert.ok(travel.length > 0, 'предупреждения о переезде нет');
  const spo = byCode('11СПш-261').id;
  assert.ok(travel.some(c => c.a.groupIds.includes(spo)), 'переезд есть, но не у 11СПш-261');
});

// docs/04, сценарий 9
test('9. «Разговоры о важном» в понедельник первым уроком у СПО', () => {
  const d = seed.disciplines.find(x => /Разговоры о важном/i.test(x.name));
  assert.ok(d, 'нет дисциплины «Разговоры о важном»');
  const l = published.find(x => x.disciplineId === d.id);
  assert.equal(l.weekday, 1);
  assert.equal(l.slot, 1);
  assert.equal(l.kind, 'внеуроч');
});

// docs/04, сценарий 10 — ловушка показа
test('10. черновик ИЕСТ конфликтует по аудитории с уроком СПО в Ч-1', () => {
  const draft = seed.lessons.filter(l => !l.published);
  assert.ok(draft.length > 0, 'черновиков нет');

  const withDraft = occurrencesOf(seed, { includeDraft: true });
  const room = findConflicts(withDraft, ctx).filter(c => c.level === 'error' && c.type === 'room');

  assert.ok(room.length > 0, 'ловушка не срабатывает');
  assert.ok(room.some(c => c.message.includes('Ч-1')), 'конфликт не в Ч-1');

  // Каждая ошибка обязана упираться в черновик. Иначе ловушка утонет в шуме
  // и на показе её не разглядеть — а это главный аргумент всей затеи.
  const draftIds = new Set(draft.map(l => l.id));
  for (const c of findConflicts(withDraft, ctx).filter(c => c.level === 'error')) {
    assert.ok(draftIds.has(c.a?.lessonId) || draftIds.has(c.b?.lessonId),
      `ошибка не из-за черновика: ${c.message}`);
  }
});

test('10а. опубликованное расписание С НАЛОЖЕННЫМИ ИЗМЕНЕНИЯМИ не конфликтует', () => {
  // Проверять сырые занятия мало: замена преподавателя и перенос пары сами
  // способны создать конфликт, и на показе он будет выглядеть как брак.
  const errs = findConflicts(occurrencesOf(seed, {}), ctx).filter(c => c.level === 'error');
  assert.deepEqual(errs.map(c => c.message), []);
});

test('10б. бессмысленных переездов между корпусами разных институтов нет', () => {
  const travel = findConflicts(occurrencesOf(seed, {}), ctx).filter(c => c.type === 'travel');
  assert.ok(travel.length > 0, 'нужный переезд пропал');
  for (const c of travel) {
    assert.ok(c.message.includes('Ч-1') && c.message.includes('Ч-3'),
      `переезд между чужими корпусами: ${c.message}`);
  }
});

// docs/04, сценарий 11
test('11. у одной группы есть полностью пустой учебный день', () => {
  const g = byCode('ФК-242').id;
  const busy = new Set(published.filter(l => l.groupIds.includes(g)).map(l => l.weekday));
  const free = [1, 2, 3, 4, 5].filter(d => !busy.has(d));
  assert.ok(free.length > 0, 'у ФК-242 нет свободного дня');
});

// docs/04, сценарий 12
test('12. в журнале 15–20 записей за последнюю неделю от обоих админов', () => {
  assert.ok(seed.audit.length >= 15 && seed.audit.length <= 20, `записей ${seed.audit.length}`);
  const who = new Set(seed.audit.map(a => a.adminId));
  assert.equal(who.size, 2);
  for (const a of seed.audit) assert.ok(a.at >= '2026-10-14' && a.at <= '2026-10-21T23:59');
  // Записи из сида — прошлое. Иначе «сегодня, 16:49» при демо-времени 10:45
  // встаёт над правками, сделанными на показе.
  for (const a of seed.audit) assert.ok(a.at < TODAY, `запись в будущем: ${a.at}`);
});

test('сид детерминирован: два вызова с одним today дают одинаковый результат', () => {
  assert.deepEqual(buildSeed({ today: TODAY }), buildSeed({ today: TODAY }));
});

test('сценарии строятся относительно today, а не прибиты к датам', () => {
  const other = buildSeed({ today: '2026-11-18' });   // тоже среда
  assert.ok(other.changes.some(c => c.type === 'teacher' && c.date === '2026-11-18'));
  assert.ok(other.changes.some(c => c.type === 'cancel' && c.date === '2026-11-19'));
});

test('сид переживает выходной как «сегодня»', () => {
  const sun = buildSeed({ today: '2026-11-01' });     // воскресенье
  assert.ok(sun.lessons.length > 0);
  assert.ok(sun.changes.length > 0);
});

test('groupCount раздувает сид для нагрузочной проверки', () => {
  const big = buildSeed({ today: TODAY, groupCount: 500 });
  assert.ok(big.groups.length >= 500, `групп ${big.groups.length}`);
  assert.ok(big.lessons.length > seed.lessons.length);
});

test('каждое занятие разворачивается хотя бы в одно вхождение', () => {
  for (const l of seed.lessons) {
    assert.ok(occOf(l).length > 0, `занятие ${l.id} не даёт вхождений`);
  }
});

test('occurrencesOf собирает вхождения группы с наложенными изменениями', () => {
  const list = occurrencesOf(seed, { groupId: byCode('11СПш-261').id });
  assert.ok(list.length > 0);
  assert.ok(list.every(o => o.groupIds.includes(byCode('11СПш-261').id)));
  assert.ok(list.some(o => o.changeIds.length > 0), 'изменения не наложились');
});

function unitOfLesson(l) {
  const g = seed.groups.find(x => x.id === l.groupIds[0]);
  return seed.programs.find(p => p.id === g.programId).unitId;
}
