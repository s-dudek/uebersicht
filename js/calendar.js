// Bereich Kalender: Tag, Woche, Monat
import { $app, esc, state } from './core.js';
import { addDays, dayName, isoWeek, mondayOf, parseYmd, ymd } from './dates.js';
import { createEvent, evAge, eventsOn, isBday } from './events.js';
import { ICON } from './icons.js';
import { mealsOn } from './meals.js';
import { render } from './render.js';

// ---------- Kalender: Tag / Woche / Monat ----------
const H0 = 6, H1 = 24, HPX = 52;

   // sichtbare Stunden und Höhe pro Stunde
const MEAL_AT = { fruehstueck: '07:30', mittag: '12:00', abend: '18:30' };

export const calDay = () => state.calDate || ymd(new Date());

export const toMin = (hm) => { const [h, m] = (hm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

// Alles an einem Tag: zeitlich (mit Uhrzeit) und ganztägig
export function dayContent(d) {
  const timed = [], allday = [];
  for (const e of eventsOn(d)) {
    if (!isBday(e) && e.meta?.time) timed.push({ kind: 'ev', item: e, start: toMin(e.meta.time), end: e.meta.end ? Math.max(toMin(e.meta.end), toMin(e.meta.time) + 20) : toMin(e.meta.time) + 60, label: e.title || 'Termin' });
    else allday.push({ kind: isBday(e) ? 'bday' : 'ev', item: e, label: isBday(e) ? `${e.title || 'Geburtstag'}${evAge(e, d) ? ' (' + evAge(e, d) + ')' : ''}` : e.title || 'Termin' });
  }
  for (const m of mealsOn(d)) { const st = toMin(MEAL_AT[m.meta?.slot] || '12:00'); timed.push({ kind: 'meal', item: m, start: st, end: st + 45, label: m.title }); }
  for (const t of state.items.filter((i) => i.type === 'todo' && i.due_date === d)) allday.push({ kind: 'todo', item: t, label: t.title || 'Todo' });
  for (const r of state.items.filter((i) => i.type !== 'event' && i.type !== 'meal' && i.remind_at && !i.done && !i.reminded && ymd(new Date(i.remind_at)) === d)) {
    const t = new Date(r.remind_at); const st = t.getHours() * 60 + t.getMinutes();
    timed.push({ kind: 'rem', item: r, start: st, end: st + 30, label: r.title || 'Erinnerung' });
  }
  timed.sort((a, b) => a.start - b.start);
  // überlappende Einträge nebeneinander
  const cols = [];
  for (const t of timed) {
    let c = cols.findIndex((end) => end <= t.start);
    if (c < 0) { c = cols.length; cols.push(0); }
    cols[c] = t.end; t.col = c;
  }
  timed.forEach((t) => { t.cols = Math.max(1, ...timed.filter((o) => o.start < t.end && o.end > t.start).map((o) => o.col + 1)); });
  return { timed, allday };
}

const chipIc = (k, item) => ({ bday: ICON.cake, ev: item?.icon && ICON[item.icon] ? ICON[item.icon] : ICON.calendar, todo: ICON.todos, meal: ICON.fork, rem: ICON.bell })[k];

export const allChip = (a) => `<button class="cchip k-${a.kind} ${a.item.done ? 'done' : ''}" data-act="open" data-id="${a.item.id}">${chipIc(a.kind, a.item)}<span>${esc(a.label)}</span></button>`;

export const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const timedBlock = (t, narrow = false) => {
  const top = (Math.max(t.start, H0 * 60) - H0 * 60) / 60 * HPX, h = Math.max(22, (Math.min(t.end, H1 * 60) - Math.max(t.start, H0 * 60)) / 60 * HPX - 2);
  return `<button class="cblk k-${t.kind}" data-act="open" data-id="${t.item.id}" style="top:${top}px;height:${h}px;left:calc(${(t.col / t.cols) * 100}% + 2px);width:calc(${100 / t.cols}% - 4px)">
    ${narrow ? '' : `<small>${hm(t.start)}${t.kind === 'ev' && t.item.meta?.end ? '–' + esc(t.item.meta.end) : ''}</small>`}<b>${esc(t.label)}</b></button>`;
};

const hourLines = () => Array.from({ length: H1 - H0 }, (_, k) => `<div class="hl" style="top:${k * HPX}px"><span>${String(H0 + k).padStart(2, '0')}</span></div>`).join('');

const nowLine = (d) => {
  if (d !== ymd(new Date())) return '';
  const n = new Date(), min = n.getHours() * 60 + n.getMinutes();
  return min < H0 * 60 || min > H1 * 60 ? '' : `<i class="nowl" style="top:${(min - H0 * 60) / 60 * HPX}px"></i>`;
};

export function calTitle() {
  const d = calDay(), v = state.calView;
  if (v === 'day') return [parseYmd(d).toLocaleDateString('de-AT', { weekday: 'long' }), parseYmd(d).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })];
  if (v === 'week') { const ws = mondayOf(parseYmd(d)), we = addDays(ws, 6); return [`KW ${isoWeek(ws)}`, `${parseYmd(ws).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })} – ${parseYmd(we).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', year: 'numeric' })}`]; }
  return [parseYmd(d).toLocaleDateString('de-AT', { month: 'long' }), d.slice(0, 4)];
}

