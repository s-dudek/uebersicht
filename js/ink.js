// Canvas der Notiz-Ordner: jede Kategorie hat eine eigene Startseite mit Titeln, jeder Titel öffnet eine eigene Seite
// (beliebig tief). Auf der Startseite steht der Notizen-Bereich mit den Notizen des Ordners; jede Notiz hat eine
// Unterseite mit ihrer Beschreibung. Bereiche (A4) lassen sich speichern (PDF, PNG, JPEG).
import { openCategory } from './categories.js';
import { $app, askConfirm, catById, esc, itemById, safeColor, state, store, toast } from './core.js';
import { createNote, deleteItem } from './data.js';
import { folderIc, noteFolders } from './folders.js';
import { ICON } from './icons.js';
import { createBoard } from './ink-board.js';
import { GRID, NOTES_W, SHAPES, union } from './ink-draw.js';
import { deliver, exportWidth, fileName, toImage, toPdf } from './ink-export.js';
import { FRAME_LAYOUTS, LAYOUT_FIELDS } from './ink-layout.js';
import { clampSize, cleanText, openPenPanel, PALETTE } from './ink-pen.js';
import { deletePageTree, deserialize, loadChild, loadRoot, removeImages, savePage, serialize, titleIn, uploadImage } from './ink-store.js';
import { openTree, titleSvg } from './ink-tree.js';
import { openItem } from './items.js';
import { notesIn } from './notes.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

// Einstellungen der Werkzeuge: Farbe und Stärke je Art (Stift, Textmarker, Text) und zuletzt benutzte Farben bleiben gespeichert
const saved = (() => { try { return JSON.parse(store('inkStyle')) || {}; } catch { return {}; } })();
const style = (kind, c) => ({ c: safeColor(saved[kind]?.c, c), w: clampSize(kind, saved[kind]?.w) });
const ui = {
  tool: 'pen',
  shape: SHAPES.some(([k]) => k === store('inkShape')) ? store('inkShape') : 'line',
  pen: style('pen', PALETTE[0]),
  marker: style('marker', '#F2D33B'),
  text: cleanText(saved.text),
  recent: (Array.isArray(saved.r) ? saved.r.map((c) => safeColor(c)).filter(Boolean) : []).concat(['#0C3741', '#3E7CA8', '#C2575A']).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3),
  finger: store('inkFinger') === '1',
  bar: store('inkBar') !== '0',
};
const saveStyle = () => store('inkStyle', JSON.stringify({ pen: ui.pen, marker: ui.marker, text: ui.text, r: ui.recent }));
// welche Einstellung Farbe und Stärke gerade betreffen (Formen und Bemaßung zeichnen mit dem Stift)
const kindOf = () => (ui.tool === 'text' || ui.tool === 'marker' ? ui.tool : 'pen');
const DRAW = ['pen', 'marker', 'text', 'shape', 'dim'];   // Werkzeuge mit Farbe
const SHAPE_ICON = { line: 'shLine', arrow: 'shArrow', rect: 'shRect', ellipse: 'shEllipse', tri: 'shTri' };

const stack = [];      // geöffnete Seiten: [Startseite, Unterseite, …]
let cat = null;        // Ordner, zu dem die Seiten gehören ('' = Ohne Kategorie)
let status = 'idle';   // 'idle' | 'loading' | 'ready' | 'error'
let active = false;    // Canvas gerade sichtbar
const top = () => stack[stack.length - 1];

// ---------- Notizen des Ordners im Canvas ----------
const noteList = () => notesIn(cat).map((n) => ({ id: n.id, title: n.title || '' }));

// Notizen-Bereich der Startseite: fehlt er, kommt er neben den vorhandenen Inhalt (leere Seite: an den Anfang)
function withNotesArea(items) {
  if (items.some((it) => it.t === 'n')) return false;
  const b = items.length ? union(items) : null;
  const snap = (v) => Math.round(v / GRID) * GRID;
  items.push({ t: 'n', x: b ? snap(b[0] - NOTES_W - GRID * 4) : 0, y: b ? snap(b[1]) : 0 });
  return true;
}

async function removeNote(id) {
  if (!(await deleteItem(id))) return;   // fragt nach; die Unterseite der Notiz löscht deleteItem mit
  stack.forEach((p) => p.board.refreshNotes());
}

