// Handschrift: Geometrie und Zeichnen (ohne Zustand der Zeichenfläche)
// Elemente: s = Strich (m: Textmarker), t = Titel (Striche s, Texte tx), i = Bild, f = Bereich (A4), d = Bemaßung, x = Text
import { FRAMES } from './ink-store.js';

export const GRID = 25;   // Kästchengröße in Einheiten

// ---------- Umriss (Rechteck) eines Elements, zwischengespeichert ----------
const boxes = new WeakMap();
export function bbox(it) {
  let b = boxes.get(it);
  if (b) return b;
  if (it.t === 'i') b = [it.x, it.y, it.x + it.w, it.y + it.h];
  else if (it.t === 'f') { const [w, h] = FRAMES[it.fmt]; b = [it.x, it.y, it.x + w, it.y + h]; }
  else if (it.t === 'x') { const [w, h] = textSize(it.txt, it); b = [it.x, it.y, it.x + w, it.y + h]; }
  else if (it.t === 'd') {
    const m = dimSize(it).fs * 1.6 + 10;
    b = [Math.min(it.a[0], it.b[0]) - m, Math.min(it.a[1], it.b[1]) - m, Math.max(it.a[0], it.b[0]) + m, Math.max(it.a[1], it.b[1]) + m];
  } else {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const s of it.t === 't' ? it.s : [it]) {
      const r = s.w * 1.3;
      for (let i = 0; i < s.pts.length; i += 3) {
        b[0] = Math.min(b[0], s.pts[i] - r); b[1] = Math.min(b[1], s.pts[i + 1] - r);
        b[2] = Math.max(b[2], s.pts[i] + r); b[3] = Math.max(b[3], s.pts[i + 1] + r);
      }
    }
    for (const x of it.tx || []) {   // Texte im Titel
      const t = bbox(x);
      b = [Math.min(b[0], t[0]), Math.min(b[1], t[1]), Math.max(b[2], t[2]), Math.max(b[3], t[3])];
    }
  }
  boxes.set(it, b);
  return b;
}
export const forgetBox = (it) => boxes.delete(it);
export const union = (list) => list.reduce((u, it) => { const b = bbox(it); return [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);

export function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Anteil eines Elements innerhalb der Lasso-Linie (0–1)
export function share(it, poly) {
  if (it.t === 'f') return 0;   // Bereiche werden über ihren Reiter verschoben, nicht ausgewählt
  if (it.t === 'i' || it.t === 'x') { const b = bbox(it); return inPolygon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, poly) ? 1 : 0; }
  if (it.t === 'd') return (inPolygon(it.a[0], it.a[1], poly) + inPolygon(it.b[0], it.b[1], poly)) / 2;
  let n = 0, hit = 0;
  for (const s of it.t === 't' ? it.s : [it]) {
    for (let i = 0; i < s.pts.length; i += 3) { n++; if (inPolygon(s.pts[i], s.pts[i + 1], poly)) hit++; }
  }
  for (const x of it.tx || []) { n++; hit += share(x, poly); }
  return n ? hit / n : 0;
}

const segDist2 = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
  return (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2;
};

export function nearStroke(s, x, y, r) {
  const p = s.pts, rr = (r + s.w / 2) ** 2;
  for (let i = 0; i < p.length; i += 3) {
    if (segDist2(x, y, p[i], p[i + 1], p[i + 3] ?? p[i], p[i + 4] ?? p[i + 1]) <= rr) return true;
  }
  return false;
}

// Punkt auf oder nahe einem Element (Antippen, Radierer)
export function nearItem(it, x, y, r) {
  const b = bbox(it);
  if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
  if (it.t === 's') return nearStroke(it, x, y, r);
  if (it.t === 't') return it.s.some((s) => nearStroke(s, x, y, r)) || (it.tx || []).some((t) => nearItem(t, x, y, r));
  if (it.t === 'd') return segDist2(x, y, it.a[0], it.a[1], it.b[0], it.b[1]) <= (r + dimSize(it).fs) ** 2;
  return true;
}

// Abstand eines Punktes zu einem Element (0 = darauf); Grundlage für Antippen und langes Drücken
const rectDist = (b, x, y) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));
const strokeDist = (s, x, y) => {
  const p = s.pts;
  let d = Infinity;
  for (let i = 0; i < p.length; i += 3) d = Math.min(d, segDist2(x, y, p[i], p[i + 1], p[i + 3] ?? p[i], p[i + 4] ?? p[i + 1]));
  return Math.max(0, Math.sqrt(d) - s.w / 2);
};
export function distTo(it, x, y) {
  if (it.t === 's') return strokeDist(it, x, y);
  if (it.t === 't') return rectDist(bbox(it), x, y) && Math.min(...it.s.map((s) => strokeDist(s, x, y)), ...(it.tx || []).map((t) => rectDist(bbox(t), x, y)));   // im Titel: 0
  if (it.t === 'd') return Math.sqrt(segDist2(x, y, it.a[0], it.a[1], it.b[0], it.b[1]));
  return rectDist(bbox(it), x, y);   // Bild, Text, Bereich
}

