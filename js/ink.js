// Canvas der Notiz-Ordner: ein Heft aus A4-Seiten (ink-pages.js). Jede Kategorie hat eine Startseite, die mit der Deckseite
// beginnt (Homescreen-Ausschnitt für die Kachel, Notizen-Bereich); Titel öffnen eigene Unterseiten (beliebig tief),
// jede Notiz hat eine Unterseite mit ihrer Beschreibung. Neue Seiten mit Format, Muster und Vorlage; Speichern als PDF, PNG, JPEG.
import { $app, askConfirm, catById, esc, isCanvasOnly, itemById, safeColor, sb, state, store, toast } from './core.js';
import { createNote, deleteItem, trashItems } from './data.js';
import { ICON } from './icons.js';
import { createBoard } from './ink-board.js';
import { drawFrameBg, FONTS, FRAME_BG, GRID, SHAPES, WEIGHTS } from './ink-draw.js';
import { deliver, exportWidth, fileName, toImage, toPdf } from './ink-export.js';
import { drawFrameLayout, FRAME_LAYOUTS, LAYOUT_FIELDS } from './ink-layout.js';
import { bindLayers, layersAction, layersHtml } from './ink-layers.js';
import { isPage, preparePages } from './ink-pages.js';
import { nameSticker, openStickers } from './ink-stickers.js';
import { clampSize, cleanText, KINDS, openPenPanel, PALETTE } from './ink-pen.js';
import { deletePageTree, deserialize, FRAME_NAMES, FRAMES, loadChild, loadRoot, placeSticker, removeImages, savePage, saveSticker, serialize, titleIn, uploadImage } from './ink-store.js';
import { openTree, titleSvg } from './ink-tree.js';
import { calCardHtml, calColor, drawCalCard, nextCalSize, openCalOf, pickCalEvent } from './ink-cal.js';
import { bellCardHtml, bellColor, drawBellCard, openBellOf } from './ink-remind.js';
import { askReminder, createReminder } from './remind-page.js';
import { openItem } from './items.js';
import { busy, LOADER } from './loader.js';
import { dropMenu } from './menu.js';
import { notesIn } from './notes.js';
import { render } from './render.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';

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
  eraser: [5, 9, 18].includes(+saved.e) ? +saved.e : 9,
  finger: store('inkFinger') === '1',
  bar: store('inkBar') !== '0',
  layers: store('inkLayers') === '1',   // Fenster „Ebenen“ offen
};
const saveStyle = () => store('inkStyle', JSON.stringify({ pen: ui.pen, marker: ui.marker, text: ui.text, r: ui.recent, e: ui.eraser }));
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

async function removeNote(id) {
  if (!(await deleteItem(id))) return;   // fragt nach; die Unterseite der Notiz löscht deleteItem mit
  stack.forEach((p) => p.board.refreshNotes());
}

