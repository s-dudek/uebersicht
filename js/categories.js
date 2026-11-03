// Bereich Kategorien und Kategorie-Fenster (anlegen, bearbeiten, teilen)
import {
  COLORS,
  askConfirm,
  catById,
  esc,
  isCatShared,
  isTodoList,
  localLists,
  membersOf,
  nameOf,
  safeColor,
  sb,
  setLocalLists,
  state,
  toast,
} from './core.js';
import { insertCategory, loadAll } from './data.js';
import { dueLabel, remindLabel } from './dates.js';
import { ICON, ITEM_ICONS, itemIcon } from './icons.js';
import { personPicker, shareMessage } from './items.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

// Mischansicht: ausgewählte Ordner als Kachel, alle anderen als Liste (im Browser gemerkt)
const TILES_KEY = 'uebersicht-tiles';

const tileSets = (() => {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(TILES_KEY)); } catch {}
  const d = raw || window.__DEMO_TILES || { todos: [''], notes: [], categories: [] };
  return { todos: new Set(d.todos || []), notes: new Set(d.notes || []), categories: new Set(d.categories || []) };
})();

export const isTile = (tab, id) => tileSets[tab]?.has(id || '');

export function toggleTile(tab, id) {
  const set = tileSets[tab]; id = id || '';
  set.has(id) ? set.delete(id) : set.add(id);
  try { localStorage.setItem(TILES_KEY, JSON.stringify(Object.fromEntries(Object.entries(tileSets).map(([k, v]) => [k, [...v]])))); } catch {}
  render();
}

const tileToggle = (tab, id, asTile) => `<button class="vtog" data-act="tile-toggle" data-tt="${tab}" data-id="${id}" aria-label="${asTile ? 'Als Liste anzeigen' : 'Als Kachel anzeigen'}" title="${asTile ? 'Als Liste anzeigen' : 'Als Kachel anzeigen'}">${asTile ? ICON.list : ICON.grid}</button>`;

// Ordner einer Seite: Kacheln oben, Rest als Explorer-Liste
function mixed(tab, folders, tileFn) {
  const tiles = folders.filter((f) => isTile(tab, f.id));
  const rest = folders.filter((f) => !isTile(tab, f.id));
  return `${tiles.length ? `<div class="tgrid">${tiles.map(tileFn).join('')}</div>` : ''}
    ${rest.length ? explorer(tab, rest) : ''}
    <p class="hint xhint">Einträge lange gedrückt halten und in einen anderen Ordner ziehen. ${ICON.grid.replace('<svg', '<svg class="ihint"')} macht einen Ordner zur Kachel.</p>`;
}

const remindTag = (i) => i.remind_at && !i.reminded && !i.done
  ? `<span class="kbell" title="Erinnerung ${esc(remindLabel(i.remind_at))}">${ICON.bell}<span>${esc(remindLabel(i.remind_at))}</span></span>` : '';

