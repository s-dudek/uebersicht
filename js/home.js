// Startseite
import { askConfirm, catById, esc, isDesktop, safeColor, sb, state } from './core.js';
import { addDays, dueLabel, ymd } from './dates.js';
import { evAge, eventsOn, isBday } from './events.js';
import { ICON, LOGO_PORTRAIT } from './icons.js';
import { mealRow, mealsOn } from './meals.js';
import { openSettings } from './panels.js';
import { dueTag } from './todos.js';

const HOME_BTNS = [
  { key: 'settings', label: 'Einstellungen', icon: 'gear' },
  { key: 'logout', label: 'Abmelden', icon: 'power' },
];

function homeEvents() {
  const t = ymd(new Date()), m = addDays(t, 1);
  const list = [...eventsOn(t).map((e) => [e, 'Heute']), ...eventsOn(m).map((e) => [e, 'Morgen'])].slice(0, 3);
  if (!list.length) return '';
  return `<div class="home-ev">${list.map(([e, w]) => `<button class="hev ${isBday(e) ? 'bday' : ''}" data-act="open" data-id="${e.id}">${isBday(e) ? ICON.cake : ICON.calendar}<span><em>${w}</em> ${esc(isBday(e) ? (e.title || 'Geburtstag') : e.title || 'Termin')}${!isBday(e) && e.meta?.time ? ' · ' + esc(e.meta.time) : ''}</span></button>`).join('')}</div>`;
}

// Das Lesezeichen-Logo fällt nur beim Betreten der Startseite herunter, nicht bei jedem Neuzeichnen
let introShown = false;
export function resetHomeIntro() { introShown = false; }

export function renderHome() {
  if (isDesktop()) return renderDashboard();
  const settled = introShown;
  introShown = true;
  const d = new Date();
  return `
  <div class="home">
    <header class="home-head">
      <div class="home-day"><b>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</b><span>${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        ${homeEvents()}</div>
    </header>
    <div class="bookmark ${settled ? 'settled' : ''}">${LOGO_PORTRAIT}</div>
    <div class="home-plate" aria-hidden="true"><i></i><i></i></div>
    <div class="home-foot">
      ${HOME_BTNS.map((b) => `<button class="hb ${b.key === 'logout' ? 'out' : ''}" data-home="${b.key}" aria-label="${b.label}">
        <span class="hb-c">${ICON[b.icon]}</span><span class="hb-l">${b.label}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

export async function homeAction(k) {
  if (k === 'settings') return openSettings();
  if (k === 'logout' && (await askConfirm('Abmelden?', 'Abmelden'))) sb.auth.signOut();
}

// ---------- Desktop: Startseite als Übersicht des Tages ----------
function renderDashboard() {
  const today = ymd(new Date()), tomorrow = addDays(today, 1);
  const tile = (title, icon, body, act = '') => `<section class="tile dash">
      <div class="th">${ICON[icon]}<b>${title}</b>${act}</div>${body}</section>`;
  const empty = (t) => `<p class="kempty">${t}</p>`;
  const link = (tab, label) => `<span class="th-sp"></span><button class="link-more" data-act="nav" data-id="${tab}">${label}</button>`;

  // Termine heute und morgen
  const evs = [...eventsOn(today).map((e) => [e, 'Heute']), ...eventsOn(tomorrow).map((e) => [e, 'Morgen'])];
  const evHtml = evs.length ? `<div class="dl">${evs.map(([e, w]) => `<button class="dr ${isBday(e) ? 'bday' : ''}" data-act="open" data-id="${e.id}">
      <span class="dr-i">${isBday(e) ? ICON.cake : ICON.calendar}</span>
      <span class="dr-t">${esc(isBday(e) ? `${e.title || 'Jemand'} hat Geburtstag${evAge(e, w === 'Heute' ? today : tomorrow) ? ` (${evAge(e, w === 'Heute' ? today : tomorrow)})` : ''}` : e.title || 'Termin')}</span>
      <span class="dr-m">${w}${!isBday(e) && e.meta?.time ? ' · ' + esc(e.meta.time) : ''}</span></button>`).join('')}</div>` : empty('Heute und morgen nichts eingetragen.');

  // offene Todos: überfällig und heute zuerst, dann mit Datum, dann der Rest
  const todos = state.items.filter((i) => i.type === 'todo' && !i.done && !i.meta?.section)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const todoHtml = todos.length ? `<div class="dl">${todos.map((i) => {
    const c = catById(i.category_id);
    return `<div class="dr">
      <button class="tcheck" data-act="toggle" data-id="${i.id}" aria-label="Erledigt"></button>
      <button class="dr-t" data-act="open" data-id="${i.id}">${esc(i.title) || 'Ohne Titel'}</button>
      ${c ? `<span class="dr-c" style="--fc:${safeColor(c.color, '#6E8582')}">${esc(c.name)}</span>` : ''}${dueTag(i)}</div>`;
  }).join('')}</div>` : empty('Alles erledigt.');

  // Essen heute
  const meals = mealsOn(today);
  const mealHtml = meals.length ? `<div class="mrows">${meals.map((m) => mealRow(m, { compact: true })).join('')}</div>` : empty('Für heute ist nichts geplant.');

  // zuletzt bearbeitete Notizen
  const notes = state.items.filter((i) => i.type === 'note').sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
  const noteHtml = notes.length ? `<div class="dl">${notes.map((n) => `<button class="dr" data-act="open" data-id="${n.id}"${n.meta?.color ? ` style="--ic:${safeColor(n.meta.color)}"` : ''}>
      <span class="dr-dot ${n.meta?.color ? 'on' : ''}"></span><span class="dr-t">${esc(n.title) || 'Ohne Titel'}</span>
      <span class="dr-m">${esc(dueLabel(n.updated_at.slice(0, 10)).text)}</span></button>`).join('')}</div>` : empty('Noch keine Notizen.');

  const d = new Date();
  return `<div class="dash-wrap">
    <header class="dash-head"><b>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</b><span>${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}</span></header>
    <div class="dash-grid">
      ${tile('Termine', 'calendar', evHtml, link('calendar', 'Kalender'))}
      ${tile('Offene Todos', 'todos', todoHtml, link('todos', 'Alle'))}
      ${tile('Essen heute', 'pot', mealHtml, link('meals', 'Woche'))}
      ${tile('Zuletzt bearbeitet', 'notes', noteHtml, link('notes', 'Alle'))}
    </div>
  </div>`;
}
