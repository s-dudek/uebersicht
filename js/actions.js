// Tippen und Absenden in der Hauptansicht
import { calAction, calMove, scrollCal } from './calendar.js';
import { openCategory, openNewList } from './categories.js';
import { $app, catById, isTodoList, sb, state, store, toast } from './core.js';
import { createNote, createTodo, toggleTodo } from './data.js';
import { addDays, mondayOf, ymd } from './dates.js';
import { createEvent, openNewEventMenu } from './events.js';
import { openGroupEdit } from './groups.js';
import { homeAction } from './home.js';
import { tileAction } from './home-tiles.js';
import { noteSelAction } from './note-select.js';
import { openItem } from './items.js';
import { navigate } from './nav.js';
import { togglePin } from './pins.js';
import { importPlan, shopCat } from './meals.js';
import { openPlanImport } from './plan-import.js';
import { openCatalog } from './training.js';
import { backToCanvas, inkAction } from './ink.js';
import { remindAction } from './remind-page.js';
import { openFolderDrop } from './menu.js';
import { render } from './render.js';

export function initActions() {
  // Klicks in der Hauptansicht
  $app.addEventListener('click', async (e) => {
    const hb = e.target.closest('[data-home]');
    if (hb) return homeAction(hb.dataset.home);
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'toggle': toggleTodo(id); break;
      case 'nav': navigate(id); break;
      case 'unpin': togglePin(id); break;
      case 'pin-open': { const c = catById(id); if (!c) break; state.tab = isTodoList(c) ? 'todos' : 'notes'; state.list = id; state.keepList = true; render(); break; }
      case 'group-edit': openGroupEdit(id, t.dataset.f, t.dataset.t || 'note'); break;
      case 'new-event': createEvent(id); break;
      case 'new-todo': createTodo(); break;
      case 'focus-add': { const inp = document.querySelector('.tadd input'); if (inp) { document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' }); inp.focus(); } break; }
      case 'cal-view': state.calView = id; store('calView', id); render(); scrollCal(); break;
      case 'cal-today': state.calDate = ymd(new Date()); render(); scrollCal(); break;
      case 'cal-goto': if (state.calView === 'month' && state.calDate !== id) { state.calDate = id; render(); } else { state.calDate = id; state.calView = 'day'; store('calView', 'day'); render(); scrollCal(); } break;
      case 'cal-move': calMove(+id); break;
      case 'home-day': state.homeDay = +id ? addDays(state.homeDay || ymd(new Date()), +id) : null; render(); break;
      case 'home-cal': state.calDate = id; navigate('calendar'); break;
      case 'ink-side': state.inkSideOff = !state.inkSideOff; store('inkSideOff', state.inkSideOff ? '1' : ''); render(); break;
      case 'tile-size': case 'home-edit': case 'home-canvas': tileAction(t.dataset.act, id); break;
      case 'note-sel': case 'note-pick': case 'note-sel-all': case 'note-sel-done': case 'note-sel-move': case 'note-sel-del': noteSelAction(t.dataset.act, id); break;
      case 'cal-allday': state.calAllOpen = !state.calAllOpen; render(); break;
      case 'new-event-menu': openNewEventMenu(); break;
      case 'cal-sources': case 'cal-toggle': case 'cal-link': case 'cal-unlink': case 'ext-ev': case 'g-connect': case 'g-disconnect': case 'cal-sync': calAction(t.dataset.act, id, t); break;
      case 'folder-drop': openFolderDrop(t); break;
      case 'open-list': state.list = id || ''; state.noteMode = 'text'; render(); document.querySelector('.main')?.scrollTo({ top: 0 }); break;
      case 'close-list': state.list = null; render(); break;
      case 'open': openItem(id); break;
      case 'toggle-done': state.doneOpen.has(id || '') ? state.doneOpen.delete(id || '') : state.doneOpen.add(id || ''); render(); break;
      case 'new-list': openNewList(); break;
      case 'new-cat': openNewList({ folder: true }); break;
      case 'import-plan': openPlanImport(); break;
      case 'training-catalog': openCatalog(); break;
      case 'week-prev': state.weekStart = addDays(state.weekStart, -7); render(); break;
      case 'week-next': state.weekStart = addDays(state.weekStart, 7); render(); break;
      case 'week-today': state.weekStart = mondayOf(new Date()); render(); break;
      case 'goto-shop': state.tab = 'todos'; state.keepList = true; state.list = shopCat()?.id ?? null; render(); break;
      case 'demo-plan': importPlan(window.__DEMO_PLAN()).then((r) => { render(); toast(`${r.meals} Gerichte und ${r.added} Einkäufe übernommen`); }); break;
      case 'fold': state.folded.has(id) ? state.folded.delete(id) : state.folded.add(id); render(); break;
      case 'new-note-in': createNote(id || null); break;
      case 'list-edit': openCategory(id); break;
      case 'new-note': createNote(); break;
      case 'note-mode': state.noteMode = id === 'ink' ? 'ink' : 'text'; render(); break;
      case 'rem-quick': case 'rem-open': remindAction(t.dataset.act, id, t); break;
      case 'back-canvas': backToCanvas(); break;
      default: if (t.dataset.act.startsWith('ink-')) inkAction(t.dataset.act, id, t);
    }
  });

  // Erinnerungen: Zeit selbst gewählt bzw. Eingabe mit Enter (= in einer Stunde)
  $app.addEventListener('change', (e) => { if (e.target.id === 'rm-at') remindAction('rem-at', null, e.target); });
  $app.addEventListener('submit', async (e) => {
    if (e.target.id === 'rm-form') { e.preventDefault(); return remindAction('rem-quick', 'h1'); }
    const form = e.target.closest('.addrow[data-list]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    const category_id = form.dataset.list || null;
    const { data, error } = await sb.from('items').insert({ type: 'todo', title, category_id }).select().single();
    if (error) { toast('Fehler: ' + error.message); input.value = title; return; }
    state.items.unshift(data);
    render();
    document.querySelector(`.addrow[data-list="${form.dataset.list}"] input`)?.focus();
  });
}
