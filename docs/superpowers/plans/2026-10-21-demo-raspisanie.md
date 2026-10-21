# Демо расписания МГПУ — план реализации (Блок A, к показу 22.10.2026)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочее демо расписания МГПУ для показа руководству 22.10.2026: студент видит свои пары на телефоне, админ видит сетку и поймавшийся конфликт аудитории между ВО и СПО.

**Architecture:** Ванильный JS, нативные ES-модули, без сборщика. Вся логика расписания — чистые функции в `src/domain/`, покрытые `node --test`; они уезжают на сервер без изменений. Данные идут только через асинхронный `src/data/api.js`, под которым в демо сид и `localStorage`, а позже PocketBase. Экраны студента читают «опубликованное представление» той же формы, что будущие `pub/*.json`.

**Tech Stack:** Vanilla JS (ESM), CSS с токенами `assets/brand.css`, `node --test`, service worker, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-21-demo-raspisanie-design.md` (архитектурные решения) + `docs/01`–`docs/05` (требования). Исполнитель читает оба.

## Global Constraints

- Никаких npm-зависимостей в рантайме. `package.json` существует только ради `type: module` и `scripts.test`; блок `dependencies` пустой.
- Внешних CDN нет: ни Google Fonts, ни SheetJS, ни иконочных шрифтов. Всё локально.
- Ни один файл не длиннее ~400 строк.
- Цвета в коде — только через токены `assets/brand.css`. Хардкод HEX запрещён.
- Красный `--accent` — только акцент. Красных фонов и заливок крупных площадей нет.
- Шрифт: `--font` (Museo Sans Cyrl, запасной Arial/Helvetica).
- Тап-зоны от 44px (`--tap`), сетка отступов 4px, `prefers-reduced-motion` уважается, тёмная тема обязательна.
- Брейкпоинт таб-бар → сайдбар: 900px. Safe-area: `calc(var(--safe-b) - 22px)`.
- `catch` без логирования запрещён.
- В домене нет `Date` как хранилища: даты — `'YYYY-MM-DD'`, время — `'HH:MM'`, арифметика дат через `Date.UTC(y, m, d, 12)`.
- «Сейчас» берётся **только** из `src/data/clock.js`. Прямые `Date.now()` и `new Date()` без аргументов вне `clock.js` запрещены.
- Семестр демо: `2026-09-01` … `2026-12-30`, исключение `2026-11-04`.
- `TRAVEL_MIN_GAP = 20`, условие переезда `gap <= 20`.
- Реальные ФИО из `samples/` в код и демо-данные не попадают. Все люди выдуманы.
- `samples/` не коммитится (уже в `.gitignore`).

## Review Focus

Пять входов, которых 11 случаев из `docs/02` не покрывают, а на показе они встретятся. Каждый закреплён за задачей.

1. **`range` с `to` раньше `from`** (опечатка учебной части). Ожидание: пустой список дат и запись в `warnings`, без зацикливания. Цикл `while (cur <= end)` с шагом вперёд здесь безопасен, но проверить это тестом обязательно — Задача 2.
2. **`localStorage` недоступен или содержит мусор** — приватный режим Safari на телефоне руководителя, переполненное хранилище, обрезанный JSON. Ожидание: приложение работает на сиде в памяти и говорит об этом, а не показывает белый экран — Задача 7.
3. **`slot`, которого нет в сетке подразделения** (занятие ВО со `slot: 7` при пяти парах; субботний `slot` при отсутствии `byWeekday[6]`). Ожидание: `slotTime` возвращает `null`, вхождение не строится, в `warnings` причина — Задача 3 и Задача 4.
4. **`?now=` с невалидным значением** (`?now=вчера`, `?now=2026-13-45`). Ожидание: молчаливый откат на реальное время с логом, а не `Invalid Date` во всех экранах — Задача 7.
5. **`DateRule` без дат на выходе** (пустые `parts`; все даты съедены `except`). Ожидание: занятие с нулём вхождений не рисуется и не ломает сетку админа — Задача 2 и Задача 14.

---

### Задача 1: Каркас, живая ссылка и проверка доступности

Идёт первой, хотя по существу первый этап — домен. Причина: единственный непокрываемый кодом риск показа — доступность GitHub Pages с мобильных операторов без VPN, и проверять её надо вечером, а не утром.

**Files:**
- Create: `package.json`, `index.html`, `manifest.webmanifest`, `sw.js`, `serve.mjs`, `src/main.js`, `src/router.js`, `src/ui/shell.js`, `app.css`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `router.js` → `initRouter(routes, onNavigate)`, `navigate(hash)`, `currentRoute()`; `shell.js` → `renderShell({ tabs, activeTab })`, монтирует таб-бар (< 900px) и сайдбар (≥ 900px) с `logo-ru-1`.

- [ ] **Шаг 1: `package.json`**

```json
{ "name": "raspisanie-mgpu", "private": true, "type": "module",
  "scripts": { "test": "node --test tests/", "serve": "node serve.mjs" } }
