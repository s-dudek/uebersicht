// Canvas: Zeichenfläche mit kariertem Papier
// Stift (mit Druck), Textmarker, Text, Radierer (ganze Striche, bei Bildern Teilbereiche), Auswahl (Lasso oder Antippen),
// Formen, Bemaßung, Titel (ziehen zum Verschieben, tippen zum Öffnen), Bilder zuschneiden, Bereiche mit Namen und Hintergrund.
// Die Fläche ist unendlich in alle Richtungen und lässt sich verschieben und zoomen. Bei 100 % passen 1000 Einheiten in die Breite.
// Gezeichnet wird in Kacheln fester Bildschirmgröße, damit auch große Flächen und starker Zoom wenig Speicher brauchen.
import { esc } from './core.js';
import { ICON } from './icons.js';
import { startCrop } from './ink-crop.js';
import {
  bbox, dimLabelAt, distTo, drawDim, drawFrameBg, drawGrid, drawImageItem, drawStroke, drawText, fontCss, FONTS, fontListeners,
  FRAME_BG, FRAME_COLORS, forgetBox, forgetErased, fullRect, GRID, LINE_H, nearItem, NOTES_W, shapeStrokes, share, TEXT_FS, textSize, transform, union,
} from './ink-draw.js';
import { drawFrameLayout, FRAME_LAYOUTS } from './ink-layout.js';
import { FRAMES, getImage, newId } from './ink-store.js';

const VIEW = 1000;       // so viele Einheiten passen bei 100 % in die Breite
const TILE_PX = 512;     // Kachelgröße in Bildschirmpunkten
const ZOOM = [.25, 4];   // kleinster und größter Zoom
const ERASE_R = 9;       // Radierer-Radius in Einheiten (bei 100 %)
const HISTORY = 60;      // Schritte zum Rückgängigmachen
const SEL_PX = 4096;     // größte Kantenlänge der Auswahl-Vorschau in Pixel
const LONG = 480;        // lange drücken (ms)
const TOOLS = ['pen', 'eraser', 'lasso'];   // Reihenfolge für die Taste am Stift
const PALM = 70;         // Berührung ab dieser Breite (Punkte) ist ein Handballen, kein Finger
const PEN_REST = 1500;   // so lange nach dem Stift gilt ein einzelner neuer Finger als aufgelegte Hand (ms)
const UNDO_PAN = 900;    // setzt der Stift so kurz nach einem Verschieben auf, war es die Hand: zurück (ms)
const NEAR = [280, 6000];   // Berührung so nah (Punkte) an der letzten Stiftstelle und so bald danach (ms): Hand

