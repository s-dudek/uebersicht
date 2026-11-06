// Startseite (Smartphone/Tablet): Kacheln wie Widgets am iPhone – Kalender, Todos, Notizen, Gerichte, Training
// und alles, was „Zu Home hinzugefügt“ wurde (Kategorien, Notizen, Todos; pins.js).
// Reihenfolge und Größe je Person (profiles.cat_order: 'tiles' und 'tilesz' = ["todos:s", "c:<id>:m", …]).
// Langes Drücken: Menü mit Größe und „Home-Bildschirm bearbeiten“ (menu.js), weiterziehen = verschieben (drag.js).
// Im Bearbeiten-Modus wackeln die Kacheln, lassen sich sofort ziehen und haben einen Knopf für die Größe.
import { catById, esc, isTodoList, safeColor, state, store } from './core.js';
import { catOrder, catSym, saveCatOrder } from './folders.js';
import { ICON } from './icons.js';
import { mealsOn } from './meals.js';
import { pinned } from './pins.js';
import { render } from './render.js';

export const SIZES = [['s', 'Klein', 'szS'], ['m', 'Mittel', 'szM'], ['l', 'Groß', 'szL']];
const byNewest = (a, b) => b.updated_at.localeCompare(a.updated_at);
const titles = (list) => list.map((i) => i.title || 'Ohne Titel');

// alle Kacheln: { key, label, icon, color, size, act, lines, empty, badge, ink (Canvas-Ordner oder 'last') }
function allTiles(today) {
  const todos = () => state.items.filter((i) => i.type === 'todo' && !i.done);
  const base = [
    { key: 'cal', label: 'Kalender', size: 'l', act: `data-act="home-cal" data-id="${today}"` },
    { key: 'todos', label: 'Todos', icon: ICON.todos, size: 's', act: 'data-act="nav" data-id="todos"', lines: () => titles(todos()), empty: 'Alles erledigt', badge: true },
    { key: 'notes', label: 'Notizen', icon: ICON.notes, size: 's', act: 'data-act="nav" data-id="notes"', ink: 'last',
      lines: () => titles(state.items.filter((i) => i.type === 'note').sort(byNewest)), empty: 'Noch keine Notizen', badge: true },
    { key: 'meals', label: 'Gerichte', icon: ICON.pot, size: 'm', act: 'data-act="nav" data-id="meals"', lines: () => mealsOn(today).map((m) => m.title), empty: 'Heute nichts geplant' },
    { key: 'training', label: 'Training', icon: ICON.dumbbell, size: 's', act: 'data-act="nav" data-id="training"',
      lines: () => titles(state.items.filter((i) => i.type === 'training' && i.due_date === today)), empty: 'Heute frei' },
  ];
  const pins = pinned().map(({ key, type, obj }) => {
    if (type === 'cat') {
      const list = isTodoList(obj);
      const inside = state.items.filter((i) => i.category_id === obj.id && (list ? i.type === 'todo' && !i.done : i.type === 'note'));
      return { key, label: obj.name, icon: catSym(obj), color: obj.color, size: 'm', act: `data-act="pin-open" data-id="${obj.id}"`,
        lines: () => titles(inside.sort(byNewest)), empty: list ? 'Alles erledigt' : 'Leer', badge: true, ink: list ? null : obj.id };
    }
    const i = obj;
    return { key, label: i.type === 'note' ? i.title || 'Notiz' : 'Todo', icon: i.type === 'note' ? ICON.notes : ICON.todos, size: 's', act: `data-act="open" data-id="${i.id}"`,
      lines: () => (i.type === 'note' ? String(i.body || '').split('\n').filter(Boolean) : [i.title || 'Ohne Titel']), empty: i.type === 'note' ? 'Kein Text' : '' };
  });
  return [...base, ...pins];
}

