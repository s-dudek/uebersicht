// Notizen: mehrere auswählen, dann verschieben oder löschen (Knopf „Auswählen“ im geöffneten Ordner)
import { askConfirm, catById, esc, safeColor, state, toast } from './core.js';
import { moveItems, TRASH_DAYS, trashItems } from './data.js';
import { noteFolders } from './folders.js';
import { ICON } from './icons.js';
import { notesIn } from './notes.js';
import { render } from './render.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

// Auswahl gilt nur im Ordner, in dem sie begonnen wurde
export const selecting = () => state.noteSel && state.noteSel.fid === state.list;
export const isPicked = (id) => !!state.noteSel?.ids.has(id);

export function noteSelAction(act, id) {
  const sel = state.noteSel;
  if (act === 'note-sel') { state.noteSel = { fid: state.list, ids: new Set() }; return render(); }
  if (!sel) return;
  if (act === 'note-pick') { sel.ids.has(id) ? sel.ids.delete(id) : sel.ids.add(id); return render(); }
  if (act === 'note-sel-all') {
    const all = notesIn(sel.fid).map((n) => n.id);
    sel.ids = sel.ids.size === all.length ? new Set() : new Set(all);
    return render();
  }
  if (act === 'note-sel-done') { state.noteSel = null; return render(); }
  if (!sel.ids.size) return toast('Zuerst Notizen antippen.');
  if (act === 'note-sel-move') return openMoveSheet([...sel.ids]);
  if (act === 'note-sel-del') return removeSelected([...sel.ids]);
}

// Zielordner wählen
function openMoveSheet(ids) {
  const here = state.noteSel.fid;
  const sheet = openSheet(`<div class="sheet-head"><h2>${ids.length} ${ids.length === 1 ? 'Notiz' : 'Notizen'} verschieben</h2>${sheetActs()}</div>
    <div class="pick">${noteFolders().filter((f) => f.id !== here).map((f) => `<button class="pick-item" data-to="${esc(f.id)}"><i class="ldot ${f.id ? '' : 'none'}" style="background:${safeColor(f.color)}"></i>${esc(f.name)}</button>`).join('')}</div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', async () => {
    const to = b.dataset.to || null;
    closeSheet();
    state.noteSel = null;
    await moveItems(ids, to);
    toast(`Nach „${to ? catById(to)?.name : 'Ohne Kategorie'}“ verschoben`);
  }));
}

async function removeSelected(ids) {
  const n = ids.length;
  if (!(await askConfirm(`${n} ${n === 1 ? 'Notiz' : 'Notizen'} löschen?`, 'Löschen', `Landen im Papierkorb und lassen sich ${TRASH_DAYS} Tage lang wiederherstellen.`))) return;
  state.noteSel = null;
  if (await trashItems(ids)) toast(`${n} ${n === 1 ? 'Notiz' : 'Notizen'} in den Papierkorb gelegt`);
}

// Leiste unten (bzw. Kopfleiste am Desktop) während der Auswahl; schmal nur Symbole außer „Fertig“
export function selectBar() {
  const b = (act, icon, label, cls = '') => `<button class="dk dk-sel ${cls}" data-act="${act}" aria-label="${label}" title="${label}">${ICON[icon]}<span>${label}</span></button>`;
  return `${b('note-sel-done', 'check', 'Fertig', 'pri keep')}${b('note-sel-all', 'stack', 'Alle')}${b('note-sel-move', 'move', 'Verschieben')}${b('note-sel-del', 'trash', 'Löschen', 'danger')}`;
}

// Hinweis über der Liste: wie viele ausgewählt sind
export const selectInfo = () => {
  const n = state.noteSel.ids.size;
  return `<p class="sel-info">${n ? `<b>${n}</b> ${n === 1 ? 'Notiz' : 'Notizen'} ausgewählt` : 'Notizen antippen, um sie auszuwählen'}</p>`;
};

// Auswahlkreis vor der Notiz
export const pickMark = (id) => `<span class="tpick ${isPicked(id) ? 'on' : ''}">${isPicked(id) ? ICON.check : ''}</span>`;
