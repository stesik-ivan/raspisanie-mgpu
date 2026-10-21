/* Журнал из сида: неделя правок до показа.

   У каждой записи настоящие «до» и «после»: журнал показывает «Аудитория:
   Ауд. 204 → Ауд. 304», и пустой столбец вызывал вопрос «а это что».
   Записи — в зоне своего администратора, изменения на дату ссылаются на
   настоящие замены и отмены из сида и не повторяются. */

import { addDays } from '../domain/dates.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * @param {object} state собранный сид: занятия, изменения, админы, аудитории
 * @param {{t0:string, unitOf:Function, teacherPool:Function}} o
 * @returns {object[]} записи журнала, новые сверху
 */
export function buildSeedAudit(state, { t0, unitOf, teacherPool }) {
  const audit = [];

  const zoneOf = (admin) => state.lessons.filter(l =>
    l.published && admin.unitIds.includes(unitOf(l.groupIds[0])) && l.roomId !== 'r-online');
  const snap = (l) => { const { published, ...rest } = clone(l); return rest; };
  const kinds = ['room', 'teacher', 'change', 'create', 'slot', 'delete'];
  const usedChanges = new Set();

  for (let i = 0; i < 18; i++) {
    const admin = state.admins[i % 2];
    const mine = zoneOf(admin);
    const l = mine[(i * 7) % mine.length];
    // От вчера до недели назад: журнал сида — прошлое, а правки на показе
    // встают сверху, по времени.
    const day = addDays(t0, -(i % 7) - 1);
    const at = `${day}T${String(9 + (i % 8)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`;
    const base = { id: `AU${i + 1}`, at, adminId: admin.id };
    let kind = kinds[i % kinds.length];
    // Каждое изменение на дату попадает в журнал один раз: одна и та же
    // отмена дважды выглядит как сбой. Изменения кончились — правка аудитории.
    const change = kind === 'change'
      ? state.changes.find(c => c.adminId === admin.id && !usedChanges.has(c.id)) : null;
    if (kind === 'change' && !change) kind = 'room';
    if (change) usedChanges.add(change.id);

    if (kind === 'change') {
      audit.push({ ...base, entity: 'Change', entityId: change.id, action: 'create', before: null, after: clone(change) });
      continue;
    }
    const after = snap(l);
    if (kind === 'create') {
      audit.push({ ...base, entity: 'Lesson', entityId: l.id, action: 'create', before: null, after });
      continue;
    }
    if (kind === 'delete') {
      // Убранное занятие: такое же, но в другой день — его уже нет в расписании.
      const gone = { ...after, id: `L-old-${i}`, weekday: (l.weekday % 5) + 1 };
      audit.push({ ...base, entity: 'Lesson', entityId: gone.id, action: 'delete', before: gone, after: null });
      continue;
    }
    const before = clone(after);
    if (kind === 'room') {
      const room = state.rooms.find(r => r.id === l.roomId);
      const others = state.rooms.filter(r => r.buildingId === room?.buildingId && r.kind === room?.kind && r.id !== l.roomId);
      if (others.length) before.roomId = others[i % others.length].id;
    } else if (kind === 'teacher') {
      const others = teacherPool(unitOf(l.groupIds[0])).filter(t => !l.teacherIds.includes(t.id));
      if (others.length) before.teacherIds = [others[i % others.length].id];
    } else {
      before.slot = l.slot > 1 ? l.slot - 1 : l.slot + 1;
    }
    audit.push({ ...base, entity: 'Lesson', entityId: l.id, action: 'update', before, after });
  }
  audit.sort((a, b) => b.at.localeCompare(a.at));
  return audit;
}
