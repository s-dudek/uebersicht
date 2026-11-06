// Startseite
import { ensureExternal } from './cal-sources.js';
import { allChip, dayContent, hm, openAttr } from './calendar.js';
import { askConfirm, esc, isDesktop, isTodoList, safeColor, sb, state } from './core.js';
import { addDays, parseYmd, ymd } from './dates.js';
import { catSym } from './folders.js';
import { renderTiles } from './home-tiles.js';
import { ICON, LOGO_MARK, LOGO_WORD } from './icons.js';
import { SLOTS, cookOn, mealRow, mealsOn } from './meals.js';
import { openSettings } from './panels.js';
import { pinned } from './pins.js';
import { dueTag } from './todos.js';

// Startseite – Desktop: Übersicht (Datum, Tag im Kalender, Essen heute, Pinnwand);
// Smartphone/Tablet: Leiste oben (homeBar) und Kacheln für Kalender und Bereiche, darunter die Pinnwand.
export function renderHome() {
  ensureExternal();
  return renderDashboard();
}

export async function homeAction(k) {
  if (k === 'settings') return openSettings();
  if (k === 'logout' && (await askConfirm('Abmelden?', 'Abmelden'))) sb.auth.signOut();
}

// ---------- Desktop: Kachel „Tag im Kalender“ als Zeitleiste ----------
const DAY_FROM = 6 * 60, DAY_TO = 24 * 60;   // sichtbarer Zeitraum der Tagesleiste

// Name des gezeigten Tags: Heute, Morgen, Gestern oder Wochentag mit Datum
function dayLabel(day) {
  const t = ymd(new Date());
  if (day === t) return 'Heute';
  if (day === addDays(t, 1)) return 'Morgen';
  if (day === addDays(t, -1)) return 'Gestern';
  return parseYmd(day).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' });
}