// ---------- Seiten öffnen und schließen ----------
// note: Notiz, zu der die Seite gehört (ihre Unterseite)
function openPage(row, note = null) {
  const isRoot = !stack.length;
  const { items: raw, v, layers, fix } = deserialize(row.data);
  const { items, changed } = preparePages(raw, { v, root: isRoot, notes: isRoot && !isCanvasOnly(cat) });
  const page = { id: row.id, note, title: titleIn(row.title), atOpen: new Set(), uploaded: new Set(), timer: null, pending: null };
  const root = isRoot ? { notes: noteList, onNote: (id) => openNote(page, id), onNoteAdd: () => createNote(cat || null), onNoteDelete: removeNote } : {};
  const sub = note ? { desc: () => itemById(note)?.body?.trim() || '', onDesc: () => openItem(note) } : {};
  page.board = createBoard({
    ...root,
    ...sub,
    items,
    layers,
    fix,
    onLayers: () => refreshLayers(),
    onPage: () => refreshLayers(),
    colors: PALETTE,
    hold,
    onTool: (t) => { ui.tool = t; render(); },
    onSelect: () => updateContext(),
    onView: (at) => { ui.atOrigin = at; $app.querySelector('.ctx-origin')?.classList.toggle('at', at); },
    onCommit: (list, hh, ww) => { page.pending = { list, hh, ww }; scheduleSave(page); updateTools(); },
    onOpenTitle: (it) => openTitle(page, it),
    onDeleteTitles: deleteTitles,
    onExport: (n) => openExport([n]),
    onAddPage: (at) => openAddPage(at),
    onConfirm: (q) => askConfirm(q, 'Löschen'),
    onEditLayout: editLayoutSheet,
    // Termin-Felder (ink-cal.js)
    // Felder: Termin (c, ink-cal.js) und Erinnerung (b, ink-remind.js)
    cardHtml: (it) => (it.t === 'b' ? bellCardHtml(it) : calCardHtml(it)),
    cardColor: (it) => (it.t === 'b' ? bellColor(it) : calColor(it)),
    drawCard: (ctx, it) => (it.t === 'b' ? drawBellCard(ctx, it) : drawCalCard(ctx, it)),
    nextSize: nextCalSize,
    onCard: (it) => { flushAll(); if (it.t === 'b') openBellOf(it); else openCalOf(it); },
    onCardDelete: (it) => { if (it.t === 'b' && itemById(it.rem)) trashItems([it.rem]); },   // Feld weg = Erinnerung in den Papierkorb
    onRemind: (box, text) => remindSelection(page, box, text),
    onSticker: async (cv, name) => { try { await nameSticker(await saveSticker(cv, cv.width, cv.height), name); toast('Als Sticker gespeichert.'); } catch (e) { toast('Sticker konnte nicht gespeichert werden: ' + (e.message || e), 4000); } },
  });
  page.board.imagePaths().forEach((p) => page.atOpen.add(p));
  stack.push(page);
  if (changed) { page.pending = { list: items, hh: 0, ww: 0 }; scheduleSave(page); }   // zu Seiten umgebaut bzw. ergänzt: gleich speichern
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
    const row = await busy(loadRoot(fid));
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

// aus der Seitenübersicht: zurück zur Startseite, dann Titel für Titel hinein; frame: Seite, die gezeigt werden soll
async function openPath(path, frame) {
  while (stack.length > 1) closePage(stack.pop());
  for (const it of path) if (!(await (it.note ? openNote(top(), it.note, true) : openTitle(top(), it, true)))) return render();
  render();
  if (frame !== undefined) top().board.showPage(frame);
}

// Titel aus der Gliederung löschen: Unterseite samt Inhalt weg, Titel von seiner Seite entfernen
async function removeTitle(row, it) {
  if (!(await deleteTitles([it]))) return false;
  while (stack.length > 1 && stack.some((p) => p.id === it.page)) closePage(stack.pop());   // gelöschte Seite war offen
  const open = stack.find((p) => p.id === row.id);
  if (open) { open.board.removeTitle(it.page); render(); return true; }
  const d = deserialize(row.data);
  const rest = d.items.filter((o) => !(o.t === 't' && o.page === it.page));
  row.data = serialize(rest, d.h, d.w, d);
  const err = await savePage(row.id, rest, d.h, d.w, d);
  if (err) { toast('Speichern fehlgeschlagen: ' + err.message); return false; }
  return true;
}

// Seite umbenennen (aus der Seitenübersicht): offenes Heft direkt, sonst im gespeicherten
async function renameFrame(row, n, name) {
  const open = stack.find((p) => p.id === row.id);
  if (open) { open.board.renameFrame(n, name); return null; }
  const d = deserialize(row.data);
  const f = d.items.filter(isPage)[n];
  if (!f) return null;
  if (name) f.n = name; else delete f.n;
  row.data = serialize(d.items, d.h, d.w, d);
  return savePage(row.id, d.items, d.h, d.w, d);
}

// Angaben im Layout eines Bereichs (Dudek-CI): Titel, Projekt, Projektnummer, Kontakt
function editLayoutSheet(lf) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const sheet = openSheet(`<div class="sheet-head"><h2>Layout-Angaben</h2>${sheetActs({ save: true })}</div>
      ${LAYOUT_FIELDS.map(([k, l]) => `<div class="field"><label for="lf-${k}">${l}</label><input class="input" id="lf-${k}" maxlength="80" value="${esc(lf[k] || '')}"></div>`).join('')}
`, { onClose: () => finish(null) });
    const read = () => Object.fromEntries(LAYOUT_FIELDS.map(([k]) => [k, sheet.querySelector('#lf-' + k).value.trim().slice(0, 80)]).filter(([, v]) => v));
    sheet.querySelector('[data-save]').addEventListener('click', () => { finish(read()); closeSheet(); });
    sheet.querySelector('[data-close]').addEventListener('click', closeSheet);   // ohne Übernehmen
  });
}

// Seitenübersicht: Seiten des geöffneten Hefts als Vorschaubilder (öffnen, verschieben, löschen, neue Seite),
// darunter Notizen, Seiten und Titel aller Unterseiten
function openOutlineTree() {
  flushAll();
  const b = top()?.board;
  openTree({
    cat, open: stack.map((p) => p.id), notes: noteList(),
    pages: b && {
      list: () => b.frames(),
      thumb: (f, w) => b.renderBox(f.box, w, f),
      onShow: (n) => b.showPage(n),
      onMove: (n, d) => b.movePage(n, d),
      onDelete: (n) => b.deletePage(n),
      onAdd: () => openAddPage(b.frames().length),
    },
    onOpen: openPath, onRename: renameFrame, onShow: showOutline,
    onDeleteTitle: async (row, it) => { const ok = await removeTitle(row, it); if (ok) openOutlineTree(); },
    onDeleteNote: async (id) => { await removeNote(id); openOutlineTree(); },
  });
}