// Verschieben/Skalieren: neue Objekte, die alten bleiben für "Rückgängig" unverändert
export function transform(it, ox, oy, k, dx, dy) {
  const tx = (x) => ox + (x - ox) * k + dx, ty = (y) => oy + (y - oy) * k + dy;
  const st = (s) => ({ ...s, w: s.w * k, pts: s.pts.map((v, i) => (i % 3 === 0 ? tx(v) : i % 3 === 1 ? ty(v) : v)) });
  if (it.t === 's') return st(it);
  if (it.t === 't') return { ...it, s: it.s.map(st), ...(it.tx ? { tx: it.tx.map((t) => transform(t, ox, oy, k, dx, dy)) } : {}) };
  if (it.t === 'f') return { ...it, x: it.x + dx, y: it.y + dy };   // Bereiche werden nur verschoben
  if (it.t === 'd') return { ...it, w: it.w * k, a: [tx(it.a[0]), ty(it.a[1])], b: [tx(it.b[0]), ty(it.b[1])] };
  if (it.t === 'x') return { ...it, x: tx(it.x), y: ty(it.y), fs: it.fs * k };
  return { ...it, x: tx(it.x), y: ty(it.y), w: it.w * k, h: it.h * k };   // Zuschnitt und Radierung sind relativ und wandern mit
}

// ---------- Striche ----------
const widthAt = (s, p) => s.w * (0.35 + 0.95 * p);

