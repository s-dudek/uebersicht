// Canvas: Layouts für Bereiche im Dudek-CI (Dunkel #0C3741, Salbei #A8BEA7, Outfit) mit Titel, Projekt, Projektnummer, Kontakt.
// Gezeichnet wird in Einheiten der Fläche, darum gleich scharf auf dem Bildschirm und im Export.
import { fontCss } from './ink-draw.js';
import { LOGO_MARK, LOGO_WORD } from './icons.js';

export const FRAME_LAYOUTS = [['', 'Ohne Layout'], ['brand', 'Dudek · Blatt'], ['cover', 'Dudek · Deckblatt'], ['plan', 'Dudek · Planfeld']];
export const LAYOUT_FIELDS = [['t', 'Titel'], ['p', 'Projekt'], ['n', 'Projektnummer'], ['k', 'Kontakt']];
const CI = { ink: '#0C3741', sage: '#A8BEA7', grey: '#6E8582', white: '#FFFFFF' };

// ---------- Logos: die Pfade der SVG-Zeichen der App als Vektor auf die Fläche (scharf, ohne Laden) ----------
function paths(svg) {
  const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  return { vx, vy, vw, vh, list: [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => new Path2D(m[1])) };
}
const LOGOS = { word: paths(LOGO_WORD), mark: paths(LOGO_MARK) };

function drawLogo(ctx, name, color, x, y, h) {
  const L = LOGOS[name], k = h / L.vh;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-L.vx, -L.vy);
  ctx.fillStyle = color;
  L.list.forEach((p) => ctx.fill(p));
  ctx.restore();
  return L.vw * k;
}
function text(ctx, s, x, y, size, { w = 400, c = CI.ink, align = 'left', max } = {}) {
  if (!s) return;
  ctx.font = fontCss({ ff: 'sans', fw: w }, size);
  ctx.fillStyle = c;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y, max);
}
function line(ctx, x0, y0, x1, y1, c, w) {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

// lf: { t: Titel, p: Projekt, n: Projektnummer, k: Kontakt }
export function drawFrameLayout(ctx, box, ly, lf = {}) {
  const [x0, y0, x1, y1] = box, W = x1 - x0, H = y1 - y0, m = 50;
  const nr = lf.n ? `Projekt-Nr. ${lf.n}` : '';
  ctx.save();
  if (ly === 'brand') {
    // Kopf: Zeichen und Schriftzug links, Titel und Projekt rechts; Fuß: Kontakt und Nummer
    const w = drawLogo(ctx, 'mark', CI.ink, x0 + m, y0 + m, 44);
    drawLogo(ctx, 'word', CI.ink, x0 + m + w + 12, y0 + m + 8, 30);
    text(ctx, lf.t, x1 - m, y0 + m + 24, 24, { w: 700, align: 'right', max: W * .5 });
    text(ctx, [lf.p, nr].filter(Boolean).join(' · '), x1 - m, y0 + m + 46, 13, { c: CI.grey, align: 'right', max: W * .5 });
    line(ctx, x0 + m, y0 + m + 64, x1 - m, y0 + m + 64, CI.sage, 2);
    line(ctx, x0 + m, y1 - m - 24, x1 - m, y1 - m - 24, CI.sage, 1);
    text(ctx, lf.k, x0 + m, y1 - m, 11, { c: CI.grey, max: W * .6 });
    text(ctx, nr, x1 - m, y1 - m, 11, { c: CI.grey, align: 'right', max: W * .3 });
  } else if (ly === 'cover') {
    // dunkles Band mit Logo in Salbei, darunter groß Titel, Projekt und Nummer, unten Kontakt und Salbei-Streifen
    const band = H * .42;
    ctx.fillStyle = CI.ink;
    ctx.fillRect(x0, y0, W, band);
    const w = drawLogo(ctx, 'mark', CI.sage, x0 + m, y0 + band - m - 70, 70);
    drawLogo(ctx, 'word', CI.white, x0 + m + w + 18, y0 + band - m - 52, 42);
    text(ctx, lf.t, x0 + m, y0 + band + m + 50, 52, { w: 700, max: W - 2 * m });
    text(ctx, lf.p, x0 + m, y0 + band + m + 92, 24, { max: W - 2 * m });
    text(ctx, nr, x0 + m, y0 + band + m + 122, 16, { c: CI.grey, max: W - 2 * m });
    text(ctx, lf.k, x0 + m, y1 - m - 14, 12, { c: CI.grey, max: W - 2 * m });
    ctx.fillStyle = CI.sage;
    ctx.fillRect(x0, y1 - 14, W, 14);
  } else if (ly === 'plan') {
    // Planfeld unten rechts: Schriftzug, darunter Projekt, Titel, Projektnummer, Kontakt
    const bw = Math.min(380, W - 2 * m), bh = 150, bx = x1 - m - bw, by = y1 - m - bh;
    ctx.fillStyle = CI.white;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = CI.ink;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, by, bw, bh);
    drawLogo(ctx, 'word', CI.ink, bx + 14, by + 14, 22);
    const rows = [['Projekt', lf.p], ['Titel', lf.t], ['Projekt-Nr.', lf.n], ['Kontakt', lf.k]];
    rows.forEach(([label, val], i) => {
      const yy = by + 50 + i * 25;
      line(ctx, bx, yy, bx + bw, yy, CI.sage, 1);
      text(ctx, label.toUpperCase(), bx + 14, yy + 16, 8.5, { w: 600, c: CI.grey });
      text(ctx, val, bx + 100, yy + 16, 12, { w: i === 1 ? 700 : 500, max: bw - 114 });
    });
  }
  ctx.restore();
}
