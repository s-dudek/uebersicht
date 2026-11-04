// Handschrift: Startseite mit Titeln, jeder Titel öffnet eine eigene Seite (beliebig tief)
import { $app, askConfirm, esc, state, store, toast } from './core.js';
import { ICON } from './icons.js';
import { createBoard } from './ink-board.js';
import { deletePageTree, deserialize, loadChild, loadRoot, removeImages, savePage, titleIn, uploadImage } from './ink-store.js';
import { render } from './render.js';

const PENS = ['#0C3741', '#3E7CA8', '#C2575A'];
const SIZES = { fine: 2.2, bold: 4.2 };
const ui = { tool: 'pen', color: PENS[0], size: 'fine', finger: store('inkFinger') === '1' };

const stack = [];      // geöffnete Seiten: [Startseite, Unterseite, …]
let status = 'idle';   // 'idle' | 'loading' | 'ready' | 'error'
const top = () => stack[stack.length - 1];

// ---------- Seiten öffnen und schließen ----------
function openPage(row) {
  const { items, h } = deserialize(row.data);
  const page = { id: row.id, title: titleIn(row.title), atOpen: new Set(), uploaded: new Set(), timer: null, pending: null };
  page.board = createBoard({
    items, h,
    hold,
    onCommit: (list, hh) => { page.pending = { list, hh }; scheduleSave(page); updateTools(); },
    onOpenTitle: (it) => openTitle(page, it),
    onDeleteTitles: deleteTitles,
  });
  page.board.imagePaths().forEach((p) => page.atOpen.add(p));
  stack.push(page);
  applyUi();
}

async function start() {
  status = 'loading';
  try {
    openPage(await loadRoot());
    status = 'ready';
  } catch (e) {
    status = 'error';
    console.warn('Handschrift', e);
  }
  if (state.tab === 'ink') render();
}

async function openTitle(parent, it) {
  try {
    openPage(await loadChild(it.page, parent.id, it.s));
    render();
  } catch (e) {
    toast('Seite konnte nicht geöffnet werden: ' + (e.message || e));
  }
}

async function closeTop() {
  const page = stack.pop();
  await flush(page);
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
  const { list, hh } = page.pending;
  page.pending = null;
  const err = await savePage(page.id, list, hh);
  if (err) { page.pending ??= { list, hh }; toast('Speichern fehlgeschlagen: ' + err.message, 4000); }
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
  b.setPen({ c: ui.color, w: SIZES[ui.size] });
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
    const img = await uploadImage(file);
    page.uploaded.add(img.path);
    page.board.addImage(img);
  } catch (e) {
    toast('Bild konnte nicht hinzugefügt werden: ' + (e.message || e), 4000);
  }
});

export async function inkAction(act, id) {
  const b = top()?.board;
  switch (act) {
    case 'ink-tool': ui.tool = id; break;
    case 'ink-color': ui.color = PENS[+id] || PENS[0]; ui.tool = 'pen'; break;
    case 'ink-size': ui.size = ui.size === 'fine' ? 'bold' : 'fine'; ui.tool = 'pen'; break;
    case 'ink-finger': ui.finger = !ui.finger; store('inkFinger', ui.finger ? '1' : '0'); toast(ui.finger ? 'Mit dem Finger schreiben, mit zwei Fingern scrollen' : 'Nur Stift und Maus schreiben'); break;
    case 'ink-undo': b?.undo(); return;
    case 'ink-redo': b?.redo(); return;
    case 'ink-img': picker.click(); return;
    case 'ink-back': if (stack.length > 1) await closeTop(); break;
    default: return;
  }
  applyUi();
  render();
}

// Tastatur am Computer: Rückgängig, Wiederholen, Auswahl löschen
document.addEventListener('keydown', (e) => {
  if (state.tab !== 'ink' || e.target.closest?.('input, textarea')) return;
  const b = top()?.board;
  if (!b) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? b.redo() : b.undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); b.redo(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') b.deleteSelection();
});

// Abmelden: nichts von dieser Person im Speicher lassen
export function resetInk() {
  stack.splice(0).forEach((p) => { clearTimeout(p.timer); p.board.destroy(); });
  status = 'idle';
}

