// Rechtsklick-Menü (Maus): Funktionen für Einträge und Ordner
import { deleteCategory, leaveCategory, openCategory } from './categories.js';
import { $app, COLORS, canDeleteItem, catById, esc, itemById, safeColor, state } from './core.js';
import { deleteItem, saveItem, toggleTodo } from './data.js';
import { noteFolders, saveCatOrder, todoLists } from './folders.js';
import { ICON } from './icons.js';
import { openItem } from './items.js';
import { SIZES, setHomeEdit, setTileSize, tileSize } from './home-tiles.js';
import { isPinned, pinKey, togglePin } from './pins.js';
import { render } from './render.js';

let menuEl = null;

export function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

// Einträge des Menüs: [Symbol, Beschriftung, Aktion, { danger, on }] oder 'sep' oder HTML-Baustein
function itemMenu(i) {
  const entries = [['eye', 'Öffnen', () => openItem(i.id)]];
  if (i.type === 'note') entries.push(['pen', 'Bearbeiten', () => openItem(i.id, { edit: true })]);
  if (i.type === 'todo') entries.push(['check', i.done ? 'Wieder öffnen' : 'Erledigt', () => toggleTodo(i.id)]);
  if (i.type === 'todo' || i.type === 'note') {
    entries.push('sep', { colors: i });
    const folders = i.type === 'todo' ? todoLists() : noteFolders();
    const cur = i.category_id && catById(i.category_id) ? i.category_id : '';
    entries.push({ move: folders.map((f) => [f, f.id === cur]) });
  }
  entries.push('sep', pinEntry(pinKey.item(i.id)));
  if (canDeleteItem(i)) entries.push(['trash', 'Löschen', () => deleteItem(i.id), { danger: true }]);
  return entries;
}

const pinEntry = (key) => (isPinned(key) ? ['home', 'Von Home entfernen', () => togglePin(key)] : ['home', 'Zu Home hinzufügen', () => togglePin(key)]);

function folderMenu(c) {
  const entries = [['eye', 'Öffnen', () => { state.list = c.id; render(); }]];
  entries.push(['pen', 'Bearbeiten', () => openCategory(c.id)]);
  entries.push('sep', pinEntry(pinKey.cat(c.id)));
  entries.push(c.owner_id === state.me
    ? ['trash', 'Löschen', () => deleteCategory(c.id), { danger: true }]
    : ['trash', 'Verlassen', () => leaveCategory(c.id), { danger: true }]);
  return entries;
}

// Reihenfolge in einer Kachel-Übersicht (Ordner, Pinnwand) ändern – Alternative zum Ziehen
function orderEntry(el) {
  const grid = el?.closest('[data-cgrid]');
  if (!grid) return null;
  const key = el.dataset.cdrag, ids = [...grid.querySelectorAll('[data-cdrag]')].map((x) => x.dataset.cdrag), k = ids.indexOf(key);
  const to = (n) => () => { const rest = ids.filter((x) => x !== key); rest.splice(n, 0, key); saveCatOrder(grid.dataset.cgrid, rest); };
  const order = [['Ganz nach vorne', to(0), k > 0], ['Eine Stelle nach vorne', to(k - 1), k > 0],
    ['Eine Stelle nach hinten', to(k + 1), k < ids.length - 1], ['Ganz nach hinten', to(ids.length - 1), k < ids.length - 1]].filter((o) => o[2]);
  return order.length ? { order } : null;
}