```

- [ ] **Шаг 2: `.gitignore` — добавить `.agents/` и `.claude/skills/pocketbase-best-practices`, `.claude/skills/web-design-guidelines`, `.claude/skills/webapp-testing`**

Это симлинки на сторонние скиллы, в репозитории демо им не место. `samples/`, `.DS_Store`, `node_modules/` уже есть.

- [ ] **Шаг 3: `index.html` — iOS-метатеги из `~/Documents/BOT/boardgames/index.html:4-20` дословно**

Вместе с комментарием про `maximum-scale`. `theme-color` берётся из токена, не хардкодом. Подключить `assets/brand.css` до `app.css`.

- [ ] **Шаг 4: `sw.js` — из `~/Documents/BOT/boardgames/sw.js`, почти без изменений**

Сохранить `ignoreVary` и `ignoreSearch` (без них не работает запуск в авиарежиме на iOS) и `cache: 'no-cache'` для оболочки. Стратегии: оболочка — сеть с откатом в кэш; шрифты и логотипы — кэш-первый; данные расписания — сеть с откатом в кэш плюс отметка времени.

- [ ] **Шаг 5: `serve.mjs` — из «Полки» как есть**

- [ ] **Шаг 6: `router.js` — хэш-роутер из `~/Documents/BOT/boardgames/app.js:979-1015`**

- [ ] **Шаг 7: `shell.js` + `app.css` — таб-бар ↔ сайдбар, брейкпоинт 900px**

Перенести в `app.css` радиусы, тени и кривые `--ease`/`--spring`, если их нет в `brand.css`. Фикс safe-area `calc(var(--safe-b) - 22px)`. Фикс `input[type=date]`: `min-width:0; max-width:100%; -webkit-appearance:none`.

- [ ] **Шаг 8: Пустые экраны-заглушки по маршрутам студента, чтобы каркас было видно**

- [ ] **Шаг 9: `git init`, первый коммит, публичный репозиторий, Pages**

```bash
git init && git add -A && git commit -m "chore: каркас демо расписания МГПУ"
gh repo create raspisanie-mgpu --public --source=. --push
gh api -X POST repos/stesik-ivan/raspisanie-mgpu/pages -f build_type=workflow -f 'source[branch]=main' -f 'source[path]=/'
```

- [ ] **Шаг 10: Проверить ссылку с телефона по мобильной сети без VPN**

Это ручной шаг и он не пропускается. Открывается — идём дальше. Не открывается — поднимаем `node serve.mjs`, готовим QR на локальный адрес и фиксируем в спеке, что офлайн и «Добавить на экран» показываются только с HTTPS-ссылки.

- [ ] **Шаг 11: Коммит**

---

### Задача 2: `domain/dates.js` через TDD

**Files:**
- Create: `src/domain/dates.js`, `tests/dates.test.js`

**Interfaces:**
- Produces: `expandDateRule(rule, ctx) -> { dates: string[], warnings: string[] }`, где `ctx = { weekday: 1..7, termFrom: 'YYYY-MM-DD', termTo: 'YYYY-MM-DD' }`; `addDays(iso, n) -> iso`; `weekdayOf(iso) -> 1..7` (ISO: пн=1, вс=7); `compareIso(a, b) -> number`.
- `dates` отсортированы по возрастанию, без дублей. `warnings` — массив строк на русском.

- [ ] **Шаг 1: Написать падающие тесты**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandDateRule, addDays, weekdayOf } from '../src/domain/dates.js';

const TERM = { termFrom: '2026-09-01', termTo: '2026-12-30' };
const r = (...parts) => ({ parts, except: [] });

test('weekdayOf: ISO-нумерация, пн=1', () => {
  assert.equal(weekdayOf('2026-10-21'), 3);  // среда
  assert.equal(weekdayOf('2026-09-05'), 6);  // суббота
  assert.equal(weekdayOf('2026-11-01'), 7);  // воскресенье
});

test('addDays не съезжает через переход на зимнее время', () => {
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

// docs/02, случай 1
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

// docs/02, случай 2
test('отдельные даты берутся как есть', () => {
  const { dates } = expandDateRule(
    r({ type: 'dates', list: ['2026-09-10', '2026-09-24', '2026-10-08', '2026-10-22'] }),
    { weekday: 4, ...TERM });
  assert.deepEqual(dates, ['2026-09-10', '2026-09-24', '2026-10-08', '2026-10-22']);
});

// docs/02, случай 3
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

test('пересекающиеся части не дают дублей', () => {
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
test('пустые parts и съеденные except дают пустой список без падения', () => {
  assert.deepEqual(expandDateRule({ parts: [], except: [] }, { weekday: 3, ...TERM }).dates, []);
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
```

