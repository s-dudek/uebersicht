// Kategorie-Fenster (anlegen, bearbeiten, teilen)
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
import { ICON, ITEM_ICONS } from './icons.js';
import { personPicker, shareMessage } from './items.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

// Neue Todo-Liste (neue oder vorhandene Kategorie) bzw. neuer Notiz-Ordner (folder)
export function openNewList({ folder = false } = {}) {
  const isList = !folder;
  const available = state.categories.filter((c) => !isTodoList(c));
  let color = COLORS[1], canvas = false;   // Ordner: mit Notizen-Liste oder nur Canvas
  const sheet = openSheet(`
    <div class="sheet-head"><h2>${isList ? 'Neue Liste' : 'Neuer Ordner'}</h2><button class="link-btn" data-close>Fertig</button></div>
    <form id="nl-form">
      <div class="field"><label>Name</label>
        <div class="row-inline"><input class="input" id="nl-name" name="name" placeholder="${isList ? 'z. B. Einkaufen' : 'z. B. Urlaub'}" required><button class="btn">Anlegen</button></div>
      </div>
      <div class="field"><label>Farbe</label><div class="colors">${COLORS.map((col) => `<button type="button" class="color ${col === color ? 'on' : ''}" data-color="${col}" style="background:${col}"></button>`).join('')}</div></div>
      ${isList ? '' : `<div class="field"><label>Art</label><div class="seg-view nl-kind">
        <button type="button" class="on" data-kind="">${ICON.notes}<span>Notizen und Canvas</span></button>
        <button type="button" data-kind="canvas">${ICON.ink}<span>Nur Canvas</span></button></div></div>`}
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
  sheet.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    canvas = !!b.dataset.kind;
    sheet.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
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
    const { data, error } = await insertCategory({ name, color, todo_list: isList, ...(canvas ? { canvas_only: true } : {}) });
    if (error) return toast('Fehler: ' + error.message);
    state.categories.push(data);
    state.categories.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    closeSheet(); render();
    toast(`${isList ? 'Liste' : 'Ordner'} „${name}“ angelegt`);
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
  if (!c) return closeSheet();
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
    <div class="field"><label>Notizen</label>
      <button class="menu-item" id="c-canvas" type="button">Nur Canvas (ohne Notizen-Liste): ${c.canvas_only ? 'an' : 'aus'}<span class="sw ${c.canvas_only ? 'on' : ''}"></span></button>
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
    sheet.querySelector('#c-canvas').addEventListener('click', async () => {
      const next = !c.canvas_only;
      const { error } = await sb.from('categories').update({ canvas_only: next }).eq('id', cid);
      if (error) return toast('Fehler: ' + error.message);
      c.canvas_only = next;
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
  if (!c || !(await askConfirm(`Kategorie „${c.name}“ löschen?`, 'Löschen', 'Landet samt Canvas im Papierkorb (30 Tage wiederherstellbar). Die Einträge bleiben erhalten, bis dahin ohne Kategorie.'))) return;
  // in den Papierkorb: nur markieren; endgültig gelöscht wird erst im Papierkorb bzw. nach 30 Tagen (trash.js)
  const { error } = await sb.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', cid);
  if (error) return toast('Fehler: ' + error.message);
  if (state.list === cid) state.list = null;
  closeSheet(); await loadAll();
  toast(`„${c.name}“ in den Papierkorb gelegt`);
}
export async function leaveCategory(cid) {
  const c = catById(cid);
  if (!c || !(await askConfirm(`„${c.name}“ verlassen?`, 'Verlassen', 'Du siehst die Einträge darin dann nicht mehr.'))) return;
  const { error } = await sb.from('category_members').delete().eq('category_id', cid).eq('user_id', state.me);
  if (error) return toast('Fehler: ' + error.message);
  if (state.list === cid) state.list = null;
  closeSheet(); await loadAll();
}
