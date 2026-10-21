/* Черновик и опубликованная версия занятия.

   Поля самого занятия — рабочая копия администратора. Пока правки не
   опубликованы, студенты должны видеть старую версию, поэтому при первой
   правке опубликованного занятия его снимок кладётся в `pub`:

     published: true              — правок нет, студент видит само занятие;
     published: false, pub: {…}   — есть правки, студент видит pub;
     published: false, без pub    — новое занятие, студент не видит ничего.

   Хранить снимок в самом занятии, а не отдельной коллекцией, проще для
   демо и для будущего PocketBase: одна запись — одно занятие. */

/** Поля, из которых состоит смысл занятия. Всё остальное служебное. */
export const LESSON_FIELDS = ['disciplineId', 'kind', 'groupIds', 'subgroup',
  'teacherIds', 'roomId', 'weekday', 'slot', 'dateRule'];

const SET_FIELDS = ['groupIds', 'teacherIds'];
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(x => b.includes(x));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function snapshot(lesson) {
  const { pub, published, deleted, ...rest } = lesson;
  return structuredClone(rest);
}

/**
 * Правка занятия. Исходник не трогает.
 * @param {object} lesson
 * @param {object} patch только смысловые поля, служебные игнорируются
 * @param {string} at момент правки, 'YYYY-MM-DDTHH:MM'
 */
export function editLesson(lesson, patch, at) {
  const changes = {};
  for (const f of LESSON_FIELDS) {
    if (patch && f in patch) changes[f] = structuredClone(patch[f]);
  }
  // Группы и преподаватели — множества: форма может прислать их в другом
  // порядке. Тот же состав — не правка, и порядок остаётся прежним (первая
  // группа задаёт сетку звонков).
  for (const f of SET_FIELDS) {
    if (f in changes && sameSet(changes[f], lesson[f])) changes[f] = structuredClone(lesson[f]);
  }
  if (LESSON_FIELDS.every(f => !(f in changes) || same(changes[f], lesson[f]))) {
    return structuredClone(lesson);
  }

  const next = { ...structuredClone(lesson), ...changes, version: (lesson.version || 0) + 1, updatedAt: at };

  if (lesson.published !== false) {
    next.published = false;
    next.pub = snapshot(lesson);
  }
  // Правками вернули ровно опубликованное — правок больше нет.
  if (next.pub && LESSON_FIELDS.every(f => same(next[f], next.pub[f]))) {
    delete next.pub;
    next.published = true;
  }
  return next;
}

/**
 * Что поменялось между двумя версиями — для журнала «было → стало».
 * null с одной стороны — создание или удаление.
 * @returns {{field:string, from:any, to:any}[]}
 */
export function lessonDiff(before, after) {
  return LESSON_FIELDS
    .filter(f => !same(before?.[f], after?.[f]))
    .map(f => ({ field: f, from: before?.[f] ?? null, to: after?.[f] ?? null }));
}

/**
 * Новое занятие. Всегда черновик: студент увидит его после публикации.
 * @param {object} fields смысловые поля
 * @param {{id:string, termId:string, at:string}} meta
 */
export function newLesson(fields, { id, termId, at }) {
  const l = { id, termId };
  for (const f of LESSON_FIELDS) l[f] = structuredClone(fields?.[f] ?? null);
  l.groupIds = l.groupIds || [];
  l.teacherIds = l.teacherIds || [];
  return { ...l, published: false, updatedAt: at, version: 1 };
}

/**
 * Удаление. Никогда не публиковавшееся занятие исчезает сразу (null).
 * Опубликованное становится черновиком удаления: студенты видят его,
 * пока удаление не опубликовано.
 */
export function removeLesson(lesson, at) {
  if (lesson.published === false && !lesson.pub) return null;
  const pub = lesson.pub ? structuredClone(lesson.pub) : snapshot(lesson);
  return { ...structuredClone(lesson), pub, published: false, deleted: true, version: (lesson.version || 0) + 1, updatedAt: at };
}

/** Что видят студенты: опубликованные версии, без черновиков. */
export function publishedLessons(lessons) {
  return (lessons || []).flatMap(l => {
    if (l.published !== false && !l.deleted) return [l];
    if (l.pub) return [{ ...l.pub, id: l.id, published: true }];
    return [];
  });
}

/** Что видит администратор: рабочие копии, без удалённых. */
export function workingLessons(lessons) {
  return (lessons || []).filter(l => !l.deleted);
}

/**
 * Обязательные поля. Сообщения — для панели проверки в форме.
 * Пустое правило дат ловится здесь; правило, не дающее ни одной даты, —
 * при развёртке, у неё нужен контекст семестра.
 * @returns {{field:string, message:string}[]}
 */
export function validateLesson(l) {
  const out = [];
  const need = (ok, field, message) => { if (!ok) out.push({ field, message }); };
  need(l?.disciplineId, 'disciplineId', 'Выберите дисциплину');
  need(l?.groupIds?.length, 'groupIds', 'Выберите хотя бы одну группу');
  need(l?.teacherIds?.length, 'teacherIds', 'Выберите преподавателя');
  need(l?.roomId, 'roomId', 'Выберите аудиторию или онлайн');
  need(Number.isInteger(l?.weekday) && l.weekday >= 1 && l.weekday <= 7, 'weekday', 'Выберите день недели');
  need(Number.isInteger(l?.slot) && l.slot >= 1, 'slot', 'Выберите пару');
  need(l?.dateRule?.parts?.length, 'dateRule', 'Задайте даты: диапазон или список');
  return out;
}
