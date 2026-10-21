/* Первый запуск: роль → подразделение → группа → подгруппа → установка.

   Шаг подгруппы показывается, только если подгруппы у группы есть, —
   иначе человек гадает, что выбрать, и выбирает неправильно. */

import * as api from '../../data/api.js';
import { fuzzySearch, highlight, esc } from '../../ui/search.js';
import { logo } from '../../ui/logo.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { listen } from '../../ui/listen.js';

let step = 'hello';
let draft = { role: null, unitId: null, groupId: null, subgroup: null };
let index = null;
let query = '';
let onDone = null;

export async function startOnboarding(done) {
  onDone = done;
  step = 'hello';
  draft = { role: null, unitId: null, groupId: null, subgroup: null };
  query = '';
  index = await api.getIndex();
  render();
}

export function isOnboarding() { return step !== 'done'; }

function render() {
  const host = document.querySelector('#view');
  const screen = screens[step];
  if (!screen) {
    // Шаг 'done' сюда доходить не должен, но если дойдёт — лучше показать
    // первый экран, чем уронить онбординг на глазах у руководства.
    console.warn('onboarding: неизвестный шаг', step);
    step = 'hello';
    return render();
  }
  host.innerHTML = `<div class="ob">${screen()}</div>`;
  bind(host);
}

const screens = {
  hello: () => `
    <div class="ob-hello">
      ${logo('ru-3', { cls: 'ob-logo', alt: 'МГПУ', width: 120, height: 120 })}
      <h1 class="ob-title">Расписание МГПУ</h1>
      <p class="ob-sub">Институты и колледж в одном приложении</p>
      <div class="ob-actions">
        <button class="btn btn-primary" data-role="student">Я студент</button>
        <button class="btn" data-role="teacher">Я преподаватель</button>
      </div>
    </div>`,

  unit: () => `
    ${head('Где вы учитесь?', 'hello')}
    <ul class="ob-list">
      ${index.units.map(u => `
        <li><button class="ob-row" data-unit="${u.id}">
          <span class="ob-row-main">
            <span class="ob-row-title">${esc(u.name)}</span>
            <span class="ob-row-sub">${esc(u.short)} · ${u.groups.length} ${u.groups.length === 1 ? 'группа' : 'групп'}</span>
          </span>
          <span class="ob-row-go">${icon('chevron')}</span>
        </button></li>`).join('')}
    </ul>`,

  group: () => {
    const unit = index.units.find(u => u.id === draft.unitId);
    const found = fuzzySearch(unit.groups, query, { keyOf: g => g.code });
    const byCourse = new Map();
    for (const g of found) {
      if (!byCourse.has(g.course)) byCourse.set(g.course, []);
      byCourse.get(g.course).push(g);
    }
    return `
      ${head('Ваша группа', 'unit')}
      <div class="searchbar">
        <span class="searchbar-ico">${icon('search')}</span>
        <input class="searchbar-input" type="search" inputmode="search"
          placeholder="Код группы, например ГШТ-261" value="${esc(query)}"
          autocomplete="off" autocapitalize="characters" spellcheck="false">
      </div>
      ${found.length ? [...byCourse.entries()].sort((a, b) => a[0] - b[0]).map(([course, list]) => `
        <h2 class="ob-group-head">${course} курс</h2>
        <ul class="ob-chips">
          ${list.map(g => `<li><button class="chip" data-group="${g.id}">
            ${highlight(g.code, query)}${g.demo ? '<span class="chip-demo">демо</span>' : ''}
          </button></li>`).join('')}
        </ul>`).join('') : `
        <p class="ob-empty">Ничего не нашлось. Попробуйте только буквы: «гшт».</p>`}`;
  },

  subgroup: () => {
    const g = allGroups().find(x => x.id === draft.groupId);
    return `
      ${head('Какая подгруппа?', 'group')}
      <p class="ob-note">У группы ${esc(g.code)} занятия иногда делятся на подгруппы. Можно поменять позже.</p>
      <ul class="ob-list">
        <li><button class="ob-row" data-sub="">
          <span class="ob-row-title">Вся группа</span><span class="ob-row-go">${icon('chevron')}</span></button></li>
        ${g.subgroups.map(s => `
          <li><button class="ob-row" data-sub="${s}">
            <span class="ob-row-title">Подгруппа ${s}</span><span class="ob-row-go">${icon('chevron')}</span></button></li>`).join('')}
      </ul>`;
  },

  teacher: () => {
    const found = fuzzySearch(index.teachers, query, { keyOf: t => t.fio }).slice(0, 40);
    return `
      ${head('Найдите себя', 'hello')}
      <div class="searchbar">
        <span class="searchbar-ico">${icon('search')}</span>
        <input class="searchbar-input" type="search" placeholder="Фамилия" value="${esc(query)}"
          autocomplete="off" spellcheck="false">
      </div>
      <ul class="ob-list">
        ${found.map(t => `
          <li><button class="ob-row" data-teacher="${t.id}">
            <span class="ob-row-main">
              <span class="ob-row-title">${highlight(t.fio, query)}</span>
              <span class="ob-row-sub">${esc(t.position)}</span>
            </span>
            <span class="ob-row-go">${icon('chevron')}</span>
          </button></li>`).join('') || '<li class="ob-empty">Никого не нашлось</li>'}
      </ul>`;
  },

  install: () => `
    <div class="ob-hello">
      ${logo('ru-3', { cls: 'ob-logo', alt: 'МГПУ', width: 120, height: 120 })}
      <h1 class="ob-title">Добавьте на экран</h1>
      <p class="ob-sub">Тогда расписание открывается как обычное приложение и работает без интернета.</p>
      <ol class="ob-steps">
        <li><b>iPhone:</b> кнопка «Поделиться» внизу Safari ${icon('chevron')} «На экран «Домой»»</li>
        <li><b>Android:</b> меню браузера ${icon('chevron')} «Установить приложение»</li>
      </ol>
      <div class="ob-actions">
        <button class="btn btn-primary" data-finish>Готово</button>
      </div>
    </div>`,
};

