// Hauptansicht zeichnen: Kopfleiste, Inhalt, Leiste unten
import { calDay, calTitle, renderCalendar } from './calendar.js';
import { renderCategoryPage } from './categories.js';
import { ctl } from './control.js';
import { $app, catById, cfg, esc, state } from './core.js';
import { addDays, isoWeek, ymd } from './dates.js';
import { folderIc } from './folders.js';
import { renderHome } from './home.js';
import { ICON } from './icons.js';
import { renderMeals } from './meals.js';
import { notesIn, renderNotes } from './notes.js';
import { renderTodos, todosIn } from './todos.js';

// ====================================================================
// Hauptansicht
// ====================================================================

export function render() {
  if (!state.me || !state.loaded) return;
  if (render.hold) { render.pending = true; return; }
  // Eingabe im "Neues Todo"-Feld und Scrollposition bei Live-Updates behalten
  const typedMap = {};
  document.querySelectorAll('.addrow[data-list] input').forEach((i) => { if (i.value) typedMap[i.closest('form').dataset.list] = i.value; });
  const focusedList = document.activeElement?.closest?.('.addrow[data-list]')?.dataset.list;
  const prevScroll = document.querySelector('.main')?.scrollTop || 0;
  const sameTab = render.lastTab === state.tab;
  render.lastTab = state.tab;
  if (!sameTab && !state.keepList) state.list = null;
  state.keepList = false;

  const openTodos = state.items.filter((i) => i.type === 'todo' && !i.done).length;
  const noteCount = state.items.filter((i) => i.type === 'note').length;
  const badge = { home: 0, todos: openTodos, notes: noteCount };

  $app.innerHTML = `
  <div class="app">
    ${state.tab === 'home' ? '' : pageHead(state.tab)}
    <main class="main ${state.tab === 'home' ? 'is-home' : 'has-dock'}">
      ${({ home: renderHome, todos: renderTodos, notes: renderNotes, categories: renderCategoryPage, meals: renderMeals, calendar: renderCalendar })[state.tab]?.() ?? renderHome()}
    </main>
    ${state.tab === 'home' ? '' : `<nav class="dock" aria-label="Aktionen">${dockFor(state.tab)}</nav>`}
  </div>`;
  ctl.show(true, state.tab === 'home' ? 'center' : null);

  if (sameTab) $app.querySelector('.main').scrollTop = prevScroll;
  for (const [k, v] of Object.entries(typedMap)) { const i = document.querySelector(`.addrow[data-list="${k}"] input`); if (i) i.value = v; }
  if (focusedList !== undefined) document.querySelector(`.addrow[data-list="${focusedList}"] input`)?.focus();
}

// ---------- Leiste unten neben dem Steuerknopf (je Bereich andere Knöpfe) ----------
const dockBtn = (act, icon, label, { id = '', primary = false, text = true } = {}) =>
  `<button class="dk ${primary ? 'pri' : ''}" data-act="${act}" ${id !== '' ? `data-id="${esc(id)}"` : ''} aria-label="${esc(label)}">${ICON[icon]}${text ? `<span>${esc(label)}</span>` : ''}</button>`;

function dockFor(tab) {
  if (tab === 'calendar') {
    const v = state.calView;
    return `${dockBtn('cal-move', 'chevL', 'Zurück', { id: '-1', text: false })}
      <div class="seg-view cal-seg">${[['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat']].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-act="cal-view" data-id="${k}"><span>${l}</span></button>`).join('')}</div>
      ${dockBtn('cal-move', 'chevR', 'Weiter', { id: '1', text: false })}`;
  }
  if (tab === 'todos') {
    if (state.list === null) return dockBtn('new-todo', 'plus', 'Neues Todo', { primary: true });
    return `${dockBtn('close-list', 'chevL', 'Listen')}${dockBtn('focus-add', 'plus', 'Todo', { primary: true })}${state.list ? dockBtn('list-edit', 'dots', 'Liste bearbeiten', { id: state.list, text: false }) : ''}`;
  }
  if (tab === 'notes') {
    if (state.list === null) return dockBtn('new-note', 'plus', 'Neue Notiz', { primary: true });
    return `${dockBtn('close-list', 'chevL', 'Ordner')}${dockBtn('new-note-in', 'plus', 'Notiz', { id: state.list, primary: true })}${state.list ? dockBtn('list-edit', 'dots', 'Ordner bearbeiten', { id: state.list, text: false }) : ''}`;
  }
  if (tab === 'meals') {
    return `${dockBtn('week-prev', 'chevL', 'Vorige Woche', { text: false })}<button class="dk wk-now" data-act="week-today"><span>KW ${isoWeek(state.weekStart)}</span></button>${dockBtn('week-next', 'chevR', 'Nächste Woche', { text: false })}${dockBtn('import-plan', 'plus', 'Plan', { primary: true })}`;
  }
  if (tab === 'categories') return dockBtn('new-cat', 'plus', 'Neue Kategorie', { primary: true });
  return '';
}

// ---------- Kopfkachel (hängt am oberen Rand) ----------
function pageHead(tab) {
  const cfg = {
    todos: { title: 'Todos', act: 'new-list', label: 'Neue Liste', count: state.items.filter((i) => i.type === 'todo' && !i.done).length },
    notes: { title: 'Notizen', act: 'new-note', label: 'Neue Notiz', count: state.items.filter((i) => i.type === 'note').length },
    categories: { title: 'Kategorien', act: 'new-cat', label: 'Neue Kategorie', count: state.categories.length },
    meals: { title: 'Gerichte', act: 'import-plan', label: 'Wochenplan einfügen', count: state.items.filter((i) => i.type === 'meal' && i.due_date >= state.weekStart && i.due_date <= addDays(state.weekStart, 6)).length },
    calendar: { title: 'Kalender', act: 'new-event-menu', label: 'Neuer Termin', count: 0 },
  }[tab];
  if (!cfg) return '';
  if (tab === 'calendar') {
    const [t, sub] = calTitle(), isToday = calDay() === ymd(new Date());
    return `<header class="pagehead">
    <div class="ph-in">
      <b class="ph-t cal-pt">${esc(t)}<small>${esc(sub)}</small></b>
      <button class="chip ph-today ${isToday ? 'on' : ''}" data-act="cal-today">Heute</button>
      <button class="cbtn ph-add" data-act="new-event-menu" aria-label="Neuer Termin" title="Neuer Termin">${ICON.plus}</button>
    </div>
  </header>`;
  }
  if ((tab === 'todos' || tab === 'notes') && state.list !== null) {
    const c = catById(state.list);
    const n = tab === 'todos' ? todosIn(state.list).filter((i) => !i.done).length : notesIn(state.list).length;
    return `<header class="pagehead">
    <div class="ph-in">
      <button class="ph-back" data-act="close-list" aria-label="Zurück zu den Listen">${ICON.chevL}</button>
      ${c ? folderIc(c, 'ph-ic') : ''}
      <b class="ph-t">${esc(c ? c.name : tab === 'todos' ? 'Allgemein' : 'Ohne Kategorie')}</b>
      <span class="cnt ${n ? '' : 'zero'}">${n}</span>
    </div>
  </header>`;
  }
  return `<header class="pagehead">
    <div class="ph-in">
      <b>${cfg.title}</b>
      <span class="cnt ${cfg.count ? '' : 'zero'}">${cfg.count}</span>
    </div>
  </header>`;
}