function dayStrip(today) {
  const day = state.homeDay || today, isToday = day === today;
  const { timed, allday } = dayContent(day, 'home');
  const pct = (min) => ((Math.min(Math.max(min, DAY_FROM), DAY_TO) - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100;
  const rows = Math.max(1, ...timed.map((t) => t.cols));
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = [];
  for (let h = 6; h <= 24; h += 2) hours.push(`<span class="ds-h" style="left:${pct(h * 60)}%">${String(h % 24).padStart(2, '0')}</span>`);
  const block = (t) => `<button class="ds-b k-${t.kind}" ${openAttr(t).replace(/style="[^"]*"/, '')} title="${esc(t.label)}"
      style="left:${pct(t.start)}%;width:calc(${pct(t.end) - pct(t.start)}% - 3px);top:${(t.col / rows) * 100}%;height:calc(${100 / rows}% - 4px)${t.kind === 'x' ? `;--xc:${t.color}` : ''}">
      <small>${hm(t.start)}</small><b>${esc(t.label)}</b></button>`;
  // ganze Kachel führt zum Kalender (an diesen Tag); Blättern, Termin +, Auswahl und Termine haben eigene Aktionen
  return `<section class="tile dash-day" data-act="home-cal" data-id="${day}">
    <div class="th">${ICON.calendar}<b class="ds-t">${esc(dayLabel(day))}</b>
      <button class="lgear ds-nav" data-act="home-day" data-id="-1" aria-label="Tag zurück">${ICON.chevL}</button>
      <button class="lgear ds-nav" data-act="home-day" data-id="1" aria-label="Tag vor">${ICON.chevR}</button>
      ${isToday ? '' : '<button class="chip ds-today" data-act="home-day" data-id="0">Heute</button>'}
      <span class="th-sp"></span>
      <button class="link-more" data-act="new-event" data-id="${day}">${ICON.plus} Termin</button>
      <button class="lgear" data-act="cal-sources" data-id="home" aria-label="Was die Startseite zeigt" title="Auswahl">${ICON.eye}</button></div>
    <div class="allday">${allday.map(allChip).join('')}</div>
    <div class="ds">
      <div class="ds-grid">${hours.join('')}</div>
      <div class="ds-track">${timed.map(block).join('')}
        ${isToday && nowMin >= DAY_FROM ? `<i class="ds-now" style="left:${pct(nowMin)}%"></i>` : ''}
        ${!timed.length && !allday.length ? `<p class="kempty ds-empty">${isToday ? 'Heute ist' : 'An diesem Tag ist'} nichts eingetragen.</p>` : ''}</div>
    </div>
  </section>`;
}

function mealsToday(today) {
  const meals = mealsOn(today), cook = cookOn(today);
  const col = ([slot, label]) => {
    const list = meals.filter((m) => m.meta?.slot === slot);
    return `<div class="dm-col"><div class="dm-h">${label}</div>${list.length ? `<div class="mrows">${list.map((m) => mealRow(m, { compact: true })).join('')}</div>` : '<p class="kempty">–</p>'}</div>`;
  };
  return `<section class="tile dash-meals">
    <div class="th">${ICON.pot}<b>Essen heute</b><span class="th-sp"></span><button class="link-more" data-act="nav" data-id="meals">Woche</button></div>
    ${meals.length || cook.length ? `<div class="dm">${SLOTS.map(col).join('')}</div>
      ${cook.length ? `<div class="cook">${ICON.pot}<span>Heute auch vorkochen: <b>${cook.map((m) => esc(m.title)).join(', ')}</b></span></div>` : ''}`
      : '<p class="kempty">Für heute ist nichts geplant.</p>'}
  </section>`;
}

// Eine Karte der Pinnwand
function pinCard({ key, type, obj }) {
  const head = (icon, title, color = '') => `<div class="pin-h"${color ? ` style="--fc:${safeColor(color)}"` : ''}>
      <span class="pin-ic">${icon}</span><b>${title}</b>
      <button class="pin-x" data-act="unpin" data-id="${esc(key)}" aria-label="Von Home entfernen" title="Von Home entfernen">×</button></div>`;
  const todoRow = (i) => `<div class="pin-r ${i.done ? 'done' : ''}">
      <button class="tcheck ${i.done ? 'on' : ''}" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Wieder öffnen' : 'Erledigt'}">${i.done ? ICON.check : ''}</button>
      <button class="pin-t" data-act="open" data-id="${i.id}">${esc(i.title) || 'Ohne Titel'}</button>${i.done ? '' : dueTag(i)}</div>`;
  let body;
  if (type === 'cat') {
    const c = obj;
    if (isTodoList(c)) {
      const open = state.items.filter((i) => i.type === 'todo' && i.category_id === c.id && !i.done).slice(0, 8);
      body = `${open.map(todoRow).join('') || '<p class="kempty">Alles erledigt.</p>'}
        <form class="addrow pin-add" data-list="${c.id}"><span class="xic">${ICON.plus}</span><input name="title" placeholder="Hinzufügen …" autocomplete="off"></form>`;
    } else {
      const notes = state.items.filter((i) => i.type === 'note' && i.category_id === c.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
      body = notes.map((n) => `<button class="pin-r pin-t" data-act="open" data-id="${n.id}">${esc(n.title) || 'Ohne Titel'}</button>`).join('') || '<p class="kempty">Leer.</p>';
    }
    return `<article class="pin pin-list" data-cdrag="${esc(key)}" data-pin="${esc(key)}">${head(catSym(c), esc(c.name), c.color)}
      <div class="pin-b">${body}</div>
      <button class="pin-more" data-act="pin-open" data-id="${c.id}">Öffnen</button></article>`;
  }
  const i = obj;
  if (i.type === 'note') {
    return `<article class="pin pin-note ${i.meta?.color ? 'tinted' : ''}" data-cdrag="${esc(key)}" data-pin="${esc(key)}"${i.meta?.color ? ` style="--ic:${safeColor(i.meta.color)}"` : ''}>
      ${head(ICON.notes, esc(i.title) || 'Ohne Titel')}
      <button class="pin-b pin-text" data-act="open" data-id="${i.id}">${esc(i.body.slice(0, 400)) || '<span class="muted">Kein Text.</span>'}</button></article>`;
  }
  if (i.type === 'todo') {
    return `<article class="pin pin-todo" data-cdrag="${esc(key)}" data-pin="${esc(key)}">${head(ICON.todos, 'Todo')}<div class="pin-b">${todoRow(i)}</div></article>`;
  }
  return `<article class="pin" data-cdrag="${esc(key)}" data-pin="${esc(key)}">${head(i.type === 'event' ? ICON.calendar : ICON.pot, esc(i.title) || 'Eintrag')}
    <button class="pin-more" data-act="open" data-id="${i.id}">Öffnen</button></article>`;
}

// Pinnwand („Meine Übersicht“); anheften geht per Rechtsklick am Computer
function pinBoard(desk) {
  const pins = pinned();
  return `<section class="dash-pins">
      <div class="dp-h"><b>Meine Übersicht</b><span>${desk ? 'Rechtsklick auf eine Notiz, ein Todo oder eine Liste → „Zu Home hinzufügen“. Karten lange drücken zum Verschieben.' : 'Am Computer per Rechtsklick „Zu Home hinzufügen“ – erscheint auch hier.'}</span></div>
      ${pins.length ? `<div class="pins" data-cgrid="home">${pins.map(pinCard).join('')}</div>`
        : `<div class="pins-empty">Noch leer. ${desk ? 'Füge in Todos oder Notizen per Rechtsklick „Zu Home hinzufügen“ hinzu.' : 'Am Computer in Todos oder Notizen per Rechtsklick „Zu Home hinzufügen“.'}</div>`}
    </section>`;
}

// Desktop: Datum, Tag im Kalender, Essen heute, Pinnwand
function renderDashboard() {
  const today = ymd(new Date()), d = new Date();
  if (!isDesktop()) return `<div class="dash-wrap">${renderTiles(today, d)}${state.homeEdit ? '' : pinBoard(false)}</div>`;
  return `<div class="dash-wrap">
    <header class="dash-head"><b>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</b><span>${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}</span></header>
    ${dayStrip(today)}
    ${mealsToday(today)}
    ${pinBoard(true)}
  </div>`;
}

// Smartphone/Tablet: Leiste oben auf der Startseite – Logo, Neue Notiz (rund), Einstellungen, Abmelden
export function homeBar() {
  return `<header class="homebar"><div class="hbar-in">
    <span class="hbar-logo">${LOGO_MARK}${LOGO_WORD}</span>
    <button class="hbar-new" data-act="nav" data-id="quick" aria-label="Neue Notiz" title="Neue Notiz">${ICON.plus}</button>
    <span class="th-sp"></span>
    ${state.homeEdit ? '<button class="hbar-done" data-act="home-edit">Fertig</button>' : `
    <button class="hbar-ic" data-home="settings" aria-label="Einstellungen" title="Einstellungen">${ICON.gear}</button>
    <button class="hbar-ic" data-home="logout" aria-label="Abmelden" title="Abmelden">${ICON.power}</button>`}
  </div></header>`;
}