// Titel und Notizen auf der Fläche hervorheben
function showOutline() {
  if (!top()?.board.showOutline()) toast('Hier gibt es noch keine Titel.');
  else toast('Antippen beendet die Übersicht.');
}

// schmale Kopfleiste (Smartphone): Termin, neue Seite und Speichern im Menü „Mehr“
function openMore(btn) {
  dropMenu(btn, `<button class="cm-i" data-a="ink-cal">${ICON.calendar}<span>Termin einfügen</span></button>
    <button class="cm-i" data-a="ink-page">${ICON.plus}<span>Neue Seite</span></button>
    <button class="cm-i" data-a="ink-export">${ICON.download}<span>Speichern als PDF, PNG, JPEG</span></button>`, (b) => inkAction(b.dataset.a));
}

// ---------- Neue Seite: Vorlage, Format, Muster und Stelle wählen (zuletzt gewählte Art bleibt gemerkt) ----------
function lastKind() {
  try {
    const k = JSON.parse(store('inkPageKind')) || {};
    return { fmt: FRAMES[k.fmt] && k.fmt !== 'home' ? k.fmt : 'a4p', bg: FRAME_BG.some(([v]) => v === k.bg) ? k.bg : '', ly: FRAME_LAYOUTS.some(([v]) => v === k.ly) ? k.ly : '' };
  } catch { return { fmt: 'a4p', bg: '', ly: '' }; }
}

// kleine Vorschau einer Seitenart
function pagePreview(cv, { fmt, bg, ly }, w) {
  const [pw, ph] = FRAMES[fmt], k = w / pw, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(ph * k * dpr);
  cv.style.width = w + 'px'; cv.style.height = ph * k + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
  drawFrameBg(ctx, [0, 0, pw, ph], bg || (ly ? 'blank' : 'grid'), k * 1.6);
  if (ly) drawFrameLayout(ctx, [0, 0, pw, ph], ly, {});
}