// Menü zu einem Element (Eintrag, Ordner-Karte oder Karte der Pinnwand) – Rechtsklick oder langes Drücken
export function openMenuFor(target, x, y) {
  // Kachel der Startseite (wie Widget am iPhone): Größe und Bearbeiten; im Bearbeiten-Modus gleich ziehen
  const tileEl = target.closest('[data-tile]');
  if (tileEl) {
    if (tileEl.closest('.editing')) return false;
    const key = tileEl.dataset.tile, cur = tileSize(key);
    const entries = [...SIZES.map(([k, label, icon]) => [icon, label, () => setTileSize(key, k), { on: k === cur }]), 'sep',
      ['pen', 'Home-Bildschirm bearbeiten', () => setHomeEdit(true)]];
    const order = orderEntry(tileEl);
    if (order) entries.splice(entries.indexOf('sep'), 0, order);
    showMenu(x, y, entries, null);
    return true;
  }
  const itemEl = target.closest('[data-drag], [data-act="open"][data-id]');
  const folderEl = target.closest('.fcard[data-cdrag], .fcol-i[data-id]');
  const pinEl = target.closest('[data-pin]');
  let i = itemEl && itemById(itemEl.dataset.drag || itemEl.dataset.id);
  let c = !i && folderEl && catById(folderEl.dataset.cdrag || folderEl.dataset.id);
  if (!i && !c && pinEl) {
    const key = pinEl.dataset.pin;
    if (key.startsWith('i:')) i = itemById(key.slice(2)); else c = catById(key.slice(2));
  }
  if (!c && !i) return false;
  const entries = c ? folderMenu(c) : itemMenu(i);
  const order = orderEntry(target.closest('[data-cgrid] [data-cdrag]'));
  if (order) entries.splice(entries.indexOf('sep'), 0, order);
  showMenu(x, y, entries, i || null);
  return true;
}

function showMenu(x, y, entries, item) {
  closeMenu();
  const actions = [];
  const html = entries.map((e) => {
    if (e === 'sep') return '<hr>';
    if (e.colors) {
      return `<div class="cm-colors" role="group" aria-label="Farbe">
        <button class="cm-color none ${!e.colors.meta?.color ? 'on' : ''}" data-col="" aria-label="Keine Farbe"></button>
        ${COLORS.map((c) => `<button class="cm-color ${e.colors.meta?.color === c ? 'on' : ''}" data-col="${c}" style="background:${safeColor(c)}" aria-label="Farbe"></button>`).join('')}
      </div>`;
    }
    if (e.order) {
      const subs = e.order.map(([label, fn]) => { actions.push(fn); return `<button class="cm-i" data-i="${actions.length - 1}"><span>${esc(label)}</span></button>`; }).join('');
      return `<button class="cm-i" data-sub>${ICON.move}<span>Verschieben</span>${ICON.chevR}</button><div class="cm-sub" hidden>${subs}</div>`;
    }
    if (e.move) {
      return `<button class="cm-i" data-sub>${ICON.move}<span>Verschieben nach</span>${ICON.chevR}</button>
        <div class="cm-sub" hidden>${e.move.map(([f, on]) => `<button class="cm-i ${on ? 'on' : ''}" data-move="${esc(f.id)}"><span>${esc(f.name)}</span>${on ? ICON.check : ''}</button>`).join('')}</div>`;
    }
    const [icon, label, fn, opt = {}] = e;
    actions.push(fn);
    return `<button class="cm-i ${opt.danger ? 'danger' : ''} ${opt.on ? 'on' : ''}" data-i="${actions.length - 1}">${ICON[icon]}<span>${esc(label)}</span>${opt.on ? ICON.check : ''}</button>`;
  }).join('');

  menuEl = document.createElement('div');
  menuEl.className = 'cmenu';
  menuEl.setAttribute('role', 'menu');
  menuEl.innerHTML = html;
  document.body.appendChild(menuEl);
  // im Fenster halten
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  menuEl.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';

  menuEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-sub')) { const sub = b.nextElementSibling; sub.hidden = !sub.hidden; return; }
    if (b.dataset.col !== undefined && item) {
      const meta = { ...(item.meta || {}) };
      if (b.dataset.col) meta.color = b.dataset.col; else delete meta.color;
      saveItem(item.id, { meta });
    } else if (b.dataset.move !== undefined && item) {
      saveItem(item.id, { category_id: b.dataset.move || null });
    } else if (b.dataset.i !== undefined) {
      actions[+b.dataset.i]();
    }
    closeMenu();
  });
  menuEl.querySelector('button')?.focus();
}

export function initContextMenu() {
  // Rechtsklick nur mit der Maus; am Touchscreen öffnet langes Drücken auf Ordner und Karten das Menü (drag.js)
  let pointer = 'mouse';
  document.addEventListener('pointerdown', (e) => {
    pointer = e.pointerType;
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  document.addEventListener('scroll', closeMenu, true);

  // innerster Treffer zählt: Eintrag vor Ordner vor Karte auf der Startseite
  $app.addEventListener('contextmenu', (e) => {
    if (pointer === 'mouse' && openMenuFor(e.target, e.clientX, e.clientY)) e.preventDefault();
  });
}
