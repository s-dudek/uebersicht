// Ordner (Kategorien) in Todos und Notizen: Reihenfolge, Symbol, Ablageziele
import {
  catById,
  esc,
  isCatShared,
  isTodoList,
  safeColor,
  sb,
  state,
  toast,
} from './core.js';
import { ICON } from './icons.js';
import { render } from './render.js';

// Todos: zuerst die Ordner (Listen), geöffnet eine Liste groß mit Titeln, Tippen = Details
// Reihenfolge der Ordner: je Person gespeichert (profiles.cat_order), sonst im Browser
const CAT_ORDER_KEY = 'uebersicht-cat-order';

export const catOrder = (kind) => {
  const p = state.profiles[state.me]?.cat_order;
  if (p && Array.isArray(p[kind])) return p[kind];
  try { return JSON.parse(localStorage.getItem(CAT_ORDER_KEY))?.[kind] || []; } catch { return []; }
};

const orderCats = (list, kind) => {
  const o = catOrder(kind);
  const idx = (c) => { const k = o.indexOf(c.id); return k < 0 ? 1e6 : k; };
  return [...list].sort((a, b) => idx(a) - idx(b) || a.name.localeCompare(b.name, 'de'));
};

export async function saveCatOrder(kind, ids) {
  const me = state.profiles[state.me] || (state.profiles[state.me] = { id: state.me });
  const all = { ...(me.cat_order || {}) };
  try { const ls = JSON.parse(localStorage.getItem(CAT_ORDER_KEY)) || {}; ls[kind] = ids; localStorage.setItem(CAT_ORDER_KEY, JSON.stringify(ls)); } catch {}
  all[kind] = ids;
  me.cat_order = all;
  render();
  const { error } = await sb.from('profiles').update({ cat_order: all }).eq('id', state.me);
  if (error && !/cat_order/.test(error.message)) toast('Reihenfolge nicht gespeichert: ' + error.message, 4000);
}

export const todoLists = () => [
  ...orderCats(state.categories.filter(isTodoList), 'todos').map((c) => ({ id: c.id, name: c.name, color: c.color, shared: isCatShared(c) })),
  { id: '', name: 'Allgemein', color: null, shared: false },
];

// Geöffneter Ordner: Inhalt, beim Ziehen erscheinen unten die anderen Ordner als Ablageziele
// (den Ordner wechselt man oben über den Titel, folderDrop)
export function listLayout(folders, current, body) {
  return `${body}${dropTray(folders, current)}`;
}

function dropTray(folders, current) {
  const others = folders.filter((f) => f.id !== current);
  if (!others.length) return '';
  return `<div class="droptray" aria-hidden="true">
    <div class="dt-h">Verschieben nach …</div>
    <div class="dt-list">${others.map((f) => `<div class="dt" data-drop="${f.id}">${folderIc(f, 'dt-ic')}<span>${esc(f.name)}</span></div>`).join('')}</div>
  </div>`;
}

// Notizen: wie Todos – Ordner-Übersicht, geöffnet groß mit Titeln, Tippen = Notiz
// Notiz-Ordner: getrennt von den Todo-Listen; eine Liste erscheint nur hier, wenn Notizen darin liegen
const isNoteFolder = (c) => !isTodoList(c) || state.items.some((i) => i.type === 'note' && i.category_id === c.id);
export const noteFolders = () => [
  ...orderCats(state.categories.filter(isNoteFolder), 'notes').map((c) => ({ id: c.id, name: c.name, color: c.color, shared: isCatShared(c) })),
  { id: '', name: 'Ohne Kategorie', color: null, shared: false },
];

// Vorgefertigte Symbole für Notizen und Todos
// Ordner-Symbol: eigenes Symbol der Kategorie in ihrer Farbe, sonst Ordner
// Kategorie-Symbol (ohne gewähltes Symbol: Etikett); "Allgemein"/"Ohne Kategorie" bekommen eigene
export const catSym = (c) => (c?.icon && ICON[c.icon] ? ICON[c.icon] : ICON.tag);

export const folderIc = (f, cls = 'fc-ic') => {
  const c = f.id ? catById(f.id) : null;
  const sym = c ? catSym(c) : state.tab === 'todos' ? ICON.todos : ICON.notes;
  return `<span class="${cls} sym" style="--fc:${safeColor(f.color, '#6E8582')}">${sym}</span>`;
};

// Farbe eines Eintrags (meta.color)
export const itemTint = (i) => (i.meta?.color ? ` style="--ic:${safeColor(i.meta.color)}"` : '');