// ---------- Seiten öffnen und schließen ----------
// note: Notiz, zu der die Seite gehört (ihre Unterseite)
function openPage(row, note = null) {
  const { items } = deserialize(row.data);
  const isRoot = !stack.length;
  const added = isRoot && withNotesArea(items);
  const page = { id: row.id, note, title: titleIn(row.title), atOpen: new Set(), uploaded: new Set(), timer: null, pending: null };
  const root = isRoot ? { notes: noteList, onNote: (id) => openNote(page, id), onNoteAdd: () => createNote(cat || null), onNoteDelete: removeNote } : {};
  const sub = note ? { desc: () => itemById(note)?.body?.trim() || '', onDesc: () => openItem(note) } : {};
  page.board = createBoard({
    ...root,
    ...sub,
    items,
    colors: PALETTE,
    hold,
    onTool: (t) => { ui.tool = t; render(); },
    onCommit: (list, hh, ww) => { page.pending = { list, hh, ww }; scheduleSave(page); updateTools(); },
    onOpenTitle: (it) => openTitle(page, it),
    onDeleteTitles: deleteTitles,
    onExport: (n) => openExport([n]),
    onEditLayout: editLayoutSheet,
  });
  page.board.imagePaths().forEach((p) => page.atOpen.add(p));
  stack.push(page);
  if (added) { page.pending = { list: items, hh: 0, ww: 0 }; scheduleSave(page); }   // neuer Notizen-Bereich gleich speichern
  applyUi();
}

// Unterseite einer Notiz (gleiche ID wie die Notiz; wird beim ersten Öffnen angelegt)
async function openNote(parent, id, quiet = false) {
  const n = itemById(id);
  if (!n) return false;
  try {
    const row = await loadChild(id, parent.id, cat, { s: [], tx: [{ t: 'x', x: 0, y: 0, txt: n.title || 'Notiz', c: '#0C3741', fs: 22, ff: 'sans', fw: 500 }] });
    openPage(row, id);
    if (!quiet) render();
    return true;
  } catch (e) {
    toast('Seite konnte nicht geöffnet werden: ' + (e.message || e));
    return false;
  }
}

async function start(fid) {
  cat = fid;
  status = 'loading';
  try {
    const row = await loadRoot(fid);
    if (cat !== fid) return;   // inzwischen anderer Ordner
    openPage(row);
    status = 'ready';
  } catch (e) {
    if (cat !== fid) return;
    status = 'error';
    console.warn('Canvas', e);
  }
  if (active) render();
}

async function openTitle(parent, it, quiet = false) {
  try {
    const row = await loadChild(it.page, parent.id, cat, it);
    openPage(row);
    if (!quiet) render();
    return true;
  } catch (e) {
    toast('Seite konnte nicht geöffnet werden: ' + (e.message || e));
    return false;
  }
}

// aus der Gliederung: zurück zur Startseite, dann Titel für Titel hinein; frame: Bereich, der gezeigt werden soll
async function openPath(path, frame) {
  while (stack.length > 1) closePage(stack.pop());
  for (const it of path) if (!(await (it.note ? openNote(top(), it.note, true) : openTitle(top(), it, true)))) return render();
  render();
  if (frame !== undefined) top().board.showFrame(frame);
}

// Titel aus der Gliederung löschen: Unterseite samt Inhalt weg, Titel von seiner Seite entfernen
async function removeTitle(row, it) {
  if (!(await deleteTitles([it]))) return false;
  while (stack.length > 1 && stack.some((p) => p.id === it.page)) closePage(stack.pop());   // gelöschte Seite war offen
  const open = stack.find((p) => p.id === row.id);
  if (open) { open.board.removeTitle(it.page); render(); return true; }
  const { items } = deserialize(row.data);
  const rest = items.filter((o) => !(o.t === 't' && o.page === it.page));
  row.data = serialize(rest, row.data?.h || 0, row.data?.w || 0);
  const err = await savePage(row.id, rest, row.data.h, row.data.w);
  if (err) { toast('Speichern fehlgeschlagen: ' + err.message); return false; }
  return true;
}

// Bereich umbenennen (aus der Gliederung): offene Seite direkt, sonst in der gespeicherten Seite
async function renameFrame(row, n, name) {
  const open = stack.find((p) => p.id === row.id);
  if (open) { open.board.renameFrame(n, name); return null; }
  const { items } = deserialize(row.data);
  const f = items.filter((it) => it.t === 'f')[n];
  if (!f) return null;
  if (name) f.n = name; else delete f.n;
  row.data = serialize(items, row.data?.h || 0, row.data?.w || 0);
  return savePage(row.id, items, row.data.h, row.data.w);
}