function explorer(tab, folders) {

  const pool = state.items.filter((i) => (tab === 'todos' ? i.type === 'todo' : tab === 'notes' ? i.type === 'note' : i.type !== 'meal'));
  const inFolder = (f) => pool
    .filter((i) => (f.id ? i.category_id === f.id : !i.category_id || !catById(i.category_id)))
    .sort((a, b) => (a.type === 'todo' && b.type === 'todo' && a.done !== b.done) ? (a.done ? 1 : -1) : b.updated_at.localeCompare(a.updated_at));

  const col2 = (i) => { const d = dueLabel(i.due_date); return `<span class="${d.overdue && !i.done ? 'overdue' : ''}">${esc(d.text)}</span>`; };

  const row = (i) => `
    <div class="nrow xr ${i.done ? 'done' : ''}" data-note="${i.id}" data-drag="${i.id}">
      ${i.type === 'todo'
        ? `<button class="xcheck ${i.done ? 'on' : ''}" data-act="toggle" data-id="${i.id}" aria-label="${i.done ? 'Wieder öffnen' : 'Erledigt'}">${i.done ? ICON.check : ''}</button>`
        : `<span class="xic ${i.icon ? 'has' : ''}">${itemIcon(i)}</span>`}
      <button class="xname" data-act="open" data-id="${i.id}">${esc(i.title) || '<span class="muted">Ohne Titel</span>'}</button>
      <span class="xc2">${i.meta?.amount ? `<span class="kamt">${esc(i.meta.amount)}</span>` : ''}${remindTag(i)}${i.type === 'todo' && i.due_date ? col2(i) : ''}</span>
      <span class="grip" data-grip="${i.id}" aria-label="Verschieben" role="button" tabindex="0">${ICON.grip}</span>
    </div>`;

  const folder = (f) => {
    const items = inFolder(f);
    const key = tab + ':' + f.id;
    const folded = state.folded.has(key);
    const open = items.filter((i) => i.type !== 'todo' || !i.done).length;
    return `<div class="ngroup xf ${folded ? 'folded' : ''}" data-drop="${f.id}">
      <div class="xfh">
        <button class="xtoggle" data-act="fold" data-id="${esc(key)}" aria-expanded="${!folded}" aria-label="${folded ? 'Aufklappen' : 'Zuklappen'}">${ICON.chevron}</button>
        <span class="xfolder" style="--fc:${safeColor(f.color, '#9AABA6')}">${ICON.folder}</span>
        <button class="xfname" data-act="fold" data-id="${esc(key)}">${esc(f.name)}</button>
        ${f.shared ? `<span class="xshared" title="gemeinsam">${ICON.share}</span>` : ''}
        <span class="xcount">${tab === 'todos' ? `${open} offen` : `${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}</span>
        ${tab === 'notes' ? `<button class="xadd" data-act="new-note-in" data-id="${f.id}" aria-label="Neue Notiz in ${esc(f.name)}">${ICON.plus}</button>` : ''}
        ${tileToggle(tab, f.id, false).replace('class="vtog"', 'class="xadd vtog"')}
        ${f.id ? `<button class="xadd" data-act="list-edit" data-id="${f.id}" aria-label="${esc(f.name)} bearbeiten">${ICON.dots}</button>` : '<span class="xadd-sp"></span>'}
      </div>
      ${folded ? '' : `<div class="xbody">
        ${items.map(row).join('')}
        ${tab === 'todos' ? `<form class="addrow xaddrow" data-list="${f.id}"><span class="xic">${ICON.plus}</span><input name="title" placeholder="Neues Todo …" autocomplete="off" enterkeyhint="done"></form>` : ''}
        ${!items.length && tab !== 'todos' ? '<p class="ng-empty">Leer. Hierher ziehen.</p>' : ''}
      </div>`}
    </div>`;
  };

  return `<section class="xpl">
    <div class="xhead">Liste</div>
    ${folders.map(folder).join('')}
  </section>`;
}

export function renderCategoryPage() {
  const cats = state.categories;
  const uncategorized = state.items.filter((i) => (!i.category_id || !catById(i.category_id)) && i.type !== 'meal');
  const itemLine = (i) => `<button class="use-item ${i.done ? 'done' : ''}" data-act="open" data-id="${i.id}" data-drag="${i.id}">
      <span class="ui-ic">${i.type === 'todo' ? (i.done ? ICON.check : '<i class="ui-ring"></i>') : ICON.notes}</span>
      <span class="ui-t">${esc(i.title) || 'Ohne Titel'}</span>
      ${i.owner_id !== state.me ? `<small>${esc(nameOf(i.owner_id))}</small>` : ''}
    </button>`;
  const block = (label, items, max = 4) => items.length ? `<div class="use-block"><div class="use-h">${label}<span>${items.length}</span></div>
      ${items.slice(0, max).map(itemLine).join('')}${items.length > max ? `<p class="use-more">+ ${items.length - max} weitere</p>` : ''}</div>` : '';
  const tile = (c) => {
    const items = state.items.filter((i) => i.category_id === c.id && i.type !== 'meal');
    const todosOpen = items.filter((i) => i.type === 'todo' && !i.done);
    const todosDone = items.filter((i) => i.type === 'todo' && i.done);
    const notes = items.filter((i) => i.type === 'note');
    const mine = c.owner_id === state.me;
    const people = (mine ? membersOf(c.id) : [c.owner_id, ...membersOf(c.id).filter((u) => u !== state.me)]).map(nameOf);
    const where = [isTodoList(c) ? 'Todo-Liste' : null, notes.length ? 'Notizen' : null].filter(Boolean);
    return `<section class="tile ctile" data-drop="${c.id}">
      <div class="th">
        <i class="ldot" style="background:${safeColor(c.color)}"></i>
        <b>${esc(c.name)}</b>
        <span class="th-sp"></span>
        ${tileToggle('categories', c.id, true)}
        <button class="lgear" data-act="list-edit" data-id="${c.id}" aria-label="Kategorie bearbeiten">${ICON.dots}</button>
        <span class="cnt ${items.length ? '' : 'zero'}">${items.length}</span>
      </div>
      <div class="use-tags">
        ${where.map((w) => `<span class="utag">${w}</span>`).join('')}
        <span class="utag light">${people.length ? `${mine ? 'gemeinsam mit' : 'von'} ${esc(people.join(', '))}` : 'privat'}</span>
      </div>
      ${items.length ? `<div class="use-cols">
        ${block('Offene Todos', todosOpen)}
        ${block('Notizen', notes)}
        ${block('Erledigt', todosDone, 2)}
      </div>` : '<p class="empty">Wird noch nirgends verwendet.</p>'}
    </section>`;
  };
  const tileOf = (f) => f.id ? tile(catById(f.id)) : `<section class="tile ctile" data-drop="">
      <div class="th"><i class="ldot none"></i><b>Ohne Kategorie</b><span class="th-sp"></span>${tileToggle('categories', '', true)}<span class="cnt light">${uncategorized.length}</span></div>
      ${uncategorized.length ? `<div class="use-cols">
        ${block('Todos (Allgemein)', uncategorized.filter((i) => i.type === 'todo' && !i.done))}
        ${block('Notizen', uncategorized.filter((i) => i.type === 'note'))}
      </div>` : '<p class="ng-empty">Leer.</p>'}
    </section>`;
  const folders = [
    ...cats.map((c) => ({ id: c.id, name: c.name, color: c.color, shared: isCatShared(c) })),
    { id: '', name: 'Ohne Kategorie', color: null, shared: false },
  ];
  return mixed('categories', folders, tileOf);
}

// ---------- Kategorien ----------
function openCategories() {
  closeSheet();
  state.tab = 'categories';
  render();
}

// Neue Todo-Liste (neue oder vorhandene Kategorie) bzw. neue Kategorie
export function openNewList({ mode = 'list' } = {}) {
  const isList = mode === 'list';
  const available = state.categories.filter((c) => !isTodoList(c));
  let color = COLORS[1];
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isList ? 'Neue Liste' : 'Neue Kategorie'}</h2><button class="link-btn" data-close>Fertig</button></div>
    <form id="nl-form">
      <div class="field"><label>Name</label>
        <div class="row-inline"><input class="input" id="nl-name" name="name" placeholder="${isList ? 'z. B. Einkaufen' : 'z. B. Haushalt'}" required><button class="btn">Anlegen</button></div>
      </div>
      <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((col) => `<button type="button" class="color ${col === color ? 'on' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}</div></div>
    </form>
    ${isList && available.length ? `<div class="divider"></div>
      <div class="field"><label>Oder vorhandene Kategorie als Liste nehmen</label>
        <div class="pick">${available.map((c) => `<button class="pick-item" data-pick="${c.id}"><i class="ldot" style="background:${safeColor(c.color)}"></i>${esc(c.name)}${isCatShared(c) ? `<small>gemeinsam</small>` : ''}</button>`).join('')}</div>
      </div>` : ''}`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  setTimeout(() => sheet.querySelector('#nl-name').focus(), 60);
  sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.dataset.color;
    sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const asList = async (c) => {
    if (c.owner_id === state.me) {
      const { error } = await sb.from('categories').update({ todo_list: true }).eq('id', c.id);
      if (error) return toast('Fehler: ' + error.message);
      c.todo_list = true;
    } else setLocalLists([...new Set([...localLists(), c.id])]);
  };
  sheet.querySelector('#nl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = sheet.querySelector('#nl-name').value.trim();
    if (!name) return;
    const { data, error } = await insertCategory({ name, color, todo_list: isList });
    if (error) return toast('Fehler: ' + error.message);
    state.categories.push(data);
    state.categories.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    closeSheet(); render();
    toast(isList ? `Liste „${name}“ angelegt` : `Kategorie „${name}“ angelegt`);
    if (isList) document.querySelector(`.addrow[data-list="${data.id}"] input`)?.focus();
  });
  sheet.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
    const c = catById(b.dataset.pick);
    await asList(c);
    closeSheet(); render();
    toast(`„${c.name}“ ist jetzt eine Liste`);
    document.querySelector(`.addrow[data-list="${c.id}"] input`)?.focus();
  }));
}

export function openCategory(cid) {
  const c = catById(cid);
  if (!c) return openCategories();
  const mine = c.owner_id === state.me;
  const listOn = isTodoList(c);
  const sheet = openSheet(mine ? `
    <div class="sheet-head"><h2>${esc(c.name)}</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="field"><label>Name</label><input class="input" id="c-name" value="${esc(c.name)}"></div>
    <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((col) => `<button type="button" class="color ${col === c.color ? 'on' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}</div></div>
    <div class="field"><label>Symbol</label><div class="icon-grid cat-icons" id="c-icons" style="--fc:${safeColor(c.color)}">
      <button type="button" class="ig ${!c.icon ? 'on' : ''}" data-cicon="" aria-label="Standard">${ICON.tag}</button>
      ${ITEM_ICONS.map(([k, l]) => `<button type="button" class="ig ${c.icon === k ? 'on' : ''}" data-cicon="${k}" aria-label="${l}" title="${l}">${ICON[k]}</button>`).join('')}
    </div></div>
    <div class="field"><label>Gemeinsam mit</label>
      ${personPicker(membersOf(cid))}
      <div class="hint">Alle Todos und Notizen in dieser Kategorie sehen und bearbeiten dann beide.</div>
    </div>
    <div class="field"><label>Todo-Liste</label>
      <button class="menu-item" id="c-list" type="button">${listOn ? 'Als Todo-Liste anzeigen: an' : 'Als Todo-Liste anzeigen: aus'}<span class="sw ${listOn ? 'on' : ''}"></span></button>
      ${listOn && state.items.some((i) => i.type === 'todo' && i.category_id === cid) ? '<div class="hint">Solange Todos darin sind, bleibt sie in den Todos sichtbar.</div>' : ''}
    </div>
    <div class="divider"></div>
    <button class="btn danger block" id="c-delete">Kategorie löschen</button>
    <div class="hint" style="text-align:center">Einträge bleiben erhalten, nur ohne Kategorie.</div>
  ` : `
    <div class="sheet-head"><span></span><button class="link-btn" data-close>Fertig</button></div>
    <h2 style="display:flex;align-items:center;gap:10px;margin:4px 0 6px"><span class="dot" style="background:${safeColor(c.color)};width:14px;height:14px"></span>${esc(c.name)}</h2>
    <p class="muted" style="margin:0 0 20px">Gemeinsame Kategorie von ${esc(nameOf(c.owner_id))}${membersOf(cid).filter((u) => u !== state.me).length ? ', auch mit ' + esc(membersOf(cid).filter((u) => u !== state.me).map(nameOf).join(', ')) : ''}.</p>
    <button class="btn danger block" id="c-leave">Kategorie verlassen</button>
  `);

  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);

  if (mine) {
    sheet.querySelector('#c-name').addEventListener('change', async (e) => {
      const name = e.target.value.trim();
      if (!name) return;
      const { error } = await sb.from('categories').update({ name }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.name = name; render();
    });
    sheet.querySelectorAll('[data-cicon]').forEach((b) => b.addEventListener('click', async () => {
      sheet.querySelectorAll('[data-cicon]').forEach((x) => x.classList.toggle('on', x === b));
      const icon = b.dataset.cicon || null;
      const { error } = await sb.from('categories').update({ icon }).eq('id', cid);
      if (error) return toast(/icon/.test(error.message) ? 'Für Symbole muss die Datenbank noch erweitert werden (SQL).' : 'Fehler: ' + error.message, 4000);
      c.icon = icon; render();
    }));
    sheet.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', async () => {
      sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
      const { error } = await sb.from('categories').update({ color: b.dataset.color }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.color = b.dataset.color; render();
    }));
    sheet.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', async () => {
      const uid = b.dataset.person, p = state.profiles[uid];
      b.disabled = true;
      if (membersOf(cid).includes(uid)) {
        if (!(await askConfirm(`${p?.name || 'Person'} aus „${c.name}“ entfernen?`, 'Entfernen', 'Die Einträge darin sieht sie dann nicht mehr.'))) { b.disabled = false; return; }
        const { error } = await sb.from('category_members').delete().eq('category_id', cid).eq('user_id', uid);
        if (error) { b.disabled = false; return toast('Fehler: ' + error.message); }
      } else {
        const { data, error } = await sb.rpc('share_category', { cid, target_email: p?.email || '' });
        if (error) { b.disabled = false; return toast('Fehler: ' + error.message); }
        if (data !== 'ok') { b.disabled = false; return toast(shareMessage(data), 3500); }
        toast(`${p?.name || 'Person'} sieht jetzt „${c.name}“`);
      }
      await loadAll(); openCategory(cid);
    }));
    sheet.querySelector('.pp-mail')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { data, error } = await sb.rpc('share_category', { cid, target_email: e.target.email.value });
      if (error) return toast('Fehler: ' + error.message);
      if (data !== 'ok') return toast(shareMessage(data), 3500);
      await loadAll(); openCategory(cid); toast('Eingeladen');
    });
    sheet.querySelector('#c-list').addEventListener('click', async () => {
      const next = !c.todo_list && !localLists().includes(cid);
      const { error } = await sb.from('categories').update({ todo_list: next }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.todo_list = next;
      if (!next) setLocalLists(localLists().filter((x) => x !== cid));
      render(); openCategory(cid);
    });
    sheet.querySelector('#c-delete').addEventListener('click', () => deleteCategory(cid));
  } else {
    sheet.querySelector('#c-leave').addEventListener('click', () => leaveCategory(cid));
  }
}

// Kategorie löschen (nur Besitzer) bzw. eine geteilte Kategorie verlassen
export async function deleteCategory(cid) {
  const c = catById(cid);
  if (!c || !(await askConfirm(`Kategorie „${c.name}“ löschen?`, 'Löschen', 'Die Einträge bleiben erhalten, nur ohne Kategorie.'))) return;
  const { error } = await sb.from('categories').delete().eq('id', cid);
  if (error) return toast('Fehler: ' + error.message);
  if (state.list === cid) state.list = null;
  closeSheet(); await loadAll();
}
export async function leaveCategory(cid) {
  const c = catById(cid);
  if (!c || !(await askConfirm(`„${c.name}“ verlassen?`, 'Verlassen', 'Du siehst die Einträge darin dann nicht mehr.'))) return;
  const { error } = await sb.from('category_members').delete().eq('category_id', cid).eq('user_id', state.me);
  if (error) return toast('Fehler: ' + error.message);
  if (state.list === cid) state.list = null;
  closeSheet(); await loadAll();
}