// ====================================================================
// opts: { items, colors, onCommit(items, h, w), onOpenTitle(titleItem), onDeleteTitles(titles) -> Promise<bool>,
//         onExport(frameIndex), onTool(tool), onFrames(), hold(bool),
//         Notizen (nur Startseite): notes() -> [{ id, title }], onNote(id), onNoteAdd(), onNoteDelete(id),
//         Notiz-Unterseite: desc() -> Beschreibungstext, onDesc() }
// ====================================================================
export function createBoard(opts) {
  let items = opts.items;
  let tool = 'pen', shape = 'line', finger = false;
  let pen = { c: '#0C3741', w: 2.2 }, marker = { c: '#F2D33B', w: 16 }, textStyle = { c: '#0C3741', ff: 'sans', fw: 400, i: false, fs: TEXT_FS };
  const past = [], future = [];
  let sel = null;            // { set: Set<item>, box: [x0,y0,x1,y1] }
  let crop = null;           // laufendes Zuschneiden: { item, ui }
  // Ansicht: linke obere Ecke in Einheiten und Zoom (1 = 100 %)
  const view = { x: 0, y: 0, z: 1 };
  let base = 0;              // Punkte je Einheit bei 100 %
  let scale = 0;             // Maßstab, in dem Kacheln und Markierungen zuletzt aufgebaut wurden
  let tileU = 1;             // Kachelgröße in Einheiten (passend zu scale)
  let dpr = 1;
  const cur = () => base * view.z;   // aktueller Maßstab (beim Zoomen schon der neue)
  const tiles = new Map();   // "spalte:zeile" -> Canvas
  const loaded = new Map();  // Bildpfad -> ImageBitmap

  // ---------- Aufbau ----------
  const sc = document.createElement('div');
  sc.className = 'ink-view';
  sc.innerHTML = `<canvas class="ink-grid" aria-hidden="true"></canvas>
    <div class="ink-page">
      <div class="ink-tiles"></div>
      <div class="ink-frames"></div>
      <div class="ink-notes-layer"></div>
      <div class="ink-titles"></div>
    </div>
    <canvas class="ink-live" aria-hidden="true"></canvas>
    <svg class="ink-lasso" aria-hidden="true"><polyline/></svg>
    <div class="ink-zoom" hidden>
      <button type="button" data-zoom="out" aria-label="Verkleinern" title="Verkleinern">${ICON.minus}</button>
      <span class="ink-zpct"></span>
      <button type="button" data-zoom="in" aria-label="Vergrößern" title="Vergrößern">${ICON.plus}</button>
      <button type="button" data-zoom="reset" class="ink-zreset">${ICON.target}<span>Ursprungsansicht</span></button>
    </div>`;
  const gridCv = sc.querySelector('.ink-grid'), liveCv = sc.querySelector('.ink-live');
  const pg = sc.querySelector('.ink-page');
  const tileLayer = pg.querySelector('.ink-tiles');
  const titleLayer = pg.querySelector('.ink-titles');
  const frameLayer = pg.querySelector('.ink-frames');
  const notesLayer = pg.querySelector('.ink-notes-layer');
  const lassoSvg = sc.querySelector('.ink-lasso');
  const lassoLine = lassoSvg.firstElementChild;
  const zoomBar = sc.querySelector('.ink-zoom');
  const zoomPct = zoomBar.querySelector('.ink-zpct');

  function setTool(t) {
    tool = t;
    clearSel();
    finishCrop();
    sc.dataset.tool = t;
  }

  // ---------- Ansicht ----------
  // Ebene verschieben und (bis zum nächsten Neuaufbau) per CSS skalieren; Kästchen frisch zeichnen
  function place() {
    const s = cur();
    pg.style.transform = `translate(${-view.x * s}px, ${-view.y * s}px) scale(${s / scale})`;
    drawGrid(gridCv, sc.clientWidth, sc.clientHeight, dpr, view.x, view.y, s);
    const o = originView();
    zoomBar.hidden = Math.abs(view.z - o.z) < .005 && Math.abs(view.x - o.x) < 2 && Math.abs(view.y - o.y) < 2;
    zoomPct.textContent = Math.round(view.z * 100) + ' %';
  }

  // Ursprungsansicht: der erste Bereich ganz sichtbar und mittig (ohne Bereich der Notizen-Bereich, sonst Anfang der Seite bei 100 % mit Rand)
  function originView() {
    const f = frameList()[0] || notesItem(), W = sc.clientWidth, H = sc.clientHeight;
    if (!f || !base) return { x: -GRID, y: -GRID * 2, z: 1 };   // etwas Rand oben links
    const [x0, y0, x1, y1] = f.t === 'n' ? notesBox() : bbox(f), m = 20, top = 34;   // Rand, oben Platz für den Reiter
    const z = clampZ(Math.min(1, (W - 2 * m) / ((x1 - x0) * base), (H - m - top) / ((y1 - y0) * base)));
    const s = base * z;
    return { x: x0 - (W / s - (x1 - x0)) / 2, y: y0 - top / s, z };
  }

  let first = true;   // beim ersten Anzeigen gleich die Ursprungsansicht
  function layout() {
    const w = sc.clientWidth;
    if (!w) return;
    base = w / VIEW;
    if (first) { first = false; Object.assign(view, originView()); }
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    liveCv.width = Math.round(w * dpr);
    liveCv.height = Math.round(sc.clientHeight * dpr);
    rebuild();
  }

  // Kacheln und Markierungen im aktuellen Maßstab neu aufbauen (nach Größenänderung oder Zoom)
  function rebuild() {
    clearTimeout(settleT);
    scale = cur();
    tileU = TILE_PX / scale;
    tiles.forEach((cv) => cv.remove());
    tiles.clear();
    place();
    ensureTiles();
    renderOverlays();
    renderSel();
    crop?.ui.rescale(scale);
    field?.blur();
    textEd?.el.blur();
  }
  const settle = () => { if (scale && scale !== cur()) rebuild(); };

  // nach jeder Bewegung: Ebene versetzen, fehlende Kacheln nachzeichnen; bei starkem Zoom neu aufbauen
  let tileRaf = 0, settleT = 0;
  function moveView() {
    closeMenu();
    const k = cur() / scale;
    if (k < .6 || k > 1.6) return rebuild();
    place();
    if (act?.kind === 'lasso') drawLasso();
    if (!tileRaf) tileRaf = requestAnimationFrame(() => { tileRaf = 0; ensureTiles(); });
  }

  const clampZ = (z) => Math.min(ZOOM[1], Math.max(ZOOM[0], z));
  const panBy = (dx, dy) => { view.x -= dx / cur(); view.y -= dy / cur(); moveView(); };

  // Zoomen um einen Punkt am Bildschirm: der Punkt bleibt, wo er ist
  function zoomAt(cx, cy, z) {
    const r = sc.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, s0 = cur();
    const ux = view.x + px / s0, uy = view.y + py / s0;
    view.z = clampZ(z);
    view.x = ux - px / cur();
    view.y = uy - py / cur();
    moveView();
  }

  // sanft zu einer Ansicht gleiten (Knöpfe, Ursprungsansicht, neuer Bereich)
  let anim = 0;
  const stopAnim = () => { cancelAnimationFrame(anim); anim = 0; };
  function goTo(tx, ty, tz) {
    stopAnim();
    const from = { ...view }, t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / 280), e = 1 - (1 - t) ** 3;
      view.x = from.x + (tx - from.x) * e;
      view.y = from.y + (ty - from.y) * e;
      view.z = from.z + (tz - from.z) * e;
      moveView();
      if (t < 1) anim = requestAnimationFrame(frame);
      else { anim = 0; settle(); }
    };
    anim = requestAnimationFrame(frame);
  }

  // Zoom-Stufe um die Mitte (Knöpfe, Tastatur)
  function zoomStep(f) {
    const w = sc.clientWidth / 2, h = sc.clientHeight / 2, s = cur();
    const z = clampZ(Math.round(view.z * f * 20) / 20);
    goTo(view.x + w / s - w / (base * z), view.y + h / s - h / (base * z), z);
  }
  const resetView = () => { const o = originView(); goTo(o.x, o.y, o.z); };

  // Gliederung auf der Fläche: alle Bereiche und Titel hervorgehoben, so dass alles zu sehen ist; Antippen beendet
  let outline = false;
  function showOutline() {
    const marks = items.filter((it) => it.t === 'f' || it.t === 't' || it.t === 'n');
    outline = !!marks.length;
    sc.classList.toggle('outline', outline);
    if (!outline) return false;
    const [x0, y0, x1, y1] = union(marks), m = 40;
    const z = clampZ(Math.min(1.5, (sc.clientWidth - 2 * m) / ((x1 - x0) * base), (sc.clientHeight - 2 * m) / ((y1 - y0) * base)));
    const s = base * z;
    goTo(x0 - (sc.clientWidth / s - (x1 - x0)) / 2, y0 - (sc.clientHeight / s - (y1 - y0)) / 2, z);
    return true;
  }
  const endOutline = () => { outline = false; sc.classList.remove('outline'); };

  zoomBar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]');
    if (b?.dataset.zoom === 'reset') resetView();
    else if (b) zoomStep(b.dataset.zoom === 'in' ? 1.25 : .8);
  });

  // Schwung nach dem Verschieben mit dem Finger
  function glide(vx, vy) {
    if (Math.hypot(vx, vy) < .15) return;
    let last = performance.now();
    const frame = (now) => {
      const dt = now - last, f = .995 ** dt;
      last = now;
      vx *= f; vy *= f;
      if (Math.hypot(vx, vy) < .02) { anim = 0; return; }
      panBy(vx * dt, vy * dt);
      anim = requestAnimationFrame(frame);
    };
    anim = requestAnimationFrame(frame);
  }

  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver(() => {
    if (sc.clientWidth !== lastW) { lastW = sc.clientWidth; lastH = sc.clientHeight; layout(); return; }
    if (sc.clientHeight !== lastH) { lastH = sc.clientHeight; liveCv.height = Math.round(lastH * dpr); place(); }
    ensureTiles();
  });
  ro.observe(sc);

  // ---------- Kacheln ----------
  function tileCanvas(ix, iy) {
    const key = ix + ':' + iy;
    let cv = tiles.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.ix = ix; cv.iy = iy;
    // 1 Punkt größer als das Raster: die Kacheln überlappen leicht, damit zwischen ihnen keine feinen Nähte zu sehen sind
    Object.assign(cv.style, { left: ix * TILE_PX + 'px', top: iy * TILE_PX + 'px', width: TILE_PX + 1 + 'px', height: TILE_PX + 1 + 'px' });
    cv.width = cv.height = Math.round((TILE_PX + 1) * dpr);
    tiles.set(key, cv);
    tileLayer.appendChild(cv);
    drawTile(cv);
    return cv;
  }

  // Kacheln im sichtbaren Bereich anlegen, weit entfernte freigeben
  function ensureTiles() {
    if (!scale) return;
    const s = cur();
    const xa = Math.floor(view.x / tileU), xb = Math.floor((view.x + sc.clientWidth / s) / tileU);
    const ya = Math.floor(view.y / tileU), yb = Math.floor((view.y + sc.clientHeight / s) / tileU);
    for (let iy = ya; iy <= yb; iy++) for (let ix = xa; ix <= xb; ix++) tileCanvas(ix, iy);
    tiles.forEach((cv, key) => { if (cv.ix < xa - 1 || cv.ix > xb + 1 || cv.iy < ya - 1 || cv.iy > yb + 1) { cv.remove(); tiles.delete(key); } });
  }

  function tileCtx(cv) {
    const ctx = cv.getContext('2d');
    const k = scale * dpr;
    ctx.setTransform(k, 0, 0, k, -cv.ix * tileU * k, -cv.iy * tileU * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }
  const hits = (cv, b) => { const e = tileU / TILE_PX; return b[2] >= cv.ix * tileU && b[0] <= (cv.ix + 1) * tileU + e && b[3] >= cv.iy * tileU && b[1] <= (cv.iy + 1) * tileU + e; };
  // alle Kacheln, die ein Rechteck berühren (legt sie bei Bedarf an)
  const tilesFor = (b) => {
    const out = [];
    for (let iy = Math.floor(b[1] / tileU); iy <= Math.floor(b[3] / tileU); iy++) {
      for (let ix = Math.floor(b[0] / tileU); ix <= Math.floor(b[2] / tileU); ix++) out.push(tileCanvas(ix, iy));
    }
    return out;
  };

  function drawItem(ctx, it) {
    if (it.t === 'f') {   // Hintergrund und Layout; Rahmen und Reiter sind HTML darüber
      if (it.bg || it.ly) drawFrameBg(ctx, bbox(it), it.bg || 'blank', scale);
      if (it.ly) drawFrameLayout(ctx, bbox(it), it.ly, it.lf);
      return;
    }
    if (it.t === 'n') return;                                                        // Notizen-Bereich ist HTML
    if (it.t === 'x') return drawText(ctx, it);
    if (it.t === 's') return drawStroke(ctx, it);
    if (it.t === 't') { it.s.forEach((s) => drawStroke(ctx, s)); (it.tx || []).forEach((t) => drawText(ctx, t)); return; }
    if (it.t === 'd') return drawDim(ctx, it);
    const img = loaded.get(it.src);
    if (img) return drawImageItem(ctx, it, img);
    ctx.fillStyle = 'rgba(12,55,65,.06)';
    ctx.fillRect(it.x, it.y, it.w, it.h);
    getImage(it.src).then((bmp) => { if (bmp && !loaded.has(it.src)) { loaded.set(it.src, bmp); redrawBox(bbox(it)); renderSel(); } });
  }

  // Reihenfolge: Hintergründe der Bereiche, dann Textmarker, dann alles andere
  const layer = (it) => (it.t === 'f' ? 0 : it.m ? 1 : 2);
  function drawList(ctx, list) {
    for (let l = 0; l < 3; l++) for (const it of list) if (layer(it) === l) drawItem(ctx, it);
  }

  function drawTile(cv) {
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    tileCtx(cv);
    drawList(ctx, items.filter((it) => !sel?.set.has(it) && it !== crop?.item && it !== textEd?.item && hits(cv, bbox(it))));
  }
  // sobald eine Schrift geladen ist: Texte neu messen und zeichnen
  const fontReady = () => { items.forEach((it) => (it.t === 'x' || it.tx) && forgetBox(it)); redrawAll(); renderSel(); textEd?.fit(); };
  fontListeners.add(fontReady);

  const redrawBox = (b) => tiles.forEach((cv) => { if (hits(cv, b)) drawTile(cv); });
  const redrawAll = () => tiles.forEach(drawTile);

  // ---------- Titel: Flächen über den Strichen (tippen öffnet, ziehen verschiebt) ----------
  function renderOverlays() { renderTitles(); renderFrames(); renderNotes(true); }

  // ---------- Notizen-Bereich (Startseite) und Beschreibung (Notiz-Unterseite): HTML auf der Fläche ----------
  // Die Notizen kommen aus der Notizen-Liste des Ordners; ihre Titel öffnen Unterseiten, die Liste wächst nach unten.
  const notesItem = () => items.find((it) => it.t === 'n');
  const notesBox = () => {
    const n = notesItem(), el = notesLayer.firstElementChild;
    const h = el && scale ? el.offsetHeight / scale : 300;
    return [n.x, n.y, n.x + NOTES_W, n.y + h];
  };
  let notesSig = '';
  function renderNotes(force = false) {
    const n = notesItem(), list = n && opts.notes?.(), desc = opts.desc?.();
    const sig = JSON.stringify([n?.x, n?.y, list, desc, scale]);
    if (!force && sig === notesSig) return;
    notesSig = sig;
    notesLayer.innerHTML = '';
    if (n && list) {
      const el = document.createElement('div');
      el.className = 'ink-notes';
      Object.assign(el.style, { left: n.x * scale + 'px', top: n.y * scale + 'px', width: NOTES_W * scale + 'px', fontSize: 16 * scale + 'px' });
      el.innerHTML = `<button type="button" class="ink-ntab" aria-label="Notizen-Bereich verschieben">Notizen</button>
        <ul class="inb-list">${list.map((it) => `<li><button type="button" class="inb-t" data-note="${esc(it.id)}">${esc(it.title) || '<i>Ohne Titel</i>'}</button>
          <button type="button" class="inb-del" data-ndel="${esc(it.id)}" aria-label="Notiz löschen" title="Notiz löschen">${ICON.trash}</button></li>`).join('')}</ul>
        ${list.length ? '' : '<p class="inb-empty">Noch keine Notizen.</p>'}
        <button type="button" class="inb-add" data-nadd>${ICON.plus}<span>Neue Notiz</span></button>`;
      notesLayer.appendChild(el);
    }
    if (desc !== undefined && desc !== null) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ink-desc';
      Object.assign(el.style, { width: 800 * scale + 'px', fontSize: 16 * scale + 'px' });
      el.innerHTML = `<small>Beschreibung</small><span></span>`;
      el.lastElementChild.textContent = desc || 'Noch keine Beschreibung. Antippen zum Schreiben.';
      el.classList.toggle('empty', !desc);
      notesLayer.appendChild(el);
    }
  }
  notesLayer.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.note) opts.onNote(b.dataset.note);
    else if (b?.dataset.ndel) opts.onNoteDelete(b.dataset.ndel);
    else if (b && 'nadd' in b.dataset) opts.onNoteAdd();
    else if (b?.classList.contains('ink-desc')) opts.onDesc();
  });

  function renderTitles() {
    titleLayer.innerHTML = '';
    items.forEach((it, idx) => {
      if (it.t !== 't' || sel?.set.has(it)) return;
      const b = bbox(it), pad = 8;
      const el = document.createElement('button');
      el.className = 'ink-title';
      el.type = 'button';
      el.dataset.idx = idx;
      el.setAttribute('aria-label', 'Unterseite öffnen');
      Object.assign(el.style, {
        left: (b[0] - pad) * scale + 'px', top: (b[1] - pad) * scale + 'px',
        width: (b[2] - b[0] + pad * 2) * scale + 'px', height: (b[3] - b[1] + pad * 2) * scale + 'px',
      });
      titleLayer.appendChild(el);
    });
  }
  // nur für die Tastatur; Maus, Stift und Finger laufen über die Zeigerereignisse (Tippen öffnet, Ziehen verschiebt)
  titleLayer.addEventListener('click', (e) => {
    const el = e.target.closest('.ink-title');
    if (el && e.detail === 0) opts.onOpenTitle(items[+el.dataset.idx]);
  });

  // ---------- Bereiche (A4): gestrichelter Rahmen mit Reiter zum Verschieben ----------
  const frameList = () => items.filter((it) => it.t === 'f');
  const fmtName = (f) => (f.fmt === 'a4l' ? 'A4 quer' : 'A4 hoch');
  const frameName = (f, n) => f.n || f.lf?.t || `${fmtName(f)} · ${n}`;

  function renderFrames() {
    frameLayer.innerHTML = '';
    frameList().forEach((f, n) => {
      const b = bbox(f);
      const el = document.createElement('div');
      el.className = 'ink-frame';
      if (f.fc) el.style.setProperty('--fc', f.fc);
      Object.assign(el.style, { left: b[0] * scale + 'px', top: b[1] * scale + 'px', width: (b[2] - b[0]) * scale + 'px', height: (b[3] - b[1]) * scale + 'px' });
      el.innerHTML = `<button type="button" class="ink-ftab" data-frame="${n}"></button>`;
      el.firstElementChild.textContent = frameName(f, n + 1);
      frameLayer.appendChild(el);
    });
  }

  // freier Platz im sichtbaren Bereich bzw. unter vorhandenen Bereichen, auf den Kästchen
  function addFrame(fmt) {
    const [w, fh] = FRAMES[fmt];
    const snap = (v) => Math.round(v / GRID) * GRID;
    const x = snap(view.x + GRID * 2);
    let y = snap(view.y + GRID * 3);
    const taken = [...frameList().map(bbox), ...(notesItem() ? [notesBox()] : [])];   // nicht über andere Bereiche oder die Notizen
    const overlaps = (ax, ay) => taken.some((b) => ax < b[2] && ax + w > b[0] && ay < b[3] && ay + fh > b[1]);
    while (overlaps(x, y)) y += GRID * 4;
    commit([...items, { t: 'f', fmt, x, y }]);
    goTo(x - GRID * 2, y - GRID * 3, view.z);
  }

  // Inhalt eines Bereichs: alles, dessen Mitte darin liegt
  function frameContent(f) {
    const [x0, y0, x1, y1] = bbox(f);
    return items.filter((it) => {
      if (it === f || it.t === 'f' || it.t === 'n') return false;
      const b = bbox(it), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    });
  }

  // Format, Name oder Hintergrund eines Bereichs ändern
  function setFrame(f, patch) {
    const next = { ...f, ...patch };
    for (const k of ['n', 'bg', 'fc', 'ly', 'lf']) if (!next[k]) delete next[k];
    replace(f, next);
    redrawBox(union([f, next]));
    opts.onFrames?.();
  }

  // Angaben im Layout (Titel, Projekt, Projektnummer, Kontakt) über ein Fenster der App
  async function editLayout(f) {
    const lf = await opts.onEditLayout?.(f.lf || {});
    const cur = frameList().find((o) => o.x === f.x && o.y === f.y);   // der Bereich nach dem Layout-Wechsel
    if (lf && cur) setFrame(cur, { lf: Object.keys(lf).length ? lf : null });
  }

  function renameFrame(f) {
    const b = bbox(f);
    inlineField({ x: b[0], y: b[1], value: f.n || '', placeholder: frameName(f, frameList().indexOf(f) + 1), cls: 'ink-field ink-field-tab',
      done: (txt) => { if (items.includes(f) && txt !== (f.n || '')) setFrame(f, { n: txt }); } });
  }

  // ---------- Verlauf ----------
  // Ausdehnung des Inhalts (nur zur Information beim Speichern)
  function extent() {
    let w = 0, h = 0;
    for (const it of items) { const b = bbox(it); w = Math.max(w, b[2]); h = Math.max(h, b[3]); }
    return [h, w];
  }

  function commit(next) {
    past.push(items);
    if (past.length > HISTORY) past.shift();
    future.length = 0;
    items = next;
    renderOverlays();
    opts.onCommit(items, ...extent());
  }

  function step(from, to) {
    if (!from.length) return;
    clearSel();
    finishCrop();
    to.push(items);
    items = from.pop();
    redrawAll();
    renderOverlays();
    opts.onCommit(items, ...extent());
  }

  // ein Element ersetzen (gleiche Stelle in der Reihenfolge)
  const replace = (old, next) => commit(items.map((it) => (it === old ? next : it)));

  // ---------- Auswahl ----------
  const selBox = document.createElement('div');
  selBox.className = 'ink-sel';
  selBox.hidden = true;
  selBox.innerHTML = `<canvas></canvas><i class="ink-sel-h" aria-hidden="true"></i>
    <div class="ink-selbar">
      <button type="button" data-sel="title">Als Titel</button>
      <button type="button" data-sel="crop">Zuschneiden</button>
      <button type="button" data-sel="edit">Bearbeiten</button>
      <button type="button" data-sel="delete" class="danger">Löschen</button>
    </div>`;
  pg.appendChild(selBox);
  const selCv = selBox.querySelector('canvas');
  const single = (t) => (sel?.set.size === 1 && [...sel.set][0].t === t ? [...sel.set][0] : null);

  function setSel(list) {
    const had = sel;
    sel = list.length ? { set: new Set(list), box: union(list) } : null;
    if (had || sel) { redrawAll(); renderTitles(); }
    renderSel();
  }
  function clearSel() { if (sel) setSel([]); }

  function renderSel(dx = 0, dy = 0, k = 1) {
    if (!sel) { selBox.hidden = true; return; }
    const [x0, y0, x1, y1] = sel.box, pad = 6;
    const w = (x1 - x0) * k + pad * 2, hh = (y1 - y0) * k + pad * 2;
    selBox.hidden = false;
    Object.assign(selBox.style, { left: (x0 - pad + dx) * scale + 'px', top: (y0 - pad + dy) * scale + 'px', width: w * scale + 'px', height: hh * scale + 'px' });
    selBox.classList.toggle('below', (y0 - view.y) * cur() < 56);
    const list = [...sel.set];
    selBox.querySelector('[data-sel="title"]').hidden = !list.some(titlePart) || list.some((it) => it.t === 't');
    selBox.querySelector('[data-sel="crop"]').hidden = !single('i');
    selBox.querySelector('[data-sel="edit"]').hidden = !single('d') && !single('x');
    if (dx || dy || k !== 1) return;   // beim Ziehen nur verschieben, nicht neu zeichnen
    const q = Math.min(dpr, SEL_PX / (Math.max(w, hh) * scale));   // bei starkem Zoom nicht riesig
    selCv.width = Math.max(1, Math.round(w * scale * q));
    selCv.height = Math.max(1, Math.round(hh * scale * q));
    selCv.style.width = w * scale + 'px';
    selCv.style.height = hh * scale + 'px';
    const ctx = selCv.getContext('2d');
    const kk = scale * q;
    ctx.setTransform(kk, 0, 0, kk, (pad - x0) * kk, (pad - y0) * kk);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawList(ctx, items.filter((it) => sel.set.has(it)));
  }

  function applySel(dx, dy, k) {
    if (!sel || (!dx && !dy && k === 1)) return renderSel();
    const [ox, oy] = sel.box;
    const moved = [];
    const next = items.map((it) => { if (!sel.set.has(it)) return it; const n = transform(it, ox, oy, k, dx, dy); moved.push(n); return n; });
    commit(next);
    sel = { set: new Set(moved), box: union(moved) };
    redrawAll();
    renderOverlays();
    renderSel();
  }

  async function deleteSel() {
    if (!sel) return;
    const titles = [...sel.set].filter((it) => it.t === 't');
    if (titles.length && !(await opts.onDeleteTitles(titles))) return;
    const gone = sel.set;
    sel = null;
    commit(items.filter((it) => !gone.has(it)));
    if (titles.length) past.length = 0;   // gelöschte Unterseiten lassen sich nicht zurückholen
    redrawAll();
    renderSel();
  }

  // Titel aus den ausgewählten Strichen und Texten (Gruppen fallen weg, der Titel ist selbst eine Einheit)
  const titlePart = (it) => it.t === 's' || it.t === 'x';
  function makeTitle() {
    if (!sel) return;
    const parts = items.filter((it) => sel.set.has(it) && titlePart(it));
    if (!parts.length) return;
    const tx = parts.filter((it) => it.t === 'x').map(({ g, ...t }) => t);
    const title = { t: 't', page: newId(), s: parts.filter((it) => it.t === 's').map(({ c, w, pts, m }) => ({ t: 's', c, w, pts, ...(m ? { m } : {}) })), ...(tx.length ? { tx } : {}) };
    const first = items.findIndex((it) => sel.set.has(it) && titlePart(it));
    const next = items.filter((it) => !(sel.set.has(it) && titlePart(it)));
    next.splice(Math.min(first, next.length), 0, title);
    sel = null;
    commit(next);
    redrawAll();
    renderOverlays();
    renderSel();
  }

  // Gruppen: wer ein Mitglied auswählt, bekommt die ganze Gruppe
  function withGroups(list) {
    const gs = new Set(list.map((it) => it.g).filter(Boolean));
    return gs.size ? items.filter((it) => list.includes(it) || gs.has(it.g)) : list;
  }

  // Ausgewähltes verändern und ausgewählt lassen
  function editSel(fn) {
    if (!sel) return;
    const changed = [];
    const next = items.map((it) => { if (!sel.set.has(it)) return it; const n = fn(it); changed.push(n); return n; });
    commit(next);
    sel = { set: new Set(changed), box: union(changed) };
    redrawAll();
    renderOverlays();
    renderSel();
  }
  // Art der Auswahl für das Fenster „Farbe und Stärke“: Text, Textmarker oder Stift (null: nichts Gestaltbares)
  function selectionKind() {
    if (!sel) return null;
    const list = [...sel.set];
    const strokes = list.flatMap((it) => (it.t === 's' ? [it] : it.t === 't' ? it.s : []));
    const texts = list.flatMap((it) => (it.t === 'x' ? [it] : it.t === 't' ? it.tx || [] : []));
    const dims = list.filter((it) => it.t === 'd');
    if (texts.length && !strokes.length && !dims.length) return { kind: 'text', val: { c: texts[0].c, ff: texts[0].ff, fw: texts[0].fw, i: !!texts[0].i } };
    if (strokes.length && strokes.every((s) => s.m) && !texts.length && !dims.length) return { kind: 'marker', val: { c: strokes[0].c, w: strokes[0].w } };
    const first = strokes.find((s) => !s.m) || dims[0];
    return first ? { kind: 'pen', val: { c: first.c, w: first.w } } : null;
  }

  // Ausgewähltes nachträglich umgestalten: Farbe; Stärke (Stift bzw. Textmarker); Schriftart, Schnitt, kursiv (Text)
  function styleSelection(kind, p) {
    const stroke = (s) => ({ ...s, ...(p.c ? { c: p.c } : {}), ...(p.w && kind === (s.m ? 'marker' : 'pen') ? { w: p.w } : {}) });
    const text = (t) => {
      const n = { ...t, ...(p.c ? { c: p.c } : {}) };
      if (kind === 'text') { if (p.ff) n.ff = p.ff; if (p.fw) n.fw = p.fw; if ('i' in p) { if (p.i) n.i = 1; else delete n.i; } }
      return n;
    };
    editSel((it) => {
      if (it.t === 's') return stroke(it);
      if (it.t === 'x') return text(it);
      if (it.t === 't') return { ...it, s: it.s.map(stroke), ...(it.tx ? { tx: it.tx.map(text) } : {}) };
      if (it.t === 'd') return { ...it, ...(p.c ? { c: p.c } : {}), ...(p.w && kind === 'pen' ? { w: p.w } : {}) };
      return it;
    });
  }

  const editSingle = () => { const d = single('d'), x = single('x'); if (d) editDim(d); else if (x) editText(x); };
  const recolor = (c) => editSel((it) => (it.t === 's' || it.t === 'd' || it.t === 'x' ? { ...it, c } : it.t === 't' ? { ...it, s: it.s.map((s) => ({ ...s, c })), ...(it.tx ? { tx: it.tx.map((t) => ({ ...t, c })) } : {}) } : it));
  const group = () => { const g = newId(); editSel((it) => ({ ...it, g })); };
  const ungroup = () => editSel(({ g, ...rest }) => rest);
  const unerase = () => editSel(({ er, ...rest }) => rest);

  // Element genau unter dem Finger bzw. Stift: das nächstgelegene, nicht einfach das oberste in der Nähe.
  // Bilder zählen nur, wenn man darauf tippt, und treten hinter Strichen darauf zurück.
  function hitAt(x, y, touch = false) {
    const r = (touch ? 16 : 8) / view.z;
    let best = null, bestD = r;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.t === 'f' || it.t === 'n') continue;
      let d = distTo(it, x, y);
      if (it.t === 'i') d = d ? Infinity : r * .75;
      if (d < bestD || (!best && d <= bestD)) { best = it; bestD = d; }
    }
    return best;
  }

  // ---------- Bilder zuschneiden ----------
  async function cropImage(it) {
    clearSel();
    finishCrop();
    const bmp = loaded.get(it.src) || (await getImage(it.src));
    if (!bmp || !items.includes(it)) return;
    loaded.set(it.src, bmp);
    crop = { item: it };
    redrawBox(bbox(it));
    crop.ui = startCrop({
      layer: pg, item: it, bmp, scale, curScale: cur,
      onDone: (r) => {
        crop = null;
        if (!r) return redrawBox(bbox(it));
        const [fx, fy, fw, fh] = fullRect(it);
        const { cr, ...rest } = it;
        const next = { ...rest, x: fx + r[0] * fw, y: fy + r[1] * fh, w: (r[2] - r[0]) * fw, h: (r[3] - r[1]) * fh };
        if (r.some((v, i) => Math.abs(v - [0, 0, 1, 1][i]) > 1e-4)) next.cr = r;
        replace(it, next);
        redrawBox(union([it, next]));
      },
    });
  }
  const finishCrop = () => crop?.ui?.apply();

  // ---------- kleines Eingabefeld auf der Fläche (Maß, Name eines Bereichs) ----------
  let field = null;
  function inlineField({ x, y, value, placeholder, cls, max = 40, done }) {
    field?.blur();
    const inp = document.createElement('input');
    inp.className = cls;
    inp.maxLength = max;
    inp.placeholder = placeholder;
    inp.value = value;
    inp.setAttribute('aria-label', placeholder);
    Object.assign(inp.style, { left: x * scale + 'px', top: y * scale + 'px' });
    pg.appendChild(inp);
    field = inp;
    let cancelled = false;
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur();
      if (e.key === 'Escape') { cancelled = true; inp.blur(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => {
      inp.remove();
      if (field === inp) field = null;
      if (!cancelled) done(inp.value.trim().slice(0, max));
    });
    focusSoon(inp);
  }

  // Bemaßung: Maß eintragen
  function editDim(it) {
    const [lx, ly] = dimLabelAt(it);
    inlineField({ x: lx, y: ly, value: it.txt || '', placeholder: 'Maß', cls: 'ink-field', done: (txt) => {
      if (txt === (it.txt || '') || !items.includes(it)) return;
      const next = { ...it, txt };
      replace(it, next);
      redrawBox(union([it, next]));
    } });
  }

  // Eingabefeld fokussieren. Am iPad öffnet sich die Tastatur nur innerhalb einer Berührung:
  // darum zusätzlich beim Loslassen (touchend) noch einmal, siehe unten
  let wantFocus = null;
  function focusSoon(el) {
    wantFocus = el;
    el.focus();
  }

  // ---------- Text: schreiben und bearbeiten direkt auf der Fläche ----------
  let textEd = null;   // { el, item (bestehender Text oder null), x, y, st }
  function editText(it, x, y) {
    textEd?.el.blur();
    clearSel();
    const ed = { item: it, x: it ? it.x : x, y: it ? it.y : y, st: it ? { c: it.c, fs: it.fs, ff: it.ff, fw: it.fw, i: !!it.i } : { ...textStyle } };
    const ta = ed.el = document.createElement('textarea');
    ta.className = 'ink-text';
    ta.maxLength = 2000;
    ta.rows = 1;
    ta.value = it?.txt || '';
    ta.setAttribute('aria-label', 'Text');
    pg.appendChild(ta);
    textEd = ed;
    const fit = () => {
      const [w, h] = textSize(ta.value || 'M', ed.st);
      Object.assign(ta.style, {
        left: ed.x * scale + 'px', top: ed.y * scale + 'px', color: ed.st.c, font: fontCss(ed.st, ed.st.fs * scale),
        lineHeight: LINE_H, width: w * scale + 28 + 'px', height: h * scale + 6 + 'px',
      });
    };
    ed.fit = fit;
    fit();
    if (it) redrawBox(bbox(it));
    let cancelled = false;
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { cancelled = true; ta.blur(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ta.blur();
      e.stopPropagation();
    });
    ta.addEventListener('blur', () => {
      ta.remove();
      if (textEd === ed) textEd = null;
      const txt = ta.value.replace(/\s+$/, '').slice(0, 2000);
      if (cancelled || (it && !items.includes(it))) { if (it) redrawBox(bbox(it)); return; }
      if (it && !txt) { commit(items.filter((o) => o !== it)); redrawBox(bbox(it)); return; }
      if (!txt) return;
      const { c, fs, ff, fw, i } = ed.st;
      const next = { ...(it || { t: 'x' }), x: ed.x, y: ed.y, txt, c, fs, ff: FONTS[ff] ? ff : 'sans', fw, i: i ? 1 : 0 };
      if (!next.i) delete next.i;
      if (it) replace(it, next); else commit([...items, next]);
      redrawBox(it ? union([it, next]) : bbox(next));
    });
    focusSoon(ta);
  }

  // ---------- Menü: Rechtsklick oder lange drücken ----------
  let menu = null, menuAt = 0;
  const closeMenu = () => { menu?.remove(); menu = null; selBox.classList.remove('menu'); };

  function showMenu(cx, cy, html, onPick) {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'cmenu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = html;
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(cx, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(cy, window.innerHeight - r.height - 8)) + 'px';
    menuAt = Date.now();
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      closeMenu();
      onPick(b.dataset.m, b.dataset.i);
    });
  }

  function openMenu(cx, cy) {
    closeMenu();
    if (!sel) return;
    const list = [...sel.set];
    const g = list[0].g;
    const oneGroup = g && list.every((it) => it.g === g);
    const canTitle = list.some(titlePart) && !list.some((it) => it.t === 't');
    const hasInk = list.some((it) => it.t !== 'i');
    const img = single('i'), dim = single('d'), txt = single('x');
    const item = (m, icon, label, cls = '') => `<button class="cm-i ${cls}" data-m="${m}">${ICON[icon]}<span>${label}</span></button>`;
    showMenu(cx, cy, `
      ${hasInk ? `<div class="cm-colors" role="group" aria-label="Umfärben">${(opts.colors || []).map((c, i) => `<button class="cm-color" data-m="color" data-i="${i}" style="background:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}</div><hr>` : ''}
      ${img ? item('crop', 'crop', 'Zuschneiden') : ''}
      ${img?.er?.length ? item('unerase', 'undo', 'Radiertes zurückholen') : ''}
      ${dim ? item('edit', 'ruler', 'Maß eintragen') : ''}
      ${txt ? item('edit', 'text', 'Text bearbeiten') : ''}
      ${list.length > 1 && !oneGroup ? item('group', 'stack', 'Gruppieren') : ''}
      ${oneGroup ? item('ungroup', 'stack', 'Gruppierung aufheben') : ''}
      ${canTitle ? item('title', 'chevR', 'Als Titel') : ''}
      ${item('delete', 'trash', 'Löschen', 'danger')}`, (m, i) => {
      if (m === 'color') recolor(opts.colors[+i]);
      else if (m === 'crop') cropImage(img);
      else if (m === 'unerase') unerase();
      else if (m === 'edit') editSingle();
      else if (m === 'group') group();
      else if (m === 'ungroup') ungroup();
      else if (m === 'title') makeTitle();
      else if (m === 'delete') deleteSel();
    });
    selBox.classList.add('menu');   // Leiste über der Auswahl ausblenden, solange das Menü offen ist
  }

  // Menü eines Bereichs (Tippen auf seinen Reiter)
  function openFrameMenu(n, cx, cy) {
    const f = frameList()[n];
    if (!f) return;
    const opt = (m, on, icon, label) => `<button class="cm-i ${on ? 'on' : ''}" data-m="${m}">${ICON[icon]}<span>${label}</span>${on ? ICON.check : ''}</button>`;
    const fc = f.fc || FRAME_COLORS[0];
    showMenu(cx, cy, `<button class="cm-i" data-m="rename">${ICON.pen}<span>Umbenennen …</span></button><hr>
      <div class="cm-colors" role="group" aria-label="Farbe des Bereichs">${FRAME_COLORS.map((c, i) => `<button class="cm-color ${c === fc ? 'on' : ''}" data-m="fc" data-i="${i}" style="background:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}</div><hr>
      ${opt('a4p', f.fmt === 'a4p', 'frame', 'A4 hoch')}${opt('a4l', f.fmt === 'a4l', 'frame', 'A4 quer')}<hr>
      ${FRAME_BG.map(([k, l]) => opt('bg:' + k, (f.bg || '') === k, 'grid', l)).join('')}<hr>
      ${FRAME_LAYOUTS.map(([k, l]) => opt('ly:' + k, (f.ly || '') === k, 'frame', l)).join('')}
      ${f.ly ? `<button class="cm-i" data-m="lf">${ICON.text}<span>Titel, Projekt, Kontakt …</span></button>` : ''}<hr>
      <button class="cm-i" data-m="export">${ICON.download}<span>Speichern …</span></button>
      <button class="cm-i danger" data-m="remove">${ICON.trash}<span>Bereich entfernen</span></button>`, (m, i) => {
      if (m === 'fc') setFrame(f, { fc: i === '0' ? '' : FRAME_COLORS[+i] });
      else if (m === 'a4p' || m === 'a4l') setFrame(f, { fmt: m });
      else if (m.startsWith('bg:')) setFrame(f, { bg: m.slice(3) });
      else if (m.startsWith('ly:')) { setFrame(f, { ly: m.slice(3) }); if (m !== 'ly:' && !f.lf) editLayout(f); }
      else if (m === 'lf') editLayout(f);
      else if (m === 'rename') renameFrame(f);
      else if (m === 'export') opts.onExport(n);
      else if (m === 'remove') { commit(items.filter((it) => it !== f)); redrawBox(bbox(f)); opts.onFrames?.(); }   // Inhalt bleibt stehen
    });
  }
  const onDocDown = (e) => { if (menu && !menu.contains(e.target)) closeMenu(); };
  const onDocKey = (e) => { if (e.key === 'Escape') { closeMenu(); crop?.ui.cancel(); } };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('keydown', onDocKey);

  // Punkt in der Auswahl: Menü dafür; sonst das Element darunter auswählen
  function contextAt(cx, cy, x, y, touch) {
    const inSel = sel && x >= sel.box[0] - 6 && x <= sel.box[2] + 6 && y >= sel.box[1] - 6 && y <= sel.box[3] + 6;
    if (!inSel) {
      const hit = hitAt(x, y, touch);
      if (!hit) { clearSel(); closeMenu(); return; }
      setSel(withGroups([hit]));
    }
    openMenu(cx, cy);
  }

  sc.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (Date.now() - menuAt < 700) return;   // schon durch langes Drücken oder die Stifttaste ausgelöst
    const [x, y] = pos(e);
    contextAt(e.clientX, e.clientY, x, y);
  });

  // langes Drücken (Stift, Finger, Maus) ohne Bewegung
  let lp = null;
  const cancelLp = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  function startLp(e) {
    cancelLp();
    const cx = e.clientX, cy = e.clientY, [x, y] = pos(e), touch = e.pointerType === 'touch';
    lp = { id: e.pointerId, cx, cy, t: setTimeout(() => {
      lp = null;
      cancelAct();
      contextAt(cx, cy, x, y, touch);
    }, LONG) };
  }

  selBox.querySelector('.ink-selbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sel]')?.dataset.sel;
    if (b === 'title') makeTitle();
    else if (b === 'crop') cropImage(single('i'));
    else if (b === 'edit') editSingle();
    else if (b === 'delete') deleteSel();
  });

  // ---------- Eingabe: Stift und Maus schreiben, Finger verschieben und zoomen (wahlweise schreibt ein Finger) ----------
  let act = null;               // laufende Geste
  let penDown = false;
  const fingers = new Map();    // Finger auf der Fläche: id -> [x, y]

  const pos = (e) => {
    const r = sc.getBoundingClientRect(), s = cur();
    return [view.x + (e.clientX - r.left) / s, view.y + (e.clientY - r.top) / s, e.pointerType === 'mouse' || !e.pressure ? .5 : e.pressure];
  };

  // Zeiger festhalten, damit die Geste auch außerhalb der Fläche weiterläuft (schlägt bei schon beendeten Zeigern fehl)
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* Zeiger schon weg */ } };

  // keine Browser-Gesten (Scrollen, Lupe, Doppeltipp-Zoom) auf der Fläche; Knöpfe und Eingabefelder bleiben antippbar
  sc.addEventListener('touchstart', (e) => { if (!e.target.closest('button, input, textarea')) e.preventDefault(); }, { passive: false });
  sc.addEventListener('touchmove', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); }, { passive: false });
  sc.addEventListener('touchend', () => {
    if (wantFocus?.isConnected && document.activeElement !== wantFocus) wantFocus.focus();
    wantFocus = null;
  });

  function drawLasso() {
    const s = cur();
    lassoLine.setAttribute('points', act.poly.map((v, i) => ((v - (i % 2 ? view.y : view.x)) * s).toFixed(1)).join(' '));
  }

  // Ebene über allem, bei jedem Ereignis neu: der laufende Textmarker-Strich (in einem Zug, damit er gleichmäßig
  // durchscheint) bzw. die vorhergesagten Punkte des Stifts (weniger Verzögerung beim Schreiben)
  function drawLive(e) {
    const ctx = liveCv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, liveCv.width, liveCv.height);
    const k = cur() * dpr;
    ctx.setTransform(k, 0, 0, k, -view.x * k, -view.y * k);
    ctx.lineCap = ctx.lineJoin = 'round';
    if (act?.kind === 'marker') return drawStroke(ctx, act.s);
    const pr = act?.kind === 'pen' && e?.getPredictedEvents?.();
    if (!pr?.length) return;
    const p = act.s.pts, n = p.length;
    drawStroke(ctx, { c: act.s.c, w: act.s.w, pts: [p[n - 3], p[n - 2], p[n - 1], ...pr.flatMap((ev) => { const q = pos(ev); q[2] = p[n - 1]; return q; })] });
  }

  // laufende Geste verwerfen, ohne etwas zu übernehmen
  function cancelAct() {
    if (!act) return;
    const a = act;
    act = null;
    if (a.kind === 'pen') { items = a.before; redrawBox(bbox(a.s)); drawLive(); }
    else if (a.kind === 'marker') drawLive();
    else if ((a.kind === 'erase' && a.hit) || a.kind === 'shape' || a.kind === 'dim') { items = a.before; redrawAll(); }
    else if (a.kind === 'lasso') { lassoSvg.classList.remove('on'); lassoLine.setAttribute('points', ''); }
    else if (a.kind === 'fmove') { a.tab.closest('.ink-frame').style.translate = ''; selBox.classList.remove('bare'); clearSel(); }
    else if (a.kind === 'nmove') a.el.style.translate = '';
    else if (a.kind === 'move' || a.kind === 'scale') { selCv.style.transform = ''; renderSel(); }
    else if (a.kind === 'tpress') clearTimeout(a.timer);
    sc.classList.remove('panning');
    opts.hold(false);
  }

  function startPan(e) {
    const now = performance.now(), [ux, uy] = pos(e);
    act = { kind: 'pan', id: e.pointerId, touch: e.pointerType === 'touch', lx: e.clientX, ly: e.clientY, vx: 0, vy: 0, t: now,
      sx: e.clientX, sy: e.clientY, t0: now, ux, uy, from: { ...view } };
    if (!act.touch) sc.classList.add('panning');
    opts.hold(true);
  }

  function startPinch() {
    const [[ax, ay], [bx, by]] = [...fingers.values()];
    const r = sc.getBoundingClientRect(), s = cur();
    const mx = (ax + bx) / 2 - r.left, my = (ay + by) / 2 - r.top;
    act = { kind: 'pinch', touch: true, d: Math.hypot(bx - ax, by - ay) || 1, z: view.z, ux: view.x + mx / s, uy: view.y + my / s, from: { ...view } };
    opts.hold(true);
  }

  // zwei Finger: Abstand zoomt, Mitte verschiebt
  function pinchMove() {
    const [[ax, ay], [bx, by]] = [...fingers.values()];
    const r = sc.getBoundingClientRect();
    const mx = (ax + bx) / 2 - r.left, my = (ay + by) / 2 - r.top;
    view.z = clampZ(act.z * Math.hypot(bx - ax, by - ay) / act.d);
    view.x = act.ux - mx / cur();
    view.y = act.uy - my / cur();
    moveView();
  }

  function panMove(e) {
    const now = performance.now(), dt = Math.max(1, now - act.t);
    const dx = e.clientX - act.lx, dy = e.clientY - act.ly;
    act.vx = act.vx * .3 + (dx / dt) * .7;
    act.vy = act.vy * .3 + (dy / dt) * .7;
    act.lx = e.clientX; act.ly = e.clientY; act.t = now;
    panBy(dx, dy);
  }

  // Titel anheben: ab jetzt wird er verschoben statt geöffnet
  function liftTitle() {
    const a = act;
    if (a?.kind !== 'tpress') return;
    clearTimeout(a.timer);
    setSel(withGroups([a.it]));
    navigator.vibrate?.(12);
    act = { kind: 'move', id: a.id, touch: a.touch, x: a.x, y: a.y, dx: 0, dy: 0, title: true };
  }

  // Taste am Stift (wo der Browser sie meldet): wechselt Stift → Radierer → Auswahl
  function penButton(e) {
    const next = TOOLS[(TOOLS.indexOf(tool) + 1) % TOOLS.length];
    menuAt = Date.now();   // das gleichzeitige Rechtsklick-Menü unterdrücken
    setTool(next);
    opts.onTool?.(next);
    e.preventDefault();
  }

  // Handballen: die Hand liegt oft schon auf, bevor der Stift aufsetzt. Wurde dadurch verschoben, wird das zurückgenommen.
  let lastPen = 0, penUsed = false, handPan = null;   // handPan: { from, end } des letzten Verschiebens mit dem Finger
  const penAt = [0, 0];                               // letzte Stelle des Stifts am Bildschirm
  const notePen = (e) => { penUsed = true; lastPen = performance.now(); penAt[0] = e.clientX; penAt[1] = e.clientY; };
  function undoHandPan(a) {
    const from = a?.from || (handPan && performance.now() - handPan.end < UNDO_PAN ? handPan.from : null);
    handPan = null;
    if (!from) return;
    Object.assign(view, from);
    moveView();
    settle();
  }
  // Hand statt Finger: große Auflage, ein einzelner Finger kurz nach dem Stift, oder eine Berührung rund um die Stelle,
  // an der gerade geschrieben wurde (dort liegt beim Schreiben der Handballen)
  function isPalm(e) {
    if (!penUsed) return false;
    const since = performance.now() - lastPen;
    return Math.max(e.width || 0, e.height || 0) > PALM
      || (!fingers.size && since < PEN_REST)
      || (since < NEAR[1] && Math.hypot(e.clientX - penAt[0], e.clientY - penAt[1]) < NEAR[0]);
  }

  sc.addEventListener('pointerdown', (e) => {
    stopAnim();
    if (e.pointerType === 'pen') notePen(e);
    if (outline) {   // Gliederung auf der Fläche: Antippen beendet sie (Titel und Reiter bleiben antippbar)
      endOutline();
      if (e.pointerType !== 'touch' && !e.target.closest('.ink-title, .ink-ftab')) return;
    }
    if (field && e.target !== field) field.blur();
    if (textEd && e.target !== textEd.el) textEd.el.blur();
    const ntab = e.target.closest('.ink-ntab');
    if (ntab && !act) {   // Notizen-Bereich verschieben (immer auf den Kästchen)
      e.preventDefault();
      capture(ntab, e.pointerId);
      opts.hold(true);
      const [x, y] = pos(e);
      act = { kind: 'nmove', id: e.pointerId, x, y, dx: 0, dy: 0, el: ntab.parentElement };
      return;
    }
    const tab = e.target.closest('.ink-ftab');
    if (tab && !act) {   // Bereich samt Inhalt verschieben (Tippen ohne Bewegung: Menü)
      e.preventDefault();
      capture(tab, e.pointerId);
      opts.hold(true);
      const n = +tab.dataset.frame, f = frameList()[n];
      const [x, y] = pos(e);
      setSel([f, ...frameContent(f)]);
      selBox.classList.add('bare');   // nur der Inhalt wandert mit, ohne Auswahlrahmen
      act = { kind: 'fmove', id: e.pointerId, n, x, y, dx: 0, dy: 0, tab };
      return;
    }
    const tEl = e.target.closest('.ink-title');
    if (tEl && !act && !(e.pointerType === 'touch' && fingers.size)) {   // Titel: tippen öffnet, ziehen (Finger: lange drücken) verschiebt
      e.preventDefault();
      capture(sc, e.pointerId);
      const touch = e.pointerType === 'touch';
      if (touch) fingers.set(e.pointerId, [e.clientX, e.clientY]);
      const [x, y] = pos(e);
      act = { kind: 'tpress', id: e.pointerId, touch, it: items[+tEl.dataset.idx], x, y, cx: e.clientX, cy: e.clientY };
      if (touch) act.timer = setTimeout(liftTitle, LONG);
      opts.hold(true);
      return;
    }
    if (e.target.closest('button, input, textarea')) return;
    if (e.target.closest('.ink-notes') && e.pointerType !== 'touch') return;   // im Notizen-Bereich wird nicht gezeichnet
    if (e.pointerType === 'mouse' && e.button === 1 && !act) {   // mittlere Maustaste: verschieben
      e.preventDefault();
      capture(sc, e.pointerId);
      startPan(e);
      return;
    }
    if (e.pointerType === 'pen' && (e.buttons & 2) && !(e.buttons & 32)) return penButton(e);
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const onSel = sel && e.target.closest('.ink-sel');
    if (e.pointerType === 'touch') {
      if (penDown || isPalm(e)) return;             // Handballen beim oder kurz nach dem Schreiben
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      capture(sc, e.pointerId);
      if (fingers.size === 2) { cancelLp(); cancelAct(); startPinch(); return; }
      if (fingers.size > 2 || act) return;
      // Finger verschiebt die Fläche (lange drücken öffnet das Menü); Auswahl lässt sich mit dem Finger ziehen
      if ((!finger || crop) && !onSel) { startPan(e); startLp(e); return; }
    } else if (e.pointerType === 'pen') {
      if (act?.touch) {                             // der Stift hat Vorrang vor der Hand: Verschieben der Hand zurücknehmen
        const a = act;
        cancelLp(); cancelAct();
        if (a.kind === 'pan' || a.kind === 'pinch') undoHandPan(a);
      } else undoHandPan();
      fingers.clear();
    }
    if (act) return;                                 // nur eine Geste gleichzeitig
    if (crop) { finishCrop(); return; }              // daneben tippen übernimmt den Zuschnitt
    e.preventDefault();
    capture(sc, e.pointerId);
    if (e.pointerType === 'pen') penDown = true;
    opts.hold(true);
    const [x, y, p] = pos(e);
    const touch = e.pointerType === 'touch';
    const eraserEnd = e.pointerType === 'pen' && ((e.buttons & 32) || e.button === 5);   // Radier-Ende des Stifts
    const t = eraserEnd ? 'eraser' : tool;
    if (!['shape', 'dim', 'text', 'marker'].includes(t)) startLp(e);

    const onHandle = e.target.closest('.ink-sel-h');
    if (sel && onHandle) act = { kind: 'scale', id: e.pointerId, touch, x, y, k: 1 };
    else if (onSel) act = { kind: 'move', id: e.pointerId, touch, x, y, dx: 0, dy: 0 };
    else if (t === 'pen') {
      clearSel();
      const s = { t: 's', c: pen.c, w: pen.w, pts: [x, y, p] };
      act = { kind: 'pen', id: e.pointerId, touch, s, before: items, p };
      items = [...items, s];
      tilesFor([x - 5, y - 5, x + 5, y + 5]).forEach((cv) => drawStroke(tileCtx(cv), s));
    } else if (t === 'marker') {
      clearSel();
      act = { kind: 'marker', id: e.pointerId, touch, s: { t: 's', m: 1, c: marker.c, w: marker.w, pts: [x, y, .5] } };
      drawLive();
    } else if (t === 'text') {
      act = { kind: 'text', id: e.pointerId, touch, x, y };
    } else if (t === 'eraser') {
      clearSel();
      act = { kind: 'erase', id: e.pointerId, touch, before: items, hit: false, paths: new Map() };
      erase(x, y);
    } else if (t === 'shape' || t === 'dim') {
      clearSel();
      act = { kind: t, id: e.pointerId, touch, before: items, x0: x, y0: y, x, y, made: [], shift: e.shiftKey };
    } else {
      clearSel();
      act = { kind: 'lasso', id: e.pointerId, touch, poly: [x, y] };
      lassoSvg.classList.add('on');
    }
  });

  sc.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'pen') notePen(e);   // auch schwebender Stift (neuere iPads)
    if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.cx, e.clientY - lp.cy) > 8) cancelLp();
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (act?.kind === 'pinch') { if (fingers.has(e.pointerId)) pinchMove(); return; }
    if (!act || e.pointerId !== act.id) return;
    if (act.kind === 'pan') return panMove(e);
    if (act.kind === 'tpress') {
      const d = Math.hypot(e.clientX - act.cx, e.clientY - act.cy);
      if (act.touch && d > 8) { clearTimeout(act.timer); startPan(e); return; }   // Finger ohne langes Drücken: verschieben
      if (act.touch || d <= 5) return;
      liftTitle();
    }
    act.shift = e.shiftKey;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) move(pos(ev), e.pointerType === 'pen');
    if (act?.kind === 'pen' || act?.kind === 'marker') drawLive(e);
  });

  function move([x, y, p], stylus) {
    if (act.kind === 'pen') {
      const pts = act.s.pts, n = pts.length;
      const lx = pts[n - 3], ly = pts[n - 2];
      if ((x - lx) ** 2 + (y - ly) ** 2 < .25 / view.z ** 2) return;   // zu nah am letzten Punkt
      if (stylus) p = act.p = act.p * .55 + p * .45;                    // Druck glätten (kein Flackern der Strichbreite)
      pts.push(x, y, p);
      forgetBox(act.s);
      // nur das neue Stück zeichnen; am Ende wird die Kachel sauber neu gezeichnet
      const seg = { c: act.s.c, w: act.s.w, pts: pts.slice(Math.max(0, n - 6)) };
      const r = act.s.w * 2;
      tilesFor([Math.min(lx, x) - r, Math.min(ly, y) - r, Math.max(lx, x) + r, Math.max(ly, y) + r]).forEach((cv) => drawStroke(tileCtx(cv), seg));
    } else if (act.kind === 'marker') {
      const pts = act.s.pts, n = pts.length;
      if ((x - pts[n - 3]) ** 2 + (y - pts[n - 2]) ** 2 > 1 / view.z ** 2) pts.push(x, y, .5);
    } else if (act.kind === 'erase') erase(x, y);
    else if (act.kind === 'shape' || act.kind === 'dim') { act.x = x; act.y = y; drawShape(); }
    else if (act.kind === 'lasso') {
      act.poly.push(x, y);
      drawLasso();
    } else if (act.kind === 'move') {
      act.dx = x - act.x; act.dy = y - act.y;
      renderSel(act.dx, act.dy, 1);
    } else if (act.kind === 'nmove') {
      act.dx = Math.round((x - act.x) / GRID) * GRID;
      act.dy = Math.round((y - act.y) / GRID) * GRID;
      act.el.style.translate = `${act.dx * scale}px ${act.dy * scale}px`;
    } else if (act.kind === 'fmove') {
      // immer ganze Kästchen weit, damit der Bereich auf dem Raster bleibt
      act.dx = Math.round((x - act.x) / GRID) * GRID;
      act.dy = Math.round((y - act.y) / GRID) * GRID;
      renderSel(act.dx, act.dy, 1);
      act.tab.closest('.ink-frame').style.translate = `${act.dx * scale}px ${act.dy * scale}px`;
    } else if (act.kind === 'scale') {
      const [x0, y0, x1, y1] = sel.box;
      act.k = Math.max(.2, Math.min(6, Math.max((x - x0) / (act.x - x0 || 1), (y - y0) / (act.y - y0 || 1))));
      const w = (x1 - x0) * act.k, hh = (y1 - y0) * act.k;
      selBox.style.width = (w + 12) * scale + 'px';
      selBox.style.height = (hh + 12) * scale + 'px';
      selCv.style.transform = `scale(${act.k})`;
    }
  }

  // Form oder Maßlinie während des Ziehens (mit Umschalttaste bzw. fast gerade: waagrecht/senkrecht, Quadrat, Kreis)
  function drawShape() {
    const a = act;
    let { x, y } = a;
    const dx = x - a.x0, dy = y - a.y0;
    if (a.kind === 'dim' || shape === 'line' || shape === 'arrow') {
      if (a.shift || Math.abs(Math.sin(2 * Math.atan2(dy, dx))) < .07) {   // nahe 0°/90°
        if (Math.abs(dx) > Math.abs(dy)) y = a.y0; else x = a.x0;
      }
    } else if (a.shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      x = a.x0 + Math.sign(dx || 1) * m; y = a.y0 + Math.sign(dy || 1) * m;
    }
    const old = a.made;
    if (a.kind === 'dim') a.made = [{ t: 'd', a: [a.x0, a.y0], b: [x, y], c: pen.c, w: pen.w, txt: '' }];
    else {
      const g = a.g ??= newId();
      const list = shapeStrokes(shape, a.x0, a.y0, x, y, pen.w);
      a.made = list.map((pts) => ({ t: 's', c: pen.c, w: pen.w, pts, ...(list.length > 1 ? { g } : {}) }));
    }
    items = [...a.before, ...a.made];
    redrawBox(union([...old, ...a.made]));
  }

  // Radierer: Striche, Maße und Texte ganz, bei Bildern nur die überfahrene Stelle
  function erase(x, y) {
    const r = ERASE_R / view.z;
    const gone = items.filter((it) => (it.t === 's' || it.t === 'd' || it.t === 'x') && nearItem(it, x, y, r));
    if (gone.length) {
      act.hit = true;
      items = items.filter((it) => !gone.includes(it));
      redrawBox(union(gone));
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.t !== 'i' || x < it.x - r || x > it.x + it.w + r || y < it.y - r || y > it.y + it.h + r) continue;
      const [fx, fy, fw, fh] = fullRect(it);
      let copy = it, path = act.paths.get(it);
      if (!path) {   // erstes Mal in diesem Zug: Kopie mit neuer Radierspur
        path = { r: r / fw, pts: [] };
        copy = { ...it, er: [...(it.er || []), path] };
        act.paths.set(copy, path);
        items = items.map((o) => (o === it ? copy : o));
      }
      path.pts.push((x - fx) / fw, (y - fy) / fh);
      forgetErased(copy);
      act.hit = true;
      redrawBox([x - r, y - r, x + r, y + r]);
    }
  }

  function end(e) {
    if (lp?.id === e.pointerId) cancelLp();
    if (e.pointerType === 'pen') penDown = false;
    const wasFinger = fingers.delete(e.pointerId);
    if (act?.kind === 'pinch') {
      if (!wasFinger) return;
      act = null;
      opts.hold(false);
      settle();
      // ein Finger bleibt liegen: mit ihm weiter verschieben
      const [rest] = fingers.keys();
      if (rest !== undefined) { const [cx, cy] = fingers.get(rest); startPan({ pointerId: rest, pointerType: 'touch', clientX: cx, clientY: cy }); }
      return;
    }
    if (!act || e.pointerId !== act.id) return;
    const a = act;
    act = null;
    if (a.kind === 'pan') {
      sc.classList.remove('panning');
      const now = performance.now();
      if (a.touch && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 8 && now - a.t0 < 400) fingerTap(a);   // nur angetippt
      else if (a.touch) {
        handPan = { from: a.from, end: now };
        if (now - a.t < 80) glide(a.vx, a.vy);
      }
    } else if (a.kind === 'tpress') {
      clearTimeout(a.timer);
      opts.hold(false);
      opts.onOpenTitle(a.it);
      return;
    } else if (a.kind === 'marker') {
      drawLive();
      commit([...items, a.s]);
      redrawBox(bbox(a.s));
    } else if (a.kind === 'text') {
      textTap(a.x, a.y, a.touch);
    } else if (a.kind === 'pen') {
      drawLive();
      forgetBox(a.s);
      items = a.before;
      commit([...a.before, a.s]);
      redrawBox(bbox(a.s));
    } else if (a.kind === 'erase' && a.hit) {
      const now = items;
      items = a.before;
      commit(now);
    } else if (a.kind === 'shape' || a.kind === 'dim') {
      items = a.before;
      if (Math.hypot(a.x - a.x0, a.y - a.y0) < 4 / view.z) {   // nur angetippt
        if (a.made.length) redrawBox(union(a.made));
        const hit = a.kind === 'dim' && hitAt(a.x0, a.y0, a.touch);   // Maßlinie antippen: Maß bearbeiten
        if (hit?.t === 'd') editDim(hit);
      } else {
        commit([...a.before, ...a.made]);
        if (a.kind === 'dim') editDim(a.made[0]);
      }
    } else if (a.kind === 'lasso') {
      lassoSvg.classList.remove('on');
      lassoLine.setAttribute('points', '');
      const xs = a.poly.filter((_, i) => i % 2 === 0), ys = a.poly.filter((_, i) => i % 2);
      const tap = Math.max(...xs) - Math.min(...xs) < 6 / view.z && Math.max(...ys) - Math.min(...ys) < 6 / view.z;
      if (tap) {   // Antippen wählt ein Element; ein ausgewählter Text wird beim zweiten Antippen bearbeitet
        const hit = hitAt(a.poly[0], a.poly[1], a.touch);
        if (hit?.t === 'x' && single('x') === hit) editText(hit);
        else setSel(hit ? withGroups([hit]) : []);
      }
      else setSel(withGroups(items.filter((it) => share(it, a.poly) >= .5)));
    } else if (a.kind === 'move') {
      applySel(a.dx, a.dy, 1);
      if (a.title) clearSel();   // verschobener Titel bleibt antippbar
    }
    else if (a.kind === 'nmove') {
      a.el.style.translate = '';
      const n = notesItem();
      if (n && (a.dx || a.dy)) replace(n, { ...n, x: n.x + a.dx, y: n.y + a.dy });
    }
    else if (a.kind === 'fmove') {
      selBox.classList.remove('bare');
      if (a.dx || a.dy) { applySel(a.dx, a.dy, 1); clearSel(); }
      else { clearSel(); const r = a.tab.getBoundingClientRect(); openFrameMenu(a.n, r.left, r.bottom + 6); }
    }
    else if (a.kind === 'scale') { selCv.style.transform = ''; applySel(0, 0, a.k); }
    opts.hold(false);
  }
  // Finger kurz angetippt (er verschiebt sonst): mit Text neuen Text beginnen oder bearbeiten, mit der Auswahl auswählen
  function fingerTap(a) {
    if (tool === 'text') textTap(a.ux, a.uy, true);
    else if (tool === 'lasso') { const hit = hitAt(a.ux, a.uy, true); setSel(hit ? withGroups([hit]) : []); }
  }
  function textTap(x, y, touch) {
    const hit = hitAt(x, y, touch);   // vorhandenen Text bearbeiten, sonst neuen beginnen
    if (hit?.t === 'x') editText(hit);
    else editText(null, x, y - textStyle.fs * .65);
  }

  sc.addEventListener('pointerup', end);
  sc.addEventListener('pointercancel', end);

  // ---------- Mausrad und Trackpad: verschieben; mit Strg (oder Trackpad-Zwicken) zoomen ----------
  sc.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopAnim();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sc.clientHeight : 1;
    if (e.ctrlKey) zoomAt(e.clientX, e.clientY, view.z * Math.exp(-Math.max(-60, Math.min(60, e.deltaY * unit)) * .006));   // Mausrad höchstens ~40 % je Raste
    else panBy(-e.deltaX * unit, -e.deltaY * unit);
    clearTimeout(settleT);
    settleT = setTimeout(settle, 160);
  }, { passive: false });

  // Safari am Mac meldet das Zwicken am Trackpad als eigene Geste (am iPad übernehmen das die Finger oben)
  let gz = 1;
  sc.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = view.z; });
  sc.addEventListener('gesturechange', (e) => { e.preventDefault(); if (!fingers.size) zoomAt(e.clientX, e.clientY, gz * e.scale); });
  sc.addEventListener('gestureend', (e) => { e.preventDefault(); settle(); });

  setTool('pen');

  // ---------- nach außen ----------
  return {
    el: sc,
    // nach dem Einhängen ins Dokument (auch nach jedem Neuzeichnen der Ansicht)
    attach() { if (!scale || sc.clientWidth !== lastW) { lastW = sc.clientWidth; lastH = sc.clientHeight; layout(); } else { place(); ensureTiles(); } },
    setTool,
    setShape(k) { shape = k; },
    get tool() { return tool; },
    setPen(p) { pen = { ...pen, ...p }; },
    setMarker(p) { marker = { ...marker, ...p }; },
    // Schrift für neue Texte; ein gerade bearbeiteter Text übernimmt sie sofort
    setTextStyle(p) { textStyle = { ...textStyle, ...p }; if (textEd) { textEd.st = { ...textEd.st, ...p }; textEd.fit(); } },
    setFinger(on) { finger = on; },
    zoomIn: () => zoomStep(1.25),
    zoomOut: () => zoomStep(.8),
    resetView,
    undo: () => step(past, future),
    redo: () => step(future, past),
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    deleteSelection: deleteSel,
    clearHistory() { past.length = 0; future.length = 0; },
    get isEmpty() { return !items.length; },
    // Bild in der Mitte des sichtbaren Bereichs einfügen (unter die Striche)
    addImage({ path, w, h: ih }) {
      const bw = Math.min(480, VIEW - 80) / view.z, bh = bw * (ih / w);
      const cx = view.x + sc.clientWidth / 2 / cur(), cy = view.y + sc.clientHeight / 2 / cur();
      commit([{ t: 'i', src: path, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }, ...items]);
      redrawAll();
    },
    addFrame,
    // Bereiche für den Export: Name und Rechteck in Einheiten
    frames: () => frameList().map((f, n) => ({ n, name: frameName(f, n + 1), fmt: f.fmt, bg: f.bg || (f.ly ? 'blank' : 'grid'), ly: f.ly, lf: f.lf, box: bbox(f) })),
    renameFrame(n, name) { const f = frameList()[n]; if (f) setFrame(f, { n: name.trim().slice(0, 40) }); },
    showOutline,
    selectionKind,
    styleSelection,
    refreshNotes: () => renderNotes(),
    // Titel entfernen (Unterseite wurde schon gelöscht), z. B. aus der Gliederung
    removeTitle(pageId) {
      const gone = items.filter((it) => it.t === 't' && it.page === pageId);
      if (!gone.length) return;
      clearSel();
      commit(items.filter((it) => !gone.includes(it)));
      past.length = 0;
      redrawBox(union(gone));
    },
    // offenes Eingabefeld sichtbar halten (z. B. wenn am iPad die Tastatur die Fläche verkleinert)
    reveal() {
      const el = textEd?.el || field;
      if (!el) return;
      const r = el.getBoundingClientRect(), v = sc.getBoundingClientRect(), m = 16;
      const dy = r.bottom > v.bottom - m ? v.bottom - m - r.bottom : r.top < v.top + m ? v.top + m - r.top : 0;
      if (dy) panBy(0, dy);
    },
    showFrame(n) { const f = frameList()[n]; if (f) goTo(f.x - GRID * 2, f.y - GRID * 3, view.z); },
    // Bereich als Bild zeichnen; bg: 'grid' (Kästchen), 'lines', 'dots', 'blank' (alle auf Weiß) oder 'none' (durchsichtig)
    async renderBox(box, pxW, bg, ly, lf) {
      const [x0, y0, x1, y1] = box, k = pxW / (x1 - x0);
      const cv = document.createElement('canvas');
      cv.width = Math.round(pxW);
      cv.height = Math.round((y1 - y0) * k);
      const inside = items.filter((it) => { const b = bbox(it); return it.t !== 'f' && b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1; });
      await Promise.all(inside.filter((it) => it.t === 'i').map(async (it) => { const bmp = await getImage(it.src); if (bmp) loaded.set(it.src, bmp); }));
      const ctx = cv.getContext('2d');
      ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      if (bg !== 'none') drawFrameBg(ctx, box, bg, 1);
      if (ly) drawFrameLayout(ctx, box, ly, lf);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawList(ctx, inside);
      return cv;
    },
    imagePaths: () => items.filter((it) => it.t === 'i').map((it) => it.src),
    destroy() {
      ro.disconnect(); stopAnim(); closeMenu();
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey);
      fontListeners.delete(fontReady);
      sc.remove();
    },
  };
}