function openAddPage(at) {
  const b = top()?.board;
  if (!b) return;
  const kind = lastKind(), here = b.currentPage(), count = b.frames().length;
  let pos = at >= count ? 'end' : 'after';
  const after = at < count ? at - 1 : here;   // nach dieser Seite (bei „Nach …“)
  const chip = (key, v, label, on) => `<button type="button" class="pp-chip ${on ? 'on' : ''}" data-k="${key}" data-v="${v}">${esc(label)}</button>`;
  const sheet = openSheet(`<div class="sheet-head"><h2>Neue Seite</h2>${sheetActs({ save: true, saveLabel: 'Einfügen' })}</div>
    <div class="np-wrap"><div class="np-prev"><canvas></canvas></div><div class="np-side">
      <div class="np-h">Vorlage</div><div class="pp-chips" data-g="ly"></div>
      <div class="np-h">Format</div><div class="pp-chips" data-g="fmt"></div>
      <div class="np-h">Muster</div><div class="np-bgs" data-g="bg"></div>
      <div class="np-h">Einfügen</div><div class="pp-chips" data-g="pos"></div>
    </div></div>`);
  sheet.classList.add('np-sheet');
  const names = b.frames();
  function draw() {
    sheet.querySelector('[data-g="ly"]').innerHTML = FRAME_LAYOUTS.map(([k, l]) => chip('ly', k, l.replace('Dudek · ', ''), kind.ly === k)).join('');
    sheet.querySelector('[data-g="fmt"]').innerHTML = chip('fmt', 'a4p', 'A4 hoch', kind.fmt === 'a4p') + chip('fmt', 'a4l', 'A4 quer', kind.fmt === 'a4l');
    sheet.querySelector('[data-g="pos"]').innerHTML = chip('pos', 'after', `Nach „${names[after]?.name || 'Seite'}“`, pos === 'after') + chip('pos', 'end', 'Am Ende', pos === 'end');
    const bgs = sheet.querySelector('[data-g="bg"]');
    bgs.innerHTML = FRAME_BG.map(([k, l]) => `<button type="button" class="np-bg ${kind.bg === k ? 'on' : ''}" data-k="bg" data-v="${k}"><canvas></canvas><span>${l}</span></button>`).join('');
    bgs.querySelectorAll('canvas').forEach((cv, i) => pagePreview(cv, { fmt: 'a4p', bg: FRAME_BG[i][0], ly: '' }, 54));
    pagePreview(sheet.querySelector('.np-prev canvas'), kind, kind.fmt === 'a4l' ? 240 : 170);
  }
  draw();
  sheet.addEventListener('click', (e) => {
    const c = e.target.closest('[data-k]');
    if (c) { if (c.dataset.k === 'pos') pos = c.dataset.v; else kind[c.dataset.k] = c.dataset.v; draw(); return; }
    if (e.target.closest('[data-close]')) return closeSheet();
    if (!e.target.closest('[data-save]')) return;
    store('inkPageKind', JSON.stringify(kind));
    closeSheet();
    b.addPage(kind, pos === 'end' ? count : after + 1);
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
  const err = await savePage(page.id, list, hh, ww, page.board.layerMeta());
  if (err) { page.pending ??= { list, hh, ww }; toast('Speichern fehlgeschlagen: ' + err.message, 4000); return; }
  if (page === stack[0]) updateHomeImg(page);
}

// Homescreen-Ausschnitt auf der Deckseite: sein Inhalt wird als Bild für die Kachel des Ordners gespeichert (leer: kein Bild)
const HOME_W = 640;   // Breite des Bildes in Pixel
async function updateHomeImg(page) {
  const box = page.board.homeBox();
  const url = box ? (await page.board.renderBox(box, HOME_W, { bg: 'blank' })).toDataURL('image/jpeg', .8) : null;
  if ((state.homeImgs[cat ?? ''] || null) === url) return;
  state.homeImgs[cat ?? ''] = url;
  sb.from('ink_pages').update({ home_img: url }).eq('id', page.id).then(() => {});
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
  b.setEraser(ui.eraser);
  b.setFinger(ui.finger);
}

function updateTools() {
  const b = top()?.board;
  document.querySelectorAll('[data-act="ink-undo"]').forEach((x) => { x.disabled = !b?.canUndo; });
  document.querySelectorAll('[data-act="ink-redo"]').forEach((x) => { x.disabled = !b?.canRedo; });
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

// Sticker aus der Sammlung auf die Seite (als Kopie im Ordner des Canvas, obenauf)
async function insertSticker(path) {
  const page = top();
  if (!page) return;
  try {
    const img = await busy(placeSticker(path, cat));
    page.uploaded.add(img.path);
    page.board.addImage(img, { top: true, size: 260 });
  } catch (e) {
    toast('Sticker konnte nicht eingefügt werden: ' + (e.message || e), 4000);
  }
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
    openPenPanel($app.querySelector('[data-act="ink-pen"]') || btn, sk.kind, sk.val, (v) => b.styleSelection(sk.kind, v), () => { remember(sk.val.c); updateContext(); });
    return;
  }
  if (!DRAW.includes(ui.tool)) { ui.tool = 'pen'; applyUi(); render(); }
  const kind = kindOf();
  const anchor = $app.querySelector('[data-act="ink-pen"]') || btn;
  openPenPanel(anchor, kind, ui[kind], (v) => {
    ui[kind] = v;
    applyUi();
    updateContext();
  }, () => { remember(ui[kind].c); saveStyle(); updateContext(); });
}
const remember = (c) => { ui.recent = [c, ...ui.recent.filter((x) => x !== c)].slice(0, 3); };

// ---------- Eigenschaften-Leiste unten (wie in Illustrator): zeigt, was zum Werkzeug bzw. zur Auswahl passt ----------
const TOOL_LABEL = { pen: 'Stift', marker: 'Textmarker', text: 'Text', shape: 'Form', dim: 'Bemaßung', eraser: 'Radierer', lasso: 'Auswahl' };
const ACTION = { title: ['chevR', 'Als Titel'], edit: ['pen', 'Bearbeiten'], crop: ['crop', 'Zuschneiden'], unerase: ['undo', 'Radiertes zurück'],
  group: ['stack', 'Gruppieren'], ungroup: ['stack', 'Aufheben'], copy: ['copy', 'Kopieren'], sticker: ['sticker', 'Als Sticker'], remind: ['bell', 'Erinnern'], delete: ['trash', 'Löschen'] };
const ERASERS = [[5, 'Fein'], [9, 'Mittel'], [18, 'Breit']];

// was die Leiste gerade einstellt: { kind, val } aus der Auswahl oder dem Werkzeug (null: nichts mit Farbe)
function contextTarget() {
  const b = top()?.board;
  if (b?.hasSelection) return b.selectionKind();
  if (!DRAW.includes(ui.tool)) return null;
  const kind = kindOf();
  return { kind, val: ui[kind] };
}

function contextHtml() {
  const b = top()?.board;
  const t = contextTarget(), selecting = !!b?.hasSelection;
  const btn = (id, html, { on = false, label = '', cls = '', style = '' } = {}) =>
    `<button class="ctx-b ${on ? 'on' : ''} ${cls}" data-act="ink-ctx" data-id="${id}" ${label ? `aria-label="${label}" title="${label}"` : ''} ${style ? `style="${style}"` : ''}>${html}</button>`;
  const out = [`<span class="ctx-l">${selecting ? 'Auswahl' : TOOL_LABEL[ui.tool] || ''}</span>`];
  if (!selecting && ui.tool === 'shape') out.push(`<div class="ctx-g">${SHAPES.map(([k, l]) => btn('shape:' + k, ICON[SHAPE_ICON[k]], { on: ui.shape === k, label: l })).join('')}</div>`);
  if (t) {
    const colors = [...new Set([t.val.c, ...ui.recent])].slice(0, 4);
    out.push(`<div class="ctx-g">${colors.map((c) => btn('c:' + c, '', { on: c === t.val.c, cls: 'ctx-c', style: `--c:${c}`, label: 'Farbe' })).join('')}
      <button class="ctx-b ctx-more" data-act="ink-pen" aria-label="Alle Farben" title="Alle Farben"></button></div>`);
    if (t.kind === 'text') {
      const ff = FONTS[t.val.ff] ? t.val.ff : 'sans';
      out.push(`<div class="ctx-g">${Object.entries(FONTS).map(([k, f]) => btn('ff:' + k, 'Aa', { on: ff === k, label: f.label, style: `font-family:${f.css}` })).join('')}</div>`);
      out.push(`<div class="ctx-g">${FONTS[ff].weights.map((w) => btn('fw:' + w, WEIGHTS[w], { on: t.val.fw === w, cls: 'ctx-t', style: `font-weight:${w}` })).join('')}
        ${btn('i:', 'I', { on: !!t.val.i, label: 'Kursiv', cls: 'ctx-t ctx-i' })}</div>`);
    } else {
      out.push(`<div class="ctx-g">${KINDS[t.kind].presets.slice(0, 4).map((w) => btn('w:' + w, `<i style="--w:${Math.max(2, Math.min(18, w * (t.kind === 'marker' ? .55 : 1.5)))}px"></i>`,
        { on: Math.abs(t.val.w - w) < .05, cls: 'ctx-w', label: `Stärke ${w}` })).join('')}<span class="ctx-v">${(+t.val.w).toLocaleString('de-AT', { maximumFractionDigits: 1 })}</span></div>`);
    }
  }
  if (!selecting && ui.tool === 'eraser') out.push(`<div class="ctx-g">${ERASERS.map(([r, l]) => btn('er:' + r, l, { on: ui.eraser === r, cls: 'ctx-t' })).join('')}</div>`);
  if (selecting) out.push(`<div class="ctx-g">${b.selectionActions().map((a) => btn('act:' + a, `${ICON[ACTION[a][0]]}<span>${ACTION[a][1]}</span>`, { cls: `ctx-a ${a === 'delete' ? 'danger' : ''}` })).join('')}</div>`);
  out.push(btn('origin', ICON.target, { cls: `ctx-origin ${ui.atOrigin ? 'at' : ''}`, label: 'Ursprungsansicht' }));
  return out.join('<i class="ctx-sep"></i>');
}

function updateContext() {
  const el = $app.querySelector('.ink-ctx');
  if (el) el.innerHTML = contextHtml();
}

// Tipp in der Eigenschaften-Leiste: wirkt auf die Auswahl, sonst auf das Werkzeug (und wird gemerkt)
function contextAction(id) {
  const b = top()?.board;
  if (!b) return;
  const [k, v] = [id.slice(0, id.indexOf(':') < 0 ? id.length : id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  if (k === 'origin') return b.resetView();
  if (k === 'act') return b.runAction(v);
  if (k === 'shape') { ui.shape = v; store('inkShape', v); applyUi(); return updateContext(); }
  if (k === 'er') { ui.eraser = +v; saveStyle(); applyUi(); return updateContext(); }
  const t = contextTarget();
  if (!t) return;
  const patch = k === 'c' ? { c: safeColor(v, t.val.c) } : k === 'w' ? { w: clampSize(t.kind, v) } : k === 'ff' ? { ff: v } : k === 'fw' ? { fw: +v } : { i: !t.val.i };
  if (b.hasSelection) b.styleSelection(t.kind, patch);   // ruft über onSelect auch updateContext auf
  else {
    ui[t.kind] = t.kind === 'text' ? cleanText({ ...ui.text, ...patch }) : { ...ui[t.kind], ...patch };
    if (patch.c) remember(patch.c);
    saveStyle();
    applyUi();
    updateContext();
  }
}

// ---------- Fenster „Ebenen“ (ink-layers.js) ----------
const layerCtx = () => { const b = top()?.board; return { board: b, page: b?.currentPage() ?? 0, refresh: refreshLayers, editLayout: (n) => b?.editPageLayout(n) }; };
function refreshLayers() {
  const el = $app.querySelector('.ink-layers'), b = top()?.board;
  if (el && b) el.innerHTML = layersHtml(b, b.frames()[b.currentPage()]);
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
    case 'ink-ctx': contextAction(id); return;
    case 'ink-layers': ui.layers = !ui.layers; store('inkLayers', ui.layers ? '1' : '0'); break;
    case 'ink-ly': if (id === 'close') { ui.layers = false; store('inkLayers', '0'); break; } layersAction(id, btn, layerCtx()); return;
    case 'ink-pen': openPen(btn); return;
    case 'ink-tree': openOutlineTree(); return;
    case 'ink-more': openMore(btn); return;
    case 'ink-notes': if (isCanvasOnly(state.list)) state.list = null; state.noteMode = 'text'; render(); return;   // reiner Canvas: zurück zu den Ordnern
    case 'ink-finger': ui.finger = !ui.finger; store('inkFinger', ui.finger ? '1' : '0'); toast(ui.finger ? 'Mit dem Finger schreiben, mit zwei Fingern verschieben und zoomen' : 'Stift und Maus schreiben, der Finger verschiebt'); break;
    case 'ink-undo': b?.undo(); return;
    case 'ink-redo': b?.redo(); return;
    case 'ink-img': picker.click(); return;
    case 'ink-sticker': openStickers({ onPick: insertSticker }); return;
    case 'ink-cal': pickCalEvent().then((c) => { if (c) top()?.board.addCard(c); }); return;
    case 'ink-page': if (b) openAddPage(b.currentPage() + 1); return;
    case 'ink-fold': toggleBar(); return;
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

// Fenster „Speichern“: links Seiten, Vorlage (auch nachträglich) mit ihren Angaben, Format und Hintergrund; rechts große Vorschau
function openExport(preselect) {
  const b = top()?.board;
  if (!b) return;
  let frames = b.frames();
  const chosen = new Set(preselect ?? frames.map((f) => f.n));
  let cur = preselect?.[0] ?? frames[0].n;   // Bereich in der Vorschau
  const sheet = openSheet(`<div class="sheet-head"><h2>Speichern</h2>${sheetActs()}</div>
    <div class="exp-wrap"><div class="exp-side"></div><div class="exp-prev"><div class="exp-host"></div><div class="exp-nav"></div></div></div>`, { full: true });
  sheet.classList.add('exp-sheet');
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  const side = sheet.querySelector('.exp-side'), host = sheet.querySelector('.exp-host'), nav = sheet.querySelector('.exp-nav');
  const frame = () => frames.find((f) => f.n === cur);
  const seg = (key, opts) => `<div class="seg-view exp-seg" data-key="${key}">${opts.map(([v, l]) => `<button type="button" class="${exp[key] === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const goLabel = () => `${ICON.download} ${chosen.size === 1 ? 'Seite' : `${chosen.size} Seiten`} speichern`;
  const note = () => (exp.bg === 'none' ? (exp.fmt === 'png' ? 'PNG ohne Hintergrund ist durchsichtig.' : 'Ohne Kästchen, Linien oder Punkte, auf Weiß.') : 'Jede Seite mit ihrem Muster und ihrer Vorlage.');

  function renderSide() {
    const f = frame();
    side.innerHTML = `
      <div class="exp-h">Seiten</div>
      <div class="exp-list">${frames.map((x) => `<div class="exp-item ${x.n === cur ? 'cur' : ''}">
        <button class="exp-chk ${chosen.has(x.n) ? 'on' : ''}" data-chk="${x.n}" aria-label="Mitspeichern" title="Mitspeichern">${ICON.check}</button>
        <button class="exp-name" data-show="${x.n}"><span>${esc(x.name)}</span><small>${FRAME_NAMES[x.fmt] || 'A4 hoch'}</small></button></div>`).join('')}</div>
      <div class="exp-h">Vorlage <small>für „${esc(f.name)}“</small></div>
      <div class="pp-chips">${FRAME_LAYOUTS.map(([k, l]) => `<button type="button" class="pp-chip ${(f.ly || '') === k ? 'on' : ''}" data-ly="${k}">${esc(l.replace('Dudek · ', ''))}</button>`).join('')}</div>
      ${f.ly ? `<div class="exp-fields">${LAYOUT_FIELDS.map(([k, l]) => `<label><span>${l}</span><input class="input" data-lf="${k}" maxlength="80" value="${esc(f.lf?.[k] || '')}"></label>`).join('')}</div>` : ''}
      <div class="exp-h">Format</div>${seg('fmt', [['pdf', 'PDF'], ['png', 'PNG'], ['jpeg', 'JPEG']])}
      <div class="exp-h">Muster</div>${seg('bg', [['grid', 'Mit Muster'], ['none', 'Ohne']])}
      <p class="hint exp-note">${note()}</p>
      <button class="btn block" id="exp-go" ${chosen.size ? '' : 'disabled'}>${goLabel()}</button>`;
  }

  // Vorschau der gewählten Seite; nur die jüngste Anfrage wird gezeigt
  let token = 0;
  async function renderPreview() {
    const f = frame(), t = ++token;
    const bg = exp.bg === 'grid' ? f.bg : 'none';
    const w = Math.min(1200, Math.max(300, host.clientWidth || 500) * Math.min(2, window.devicePixelRatio || 1));
    const cv = await b.renderBox(f.box, w, { ...f, bg });
    if (t !== token) return;
    cv.className = `exp-cv ${f.fmt} ${bg === 'none' ? 'clear' : ''}`;
    host.replaceChildren(cv);
    const i = frames.indexOf(f);
    nav.innerHTML = frames.length > 1 ? `<button class="exp-arrow" data-step="-1" ${i ? '' : 'disabled'} aria-label="Vorige Seite">${ICON.chevL}</button>
      <span>${i + 1} / ${frames.length}</span><button class="exp-arrow" data-step="1" ${i < frames.length - 1 ? '' : 'disabled'} aria-label="Nächste Seite">${ICON.chevR}</button>` : '';
  }
  const show = (n) => { cur = n; renderSide(); renderPreview(); };
  const refresh = () => { frames = b.frames(); };
  renderSide();
  requestAnimationFrame(renderPreview);

  // Angaben der Vorlage: kurz nach dem Tippen übernehmen, Liste und Vorschau aktualisieren (Eingabefeld behält den Fokus)
  let typing = 0;
  side.addEventListener('input', (e) => {
    if (!e.target.dataset.lf) return;
    clearTimeout(typing);
    typing = setTimeout(() => {
      const lf = Object.fromEntries([...side.querySelectorAll('[data-lf]')].map((i) => [i.dataset.lf, i.value.trim().slice(0, 80)]).filter(([, v]) => v));
      b.setFrameInfo(cur, lf);
      refresh();
      side.querySelector('.exp-item.cur .exp-name span').textContent = frame().name;
      side.querySelector('.exp-h small').textContent = `für „${frame().name}“`;
      renderPreview();
    }, 350);
  });

  sheet.addEventListener('click', async (e) => {
    const chk = e.target.closest('[data-chk]');
    if (chk) {
      const n = +chk.dataset.chk;
      chosen.has(n) ? chosen.delete(n) : chosen.add(n);
      chk.classList.toggle('on', chosen.has(n));
      const go = side.querySelector('#exp-go');
      go.innerHTML = goLabel(); go.disabled = !chosen.size;
      return;
    }
    const sh = e.target.closest('[data-show]');
    if (sh) return show(+sh.dataset.show);
    const st = e.target.closest('[data-step]');
    if (st) return show(frames[frames.indexOf(frame()) + +st.dataset.step].n);
    const ly = e.target.closest('[data-ly]');
    if (ly) { b.setFrameLayout(cur, ly.dataset.ly); refresh(); renderSide(); renderPreview(); return; }
    const sb = e.target.closest('.exp-seg button');
    if (sb) {
      exp[sb.parentElement.dataset.key] = sb.dataset.v;
      sb.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === sb));
      side.querySelector('.exp-note').textContent = note();
      renderPreview();
      return;
    }
    const go = e.target.closest('#exp-go');
    if (!go) return;
    const list = frames.filter((f) => chosen.has(f.n));
    if (!list.length) return;
    go.disabled = true;
    go.textContent = 'Wird erstellt …';
    try {
      await runExport(b, list);
      closeSheet();
    } catch (err) {
      toast('Speichern fehlgeschlagen: ' + (err.message || err), 4000);
      go.disabled = false;
      go.innerHTML = goLabel();
    }
  });
}

async function runExport(b, list) {
  const base = `Canvas ${cat ? catById(cat)?.name || '' : ''} ${new Date().toISOString().slice(0, 10)}`;
  // PDF und JPEG brauchen Weiß, PNG darf durchsichtig sein
  const render1 = async (f) => {
    const bg = exp.bg === 'grid' ? f.bg : 'none';
    const cv = await b.renderBox(f.box, exportWidth(f.fmt), { ...f, bg });
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
  if (!top()) return `<div class="ink-slot"><div class="center loading ink-msg">${LOADER}</div></div>`;
  return `${inkBar()}<div class="ink-slot">
    ${ui.layers ? `<aside class="ink-layers" aria-label="Ebenen">${layersHtml(top().board, top().board.frames()[top().board.currentPage()])}</aside>` : ''}
    <div class="ink-ctx" role="toolbar" aria-label="Eigenschaften">${contextHtml()}</div>
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
  const aside = slot.querySelector('.ink-layers');
  if (aside) { bindLayers(aside, layerCtx); refreshLayers(); }
  page.board.refreshNotes();   // Notizen können sich inzwischen geändert haben (auch durch die andere Person)
  if (focusOn && stack.length === 1) { page.board.showMatch(focusOn); focusOn = null; }
  updateTools();
}

// ---------- Erinnerungen an Markiertes; Rückweg aus Kalender und Erinnerungen ----------
// Auswahl erinnern: Text vorschlagen, Zeit wählen, Glocken-Feld rechts neben die Auswahl setzen
async function remindSelection(page, box, text) {
  const r = await askReminder(text);
  if (!r) return;
  const it = await createReminder({ ...r, fid: cat ?? '', page: page.id });
  if (it) page.board.addCard({ t: 'b', sz: 's', rem: it.id, tt: it.title }, [box[2] + GRID, box[1]]);
}

// Pfeil „Zurück zum Canvas“: Ordner wieder öffnen und das Feld zeigen, von dem man kam
let focusOn = null;
export function backToCanvas() {
  const b = state.backTo;
  if (!b) return;
  focusOn = b.match;
  Object.assign(state, { backTo: null, tab: 'notes', list: b.fid ?? '', noteMode: 'ink', keepList: true });
  render();
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

// rechts in der Kopfleiste: Neue Seite, Speichern | Finger, Seitenübersicht | ganz rechts Rückgängig, Wiederholen
export function inkHeadTools() {
  const b = top()?.board;
  return `<div class="ph-ink">
    ${tb('ink-page', 'plus', 'Neue Seite', { cls: 'wide-only' })}
    ${tb('ink-export', 'download', 'Speichern als PDF, PNG, JPEG', { cls: 'wide-only' })}
    ${tb('ink-more', 'dots', 'Mehr', { cls: 'narrow-only' })}
    <i class="ink-sep"></i>
    ${tb('ink-finger', 'hand', 'Mit Finger schreiben', { on: ui.finger })}
    ${tb('ink-tree', 'tree', 'Seiten und Unterseiten')}
    <i class="ink-sep"></i>
    ${tb('ink-undo', 'undo', 'Rückgängig', { dis: !b?.canUndo })}
    ${tb('ink-redo', 'redo', 'Wiederholen', { dis: !b?.canRedo })}
  </div>`;
}

// Werkzeugleiste unter der Kopfleiste (einfahrbar): links Textmarker, Formen, Bemaßung, Bild;
// rechts der Umschalter Text / Stift / Radierer und ganz rechts eigens die Auswahl. Solange ausgewählt wird,
// ruht der Rest (nur Farbe und Stärke wirken auf das Ausgewählte, Zoom bleibt)
function inkBar() {
  const tool = (id, icon, label) => tb('ink-tool', icon, label, { id, on: ui.tool === id });
  const seg = (id, icon, label) => `<button class="${ui.tool === id ? 'on' : ''}" data-act="ink-tool" data-id="${id}" aria-label="${label}" title="${label}">${ICON[icon]}</button>`;
  const selecting = ui.tool === 'lasso';
  return `<div class="ink-bar ${ui.bar ? '' : 'closed'} ${selecting ? 'selecting' : ''}">
    <div class="ink-tools"><div class="ink-tools-in">
      ${tb('ink-layers', 'layers', 'Ebenen', { on: ui.layers })}
      ${tool('marker', 'marker', 'Textmarker')}
      ${tool('shape', SHAPE_ICON[ui.shape], 'Formen')}
      ${tool('dim', 'ruler', 'Bemaßung')}
      ${tb('ink-img', 'image', 'Bild hinzufügen')}
      ${tb('ink-sticker', 'sticker', 'Sticker')}
      ${tb('ink-cal', 'calendar', 'Termin einfügen', { cls: 'wide-only' })}
      <div class="ink-right">
        <div class="seg-view ink-seg">${seg('text', 'text', 'Text')}${seg('pen', 'pen', 'Zeichnen')}${seg('eraser', 'eraser', 'Radieren')}</div>
        <button class="ink-select ${selecting ? 'on' : ''}" data-act="ink-tool" data-id="lasso" aria-pressed="${selecting}" aria-label="Auswählen" title="Auswählen: antippen oder umkreisen">${ICON.lasso}<span>Auswahl</span></button>
      </div>
    </div></div>
    <button class="ink-fold" data-act="ink-fold" aria-expanded="${ui.bar}" aria-label="Werkzeuge ein- oder ausfahren" title="Werkzeuge">${ICON.chevD}<span>Werkzeuge</span></button>
  </div>`;
}
