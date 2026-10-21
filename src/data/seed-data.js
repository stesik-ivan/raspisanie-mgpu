/* Справочники демо: подразделения, группы, корпуса, аудитории, люди.

   Коды групп настоящие (с mgpu.ru), адреса корпусов настоящие.
   ВСЕ ЛЮДИ ВЫДУМАНЫ. Реальные ФИО из samples/ сюда не переносятся —
   это условие проекта, а не предосторожность. */

/* homeBuildingId — корпус, в котором подразделение учится обычно. Нужен
   генератору: без него автозаполнение раскидывает группу по двум концам
   Москвы и сыплет бессмысленными предупреждениями о переезде. */
export const UNITS = [
  { id: 'u-iest', name: 'Институт естествознания и спортивных технологий', short: 'ИЕСТ', kind: 'vo', bellScheduleId: 'bells-vo', homeBuildingId: 'b-ch1' },
  { id: 'u-ico',  name: 'Институт цифрового образования',                  short: 'ИЦО',  kind: 'vo', bellScheduleId: 'bells-vo', homeBuildingId: 'b-sh' },
  { id: 'u-iiya', name: 'Институт иностранных языков',                     short: 'ИИЯ',  kind: 'vo', bellScheduleId: 'bells-vo', homeBuildingId: 'b-vt' },
  { id: 'u-ispo', name: 'ИСПО им. К.Д. Ушинского',                         short: 'ИСПО', kind: 'spo', bellScheduleId: 'bells-spo', homeBuildingId: 'b-ch1' },
];

export const PROGRAMS = [
  { id: 'p-geo',  unitId: 'u-iest', code: '05.03.02', name: 'География',                  level: 'bak', form: 'och' },
  { id: 'p-fk',   unitId: 'u-iest', code: '49.03.01', name: 'Физическая культура',        level: 'bak', form: 'och' },
  { id: 'p-mag',  unitId: 'u-iest', code: '06.04.01', name: 'Биология',                   level: 'mag', form: 'och' },
  { id: 'p-ico',  unitId: 'u-ico',  code: '09.03.03', name: 'Прикладная информатика',     level: 'bak', form: 'och' },
  { id: 'p-iiya', unitId: 'u-iiya', code: '45.03.02', name: 'Лингвистика',                level: 'bak', form: 'och' },
  { id: 'p-spo',  unitId: 'u-ispo', code: '44.02.02', name: 'Преподавание в начальных классах', level: 'spo', form: 'och' },
];

/** demo: true — группа придумана целиком, в интерфейсе помечается. */
export const GROUPS = [
  // ИЕСТ — 1 курс, с подгруппами: в Excel каждая группа занимает две колонки
  { id: 'g-sht',   programId: 'p-geo',  code: 'ГШТ-261',   course: 1, subgroups: ['1', '2'], size: 24 },
  { id: 'g-obsh',  programId: 'p-geo',  code: 'ГОБЩ-261',  course: 1, subgroups: ['1', '2'], size: 26 },
  { id: 'g-uchbih',programId: 'p-geo',  code: 'УЧБИХ-261', course: 1, subgroups: ['1', '2'], size: 22 },
  { id: 'g-ga',    programId: 'p-geo',  code: 'ГА-251',    course: 2, subgroups: [],        size: 21 },
  { id: 'g-fk1',   programId: 'p-fk',   code: 'ФК-241',    course: 3, subgroups: [],        size: 25 },
  { id: 'g-fk2',   programId: 'p-fk',   code: 'ФК-242',    course: 3, subgroups: [],        size: 23 },
  { id: 'g-mpb',   programId: 'p-mag',  code: 'МПБ-261м',  course: 1, subgroups: [],        size: 12 },
  // ИЦО и ИИЯ — группы придуманы
  { id: 'g-cob',   programId: 'p-ico',  code: 'ЦОб-261',   course: 1, subgroups: [],        size: 27, demo: true },
  { id: 'g-itb',   programId: 'p-ico',  code: 'ИТб-251',   course: 2, subgroups: ['1', '2'], size: 24, demo: true },
  { id: 'g-anb',   programId: 'p-iiya', code: 'АНб-261',   course: 1, subgroups: [],        size: 20, demo: true },
  { id: 'g-neb',   programId: 'p-iiya', code: 'НЕб-251',   course: 2, subgroups: [],        size: 18, demo: true },
  // ИСПО
  { id: 'g-spsh',  programId: 'p-spo',  code: '11СПш-261', course: 1, subgroups: ['1', '2'], size: 28 },
  { id: 'g-nhtf',  programId: 'p-spo',  code: 'НХТфш-251', course: 2, subgroups: [],        size: 25 },
  { id: 'g-dosh',  programId: 'p-spo',  code: 'ДОш-261',   course: 1, subgroups: [],        size: 26, demo: true },
  { id: 'g-psosh', programId: 'p-spo',  code: 'ПСОш-251',  course: 2, subgroups: [],        size: 24, demo: true },
];

