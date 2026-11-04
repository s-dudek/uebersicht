// Handschrift: Zeichenfläche mit kariertem Papier
// Stift (mit Druck), Radierer (ganze Striche), Auswahl (Lasso) zum Verschieben, Vergrößern, Löschen und "Als Titel".
// Die Fläche ist unbegrenzt: sie wächst nach rechts und unten mit. 1000 Einheiten passen in die Fensterbreite.
// Gezeichnet wird in Kacheln, damit große Flächen wenig Speicher brauchen.
// Bereiche (A4 hoch/quer) markieren, was exportiert wird; sie liegen immer genau auf den Kästchen.
import { ICON } from './icons.js';
import { FRAMES, getImage, newId } from './ink-store.js';

const VIEW = 1000;       // so viele Einheiten passen in die Fensterbreite
const TILE = 800;        // Kachelgröße in Einheiten
const GRID = 25;         // Kästchengröße in Einheiten
const MIN_H = 1414;      // Seitenhöhe am Anfang (Verhältnis wie A4)
const ERASE_R = 9;       // Radierer-Radius in Einheiten
const HISTORY = 60;      // Schritte zum Rückgängigmachen

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
// opts: { items, h, w, colors, onCommit(items, h, w), onOpenTitle(titleItem), onDeleteTitles(titles) -> Promise<bool>,
//         onExport(frameIndex), hold(bool) }
// ====================================================================
export function createBoard(opts) {
  let items = opts.items;
  let h = Math.max(MIN_H, opts.h || 0);
  let pw = Math.max(VIEW, opts.w || 0);   // Breite der Fläche in Einheiten
  let tool = 'pen', pen = { c: '#0C3741', w: 2.2 }, finger = false;
  const past = [], future = [];
  let sel = null;            // { set: Set<item>, box: [x0,y0,x1,y1] }
  let scale = 1, dpr = 1, savedTop = 0, savedLeft = 0;
  const tiles = new Map();   // "spalte:zeile" -> Canvas
  const loaded = new Map();  // Bildpfad -> ImageBitmap

  // ---------- Aufbau ----------
  const sc = document.createElement('div');
  sc.className = 'ink-scroll';
  sc.innerHTML = `<div class="ink-page">
      <div class="ink-tiles"></div>
      <div class="ink-frames"></div>
      <div class="ink-titles"></div>
      <svg class="ink-lasso" preserveAspectRatio="none" aria-hidden="true"><polyline/></svg>
    </div>`;
  const pg = sc.firstElementChild;
  const tileLayer = pg.querySelector('.ink-tiles');
  const titleLayer = pg.querySelector('.ink-titles');
  const frameLayer = pg.querySelector('.ink-frames');
  const lassoSvg = pg.querySelector('.ink-lasso');
  const lassoLine = lassoSvg.firstElementChild;

  const setTool = (t) => { tool = t; clearSel(); sc.dataset.tool = t; };
  setTool('pen');

  // ---------- Maße ----------
  function sizePage() {
    pg.style.width = pw * scale + 'px';
    pg.style.height = h * scale + 'px';
    lassoSvg.setAttribute('viewBox', `0 0 ${pw} ${h}`);
  }

  function layout() {
    const w = sc.clientWidth;
    if (!w) return;
    scale = w / VIEW;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    h = Math.max(h, MIN_H, Math.ceil(sc.clientHeight / scale));
    pg.style.setProperty('--g', GRID * scale + 'px');
    sizePage();
    tiles.forEach((cv) => cv.remove());
    tiles.clear();
    ensureTiles();
    renderOverlays();
    renderSel();
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
    Object.assign(cv.style, { left: ix * TILE * scale + 'px', top: iy * TILE * scale + 'px', width: TILE * scale + 'px', height: TILE * scale + 'px' });
    cv.width = cv.height = Math.round(TILE * scale * dpr);
    tiles.set(key, cv);
    tileLayer.appendChild(cv);
    drawTile(cv);
    return cv;
  }

  // Kacheln im sichtbaren Bereich (plus Rand) anlegen, weit entfernte freigeben
  function ensureTiles() {
    if (!scale) return;
    const range = (pos, size, max) => [Math.max(0, Math.floor(pos / scale / TILE) - 1), Math.min(Math.ceil(max / TILE) - 1, Math.floor((pos + size) / scale / TILE) + 1)];
    const [xa, xb] = range(sc.scrollLeft, sc.clientWidth, pw), [ya, yb] = range(sc.scrollTop, sc.clientHeight, h);
    for (let iy = ya; iy <= yb; iy++) for (let ix = xa; ix <= xb; ix++) tileCanvas(ix, iy);
    tiles.forEach((cv, key) => { if (cv.ix < xa - 1 || cv.ix > xb + 1 || cv.iy < ya - 1 || cv.iy > yb + 1) { cv.remove(); tiles.delete(key); } });
  }

  function tileCtx(cv) {
    const ctx = cv.getContext('2d');
    const k = scale * dpr;
    ctx.setTransform(k, 0, 0, k, -cv.ix * TILE * k, -cv.iy * TILE * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }
  const hits = (cv, b) => b[2] >= cv.ix * TILE && b[0] <= (cv.ix + 1) * TILE && b[3] >= cv.iy * TILE && b[1] <= (cv.iy + 1) * TILE;
  // alle Kacheln, die ein Rechteck berühren (legt sichtbare bei Bedarf an)
  const tilesFor = (b) => {
    const out = [];
    for (let iy = Math.max(0, Math.floor(b[1] / TILE)); iy <= Math.floor(b[3] / TILE); iy++) {
      for (let ix = Math.max(0, Math.floor(b[0] / TILE)); ix <= Math.floor(b[2] / TILE); ix++) out.push(tileCanvas(ix, iy));
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
    const snap = (v) => Math.max(GRID * 2, Math.round(v / GRID) * GRID);
    let x = snap(sc.scrollLeft / scale + GRID * 2), y = snap(sc.scrollTop / scale + GRID * 3);
    const overlaps = (ax, ay) => frameList().some((f) => { const b = bbox(f); return ax < b[2] && ax + w > b[0] && ay < b[3] && ay + fh > b[1]; });
    while (overlaps(x, y)) y += GRID * 4;
    commit([...items, { t: 'f', fmt, x, y }]);
    sc.scrollTo({ top: Math.max(0, (y - GRID * 3) * scale), left: Math.max(0, (x - GRID * 2) * scale), behavior: 'smooth' });
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
  // Fläche wächst nach rechts und unten, sobald man in die Nähe des Randes kommt
  function grow() {
    let maxX = 0, maxY = 0;
    for (const it of items) { const b = bbox(it); maxX = Math.max(maxX, b[2]); maxY = Math.max(maxY, b[3]); }
    const nh = maxY > h - 500 ? Math.ceil((maxY + 800) / TILE) * TILE : h;
    const nw = maxX > pw - 300 ? Math.ceil((maxX + 600) / TILE) * TILE : pw;
    if (nh === h && nw === pw) return;
    h = nh; pw = nw;
    sizePage();
    ensureTiles();
  }

  function commit(next) {
    past.push(items);
    if (past.length > HISTORY) past.shift();
    future.length = 0;
    items = next;
    grow();
    renderOverlays();
    opts.onCommit(items, h, pw);
  }

  function step(from, to) {
    if (!from.length) return;
    clearSel();
    to.push(items);
    items = from.pop();
    redrawAll();
    renderOverlays();
    opts.onCommit(items, h, pw);
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
    selBox.classList.toggle('below', y0 * scale - sc.scrollTop < 56);
    const strokes = [...sel.set].filter((it) => it.t === 's');
    selBox.querySelector('[data-sel="title"]').hidden = !strokes.length || [...sel.set].some((it) => it.t === 't');
    if (dx || dy || k !== 1) return;   // beim Ziehen nur verschieben, nicht neu zeichnen
    selCv.width = Math.max(1, Math.round(w * scale * dpr));
    selCv.height = Math.max(1, Math.round(hh * scale * dpr));
    selCv.style.width = w * scale + 'px';
    selCv.style.height = hh * scale + 'px';
    const ctx = selCv.getContext('2d');
    const kk = scale * dpr;
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
  sc.addEventListener('scroll', closeMenu, { passive: true });

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

  pg.addEventListener('contextmenu', (e) => {
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
      if (act?.kind === 'pen') { items = act.before; redrawBox(bbox(act.s)); }
      if (act?.kind === 'lasso') { lassoSvg.classList.remove('on'); lassoLine.setAttribute('points', ''); }
      if (act) { act = null; opts.hold(false); }
      contextAt(cx, cy, x, y);
    }, 520) };
  }

  selBox.querySelector('.ink-selbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sel]');
    if (b?.dataset.sel === 'title') makeTitle();
    if (b?.dataset.sel === 'delete') deleteSel();
  });

  // ---------- Eingabe: Stift, Maus, wahlweise Finger ----------
  let act = null;               // laufende Geste
  let penDown = false;
  const blocked = new Set();    // Berührungen (Handballen), die während des Schreibens begonnen haben
  const fingers = new Map();    // Finger-Modus: zwei Finger verschieben die Seite

  const pos = (e) => {
    const r = pg.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale, e.pointerType === 'mouse' || !e.pressure ? .5 : e.pressure];
  };

  // Apple Pencil darf die Seite nicht verschieben, Handballen beim Schreiben auch nicht
  const stopTouch = (e) => {
    if (e.target.closest('button')) return;
    const stylus = [...e.changedTouches].some((t) => t.touchType === 'stylus');
    if (e.type === 'touchstart' && penDown) [...e.changedTouches].forEach((t) => blocked.add(t.identifier));
    if (stylus || penDown || finger || [...e.changedTouches].some((t) => blocked.has(t.identifier))) e.preventDefault();
  };
  const endTouch = (e) => [...e.changedTouches].forEach((t) => blocked.delete(t.identifier));
  sc.addEventListener('touchstart', stopTouch, { passive: false });
  sc.addEventListener('touchmove', stopTouch, { passive: false });
  sc.addEventListener('touchend', endTouch);
  sc.addEventListener('touchcancel', endTouch);

  pg.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.ink-ftab');
    if (tab && !act) {   // Bereich samt Inhalt verschieben (Tippen ohne Bewegung: Menü)
      e.preventDefault();
      tab.setPointerCapture(e.pointerId);
      opts.hold(true);
      const n = +tab.dataset.frame, f = frameList()[n];
      const [x, y] = pos(e);
      setSel([f, ...frameContent(f)]);
      selBox.classList.add('bare');   // nur der Inhalt wandert mit, ohne Auswahlrahmen
      act = { kind: 'fmove', id: e.pointerId, n, x, y, dx: 0, dy: 0, cx: e.clientX, cy: e.clientY, tab };
      return;
    }
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'touch') {
      if (penDown) return;
      if (!finger) { startLp(e); return; }        // Finger scrollt; lange drücken öffnet das Menü
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (fingers.size > 1) {                       // zweiter Finger: Zeichnen abbrechen, verschieben
        if (act?.kind === 'pen') { items = act.before; redrawBox(bbox(act.s)); }
        if (act) opts.hold(false);
        act = { kind: 'pan', id: null };
        return;
      }
    }
    if (act) return;                                 // nur eine Geste gleichzeitig
    e.preventDefault();
    pg.setPointerCapture(e.pointerId);
    if (e.pointerType === 'pen') penDown = true;
    opts.hold(true);
    const [x, y, p] = pos(e);
    startLp(e);

    const onHandle = e.target.closest('.ink-sel-h'), onSel = e.target.closest('.ink-sel');
    if (sel && onHandle) act = { kind: 'scale', id: e.pointerId, x, y, k: 1 };
    else if (sel && onSel) act = { kind: 'move', id: e.pointerId, x, y, dx: 0, dy: 0 };
    else if (tool === 'pen') {
      clearSel();
      const s = { t: 's', c: pen.c, w: pen.w, pts: [x, y, p] };
      act = { kind: 'pen', id: e.pointerId, s, before: items };
      items = [...items, s];
      tilesFor([x - 5, y - 5, x + 5, y + 5]).forEach((cv) => drawStroke(tileCtx(cv), s));
    } else if (tool === 'eraser') {
      clearSel();
      act = { kind: 'erase', id: e.pointerId, before: items, hit: false };
      erase(x, y);
    } else {
      clearSel();
      act = { kind: 'lasso', id: e.pointerId, poly: [x, y] };
      lassoSvg.classList.add('on');
    }
  });

  const onMove = (e) => {
    if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.cx, e.clientY - lp.cy) > 8) cancelLp();
    if (act?.kind === 'pan' && fingers.has(e.pointerId)) {
      const [px, py] = fingers.get(e.pointerId);
      fingers.set(e.pointerId, [e.clientX, e.clientY]);
      sc.scrollLeft -= (e.clientX - px) / fingers.size;
      sc.scrollTop -= (e.clientY - py) / fingers.size;
      return;
    }
    if (!act || e.pointerId !== act.id) return;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) move(pos(ev));
  };
  pg.addEventListener('pointermove', onMove);

  function move([x, y, p]) {
    if (act.kind === 'pen') {
      const pts = act.s.pts, n = pts.length;
      const lx = pts[n - 3], ly = pts[n - 2];
      if ((x - lx) ** 2 + (y - ly) ** 2 < .36) return;   // zu nah am letzten Punkt
      pts.push(x, y, p);
      boxes.delete(act.s);
      // nur das neue Stück zeichnen; am Ende wird die Kachel sauber neu gezeichnet
      const seg = { c: act.s.c, w: act.s.w, pts: pts.slice(Math.max(0, n - 6)) };
      const r = act.s.w * 2;
      tilesFor([Math.min(lx, x) - r, Math.min(ly, y) - r, Math.max(lx, x) + r, Math.max(ly, y) + r]).forEach((cv) => drawStroke(tileCtx(cv), seg));
    } else if (act.kind === 'erase') erase(x, y);
    else if (act.kind === 'lasso') {
      act.poly.push(x, y);
      lassoLine.setAttribute('points', act.poly.map((v) => v.toFixed(1)).join(' '));
    } else if (act.kind === 'move') {
      act.dx = x - act.x; act.dy = y - act.y;
      renderSel(act.dx, act.dy, 1);
    } else if (act.kind === 'fmove') {
      // immer ganze Kästchen weit, damit der Bereich auf dem Raster bleibt
      const f = frameList()[act.n];
      act.dx = Math.max(-f.x, Math.round((x - act.x) / GRID) * GRID);
      act.dy = Math.max(-f.y, Math.round((y - act.y) / GRID) * GRID);
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
    const gone = items.filter((it) => {
      if (it.t !== 's') return false;
      const b = bbox(it);
      return x > b[0] - ERASE_R && x < b[2] + ERASE_R && y > b[1] - ERASE_R && y < b[3] + ERASE_R && nearStroke(it, x, y, ERASE_R);
    });
    if (!gone.length) return;
    act.hit = true;
    items = items.filter((it) => !gone.includes(it));
    redrawBox(union(gone));
  }

  function end(e) {
    if (lp?.id === e.pointerId) cancelLp();
    if (e.pointerType === 'pen') penDown = false;
    if (fingers.delete(e.pointerId) && act?.kind === 'pan') { if (!fingers.size) { act = null; } return; }
    if (!act || e.pointerId !== act.id) return;
    const a = act;
    act = null;
    if (a.kind === 'pen') {
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
  pg.addEventListener('pointerup', end);
  pg.addEventListener('pointercancel', end);

  // ---------- Scrollen ----------
  let raf = 0;
  sc.addEventListener('scroll', () => {
    savedTop = sc.scrollTop;
    savedLeft = sc.scrollLeft;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; ensureTiles(); });
  }, { passive: true });

  // ---------- nach außen ----------
  return {
    el: sc,
    // nach dem Einhängen ins Dokument (auch nach jedem Neuzeichnen der Ansicht)
    attach() { if (!scale || sc.clientWidth !== lastW) { lastW = sc.clientWidth; layout(); } sc.scrollTop = savedTop; sc.scrollLeft = savedLeft; ensureTiles(); },
    setTool,
    get tool() { return tool; },
    setPen(p) { pen = { ...pen, ...p }; },
    setFinger(on) { finger = on; sc.classList.toggle('finger', on); },
    undo: () => step(past, future),
    redo: () => step(future, past),
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    deleteSelection: deleteSel,
    clearHistory() { past.length = 0; future.length = 0; },
    get isEmpty() { return !items.length; },
    // Bild in der Mitte des sichtbaren Bereichs einfügen (unter die Striche)
    addImage({ path, w, h: ih }) {
      const bw = Math.min(480, VIEW - 80), bh = bw * (ih / w);
      const cx = (sc.scrollLeft + sc.clientWidth / 2) / scale, cy = (sc.scrollTop + sc.clientHeight / 2) / scale;
      commit([{ t: 'i', src: path, x: Math.max(20, cx - bw / 2), y: Math.max(20, cy - bh / 2), w: bw, h: bh }, ...items]);
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
    destroy() { ro.disconnect(); closeMenu(); sc.remove(); },
  };
}
