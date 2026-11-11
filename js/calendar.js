// Bereich Kalender: Tag, Woche (Zeitraster wie bei Google), Monat; Abschnitte ein- und ausblenden, verknüpfte Kalender
import { calDragBusy } from './cal-drag.js';
import { calSections, createIn } from './cal-menu.js';
import { addCalendar, calendars, calOf, ensureExternal, EXT_COLORS, extOn, extOcc, feedError, google, isShown, reloadGoogle, removeCalendar, SECTIONS, toggleSection, unlinkGoogle } from './cal-sources.js';
import { $app, askConfirm, canDeleteItem, esc, state, toast } from './core.js';
import { addDays, dayName, isoWeek, mondayOf, parseYmd, ymd } from './dates.js';
import { loadAll } from './data.js';
import { showEventCard, whenText } from './event-view.js';
import { createEvent, evAge, eventsOn, isBday } from './events.js';
import { connectGoogle, openGoogleEvent } from './google-cal.js';
import { ICON } from './icons.js';
import { mealsOn } from './meals.js';
import { render } from './render.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

// ---------- Kalender: Tag / Woche / Monat ----------
// Zeitraster: der ganze Tag, sichtbar ist jeweils 06:00–19:00 (Höhe in style.css über die Rasterhöhe)
const VIEW_FROM = 6;
// Samstag/Sonntag (für die leicht rote Markierung)
const isWeekend = (d) => [0, 6].includes(parseYmd(d).getDay());
const pct = (min) => `${(Math.min(Math.max(min, 0), 1440) / 1440) * 100}%`;
const MEAL_AT = { fruehstueck: '07:30', mittag: '12:00', abend: '18:30' };

export const calDay = () => state.calDate || ymd(new Date());

