// Rechtsklick-Menü (Maus): Funktionen für Einträge und Ordner
import { deleteCategory, leaveCategory, openCategory } from './categories.js';
import { $app, COLORS, canDeleteItem, catById, esc, itemById, safeColor, state } from './core.js';
import { deleteItem, saveItem, toggleTodo } from './data.js';
import { noteFolders, todoLists } from './folders.js';
import { ICON } from './icons.js';
import { openItem } from './items.js';
import { isPinned, pinKey, togglePin } from './pins.js';
import { render } from './render.js';

let menuEl = null;

function closeMenu() {
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
    if (e.move) {
      return `<button class="cm-i" data-sub>${ICON.move}<span>Verschieben nach</span>${ICON.chevR}</button>
        <div class="cm-sub" hidden>${e.move.map(([f, on]) => `<button class="cm-i ${on ? 'on' : ''}" data-move="${esc(f.id)}"><span>${esc(f.name)}</span>${on ? ICON.check : ''}</button>`).join('')}</div>`;
    }
    const [icon, label, fn, opt = {}] = e;
    actions.push(fn);
    return `<button class="cm-i ${opt.danger ? 'danger' : ''}" data-i="${actions.length - 1}">${ICON[icon]}<span>${esc(label)}</span></button>`;
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
  // Nur mit der Maus: am Touchscreen bleibt langes Drücken fürs Ziehen reserviert
  let pointer = 'mouse';
  document.addEventListener('pointerdown', (e) => {
    pointer = e.pointerType;
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);
  document.addEventListener('scroll', closeMenu, true);

  $app.addEventListener('contextmenu', (e) => {
    if (pointer !== 'mouse') return;
    // innerster Treffer zählt: Eintrag vor Ordner vor Karte auf der Startseite
    const itemEl = e.target.closest('[data-drag], [data-act="open"][data-id]');
    const folderEl = e.target.closest('.fcard[data-cdrag], .fcol-i[data-id]');
    const pinEl = e.target.closest('[data-pin]');
    let i = itemEl && itemById(itemEl.dataset.drag || itemEl.dataset.id);
    let c = !i && folderEl && catById(folderEl.dataset.cdrag || folderEl.dataset.id);
    if (!i && !c && pinEl) {
      const key = pinEl.dataset.pin;
      if (key.startsWith('i:')) i = itemById(key.slice(2)); else c = catById(key.slice(2));
    }
    if (!c && !i) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, c ? folderMenu(c) : itemMenu(i), i || null);
  });
}
