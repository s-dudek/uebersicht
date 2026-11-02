// Eigene Reihenfolge und Gruppen in Notiz- und Todo-Listen
import { esc, itemById, safeColor, sb, state, toast } from './core.js';
import { ICON } from './icons.js';
import { notesIn } from './notes.js';
import { render } from './render.js';
import { closeSheet, colorPick, openSheet } from './sheet.js';
import { byDue, todosIn } from './todos.js';

// Reihenfolge: eigene Sortierung (meta.sort); neue, noch nicht sortierte Notizen oben
export const noteKey = (n) => (typeof n.meta?.sort === 'number' ? n.meta.sort : -1e9);

// Blöcke: einzelne Notizen und Gruppen (meta.group), Gruppe steht an der Stelle ihres ersten Mitglieds
// offene Todos bzw. Notizen eines Ordners in eigener Reihenfolge
const itemsFor = (type, fid) => (type === 'todo'
  ? todosIn(fid).filter((i) => !i.done).sort((a, b) => noteKey(a) - noteKey(b) || byDue(a, b))
  : notesIn(fid));

export function noteBlocks(fid, type = 'note') {
  const list = itemsFor(type, fid), seen = new Set(), out = [];
  for (const n of list) {
    const g = n.meta?.group;
    if (!g) { out.push({ note: n }); continue; }
    if (seen.has(g)) continue;
    seen.add(g);
    const items = list.filter((x) => x.meta?.group === g);
    out.push({ group: g, name: items.find((x) => x.meta?.gname)?.meta.gname || 'Gruppe', color: items.find((x) => x.meta?.gcolor)?.meta.gcolor || '', items });
  }
  return out;
}

function groupHtml(b, fid, type, row) {
  const key = 'g:' + b.group, folded = state.folded.has(key);
  return `<div class="ngrp ${folded ? 'folded' : ''} ${b.color ? 'tinted' : ''}"${b.color ? ` style="--gc:${safeColor(b.color)}"` : ''}>
    <div class="ngrp-h" data-ghead="${esc(b.group)}">
      <button class="xtoggle" data-act="fold" data-id="${esc(key)}" aria-label="${folded ? 'Aufklappen' : 'Zuklappen'}">${ICON.chevron}</button>
      <span class="ngrp-ic">${ICON.stack}</span>
      <button class="ngrp-n" data-act="group-edit" data-id="${esc(b.group)}" data-f="${fid}" data-t="${type}">${esc(b.name)}</button>
      <span class="ngrp-c">${b.items.length}</span>
    </div>
    ${folded ? '' : `<div class="ngrp-b">${b.items.map(row).join('')}</div>`}
  </div>`;
}

export const blocksHtml = (fid, type, row) => {
  const blocks = noteBlocks(fid, type);
  return blocks.length ? `<div class="trows" data-sortable="${fid}" data-stype="${type}">${blocks.map((b) => (b.group ? groupHtml(b, fid, type, row) : row(b.note))).join('')}<div class="tend" data-end="1"></div></div>` : '';
};

// Neue Reihenfolge / Gruppen speichern (ein Render, Speichern im Hintergrund)
export async function applyNoteOrder(fid, flat) {
  // flat: [{id, group}] in neuer Reihenfolge; Gruppen mit nur einer Notiz lösen sich auf
  const cnt = {}; flat.forEach((f) => { if (f.group) cnt[f.group] = (cnt[f.group] || 0) + 1; });
  const jobs = [];
  flat.forEach((f, idx) => {
    const n = itemById(f.id); if (!n) return;
    const group = f.group && cnt[f.group] > 1 ? f.group : null;
    const meta = { ...(n.meta || {}), sort: (idx + 1) * 10 };
    if (group) { meta.group = group; meta.gname = f.gname || meta.gname || 'Gruppe'; if (f.gcolor !== undefined) { if (f.gcolor) meta.gcolor = f.gcolor; else delete meta.gcolor; } } else { delete meta.group; delete meta.gname; delete meta.gcolor; }
    if (JSON.stringify(meta) === JSON.stringify(n.meta || {})) return;
    n.meta = meta;
    jobs.push(sb.from('items').update({ meta }).eq('id', n.id));
  });
  render();
  const res = await Promise.all(jobs);
  const err = res.find((r) => r.error);
  if (err) toast('Speichern fehlgeschlagen: ' + err.error.message, 4000);
}

export const flatOrder = (fid, type = 'note') => noteBlocks(fid, type).flatMap((b) => (b.group ? b.items.map((n) => ({ id: n.id, group: b.group, gname: b.name, gcolor: b.color })) : [{ id: b.note.id, group: null }]));

export function openGroupEdit(gid, fid, type = 'note') {
  const b = noteBlocks(fid, type).find((x) => x.group === gid);
  if (!b) return;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Gruppe</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="field"><label for="g-name">Name</label><input class="input" id="g-name" value="${esc(b.name)}" autocomplete="off"></div>
    <div class="field"><label>Farbe</label>${colorPick(b.color, 'g-col')}</div>
    <p class="hint">${b.items.length} ${type === 'todo' ? 'Todos' : 'Notizen'}: ${b.items.map((n) => esc(n.title || 'Ohne Titel')).join(', ')}</p>
    <div class="divider"></div>
    <button class="btn danger block" id="g-split">Gruppe auflösen</button>`, {
    onClose: () => {
      const v = sheet.querySelector('#g-name').value.trim() || 'Gruppe';
      if (v !== b.name) applyNoteOrder(fid, flatOrder(fid, type).map((f) => (f.group === gid ? { ...f, gname: v } : f)));
    },
  });
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelectorAll('#g-col [data-col]').forEach((x) => x.addEventListener('click', () => {
    sheet.querySelectorAll('#g-col [data-col]').forEach((y) => y.classList.toggle('on', y === x));
    applyNoteOrder(fid, flatOrder(fid, type).map((f) => (f.group === gid ? { ...f, gcolor: x.dataset.col } : f)));
  }));
  sheet.querySelector('#g-split').addEventListener('click', () => {
    sheet.querySelector('#g-name').value = b.name;
    closeSheet();
    applyNoteOrder(fid, flatOrder(fid, type).map((f) => (f.group === gid ? { id: f.id, group: null } : f)));
    toast('Gruppe aufgelöst');
  });
}