// Angaben im Layout eines Bereichs (Dudek-CI): Titel, Projekt, Projektnummer, Kontakt
function editLayoutSheet(lf) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const sheet = openSheet(`<div class="sheet-head"><h2>Layout-Angaben</h2><button class="link-btn" data-close>Fertig</button></div>
      ${LAYOUT_FIELDS.map(([k, l]) => `<div class="field"><label for="lf-${k}">${l}</label><input class="input" id="lf-${k}" maxlength="80" value="${esc(lf[k] || '')}"></div>`).join('')}
      <p class="hint">Erscheint im Layout des Bereichs, auch beim Speichern als PDF oder Bild.</p>`, { onClose: () => finish(null) });
    const read = () => Object.fromEntries(LAYOUT_FIELDS.map(([k]) => [k, sheet.querySelector('#lf-' + k).value.trim().slice(0, 80)]).filter(([, v]) => v));
    sheet.querySelector('[data-close]').addEventListener('click', () => { finish(read()); closeSheet(); });
  });
}

// Gliederung: Bereiche, Notizen und Titel aller Seiten; Titel und Notizen lassen sich dort auch löschen
function openOutlineTree() {
  flushAll();
  openTree({
    cat, open: stack.map((p) => p.id), notes: noteList(),
    onOpen: openPath, onRename: renameFrame, onShow: showOutline,
    onDeleteTitle: async (row, it) => { const ok = await removeTitle(row, it); if (ok) openOutlineTree(); },
    onDeleteNote: async (id) => { await removeNote(id); openOutlineTree(); },
  });
}

// Gliederung auf der Fläche: alle Bereiche und Titel der geöffneten Seite hervorheben
function showOutline() {
  if (!top()?.board.showOutline()) toast('Auf dieser Seite gibt es noch keine Bereiche oder Titel.');
  else toast('Antippen beendet die Übersicht.');
}

// schmale Kopfleiste (Smartphone): Bereich und Speichern im Menü „Mehr“
function openMore(btn) {
  dropMenu(btn, `<button class="cm-i" data-a="ink-frame">${ICON.frame}<span>Bereich (A4) anlegen</span></button>
    <button class="cm-i" data-a="ink-export">${ICON.download}<span>Speichern als PDF, PNG, JPEG</span></button>`, (b) => {
    if (b.dataset.a === 'ink-frame') openFrameChoice(btn);
    else { flushAll(); openExport(); }
  });
}

function closePage(page) {
  flush(page);   // speichert die letzten Striche auch nach dem Schließen
  cleanup(page);
  page.board.destroy();
}

// Bilder, die auf der Seite nicht mehr vorkommen, aus dem Speicher entfernen
function cleanup(page) {
  const now = new Set(page.board.imagePaths());
  const gone = [...page.atOpen, ...page.uploaded].filter((p) => !now.has(p));
  page.atOpen = now;
  page.uploaded.clear();
  page.board.clearHistory();   // entfernte Bilder lassen sich danach nicht mehr zurückholen
  if (gone.length) removeImages(gone).catch(() => {});
}

async function deleteTitles(titles) {
  const ok = await askConfirm(titles.length > 1 ? `${titles.length} Titel löschen?` : 'Titel löschen?', 'Löschen', 'Die Unterseite mit allem, was darauf steht, wird ebenfalls gelöscht.');
  if (!ok) return false;
  for (const t of titles) {
    const err = await deletePageTree(t.page);
    if (err) { toast('Löschen fehlgeschlagen: ' + err.message); return false; }
  }
  return true;
}

// ---------- Speichern: kurz nach der letzten Änderung, beim Verlassen sofort ----------
function scheduleSave(page) {
  clearTimeout(page.timer);
  page.timer = setTimeout(() => flush(page), 1200);
}

async function flush(page) {
  clearTimeout(page.timer);
  if (!page?.pending) return;
  const { list, hh, ww } = page.pending;
  page.pending = null;
  const err = await savePage(page.id, list, hh, ww);
  if (err) { page.pending ??= { list, hh, ww }; toast('Speichern fehlgeschlagen: ' + err.message, 4000); }
}