- [ ] **Шаг 2: Прогнать тесты и убедиться, что падают**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/domain/dates.js'`

- [ ] **Шаг 3: Реализовать `src/domain/dates.js`**

Арифметика дат — только через `Date.UTC(y, m, d, 12)` и обратно. Приведение `getUTCDay()` (вс=0) к ISO (вс=7). Для `range`: от `from` сдвигаться на +1 день до совпадения с `ctx.weekday`, затем шаг `7 * everyWeeks` пока `<= to`. `to: null` → `ctx.termTo`.

- [ ] **Шаг 4: Прогнать тесты — зелено**

Run: `npm test`

- [ ] **Шаг 5: Коммит**

```bash
git add src/domain/dates.js tests/dates.test.js && git commit -m "feat(domain): развёртка правил дат"
```

---

### Задача 3: `domain/bells.js` через TDD

**Files:**
- Create: `src/domain/bells.js`, `tests/bells.test.js`
- Create: `src/domain/fixtures.js` (сетки ВО и СПО из `docs/04`, общие для тестов домена)

**Interfaces:**
- Produces: `toMinutes('HH:MM') -> number`; `fromMinutes(n) -> 'HH:MM'`; `slotTime(bellSchedule, weekday, slot) -> { start, end } | null`; `slotAt(bellSchedule, weekday, minutes) -> { phase: 'before'|'in'|'gap'|'after', slot: number|null, next: number|null, leftMin: number|null }`.
- `src/domain/fixtures.js` экспортирует `BELLS_VO` и `BELLS_SPO` (с `byWeekday[6]`) ровно по значениям из `docs/04`.

- [ ] **Шаг 1: Написать падающие тесты**

```js
test('toMinutes и fromMinutes обратимы', () => {
  assert.equal(toMinutes('10:30'), 630);
  assert.equal(fromMinutes(630), '10:30');
  assert.equal(fromMinutes(540), '09:00');
});

test('ВО: вторая пара — 10:30–11:50', () => {
  assert.deepEqual(slotTime(BELLS_VO, 3, 2), { start: '10:30', end: '11:50' });
});

// docs/02, случай 11
test('суббота СПО берёт byWeekday[6], а не основную сетку', () => {
  assert.deepEqual(slotTime(BELLS_SPO, 6, 5), { start: '12:35', end: '13:20' });
  assert.deepEqual(slotTime(BELLS_SPO, 2, 5), { start: '12:50', end: '13:35' });
});

// Review Focus 3
test('несуществующий slot даёт null, а не падение', () => {
  assert.equal(slotTime(BELLS_VO, 3, 7), null);
  assert.equal(slotTime(BELLS_VO, 3, 0), null);
});

test('slotAt различает идущую пару, окно и конец дня', () => {
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('10:45')).phase, 'in');
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('10:45')).slot, 2);
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('10:45')).leftMin, 65);
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('12:00')).phase, 'gap');
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('12:00')).next, 3);
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('08:00')).phase, 'before');
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('23:00')).phase, 'after');
});
```

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать `bells.js` и `fixtures.js`**
- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 4: `domain/occurrences.js` через TDD

**Files:**
- Create: `src/domain/occurrences.js`, `tests/occurrences.test.js`

**Interfaces:**
- Consumes: `expandDateRule` (Задача 2), `slotTime` (Задача 3).
- Produces: `lessonOccurrences(lesson, ctx) -> { occurrences: Occurrence[], warnings: string[] }`; `applyChanges(occurrences, changes, ctx) -> Occurrence[]`.
- `Occurrence = { lessonId, date, slot, start, end, groupIds, subgroup, teacherIds, roomId, status: 'ok'|'cancelled', changeIds: string[] }`
- `ctx = { bellScheduleOf(groupId) -> BellSchedule, termFrom, termTo }`

