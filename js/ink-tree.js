// Handschrift: Gliederung – je Seite zuerst ihre Bereiche (A4), dann ihre Titel mit den Unterseiten darunter (beliebig tief).
// Bereiche lassen sich hier umbenennen; Tippen öffnet die Seite bzw. zeigt den Bereich.
import { esc, toast } from './core.js';
import { ICON } from './icons.js';
import { deserialize, loadTree } from './ink-store.js';
import { closeSheet, openSheet } from './sheet.js';

// Titel als Bild aus den eigenen Strichen (nur Zahlen und geprüfte Farben).
// Die Linien behalten ihre Bildschirmstärke, damit ein verkleinerter oder vergrößerter Titel nicht fetter wirkt.
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
    return `<path d="${d.join('')}" stroke="${esc(s.c)}" stroke-width="${Math.min(3, Math.max(1.3, s.w * .75)).toFixed(2)}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  return `<svg class="${cls}" viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + pad * 2).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Handschriftlicher Titel">${paths}</svg>`;
}

const fmtName = (f) => (f.fmt === 'a4l' ? 'A4 quer' : 'A4 hoch');
const frameName = (f, n) => f.n || `${fmtName(f)} · ${n + 1}`;

// cat: Ordner; open: IDs der geöffneten Seiten (Startseite zuerst);
// onOpen(pfad aus Titeln, bereich?); onRename(seite, bereich, name) -> Promise<Fehler | null>
export async function openTree({ cat, open, onOpen, onRename }) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Gliederung</h2><button class="link-btn" data-close>Fertig</button></div>
    <div class="tree-body"><p class="muted">Lädt …</p></div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  let rows;
  try { rows = await loadTree(cat); } catch (e) { toast('Gliederung konnte nicht geladen werden: ' + (e.message || e)); closeSheet(); return; }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const root = byId.get(open[0]) || rows.find((r) => !r.parent_id);
  const itemsOf = (row) => (row ? deserialize(row.data).items : []);

  // Baum aufbauen; besuchte Seiten merken, damit nichts doppelt oder im Kreis läuft
  const paths = [[]], pages = [root];
  const seen = new Set([root?.id]);
  function branch(row, pi, path, depth) {
    const list = itemsOf(row);
    const frames = list.filter((it) => it.t === 'f').map((f, n) => `<li class="tree-fr">
        <button class="tree-i" data-n="${pi}" data-fr="${n}">${ICON.frame}<span class="tree-fn">${esc(frameName(f, n))}</span><small>${fmtName(f)}</small></button>
        <button class="tree-ren" data-pg="${pages.indexOf(row)}" data-fr="${n}" aria-label="Bereich umbenennen" title="Umbenennen">${ICON.pen}</button>
      </li>`).join('');
    const titles = list.filter((it) => it.t === 't').map((it) => {
      if (seen.has(it.page)) return '';
      seen.add(it.page);
      const child = byId.get(it.page);
      const p = [...path, it];
      paths.push(p);
      if (child) pages.push(child);
      const sub = child && depth < 12 ? branch(child, paths.length - 1, p, depth + 1) : '';
      return `<li><button class="tree-i ${open.includes(it.page) ? 'on' : ''}" data-n="${paths.length - 1}">
          ${titleSvg(it.s, 'tree-ttl')}${ICON.chevR}</button>${sub ? `<ul>${sub}</ul>` : ''}</li>`;
    }).join('');
    return frames + titles;
  }
  const list = branch(root, 0, [], 0);
  const body = sheet.querySelector('.tree-body');
  body.innerHTML = `<ul class="tree">
      <li><button class="tree-i tree-root ${open.length === 1 ? 'on' : ''}" data-n="0">${ICON.home}<span>Startseite</span>${ICON.chevR}</button>
      ${list ? `<ul>${list}</ul>` : ''}</li>
    </ul>
    ${list ? '' : '<p class="muted tree-empty">Noch keine Bereiche und Titel. Oben rechts einen Bereich anlegen, oder etwas schreiben, mit der Auswahl umkreisen und „Als Titel“ wählen.</p>'}`;

  body.querySelector('.tree').addEventListener('click', (e) => {
    const ren = e.target.closest('.tree-ren');
    if (ren) return rename(ren);
    const b = e.target.closest('[data-n]');
    if (!b) return;
    closeSheet();
    onOpen(paths[+b.dataset.n], b.dataset.fr === undefined ? undefined : +b.dataset.fr);
  });

  // Name direkt in der Zeile ändern (Eingabe bestätigt, Esc bricht ab)
  function rename(btn) {
    const row = pages[+btn.dataset.pg], n = +btn.dataset.fr;
    const label = btn.parentElement.querySelector('.tree-fn');
    const f = itemsOf(row).filter((it) => it.t === 'f')[n];
    if (!row || !f || btn.parentElement.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.className = 'input tree-in';
    inp.maxLength = 40;
    inp.value = f.n || '';
    inp.placeholder = frameName({ fmt: f.fmt }, n);
    inp.setAttribute('aria-label', 'Name des Bereichs');
    btn.parentElement.prepend(inp);
    inp.focus();
    let cancelled = false;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { cancelled = true; inp.blur(); } });
    inp.addEventListener('blur', async () => {
      inp.remove();
      const name = inp.value.trim().slice(0, 40);
      if (cancelled || name === (f.n || '')) return;
      const err = await onRename(row, n, name);
      if (err) { toast('Umbenennen fehlgeschlagen: ' + err.message); return; }
      label.textContent = name || frameName({ fmt: f.fmt }, n);
    });
  }
}