const flushAll = () => stack.forEach(flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
window.addEventListener('pagehide', flushAll);

// Beim Zeichnen die Ansicht nicht neu aufbauen (Live-Updates warten bis der Strich fertig ist)
function hold(on) {
  render.hold = on;
  if (!on && render.pending) { render.pending = false; render(); }
}

// ---------- Werkzeuge ----------
function applyUi() {
  const b = top()?.board;
  if (!b) return;
  if (b.tool !== ui.tool) b.setTool(ui.tool);
  b.setShape(ui.shape);
  b.setPen(ui.pen);
  b.setMarker(ui.marker);
  b.setTextStyle(ui.text);
  b.setFinger(ui.finger);
}

function updateTools() {
  const b = top()?.board;
  document.querySelectorAll('[data-act="ink-undo"]').forEach((x) => { x.disabled = !b?.canUndo; });
  document.querySelectorAll('[data-act="ink-redo"]').forEach((x) => { x.disabled = !b?.canRedo; });
  $app.querySelector('.ink-hint')?.toggleAttribute('hidden', !(stack.length === 1 && b?.isEmpty));
}

// Foto oder Bild hinzufügen (iPad: Kamera oder Fotos)
const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
document.body.appendChild(picker);
picker.addEventListener('change', async () => {
  const file = picker.files?.[0];
  picker.value = '';
  const page = top();
  if (!file || !page) return;
  toast('Bild wird hochgeladen …');
  try {
    const img = await uploadImage(file, cat);
    page.uploaded.add(img.path);
    page.board.addImage(img);
  } catch (e) {
    toast('Bild konnte nicht hinzugefügt werden: ' + (e.message || e), 4000);
  }
});

// kleines Menü an einem Knopf (darunter, wenn Platz ist, sonst darüber)
function dropMenu(btn, html, onPick) {
  document.querySelector('.cmenu.drop')?.remove();
  const r = btn.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'cmenu drop';
  el.setAttribute('role', 'menu');
  el.innerHTML = html;
  document.body.appendChild(el);
  const m = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8)) + 'px';
  el.style.top = (r.bottom + 8 + m.height < window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - m.height - 8)) + 'px';
  const close = () => { el.remove(); document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) close(); };
  document.addEventListener('pointerdown', outside, true);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    close();
    onPick(b);
  });
  return close;
}

// Bereich anlegen: A4 hoch oder quer
// Bereich anlegen: leer (A4 hoch/quer) oder gleich mit einem Layout im Dudek-CI
function openFrameChoice(btn) {
  const fmt = (f, ly, label) => `<button class="cm-i" data-f="${f}" data-ly="${ly}">${ICON.frame}<span>${label}</span></button>`;
  dropMenu(btn, `${fmt('a4p', '', 'A4 hoch')}${fmt('a4l', '', 'A4 quer')}<hr>
    <div class="cm-h">Mit Dudek-Layout</div>
    ${FRAME_LAYOUTS.filter(([k]) => k).map(([k, l]) => `${fmt('a4p', k, `${l.replace('Dudek · ', '')} · A4 hoch`)}${fmt('a4l', k, `${l.replace('Dudek · ', '')} · A4 quer`)}`).join('')}`,
  (b) => top()?.board.addFrame(b.dataset.f, b.dataset.ly));
}

// Formen: Linie, Pfeil, Rechteck, Ellipse, Dreieck
function openShapes(btn) {
  dropMenu(btn, SHAPES.map(([k, l]) => `<button class="cm-i ${ui.tool === 'shape' && ui.shape === k ? 'on' : ''}" data-k="${k}">${ICON[SHAPE_ICON[k]]}<span>${l}</span></button>`).join(''), (b) => {
    ui.tool = 'shape';
    ui.shape = b.dataset.k;
    store('inkShape', ui.shape);
    applyUi();
    render();
  });
}