- [ ] **Шаг 1: Написать падающие тесты**

```js
test('вхождения строятся на каждую дату со временем из сетки первой группы', () => { /* 3 даты → 3 вхождения, start/end из BELLS_VO */ });

// Review Focus 3
test('занятие с несуществующим slot не даёт вхождений и предупреждает', () => { /* slot 7 у ВО → occurrences: [], warnings.length === 1 */ });

// docs/02, случай 10, первая половина
test('отмена на дату ставит status cancelled, вхождение остаётся', () => { /* status 'cancelled', changeIds содержит id изменения */ });

test('перенос двигает дату и пару и пересчитывает время по новой сетке', () => { /* move с date+slot: start/end пересчитаны, суббота СПО берёт byWeekday[6] */ });

test('замена преподавателя патчит teacherIds, не трогая остальное', () => {});
test('замена аудитории патчит roomId', () => {});
test('extra добавляет вхождение, которого не было в занятиях', () => {});
test('изменение на дату, которой нет в dates, игнорируется и предупреждает', () => {});
```

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать `occurrences.js`**

Порядок наложения: `cancel` → `move` → `teacher`/`room` → `extra`. Отменённое не двигается. Перенос пересчитывает `start`/`end` через `slotTime` для нового `weekday` и `slot`.

- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 5: `domain/conflicts.js` через TDD

Ядро аргумента показа. Остальные задачи можно урезать, эту — нет.

**Files:**
- Create: `src/domain/conflicts.js`, `tests/conflicts.test.js`

**Interfaces:**
- Consumes: `Occurrence` (Задача 4), `toMinutes` (Задача 3).
- Produces: `findConflicts(occurrences, ctx) -> Conflict[]`; `checkLesson(lesson, ctx) -> Conflict[]`; `freeRooms(occurrences, ctx, { date, start, end, buildingId, kind }) -> Room[]`; `subgroupsOverlap(a, b) -> boolean`; константа `TRAVEL_MIN_GAP = 20`.
- `Conflict = { level: 'error'|'warning', type: 'room'|'teacher'|'group'|'travel'|'capacity', date, a: Occurrence, b: Occurrence|null, message: string }`
- `ctx = { rooms, groups, buildingOf(roomId), sizeOf(groupId) }`
- `message` — готовая строка по образцу `docs/02`: `Ауд. 304 (Ч-1) 14.10 в 10:30–11:50 занята: ГА-251, Геология (лк)`.

- [ ] **Шаг 1: Написать падающие тесты**

```js
test('subgroupsOverlap: null пересекается со всем, 1 и 2 — нет', () => {
  assert.equal(subgroupsOverlap(null, '1'), true);
  assert.equal(subgroupsOverlap('1', null), true);
  assert.equal(subgroupsOverlap(null, null), true);
  assert.equal(subgroupsOverlap('1', '2'), false);
  assert.equal(subgroupsOverlap('1', '1'), true);
});

// docs/02, случай 4
test('пара ВО 10:30-11:50 и урок СПО 10:40-11:25 в одной аудитории — ошибка аудитории', () => {});

// docs/02, случай 5
test('пара ВО 09:00-10:20 и урок СПО 10:40-11:25 в той же аудитории — конфликта нет', () => {});

// docs/02, случай 6
test('поток на всю группу и лаба подгруппы 2 той же группы в то же время — ошибка группы', () => {});

// docs/02, случай 7
test('лабы подгрупп 1 и 2 в одно время в разных аудиториях — конфликта нет', () => {});

// docs/02, случай 8
test('онлайн у двух групп одновременно — конфликта аудитории нет', () => {});

test('пересечение teacherIds — ошибка преподавателя', () => {});

// docs/02, случай 9 + решение спеки 4.1: порог включающий
test('перерыв ровно 20 минут между корпусами — предупреждение о переезде', () => {
  /* Ч-1 до 12:30, Ч-3 с 12:50 → один warning type 'travel' */
});

test('перерыв 21 минута между корпусами — предупреждения нет', () => {});
test('подряд в одном корпусе с перерывом 10 минут — предупреждения нет', () => {});

test('суммарная численность групп больше capacity — предупреждение', () => {});

// docs/02, случай 10, вторая половина
test('перенос на занятую дату и время создаёт конфликт', () => {});

test('отменённые вхождения в конфликтах не участвуют', () => {});

test('message называет аудиторию, корпус, дату, время и кем занято', () => {
  /* assert.match(c.message, /Ауд\. 304 \(Ч-1\) 14\.10 в 10:30–11:50 занята/) */
});

test('freeRooms возвращает аудитории того же типа и корпуса, свободные в интервале', () => {});
```

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать `conflicts.js`**

