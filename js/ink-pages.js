// Canvas als Heft aus A4-Seiten: Seiten (Elemente f, außer dem Homescreen-Ausschnitt) stehen in ihrer Reihenfolge
// untereinander oder zu zweit nebeneinander (cols), mittig auf x = 0, mit etwas Abstand. Zu einer Seite gehört alles, dessen Mitte auf ihr liegt.
// Die Startseite eines Ordners beginnt immer mit der Deckseite (cov); darauf der Homescreen-Ausschnitt (sein Inhalt
// erscheint in der Kachel am Startbildschirm) und der Notizen-Bereich.
// Ältere, unendliche Flächen (Version 1) werden beim Öffnen einmal zu Seiten umgebaut, ohne dass etwas verloren geht.
import { bbox, transform } from './ink-draw.js';
import { FRAMES } from './ink-store.js';

export const PAGE_GAP = 75;                     // Abstand zwischen den Seiten (Einheiten, auf den Kästchen)
const HOME_AT = [50, 75], NOTES_AT = [125, 650];   // Lage von Homescreen-Ausschnitt und Notizen-Bereich auf der Deckseite

export const isPage = (it) => it.t === 'f' && it.fmt !== 'home';
export const pagesOf = (items) => items.filter(isPage);
const center = (it) => { const b = bbox(it); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
const inside = ([x, y], b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const move = (it, dx, dy) => (dx || dy ? transform(it, 0, 0, 1, dx, dy) : it);

// Inhalt je Seite (in der Reihenfolge der Seiten): [{ frame, content }]; übrig bleibt, was auf keiner Seite liegt
export function groupsOf(items) {
  const groups = pagesOf(items).map((frame) => ({ frame, box: bbox(frame), content: [] }));
  const rest = [];
  for (const it of items) {
    if (isPage(it)) continue;
    const g = groups.find((x) => inside(center(it), x.box));
    if (g) g.content.push(it); else rest.push(it);
  }
  return { groups, rest };
}

// Seiten in Reihen zu cols Seiten stellen (jede Reihe mittig, auf den Kästchen); jede nimmt ihren Inhalt mit.
// Gibt dieselbe Liste zurück, wenn alles schon passt.
export function stackGroups(items, groups, cols = 1) {
  const moved = new Map();
  let y = 0;
  for (let i = 0; i < groups.length; i += cols) {
    const row = groups.slice(i, i + cols), sizes = row.map((g) => FRAMES[g.frame.fmt]);
    let x = Math.round(-(sizes.reduce((a, [w]) => a + w, 0) + PAGE_GAP * (row.length - 1)) / 2 / 25) * 25;
    row.forEach((g, k) => {
      const dx = x - g.frame.x, dy = y - g.frame.y;
      if (dx || dy) [g.frame, ...g.content].forEach((it) => moved.set(it, move(it, dx, dy)));
      x += sizes[k][0] + PAGE_GAP;
    });
    y += Math.max(...sizes.map(([, h]) => h)) + PAGE_GAP;
  }
  return moved.size ? items.map((it) => moved.get(it) || it) : items;
}
export const stackPages = (items, cols = 1) => stackGroups(items, groupsOf(items).groups, cols);

// Deckseite mit Homescreen-Ausschnitt (und auf der Startseite mit Notizen der Notizen-Bereich) sicherstellen
function withCover(items, notes) {
  let out = items;
  let cover = out.find((it) => isPage(it) && it.cov);
  if (!cover) {
    const first = pagesOf(out)[0];
    cover = { t: 'f', fmt: 'a4p', cov: 1, x: -425, y: (first ? first.y : 0) - FRAMES.a4p[1] - PAGE_GAP };
    out = [cover, ...out];
  } else if (pagesOf(out)[0] !== cover) out = [cover, ...out.filter((it) => it !== cover)];   // immer vorne
  const at = ([dx, dy]) => [cover.x + dx, cover.y + dy];
  if (!out.some((it) => it.t === 'f' && it.fmt === 'home')) { const [x, y] = at(HOME_AT); out = [...out, { t: 'f', fmt: 'home', x, y }]; }
  if (notes && !out.some((it) => it.t === 'n')) { const [x, y] = at(NOTES_AT); out = [...out, { t: 'n', x, y }]; }
  return out;
}

// Seiten beim Öffnen herrichten. v: Version der gespeicherten Seite; root: Startseite des Ordners; notes: mit Notizen-Bereich;
// cols: Seiten je Reihe.
// Gibt { items, changed } zurück (changed: gleich speichern).
export function preparePages(items, { v, root, notes, cols = 1 }) {
  let out = v >= 2 ? items : migrate(items, root);
  if (root) out = withCover(out, notes);
  else out = out.filter((it) => !(it.t === 'f' && it.fmt === 'home'));    // Homescreen-Ausschnitt nur auf der Startseite
  if (!notes) out = out.filter((it) => it.t !== 'n');
  if (!pagesOf(out).length) out = [{ t: 'f', fmt: 'a4p', x: -425, y: 0 }, ...out];   // mindestens eine Seite
  out = stackPages(out, cols);
  return { items: out, changed: v < 2 || out !== items };
}

// ---------- Umbau einer unendlichen Fläche (Version 1) zu Seiten ----------
// Vorhandene A4-Bereiche werden Seiten (in Leserichtung). Was außerhalb lag, kommt auf zusätzliche Seiten: das Gebiet wird
// in A4-Felder geteilt, jedes Feld mit Inhalt wird eine Seite. Homescreen-Ausschnitt und Notizen-Bereich wandern samt
// Inhalt auf die Deckseite.
function migrate(items, root) {
  const pages = pagesOf(items).sort((a, b) => a.y - b.y || a.x - b.x);
  const home = items.find((it) => it.t === 'f' && it.fmt === 'home');
  const homeBox = home && bbox(home);
  const groups = pages.map((frame) => ({ frame, box: bbox(frame), content: [] }));
  const coverContent = [], orphans = [];
  for (const it of items) {
    if (isPage(it) || it === home) continue;
    const c = center(it);
    if (root && (it.t === 'n' || (homeBox && inside(c, homeBox)))) { coverContent.push(it); continue; }
    const g = groups.find((x) => inside(c, x.box));
    if (g) g.content.push(it); else orphans.push(it);
  }
  // übrig Gebliebenes auf neue Seiten (kariert wie früher die Fläche)
  if (orphans.length) {
    const [w, h] = FRAMES.a4p, u = orphans.reduce((a, it) => { const b = bbox(it); return [Math.min(a[0], b[0]), Math.min(a[1], b[1])]; }, [Infinity, Infinity]);
    const ox = Math.floor(u[0] / 25) * 25, oy = Math.floor(u[1] / 25) * 25;
    const cells = new Map();
    for (const it of orphans) {
      const [cx, cy] = center(it), key = `${Math.floor((cy - oy) / h)}:${Math.floor((cx - ox) / w)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
    [...cells.keys()].sort((a, b) => { const [ra, ca] = a.split(':').map(Number), [rb, cb] = b.split(':').map(Number); return ra - rb || ca - cb; }).forEach((key) => {
      const [r, c] = key.split(':').map(Number);
      groups.push({ frame: { t: 'f', fmt: 'a4p', x: ox + c * w, y: oy + r * h }, content: cells.get(key) });
    });
  }
  // Deckseite (nur Startseite): Homescreen-Ausschnitt oben, Notizen-Bereich darunter
  const lead = [];
  if (root) {
    const cover = { t: 'f', fmt: 'a4p', cov: 1, x: 0, y: 0 };
    const placed = [];
    if (home) { const dx = HOME_AT[0] - home.x, dy = HOME_AT[1] - home.y; placed.push([home, dx, dy]); coverContent.filter((it) => it.t !== 'n').forEach((it) => placed.push([it, dx, dy])); }
    const n = coverContent.find((it) => it.t === 'n');
    if (n) placed.push([n, NOTES_AT[0] - n.x, NOTES_AT[1] - n.y]);
    lead.push({ frame: cover, content: [], placed });
  }
  // alles der Reihe nach untereinander
  const moved = new Map();
  let y = 0;
  for (const g of [...lead, ...groups]) {
    const [w, h] = FRAMES[g.frame.fmt];
    const dx = -w / 2 - g.frame.x, dy = y - g.frame.y;
    moved.set(g.frame, move(g.frame, dx, dy));
    g.content.forEach((it) => moved.set(it, move(it, dx, dy)));
    (g.placed || []).forEach(([it, px, py]) => moved.set(it, move(it, px + dx, py + dy)));
    y += h + PAGE_GAP;
  }
  const frames = [...lead, ...groups].map((g) => moved.get(g.frame));
  return [...frames, ...items.filter((it) => !isPage(it)).map((it) => moved.get(it) || it)];
}