export function calMove(n) {
  const d = calDay(), v = state.calView;
  if (v === 'day') state.calDate = addDays(d, n);
  else if (v === 'week') state.calDate = addDays(d, 7 * n);
  else { const x = parseYmd(d); x.setDate(1); x.setMonth(x.getMonth() + n); state.calDate = ymd(x); }
  render();
  if (v === 'day') scrollCal();
}

// Tagesraster auf ca. 7 Uhr bzw. jetzt scrollen
export function scrollCal() {
  requestAnimationFrame(() => {
    const g = document.querySelector('.tgridv'), m = document.querySelector('.main');
    if (!g || !m) return;
    const n = new Date(), h = calDay() === ymd(n) ? Math.max(H0, n.getHours() - 1) : 7;
    m.scrollTop = g.offsetTop + (h - H0) * HPX - 10;
  });
}

export function renderCalendar() {
  const v = state.calView;
  return `<div class="cal cal-${v}" data-swipe="cal">${v === 'day' ? calDayView() : v === 'month' ? calMonthView() : calWeekView()}</div>`;
}

function calDayView() {
  const d = calDay(), { timed, allday } = dayContent(d);
  return `<section class="tile cal-panel">
    ${allday.length ? `<div class="allday">${allday.map(allChip).join('')}</div>` : ''}
    <div class="tgridv" data-day="${d}" style="height:${(H1 - H0) * HPX}px">
      ${hourLines()}
      <div class="tcol" data-slotday="${d}">${timed.map((t) => timedBlock(t)).join('')}${nowLine(d)}</div>
    </div>
    <p class="hint cal-hint">Auf eine freie Stelle tippen für einen neuen Termin.</p>
  </section>`;
}

function calWeekView() {
  const ws = mondayOf(parseYmd(calDay())), days = Array.from({ length: 7 }, (_, k) => addDays(ws, k)), today = ymd(new Date());
  const row = (d) => {
    const { timed, allday } = dayContent(d);
    const list = [...allday.map((a) => ({ ...a, t: '' })), ...timed.map((t) => ({ ...t, t: hm(t.start) + (t.kind === 'ev' && t.item.meta?.end ? '–' + t.item.meta.end : '') }))];
    return `<div class="wr ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${list.length ? '' : 'empty'}">
      <button class="wr-d" data-act="cal-goto" data-id="${d}" aria-label="${esc(dayName(d, { weekday: 'long', day: 'numeric', month: 'long' }))} öffnen">
        <small>${esc(dayName(d, { weekday: 'short' }))}</small><b>${+d.slice(8)}</b>
      </button>
      <div class="wr-l">
        ${list.map((a) => `<button class="we k-${a.kind} ${a.item.done ? 'done' : ''}" data-act="open" data-id="${a.item.id}">
          <span class="we-i">${chipIc(a.kind, a.item)}</span><span class="we-l">${esc(a.label)}</span>${a.t ? `<span class="we-t">${esc(a.t)}</span>` : ''}</button>`).join('')}
        <button class="we-add" data-act="new-event" data-id="${d}" aria-label="Termin am ${esc(dayName(d, { day: 'numeric', month: 'long' }))}">${list.length ? ICON.plus : `${ICON.plus}<span>Frei</span>`}</button>
      </div>
    </div>`;
  };
  return `<section class="tile cal-panel wkl">${days.map(row).join('')}</section>`;
}