Пересечение интервалов — полуинтервалы `[start, end)` в минутах: `aStart < bEnd && bStart < aEnd`. Пары вхождений сравниваются внутри одной даты; группировать по дате, чтобы не ходить квадратом по всему семестру. Переезд — по соседним вхождениям одной группы или одного преподавателя в пределах дня, условие `gap <= TRAVEL_MIN_GAP` и разные `buildingId`. Онлайн (`room.kind === 'online'`) исключается из проверки аудитории.

- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 6: `domain/ics.js` через TDD

**Files:**
- Create: `src/domain/ics.js`, `tests/ics.test.js`

**Interfaces:**
- Consumes: `Occurrence` (Задача 4).
- Produces: `buildIcs(occurrences, meta) -> string`, где `meta = { name, titleOf(occ), locationOf(occ), descriptionOf(occ) }`.

- [ ] **Шаг 1: Написать падающие тесты**

```js
test('на каждое вхождение один VEVENT', () => {});
test('строки разделены CRLF', () => { assert.ok(ics.includes('\r\n')); assert.ok(!/[^\r]\n/.test(ics)); });
test('DTSTART с TZID Europe/Moscow и локальным временем', () => {
  assert.match(ics, /DTSTART;TZID=Europe\/Moscow:20261022T103000/);
});
test('UID стабилен между вызовами', () => {});
test('отменённое вхождение даёт STATUS:CANCELLED', () => {});
test('строка длиннее 75 октетов сложена по RFC с пробелом в начале продолжения', () => {});
test('запятые, точки с запятой и переводы строк в тексте экранированы', () => {});
```

Фолдинг и экранирование проверяются тестами не из педантизма: без них iOS Calendar молча не подписывается, и на показе это выглядит как «не работает».

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать `ics.js`.** Фолдинг считать по октетам UTF-8, не по символам — русский текст в два байта.
- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 7: Доступ к данным: `clock.js`, `demo-store.js`, `api.js`, `errors.js`

**Files:**
- Create: `src/data/clock.js`, `src/data/demo-store.js`, `src/data/api.js`, `src/data/errors.js`
- Create: `tests/clock.test.js`, `tests/demo-store.test.js`

**Interfaces:**
- Produces: `clock.js` → `now() -> Date`, `today() -> 'YYYY-MM-DD'`, `nowMinutes() -> number`, `isDemoTime() -> boolean`, `parseNowParam(raw) -> string|null` (экспортируется ради теста).
- `demo-store.js` → `loadState() -> State`, `saveState(state)`, `normalizeState(raw) -> State`, `resetDemo()`.
- `api.js` → всё `async`: `getIndex()`, `getGroupSchedule(groupId)`, `getTeacherSchedule(teacherId)`, `getChanges(groupId, { fromDate, days })`, `getGridView({ unitId, course, weekFrom })`, `getRoomBusy(roomId, date)`, `getIcsForGroup(groupId)`.
- `errors.js` → `humanError(err) -> string` (из `~/Documents/BOT/boardgames/app.js:241-263`, без GitHub-ветвей).

- [ ] **Шаг 1: Написать падающие тесты**

```js
// Review Focus 4
test('невалидный ?now откатывается на реальное время', () => {
  assert.equal(parseNowParam('вчера'), null);
  assert.equal(parseNowParam('2026-13-45'), null);
  assert.equal(parseNowParam('2026-10-22T10:45'), '2026-10-22T10:45');
});

// Review Focus 2
test('normalizeState достраивает мусор до валидного состояния', () => {
  assert.ok(normalizeState(null).version);
  assert.ok(normalizeState('{обрезанный json').version);
  assert.ok(normalizeState({ groups: 'не массив' }).version);
  assert.deepEqual(normalizeState({}).lessons, []);
});
```

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать четыре модуля**

`clock.js` читает `?now=` один раз при загрузке. Невалидное значение — откат на реальное время **с записью в консоль**, молча не глотать.

