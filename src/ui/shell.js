/* Оболочка: таб-бар снизу на телефоне, сайдбар слева от 900px.
   Брейкпоинт и фикс safe-area — из «Полки» (`app.css:648`, `index.html:40`). */

import { logo } from './logo.js';
import { icon } from './icons.js';

const $ = (sel) => document.querySelector(sel);

let scrollMem = Object.create(null);
let currentTabs = [];

/**
 * @param {{id:string, label:string, icon:string, href:string}[]} tabs
 * @param {{brand?: string}} [opts]
 */
export function renderShell(tabs, opts = {}) {
  currentTabs = tabs;
  const tabbar = $('#tabbar');
  const sidebar = $('#sidebar');

  tabbar.innerHTML = tabs.map(t => `
    <a class="tab" data-tab="${t.id}" href="${t.href}">
      <span class="tab-ico">${icon(t.icon)}</span>
      <span class="tab-label">${t.label}</span>
    </a>`).join('');
  tabbar.hidden = false;

  sidebar.innerHTML = `
    <a class="sb-brand" href="${tabs[0].href}">
      ${logo('ru-1', { cls: 'sb-logo', width: 97, height: 72 })}
      <span class="sb-brand-text">${opts.brand || 'Расписание'}</span>
    </a>
    <nav class="sb-nav">
      ${tabs.map(t => `
        <a class="sb-item" data-tab="${t.id}" href="${t.href}">
          <span class="sb-ico">${icon(t.icon)}</span>
          <span>${t.label}</span>
        </a>`).join('')}
    </nav>`;
  sidebar.hidden = false;
}

/** Подсветить активную вкладку. `aliases` — вторичные маршруты вкладки. */
export function setActiveTab(route, aliases = {}) {
  const active = aliases[route] || route;
  for (const el of document.querySelectorAll('[data-tab]')) {
    const on = el.dataset.tab === active;
    el.classList.toggle('on', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

/** Положить разметку в #view с анимацией направления перехода. */
export function paint(html, dir) {
  const view = $('#view');
  view.classList.remove('v-fwd', 'v-back', 'v-up');
  view.innerHTML = html;
  if (dir) {
    void view.offsetWidth; // reflow вместо rAF — иначе кадр теряется (урок «Полки»)
    view.classList.add(dir);
  }
}

export function rememberScroll(raw) {
  const main = $('#main');
  if (main) scrollMem[raw] = main.scrollTop;
}

export function restoreScroll(raw) {
  const main = $('#main');
  if (main) main.scrollTop = scrollMem[raw] || 0;
}

export function hasTabs() { return currentTabs.length > 0; }
