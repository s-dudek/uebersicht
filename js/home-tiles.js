// Startseite: Kacheln wie Widgets am iPhone – Datum, Kalender (Termine), Todos, Notizen, Gerichte, Training
// und alles, was „Zu Home hinzugefügt“ wurde (Kategorien, Notizen, Todos; pins.js).
// Am Desktop größer und mit mehr Inhalt (Kalender groß: Tag als Zeitleiste, Todos zum Abhaken).
// Reihenfolge und Größe je Person, getrennt für Desktop (profiles.cat_order: 'tiles'/'tilesz', Desktop 'tilesD'/'tileszD'; Größen als "todos:s").
// Langes Drücken: Menü mit Größe und „Home-Bildschirm bearbeiten“ (menu.js), weiterziehen = verschieben (drag.js).
// Im Bearbeiten-Modus wackeln die Kacheln, lassen sich sofort ziehen und haben einen Knopf für die Größe.
import { dayContent, hm } from './calendar.js';
import { catById, esc, isDesktop, isTodoList, safeColor, state, store } from './core.js';
import { catOrder, catSym, saveCatOrder } from './folders.js';
import { ICON } from './icons.js';
import { calDayBody } from './home.js';
import { SLOTS, mealsOn } from './meals.js';
import { pinned } from './pins.js';
import { render } from './render.js';

export const SIZES = [['s', 'Klein', 'szS'], ['m', 'Mittel', 'szM'], ['l', 'Groß', 'szL']];
const kind = (k) => k + (isDesktop() ? 'D' : '');   // eigenes Layout am Desktop
const byNewest = (a, b) => b.updated_at.localeCompare(a.updated_at);
const titles = (list) => list.map((i) => i.title || 'Ohne Titel');
const checks = (list) => list.map((i) => ({ id: i.id, text: i.title || 'Ohne Titel' }));   // Todos: zum Abhaken
const slotName = (m) => SLOTS.find(([k]) => k === m.meta?.slot)?.[1];

// alle Kacheln: { key, label, icon, color, size, act, lines, empty, badge, ink (Canvas-Ordner oder 'last') }
function allTiles(today) {
  const todos = () => state.items.filter((i) => i.type === 'todo' && !i.done);
  const base = [
    { key: 'date', label: 'Datum', size: 'l', desk: 's', act: `data-act="home-cal" data-id="${today}"` },
    { key: 'cal', label: 'Kalender', icon: ICON.calendar, size: 'm', desk: 'l', act: `data-act="home-cal" data-id="${state.homeDay || today}"`,
      lines: () => calRows(today), empty: 'Heute nichts eingetragen', badge: true },
    { key: 'todos', label: 'Todos', icon: ICON.todos, size: 's', desk: 'm', act: 'data-act="nav" data-id="todos"', lines: () => checks(todos()), empty: 'Alles erledigt', badge: true },
    { key: 'notes', label: 'Notizen', icon: ICON.notes, size: 's', desk: 'm', act: 'data-act="nav" data-id="notes"', ink: 'last',
      lines: () => titles(state.items.filter((i) => i.type === 'note').sort(byNewest)), empty: 'Noch keine Notizen', badge: true },
    { key: 'meals', label: 'Gerichte', icon: ICON.pot, size: 'm', act: 'data-act="nav" data-id="meals"',
      lines: () => mealsOn(today).map((m) => (slotName(m) ? `${slotName(m)}: ${m.title}` : m.title)), empty: 'Heute nichts geplant' },
    { key: 'training', label: 'Training', icon: ICON.dumbbell, size: 's', act: 'data-act="nav" data-id="training"',
      lines: () => titles(state.items.filter((i) => i.type === 'training' && i.due_date === today)), empty: 'Heute frei' },
  ];
  const pins = pinned().map(({ key, type, obj }) => {
    if (type === 'cat') {
      const list = isTodoList(obj);
      const inside = state.items.filter((i) => i.category_id === obj.id && (list ? i.type === 'todo' && !i.done : i.type === 'note'));
      return { key, label: obj.name, icon: catSym(obj), color: obj.color, size: 'm', act: obj.canvas_only ? `data-act="home-canvas" data-id="${obj.id}"` : `data-act="pin-open" data-id="${obj.id}"`,
        lines: () => (list ? checks : titles)(inside.sort(byNewest)), empty: list ? 'Alles erledigt' : 'Leer', badge: !obj.canvas_only, ink: list || obj.canvas_only ? null : obj.id };
    }
    const i = obj;
    return { key, label: i.type === 'note' ? i.title || 'Notiz' : 'Todo', icon: i.type === 'note' ? ICON.notes : ICON.todos, size: 's', act: `data-act="open" data-id="${i.id}"`,
      lines: () => (i.type === 'note' ? String(i.body || '').split('\n').filter(Boolean) : checks([i])), empty: i.type === 'note' ? 'Kein Text' : '' };
  });
  // Standardgröße: am Desktop teils größer (mehr Platz für Inhalt)
  return [...base, ...pins].map((t) => ({ ...t, size: isDesktop() && t.desk ? t.desk : t.size }));
}