function head(title, back) {
  return `
    <header class="ob-head">
      <button class="ob-back" data-back="${back}" aria-label="Назад">${icon('back')}</button>
      <h1 class="ob-head-title">${esc(title)}</h1>
    </header>`;
}

function allGroups() { return index.units.flatMap(u => u.groups); }

function bind(host) {
  const input = host.querySelector('.searchbar-input');
  if (input) {
    input.addEventListener('input', (e) => {
      query = e.target.value;
      const at = e.target.selectionStart;
      render();
      const fresh = document.querySelector('.searchbar-input');
      if (fresh) { fresh.focus(); fresh.setSelectionRange(at, at); }
    });
  }

  listen(host, 'click', async (e) => {
    const t = e.target.closest('[data-role],[data-unit],[data-group],[data-sub],[data-teacher],[data-back],[data-finish]');
    if (!t) return;

    if (t.dataset.back !== undefined) { query = ''; step = t.dataset.back; return render(); }

    if (t.dataset.role) {
      draft.role = t.dataset.role;
      query = '';
      step = t.dataset.role === 'teacher' ? 'teacher' : 'unit';
      return render();
    }
    if (t.dataset.unit) { draft.unitId = t.dataset.unit; query = ''; step = 'group'; return render(); }

    if (t.dataset.group) {
      draft.groupId = t.dataset.group;
      const g = allGroups().find(x => x.id === draft.groupId);
      // Шаг подгруппы показываем, только если выбирать действительно есть из чего.
      step = g.subgroups?.length ? 'subgroup' : 'install';
      return render();
    }
    if (t.dataset.sub !== undefined) { draft.subgroup = t.dataset.sub || null; step = 'install'; return render(); }

    if (t.dataset.teacher) {
      draft.teacherId = t.dataset.teacher;
      step = 'install';
      return render();
    }

    if (t.dataset.finish !== undefined) {
      try {
        await api.setPrefs({ ...draft, onboarded: true });
        if (await api.isEphemeral()) {
          toast('Браузер не даёт сохранить выбор, после перезагрузки его придётся сделать заново');
        }
        step = 'done';
        onDone?.();
      } catch (err) {
        console.error('onboarding: не сохранил выбор', err);
        toast('Не удалось сохранить выбор');
      }
    }
  });
}
