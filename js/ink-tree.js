// Handschrift: Seitenübersicht – alle Titel eines Ordners als Baum (Startseite, Unterseiten, deren Unterseiten …)
import { esc, toast } from './core.js';
import { ICON } from './icons.js';
import { deserialize, loadTree } from './ink-store.js';
import { closeSheet, openSheet } from './sheet.js';

// Titel als Bild aus den eigenen Strichen (nur Zahlen und geprüfte Farben)
export function titleSvg(strokes, cls = 'ink-ttl') {
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
  return `<svg class="${cls}" viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + pad * 2).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Handschriftlicher Titel">${paths}</svg>`;
}

// cat: Ordner; open: IDs der geöffneten Seiten (Startseite zuerst); onOpen(pfad aus Titeln)
export async function openTree({ cat, open, onOpen }) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Seiten</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="tree-body"><p class="muted">Lädt …</p></div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  let rows;
  try { rows = await loadTree(cat); } catch (e) { toast('Seiten konnten nicht geladen werden: ' + (e.message || e)); closeSheet(); return; }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const root = byId.get(open[0]) || rows.find((r) => !r.parent_id);
  const titlesOf = (row) => (row ? deserialize(row.data).items.filter((it) => it.t === 't') : []);

  // Baum aufbauen; besuchte Seiten merken, damit nichts doppelt oder im Kreis läuft
  const paths = [[]];
  const seen = new Set([root?.id]);
  function branch(row, path, depth) {
    return titlesOf(row).map((it) => {
      if (seen.has(it.page)) return '';
      seen.add(it.page);
      const child = byId.get(it.page);
      const p = [...path, it];
      paths.push(p);
      const sub = depth < 12 ? branch(child, p, depth + 1) : '';
      return `<li><button class="tree-i ${open.includes(it.page) ? 'on' : ''}" data-n="${paths.length - 1}">
          ${titleSvg(it.s, 'tree-ttl')}${sub ? `<span class="tree-c">${titlesOf(child).length}</span>` : ''}${ICON.chevR}</button>
        ${sub ? `<ul>${sub}</ul>` : ''}</li>`;
    }).join('');
  }
  const list = branch(root, [], 0);
  sheet.querySelector('.tree-body').innerHTML = `<ul class="tree">
      <li><button class="tree-i tree-root ${open.length === 1 ? 'on' : ''}" data-n="0">${ICON.home}<span>Startseite</span>${ICON.chevR}</button>
      ${list ? `<ul>${list}</ul>` : ''}</li>
    </ul>
    ${list ? '' : '<p class="muted tree-empty">Noch keine Titel. Etwas schreiben, mit der Auswahl umkreisen und „Als Titel“ wählen.</p>'}`;
  sheet.querySelector('.tree').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    closeSheet();
    onOpen(paths[+b.dataset.n]);
  });
}
