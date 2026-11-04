// Handschrift: Zeichenfläche mit kariertem Papier
// Stift (mit Druck), Radierer (ganze Striche), Auswahl (Lasso) zum Verschieben, Vergrößern, Löschen und "Als Titel".
// Die Fläche ist unendlich in alle Richtungen und lässt sich verschieben und zoomen. Bei 100 % passen 1000 Einheiten in die Breite.
// Gezeichnet wird in Kacheln fester Bildschirmgröße, damit auch große Flächen und starker Zoom wenig Speicher brauchen.
// Bereiche (A4 hoch/quer) markieren, was exportiert wird; sie liegen immer genau auf den Kästchen.
import { ICON } from './icons.js';
import { FRAMES, getImage, newId } from './ink-store.js';

const VIEW = 1000;       // so viele Einheiten passen bei 100 % in die Breite
const TILE_PX = 512;     // Kachelgröße in Bildschirmpunkten
const GRID = 25;         // Kästchengröße in Einheiten
const ZOOM = [.25, 4];   // kleinster und größter Zoom
const ERASE_R = 9;       // Radierer-Radius in Einheiten
const HISTORY = 60;      // Schritte zum Rückgängigmachen
const SEL_PX = 4096;     // größte Kantenlänge der Auswahl-Vorschau in Pixel

