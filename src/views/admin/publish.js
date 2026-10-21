/* Публикация: что накопилось в черновике и кнопка «Опубликовать».

   Студенты читают только опубликованное. Пока черновик не опубликован,
   у них прежняя версия — поэтому здесь видно и «было → стало», и какая
   версия сейчас у студентов. Конфликт-ошибка в черновике публикацию
   не пускает. Изменения на дату сюда не попадают: они действуют сразу. */

import * as api from '../../data/api.js';
import { spinner, emptyArc } from '../../ui/arc.js';
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/search.js';
import { toast } from '../../ui/toast.js';
import { stamp, plural } from '../../ui/format.js';
import { humanError } from '../../data/errors.js';
import { listen } from '../../ui/listen.js';
import { exportPanelHtml, bindExportPanel } from './export-panel.js';

const KINDS = { new: 'Новое', changed: 'Изменено', deleted: 'Удалено' };
// «Опубликовать 1 правку», но «в черновике 1 правка».
const pravok = (n) => `${n} ${plural(n, 'правку', 'правки', 'правок')}`;
const pravki = (n) => `${n} ${plural(n, 'правка', 'правки', 'правок')}`;

export async function renderPublish(host) {
  host.innerHTML = `<div class="page"><div class="center-block">${spinner(44)}</div></div>`;
  const [view, index, admin] = await Promise.all([api.getPublishView(), api.getIndex(), api.getAdmin()]);
  const n = view.pending.length;
  const groups = index.units.filter(u => admin?.unitIds?.includes(u.id)).flatMap(u => u.groups);

  host.innerHTML = `
    <div class="page wide-page pub-page">
      <header class="page-hdr">
        <h1 class="page-title">Публикация</h1>
        <p class="page-sub">У студентов сейчас: ${view.terms.map(t =>
          `${esc(t.unit)}: версия ${t.version}${t.publishedAt ? ` от ${esc(stamp(t.publishedAt))}` : ''}`).join(' · ')}</p>
      </header>

      <div class="pub-cols">
      <div class="pub-main">
      ${view.blockers.length ? blockers(view.blockers) : ''}

      ${n ? `
        <section class="pub-sect">
          <h2 class="sh-sect-title">В черновике ${esc(pravki(n))}</h2>
          <ul class="pub-list">${view.pending.map(item).join('')}</ul>
        </section>
        <div class="pub-foot">
          <button class="btn btn-primary pub-go" data-publish${view.blockers.length ? ' disabled' : ''}>
            ${icon('publish')} Опубликовать ${esc(pravok(n))}</button>
          <p class="lf-hint">${view.blockers.length
            ? 'Пока конфликт не решён, опубликовать нельзя.'
            : 'Студенты увидят правки сразу после публикации. Изменения на дату публиковать не нужно, они уже действуют.'}</p>
        </div>` : `
        <div class="stub stub-empty">
          <div class="stub-arc">${emptyArc(110, 'done')}</div>
          <p class="stub-title">Всё опубликовано</p>
          <p>Правки из сетки появятся здесь и дойдут до студентов после публикации.</p>
        </div>`}
      </div>
      ${exportPanelHtml(groups)}
      </div>
    </div>`;

  bindExportPanel(host, groups, () => renderPublish(host));

  listen(host, 'click', (e) => {
    const btn = e.target.closest('[data-publish]');
    if (btn && !btn.disabled) go(host, btn, n);
  });
}

function blockers(list) {
  return `
    <section class="notice notice-warn pub-block" role="alert">
      <p class="pub-block-title">${icon('warn')} Сначала решите конфликт</p>
      <ul class="cf-list">${list.map(b => `
        <li class="cf cf-error"><span class="cf-ico">${icon('warn')}</span>
          <span><b>${esc(b.title)}</b><br>${esc(b.message)}</span></li>`).join('')}
      </ul>
      <a class="link" href="#/grid">Открыть сетку</a>
    </section>`;
}

function item(p) {
  return `
    <li class="pub-item">
      <span class="pub-kind pub-kind-${p.kind}">${esc(KINDS[p.kind])}</span>
      <span class="pub-title${p.kind === 'deleted' ? ' is-deleted' : ''}">${esc(p.title)}</span>
      ${p.diff.length ? `<ul class="pub-diff">${p.diff.map(d => `
        <li><span class="pub-diff-label">${esc(d.label)}:</span>
          <span class="pub-was">${esc(d.from)}</span> → <span>${esc(d.to)}</span></li>`).join('')}</ul>` : ''}
    </li>`;
}

/* Публикация в два нажатия: первое спрашивает, второе публикует.
   Отменить публикацию нельзя — студенты её уже увидели. */
async function go(host, btn, n) {
  if (!btn.classList.contains('is-confirm')) {
    btn.classList.add('is-confirm');
    btn.innerHTML = `${icon('publish')} Точно опубликовать?`;
    return;
  }
  btn.disabled = true;
  try {
    await api.publish();
    toast(`Опубликовано: ${pravki(n)}. Студенты уже видят`);
  } catch (err) {
    console.error('publish: не опубликовал', err);
    toast(humanError(err));
  }
  renderPublish(host);
}
