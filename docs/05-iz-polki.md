# Что взять из «Полки»

Источник: `~/Documents/BOT/boardgames/` (справка `SPRAVKA_dlya_raspisaniya.md` там же). Номера строк указаны по сборке `2026-08-22 · 30`.

| Что | Откуда | Куда | Как |
|---|---|---|---|
| Service worker | `sw.js` | `sw.js` | Почти без изменений. Оставить `ignoreVary` и `ignoreSearch` (без них не работает запуск в авиарежиме на iOS) и `cache: 'no-cache'` для оболочки. Стратегии: оболочка — сеть с откатом в кэш, шрифты и логотипы — кэш-первый, данные расписания — сеть с откатом в кэш + отметка времени «показано сохранённое от …». |
| iOS-метатеги | `index.html:4-20` | `index.html` | Дословно, вместе с комментарием про `maximum-scale`. `theme-color` — из токенов. |
| Токены и тёмная тема | `app.css:1-80` | — | Структуру не копируем, значения уже в `assets/brand.css`. Радиусы, тени и кривые `--ease`/`--spring` перенести туда. |
| Таб-бар ↔ сайдбар | `app.css:648`, `index.html:40` | `src/ui/shell.js` + CSS | Тот же брейкпоинт 900px. Учесть фикс safe-area: `calc(var(--safe-b) - 22px)`. |
| Шторка | `app.js:938-975` | `src/ui/sheet.js` | Вместе с флагом `keepScroll`. |
| Хэш-роутер | `app.js:979-1015` | `src/router.js` | Как есть. |
| Тост с «отменить» | `app.js:21-63` | `src/ui/toast.js` | Вместе с фиксом reflow вместо `rAF`. |
| Поиск с опечатками | `app.js:774-856` | `src/ui/search.js` | Добавить нормализацию кодов групп: регистр, пробелы и дефисы, латиница ↔ кириллица в похожих буквах (С/C, Р/P, Х/X). |
| `humanError` | `app.js:241-263` | `src/data/errors.js` | Без GitHub-веток. |
| `normalizeState`, `load`/`save` | `app.js:99-157` | `src/data/demo-store.js` | Как шаблон «не доверяй прочитанному». Обязательно с логированием в `catch`. |
| Локальный сервер | `serve.mjs` | `serve.mjs` | Как есть. |
| Фикс `input[type=date]` | `app.css` | CSS | `min-width:0; max-width:100%; -webkit-appearance:none`. |

**Не берём**: gist-синхронизацию, токен в клиенте, `mergeStates`, ссылки `#/connect/`.

Системный шрифт из «Полки» заменяем на Museo Sans Cyrillic.