`demo-store.js`: каждый доступ к `localStorage` в `try/catch` с логом; при недоступном хранилище (приватный Safari, переполнение) работать на состоянии в памяти и выставить флаг `state.ephemeral = true`, чтобы интерфейс мог сказать «настройки не сохранятся». Белого экрана быть не должно ни при каком содержимом хранилища.

`api.js` — асинхронный, отдаёт форму будущих `pub/*.json`, собирая её через `domain/`. Ни один экран не обращается к `demo-store` напрямую.

- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 8: `seed.js` — демо-данные со всеми сценариями показа

**Files:**
- Create: `src/data/seed.js`
- Create: `tests/seed.test.js`

**Interfaces:**
- Consumes: `expandDateRule`, `slotTime`, `lessonOccurrences`, `findConflicts`, `today()`.
- Produces: `buildSeed({ today, groupCount }) -> State`. Детерминирован: один и тот же `today` даёт один и тот же результат (генератор псевдослучайных чисел с фиксированным зерном, без `Math.random()`).

Данные строго по `docs/04`: подразделения, группы, корпуса и аудитории, сетки звонков, ~30 выдуманных преподавателей, 2 админа. Реальных ФИО из `samples/` нет.

- [ ] **Шаг 1: Написать падающие тесты — по одному на каждый обязательный сценарий `docs/04`**

Тест на сценарий, а не на реализацию: это страховка от того, что на показе нужный экран окажется пустым.

```js
const seed = buildSeed({ today: '2026-10-21', groupCount: null });

test('1. поток: лекция на трёх группах 1 курса ИЕСТ в одной аудитории', () => {});
test('2. подгруппы: лабы ГОБЩ-261 подгр. 1 и 2 в одно время в разных аудиториях', () => {});
test('3. в данных есть все четыре вида правил дат', () => { /* каждую неделю, через неделю, отдельные даты, два диапазона с разрывом */ });
test('4. замена преподавателя сегодня у 11СПш-261 с причиной', () => {});
test('5. отмена пары завтра у ГА-251', () => {});
test('6. перенос пары на другой день', () => {});
test('7. онлайн: субботние уроки СПО в Сферуме', () => {});
test('8. переезд: у 11СПш-261 урок в Ч-1, следующий в Ч-3 — findConflicts даёт travel', () => {});
test('9. «Разговоры о важном» в понедельник первым уроком у СПО', () => {});
test('10. ловушка: в черновике ИЕСТ занятие, конфликтующее по аудитории с уроком СПО в Ч-1', () => {
  /* findConflicts над черновик+опубликованное даёт ровно один error type 'room' */
});
test('11. у одной группы есть полностью пустой день', () => {});
test('12. в журнале 15–20 записей за последнюю неделю от обоих админов', () => {});
test('сид детерминирован: два вызова с одним today дают одинаковый результат', () => {});
test('сценарии строятся относительно today, а не прибиты к датам', () => { /* buildSeed с другим today сохраняет сценарии 4 и 5 */ });
test('groupCount раздувает сид для нагрузочной проверки', () => { assert.ok(buildSeed({ today: '2026-10-21', groupCount: 500 }).groups.length >= 500); });
```

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать `seed.js`.** Если файл подходит к ~400 строкам, разделить на `seed.js` (сборка) и `seed-data.js` (справочники: подразделения, аудитории, люди, дисциплины).
- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 9: Примитивы интерфейса

**Files:**
- Create: `src/ui/sheet.js`, `src/ui/toast.js`, `src/ui/search.js`, `src/ui/icons.js`, `src/ui/arc.js`
- Create: `tests/search.test.js`

**Interfaces:**
- Produces: `openSheet({ title, content, keepScroll })`, `closeSheet()`; `toast(text, { undo })`; `fuzzySearch(items, query, { keyOf }) -> items[]`; `icon(name) -> SVGElement`; `arc({ progress, size }) -> SVGElement` (дуга и кольцо из логотипа: загрузка, пустые состояния, прогресс текущей пары).

Шторка — из `~/Documents/BOT/boardgames/app.js:938-975` вместе с флагом `keepScroll`. Тост — из `app.js:21-63` вместе с фиксом reflow вместо `rAF`. Поиск — из `app.js:774-856`.

- [ ] **Шаг 1: Написать падающие тесты на нормализацию кодов групп**