// Farbe und Stärke: Fenster mit allen Farben, eigener Farbe und Regler
function openPen(btn) {
  const b = top()?.board, sk = b?.selectionKind();
  if (sk) {   // etwas ist ausgewählt: Farbe, Stärke bzw. Schrift der Auswahl ändern
    openPenPanel($app.querySelector('[data-act="ink-pen"]') || btn, sk.kind, sk.val, (v) => b.styleSelection(sk.kind, v), () => remember(sk.val.c));
    return;
  }
  if (!DRAW.includes(ui.tool)) { ui.tool = 'pen'; applyUi(); render(); }
  const kind = kindOf();
  const anchor = $app.querySelector('[data-act="ink-pen"]') || btn;
  openPenPanel(anchor, kind, ui[kind], (v) => {
    ui[kind] = v;
    applyUi();
    const chip = $app.querySelector('.ink-penchip');
    chip?.style.setProperty('--c', v.c);
    chip?.style.setProperty('--w', penDot(kind, v.w));
  }, () => { remember(ui[kind].c); saveStyle(); render(); });
}
const penDot = (kind, w) => Math.round(Math.min(24, kind === 'text' ? 12 : kind === 'marker' ? 6 + w * .5 : 6 + w * 1.1)) + 'px';
const remember = (c) => { ui.recent = [c, ...ui.recent.filter((x) => x !== c)].slice(0, 3); };

// Kategorien (Notiz-Ordner) aus der Kopfleiste wählen (Canvas und Notizen); nochmal tippen schließt
let closeCats = null;
function openCats(btn) {
  if (closeCats && document.querySelector('.cmenu.drop')) { closeCats(); closeCats = null; return; }
  const item = (f) => {
    const on = f.id === state.list;
    return `<button class="cm-i ${on ? 'on' : ''}" data-id="${esc(f.id)}">${folderIc(f, 'cm-fic')}<span>${esc(f.name)}</span>${on ? ICON.check : ''}</button>`;
  };
  const c = state.list && catById(state.list);
  closeCats = dropMenu(btn, `${noteFolders().map(item).join('')}<hr>
    ${c && c.owner_id === state.me ? `<button class="cm-i" data-edit>${ICON.pen}<span>Name, Farbe, Symbol …</span></button>` : ''}
    <button class="cm-i" data-all>${ICON.chevL}<span>Alle Ordner</span></button>`, (b) => {
    if ('edit' in b.dataset) return openCategory(c.id);
    state.list = 'all' in b.dataset ? null : b.dataset.id;
    render();
  });
}

// Werkzeugleiste ein- und ausfahren (ohne Neuaufbau, damit sie weich gleitet)
function toggleBar() {
  ui.bar = !ui.bar;
  store('inkBar', ui.bar ? '1' : '0');
  const bar = $app.querySelector('.ink-bar');
  bar?.classList.toggle('closed', !ui.bar);
  bar?.querySelector('.ink-fold')?.setAttribute('aria-expanded', ui.bar);
}

export async function inkAction(act, id, btn) {
  const b = top()?.board;
  switch (act) {
    case 'ink-tool':
      if (id === 'shape') { openShapes(btn); return; }
      if (id === 'lasso') { if (ui.tool === 'lasso') ui.tool = ui.before || 'pen'; else { ui.before = ui.tool; ui.tool = 'lasso'; } }   // Auswahl ein/aus
      else ui.tool = id;
      break;
    case 'ink-color': {
      if (b?.selectionKind()) { b.styleSelection('pen', { c: ui.recent[+id] }); return; }   // Auswahl umfärben
      if (!DRAW.includes(ui.tool)) ui.tool = 'pen';
      const kind = kindOf();
      ui[kind] = { ...ui[kind], c: ui.recent[+id] || ui[kind].c };
      saveStyle();
      break;
    }
    case 'ink-pen': openPen(btn); return;
    case 'ink-tree': openOutlineTree(); return;
    case 'ink-more': openMore(btn); return;
    case 'ink-notes': state.noteMode = 'text'; render(); return;
    case 'ink-finger': ui.finger = !ui.finger; store('inkFinger', ui.finger ? '1' : '0'); toast(ui.finger ? 'Mit dem Finger schreiben, mit zwei Fingern verschieben und zoomen' : 'Stift und Maus schreiben, der Finger verschiebt'); break;
    case 'ink-undo': b?.undo(); return;
    case 'ink-redo': b?.redo(); return;
    case 'ink-img': picker.click(); return;
    case 'ink-frame': openFrameChoice(btn); return;
    case 'ink-cats': openCats(btn); return;
    case 'ink-fold': toggleBar(); return;
    case 'ink-zoom': id === 'in' ? b?.zoomIn() : b?.zoomOut(); return;
    case 'ink-export': flushAll(); openExport(); return;
    case 'ink-back': if (stack.length > 1) closePage(stack.pop()); break;
    default: return;
  }
  applyUi();
  render();
}