// gespeicherte Reihenfolge; neue Kacheln an ihrer Standardstelle einfügen (z. B. „Datum“ vorne)
const ordered = (tiles) => {
  const list = catOrder(kind('tiles')).map((k) => tiles.find((t) => t.key === k)).filter(Boolean);
  tiles.forEach((t, i) => { if (!list.includes(t)) list.splice(Math.min(i, list.length), 0, t); });
  return list;
};
export const tileSize = (key, fallback = 's') => {
  const s = catOrder(kind('tilesz')).find((x) => x.startsWith(key + ':') && !x.slice(key.length + 1).includes(':'))?.slice(key.length + 1);
  return SIZES.some(([k]) => k === s) ? s : fallback;
};
export function setTileSize(key, size) {
  saveCatOrder(kind('tilesz'), [...catOrder(kind('tilesz')).filter((x) => !(x.startsWith(key + ':') && !x.slice(key.length + 1).includes(':'))), `${key}:${size}`]);
}
export function setHomeEdit(on) { state.homeEdit = on; render(); }
export const isPinTile = (key) => /^[ci]:/.test(key);

// Zeilen der Vorschau: schmal Mittel 1 / Groß 5, Desktop Mittel 5 / Groß 10 (zweispaltig)
const previewRows = (size) => (size === 's' ? 0 : isDesktop() ? (size === 'l' ? 10 : 5) : size === 'l' ? 5 : 1);
const line = (x) => (typeof x === 'object'
  ? `<li class="mt-todo"><button class="tcheck" data-act="toggle" data-id="${x.id}" aria-label="Erledigt"></button><span>${esc(x.text)}</span></li>`
  : `<li>${esc(x)}</li>`);

// Kalender: Datum; am Desktop Mittel zusätzlich die Termine des Tages, Groß der Tag als Zeitleiste
// Datum: Wochentag und Tag groß (dunkel)
function dateBody(size, d) {
  if (size === 's' && !isDesktop()) return `<small>${d.toLocaleDateString('de-AT', { weekday: 'short' })}</small><b>${d.getDate()}</b>`;
  return `<small>${d.toLocaleDateString('de-AT', { weekday: 'long' })}</small><b>${d.getDate()}</b><span>${d.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</span>`;
}

// Termine des Tages als Zeilen (nur die für die Startseite eingeschalteten Abschnitte)
function calRows(today) {
  const { timed, allday } = dayContent(today, 'home');
  return [...allday.map((a) => `ganztägig · ${a.label}`), ...timed.map((t) => `${hm(t.start)} · ${t.label}`)];
}

// Inhalt je Kachel und Größe: klein nur Symbol und Name, größer mit Vorschau
function body(t, size, today, d) {
  if (t.key === 'date') return dateBody(size, d);
  if (t.key === 'cal' && size === 'l' && isDesktop()) return calDayBody(today);   // Desktop groß: Tag als Zeitleiste
  const lines = t.lines(), n = previewRows(size);
  const badge = t.badge && lines.length ? `<i>${lines.length}</i>` : '';
  const preview = n ? `<ul class="mt-list">${(lines.length ? lines : [t.empty]).slice(0, n).map(line).join('')}</ul>` : '';
  const icon = `<span class="mt-ic"${t.color ? ` style="color:${safeColor(t.color)}"` : ''}>${t.icon}</span>`;
  return `${badge}<span class="mt-h">${icon}<span>${esc(t.label)}</span></span>${preview}`;
}

export function renderTiles(today, d) {
  const edit = !!state.homeEdit;
  const tile = (t) => {
    const size = tileSize(t.key, t.size), wide = t.key === 'cal' && size === 'l' && isDesktop();
    // Notizen bzw. Notiz-Ordner: Knopf direkt in den Canvas
    const ink = !edit && t.ink != null ? `<button class="mt-ink" data-act="home-canvas" data-id="${esc(t.ink)}" aria-label="Canvas öffnen" title="Canvas">${ICON.ink}</button>` : '';
    return `<div class="mt mt-${isPinTile(t.key) ? 'pin' : t.key} sz-${size} ${wide ? 'mt-day dash-day' : ''}" role="button" tabindex="0" aria-label="${esc(t.label)}" data-tile="${esc(t.key)}" data-cdrag="${esc(t.key)}" ${edit ? '' : t.act}>
      ${body(t, size, today, d)}${ink}
      ${edit ? `<button class="mt-size" data-act="tile-size" data-id="${esc(t.key)}" aria-label="Größe ändern">${ICON[SIZES.find(([k]) => k === size)[2]]}</button>` : ''}</div>`;
  };
  return `<div class="mtiles ${edit ? 'editing' : ''}" data-cgrid="${kind('tiles')}">${ordered(allTiles(today)).map(tile).join('')}</div>`;
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