```js
test('гшт261, ГШТ 261 и гшт-261 находят одну группу', () => {
  for (const q of ['гшт261', 'ГШТ 261', 'гшт-261', 'ГШТ-261'])
    assert.deepEqual(fuzzySearch(groups, q, { keyOf: g => g.code }).map(g => g.code), ['ГШТ-261']);
});
test('латиница вместо похожей кириллицы находит группу', () => {
  // пары на подмену: C/С, P/Р, X/Х, A/А, E/Е, O/О, B/В, H/Н, K/К, M/М, T/Т
  assert.deepEqual(fuzzySearch(groups, 'ГШT-261', { keyOf: g => g.code }).map(g => g.code), ['ГШТ-261']);  // T латинская
  assert.deepEqual(fuzzySearch(groups, 'ФK-241', { keyOf: g => g.code }).map(g => g.code), ['ФК-241']);    // K латинская
});
test('опечатка в одну букву всё ещё находит', () => {});
test('пустой запрос возвращает всё', () => {});
```

- [ ] **Шаг 2: Прогнать — падают.** Run: `npm test`
- [ ] **Шаг 3: Реализовать пять модулей.** `arc.js` строит дугу через `stroke-dasharray` на `<circle>`, цвет — `var(--accent)`, уважает `prefers-reduced-motion`.
- [ ] **Шаг 4: Прогнать — зелено.** Run: `npm test`
- [ ] **Шаг 5: Коммит**

---

### Задача 10: Студент — первый запуск

**Files:**
- Create: `src/views/student/onboarding.js`
- Modify: `src/main.js`, `src/router.js`

Пять шагов по `docs/03`: приветствие с логотипом и выбором роли, подразделение, группа (поиск с опечатками, группировка по курсам), подгруппа (шаг показывается только если подгруппы есть), подсказка «Добавить на экран» с инструкцией для iOS и предложением системы на Android, с возможностью пропустить.

- [ ] **Шаг 1: Реализовать онбординг**
- [ ] **Шаг 2: Проверить в браузере на 375, 768 и 1280, в светлой и тёмной теме**

Скилл `webapp-testing`. Проверить: тап-зоны от 44px, прохождение онбординга заново без очистки данных, выбор группы без подгрупп пропускает шаг 4.

- [ ] **Шаг 3: Коммит**

---

### Задача 11: Студент — «Сегодня»

Главный экран демо. Если время кончается, он доделывается до конца, а урезается всё остальное.

**Files:**
- Create: `src/views/student/today.js`, `src/views/student/lesson-card.js`

По `docs/03`: шапка с датой и бейджем изменений; лента пар; текущая пара с кольцом прогресса (`arc.js`) и «до конца N мин»; окна между парами серым; «переход в Ч-3, ул. Чечулина, д. 3» при смене корпуса; замена с красной меткой и строкой «Замена: вместо …»; отмена с зачёркнутым временем; пустой день с крупной светлой дугой; свайп влево-вправо переключает день.

- [ ] **Шаг 1: Реализовать «Сегодня» и карточку пары в ленте**
- [ ] **Шаг 2: Проверить в браузере на трёх ширинах и в двух темах**

Обязательно прогнать с `?now=2026-10-22T10:45` (идёт пара), `?now=2026-10-22T12:00` (окно), `?now=2026-10-22T07:00` (до начала), `?now=2026-10-22T23:00` (день кончился) и на группе с пустым днём.

- [ ] **Шаг 3: Коммит**

---

### Задача 12: Студент — «Неделя» и шторка пары

**Files:**
- Create: `src/views/student/week.js`, `src/views/student/lesson-sheet.js`

«Неделя»: полоса дней с точками-индикаторами, навигатор «‹ 19–25 окт ›», кнопка «Сегодня», список по дням, на десктопе сетка дней × пар.

Шторка пары: дисциплина, вид, время, аудитория с переходом на занятость аудитории за день, преподаватель с переходом на его неделю, все даты проведения (прошедшие серым), изменения по занятию.

- [ ] **Шаг 1: Реализовать оба экрана**
- [ ] **Шаг 2: Проверить в браузере на трёх ширинах и в двух темах.** Переключение недель за границы семестра не должно давать пустоту без объяснения.
- [ ] **Шаг 3: Коммит**

---

### Задача 13: Студент — «Изменения» и «Ещё»

**Files:**
- Create: `src/views/student/changes.js`, `src/views/student/more.js`

