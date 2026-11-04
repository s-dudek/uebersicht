// Handschrift in den Notiz-Ordnern: jede Kategorie hat eine eigene Startseite mit Titeln,
// jeder Titel öffnet eine eigene Seite (beliebig tief). Bereiche (A4) lassen sich exportieren.
import { $app, askConfirm, catById, COLORS, esc, store, toast } from './core.js';
import { ICON } from './icons.js';
import { createBoard } from './ink-board.js';
import { deliver, exportWidth, fileName, toImage, toPdf } from './ink-export.js';
import { deletePageTree, deserialize, loadChild, loadRoot, removeImages, savePage, titleIn, uploadImage } from './ink-store.js';
import { render } from './render.js';
import { closeSheet, openSheet } from './sheet.js';

const PENS = ['#0C3741', '#3E7CA8', '#C2575A'];
const SIZES = { fine: 2.2, bold: 4.2 };
const ui = { tool: 'pen', color: PENS[0], size: 'fine', finger: store('inkFinger') === '1' };

const stack = [];      // geöffnete Seiten: [Startseite, Unterseite, …]
let cat = null;        // Ordner, zu dem die Seiten gehören ('' = Ohne Kategorie)
let status = 'idle';   // 'idle' | 'loading' | 'ready' | 'error'
let active = false;    // Handschrift gerade sichtbar
const top = () => stack[stack.length - 1];

// ---------- Seiten öffnen und schließen ----------
function openPage(row) {
  const { items, h, w } = deserialize(row.data);
  const page = { id: row.id, title: titleIn(row.title), atOpen: new Set(), uploaded: new Set(), timer: null, pending: null };
  page.board = createBoard({
    items, h, w,
    colors: COLORS,
    hold,
    onCommit: (list, hh, ww) => { page.pending = { list, hh, ww }; scheduleSave(page); updateTools(); },
    onOpenTitle: (it) => openTitle(page, it),
    onDeleteTitles: deleteTitles,
    onExport: (n) => openExport([n]),
  });
  page.board.imagePaths().forEach((p) => page.atOpen.add(p));
  stack.push(page);
  applyUi();
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
    console.warn('Handschrift', e);
  }
  if (active) render();
}

async function openTitle(parent, it) {
  try {
    const row = await loadChild(it.page, parent.id, cat, it.s);
    openPage(row);
    render();
  } catch (e) {
    toast('Seite konnte nicht geöffnet werden: ' + (e.message || e));
  }
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
    const img = await uploadImage(file, cat);
    page.uploaded.add(img.path);
    page.board.addImage(img);
  } catch (e) {
    toast('Bild konnte nicht hinzugefügt werden: ' + (e.message || e), 4000);
  }
});

// Bereich anlegen: kleine Auswahl unter dem Knopf
function openFrameChoice(btn) {
  const r = btn.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'cmenu';
  el.innerHTML = `<button class="cm-i" data-f="a4p">${ICON.frame}<span>A4 hoch</span></button>
    <button class="cm-i" data-f="a4l">${ICON.frame}<span>A4 quer</span></button>`;
  document.body.appendChild(el);
  const m = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.width - 8)) + 'px';
  el.style.top = (r.top - m.height - 8 > 8 ? r.top - m.height - 8 : r.bottom + 8) + 'px';
  const close = (e) => { if (!el.contains(e.target)) { el.remove(); document.removeEventListener('pointerdown', close, true); } };
  document.addEventListener('pointerdown', close, true);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    el.remove();
    document.removeEventListener('pointerdown', close, true);
    top()?.board.addFrame(b.dataset.f);
  });
}

export async function inkAction(act, id, btn) {
  const b = top()?.board;
  switch (act) {
    case 'ink-tool': ui.tool = id; break;
    case 'ink-color': ui.color = PENS[+id] || PENS[0]; ui.tool = 'pen'; break;
    case 'ink-size': ui.size = ui.size === 'fine' ? 'bold' : 'fine'; ui.tool = 'pen'; break;
    case 'ink-finger': ui.finger = !ui.finger; store('inkFinger', ui.finger ? '1' : '0'); toast(ui.finger ? 'Mit dem Finger schreiben, mit zwei Fingern scrollen' : 'Nur Stift und Maus schreiben'); break;
    case 'ink-undo': b?.undo(); return;
    case 'ink-redo': b?.redo(); return;
    case 'ink-img': picker.click(); return;
    case 'ink-frame': openFrameChoice(btn); return;
    case 'ink-export': openExport(); return;
    case 'ink-back': if (stack.length > 1) closePage(stack.pop()); break;
    default: return;
  }
  applyUi();
  render();
}

