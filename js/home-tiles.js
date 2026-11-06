// Startseite (Smartphone/Tablet): Kacheln wie Widgets am iPhone – Kalender, Todos, Notizen, Gerichte, Training.
// Reihenfolge und Größe je Person (profiles.cat_order: 'tiles' und 'tilesz' = ["todos:s", …]).
// Langes Drücken: Menü mit Größe und „Home-Bildschirm bearbeiten“ (menu.js), weiterziehen = verschieben (drag.js).
// Im Bearbeiten-Modus wackeln die Kacheln, lassen sich sofort ziehen und haben einen Knopf für die Größe.
import { esc, state } from './core.js';
import { catOrder, saveCatOrder } from './folders.js';
import { ICON } from './icons.js';
import { mealsOn } from './meals.js';
import { render } from './render.js';

const TILES = {
  cal: { label: 'Kalender', size: 'l' },
  todos: { label: 'Todos', icon: 'todos', size: 's' },
  notes: { label: 'Notizen', icon: 'notes', size: 's' },
  meals: { label: 'Gerichte', icon: 'pot', size: 'm' },
  training: { label: 'Training', icon: 'dumbbell', size: 's' },
};
export const SIZES = [['s', 'Klein', 'szS'], ['m', 'Mittel', 'szM'], ['l', 'Groß', 'szL']];

const order = () => {
  const saved = catOrder('tiles').filter((k) => TILES[k]);
  return [...saved, ...Object.keys(TILES).filter((k) => !saved.includes(k))];
};
export const tileSize = (key) => {
  const s = catOrder('tilesz').find((x) => x.startsWith(key + ':'))?.slice(key.length + 1);
  return SIZES.some(([k]) => k === s) ? s : TILES[key].size;
};
export function setTileSize(key, size) {
  saveCatOrder('tilesz', [...catOrder('tilesz').filter((x) => !x.startsWith(key + ':')), `${key}:${size}`]);
}
export function setHomeEdit(on) { state.homeEdit = on; render(); }

// Inhalt je Kachel und Größe: klein nur Symbol und Name, größer mit Vorschau
function body(key, size, today, d) {
  if (key === 'cal') {
    if (size === 's') return `<small>${d.toLocaleDateString('de-AT', { weekday: 'short' })}</small><b>${d.getDate()}</b>`;
    return `<small>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</small><b>${d.getDate()}</b><span>${d.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</span>`;
  }
  const t = TILES[key];
  const lines = {
    todos: () => state.items.filter((i) => i.type === 'todo' && !i.done).map((i) => i.title || 'Ohne Titel'),
    notes: () => state.items.filter((i) => i.type === 'note').sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((i) => i.title || 'Ohne Titel'),
    meals: () => mealsOn(today).map((m) => m.title),
    training: () => state.items.filter((i) => i.type === 'training' && i.due_date === today).map((i) => i.title || 'Training'),
  }[key]();
  const badge = (key === 'todos' || key === 'notes') && lines.length ? `<i>${lines.length}</i>` : '';
  const empty = { todos: 'Alles erledigt', notes: 'Noch keine Notizen', meals: 'Heute nichts geplant', training: 'Heute frei' }[key];
  const preview = size === 's' ? '' : `<ul class="mt-list">${(lines.length ? lines : [empty]).slice(0, size === 'l' ? 5 : 1).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `${badge}<span class="mt-h">${ICON[t.icon]}<span>${t.label}</span></span>${preview}`;
}

export function renderTiles(today, d) {
  const edit = !!state.homeEdit;
  const tile = (key) => {
    const size = tileSize(key);
    const act = edit ? '' : key === 'cal' ? `data-act="home-cal" data-id="${today}"` : `data-act="nav" data-id="${key}"`;
    return `<div class="mt mt-${key} sz-${size}" role="button" tabindex="0" aria-label="${TILES[key].label}" data-tile="${key}" data-cdrag="${key}" ${act}>
      ${body(key, size, today, d)}
      ${edit ? `<button class="mt-size" data-act="tile-size" data-id="${key}" aria-label="Größe ändern">${ICON[SIZES.find(([k]) => k === size)[2]]}</button>` : ''}</div>`;
  };
  return `<div class="mtiles ${edit ? 'editing' : ''}" data-cgrid="tiles">${order().map(tile).join('')}</div>
    ${edit ? '<p class="hint mt-hint">Kacheln ziehen zum Verschieben, Knopf in der Ecke tippen für die Größe.</p>' : ''}`;
}

// Bearbeiten-Modus: Größe reihum wechseln; Fertig beendet
export function tileAction(act, id) {
  if (act === 'tile-size') { const i = SIZES.findIndex(([k]) => k === tileSize(id)); return setTileSize(id, SIZES[(i + 1) % SIZES.length][0]); }
  if (act === 'home-edit') return setHomeEdit(!state.homeEdit);
}
