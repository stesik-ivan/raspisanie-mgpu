/* Расшифровка вхождения для интерфейса: id → имена, подписи, адреса.

   Отдельный модуль, потому что расшифровка нужна и чтению (api.js), и
   записи (api-changes.js): форма изменения показывает «было → стало». */

/**
 * @param {object} s состояние
 * @param {object} ctx контекст домена
 * @returns {(o:object) => object}
 */
export function decorator(s, ctx) {
  const people = (ids) => (ids || []).map(id => ctx.teacherOf(id)).filter(Boolean)
    .map(t => ({ id: t.id, fio: t.fio, position: t.position }));
  return (o) => {
    const room = ctx.roomOf(o.roomId);
    const building = room && room.buildingId ? s.buildings.find(b => b.id === room.buildingId) : null;
    return {
      ...o,
      discipline: ctx.disciplineName(o.disciplineId),
      teachers: people(o.teacherIds),
      replacedTeachers: people(o.replacedTeacherIds),
      // Студенту нужно «вместо ауд. 304», а не только новая аудитория.
      replacedRoomLabel: o.replacedRoomId ? roomLabel(ctx.roomOf(o.replacedRoomId)) : null,
      groups: o.groupIds.map(id => ctx.groupOf(id)).filter(Boolean)
        .map(g => ({ id: g.id, code: g.code })),
      room,
      roomLabel: roomLabel(room),
      building,
      address: building?.address || null,
      isOnline: room?.kind === 'online',
    };
  };
}

export function roomLabel(room) {
  if (!room) return '—';
  if (room.kind === 'online') return room.name;
  const prefix = room.kind === 'gym' ? 'Зал' : room.kind === 'comp' ? 'Комп. класс' : room.kind === 'lab' ? 'Лаб.' : 'Ауд.';
  return `${prefix} ${room.name}`;
}