// Tastatur am Computer: Rückgängig, Wiederholen, Auswahl löschen
document.addEventListener('keydown', (e) => {
  if (!active || e.target.closest?.('input, textarea, .sheet')) return;
  const b = top()?.board;
  if (!b) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? b.redo() : b.undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); b.redo(); }
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
    <div class="sheet-head"><h2>Exportieren</h2><button class="link-btn" data-close>Fertig</button></div>
    ${frames.length ? `
      <p class="muted exp-lead">Bereiche auswählen:</p>
      <div class="exp-grid">${frames.map((f) => `<button type="button" class="exp-card ${chosen.has(f.n) ? 'on' : ''}" data-n="${f.n}"><span class="exp-th ${f.fmt}"></span><span>${esc(f.name)}</span></button>`).join('')}</div>
      <div class="exp-row"><span>Format</span>${seg('fmt', [['pdf', 'PDF'], ['png', 'PNG'], ['jpeg', 'JPEG']])}</div>
      <div class="exp-row"><span>Hintergrund</span>${seg('bg', [['grid', 'Mit Kästchen'], ['none', 'Ohne']])}</div>
      <p class="hint exp-note"></p>
      <button class="btn block" id="exp-go">${ICON.download} Exportieren</button>`
    : `<p class="exp-lead">Noch kein Bereich auf dieser Seite. Lege einen Bereich an, schreibe hinein und exportiere ihn dann.</p>
      <div class="exp-new"><button class="btn" data-f="a4p">${ICON.frame} A4 hoch</button><button class="btn" data-f="a4l">${ICON.frame} A4 quer</button></div>`}`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);

  const note = () => {
    const el = sheet.querySelector('.exp-note');
    if (el) el.textContent = exp.bg === 'none' ? (exp.fmt === 'png' ? 'PNG ohne Hintergrund ist durchsichtig.' : 'Ohne Kästchen, auf weißem Hintergrund.') : '';
  };
  note();

  // kleine Vorschau je Bereich
  frames.forEach(async (f) => {
    const cv = await b.renderBox(f.box, 220, 'grid');
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
      go.innerHTML = `${ICON.download} Exportieren`;
    }
  });
}

async function runExport(b, list) {
  const base = `Handschrift ${cat ? catById(cat)?.name || '' : ''} ${new Date().toISOString().slice(0, 10)}`;
  // PDF und JPEG brauchen Weiß, PNG darf durchsichtig sein
  const bg = exp.bg === 'grid' ? 'grid' : 'none';
  const render1 = async (f) => {
    const cv = await b.renderBox(f.box, exportWidth(f.fmt), bg);
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
// Handschrift eines Notiz-Ordners (fid '' = Ohne Kategorie)
export function renderInk(fid) {
  if (cat !== fid) { leaveInk(); start(fid); }
  if (status === 'error') return '<div class="ink-slot"><p class="empty ink-msg">Die Handschrift ist gerade nicht erreichbar. Bitte später nochmal versuchen.</p></div>';
  if (!top()) return '<div class="ink-slot"><p class="center muted ink-msg">Lädt …</p></div>';
  return `<div class="ink-slot">
    <p class="ink-hint" ${stack.length === 1 && top().board.isEmpty ? '' : 'hidden'}>Mit dem Stift schreiben. Einen Bereich mit der Auswahl umkreisen und „Als Titel“ wählen: der Titel öffnet eine eigene Seite. Mit „Bereich“ ein A4-Blatt markieren und später exportieren.</p>
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
  updateTools();
}

// Handschrift verlassen (anderer Ordner, Notizen-Ansicht, anderer Bereich, Abmelden):
// speichern, nicht mehr benutzte Bilder entfernen; beim nächsten Öffnen frisch laden (Änderungen der anderen Person)
export function leaveInk() {
  active = false;
  stack.splice(0).reverse().forEach(closePage);
  cat = null;
  status = 'idle';
}

// Abmelden: nichts von dieser Person im Speicher lassen
export function resetInk() {
  active = false;
  stack.splice(0).forEach((p) => { clearTimeout(p.timer); p.board.destroy(); });
  cat = null;
  status = 'idle';
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

// Kopfzeile einer Unterseite: zurück + handschriftlicher Titel (sonst null: normale Ordner-Kopfzeile)
export function inkHead() {
  if (stack.length < 2) return null;
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
    ${tb('ink-frame', 'frame', 'Bereich (A4) anlegen')}
    ${tb('ink-export', 'download', 'Exportieren')}
    ${tb('ink-undo', 'undo', 'Rückgängig', { dis: !b?.canUndo })}
    ${tb('ink-redo', 'redo', 'Wiederholen', { dis: !b?.canRedo })}
    ${tb('ink-finger', 'hand', 'Mit Finger schreiben', { on: ui.finger })}`;
}