«Изменения»: лента по группе за 14 дней вперёд, новые сверху.

«Ещё»: сменить группу, подписка на календарь (кнопка со ссылкой `.ics` из `getIcsForGroup` плюс инструкции для iPhone и Android), тема (авто/светлая/тёмная), «Установить приложение», «О приложении», **«Сбросить демо-данные»**.

Плюс состояния из `docs/03`: загрузка вращающейся дугой, офлайн-плашка «Нет сети, показано сохранённое расписание от 21.10, 08:12», ошибка загрузки через `humanError`. Если `state.ephemeral` — строка о том, что выбор не сохранится.

- [ ] **Шаг 1: Реализовать оба экрана и состояния**
- [ ] **Шаг 2: Проверить в браузере, в том числе скачивание `.ics` и офлайн-режим с выключенной сетью**
- [ ] **Шаг 3: Коммит**

---

### Задача 14: Админ — сетка на просмотр и ловушка конфликта

Витрина главного аргумента. Формы ввода здесь нет — она в Этапе 6.

**Files:**
- Create: `src/views/admin/grid.js`, `src/views/admin/conflict-sheet.js`

По `docs/03`: фильтры (подразделение из зоны админа, курс, неделя); колонки — группы с подколонками подгрупп, строки — дни × пар; поток растянут на несколько колонок; ячейки с ошибкой обведены красным, с предупреждением — серым пунктиром. Вход — кнопка «Войти как администратор».

Тап по конфликтной ячейке открывает шторку с готовым `message` из `conflicts.js`, обеими сторонами конфликта и списком свободных аудиторий того же типа в том же корпусе (`freeRooms`).

- [ ] **Шаг 1: Реализовать сетку и шторку конфликта**

Review Focus 5: занятие с нулём вхождений не рисуется и не ломает раскладку сетки.

- [ ] **Шаг 2: Проверить в браузере на 1280 и 768; на 375 — только просмотр**

Открыть ловушку из `docs/04` №10 и убедиться, что разбор конфликта читается вслух как есть: это текст, который будет произнесён на показе.

- [ ] **Шаг 3: Коммит**

---

### Задача 15: Прогон перед показом

**Files:**
- Modify: по результатам прогона
- Create: `docs/06-progon.md` — сценарий показа и что проверено

- [ ] **Шаг 1: `npm test` целиком — зелено**
- [ ] **Шаг 2: Аудит скиллом `web-design-guidelines` по студенческой части и сетке админа, найденное починить**
- [ ] **Шаг 3: Проверить все экраны на 375, 768, 1280 в светлой и тёмной теме**
- [ ] **Шаг 4: Проверить с телефона по мобильной сети без VPN: открытие, офлайн в авиарежиме, «Добавить на экран», подписка на `.ics`**
- [ ] **Шаг 5: Пройти сценарий показа целиком с `?now=2026-10-22T10:45` и записать его в `docs/06-progon.md`**

Включая резервный путь: `node serve.mjs`, точка доступа с ноутбука, QR на локальный адрес — с оговоркой про service worker по http.

- [ ] **Шаг 6: Поправить `docs/02`: порог переезда — «20 минут или меньше»**
- [ ] **Шаг 7: Финальный коммит и push, проверить Pages**

---

## Блок B — после показа, отдельными планами

Каждый пункт получает свою спеку и свой план: это независимые подсистемы, и каждая сама по себе даёт работающее демо.

| Этап | Содержание |
|---|---|
| 5 | Преподаватель: «Мои пары», «Свободные аудитории сейчас» с фильтром по корпусу |
| 6 | Админ: форма занятия с живой проверкой конфликтов, мини-календарь семестра, подсказка свободных аудиторий в один тап |
| 7 | Админ: изменения на дату, журнал, черновик → публикация |
| 8 | Настоящий `.xlsx` своим ZIP-писателем (запись «stored», CRC32, без deflate) вместо CSV |
| 9 | Импорт Excel: разбор образца ИЕСТ |
| 10 | PocketBase на сервере МГПУ под неизменным интерфейсом `api.js` (скилл `pocketbase-best-practices`) |

## Вне кода — закрыть отдельно

- Веб-лицензия Museo Sans Cyrillic. **До того, как ссылка уйдёт шире руководства.**
- Боевая иконка приложения с отвечающими за фирменный стиль.
- Формат импорта расписания в МЭШ и 1С.
- Подключён ли МГПУ к «Расписанию занятий» в MAX.
