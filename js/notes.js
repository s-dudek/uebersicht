// Bereich Notizen: Übersicht und geöffneter Ordner
import { catById, esc, nameOf, state } from './core.js';
import { folderIc, itemTint, listLayout, noteFolders } from './folders.js';
import { blocksHtml, noteKey } from './groups.js';
import { ICON } from './icons.js';
import { renderInk } from './ink.js';

export const notesIn = (fid) => state.items.filter((i) => i.type === 'note' && (fid ? i.category_id === fid : !i.category_id || !catById(i.category_id)))
  .sort((a, b) => noteKey(a) - noteKey(b) || b.updated_at.localeCompare(a.updated_at));

export function renderNotes() {
  if (state.list !== null && (state.list === '' || catById(state.list))) return renderNoteList(state.list);
  state.list = null;
  const card = (f) => {
    const list = notesIn(f.id);
    return `<button class="fcard" data-act="open-list" data-id="${f.id}" ${f.id ? `data-cdrag="${f.id}"` : ''}>
      ${folderIc(f)}
      <span class="fc-n">${esc(f.name)}</span>
      <span class="fc-s">${list.length ? `${list.length} ${list.length === 1 ? 'Notiz' : 'Notizen'}` : 'leer'}</span>
      ${f.shared ? `<span class="fc-sh" title="gemeinsam">${ICON.share}</span>` : ''}
      <span class="fc-c ${list.length ? '' : 'zero'}">${list.length}</span>
    </button>`;
  };
  return `<div class="fgrid" data-cgrid="notes">${noteFolders().map(card).join('')}
    <button class="fcard fnew" data-act="new-cat"><span class="fc-ic">${ICON.plus}</span><span class="fc-n">Neuer Ordner</span></button>
  </div>
  <p class="hint xhint">Ordner lange drücken, um ihn an eine andere Stelle zu ziehen.</p>`;
}

function renderNoteList(fid) {
  if (state.noteMode === 'ink') return renderInk(fid);   // ganze Breite, Ordner über die Kopfleiste
  const has = notesIn(fid).length > 0;
  const row = (n) => `
    <div class="trow ${n.meta?.color ? 'tinted' : ''}" data-drag="${n.id}" data-gid="${esc(n.meta?.group || '')}"${itemTint(n)}>
      <button class="tname" data-act="open" data-id="${n.id}"><span>${esc(n.title) || '<span class="muted">Ohne Titel</span>'}</span></button>
      ${n.remind_at && !n.reminded ? `<span class="tbell" title="Erinnerung">${ICON.bell}</span>` : ''}
      ${n.owner_id !== state.me ? `<span class="tby">${esc(nameOf(n.owner_id))}</span>` : ''}
    </div>`;
  const body = `<button class="ink-open" data-act="note-mode" data-id="ink">${ICON.ink}<span><b>Handschrift</b><small>Seiten mit Stift, Text, Formen und Bereichen</small></span>${ICON.chevR}</button>
  <section class="tbig" data-drop="${fid}">
    <button class="addrow tadd tnew" data-act="new-note-in" data-id="${fid}"><span class="xic">${ICON.plus}</span><span>Neue Notiz …</span></button>
    ${has ? blocksHtml(fid, 'note', row) : '<p class="kempty">Noch keine Notizen.</p>'}
  </section>`;
  return listLayout(noteFolders(), fid, body, has ? 'Lange drücken und ziehen: nach oben oder unten verschieben, auf eine andere Notiz halten für eine Gruppe, unten in einen anderen Ordner.' : '');
}