const ordered = (tiles) => {
  const saved = catOrder('tiles').map((k) => tiles.find((t) => t.key === k)).filter(Boolean);
  return [...saved, ...tiles.filter((t) => !saved.includes(t))];
};
export const tileSize = (key, fallback = 's') => {
  const s = catOrder('tilesz').find((x) => x.startsWith(key + ':') && !x.slice(key.length + 1).includes(':'))?.slice(key.length + 1);
  return SIZES.some(([k]) => k === s) ? s : fallback;
};
export function setTileSize(key, size) {
  saveCatOrder('tilesz', [...catOrder('tilesz').filter((x) => !(x.startsWith(key + ':') && !x.slice(key.length + 1).includes(':'))), `${key}:${size}`]);
}
export function setHomeEdit(on) { state.homeEdit = on; render(); }
export const isPinTile = (key) => /^[ci]:/.test(key);

// Inhalt je Kachel und Größe: klein nur Symbol und Name, größer mit Vorschau
function body(t, size, d) {
  if (t.key === 'cal') {
    if (size === 's') return `<small>${d.toLocaleDateString('de-AT', { weekday: 'short' })}</small><b>${d.getDate()}</b>`;
    return `<small>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</small><b>${d.getDate()}</b><span>${d.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</span>`;
  }
  const lines = t.lines();
  const badge = t.badge && lines.length ? `<i>${lines.length}</i>` : '';
  const preview = size === 's' ? '' : `<ul class="mt-list">${(lines.length ? lines : [t.empty]).slice(0, size === 'l' ? 5 : 1).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const icon = `<span class="mt-ic"${t.color ? ` style="color:${safeColor(t.color)}"` : ''}>${t.icon}</span>`;
  return `${badge}<span class="mt-h">${icon}<span>${esc(t.label)}</span></span>${preview}`;
}

export function renderTiles(today, d) {
  const edit = !!state.homeEdit;
  const tile = (t) => {
    const size = tileSize(t.key, t.size);
    // Notizen bzw. Notiz-Ordner: Knopf direkt in den Canvas
    const ink = !edit && t.ink != null ? `<button class="mt-ink" data-act="home-canvas" data-id="${esc(t.ink)}" aria-label="Canvas öffnen" title="Canvas">${ICON.ink}</button>` : '';
    return `<div class="mt mt-${isPinTile(t.key) ? 'pin' : t.key} sz-${size}" role="button" tabindex="0" aria-label="${esc(t.label)}" data-tile="${esc(t.key)}" data-cdrag="${esc(t.key)}" ${edit ? '' : t.act}>
      ${body(t, size, d)}${ink}
      ${edit ? `<button class="mt-size" data-act="tile-size" data-id="${esc(t.key)}" aria-label="Größe ändern">${ICON[SIZES.find(([k]) => k === size)[2]]}</button>` : ''}</div>`;
  };
  return `<div class="mtiles ${edit ? 'editing' : ''}" data-cgrid="tiles">${ordered(allTiles(today)).map(tile).join('')}</div>
    ${edit ? '<p class="hint mt-hint">Kacheln ziehen zum Verschieben, Knopf in der Ecke tippen für die Größe.</p>'
      : '<p class="hint mt-hint">Kachel lange drücken: Größe, Verschieben, Bearbeiten. Am Computer per Rechtsklick weitere Kacheln „Zu Home hinzufügen“.</p>'}`;
}

// Canvas eines Notiz-Ordners öffnen ('last' = zuletzt benutzter)
function openCanvas(id) {
  const last = store('inkFolder') ?? '';
  const fid = id === 'last' ? (last === '' || catById(last) ? last : '') : id;
  Object.assign(state, { tab: 'notes', list: fid, noteMode: 'ink', keepList: true });
  render();
}

export function tileAction(act, id) {
  if (act === 'tile-size') {
    const t = allTiles('').find((x) => x.key === id);
    const i = SIZES.findIndex(([k]) => k === tileSize(id, t?.size));
    return setTileSize(id, SIZES[(i + 1) % SIZES.length][0]);
  }
  if (act === 'home-edit') return setHomeEdit(!state.homeEdit);
  if (act === 'home-canvas') return openCanvas(id);
}

// Standardgröße einer Kachel (für das Menü)
export const defaultSize = (key) => allTiles('').find((t) => t.key === key)?.size || 's';