function calMonthView() {
  const d = calDay(), first = d.slice(0, 8) + '01', start = mondayOf(parseYmd(first)), today = ymd(new Date());
  const month = d.slice(0, 7);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, k) => addDays(start, w * 7 + k));
    if (w > 3 && row[0].slice(0, 7) !== month) break;
    weeks.push(row);
  }
  const cell = (x) => {
    const { timed, allday } = dayContent(x);
    const list = [...allday.filter((a) => a.kind === 'bday'), ...allday.filter((a) => a.kind === 'ev'), ...timed.filter((t) => t.kind === 'ev'), ...allday.filter((a) => a.kind === 'todo')];
    const meals = timed.filter((t) => t.kind === 'meal').length;
    return `<button class="mc ${x.slice(0, 7) !== month ? 'out' : ''} ${x === today ? 'today' : ''} ${x === d ? 'sel' : ''}" data-act="cal-goto" data-id="${x}">
      <span class="mc-n">${+x.slice(8)}</span>
      ${list.slice(0, 3).map((a) => `<span class="mc-e k-${a.kind}">${a.kind === 'bday' ? ICON.cake : ''}${esc(a.label)}</span>`).join('')}
      ${list.length > 3 ? `<span class="mc-more">+${list.length - 3}</span>` : ''}
      ${meals ? `<span class="mc-meal">${ICON.fork}${meals}</span>` : ''}
    </button>`;
  };
  return `<section class="tile cal-panel mon">
    <div class="mon-h">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="mon-g">${weeks.flat().map(cell).join('')}</div>
  </section>
  ${calAgenda(d)}`;
}

// Unter dem Monat: der gewählte Tag als Liste
function calAgenda(d) {
  const { timed, allday } = dayContent(d);
  const items = [...allday.map((a) => ({ ...a, t: '' })), ...timed.map((t) => ({ ...t, t: hm(t.start) }))];
  return `<section class="tile cal-agenda">
    <div class="th"><b>${esc(parseYmd(d).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }))}</b><span class="th-sp"></span><button class="lgear" data-act="new-event" data-id="${d}" aria-label="Neuer Termin">${ICON.plus}</button></div>
    ${items.length ? `<div class="agl">${items.map((a) => `<button class="ag k-${a.kind}" data-act="open" data-id="${a.item.id}"><span class="ag-t">${a.t || 'ganztägig'}</span><span class="ag-i">${chipIc(a.kind, a.item)}</span><span class="ag-l">${esc(a.label)}</span></button>`).join('')}</div>` : '<p class="kempty">Nichts geplant.</p>'}
  </section>`;
}

export function initCalendarGestures() {
  // Kalender: freie Stelle im Raster antippen = neuer Termin zu dieser Uhrzeit
  $app.addEventListener('click', (e) => {
    const col = e.target.closest('.tcol[data-slotday]');
    if (!col || e.target.closest('.cblk')) return;
    const r = col.getBoundingClientRect();
    const min = Math.round(((e.clientY - r.top) / HPX * 60 + H0 * 60) / 30) * 30;
    createEvent(col.dataset.slotday, 'event', hm(Math.min(min, 23 * 60 + 30)));
  });

  // Kalender: links/rechts wischen = vor/zurück
  let sx = 0, sy = 0, on = false;
  $app.addEventListener('touchstart', (e) => { if (!e.target.closest('[data-swipe="cal"]')) return; on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $app.addEventListener('touchend', (e) => {
    if (!on) return; on = false;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) calMove(dx < 0 ? 1 : -1);
  }, { passive: true });
}