export function drawStroke(ctx, s) {
  const p = s.pts, n = p.length / 3;
  if (!n) return;
  if (s.m) return drawMarker(ctx, s);
  ctx.strokeStyle = ctx.fillStyle = s.c;
  if (n === 1) {
    ctx.beginPath(); ctx.arc(p[0], p[1], widthAt(s, p[2]) / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // geglättet über die Mittelpunkte; Abschnitte mit (fast) gleicher Breite in einem Pfad
  let curW = -1;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  let lx = p[0], ly = p[1];
  for (let j = 1; j < n; j++) {
    const x = p[j * 3], y = p[j * 3 + 1];
    const last = j === n - 1;
    const mx = last ? x : (x + p[j * 3 + 3]) / 2, my = last ? y : (y + p[j * 3 + 4]) / 2;
    const w = Math.round(widthAt(s, p[j * 3 + 2]) * 16) / 16;
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

// Textmarker: gleich breit, durchscheinend, in einem Zug (keine dunkleren Überlappungen)
export const MARKER_ALPHA = .38;
function drawMarker(ctx, s) {
  const p = s.pts, n = p.length / 3;
  ctx.save();
  ctx.globalAlpha = MARKER_ALPHA;
  ctx.strokeStyle = s.c;
  ctx.lineWidth = s.w;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (n === 1) ctx.lineTo(p[0] + .01, p[1]);
  for (let j = 1; j < n; j++) {
    const last = j === n - 1;
    ctx.quadraticCurveTo(p[j * 3], p[j * 3 + 1], last ? p[j * 3] : (p[j * 3] + p[j * 3 + 3]) / 2, last ? p[j * 3 + 1] : (p[j * 3 + 1] + p[j * 3 + 4]) / 2);
  }
  ctx.stroke();
  ctx.restore();
}

// ---------- Text: mehrzeilig, ohne Umbruch; Schriftart (ff), Schriftschnitt (fw) und kursiv (i) ----------
export const LINE_H = 1.3;
export const TEXT_FS = 22;   // Schriftgröße neuer Texte (größer/kleiner über den Griff der Auswahl)
export const FONTS = {
  sans: { label: 'Outfit', css: 'Outfit, system-ui, sans-serif', weights: [300, 400, 500, 700] },
  serif: { label: 'Lora', css: 'Lora, Georgia, serif', weights: [400, 700] },
  hand: { label: 'Caveat', css: 'Caveat, cursive', weights: [400, 700] },
  mono: { label: 'Mono', css: "'JetBrains Mono', ui-monospace, monospace", weights: [400, 700] },
};
export const WEIGHTS = { 300: 'Leicht', 400: 'Normal', 500: 'Mittel', 700: 'Fett' };
export const fontCss = (st, fs = st.fs) => `${st.i ? 'italic ' : ''}${st.fw || 400} ${fs}px ${(FONTS[st.ff] || FONTS.sans).css}`;

// Schriften der Seite lädt der Browser erst bei Bedarf: danach neu messen und zeichnen
export const fontListeners = new Set();
const fontsAsked = new Set();
function needFont(f) {
  if (!document.fonts || fontsAsked.has(f) || document.fonts.check(f)) return;
  fontsAsked.add(f);
  document.fonts.load(f).then(() => fontListeners.forEach((cb) => cb()), () => {});
}

let measureCtx = null;
export function textSize(txt, st) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = fontCss(st);
  const lines = String(txt || ' ').split('\n');
  return [Math.max(st.fs * .5, ...lines.map((l) => measureCtx.measureText(l).width)), lines.length * st.fs * LINE_H];
}
export function drawText(ctx, it) {
  const f = fontCss(it);
  needFont(f);
  ctx.fillStyle = it.c;
  ctx.font = f;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  it.txt.split('\n').forEach((l, i) => ctx.fillText(l, it.x, it.y + i * it.fs * LINE_H + it.fs * .15));
}

// ---------- Bereiche: eigener Hintergrund (weiß, darauf Linien oder Punkte), deckt die Kästchen der Fläche ab ----------
export const FRAME_BG = [['', 'Kariert (wie die Fläche)'], ['lines', 'Liniert'], ['dots', 'Punktiert'], ['blank', 'Leer (weiß)']];
export const FRAME_COLORS = ['#3E7CA8', '#0C3741', '#7FA08A', '#7A5AA6', '#C2575A', '#D9873E', '#C9A227', '#6E8582'];   // Farbe von Rahmen und Reiter

export function drawFrameBg(ctx, box, bg, k = 1) {
  const [x0, y0, x1, y1] = box;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (bg === 'grid' || bg === 'lines') {
    ctx.strokeStyle = 'rgba(12, 55, 65, .12)';
    ctx.lineWidth = 1.1 / k;
    ctx.beginPath();
    for (let gy = Math.ceil(y0 / GRID) * GRID; gy <= y1; gy += GRID) { ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); }
    if (bg === 'grid') for (let gx = Math.ceil(x0 / GRID) * GRID; gx <= x1; gx += GRID) { ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); }
    ctx.stroke();
  } else if (bg === 'dots') {
    ctx.fillStyle = 'rgba(12, 55, 65, .32)';
    const r = 1.4;
    for (let gy = Math.ceil(y0 / GRID) * GRID; gy <= y1; gy += GRID) {
      for (let gx = Math.ceil(x0 / GRID) * GRID; gx <= x1; gx += GRID) ctx.fillRect(gx - r / 2, gy - r / 2, r, r);
    }
  }
}

// ---------- Formen: werden zu gewöhnlichen Strichen (radierbar, auswählbar, umfärbbar) ----------
export const SHAPES = [['line', 'Linie'], ['arrow', 'Pfeil'], ['rect', 'Rechteck'], ['ellipse', 'Ellipse'], ['tri', 'Dreieck']];
const SHAPE_P = .6;   // gleichmäßiger Druck

// Linienzug dicht mit Punkten belegen, damit die Glättung die Ecken nicht abrundet
function dense(corners, closed) {
  const pts = [];
  const list = closed ? [...corners, corners[0]] : corners;
  for (let i = 0; i < list.length - 1; i++) {
    const [ax, ay] = list[i], [bx, by] = list[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let k = 0; k < n; k++) pts.push(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, SHAPE_P);
  }
  const [ex, ey] = list[list.length - 1];
  pts.push(ex, ey, SHAPE_P);
  return pts;
}

// Punktlisten (eine je Strich) für eine Form von (x0,y0) nach (x1,y1)
export function shapeStrokes(kind, x0, y0, x1, y1, w) {
  if (kind === 'rect') return [dense([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true)];
  if (kind === 'tri') return [dense([[(x0 + x1) / 2, y0], [x1, y1], [x0, y1]], true)];
  if (kind === 'ellipse') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    const n = Math.max(24, Math.ceil(Math.PI * (rx + ry) / 2));
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a), SHAPE_P); }
    return [pts];
  }
  const line = dense([[x0, y0], [x1, y1]]);
  if (kind !== 'arrow') return [line];
  const a = Math.atan2(y1 - y0, x1 - x0), len = 10 + w * 3;
  const head = (d) => [x1 - len * Math.cos(a + d), y1 - len * Math.sin(a + d)];
  return [line, dense([head(.45), [x1, y1], head(-.45)])];
}

// ---------- Bemaßung: Maßlinie mit Hilfslinien, Schrägstrichen und eingetragenem Maß ----------
export const dimSize = (it) => ({ fs: 9 + it.w * 3, ext: 6 + it.w * 2 });

