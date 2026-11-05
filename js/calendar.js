// Bereich Kalender: Tag, Woche (Zeitraster wie bei Google), Monat; Abschnitte ein- und ausblenden, verknüpfte Kalender
import { addCalendar, calendars, calOf, ensureExternal, EXT_COLORS, extOn, extOcc, feedError, isShown, removeCalendar, SECTIONS, toggleSection } from './cal-sources.js';
import { $app, askConfirm, esc, isDesktop, state, toast } from './core.js';
import { addDays, dayName, isoWeek, mondayOf, parseYmd, ymd } from './dates.js';
import { createEvent, evAge, eventsOn, isBday } from './events.js';
import { ICON } from './icons.js';
import { mealsOn } from './meals.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

// ---------- Kalender: Tag / Woche / Monat ----------
const H0 = 0, H1 = 24, HPX = 48;   // sichtbare Stunden und Höhe pro Stunde
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
const openAttr = (a) => (a.kind === 'x' ? `data-act="ext-ev" data-id="${esc(a.item.id)}" style="--xc:${a.color}"` : `data-act="open" data-id="${a.item.id}"`);

export const allChip = (a) => `<button class="cchip k-${a.kind} ${a.item.done ? 'done' : ''}" ${openAttr(a)}>${chipIc(a.kind, a.item)}<span>${esc(a.label)}</span></button>`;

export const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const timedBlock = (t, narrow = false) => {
  const top = (Math.max(t.start, H0 * 60) - H0 * 60) / 60 * HPX, h = Math.max(22, (Math.min(t.end, H1 * 60) - Math.max(t.start, H0 * 60)) / 60 * HPX - 2);
  const pos = `top:${top}px;height:${h}px;left:calc(${(t.col / t.cols) * 100}% + 1px);width:calc(${100 / t.cols}% - 3px)`;
  const attr = openAttr(t).replace(/style="([^"]*)"/, '').trim();
  return `<button class="cblk k-${t.kind} ${narrow ? 'narrow' : ''}" ${attr} style="${pos}${t.kind === 'x' ? `;--xc:${t.color}` : ''}">
    ${narrow && h < 34 ? '' : `<small>${hm(t.start)}${t.kind === 'ev' && t.item.meta?.end ? '–' + esc(t.item.meta.end) : ''}</small>`}<b>${esc(t.label)}</b></button>`;
};

const hourLines = () => Array.from({ length: H1 - H0 }, (_, k) => `<div class="hl" style="top:${k * HPX}px"><span>${k ? String(H0 + k).padStart(2, '0') + ':00' : ''}</span></div>`).join('');

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
  if (v !== 'month') scrollCal();
}

// Tagesraster auf ca. 7 Uhr bzw. jetzt scrollen
export function scrollCal() {
  requestAnimationFrame(() => {
    const g = document.querySelector('.tgridv'), m = document.querySelector('.cal-scroll') || document.querySelector('.main');
    if (!g || !m) return;
    const n = new Date(), h = Math.min(n.getHours() - 1, 7) < 0 ? 0 : (calDay() === ymd(n) || state.calView === 'week' ? Math.max(H0, Math.min(n.getHours() - 1, 17)) : 7);
    m.scrollTop = (m.classList.contains('cal-scroll') ? 0 : g.offsetTop) + (h - H0) * HPX - 10;
  });
}