export const toMin = (hm) => { const [h, m] = (hm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

// Alles an einem Tag: zeitlich (mit Uhrzeit) und ganztägig – nur sichtbare Abschnitte
// where: 'hide' (Kalender) oder 'home' (Startseite), siehe cal-sources.js
export function dayContent(d, where = 'hide') {
  const timed = [], allday = [], on = (k) => isShown(k, where);
  for (const e of eventsOn(d)) {
    if (!on(isBday(e) ? 'bday' : 'ev')) continue;
    if (!isBday(e) && e.meta?.time) timed.push({ kind: 'ev', item: e, start: toMin(e.meta.time), end: e.meta.end ? Math.max(toMin(e.meta.end), toMin(e.meta.time) + 20) : toMin(e.meta.time) + 60, label: e.title || 'Termin' });
    else allday.push({ kind: isBday(e) ? 'bday' : 'ev', item: e, label: isBday(e) ? `${e.title || 'Geburtstag'}${evAge(e, d) ? ' (' + evAge(e, d) + ')' : ''}` : e.title || 'Termin' });
  }
  if (on('meal')) for (const m of mealsOn(d)) { const st = toMin(MEAL_AT[m.meta?.slot] || '12:00'); timed.push({ kind: 'meal', item: m, start: st, end: st + 45, label: m.title }); }
  if (on('train')) for (const t of state.items.filter((i) => i.type === 'training' && i.due_date === d)) allday.push({ kind: 'train', item: t, label: t.title || 'Training' });
  if (on('todo')) for (const t of state.items.filter((i) => i.type === 'todo' && i.due_date === d)) allday.push({ kind: 'todo', item: t, label: t.title || 'Todo' });
  if (on('rem')) for (const r of state.items.filter((i) => i.type !== 'event' && i.type !== 'meal' && i.type !== 'training' && i.remind_at && !i.done && !i.reminded && ymd(new Date(i.remind_at)) === d)) {
    const t = new Date(r.remind_at); const st = t.getHours() * 60 + t.getMinutes();
    timed.push({ kind: 'rem', item: r, start: st, end: st + 30, label: r.title || 'Erinnerung' });
  }
  // verknüpfte Kalender (Outlook, Google …)
  for (const o of extOn(d, where)) {
    const x = { kind: 'x', item: { id: o.id }, label: o.title, color: o.color };
    if (o.multi) allday.push(x);
    else timed.push({ ...x, start: o.start.getHours() * 60 + o.start.getMinutes(), end: Math.max(o.end.getHours() * 60 + o.end.getMinutes() || 24 * 60, o.start.getHours() * 60 + o.start.getMinutes() + 20) });
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

const chipIc = (k, item) => ({ bday: ICON.cake, ev: item?.icon && ICON[item.icon] ? ICON[item.icon] : ICON.calendar, todo: ICON.todos, meal: ICON.fork, rem: ICON.bell, train: ICON.dumbbell, x: ICON.calendar })[k];

// Öffnen: eigene Einträge im Fenster der App, verknüpfte Termine im Lese-Fenster; Farbe des verknüpften Kalenders
export const openAttr = (a) => (a.kind === 'x' ? `data-act="ext-ev" data-id="${esc(a.item.id)}" style="--xc:${a.color}"` : `data-act="open" data-id="${a.item.id}"`);

export const allChip = (a) => `<button class="cchip k-${a.kind} ${a.item.done ? 'done' : ''}" ${openAttr(a)}>${chipIc(a.kind, a.item)}<span>${esc(a.label)}</span></button>`;

export const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ziehbar (cal-drag.js): eigene App-Termine und Termine aus beschreibbaren Google-Kalendern
const movable = (t) => {
  if (t.kind === 'ev') return canDeleteItem(t.item) ? `ev:${t.item.id}` : '';
  if (t.kind !== 'x') return '';
  const o = extOcc(t.item.id);
  return o?.gcal && !o.allDay && calOf(o.cal)?.writable ? `x:${t.item.id}` : '';
};

const timedBlock = (t, narrow = false) => {
  const dur = Math.min(t.end, 1440) - t.start, short = dur < 45, mv = movable(t);
  const pos = `top:${pct(t.start)};height:max(22px, calc(${(dur / 1440) * 100}% - 2px));left:calc(${(t.col / t.cols) * 100}% + 1px);width:calc(${100 / t.cols}% - 3px)`;
  const attr = openAttr(t).replace(/style="([^"]*)"/, '').trim();
  const drag = mv ? `data-mv="${esc(mv)}" data-st="${t.start}" data-en="${Math.min(t.end, 1439)}"` : '';
  return `<button class="cblk k-${t.kind} ${narrow ? 'narrow' : ''}" ${attr} ${drag} style="${pos}${t.kind === 'x' ? `;--xc:${t.color}` : ''}">
    ${narrow && short ? '' : `<small>${hm(t.start)}${t.kind === 'ev' && t.item.meta?.end ? '–' + esc(t.item.meta.end) : ''}</small>`}<b>${esc(t.label)}</b>${mv ? '<i class="cblk-rs" aria-hidden="true"></i>' : ''}</button>`;
};

const hourLines = () => Array.from({ length: 24 }, (_, k) => `<div class="hl" style="top:${pct(k * 60)}"><span>${k ? String(k).padStart(2, '0') + ':00' : ''}</span></div>`).join('');

const nowLine = (d) => {
  if (d !== ymd(new Date())) return '';
  const n = new Date(), min = n.getHours() * 60 + n.getMinutes();
  return `<i class="nowl" style="top:${pct(min)}"></i>`;
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
  if (v !== 'month') scrollCal();
}

// Zeitraster so scrollen, dass 06:00 oben steht (frühere Stunden darüber erreichbar)
export function scrollCal() {
  requestAnimationFrame(() => {
    const g = document.querySelector('.gw-body'), m = document.querySelector('.cal-scroll');
    if (g && m) m.scrollTop = g.offsetHeight * VIEW_FROM / 24;
  });
}

export function renderCalendar() {
  ensureExternal();
  const v = state.calView;
  const view = `<div class="cal cal-${v}" data-swipe="cal">${v === 'day' ? calDayView() : v === 'month' ? calMonthView() : calWeekView()}</div>`;
  // Desktop: links die Kalenderliste wie bei Google; schmal: über den Knopf „Kalender“ in der Kopfleiste
  return view;
}

// ---------- Kalenderliste: Abschnitte ein/aus, verknüpfte Kalender ----------
// where: 'hide' (Kalender, mit Verknüpfen/Trennen) oder 'home' (was die Startseite zeigt)
export function sourcesHtml(where = 'hide') {
  const cal = where === 'hide';
  const row = (key, name, color, extra = '') => `<div class="src">
    <button class="src-t ${isShown(key, where) ? 'on' : ''}" data-act="cal-toggle" data-id="${esc(key)}" style="--sc:${color}" aria-pressed="${isShown(key, where)}">
      <i class="src-c">${ICON.check}</i><span>${esc(name)}</span></button>${cal ? extra : ''}</div>`;
  return `<div class="src-h">Meine Kalender</div>
    ${SECTIONS.map(([k, n, c]) => row(k, n, c)).join('')}
    ${google.connected ? `<div class="src-h">Google${google.email ? ` <small>${esc(google.email)}</small>` : ''}</div>
      ${calendars.filter((c) => c.google).map((c) => row('x:' + c.id, c.name, c.color, feedError(c.id) ? `<span class="src-err" title="${esc(feedError(c.id))}">!</span>` : '')).join('')}
      ${cal && google.reconnect ? `<button class="src-add" data-act="g-connect">${ICON.calendar}<span>Neu verbinden für Unterkalender</span></button>` : ''}
      ${cal ? `<button class="src-more" data-act="g-disconnect">Google trennen</button>` : ''}` : ''}
    <div class="src-h">Verknüpfte Kalender</div>
    ${calendars.filter((c) => !c.google).map((c) => row('x:' + c.id, c.name, c.color,
      `${feedError(c.id) ? `<span class="src-err" title="${esc(feedError(c.id))}">!</span>` : ''}<button class="src-x" data-act="cal-unlink" data-id="${esc(c.id)}" aria-label="${esc(c.name)} entfernen" title="Entfernen">${ICON.trash}</button>`)).join('')
      || '<p class="src-empty">Noch keiner. Outlook, iCloud u. a. über die Abo-Adresse (ICS) verknüpfen.</p>'}
    ${cal ? `<button class="src-add" data-act="cal-link">${ICON.plus}<span>Kalender verknüpfen</span></button>
      ${google.connected ? '' : `<button class="src-add" data-act="g-connect">${ICON.calendar}<span>Google-Kalender verbinden</span></button>`}` : ''}`;
}

// Tag und Woche wie bei Google: Kopfzeile mit Tagen, Zeile für Ganztägiges, darunter Zeitraster mit einer Spalte je Tag.
// Feste Höhe, damit der Kalender beim Blättern nicht springt.
const calDayView = () => gridView([calDay()]);
const calWeekView = () => { const ws = mondayOf(parseYmd(calDay())); return gridView(Array.from({ length: 7 }, (_, k) => addDays(ws, k))); };

// Ganztägiges als Leisten: mehrtägige Termine über ihre Tage gezogen, in Zeilen ohne Überschneidung.
// Zugeklappt höchstens ALL_ROWS Zeilen (sonst „+n“ je Tag); aufgeklappt alle, der Bereich scrollt dann selbst.
const ALL_ROWS = 2;
function allDayBars(days, content) {
  const bars = [], open = new Map();
  content.forEach(({ allday }, k) => allday.forEach((a, i) => {
    const key = a.kind === 'x' ? a.item.id : `${a.kind}:${a.item.id}:${k}:${i}`;
    const b = open.get(key);
    if (b && b.c1 === k - 1) b.c1 = k;
    else { const nb = { a, c0: k, c1: k }; bars.push(nb); open.set(key, nb); }
  }));
  bars.sort((x, y) => x.c0 - y.c0 || (y.c1 - y.c0) - (x.c1 - x.c0));
  const ends = [];
  for (const b of bars) {
    let r = ends.findIndex((e) => e < b.c0);
    if (r < 0) { r = ends.length; ends.push(0); }
    ends[r] = b.c1; b.row = r;
  }
  const rows = ends.length, collapse = !state.calAllOpen && rows > ALL_ROWS, shown = collapse ? ALL_ROWS - 1 : rows;
  const bar = (b) => `<div class="gw-bar" style="grid-column:${b.c0 + 2} / ${b.c1 + 3};grid-row:${b.row + 1}">${allChip(b.a)}</div>`;
  const more = collapse ? days.map((d, k) => {
    const n = bars.filter((b) => b.row >= shown && b.c0 <= k && b.c1 >= k).length;
    return n ? `<button class="gw-more" data-act="cal-allday" style="grid-column:${k + 2};grid-row:${ALL_ROWS}">+${n}<span> weitere</span></button>` : '';
  }).join('') : '';
  const cells = days.map((d, k) => `<i class="gw-cell ${isWeekend(d) ? 'we' : ''}" style="grid-column:${k + 2}"></i>`).join('');
  const toggle = rows > ALL_ROWS ? `<button class="gw-tog ${state.calAllOpen ? 'on' : ''}" data-act="cal-allday" aria-label="${state.calAllOpen ? 'Zuklappen' : 'Alle zeigen'}">${ICON.chevD}</button>` : '';
  return `<div class="gw-all ${state.calAllOpen ? 'open' : ''}" style="--rows:${Math.max(1, collapse ? ALL_ROWS : rows)}">
    <span class="gw-gut">ganzt.${toggle}</span>${cells}${bars.filter((b) => b.row < shown).map(bar).join('')}${more}</div>`;
}

function gridView(days) {
  const today = ymd(new Date()), narrow = days.length > 1;
  const content = days.map((d) => dayContent(d));
  const head = days.map((d) => `<button class="gw-d ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${isWeekend(d) ? 'we' : ''}" data-act="cal-goto" data-id="${d}" aria-label="${esc(dayName(d, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <small>${esc(dayName(d, { weekday: 'short' }).replace('.', ''))}</small><b>${+d.slice(8)}</b></button>`).join('');
  const cols = content.map(({ timed }, k) => `<div class="tcol ${days[k] === today && narrow ? 'today' : ''} ${isWeekend(days[k]) ? 'we' : ''}" data-slotday="${days[k]}">${timed.map((t) => timedBlock(t, narrow)).join('')}${nowLine(days[k])}</div>`).join('');
  return `<section class="tile cal-panel gw ${narrow ? '' : 'gw-one'}" style="--n:${days.length}">
    <div class="gw-head"><span class="gw-gut"></span>${head}</div>
    ${allDayBars(days, content)}
    <div class="cal-scroll"><div class="tgridv gw-body">${hourLines()}<div class="gw-cols">${cols}</div></div></div>
  </section>`;
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
    const list = [...allday.filter((a) => a.kind === 'bday'), ...allday.filter((a) => a.kind === 'ev' || a.kind === 'x'), ...timed.filter((t) => t.kind === 'ev' || t.kind === 'x'), ...allday.filter((a) => a.kind === 'todo' || a.kind === 'train')];
    const meals = timed.filter((t) => t.kind === 'meal').length;
    return `<button class="mc ${x.slice(0, 7) !== month ? 'out' : ''} ${x === today ? 'today' : ''} ${x === d ? 'sel' : ''} ${isWeekend(x) ? 'we' : ''}" data-act="cal-goto" data-id="${x}">
      <span class="mc-n">${+x.slice(8)}</span>
      ${list.slice(0, 3).map((a) => `<span class="mc-e k-${a.kind}" ${a.kind === 'x' ? `style="--xc:${a.color}"` : ''}>${a.kind === 'bday' ? ICON.cake : ''}${esc(a.label)}</span>`).join('')}
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
    ${items.length ? `<div class="agl">${items.map((a) => `<button class="ag k-${a.kind}" ${openAttr(a)}><span class="ag-t">${a.t || 'ganztägig'}</span><span class="ag-i">${chipIc(a.kind, a.item)}</span><span class="ag-l">${esc(a.label)}</span></button>`).join('')}</div>` : '<p class="kempty">Nichts geplant.</p>'}
  </section>`;
}

export function initCalendarGestures() {
  // Kalender: freie Stelle im Raster antippen = neuer Termin zu dieser Uhrzeit
  $app.addEventListener('click', (e) => {
    const col = e.target.closest('.tcol[data-slotday]');
    if (!col || e.target.closest('.cblk')) return;
    const r = col.getBoundingClientRect();
    const min = Math.round(((e.clientY - r.top) / r.height * 1440) / 30) * 30;
    createEvent(col.dataset.slotday, 'event', hm(Math.min(min, 23 * 60 + 30)));
  });

  // Kalender: links/rechts wischen = vor/zurück
  let sx = 0, sy = 0, on = false;
  $app.addEventListener('touchstart', (e) => { if (!e.target.closest('[data-swipe="cal"]')) return; on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $app.addEventListener('touchend', (e) => {
    if (!on) return; on = false;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && !calDragBusy()) calMove(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// ---------- Aktionen der Kalenderliste und verknüpfte Termine ----------
export async function calAction(act, id, btn = null) {
  if (act === 'cal-toggle') return toggleSection(id);
  if (act === 'cal-link') return openLinkForm();
  if (act === 'cal-sources') return openSourcesDrop(btn, id === 'home' ? 'home' : 'hide');
  if (act === 'ext-ev') return openExtEvent(id);
  if (act === 'g-connect') return connectGoogle();
  if (act === 'cal-sync') return syncNow();
  if (act === 'g-disconnect') {
    if (!(await askConfirm('Google trennen?', 'Trennen', 'Die App darf dann nicht mehr auf Google zugreifen. Deine Kalender in Google bleiben unverändert.'))) return;
    try { await unlinkGoogle(); } catch (e) { toast('Fehler: ' + e.message, 4000); }
    return;
  }
  if (act === 'cal-unlink') {
    const c = calOf(id);
    if (!c || !(await askConfirm(`„${c.name}“ trennen?`, 'Trennen', 'Der Kalender selbst (z. B. in Outlook) bleibt unverändert.'))) return;
    try { await removeCalendar(id); } catch (e) { toast('Fehler: ' + e.message, 4000); }
  }
}

// Kalenderliste als Dropdown am Knopf: Häkchen schalten sofort um, das Menü bleibt offen;
// Klick daneben oder nochmal auf den Knopf schließt es (liegt außerhalb der Hauptansicht, daher eigene Klicks)
let closeDrop = null;
function openSourcesDrop(btn, where) {
  if (closeDrop) { closeDrop(); return; }
  if (!btn) return;
  const el = document.createElement('div');
  el.className = 'cmenu drop cal-drop';
  el.innerHTML = sourcesHtml(where);
  document.body.appendChild(el);
  const place = () => {
    const r = btn.getBoundingClientRect(), m = el.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8)) + 'px';
    el.style.top = (r.bottom + 8 + m.height < window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - m.height - 8)) + 'px';
  };
  place();
  const outside = (e) => { if (!el.contains(e.target) && !e.target.closest('[data-act="cal-sources"]')) closeDrop(); };
  closeDrop = () => { el.remove(); document.removeEventListener('pointerdown', outside, true); closeDrop = null; };
  document.addEventListener('pointerdown', outside, true);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'cal-toggle') { await toggleSection(b.dataset.id, where); el.innerHTML = sourcesHtml(where); return; }
    closeDrop();
    calAction(b.dataset.act, b.dataset.id);
  });
}

// Kalender verknüpfen: Name, Abo-Adresse (ICS), Farbe – mit kurzer Anleitung je Anbieter
function openLinkForm() {
  let color = EXT_COLORS[calendars.length % EXT_COLORS.length];
  const sheet = openSheet(`<div class="sheet-head"><h2>Kalender verknüpfen</h2>${sheetActs({ save: true, saveLabel: 'Verknüpfen' })}</div>
    <form id="cl-form">
      <div class="field"><label for="cl-name">Name</label><input class="input" id="cl-name" maxlength="60" placeholder="z. B. Outlook Arbeit" required></div>
      <div class="field"><label for="cl-url">Abo-Adresse (ICS)</label><input class="input" id="cl-url" type="url" inputmode="url" placeholder="https://… .ics oder webcal://…" required></div>
      <div class="field"><label>Farbe</label><div class="colors">${EXT_COLORS.map((c) => `<button type="button" class="color ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Farbe"></button>`).join('')}</div></div>
      <details class="cl-help"><summary>Wo finde ich die Adresse?</summary>
        <p><b>Outlook (Web):</b> Einstellungen → Kalender → Freigegebene Kalender → „Kalender veröffentlichen“ → Kalender wählen, „Alle Details“ → ICS-Link kopieren.</p>
        <p><b>Google:</b> Kalender-Einstellungen → gewünschten Kalender → „Kalender integrieren“ → „Privatadresse im iCal-Format“ kopieren.</p>
        <p><b>iCloud:</b> Kalender-App → Kalender teilen → „Öffentlicher Kalender“ → Link kopieren.</p>
        <p class="muted">Die Adresse bleibt privat (nur du siehst sie). Der Kalender wird gelesen, nicht verändert, und etwa alle 15 Minuten aktualisiert.</p>
      </details>
    </form>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  sheet.querySelector('[data-save]').addEventListener('click', () => sheet.querySelector('#cl-form').requestSubmit());
  sheet.querySelector('#cl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = sheet.querySelector('#cl-name').value, url = sheet.querySelector('#cl-url').value.trim();
    if (!/^(https|webcals?):\/\//i.test(url)) return toast('Bitte eine https- oder webcal-Adresse einfügen.', 4000);
    const go = sheet.querySelector('[data-save]');
    go.disabled = true; go.textContent = 'Verknüpfe …';
    try { await addCalendar({ name, url, color }); closeSheet(); toast('Verknüpft. Die Termine werden geladen …'); }
    catch (err) { toast('Fehler: ' + err.message, 5000); go.disabled = false; go.textContent = 'Verknüpfen'; }
  });
  setTimeout(() => sheet.querySelector('#cl-name')?.focus(), 60);
}

// Aktualisieren: eigene Daten und alle verknüpften Kalender sofort neu holen (Knopf dreht sich solange)
async function syncNow() {
  const spin = (on) => document.querySelectorAll('.ph-sync').forEach((b) => b.classList.toggle('busy', on));
  spin(true);
  await Promise.all([loadAll(), ensureExternal(true)]);
  spin(false);
  toast('Kalender aktualisiert');
}

// verknüpften Termin ansehen (nur lesen; ändern im Ursprungskalender)
function openExtEvent(id) {
  const o = extOcc(id);
  if (!o) return;
  // Google-Kalender mit Schreibrecht: „Bearbeiten“; sonst nur ansehen (Abos, Feiertage …)
  const c = calOf(o.cal), edit = o.gid && c?.writable;
  showEventCard({
    title: o.title, when: whenText(o.start, o.end, o.allDay), location: o.location, desc: o.desc,
    calName: c?.name || 'Verknüpfter Kalender', color: c?.color || EXT_COLORS[0],
    hint: edit ? '' : 'Nur zum Ansehen – ändern im Ursprungskalender.',
    onEdit: edit ? () => openGoogleEvent(o, { color: c.color, name: c.name, onDone: reloadGoogle, sections: calSections(), toSection: (key, d) => createIn(d, key) }) : null,
  });
}
