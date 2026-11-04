// Handschrift: Zeichenfläche mit kariertem Papier
// Stift (mit Druck), Radierer (ganze Striche), Auswahl (Lasso) zum Verschieben, Vergrößern, Löschen und "Als Titel".
// Die Seite ist 1000 Einheiten breit und wächst nach unten. Gezeichnet wird in Kacheln, damit lange Seiten wenig Speicher brauchen.
import { getImage, newId } from './ink-store.js';

const W = 1000;          // Seitenbreite in Einheiten
const TILE = 800;        // Kachelhöhe in Einheiten
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
// opts: { items, h, onCommit(items, h), onOpenTitle(titleItem), onDeleteTitles(titles) -> Promise<bool>, hold(bool) }
// ====================================================================
export function createBoard(opts) {
  let items = opts.items;
  let h = Math.max(MIN_H, opts.h || 0);
  let tool = 'pen', pen = { c: '#0C3741', w: 2.2 }, finger = false;
  const past = [], future = [];
  let sel = null;            // { set: Set<item>, box: [x0,y0,x1,y1] }
  let scale = 1, dpr = 1, savedTop = 0;
  const tiles = new Map();   // Kachelnummer -> Canvas
  const loaded = new Map();  // Bildpfad -> ImageBitmap

  // ---------- Aufbau ----------
  const sc = document.createElement('div');
  sc.className = 'ink-scroll';
  sc.innerHTML = `<div class="ink-page">
      <div class="ink-tiles"></div>
      <div class="ink-titles"></div>
      <svg class="ink-lasso" preserveAspectRatio="none" aria-hidden="true"><polyline/></svg>
    </div>`;
  const pg = sc.firstElementChild;
  const tileLayer = pg.querySelector('.ink-tiles');
  const titleLayer = pg.querySelector('.ink-titles');
  const lassoSvg = pg.querySelector('.ink-lasso');
  const lassoLine = lassoSvg.firstElementChild;

  const setTool = (t) => { tool = t; clearSel(); sc.dataset.tool = t; };
  setTool('pen');

  // ---------- Maße ----------
  function layout() {
    const w = pg.clientWidth || sc.clientWidth;
    if (!w) return;
    scale = w / W;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    h = Math.max(h, MIN_H, Math.ceil(sc.clientHeight / scale));
    pg.style.height = h * scale + 'px';
    pg.style.setProperty('--g', GRID * scale + 'px');
    lassoSvg.setAttribute('viewBox', `0 0 ${W} ${h}`);
    tiles.forEach((cv) => cv.remove());
    tiles.clear();
    ensureTiles();
    renderTitles();
    renderSel();
  }

  let lastW = 0;
  const ro = new ResizeObserver(() => { if (sc.clientWidth !== lastW) { lastW = sc.clientWidth; layout(); } else ensureTiles(); });
  ro.observe(sc);

  // ---------- Kacheln ----------
  function tileCanvas(i) {
    let cv = tiles.get(i);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.style.top = i * TILE * scale + 'px';
    cv.style.height = TILE * scale + 'px';
    cv.width = Math.round(pg.clientWidth * dpr);
    cv.height = Math.round(TILE * scale * dpr);
    tiles.set(i, cv);
    tileLayer.appendChild(cv);
    drawTile(i);
    return cv;
  }

  function ensureTiles() {
    if (!scale) return;
    const y0 = sc.scrollTop / scale, y1 = (sc.scrollTop + sc.clientHeight) / scale;
    const last = Math.ceil(h / TILE) - 1;
    const a = Math.max(0, Math.floor(y0 / TILE) - 1), b = Math.min(last, Math.floor(y1 / TILE) + 1);
    for (let i = a; i <= b; i++) tileCanvas(i);
    tiles.forEach((cv, i) => { if (i < a - 1 || i > b + 1) { cv.remove(); tiles.delete(i); } });
  }

  function tileCtx(cv, i) {
    const ctx = cv.getContext('2d');
    const k = scale * dpr;
    ctx.setTransform(k, 0, 0, k, 0, -i * TILE * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  function drawItem(ctx, it) {
    if (it.t === 's') return drawStroke(ctx, it);
    if (it.t === 't') return it.s.forEach((s) => drawStroke(ctx, s));
    const img = loaded.get(it.src);
    if (img) return ctx.drawImage(img, it.x, it.y, it.w, it.h);
    ctx.fillStyle = 'rgba(12,55,65,.06)';
    ctx.fillRect(it.x, it.y, it.w, it.h);
    getImage(it.src).then((bmp) => { if (bmp && !loaded.has(it.src)) { loaded.set(it.src, bmp); redrawBox(bbox(it)); renderSel(); } });
  }

  function drawTile(i) {
    const cv = tiles.get(i);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    tileCtx(cv, i);
    const y0 = i * TILE, y1 = y0 + TILE;
    for (const it of items) {
      if (sel?.set.has(it)) continue;
      const b = bbox(it);
      if (b[3] >= y0 && b[1] <= y1) drawItem(ctx, it);
    }
  }

  const redrawBox = (b) => tiles.forEach((_, i) => { if (b[3] >= i * TILE && b[1] <= (i + 1) * TILE) drawTile(i); });
  const redrawAll = () => tiles.forEach((_, i) => drawTile(i));

  // ---------- Titel: anklickbare Flächen über den Strichen ----------
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

  // ---------- Verlauf ----------
  function grow() {
    const maxY = items.reduce((m, it) => Math.max(m, bbox(it)[3]), 0);
    if (maxY > h - 500) {
      h = Math.ceil((maxY + 800) / TILE) * TILE;
      pg.style.height = h * scale + 'px';
      lassoSvg.setAttribute('viewBox', `0 0 ${W} ${h}`);
      ensureTiles();
    }
  }

  function commit(next) {
    past.push(items);
    if (past.length > HISTORY) past.shift();
    future.length = 0;
    items = next;
    grow();
    renderTitles();
    opts.onCommit(items, h);
  }

  function step(from, to) {
    if (!from.length) return;
    clearSel();
    to.push(items);
    items = from.pop();
    redrawAll();
    renderTitles();
    opts.onCommit(items, h);
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
    renderTitles();
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
    renderTitles();
    renderSel();
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
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'touch') {
      if (!finger || penDown) return;
      fingers.set(e.pointerId, e.clientY);
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

    if (tool === 'pen') {
      const s = { t: 's', c: pen.c, w: pen.w, pts: [x, y, p] };
      act = { kind: 'pen', id: e.pointerId, s, before: items };
      items = [...items, s];
      const cv = tileCanvas(Math.floor(y / TILE));
      drawStroke(tileCtx(cv, Math.floor(y / TILE)), s);
    } else if (tool === 'eraser') {
      act = { kind: 'erase', id: e.pointerId, before: items, hit: false };
      erase(x, y);
    } else {
      const onHandle = e.target.closest('.ink-sel-h'), onSel = e.target.closest('.ink-sel');
      if (sel && onHandle) act = { kind: 'scale', id: e.pointerId, x, y, k: 1 };
      else if (sel && onSel) act = { kind: 'move', id: e.pointerId, x, y, dx: 0, dy: 0 };
      else { clearSel(); act = { kind: 'lasso', id: e.pointerId, poly: [x, y] }; lassoSvg.classList.add('on'); }
    }
  });

  pg.addEventListener('pointermove', (e) => {
    if (act?.kind === 'pan' && fingers.has(e.pointerId)) {
      const prev = fingers.get(e.pointerId);
      fingers.set(e.pointerId, e.clientY);
      sc.scrollTop -= (e.clientY - prev) / fingers.size;
      return;
    }
    if (!act || e.pointerId !== act.id) return;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) move(pos(ev));
  });

  function move([x, y, p]) {
    if (act.kind === 'pen') {
      const pts = act.s.pts, n = pts.length;
      const lx = pts[n - 3], ly = pts[n - 2];
      if ((x - lx) ** 2 + (y - ly) ** 2 < .36) return;   // zu nah am letzten Punkt
      pts.push(x, y, p);
      boxes.delete(act.s);
      // nur das neue Stück zeichnen; am Ende wird die Kachel sauber neu gezeichnet
      const seg = { c: act.s.c, w: act.s.w, pts: pts.slice(Math.max(0, n - 6)) };
      const ya = Math.min(ly, y) - 10, yb = Math.max(ly, y) + 10;
      for (let i = Math.floor(ya / TILE); i <= Math.floor(yb / TILE); i++) if (i >= 0) drawStroke(tileCtx(tileCanvas(i), i), seg);
    } else if (act.kind === 'erase') erase(x, y);
    else if (act.kind === 'lasso') {
      act.poly.push(x, y);
      lassoLine.setAttribute('points', act.poly.map((v) => v.toFixed(1)).join(' '));
    } else if (act.kind === 'move') {
      act.dx = x - act.x; act.dy = y - act.y;
      renderSel(act.dx, act.dy, 1);
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
    if (fingers.delete(e.pointerId) && act?.kind === 'pan') { if (!fingers.size) { act = null; } return; }
    if (!act || e.pointerId !== act.id) return;
    const a = act;
    act = null;
    if (e.pointerType === 'pen') penDown = false;
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
      if (a.poly.length >= 6) setSel(items.filter((it) => share(it, a.poly) >= .5));
    } else if (a.kind === 'move') applySel(a.dx, a.dy, 1);
    else if (a.kind === 'scale') { selCv.style.transform = ''; applySel(0, 0, a.k); }
    opts.hold(false);
  }
  pg.addEventListener('pointerup', end);
  pg.addEventListener('pointercancel', end);

  // ---------- Scrollen ----------
  let raf = 0;
  sc.addEventListener('scroll', () => {
    savedTop = sc.scrollTop;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; ensureTiles(); });
  }, { passive: true });

  // ---------- nach außen ----------
  return {
    el: sc,
    // nach dem Einhängen ins Dokument (auch nach jedem Neuzeichnen der Ansicht)
    attach() { if (!scale || sc.clientWidth !== lastW) { lastW = sc.clientWidth; layout(); } sc.scrollTop = savedTop; ensureTiles(); },
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
      const bw = Math.min(480, W - 80), bh = bw * (ih / w);
      const cy = (sc.scrollTop + sc.clientHeight / 2) / scale;
      commit([{ t: 'i', src: path, x: (W - bw) / 2, y: Math.max(20, cy - bh / 2), w: bw, h: bh }, ...items]);
      redrawAll();
    },
    imagePaths: () => items.filter((it) => it.t === 'i').map((it) => it.src),
    destroy() { ro.disconnect(); sc.remove(); },
  };
}