// ---------- Ansicht ----------
export function renderInk() {
  if (status === 'idle') start();
  if (status === 'error') return '<div class="empty">Die Handschrift ist noch nicht eingerichtet. Bitte das Datenbank-Update (supabase-setup.sql, Abschnitt „Handschrift“) in Supabase ausführen.</div>';
  if (!top()) return '<div class="center muted">Lädt …</div>';
  return `<div class="ink-slot">
    <p class="ink-hint" ${stack.length === 1 && top().board.isEmpty ? '' : 'hidden'}>Mit dem Stift schreiben. Einen Bereich mit der Auswahl umkreisen und „Als Titel“ wählen: der Titel öffnet eine eigene Seite.</p>
  </div>`;
}

// nach dem Neuzeichnen: die bestehende Zeichenfläche wieder einhängen (Striche bleiben erhalten)
export function mountInk() {
  const slot = $app.querySelector('.ink-slot');
  const page = top();
  if (!slot || !page) return;
  slot.prepend(page.board.el);
  page.board.attach();
  updateTools();
}

// Bereich verlassen: speichern, nicht mehr benutzte Bilder entfernen
export function leaveInk() {
  const page = top();
  if (!page) return;
  flush(page);
  cleanup(page);
}

// Titel der Unterseite als Bild aus den eigenen Strichen (nur Zahlen und geprüfte Farben)
function titleSvg(strokes) {
  if (!strokes.length) return '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.pts.length; i += 3) {
    x0 = Math.min(x0, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); x1 = Math.max(x1, s.pts[i]); y1 = Math.max(y1, s.pts[i + 1]);
  }
  const pad = 6;
  const paths = strokes.map((s) => {
    const d = [];
    for (let i = 0; i < s.pts.length; i += 3) d.push(`${i ? 'L' : 'M'}${s.pts[i].toFixed(1)} ${s.pts[i + 1].toFixed(1)}`);
    if (d.length === 1) d.push(`L${(s.pts[0] + .1).toFixed(1)} ${s.pts[1].toFixed(1)}`);
    return `<path d="${d.join('')}" stroke="${esc(s.c)}" stroke-width="${(s.w * 1.2).toFixed(2)}"/>`;
  }).join('');
  return `<svg class="ink-ttl" viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + pad * 2).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Handschriftlicher Titel">${paths}</svg>`;
}

export function inkHead() {
  if (stack.length < 2) return '<b>Handschrift</b>';
  return `<button class="ph-back" data-act="ink-back" aria-label="Zurück">${ICON.chevL}</button>${titleSvg(top().title)}`;
}

const tb = (act, icon, label, { on = false, dis = false } = {}) =>
  `<button class="dk ink-b ${on ? 'on' : ''}" data-act="${act}" aria-label="${label}" title="${label}" ${dis ? 'disabled' : ''}>${ICON[icon]}</button>`;

export function inkActions() {
  const b = top()?.board;
  const seg = (id, icon, label) => `<button class="${ui.tool === id ? 'on' : ''}" data-act="ink-tool" data-id="${id}" aria-label="${label}" title="${label}">${ICON[icon]}</button>`;
  return `<div class="seg-view ink-seg">${seg('pen', 'pen', 'Stift')}${seg('eraser', 'eraser', 'Radierer')}${seg('lasso', 'lasso', 'Auswählen')}</div>
    <div class="ink-pens">
      ${PENS.map((c, i) => `<button class="ink-dot ${ui.color === c ? 'on' : ''}" data-act="ink-color" data-id="${i}" style="--c:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}
      <button class="ink-size ${ui.size}" data-act="ink-size" aria-label="Strichstärke" title="Strichstärke"><i></i></button>
    </div>
    ${tb('ink-img', 'image', 'Bild hinzufügen')}
    ${tb('ink-undo', 'undo', 'Rückgängig', { dis: !b?.canUndo })}
    ${tb('ink-redo', 'redo', 'Wiederholen', { dis: !b?.canRedo })}
    ${tb('ink-finger', 'hand', 'Mit Finger schreiben', { on: ui.finger })}`;
}