export function drawDim(ctx, it) {
  const [ax, ay] = it.a, [bx, by] = it.b;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
  const { fs, ext } = dimSize(it);
  ctx.strokeStyle = ctx.fillStyle = it.c;
  ctx.lineWidth = it.w * .8;
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  for (const [px, py] of [[ax, ay], [bx, by]]) {
    ctx.moveTo(px - nx * ext, py - ny * ext); ctx.lineTo(px + nx * ext * .6, py + ny * ext * .6);       // Hilfslinie
    ctx.moveTo(px - (ux + nx) * ext * .6, py - (uy + ny) * ext * .6);                                    // Schrägstrich
    ctx.lineTo(px + (ux + nx) * ext * .6, py + (uy + ny) * ext * .6);
  }
  ctx.stroke();
  if (!it.txt) return;
  // Maß über der Linie, immer lesbar (nie auf dem Kopf)
  let ang = Math.atan2(uy, ux);
  if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
  ctx.save();
  ctx.translate((ax + bx) / 2, (ay + by) / 2);
  ctx.rotate(ang);
  ctx.font = `500 ${fs}px Outfit, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(it.txt, 0, -fs * .3);
  ctx.restore();
}

// Stelle, an der das Maß steht (für das Eingabefeld)
export function dimLabelAt(it) {
  const [ax, ay] = it.a, [bx, by] = it.b;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let nx = -(by - ay) / len, ny = (bx - ax) / len;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }   // Normale nach oben
  const off = dimSize(it).fs * .9;
  return [(ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off];
}

// ---------- Bilder: Zuschnitt (cr, 0–1) und radierte Stellen (er, relativ zum ganzen Bild) ----------
export const cropOf = (it) => it.cr || [0, 0, 1, 1];

// ganzes (unbeschnittenes) Bild in Einheiten
export function fullRect(it) {
  const [c0, c1, c2, c3] = cropOf(it);
  const fw = it.w / (c2 - c0), fh = it.h / (c3 - c1);
  return [it.x - c0 * fw, it.y - c1 * fh, fw, fh];
}

// Bild mit herausradierten Stellen, je Element einmal berechnet
const erased = new WeakMap();
export const forgetErased = (it) => erased.delete(it);
export function imageSource(it, bmp) {
  if (!it.er?.length) return bmp;
  let cv = erased.get(it);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const e of it.er) {
    ctx.lineWidth = e.r * 2 * bmp.width;
    ctx.beginPath();
    for (let i = 0; i < e.pts.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](e.pts[i] * bmp.width, e.pts[i + 1] * bmp.height);
    if (e.pts.length === 2) ctx.lineTo(e.pts[0] * bmp.width + .01, e.pts[1] * bmp.height);
    ctx.stroke();
  }
  erased.set(it, cv);
  return cv;
}

export function drawImageItem(ctx, it, bmp) {
  const [c0, c1, c2, c3] = cropOf(it), W = bmp.width, H = bmp.height;
  ctx.drawImage(imageSource(it, bmp), c0 * W, c1 * H, (c2 - c0) * W, (c3 - c1) * H, it.x, it.y, it.w, it.h);
}

// ---------- Kästchen-Raster der Ansicht (scharf auf Bildschirmpunkten, feine Linien blenden beim Verkleinern aus) ----------
export function drawGrid(cv, W, H, dpr, vx, vy, s) {
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  const cell = GRID * s;                                  // Kästchen in Bildschirmpunkten
  const fine = Math.max(0, Math.min(1, (cell - 5) / 9));  // unter ~14 px langsam ausblenden
  const lw = Math.max(1, Math.round(dpr)), half = lw % 2 ? .5 : 0;
  const lines = (step, alpha, skip) => {
    if (alpha <= .002) return;
    ctx.strokeStyle = `rgba(12, 55, 65, ${alpha})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let gx = Math.ceil(vx / step) * step; (gx - vx) * s <= W; gx += step) {
      if (skip && Math.round(gx / skip) * skip === gx) continue;
      const p = Math.round((gx - vx) * s * dpr) + half; ctx.moveTo(p, 0); ctx.lineTo(p, ph);
    }
    for (let gy = Math.ceil(vy / step) * step; (gy - vy) * s <= H; gy += step) {
      if (skip && Math.round(gy / skip) * skip === gy) continue;
      const p = Math.round((gy - vy) * s * dpr) + half; ctx.moveTo(0, p); ctx.lineTo(pw, p);
    }
    ctx.stroke();
  };
  const major = GRID * 4;   // jede vierte Linie bleibt auch weit herausgezoomt sichtbar
  lines(GRID, .09 * fine, fine < 1 ? major : 0);
  lines(major, fine < 1 ? .09 : 0);
}
