// Hauptansicht zeichnen: Smartphone mit Kopfleiste und Leiste unten, Desktop mit Seitenleiste
import { calDay, calTitle, renderCalendar } from './calendar.js';
import { ctl } from './control.js';
import { $app, catById, esc, inkMode, isDesktop, state, store } from './core.js';
import { addDays, isoWeek, ymd } from './dates.js';
import { folderIc } from './folders.js';
import { homeBar, renderHome } from './home.js';
import { trashCount } from './trash.js';
import { inkHead, inkHeadTools, leaveInk, mountInk } from './ink.js';
import { ICON, LOGO_MARK, LOGO_WORD } from './icons.js';
import { renderMeals } from './meals.js';
import { renderTraining } from './training.js';
import { NAV } from './nav.js';
import { selectBar, selecting } from './note-select.js';
import { notesIn, renderNotes } from './notes.js';
import { splashReady } from './splash.js';
import { renderTodos, todosIn } from './todos.js';

// Dudek-Zeichen als Wasserzeichen hinter allem
const WATERMARK = `<div class="watermark" aria-hidden="true">${LOGO_MARK}</div>`;

const PAGES = { home: renderHome, todos: renderTodos, notes: renderNotes, meals: renderMeals, training: renderTraining, calendar: renderCalendar };

export function render() {
  if (!state.me || !state.loaded) return;
  if (render.hold) { render.pending = true; return; }
  // Eingabe im "Neues Todo"-Feld und Scrollposition bei Live-Updates behalten
  const typedMap = {};
  document.querySelectorAll('.addrow[data-list] input').forEach((i) => { if (i.value) typedMap[i.closest('form').dataset.list] = i.value; });
  const focusedList = document.activeElement?.closest?.('.addrow[data-list]')?.dataset.list;
  const prevScroll = document.querySelector('.main')?.scrollTop || 0;
  const prevCal = document.querySelector('.cal-scroll')?.scrollTop;   // Stundenraster der Woche
  const sameTab = render.lastTab === state.tab;
  render.lastTab = state.tab;
  if (!sameTab && !state.keepList) state.list = null;
  state.keepList = false;

  const tab = state.tab, home = tab === 'home', desk = isDesktop();
  if (!home) state.homeEdit = false;
  if (tab !== 'notes' || !selecting()) state.noteSel = null;   // Auswahl endet beim Verlassen des Ordners
  const content = (PAGES[tab] || renderHome)();
  const inkOn = isInkView();
  if (!inkOn) leaveInk();
  else store('inkFolder', state.list ?? '');   // zuletzt benutzter Canvas (Kachel „Notizen“ der Startseite)
  const ink = inkOn ? 'is-ink' : '';
  $app.innerHTML = desk
    ? `<div class="app desk ${inkOn && state.inkSideOff ? 'side-off' : ''}">
        ${WATERMARK}
        ${sidebar(tab)}
        <div class="desk-main">
          ${home ? '' : pageHead(tab, true)}
          <main class="main ${home ? 'is-home' : ''} ${ink}">${content}</main>
        </div>
      </div>`
    : `<div class="app">
        ${WATERMARK}
        ${home ? homeBar() : pageHead(tab, false)}
        <main class="main ${home ? 'is-home' : inkOn ? '' : 'has-dock'} ${ink}">${content}</main>
        ${home || inkOn ? '' : `<nav class="dock" aria-label="Aktionen">${actionsFor(tab)}</nav>`}
      </div>`;
  ctl.show(!desk && !home);   // Startseite hat die Bereiche als Kacheln, sonst Steuerknopf unten rechts
  if (inkOn) mountInk();

  if (sameTab) {
    $app.querySelector('.main').scrollTop = prevScroll;
    const cs = $app.querySelector('.cal-scroll');
    if (cs && prevCal !== undefined) cs.scrollTop = prevCal;
  }
  for (const [k, v] of Object.entries(typedMap)) { const i = document.querySelector(`.addrow[data-list="${k}"] input`); if (i) i.value = v; }
  if (focusedList !== undefined) document.querySelector(`.addrow[data-list="${focusedList}"] input`)?.focus();
  splashReady();
}