// ---------- Geometrie ----------
const boxes = new WeakMap();
function bbox(it) {
  let b = boxes.get(it);
  if (b) return b;
  if (it.t === 'i') b = [it.x, it.y, it.x + it.w, it.y + it.h];
  else if (it.t === 'f') { const [w, h] = FRAMES[it.fmt]; b = [it.x, it.y, it.x + w, it.y + h]; }
  else {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of it.t === 't' ? it.s : [it]) {
      const r = s.w * 1.3;
      for (let i = 0; i < s.pts.length; i += 3) {
        b[0] = Math.min(b[0], s.pts[i] - r); b[1] = Math.min(b[1], s.pts[i + 1] - r);
        b[2] = Math.max(b[2], s.pts[i] + r); b[3] = Math.max(b[3], s.pts[i + 1] + r);
      }
    }
  }
  boxes.set(it, b);
  return b;
}
const union = (list) => list.reduce((u, it) => { const b = bbox(it); return [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function share(it, poly) {
  if (it.t === 'f') return 0;   // Bereiche werden über ihren Reiter verschoben, nicht ausgewählt
  if (it.t === 'i') return inPolygon(it.x + it.w / 2, it.y + it.h / 2, poly) ? 1 : 0;
  let n = 0, hit = 0;
  for (const s of it.t === 't' ? it.s : [it]) {
    for (let i = 0; i < s.pts.length; i += 3) { n++; if (inPolygon(s.pts[i], s.pts[i + 1], poly)) hit++; }
  }
  return n ? hit / n : 0;
}

function nearStroke(s, x, y, r) {
  const p = s.pts, rr = (r + s.w / 2) ** 2;
  for (let i = 0; i < p.length; i += 3) {
    const ax = p[i], ay = p[i + 1];
    const bx = p[i + 3] ?? ax, by = p[i + 4] ?? ay;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
    if ((ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2 <= rr) return true;
  }
  return false;
}

// Verschieben/Skalieren: neue Objekte, die alten bleiben für "Rückgängig" unverändert
function transform(it, ox, oy, k, dx, dy) {
  const tx = (x) => ox + (x - ox) * k + dx, ty = (y) => oy + (y - oy) * k + dy;
  const st = (s) => ({ ...s, w: s.w * k, pts: s.pts.map((v, i) => (i % 3 === 0 ? tx(v) : i % 3 === 1 ? ty(v) : v)) });
  if (it.t === 's') return st(it);
  if (it.t === 't') return { ...it, s: it.s.map(st) };
  if (it.t === 'f') return { ...it, x: it.x + dx, y: it.y + dy };   // Bereiche werden nur verschoben
  return { ...it, x: tx(it.x), y: ty(it.y), w: it.w * k, h: it.h * k };
}

// ---------- Striche zeichnen ----------
const widthAt = (s, p) => s.w * (0.35 + 0.95 * p);

function drawStroke(ctx, s) {
  const p = s.pts, n = p.length / 3;
  if (!n) return;
  ctx.strokeStyle = ctx.fillStyle = s.c;
  if (n === 1) {
    ctx.beginPath(); ctx.arc(p[0], p[1], widthAt(s, p[2]) / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // geglättet über die Mittelpunkte; Abschnitte mit gleicher Breite in einem Pfad
  let curW = -1;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  let lx = p[0], ly = p[1];
  for (let j = 1; j < n; j++) {
    const x = p[j * 3], y = p[j * 3 + 1];
    const last = j === n - 1;
    const mx = last ? x : (x + p[j * 3 + 3]) / 2, my = last ? y : (y + p[j * 3 + 4]) / 2;
    const w = Math.round(widthAt(s, p[j * 3 + 2]) * 4) / 4;
    if (w !== curW) {
      if (curW > 0) { ctx.lineWidth = curW; ctx.stroke(); ctx.beginPath(); ctx.moveTo(lx, ly); }
      curW = w;
    }
    ctx.quadraticCurveTo(x, y, mx, my);
    lx = mx; ly = my;
  }
  ctx.lineWidth = curW;
  ctx.stroke();
}


// ====================================================================
// Zeichenfläche
// opts: { items, colors, onCommit(items, h, w), onOpenTitle(titleItem), onDeleteTitles(titles) -> Promise<bool>,
//         onExport(frameIndex), hold(bool) }
// ====================================================================
export function createBoard(opts) {
  let items = opts.items;
  let tool = 'pen', pen = { c: '#0C3741', w: 2.2 }, finger = false;
  const past = [], future = [];
  let sel = null;            // { set: Set<item>, box: [x0,y0,x1,y1] }
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
  sc.innerHTML = `<div class="ink-page">
      <div class="ink-tiles"></div>
      <div class="ink-frames"></div>
      <div class="ink-titles"></div>
    </div>
    <svg class="ink-lasso" aria-hidden="true"><polyline/></svg>
    <div class="ink-zoom" hidden>
      <button type="button" data-zoom="out" aria-label="Verkleinern" title="Verkleinern">${ICON.minus}</button>
      <span class="ink-zpct"></span>
      <button type="button" data-zoom="in" aria-label="Vergrößern" title="Vergrößern">${ICON.plus}</button>
      <button type="button" data-zoom="reset" class="ink-zreset">${ICON.target}<span>Ursprungsansicht</span></button>
    </div>`;
  const pg = sc.firstElementChild;
  const tileLayer = pg.querySelector('.ink-tiles');
  const titleLayer = pg.querySelector('.ink-titles');
  const frameLayer = pg.querySelector('.ink-frames');
  const lassoSvg = sc.querySelector('.ink-lasso');
  const lassoLine = lassoSvg.firstElementChild;
  const zoomBar = sc.querySelector('.ink-zoom');
  const zoomPct = zoomBar.querySelector('.ink-zpct');

  const setTool = (t) => { tool = t; clearSel(); sc.dataset.tool = t; };
  setTool('pen');

  // ---------- Ansicht ----------
  // Ebene verschieben und (bis zum nächsten Neuaufbau) per CSS skalieren; Kästchen als Hintergrund
  function place() {
    const s = cur(), ox = -view.x * s, oy = -view.y * s;
    pg.style.transform = `translate(${ox}px, ${oy}px) scale(${s / scale})`;
    sc.style.backgroundSize = `${GRID * s}px ${GRID * s}px`;
    sc.style.backgroundPosition = `${ox}px ${oy}px`;
    zoomBar.hidden = Math.abs(view.z - 1) < .005 && Math.abs(view.x) < 1 && view.y > -1;
    zoomPct.textContent = Math.round(view.z * 100) + ' %';
  }

  function layout() {
    const w = sc.clientWidth;
    if (!w) return;
    base = w / VIEW;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
  const resetView = () => goTo(0, 0, 1);

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

  let lastW = 0;
  const ro = new ResizeObserver(() => { if (sc.clientWidth !== lastW) { lastW = sc.clientWidth; layout(); } else ensureTiles(); });
  ro.observe(sc);

  // ---------- Kacheln ----------
  function tileCanvas(ix, iy) {
    const key = ix + ':' + iy;
    let cv = tiles.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.ix = ix; cv.iy = iy;
    Object.assign(cv.style, { left: ix * TILE_PX + 'px', top: iy * TILE_PX + 'px', width: TILE_PX + 'px', height: TILE_PX + 'px' });
    cv.width = cv.height = Math.round(TILE_PX * dpr);
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
  const hits = (cv, b) => b[2] >= cv.ix * tileU && b[0] <= (cv.ix + 1) * tileU && b[3] >= cv.iy * tileU && b[1] <= (cv.iy + 1) * tileU;
  // alle Kacheln, die ein Rechteck berühren (legt sie bei Bedarf an)
  const tilesFor = (b) => {
    const out = [];
    for (let iy = Math.floor(b[1] / tileU); iy <= Math.floor(b[3] / tileU); iy++) {
      for (let ix = Math.floor(b[0] / tileU); ix <= Math.floor(b[2] / tileU); ix++) out.push(tileCanvas(ix, iy));
    }
    return out;
  };

  function drawItem(ctx, it) {
    if (it.t === 'f') return;   // Bereiche sind nur Markierungen (HTML darüber)
    if (it.t === 's') return drawStroke(ctx, it);
    if (it.t === 't') return it.s.forEach((s) => drawStroke(ctx, s));
    const img = loaded.get(it.src);
    if (img) return ctx.drawImage(img, it.x, it.y, it.w, it.h);
    ctx.fillStyle = 'rgba(12,55,65,.06)';
    ctx.fillRect(it.x, it.y, it.w, it.h);
    getImage(it.src).then((bmp) => { if (bmp && !loaded.has(it.src)) { loaded.set(it.src, bmp); redrawBox(bbox(it)); renderSel(); } });
  }

  function drawTile(cv) {
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    tileCtx(cv);
    for (const it of items) if (!sel?.set.has(it) && hits(cv, bbox(it))) drawItem(ctx, it);
  }

  const redrawBox = (b) => tiles.forEach((cv) => { if (hits(cv, b)) drawTile(cv); });
  const redrawAll = () => tiles.forEach(drawTile);

  // ---------- Titel: anklickbare Flächen über den Strichen ----------
  function renderOverlays() { renderTitles(); renderFrames(); }

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
  titleLayer.addEventListener('click', (e) => {
    const el = e.target.closest('.ink-title');
    if (el) opts.onOpenTitle(items[+el.dataset.idx]);
  });

  // ---------- Bereiche (A4): gestrichelter Rahmen mit Reiter zum Verschieben ----------
  const frameList = () => items.filter((it) => it.t === 'f');
  const frameName = (f, n) => `${f.fmt === 'a4l' ? 'A4 quer' : 'A4 hoch'} · ${n}`;

  function renderFrames() {
    frameLayer.innerHTML = '';
    frameList().forEach((f, n) => {
      const b = bbox(f);
      const el = document.createElement('div');
      el.className = 'ink-frame';
      Object.assign(el.style, { left: b[0] * scale + 'px', top: b[1] * scale + 'px', width: (b[2] - b[0]) * scale + 'px', height: (b[3] - b[1]) * scale + 'px' });
      el.innerHTML = `<button type="button" class="ink-ftab" data-frame="${n}">${frameName(f, n + 1)}</button>`;
      frameLayer.appendChild(el);
    });
  }

  // freier Platz rechts neben dem sichtbaren Bereich bzw. unter vorhandenen Bereichen, auf den Kästchen
  function addFrame(fmt) {
    const [w, fh] = FRAMES[fmt];
    const snap = (v) => Math.round(v / GRID) * GRID;
    let x = snap(view.x + GRID * 2), y = snap(view.y + GRID * 3);
    const overlaps = (ax, ay) => frameList().some((f) => { const b = bbox(f); return ax < b[2] && ax + w > b[0] && ay < b[3] && ay + fh > b[1]; });
    while (overlaps(x, y)) y += GRID * 4;
    commit([...items, { t: 'f', fmt, x, y }]);
    goTo(x - GRID * 2, y - GRID * 3, view.z);
  }

  // Inhalt eines Bereichs: alles, dessen Mitte darin liegt
  function frameContent(f) {
    const [x0, y0, x1, y1] = bbox(f);
    return items.filter((it) => {
      if (it === f || it.t === 'f') return false;
      const b = bbox(it), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    });
  }

  function setFrameFmt(f, fmt) {
    if (f.fmt === fmt) return;
    commit(items.map((it) => (it === f ? { ...it, fmt } : it)));
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
    to.push(items);
    items = from.pop();
    redrawAll();
    renderOverlays();
    opts.onCommit(items, ...extent());
  }

  // ---------- Auswahl ----------
  const selBox = document.createElement('div');
  selBox.className = 'ink-sel';
  selBox.hidden = true;
  selBox.innerHTML = `<canvas></canvas><i class="ink-sel-h" aria-hidden="true"></i>
    <div class="ink-selbar">
      <button type="button" data-sel="title">Als Titel</button>
      <button type="button" data-sel="delete" class="danger">Löschen</button>
    </div>`;
  pg.appendChild(selBox);
  const selCv = selBox.querySelector('canvas');

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
    const strokes = [...sel.set].filter((it) => it.t === 's');
    selBox.querySelector('[data-sel="title"]').hidden = !strokes.length || [...sel.set].some((it) => it.t === 't');
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
    items.forEach((it) => { if (sel.set.has(it)) drawItem(ctx, it); });
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

  function makeTitle() {
    if (!sel) return;
    const strokes = items.filter((it) => sel.set.has(it) && it.t === 's');
    if (!strokes.length) return;
    const title = { t: 't', page: newId(), s: strokes.map(({ c, w, pts }) => ({ t: 's', c, w, pts })) };
    const first = items.findIndex((it) => sel.set.has(it) && it.t === 's');
    const next = items.filter((it) => !(sel.set.has(it) && it.t === 's'));
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
  const recolor = (c) => editSel((it) => (it.t === 's' ? { ...it, c } : it.t === 't' ? { ...it, s: it.s.map((s) => ({ ...s, c })) } : it));
  const group = () => { const g = newId(); editSel((it) => ({ ...it, g })); };
  const ungroup = () => editSel(({ g, ...rest }) => rest);

  // obenauf liegendes Element an einem Punkt
  function hitAt(x, y) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], b = bbox(it), r = it.t === 's' ? 8 : 4;
      if (it.t === 'f') continue;
      if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) continue;
      if (it.t !== 's' || nearStroke(it, x, y, r)) return it;
    }
    return null;
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
    const canTitle = list.some((it) => it.t === 's') && !list.some((it) => it.t === 't');
    const hasInk = list.some((it) => it.t !== 'i');
    showMenu(cx, cy, `
      ${hasInk ? `<div class="cm-colors" role="group" aria-label="Umfärben">${(opts.colors || []).map((c, i) => `<button class="cm-color" data-m="color" data-i="${i}" style="background:${c}" aria-label="Farbe ${i + 1}"></button>`).join('')}</div><hr>` : ''}
      ${list.length > 1 && !oneGroup ? `<button class="cm-i" data-m="group">${ICON.stack}<span>Gruppieren</span></button>` : ''}
      ${oneGroup ? `<button class="cm-i" data-m="ungroup">${ICON.stack}<span>Gruppierung aufheben</span></button>` : ''}
      ${canTitle ? `<button class="cm-i" data-m="title">${ICON.chevR}<span>Als Titel</span></button>` : ''}
      <button class="cm-i danger" data-m="delete">${ICON.trash}<span>Löschen</span></button>`, (m, i) => {
      if (m === 'color') recolor(opts.colors[+i]);
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
    const opt = (fmt, label) => `<button class="cm-i ${f.fmt === fmt ? 'on' : ''}" data-m="${fmt}">${ICON.frame}<span>${label}</span>${f.fmt === fmt ? ICON.check : ''}</button>`;
    showMenu(cx, cy, `${opt('a4p', 'A4 hoch')}${opt('a4l', 'A4 quer')}<hr>
      <button class="cm-i" data-m="export">${ICON.download}<span>Exportieren …</span></button>
      <button class="cm-i danger" data-m="remove">${ICON.trash}<span>Bereich entfernen</span></button>`, (m) => {
      if (m === 'a4p' || m === 'a4l') setFrameFmt(f, m);
      else if (m === 'export') opts.onExport(n);
      else if (m === 'remove') commit(items.filter((it) => it !== f));   // Inhalt bleibt stehen
    });
  }
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // Punkt in der Auswahl: Menü dafür; sonst das Element darunter auswählen
  function contextAt(cx, cy, x, y) {
    const inSel = sel && x >= sel.box[0] - 6 && x <= sel.box[2] + 6 && y >= sel.box[1] - 6 && y <= sel.box[3] + 6;
    if (!inSel) {
      const hit = hitAt(x, y);
      if (!hit) { clearSel(); closeMenu(); return; }
      setSel(withGroups([hit]));
    }
    openMenu(cx, cy);
  }

  sc.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (Date.now() - menuAt < 700) return;   // schon durch langes Drücken geöffnet
    const [x, y] = pos(e);
    contextAt(e.clientX, e.clientY, x, y);
  });

  // langes Drücken (Stift, Finger, Maus) ohne Bewegung
  let lp = null;
  const cancelLp = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  function startLp(e) {
    cancelLp();
    const cx = e.clientX, cy = e.clientY, [x, y] = pos(e);
    lp = { id: e.pointerId, cx, cy, t: setTimeout(() => {
      lp = null;
      cancelAct();
      contextAt(cx, cy, x, y);
    }, 520) };
  }

  selBox.querySelector('.ink-selbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sel]');
    if (b?.dataset.sel === 'title') makeTitle();
    if (b?.dataset.sel === 'delete') deleteSel();
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

  // keine Browser-Gesten (Scrollen, Lupe, Doppeltipp-Zoom) auf der Fläche; Knöpfe bleiben antippbar
  sc.addEventListener('touchstart', (e) => { if (!e.target.closest('button')) e.preventDefault(); }, { passive: false });
  sc.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  function drawLasso() {
    const s = cur();
    lassoLine.setAttribute('points', act.poly.map((v, i) => ((v - (i % 2 ? view.y : view.x)) * s).toFixed(1)).join(' '));
  }

  // laufende Geste verwerfen, ohne etwas zu übernehmen
  function cancelAct() {
    if (!act) return;
    const a = act;
    act = null;
    if (a.kind === 'pen') { items = a.before; redrawBox(bbox(a.s)); }
    else if (a.kind === 'erase' && a.hit) { items = a.before; redrawAll(); }
    else if (a.kind === 'lasso') { lassoSvg.classList.remove('on'); lassoLine.setAttribute('points', ''); }
    else if (a.kind === 'fmove') { a.tab.closest('.ink-frame').style.translate = ''; selBox.classList.remove('bare'); clearSel(); }
    else if (a.kind === 'move' || a.kind === 'scale') { selCv.style.transform = ''; renderSel(); }
    sc.classList.remove('panning');
    opts.hold(false);
  }

  function startPan(e) {
    act = { kind: 'pan', id: e.pointerId, touch: e.pointerType === 'touch', lx: e.clientX, ly: e.clientY, vx: 0, vy: 0, t: performance.now() };
    if (!act.touch) sc.classList.add('panning');
    opts.hold(true);
  }

  function startPinch() {
    const [[ax, ay], [bx, by]] = [...fingers.values()];
    const r = sc.getBoundingClientRect(), s = cur();
    const mx = (ax + bx) / 2 - r.left, my = (ay + by) / 2 - r.top;
    act = { kind: 'pinch', touch: true, d: Math.hypot(bx - ax, by - ay) || 1, z: view.z, ux: view.x + mx / s, uy: view.y + my / s };
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

  sc.addEventListener('pointerdown', (e) => {
    stopAnim();
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
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button === 1 && !act) {   // mittlere Maustaste: verschieben
      e.preventDefault();
      capture(sc, e.pointerId);
      startPan(e);
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'touch') {
      if (penDown) return;                          // Handballen beim Schreiben
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      capture(sc, e.pointerId);
      if (fingers.size === 2) { cancelLp(); cancelAct(); startPinch(); return; }
      if (fingers.size > 2 || act) return;
      if (!finger) { startPan(e); startLp(e); return; }   // Finger verschiebt; lange drücken öffnet das Menü
    } else if (e.pointerType === 'pen' && act?.touch) {
      cancelLp(); cancelAct();                      // der Stift hat Vorrang vor der Hand
      fingers.clear();
    }
    if (act) return;                                 // nur eine Geste gleichzeitig
    e.preventDefault();
    capture(sc, e.pointerId);
    if (e.pointerType === 'pen') penDown = true;
    opts.hold(true);
    const [x, y, p] = pos(e);
    const touch = e.pointerType === 'touch';
    startLp(e);

    const onHandle = e.target.closest('.ink-sel-h'), onSel = e.target.closest('.ink-sel');
    if (sel && onHandle) act = { kind: 'scale', id: e.pointerId, touch, x, y, k: 1 };
    else if (sel && onSel) act = { kind: 'move', id: e.pointerId, touch, x, y, dx: 0, dy: 0 };
    else if (tool === 'pen') {
      clearSel();
      const s = { t: 's', c: pen.c, w: pen.w, pts: [x, y, p] };
      act = { kind: 'pen', id: e.pointerId, touch, s, before: items };
      items = [...items, s];
      tilesFor([x - 5, y - 5, x + 5, y + 5]).forEach((cv) => drawStroke(tileCtx(cv), s));
    } else if (tool === 'eraser') {
      clearSel();
      act = { kind: 'erase', id: e.pointerId, touch, before: items, hit: false };
      erase(x, y);
    } else {
      clearSel();
      act = { kind: 'lasso', id: e.pointerId, touch, poly: [x, y] };
      lassoSvg.classList.add('on');
    }
  });

  sc.addEventListener('pointermove', (e) => {
    if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.cx, e.clientY - lp.cy) > 8) cancelLp();
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (act?.kind === 'pinch') { if (fingers.has(e.pointerId)) pinchMove(); return; }
    if (!act || e.pointerId !== act.id) return;
    if (act.kind === 'pan') return panMove(e);
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) move(pos(ev));
  });

  function move([x, y, p]) {
    if (act.kind === 'pen') {
      const pts = act.s.pts, n = pts.length;
      const lx = pts[n - 3], ly = pts[n - 2];
      if ((x - lx) ** 2 + (y - ly) ** 2 < .36 / view.z ** 2) return;   // zu nah am letzten Punkt
      pts.push(x, y, p);
      boxes.delete(act.s);
      // nur das neue Stück zeichnen; am Ende wird die Kachel sauber neu gezeichnet
      const seg = { c: act.s.c, w: act.s.w, pts: pts.slice(Math.max(0, n - 6)) };
      const r = act.s.w * 2;
      tilesFor([Math.min(lx, x) - r, Math.min(ly, y) - r, Math.max(lx, x) + r, Math.max(ly, y) + r]).forEach((cv) => drawStroke(tileCtx(cv), seg));
    } else if (act.kind === 'erase') erase(x, y);
    else if (act.kind === 'lasso') {
      act.poly.push(x, y);
      drawLasso();
    } else if (act.kind === 'move') {
      act.dx = x - act.x; act.dy = y - act.y;
      renderSel(act.dx, act.dy, 1);
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

  function erase(x, y) {
    const r = ERASE_R / view.z;
    const gone = items.filter((it) => {
      if (it.t !== 's') return false;
      const b = bbox(it);
      return x > b[0] - r && x < b[2] + r && y > b[1] - r && y < b[3] + r && nearStroke(it, x, y, r);
    });
    if (!gone.length) return;
    act.hit = true;
    items = items.filter((it) => !gone.includes(it));
    redrawBox(union(gone));
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
      if (a.touch && performance.now() - a.t < 80) glide(a.vx, a.vy);
    } else if (a.kind === 'pen') {
      boxes.delete(a.s);
      items = a.before;
      commit([...a.before, a.s]);
      redrawBox(bbox(a.s));
    } else if (a.kind === 'erase' && a.hit) {
      const now = items;
      items = a.before;
      commit(now);
    } else if (a.kind === 'lasso') {
      lassoSvg.classList.remove('on');
      lassoLine.setAttribute('points', '');
      if (a.poly.length >= 6) setSel(withGroups(items.filter((it) => share(it, a.poly) >= .5)));
    } else if (a.kind === 'move') applySel(a.dx, a.dy, 1);
    else if (a.kind === 'fmove') {
      selBox.classList.remove('bare');
      if (a.dx || a.dy) { applySel(a.dx, a.dy, 1); clearSel(); }
      else { clearSel(); const r = a.tab.getBoundingClientRect(); openFrameMenu(a.n, r.left, r.bottom + 6); }
    }
    else if (a.kind === 'scale') { selCv.style.transform = ''; applySel(0, 0, a.k); }
    opts.hold(false);
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

  // ---------- nach außen ----------
  return {
    el: sc,
    // nach dem Einhängen ins Dokument (auch nach jedem Neuzeichnen der Ansicht)
    attach() { if (!scale || sc.clientWidth !== lastW) { lastW = sc.clientWidth; layout(); } else { place(); ensureTiles(); } },
    setTool,
    get tool() { return tool; },
    setPen(p) { pen = { ...pen, ...p }; },
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
    frames: () => frameList().map((f, n) => ({ n, name: frameName(f, n + 1), fmt: f.fmt, box: bbox(f) })),
    // Bereich als Bild zeichnen; bg: 'grid' (weiß mit Kästchen) oder 'none' (durchsichtig)
    async renderBox(box, pxW, bg) {
      const [x0, y0, x1, y1] = box, k = pxW / (x1 - x0);
      const cv = document.createElement('canvas');
      cv.width = Math.round(pxW);
      cv.height = Math.round((y1 - y0) * k);
      const inside = items.filter((it) => it.t !== 'f' && (() => { const b = bbox(it); return b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1; })());
      await Promise.all(inside.filter((it) => it.t === 'i').map(async (it) => { const bmp = await getImage(it.src); if (bmp) loaded.set(it.src, bmp); }));
      const ctx = cv.getContext('2d');
      if (bg === 'grid') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.strokeStyle = 'rgba(12,55,65,.09)';
        ctx.lineWidth = Math.max(1, k * 1.1);
        ctx.beginPath();
        for (let gx = Math.ceil(x0 / GRID) * GRID; gx <= x1; gx += GRID) { const p = Math.round((gx - x0) * k) + .5; ctx.moveTo(p, 0); ctx.lineTo(p, cv.height); }
        for (let gy = Math.ceil(y0 / GRID) * GRID; gy <= y1; gy += GRID) { const p = Math.round((gy - y0) * k) + .5; ctx.moveTo(0, p); ctx.lineTo(cv.width, p); }
        ctx.stroke();
      }
      ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      inside.forEach((it) => drawItem(ctx, it));
      return cv;
    },
    imagePaths: () => items.filter((it) => it.t === 'i').map((it) => it.src),
    destroy() { ro.disconnect(); stopAnim(); closeMenu(); sc.remove(); },
  };
}