export const BUILDINGS = [
  { id: 'b-ch1', code: 'Ч-1', address: 'ул. Чечулина, д. 1' },
  { id: 'b-ch3', code: 'Ч-3', address: 'ул. Чечулина, д. 3, корп. 1' },
  { id: 'b-sh',  code: 'Ш-2', address: 'ул. Шереметьевская, д. 29 (адрес для демо)', demo: true },
  { id: 'b-vt',  code: 'В-1', address: 'Витебская ул., д. 7 (адрес для демо)', demo: true },
];

function rooms() {
  const out = [];
  // Ч-1: пул ВО и пул СПО разведены — один корпус, две учебные части,
  // и в реальной жизни они делят аудитории. В демо держим их раздельно,
  // чтобы единственным конфликтом остался нарочно подложенный черновик.
  for (const n of ['204', '212', '234', '315', '346']) {
    out.push({ id: `r-${n}`, buildingId: 'b-ch1', name: n, kind: 'aud', capacity: 60, pool: 'vo' });
  }
  // 304 — поточная аудитория: в ней читают лекцию сразу трём группам 1 курса.
  out.push({ id: 'r-304', buildingId: 'b-ch1', name: '304', kind: 'aud', capacity: 90, pool: 'vo' });
  for (const n of ['131', '132', '133', '134', '141', '142', '143', '144']) {
    out.push({ id: `r-${n}`, buildingId: 'b-ch1', name: n, kind: 'aud', capacity: 32, pool: 'spo' });
  }
  out.push(
    { id: 'r-103', buildingId: 'b-ch1', name: '103', kind: 'comp', capacity: 15, pool: 'spo' },
    { id: 'r-106', buildingId: 'b-ch1', name: '106', kind: 'comp', capacity: 15, pool: 'spo' },
    { id: 'r-307', buildingId: 'b-ch1', name: '307', kind: 'comp', capacity: 15, pool: 'vo' },
    { id: 'r-215', buildingId: 'b-ch1', name: '215', kind: 'lab',  capacity: 16, pool: 'vo' },
    { id: 'r-170', buildingId: 'b-ch1', name: '170', kind: 'gym',  capacity: 40, pool: 'vo' },
  );
  for (const n of ['Б-108', 'Б-123', 'Б-124', 'Б-204']) {
    out.push({ id: `r-${n}`, buildingId: 'b-ch3', name: n, kind: 'gym', capacity: 40, pool: 'any' });
  }
  for (const n of ['201', '202', '305', '306']) {
    out.push({ id: `r-sh-${n}`, buildingId: 'b-sh', name: n, kind: 'aud', capacity: 50, pool: 'vo', demo: true });
  }
  for (const n of ['12', '14', '21', '23']) {
    out.push({ id: `r-vt-${n}`, buildingId: 'b-vt', name: n, kind: 'aud', capacity: 30, pool: 'vo', demo: true });
  }
  out.push({ id: 'r-online', buildingId: null, name: 'Сферум', kind: 'online', capacity: null, pool: 'any' });
  return out;
}
export const ROOMS = rooms();

/* Тридцать два выдуманных человека. Фамилии взяты нарочно обыденные и
   не совпадающие ни с кем из samples/. */