// Notiz-Ordner geöffnet und im Canvas
const isInkView = () => state.tab === 'notes' && state.list !== null && inkMode(state.list);

// ---------- Desktop: Seitenleiste mit allen Bereichen ----------
function sidebar(tab) {
  const count = {
    todos: state.items.filter((i) => i.type === 'todo' && !i.done).length,
    notes: state.items.filter((i) => i.type === 'note').length,
  };
  const item = (n) => `<button class="sn ${n.key === tab ? 'on' : ''} ${n.soon ? 'soon' : ''}" data-act="nav" data-id="${n.key}">
      ${ICON[n.icon]}<span>${n.label}</span>${count[n.key] ? `<i>${count[n.key]}</i>` : ''}</button>`;
  return `<aside class="side">
    <div class="side-brand">${LOGO_MARK}${LOGO_WORD}</div>
    <button class="btn block side-new" data-act="nav" data-id="quick">${ICON.plus} Neue Notiz</button>
    <nav class="side-nav">${NAV.filter((n) => n.key !== 'quick').map(item).join('')}</nav>
    <div class="side-foot">
      <button class="sn" data-home="trash">${ICON.trash}<span>Papierkorb</span>${trashCount() ? `<i>${trashCount()}</i>` : ''}</button>
      <button class="sn" data-home="settings">${ICON.gear}<span>Einstellungen</span></button>
      <button class="sn out" data-home="logout">${ICON.power}<span>Abmelden</span></button>
    </div>
  </aside>`;
}

// ---------- Aktionen je Bereich: Smartphone unten in der Leiste, Desktop rechts in der Kopfleiste ----------
const actBtn = (act, icon, label, { id = '', primary = false, text = true } = {}) =>
  `<button class="dk ${primary ? 'pri' : ''}" data-act="${act}" ${id !== '' ? `data-id="${esc(id)}"` : ''} aria-label="${esc(label)}" title="${esc(label)}">${ICON[icon]}${text ? `<span>${esc(label)}</span>` : ''}</button>`;