// Tastatur am Computer: Rückgängig, Wiederholen, Auswahl löschen, Zoom
document.addEventListener('keydown', (e) => {
  if (!active || e.target.closest?.('input, textarea, .sheet')) return;
  const b = top()?.board;
  if (!b) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? b.redo() : b.undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); b.redo(); }
  else if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); b.zoomIn(); }
  else if (mod && e.key === '-') { e.preventDefault(); b.zoomOut(); }
  else if (mod && e.key === '0') { e.preventDefault(); b.resetView(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') b.deleteSelection();
});

// ---------- Export: Bereiche auswählen, Format und Hintergrund ----------
const exp = { fmt: 'pdf', bg: 'grid' };

function openExport(preselect) {
  const b = top()?.board;
  if (!b) return;
  const frames = b.frames();
  const chosen = new Set(preselect ?? frames.map((f) => f.n));
  const seg = (key, opts) => `<div class="seg-view exp-seg" data-key="${key}">${opts.map(([v, l]) => `<button type="button" class="${exp[key] === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2>Speichern</h2><button class="link-btn" data-close>Fertig</button></div>
    ${frames.length ? `
      <p class="muted exp-lead">Bereiche auswählen:</p>
      <div class="exp-grid">${frames.map((f) => `<button type="button" class="exp-card ${chosen.has(f.n) ? 'on' : ''}" data-n="${f.n}"><span class="exp-th ${f.fmt}"></span><span>${esc(f.name)}</span></button>`).join('')}</div>
      <div class="exp-row"><span>Format</span>${seg('fmt', [['pdf', 'PDF'], ['png', 'PNG'], ['jpeg', 'JPEG']])}</div>
      <div class="exp-row"><span>Hintergrund</span>${seg('bg', [['grid', 'Mit Hintergrund'], ['none', 'Ohne']])}</div>
      <p class="hint exp-note"></p>
      <button class="btn block" id="exp-go">${ICON.download} Speichern</button>`
    : `<p class="exp-lead">Noch kein Bereich auf dieser Seite. Lege einen Bereich an, schreibe hinein und exportiere ihn dann.</p>
      <div class="exp-new"><button class="btn" data-f="a4p">${ICON.frame} A4 hoch</button><button class="btn" data-f="a4l">${ICON.frame} A4 quer</button></div>`}`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);

  const note = () => {
    const el = sheet.querySelector('.exp-note');
    if (el) el.textContent = exp.bg === 'none' ? (exp.fmt === 'png' ? 'PNG ohne Hintergrund ist durchsichtig.' : 'Ohne Kästchen, Linien oder Punkte, auf Weiß.') : 'Jeder Bereich mit seinem eigenen Hintergrund (Kästchen, Linien, Punkte oder leer).';
  };
  note();

  // kleine Vorschau je Bereich
  frames.forEach(async (f) => {
    const cv = await b.renderBox(f.box, 220, f.bg, f.ly, f.lf);
    sheet.querySelector(`.exp-card[data-n="${f.n}"] .exp-th`)?.appendChild(cv);
  });

  sheet.addEventListener('click', async (e) => {
    const nf = e.target.closest('[data-f]');
    if (nf) { closeSheet(); b.addFrame(nf.dataset.f); return; }
    const card = e.target.closest('.exp-card');
    if (card) { const n = +card.dataset.n; chosen.has(n) ? chosen.delete(n) : chosen.add(n); card.classList.toggle('on', chosen.has(n)); return; }
    const sb = e.target.closest('.exp-seg button');
    if (sb) {
      exp[sb.parentElement.dataset.key] = sb.dataset.v;
      sb.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === sb));
      note();
      return;
    }
    const go = e.target.closest('#exp-go');
    if (!go) return;
    const list = frames.filter((f) => chosen.has(f.n));
    if (!list.length) { toast('Bitte mindestens einen Bereich auswählen.'); return; }
    go.disabled = true;
    go.textContent = 'Wird erstellt …';
    try {
      await runExport(b, list);
      closeSheet();
    } catch (err) {
      toast('Export fehlgeschlagen: ' + (err.message || err), 4000);
      go.disabled = false;
      go.innerHTML = `${ICON.download} Speichern`;
    }
  });
}

async function runExport(b, list) {
  const base = `Canvas ${cat ? catById(cat)?.name || '' : ''} ${new Date().toISOString().slice(0, 10)}`;
  // PDF und JPEG brauchen Weiß, PNG darf durchsichtig sein
  const render1 = async (f) => {
    const bg = exp.bg === 'grid' ? f.bg : 'none';
    const cv = await b.renderBox(f.box, exportWidth(f.fmt), bg, f.ly, f.lf);
    if (bg === 'none' && exp.fmt !== 'png') {
      const white = document.createElement('canvas');
      white.width = cv.width; white.height = cv.height;
      const ctx = white.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(cv, 0, 0);
      return white;
    }
    return cv;
  };
  if (exp.fmt === 'pdf') {
    const pages = [];
    for (const f of list) pages.push({ cv: await render1(f), landscape: f.fmt === 'a4l' });
    const pdf = await toPdf(pages);
    return deliver([new File([pdf], fileName(base, 'pdf'), { type: 'application/pdf' })]);
  }
  const ext = exp.fmt === 'png' ? 'png' : 'jpg';
  const files = [];
  for (const f of list) {
    const blob = await toImage(await render1(f), exp.fmt);
    files.push(new File([blob], fileName(`${base} ${list.length > 1 ? f.n + 1 : ''}`, ext), { type: blob.type }));
  }
  return deliver(files);
}

// ---------- Ansicht ----------
// Canvas eines Notiz-Ordners (fid '' = Ohne Kategorie)
export function renderInk(fid) {
  if (cat !== fid) { leaveInk(); start(fid); }
  if (status === 'error') return '<div class="ink-slot"><p class="empty ink-msg">Der Canvas ist gerade nicht erreichbar. Bitte später nochmal versuchen.</p></div>';
  if (!top()) return '<div class="ink-slot"><p class="center muted ink-msg">Lädt …</p></div>';
  return `${inkBar()}<div class="ink-slot">
    <p class="ink-hint" ${stack.length === 1 && top().board.isEmpty ? '' : 'hidden'}>Mit dem Stift schreiben, mit dem Finger verschieben, mit zwei Fingern zoomen. Etwas mit der Auswahl umkreisen und „Als Titel“ wählen: der Titel öffnet eine eigene Seite und lässt sich ziehen (mit dem Finger: lange drücken). Oben rechts mit „Bereich“ ein A4-Blatt markieren und später speichern.</p>
  </div>`;
}

// nach dem Neuzeichnen: die bestehende Zeichenfläche wieder einhängen (Striche bleiben erhalten)
export function mountInk() {
  active = true;
  const slot = $app.querySelector('.ink-slot');
  const page = top();
  if (!slot || !page) return;
  slot.prepend(page.board.el);
  page.board.attach();
  page.board.refreshNotes();   // Notizen können sich inzwischen geändert haben (auch durch die andere Person)
  updateTools();
}

// Canvas verlassen (anderer Ordner, Notizen-Ansicht, anderer Bereich, Abmelden):
// speichern, nicht mehr benutzte Bilder entfernen; beim nächsten Öffnen frisch laden (Änderungen der anderen Person)
export function leaveInk() {
  active = false;
  fitViewport();
  stack.splice(0).reverse().forEach(closePage);
  cat = null;
  status = 'idle';
}

// Bildschirmtastatur (iPad): die App auf den sichtbaren Teil begrenzen, damit Kopf- und Werkzeugleiste stehen bleiben
// und die Zeichenfläche darunter kleiner wird; das Eingabefeld bleibt dabei im Blick
const vv = window.visualViewport;
function fitViewport() {
  const app = document.getElementById('app');
  if (!app) return;
  const keyboard = active && vv && vv.height < window.innerHeight - 80;
  app.style.height = keyboard ? vv.height + 'px' : '';
  app.style.transform = keyboard && vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
  if (keyboard) requestAnimationFrame(() => top()?.board.reveal());
}
vv?.addEventListener('resize', fitViewport);
vv?.addEventListener('scroll', fitViewport);

// Abmelden: nichts von dieser Person im Speicher lassen
export function resetInk() {
  active = false;
  stack.splice(0).forEach((p) => { clearTimeout(p.timer); p.board.destroy(); });
  cat = null;
  status = 'idle';
}

// Kopfzeile einer Unterseite: zurück + handschriftlicher Titel (sonst null: normale Ordner-Kopfzeile)
export function inkHead() {
  if (stack.length < 2) return null;
  const note = top().note && itemById(top().note);
  return `<button class="ph-back" data-act="ink-back" aria-label="Zurück">${ICON.chevL}</button>${note ? `<b class="ph-t">${esc(note.title) || 'Ohne Titel'}</b>` : titleSvg(top().title)}`;
}

const tb = (act, icon, label, { on = false, dis = false, id = '', cls = '' } = {}) =>
  `<button class="dk ink-b ${on ? 'on' : ''} ${cls}" data-act="${act}" ${id ? `data-id="${id}"` : ''} aria-label="${label}" title="${label}" ${dis ? 'disabled' : ''}>${ICON[icon]}</button>`;

// rechts in der Kopfleiste: Rückgängig, Wiederholen, Bereich, Speichern, Finger, Gliederung
export function inkHeadTools() {
  const b = top()?.board;
  return `<div class="ph-ink">
    ${tb('ink-undo', 'undo', 'Rückgängig', { dis: !b?.canUndo })}
    ${tb('ink-redo', 'redo', 'Wiederholen', { dis: !b?.canRedo })}
    ${tb('ink-frame', 'frame', 'Bereich (A4) anlegen', { cls: 'wide-only' })}
    ${tb('ink-export', 'download', 'Speichern als PDF, PNG, JPEG', { cls: 'wide-only' })}
    ${tb('ink-more', 'dots', 'Mehr', { cls: 'narrow-only' })}
    <i class="ink-sep"></i>
    ${tb('ink-finger', 'hand', 'Mit Finger schreiben', { on: ui.finger })}
    ${tb('ink-tree', 'tree', 'Gliederung')}
  </div>`;
}

// Werkzeugleiste unter der Kopfleiste (einfahrbar): links Textmarker, Formen, Bemaßung, Bild, Farben, Zoom;
// rechts der Umschalter Text / Stift / Radierer und ganz rechts eigens die Auswahl. Solange ausgewählt wird,
// ruht der Rest (nur Farbe und Stärke wirken auf das Ausgewählte, Zoom bleibt)
function inkBar() {
  const kind = kindOf(), cur = ui[kind];
  const tool = (id, icon, label) => tb('ink-tool', icon, label, { id, on: ui.tool === id });
  const seg = (id, icon, label) => `<button class="${ui.tool === id ? 'on' : ''}" data-act="ink-tool" data-id="${id}" aria-label="${label}" title="${label}">${ICON[icon]}</button>`;
  const selecting = ui.tool === 'lasso';
  return `<div class="ink-bar ${ui.bar ? '' : 'closed'} ${selecting ? 'selecting' : ''}">
    <div class="ink-tools"><div class="ink-tools-in">
      ${tool('marker', 'marker', 'Textmarker')}
      ${tool('shape', SHAPE_ICON[ui.shape], 'Formen')}
      ${tool('dim', 'ruler', 'Bemaßung')}
      ${tb('ink-img', 'image', 'Bild hinzufügen')}
      <i class="ink-sep"></i>
      <div class="ink-pens">
        ${ui.recent.map((c, i) => `<button class="ink-dot ${cur.c === c ? 'on' : ''}" data-act="ink-color" data-id="${i}" style="--c:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}
        <button class="ink-penchip" data-act="ink-pen" style="--c:${cur.c};--w:${penDot(kind, cur.w)}" aria-label="Farbe und Stärke" title="Farbe und Stärke"><i></i></button>
      </div>
      <i class="ink-sep"></i>
      ${tb('ink-zoom', 'minus', 'Verkleinern', { id: 'out' })}
      ${tb('ink-zoom', 'plus', 'Vergrößern', { id: 'in' })}
      <div class="ink-right">
        <div class="seg-view ink-seg">${seg('text', 'text', 'Text')}${seg('pen', 'pen', 'Zeichnen')}${seg('eraser', 'eraser', 'Radieren')}</div>
        <button class="ink-select ${selecting ? 'on' : ''}" data-act="ink-tool" data-id="lasso" aria-pressed="${selecting}" aria-label="Auswählen" title="Auswählen: antippen oder umkreisen">${ICON.lasso}<span>Auswahl</span></button>
      </div>
    </div></div>
    <button class="ink-fold" data-act="ink-fold" aria-expanded="${ui.bar}" aria-label="Werkzeuge ein- oder ausfahren" title="Werkzeuge">${ICON.chevD}<span>Werkzeuge</span></button>
  </div>`;
}