const FIO = [
  ['Абросимова', 'Н.В.', 'доц.'],    ['Белоусов', 'И.К.', 'доц.'],
  ['Вершинина', 'О.П.', 'ст.преп.'], ['Гаврилов', 'С.А.', 'доц.'],
  ['Дорохина', 'Е.М.', 'асс.'],      ['Ермаков', 'П.Л.', 'ст.преп.'],
  ['Жукова', 'Т.И.', 'доц.'],        ['Зиновьев', 'А.Р.', 'доц.'],
  ['Игнатова', 'М.С.', 'ст.преп.'],  ['Кондратьев', 'В.Н.', 'доц.'],
  ['Лаврова', 'Ю.Д.', 'асс.'],       ['Мещеряков', 'Д.О.', 'доц.'],
  ['Назарова', 'И.Г.', 'ст.преп.'],  ['Овчинников', 'К.Б.', 'доц.'],
  ['Пантелеева', 'С.В.', 'доц.'],    ['Рыбаков', 'Г.Е.', 'асс.'],
  ['Самойлова', 'Л.А.', 'ст.преп.'], ['Тихонов', 'Р.М.', 'доц.'],
  ['Уварова', 'Н.С.', 'преп.'],      ['Филатов', 'А.Ю.', 'преп.'],
  ['Харитонова', 'В.П.', 'преп.'],   ['Цветков', 'М.И.', 'преп.'],
  ['Чернышёва', 'А.Д.', 'преп.'],    ['Шмелёва', 'О.К.', 'преп.'],
  ['Щербаков', 'Е.В.', 'преп.'],     ['Юдина', 'Т.А.', 'преп.'],
  ['Яковлева', 'Н.И.', 'преп.'],     ['Агафонов', 'Б.С.', 'преп.'],
  ['Бурмистрова', 'К.Н.', 'преп.'],  ['Веденеев', 'Л.П.', 'преп.'],
  ['Галкина', 'Р.Т.', 'доц.'],       ['Доронин', 'И.А.', 'ст.преп.'],
];

/* Распределение по подразделениям. Двое (t-18, t-19) работают и в институте,
   и в колледже — без них не было бы видно пересечений по времени между ВО и СПО,
   а это одна из вещей, которые демо должно показывать. */
function unitsFor(i) {
  if (i <= 10) return ['u-iest'];
  if (i <= 13) return ['u-ico'];
  if (i <= 16) return ['u-iiya'];
  if (i <= 18) return ['u-iest', 'u-ispo'];
  return ['u-ispo'];
}

export const TEACHERS = FIO.map(([fam, io, position], i) => ({
  id: `t-${i + 1}`,
  fio: `${fam} ${io}`,
  position,
  unitIds: unitsFor(i),
}));

export const ADMINS = [
  { id: 'a-iest', fio: 'Корнилова А.В.', unitIds: ['u-iest', 'u-ico', 'u-iiya'] },
  { id: 'a-ispo', fio: 'Семёнов Д.Б.',   unitIds: ['u-ispo'] },
];

export const DISCIPLINES = [
  { id: 'd-geo',   unitId: 'u-iest', name: 'Геология' },
  { id: 'd-kart',  unitId: 'u-iest', name: 'Картография' },
  { id: 'd-pochv', unitId: 'u-iest', name: 'Почвоведение' },
  { id: 'd-meteo', unitId: 'u-iest', name: 'Метеорология' },
  { id: 'd-gidro', unitId: 'u-iest', name: 'Гидрология' },
  { id: 'd-bio',   unitId: 'u-iest', name: 'Общая биология' },
  { id: 'd-fiz',   unitId: 'u-iest', name: 'Физическая культура' },
  { id: 'd-anat',  unitId: 'u-iest', name: 'Анатомия человека' },
  { id: 'd-ped',   unitId: 'u-iest', name: 'Педагогика' },
  { id: 'd-ist',   unitId: 'u-iest', name: 'История России' },
  { id: 'd-ino',   unitId: 'u-iiya', name: 'Иностранный язык' },
  { id: 'd-prog',  unitId: 'u-ico',  name: 'Программирование' },
  { id: 'd-bd',    unitId: 'u-ico',  name: 'Базы данных' },
  { id: 'd-mat',   unitId: 'u-ispo', name: 'Математика' },
  { id: 'd-rus',   unitId: 'u-ispo', name: 'Русский язык' },
  { id: 'd-lit',   unitId: 'u-ispo', name: 'Литература' },
  { id: 'd-inf',   unitId: 'u-ispo', name: 'Информатика' },
  { id: 'd-obzh',  unitId: 'u-ispo', name: 'Основы безопасности и защиты Родины' },
  { id: 'd-fiz2',  unitId: 'u-ispo', name: 'Физическая культура' },
  { id: 'd-psih',  unitId: 'u-ispo', name: 'Психология' },
  { id: 'd-metod', unitId: 'u-ispo', name: 'Методика обучения' },
  { id: 'd-razg',  unitId: 'u-ispo', name: 'Разговоры о важном' },
];
