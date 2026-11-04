// Canvas: Gliederung – je Seite zuerst ihre Bereiche (A4), auf der Startseite dann die Notizen, danach die Titel
// mit den Unterseiten darunter (beliebig tief). Bereiche lassen sich hier umbenennen, Titel und Notizen löschen;
// Tippen öffnet die Seite bzw. zeigt den Bereich.
import { esc, toast } from './core.js';
import { ICON } from './icons.js';
import { fontCss, LINE_H, textSize } from './ink-draw.js';
import { deserialize, loadTree } from './ink-store.js';
import { closeSheet, openSheet } from './sheet.js';

// Titel als Bild aus den eigenen Strichen und Texten (nur Zahlen, geprüfte Farben und maskierter Text).
// Die Linien behalten ihre Bildschirmstärke, damit ein verkleinerter oder vergrößerter Titel nicht fetter wirkt.
export function titleSvg({ s: strokes = [], tx = [] }, cls = 'ink-ttl') {
  if (!strokes.length && !tx.length) return '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.pts.length; i += 3) {
    x0 = Math.min(x0, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); x1 = Math.max(x1, s.pts[i]); y1 = Math.max(y1, s.pts[i + 1]);
  }
  for (const t of tx) {
    const [w, h] = textSize(t.txt, t);
    x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + w); y1 = Math.max(y1, t.y + h);
  }
  // Texte: je Zeile ein <text>, Grundlinie wie auf der Fläche
  const texts = tx.map((t) => t.txt.split('\n').map((l, i) =>
    `<text x="${t.x.toFixed(1)}" y="${(t.y + i * t.fs * LINE_H + t.fs * 1.05).toFixed(1)}" fill="${esc(t.c)}" stroke="none" style="font:${esc(fontCss(t))}">${esc(l)}</text>`).join('')).join('');
  const pad = 6;
  const paths = strokes.map((s) => {
    const d = [];
    for (let i = 0; i < s.pts.length; i += 3) d.push(`${i ? 'L' : 'M'}${s.pts[i].toFixed(1)} ${s.pts[i + 1].toFixed(1)}`);
    if (d.length === 1) d.push(`L${(s.pts[0] + .1).toFixed(1)} ${s.pts[1].toFixed(1)}`);
    return `<path d="${d.join('')}" stroke="${esc(s.c)}" stroke-width="${Math.min(3, Math.max(1.3, s.w * .75)).toFixed(2)}" vector-effect="non-scaling-stroke"/>`;
  }).join('') + texts;
  return `<svg class="${cls}" viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + pad * 2).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Handschriftlicher Titel">${paths}</svg>`;
}

const fmtName = (f) => (f.fmt === 'a4l' ? 'A4 quer' : 'A4 hoch');
const frameName = (f, n) => f.n || `${fmtName(f)} · ${n + 1}`;

// cat: Ordner; open: IDs der geöffneten Seiten (Startseite zuerst);
// onOpen(pfad aus Titeln, bereich?); onRename(seite, bereich, name) -> Promise<Fehler | null>;
// onShow(): Bereiche und Titel der geöffneten Seite auf der Fläche hervorheben;
// notes: [{ id, title }] Notizen des Ordners; onDeleteTitle(seite, titel), onDeleteNote(id)
export async function openTree({ cat, open, notes, onOpen, onRename, onShow, onDeleteTitle, onDeleteNote }) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Gliederung</h2>
      <span class="sh-btns"><button class="tree-show" aria-label="Auf der Fläche zeigen" title="Auf der Fläche zeigen">${ICON.eye}</button><button class="link-btn" data-close>Fertig</button></span></div>
    <div class="tree-body"><p class="muted">Lädt …</p></div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('.tree-show').addEventListener('click', () => { closeSheet(); onShow(); });
  let rows;
  try { rows = await loadTree(cat); } catch (e) { toast('Gliederung konnte nicht geladen werden: ' + (e.message || e)); closeSheet(); return; }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const root = byId.get(open[0]) || rows.find((r) => !r.parent_id);
  const itemsOf = (row) => (row ? deserialize(row.data).items : []);

  // Baum aufbauen; besuchte Seiten merken, damit nichts doppelt oder im Kreis läuft
  const paths = [[]], pages = [root], dels = [];   // dels: [seite, titel] zum Löschen
  const seen = new Set([root?.id, ...notes.map((n) => n.id)]);
  const trash = (i, label) => `<button class="tree-ren tree-del" data-del="${i}" aria-label="${label}" title="${label}">${ICON.trash}</button>`;
  // Notizen (nur Startseite): wie Titel, mit eigener Unterseite
  function noteBranch(path, depth) {
    return notes.map((n) => {
      const p = [...path, { note: n.id }];
      paths.push(p);
      const child = byId.get(n.id);
      if (child) pages.push(child);
      const pi = paths.length - 1;
      const sub = child ? branch(child, pi, p, depth + 1) : '';
      return `<li><div class="tree-row"><button class="tree-i tree-note ${open.includes(n.id) ? 'on' : ''}" data-n="${pi}">${ICON.notes}<span class="tree-fn">${esc(n.title) || 'Ohne Titel'}</span>${ICON.chevR}</button>
        <button class="tree-ren tree-del" data-ndel="${esc(n.id)}" aria-label="Notiz löschen" title="Notiz löschen">${ICON.trash}</button></div>${sub ? `<ul>${sub}</ul>` : ''}</li>`;
    }).join('');
  }
  function branch(row, pi, path, depth) {
    const list = itemsOf(row);
    const frames = list.filter((it) => it.t === 'f').map((f, n) => `<li class="tree-fr" ${f.fc ? `style="--fc:${f.fc}"` : ''}>
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
      dels.push([row, it]);
      return `<li><div class="tree-row"><button class="tree-i ${open.includes(it.page) ? 'on' : ''}" data-n="${paths.length - 1}">
          ${titleSvg(it, 'tree-ttl')}${ICON.chevR}</button>${trash(dels.length - 1, 'Titel löschen')}</div>${sub ? `<ul>${sub}</ul>` : ''}</li>`;
    }).join('');
    const notesHtml = row === root && notes.length ? `<li class="tree-group"><span class="tree-gh">${ICON.notes}Notizen</span><ul>${noteBranch(path, depth)}</ul></li>` : '';
    return frames + notesHtml + titles;
  }
  const list = branch(root, 0, [], 0);
  const body = sheet.querySelector('.tree-body');
  body.innerHTML = `<ul class="tree">
      <li><button class="tree-i tree-root ${open.length === 1 ? 'on' : ''}" data-n="0">${ICON.home}<span>Startseite</span>${ICON.chevR}</button>
      ${list ? `<ul>${list}</ul>` : ''}</li>
    </ul>
    ${list ? '' : '<p class="muted tree-empty">Noch keine Bereiche und Titel. Oben rechts einen Bereich anlegen, oder etwas schreiben, mit der Auswahl umkreisen und „Als Titel“ wählen.</p>'}`;

  body.querySelector('.tree').addEventListener('click', (e) => {
    const del = e.target.closest('.tree-del');
    if (del?.dataset.ndel) return onDeleteNote(del.dataset.ndel);
    if (del) { const [row, it] = dels[+del.dataset.del]; return onDeleteTitle(row, it); }
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