function actionsFor(tab) {
  if (tab === 'calendar') {
    const v = state.calView;
    return `${actBtn('cal-move', 'chevL', 'Zurück', { id: '-1', text: false })}
      <div class="seg-view cal-seg">${[['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-act="cal-view" data-id="${k}"><span>${l}</span></button>`).join('')}</div>
      ${actBtn('cal-move', 'chevR', 'Weiter', { id: '1', text: false })}`;
  }
  if (tab === 'todos') {
    if (state.list === null) return actBtn('new-todo', 'plus', 'Neues Todo', { primary: true });
    return `${actBtn('close-list', 'chevL', 'Listen')}${actBtn('focus-add', 'plus', 'Todo', { primary: true })}${state.list ? actBtn('list-edit', 'dots', 'Liste bearbeiten', { id: state.list, text: false }) : ''}`;
  }
  if (tab === 'notes') {
    if (state.list === null) return actBtn('new-note', 'plus', 'Neue Notiz', { primary: true });
    if (isInkView()) return '';   // Werkzeuge stehen in der eigenen Leiste des Canvas
    if (selecting()) return selectBar();
    return `${actBtn('close-list', 'chevL', 'Ordner')}${actBtn('new-note-in', 'plus', 'Notiz', { id: state.list, primary: true })}${notesIn(state.list).length ? actBtn('note-sel', 'check', 'Auswählen', { text: false }) : ''}${state.list ? actBtn('list-edit', 'dots', 'Ordner bearbeiten', { id: state.list, text: false }) : ''}`;
  }
  if (tab === 'meals') {
    return `${actBtn('week-prev', 'chevL', 'Vorige Woche', { text: false })}<button class="dk wk-now" data-act="week-today"><span>KW ${isoWeek(state.weekStart)}</span></button>${actBtn('week-next', 'chevR', 'Nächste Woche', { text: false })}${actBtn('import-plan', 'plus', 'Code', { primary: true })}`;
  }
  if (tab === 'training') {
    return `${actBtn('week-prev', 'chevL', 'Vorige Woche', { text: false })}<button class="dk wk-now" data-act="week-today"><span>KW ${isoWeek(state.weekStart)}</span></button>${actBtn('week-next', 'chevR', 'Nächste Woche', { text: false })}${actBtn('import-plan', 'plus', 'Code', { primary: true })}`;
  }
  return '';
}

// ---------- Kopfleiste (hängt am oberen Rand) ----------
const TITLES = { todos: 'Todos', notes: 'Notizen', meals: 'Gerichte', training: 'Training', calendar: 'Kalender' };

function pageCount(tab) {
  if (tab === 'todos') return state.items.filter((i) => i.type === 'todo' && !i.done).length;
  if (tab === 'notes') return state.items.filter((i) => i.type === 'note').length;
  if (tab === 'meals') return state.items.filter((i) => i.type === 'meal' && i.due_date >= state.weekStart && i.due_date <= addDays(state.weekStart, 6)).length;
  if (tab === 'training') return state.items.filter((i) => i.type === 'training' && i.due_date >= state.weekStart && i.due_date <= addDays(state.weekStart, 6)).length;
  return 0;
}

function pageHead(tab, desk) {
  if (!TITLES[tab]) return '';
  const tools = isInkView() ? inkHeadTools() : desk ? `<div class="ph-tools">${actionsFor(tab)}</div>` : '';
  const cnt = (n) => `<span class="cnt ${n ? '' : 'zero'}">${n}</span>`;
  let left;
  if (tab === 'calendar') {
    const [t, sub] = calTitle(), isToday = calDay() === ymd(new Date());
    left = `<b class="ph-t cal-pt">${esc(t)}<small>${esc(sub)}</small></b>
      <button class="chip ph-today ${isToday ? 'on' : ''}" data-act="cal-today">Heute</button>
      <button class="cbtn ph-src" data-act="cal-sources" aria-label="Kalender ein- und ausblenden" title="Kalender">${ICON.stack}</button>
      <button class="cbtn ph-sync" data-act="cal-sync" aria-label="Aktualisieren" title="Aktualisieren">${ICON.sync}</button>
      <button class="cbtn ph-add" data-act="new-event-menu" aria-label="Neuer Termin" title="Neuer Termin">${ICON.plus}</button>`;
  } else if ((tab === 'todos' || tab === 'notes') && state.list !== null) {
    const c = catById(state.list);
    const n = tab === 'todos' ? todosIn(state.list).filter((i) => !i.done).length : notesIn(state.list).length;
    const title = `${c ? folderIc(c, 'ph-ic') : ''}<b class="ph-t">${esc(c ? c.name : tab === 'todos' ? 'Allgemein' : 'Ohne Kategorie')}</b>`;
    // Ordnername als Knopf: Auswahl der Ordner zum Wechseln (Todos, Notizen, Canvas)
    const drop = `<button class="ph-drop" data-act="folder-drop" aria-haspopup="menu" aria-label="Ordner wechseln" title="Ordner wechseln">${title}${ICON.chevD}</button>`;
    // Canvas: zurück zu den Notizen; Titel als Knopf, der die Kategorien zum Wechseln zeigt
    if (isInkView()) {
      // Desktop: Seitenleiste ein-/ausfahren (mehr Platz zum Zeichnen)
      const side = desk ? `<button class="ph-side ${state.inkSideOff ? '' : 'on'}" data-act="ink-side" aria-label="Seitenleiste ${state.inkSideOff ? 'einblenden' : 'ausblenden'}" title="Seitenleiste ${state.inkSideOff ? 'einblenden' : 'ausblenden'}">${ICON.menu}</button>` : '';
      left = side + (inkHead() || `<button class="ph-back" data-act="ink-notes" aria-label="Zurück zu den Notizen" title="Zurück zu den Notizen">${ICON.chevL}</button>
        ${drop}`);
    } else {
      left = `${desk ? '' : `<button class="ph-back" data-act="close-list" aria-label="Zurück zu den Listen">${ICON.chevL}</button>`}${drop}${cnt(n)}`;
    }
  } else {
    left = `<b>${TITLES[tab]}</b>${cnt(pageCount(tab))}`;
  }
  return `<header class="pagehead ${isInkView() ? 'is-ink' : ''}"><div class="ph-in ${tab === 'calendar' ? 'wide' : ''}">${left}${tools}</div></header>`;
}
