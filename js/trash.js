// Papierkorb: gelöschte Kategorien und Einträge 30 Tage lang wiederherstellen oder endgültig löschen.
// Geöffnet über Einstellungen bzw. die Seitenleiste am Desktop.
import { askConfirm, esc, itemById, safeColor, sb, state, toast } from './core.js';
import { loadAll, purgeItems, restoreItems, TRASH_DAYS } from './data.js';
import { catOrder, saveCatOrder } from './folders.js';
import { ICON } from './icons.js';
import { removeFolderImages } from './ink-store.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

const KIND = { note: ['Notiz', 'notes'], todo: ['Todo', 'todos'], event: ['Termin', 'calendar'], meal: ['Gericht', 'pot'], training: ['Training', 'dumbbell'] };
const dateDe = (d) => d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' });
const left = (x) => dateDe(new Date(new Date(x.deleted_at).getTime() + TRASH_DAYS * 864e5));
// Kategorien darf nur ihr Besitzer löschen und wiederherstellen – daher nur die eigenen
const ownCats = () => state.trash.cats.filter((c) => c.owner_id === state.me);
export const trashCount = () => state.trash.items.length + ownCats().length + state.trash.hidden.length;

// Geteilten Eintrag einer anderen Person nur für mich entfernen (bleibt bei ihr); zurückholen im Papierkorb
export function hideForMe(id) {
  const it = itemById(id);
  if (!it || it.owner_id === state.me) return;
  state.items = state.items.filter((i) => i.id !== id);
  state.trash.hidden.unshift(it);
  saveCatOrder('hidden', [...new Set([...catOrder('hidden'), id])]);   // zeichnet neu
  toast('Für dich entfernt – zurückholen im Papierkorb');
}
function unhide(id) {
  const it = state.trash.hidden.find((i) => i.id === id);
  state.trash.hidden = state.trash.hidden.filter((i) => i.id !== id);
  if (it) state.items.unshift(it);
  saveCatOrder('hidden', catOrder('hidden').filter((x) => x !== id));
}

// Kategorie endgültig löschen: Canvas-Seiten gehen mit (Datenbank), Einträge bleiben ohne Kategorie, Bilder weg
export async function purgeCategory(cid, { silent = false } = {}) {
  const { error } = await sb.from('categories').delete().eq('id', cid);
  if (error) { if (!silent) toast('Fehler: ' + error.message); return false; }
  removeFolderImages(cid).catch(() => {});
  state.trash.cats = state.trash.cats.filter((c) => c.id !== cid);
  return true;
}

async function restoreCategory(cid) {
  const { error } = await sb.from('categories').update({ deleted_at: null }).eq('id', cid);
  if (error) return toast('Fehler: ' + error.message);
  await loadAll();
}

function listHtml() {
  const cats = [...ownCats()].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  const items = [...state.trash.items].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  const hidden = state.trash.hidden;
  const row = (kind, id, icon, title, sub, color = '') => `<div class="tr-row">
      <span class="tr-ic"${color ? ` style="color:${safeColor(color)}"` : ''}>${icon}</span>
      <span class="tr-t"><b>${esc(title)}</b><small>${esc(sub)}</small></span>
      <button class="tr-b" data-tr="restore" data-kind="${kind}" data-id="${esc(id)}" title="Wiederherstellen">${ICON.undo}<span>Zurück</span></button>
      ${kind === 'hidden' ? '' : `<button class="tr-b danger" data-tr="purge" data-kind="${kind}" data-id="${esc(id)}" aria-label="Endgültig löschen" title="Endgültig löschen">${ICON.trash}</button>`}
    </div>`;
  const hiddenHtml = hidden.length ? `<div class="tr-h">Für mich entfernt</div>${hidden.map((i) => { const [label, icon] = KIND[i.type] || ['Eintrag', 'notes'];
    return row('hidden', i.id, ICON[icon], i.title || 'Ohne Titel', `${label} · von ${state.profiles[i.owner_id]?.name || 'anderer Person'}, bleibt dort erhalten`); }).join('')}` : '';
  if (!cats.length && !items.length) return hiddenHtml || '<p class="kempty tr-empty">Der Papierkorb ist leer.</p>';
  return `${cats.length ? `<div class="tr-h">Kategorien</div>${cats.map((c) => row('cat', c.id, ICON.tag, c.name || 'Kategorie',
      `samt Canvas · bis ${left(c)}`, c.color)).join('')}` : ''}
    ${items.length ? `<div class="tr-h">Einträge</div>${items.map((i) => { const [label, icon] = KIND[i.type] || ['Eintrag', 'notes'];
      return row('item', i.id, ICON[icon], i.title || 'Ohne Titel', `${label} · bis ${left(i)}`); }).join('')}` : ''}
    ${hiddenHtml}
    <button class="btn danger block tr-all" data-tr="empty">Papierkorb leeren</button>`;
}

export function openTrash() {
  const sheet = openSheet(`<div class="sheet-head"><h2>Papierkorb</h2>${sheetActs()}</div>
    <p class="hint">Gelöschtes bleibt ${TRASH_DAYS} Tage hier und wird danach endgültig gelöscht.</p>
    <div class="tr-list">${listHtml()}</div>`);
  const redraw = () => { sheet.querySelector('.tr-list').innerHTML = listHtml(); };
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('.tr-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tr]');
    if (!b) return;
    const { tr, kind, id } = b.dataset;
    if (tr === 'restore') {
      if (kind === 'cat') await restoreCategory(id); else if (kind === 'hidden') unhide(id); else await restoreItems([id]);
      toast('Wiederhergestellt');
    } else if (tr === 'purge') {
      if (!(await askConfirm('Endgültig löschen?', 'Löschen', 'Das lässt sich nicht mehr rückgängig machen.'))) return;
      if (kind === 'cat') await purgeCategory(id); else await purgeItems([id]);
    } else if (tr === 'empty') {
      if (!(await askConfirm('Papierkorb leeren?', 'Leeren', 'Alles darin wird endgültig gelöscht.'))) return;
      if (state.trash.items.length) await purgeItems(state.trash.items.map((i) => i.id));
      for (const c of ownCats()) await purgeCategory(c.id);
      await loadAll();
    }
    redraw();
  });
}