export function renderCalendar() {
  ensureExternal();
  const v = state.calView;
  const view = `<div class="cal cal-${v}" data-swipe="cal">${v === 'day' ? calDayView() : v === 'month' ? calMonthView() : calWeekView()}</div>`;
  // Desktop: links die Kalenderliste wie bei Google; schmal: über den Knopf „Kalender“ in der Kopfleiste
  return isDesktop() ? `<div class="cal-wrap"><aside class="cal-side">${sourcesHtml()}</aside><div class="cal-main">${view}</div></div>` : view;
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
    <div class="src-h">Verknüpfte Kalender</div>
    ${calendars.map((c) => row('x:' + c.id, c.name, c.color,
      `${feedError(c.id) ? `<span class="src-err" title="${esc(feedError(c.id))}">!</span>` : ''}<button class="src-x" data-act="cal-unlink" data-id="${esc(c.id)}" aria-label="${esc(c.name)} entfernen" title="Entfernen">${ICON.trash}</button>`)).join('')
      || '<p class="src-empty">Noch keiner. Outlook, Google oder iCloud über die Abo-Adresse (ICS) verknüpfen.</p>'}
    ${cal ? `<button class="src-add" data-act="cal-link">${ICON.plus}<span>Kalender verknüpfen</span></button>` : ''}`;
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

// Woche wie bei Google: Kopfzeile mit Tagen, Zeile für Ganztägiges, darunter Zeitraster mit sieben Spalten
function calWeekView() {
  const ws = mondayOf(parseYmd(calDay())), days = Array.from({ length: 7 }, (_, k) => addDays(ws, k)), today = ymd(new Date());
  const content = days.map((d) => dayContent(d));
  const head = days.map((d) => `<button class="gw-d ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" data-act="cal-goto" data-id="${d}" aria-label="${esc(dayName(d, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <small>${esc(dayName(d, { weekday: 'short' }).replace('.', ''))}</small><b>${+d.slice(8)}</b></button>`).join('');
  const all = content.map(({ allday }, k) => `<div class="gw-ac" data-day="${days[k]}">${allday.map(allChip).join('')}</div>`).join('');
  const cols = content.map(({ timed }, k) => `<div class="tcol ${days[k] === today ? 'today' : ''}" data-slotday="${days[k]}">${timed.map((t) => timedBlock(t, true)).join('')}${nowLine(days[k])}</div>`).join('');
  return `<section class="tile cal-panel gw">
    <div class="gw-head"><span class="gw-gut"></span>${head}</div>
    <div class="gw-all"><span class="gw-gut">ganzt.</span>${all}</div>
    <div class="cal-scroll"><div class="tgridv gw-body" style="height:${(H1 - H0) * HPX}px">${hourLines()}<div class="gw-cols">${cols}</div></div></div>
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
    return `<button class="mc ${x.slice(0, 7) !== month ? 'out' : ''} ${x === today ? 'today' : ''} ${x === d ? 'sel' : ''}" data-act="cal-goto" data-id="${x}">
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

// ---------- Aktionen der Kalenderliste und verknüpfte Termine ----------
export async function calAction(act, id) {
  if (act === 'cal-toggle') return toggleSection(id);
  if (act === 'cal-link') return openLinkForm();
  if (act === 'cal-sources') return openSourcesSheet(id === 'home' ? 'home' : 'hide');
  if (act === 'ext-ev') return openExtEvent(id);
  if (act === 'cal-unlink') {
    const c = calOf(id);
    if (!c || !(await askConfirm(`„${c.name}“ trennen?`, 'Trennen', 'Der Kalender selbst (z. B. in Outlook) bleibt unverändert.'))) return;
    try { await removeCalendar(id); } catch (e) { toast('Fehler: ' + e.message, 4000); }
  }
}

// Kalenderliste als Fenster: schmal im Kalender, überall für die Startseite
// (hat eigene Klicks, weil das Fenster außerhalb der Hauptansicht liegt)
function openSourcesSheet(where) {
  const title = where === 'home' ? 'Auf der Startseite zeigen' : 'Kalender';
  const sheet = openSheet(`<div class="sheet-head"><h2>${title}</h2><button class="link-btn" data-close>Fertig</button></div><div class="src-list">${sourcesHtml(where)}</div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.dataset.act === 'cal-sources') return;
    if (b.dataset.act === 'cal-link') { closeSheet(); return openLinkForm(); }
    if (b.dataset.act === 'cal-toggle') await toggleSection(b.dataset.id, where);
    else await calAction(b.dataset.act, b.dataset.id);
    sheet.querySelector('.src-list').innerHTML = sourcesHtml(where);
  });
}

// Kalender verknüpfen: Name, Abo-Adresse (ICS), Farbe – mit kurzer Anleitung je Anbieter
function openLinkForm() {
  let color = EXT_COLORS[calendars.length % EXT_COLORS.length];
  const sheet = openSheet(`<div class="sheet-head"><h2>Kalender verknüpfen</h2><button class="link-btn" data-close>Abbrechen</button></div>
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
      <button class="btn block" id="cl-go">Verknüpfen</button>
    </form>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  sheet.querySelector('#cl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = sheet.querySelector('#cl-name').value, url = sheet.querySelector('#cl-url').value.trim();
    if (!/^(https|webcals?):\/\//i.test(url)) return toast('Bitte eine https- oder webcal-Adresse einfügen.', 4000);
    const go = sheet.querySelector('#cl-go');
    go.disabled = true; go.textContent = 'Verknüpfe …';
    try { await addCalendar({ name, url, color }); closeSheet(); toast('Verknüpft. Die Termine werden geladen …'); }
    catch (err) { toast('Fehler: ' + err.message, 5000); go.disabled = false; go.textContent = 'Verknüpfen'; }
  });
  setTimeout(() => sheet.querySelector('#cl-name')?.focus(), 60);
}

// verknüpften Termin ansehen (nur lesen; ändern im Ursprungskalender)
function openExtEvent(id) {
  const o = extOcc(id);
  if (!o) return;
  const c = calOf(o.cal);
  const when = o.allDay
    ? `${o.start.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })}${ymd(new Date(o.end - 1)) !== ymd(o.start) ? ' – ' + new Date(o.end - 1).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' }) : ''} · ganztägig`
    : `${o.start.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })} · ${o.start.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}–${o.end.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`;
  const sheet = openSheet(`<div class="sheet-head"><span class="status"><i class="src-dot" style="background:${c?.color || EXT_COLORS[0]}"></i>${esc(c?.name || 'Verknüpfter Kalender')}</span><button class="link-btn" data-close>Fertig</button></div>
    <h2 class="xe-t">${esc(o.title)}</h2>
    <p class="xe-w">${ICON.clock}<span>${esc(when)}</span></p>
    ${o.location ? `<p class="xe-w">${ICON.pin}<span>${esc(o.location)}</span></p>` : ''}
    ${o.desc ? `<div class="xe-d">${esc(o.desc)}</div>` : ''}
    <p class="hint">Aus einem verknüpften Kalender – ändern im Ursprungskalender (z. B. Outlook).</p>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
}
