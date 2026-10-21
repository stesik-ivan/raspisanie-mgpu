/* «Аудитории»: что свободно прямо сейчас, по корпусам и типам.

   Вопрос, который преподаватель задаёт чаще всего и на который сейчас
   нет ответа нигде: «куда можно сесть с группой в ближайший час».
   Свободную аудиторию можно сразу занять (room-book.js). */

import * as api from '../../data/api.js';
import { emptyArc, spinner } from '../../ui/arc.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { longDate, durationShort, plural } from '../../ui/format.js';
import { today, now, nowMinutes } from '../../data/clock.js';
import { toMinutes } from '../../domain/bells.js';
import { openRoomBooking, release } from './room-book.js';
import { listen } from '../../ui/listen.js';

const KINDS = [
  { id: null, label: 'Любая' },
  { id: 'aud', label: 'Аудитория' },
  { id: 'comp', label: 'Комп. класс' },
  { id: 'lab', label: 'Лаборатория' },
  { id: 'gym', label: 'Зал' },
];

let filter = { buildingId: null, kind: null };

export async function renderRooms(host) {
  host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;

  const [index, free, mine] = await Promise.all([api.getIndex(), api.getFreeRoomsNow(filter), api.getMyBookings()]);
  const buildings = index.buildings.filter(b => !b.demo || true);
  const m = nowMinutes();
  const clock = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const byBuilding = new Map();
  for (const r of free) {
    const key = r.buildingId || 'online';
    if (!byBuilding.has(key)) byBuilding.set(key, []);
    byBuilding.get(key).push(r);
  }

  host.innerHTML = `
    <div class="page">
      <header class="page-hdr">
        <h1 class="page-title">Свободно сейчас</h1>
        <p class="page-sub">${esc(longDate(today()))}, ${esc(clock)} · ${free.length} ${freePlural(free.length)}</p>
      </header>

      ${mine.length ? `
        <section class="rooms-sect my-bookings">
          <h2 class="rooms-head">Мои брони</h2>
          <ul class="book-list">${mine.map(b => `
            <li class="book-item">
              <span class="book-room">${esc(b.roomLabel)}${b.building ? `<span class="sh-dim">, ${esc(b.building.code)}</span>` : ''}</span>
              <span class="book-time">до ${esc(b.end)}</span>
              <button class="btn btn-ghost book-free" data-release="${esc(b.id)}">Освободить</button>
            </li>`).join('')}
          </ul>
        </section>` : ''}

      <div class="filters">
        <div class="chips-row" role="group" aria-label="Корпус">
          <button class="fchip${!filter.buildingId ? ' is-on' : ''}" data-b="">Все корпуса</button>
          ${buildings.map(b => `<button class="fchip${filter.buildingId === b.id ? ' is-on' : ''}" data-b="${b.id}">${esc(b.code)}</button>`).join('')}
        </div>
        <div class="chips-row" role="group" aria-label="Тип аудитории">
          ${KINDS.map(k => `<button class="fchip${filter.kind === k.id ? ' is-on' : ''}" data-k="${k.id ?? ''}">${esc(k.label)}</button>`).join('')}
        </div>
      </div>

      ${free.length ? [...byBuilding.entries()].map(([bid, list]) => {
        const b = buildings.find(x => x.id === bid);
        return `
          <section class="rooms-sect">
            <h2 class="rooms-head">${esc(b?.code || 'Онлайн')}<span class="sh-dim">${esc(b?.address || '')}</span></h2>
            <ul class="rooms-grid">
              ${list.map(r => `
                <li><button class="room" data-room="${esc(r.id)}">
                  <span class="room-name">${esc(r.name)}</span>
                  <span class="room-kind">${esc(kindLabel(r.kind))}${r.capacity ? ` · ${r.capacity} ${plural(r.capacity, 'место', 'места', 'мест')}` : ''}</span>
                  <span class="room-until">${r.freeUntil
                    ? `ещё ${esc(durationShort(toMinutes(r.freeUntil) - m))}, до ${esc(r.freeUntil)}`
                    : 'свободна до конца дня'}</span>
                </button></li>`).join('')}
            </ul>
          </section>`;
      }).join('') : `
        <div class="stub stub-empty">
          <div class="stub-arc">${emptyArc(120)}</div>
          <p class="stub-title">Свободных аудиторий нет</p>
          <p>Попробуйте снять фильтр по типу или корпусу.</p>
        </div>`}
    </div>`;

  listen(host, 'click', (e) => {
    const b = e.target.closest('[data-b]');
    if (b) { filter.buildingId = b.dataset.b || null; return renderRooms(host); }
    const k = e.target.closest('[data-k]');
    if (k) { filter.kind = k.dataset.k || null; return renderRooms(host); }
    const rel = e.target.closest('[data-release]');
    if (rel) { release(rel.dataset.release, () => renderRooms(host)); return; }
    const r = e.target.closest('[data-room]');
    if (r) {
      const room = free.find(x => x.id === r.dataset.room);
      if (room) openRoomBooking(room, { label: `${kindPrefix(room.kind)} ${room.name}`, onChanged: () => renderRooms(host) });
    }
  });
}

function kindPrefix(kind) {
  return { comp: 'Комп. класс', lab: 'Лаб.', gym: 'Зал' }[kind] || 'Ауд.';
}

function kindLabel(kind) {
  return { aud: 'Аудитория', comp: 'Комп. класс', lab: 'Лаборатория', gym: 'Зал' }[kind] || kind;
}

function freePlural(n) {
  return plural(n, 'свободна', 'свободны', 'свободных');
}
