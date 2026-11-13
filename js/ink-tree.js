// Canvas: Gliederung – auf der Startseite zuerst die Notizen, dann je Seite ihre Bereiche (A4) mit den Titeln, die darin
// stehen, danach die übrigen Titel; unter jedem Titel seine Unterseite (beliebig tief). Bereiche lassen sich hier umbenennen, Titel und Notizen löschen;
// Tippen öffnet die Seite bzw. zeigt den Bereich.
import { esc, toast } from './core.js';
import { ICON } from './icons.js';
import { bbox, fontCss, LINE_H, textSize } from './ink-draw.js';
import { deserialize, FRAME_NAMES, loadTree } from './ink-store.js';
import { closeSheet, openSheet, sheetActs } from './sheet.js';
import { LOADER } from './loader.js';

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

const fmtName = (f) => FRAME_NAMES[f.fmt] || 'A4 hoch';
const frameName = (f, n) => f.n || f.lf?.t || `${fmtName(f)} · ${n + 1}`;

// cat: Ordner; open: IDs der geöffneten Seiten (Startseite zuerst);
// onOpen(pfad aus Titeln, bereich?); onRename(seite, bereich, name) -> Promise<Fehler | null>;
// onShow(): Bereiche und Titel der geöffneten Seite auf der Fläche hervorheben;
// notes: [{ id, title }] Notizen des Ordners; onDeleteTitle(seite, titel), onDeleteNote(id)
export async function openTree({ cat, open, notes, onOpen, onRename, onShow, onDeleteTitle, onDeleteNote }) {
  const sheet = openSheet(`<div class="sheet-head"><h2>Gliederung</h2>
      <span class="sh-btns"><button class="tree-show" aria-label="Auf der Fläche zeigen" title="Auf der Fläche zeigen">${ICON.eye}</button>${sheetActs()}</span></div>
    <div class="tree-body"><div class="center loading">${LOADER}</div></div>`);
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.querySelector('.tree-show').addEventListener('click', () => { closeSheet(); onShow(); });
  let rows;
  try { rows = await loadTree(cat); } catch (e) { toast('Gliederung konnte nicht geladen werden: ' + (e.message || e)); closeSheet(); return; }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const root = byId.get(open[0]) || rows.find((r) => !r.parent_id);
  const itemsOf = (row) => (row ? deserialize(row.data).items : []);

  // Baum aufbauen; besuchte Seiten merken, damit nichts doppelt oder im Kreis läuft.
  // Jede Zeile: Aufklapp-Pfeil (wenn es Unterseiten gibt), Eintrag mit kleiner Angabe rechts, Aktionen.
  const paths = [[]], pages = [root], dels = [];   // dels: [seite, titel] zum Löschen
  const seen = new Set([root?.id, ...notes.map((n) => n.id)]);
  const act = (attr, icon, label, cls = '') => `<button class="tree-ren ${cls}" ${attr} aria-label="${label}" title="${label}">${ICON[icon]}</button>`;
  // sub: { html, hasOpen } der Unterseite; geschlossen, solange darin nichts geöffnet ist
  const li = ({ cls = '', style = '', main, meta = '', actions = '', sub = null, on = false }) => {
    const kids = sub?.html, closed = kids && !sub.hasOpen && !on;
    return `<li class="${cls} ${closed ? 'closed' : ''}" ${style}><div class="tree-row">
      ${kids ? `<button class="tree-tog" data-tog aria-label="Auf- oder zuklappen">${ICON.chevR}</button>` : '<span class="tree-tog-sp"></span>'}
      ${main.replace('>', ` class="tree-i ${on ? 'on' : ''}">`)}${meta ? `<small class="tree-m">${meta}</small>` : ''}${actions}</div>
      ${kids ? `<ul>${kids}</ul>` : ''}</li>`;
  };
  const count = (row) => { const l = itemsOf(row); const n = l.filter((it) => it.t === 'f' || it.t === 't').length; return n ? `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}` : ''; };
  const group = (label, icon, n, html) => (html ? `<li class="tree-group"><span class="tree-gh">${ICON[icon]}${label}<i>${n}</i></span><ul>${html}</ul></li>` : '');

  function noteItems(path, depth) {
    let hasOpen = false;
    const html = notes.map((n) => {
      const p = [...path, { note: n.id }];
      paths.push(p);
      const child = byId.get(n.id), pi = paths.length - 1;
      if (child) pages.push(child);
      const sub = child ? branch(child, pi, p, depth + 1) : null, on = open.includes(n.id);
      hasOpen ||= on || !!sub?.hasOpen;
      return li({ cls: 'tree-note', on, sub, main: `<button data-n="${pi}">${ICON.notes}<span class="tree-fn">${esc(n.title) || 'Ohne Titel'}</span></button>`,
        meta: child ? count(child) : '', actions: act(`data-ndel="${esc(n.id)}"`, 'trash', 'Notiz löschen', 'tree-del') });
    }).join('');
    return { html, hasOpen };
  }

  function branch(row, pi, path, depth) {
    const list = itemsOf(row);
    const frames = list.filter((it) => it.t === 'f'), titles = list.filter((it) => it.t === 't');
    let hasOpen = false;
    // Bereich, in dem die Mitte eines Titels liegt (sonst -1)
    const frameOf = (it) => {
      const b = bbox(it), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      return frames.findIndex((f) => { const r = bbox(f); return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]; });
    };
    const titleLi = (it) => {
      if (seen.has(it.page)) return '';
      seen.add(it.page);
      const child = byId.get(it.page);
      const p = [...path, it];
      paths.push(p);
      const ti = paths.length - 1;
      if (child) pages.push(child);
      const sub = child && depth < 12 ? branch(child, ti, p, depth + 1) : null, on = open.includes(it.page);
      hasOpen ||= on || !!sub?.hasOpen;
      dels.push([row, it]);
      return li({ on, sub, main: `<button data-n="${ti}">${titleSvg(it, 'tree-ttl')}</button>`, meta: child ? count(child) : '',
        actions: act(`data-del="${dels.length - 1}"`, 'trash', 'Titel löschen', 'tree-del') });
    };
    const framesHtml = frames.map((f, n) => {
      const inside = titles.filter((it) => frameOf(it) === n).map(titleLi).join('');
      return li({ cls: 'tree-fr', style: f.fc ? `style="--fc:${f.fc}"` : '', sub: inside ? { html: inside, hasOpen: true } : null,
        main: `<button data-n="${pi}" data-fr="${n}">${ICON.frame}<span class="tree-fn">${esc(frameName(f, n))}</span></button>`,
        meta: fmtName(f), actions: act(`data-pg="${pages.indexOf(row)}" data-fr="${n}"`, 'pen', 'Bereich umbenennen') });
    }).join('');
    const rest = titles.filter((it) => frameOf(it) < 0).map(titleLi).join('');
    const notesPart = row === root ? noteItems(path, depth) : { html: '', hasOpen: false };
    hasOpen ||= notesPart.hasOpen;
    // Startseite in Gruppen, Unterseiten schlicht: erst Bereiche (mit ihren Titeln), dann übrige Titel
    const html = row === root
      ? group('Notizen', 'notes', notes.length, notesPart.html) + group('Bereiche', 'frame', frames.length, framesHtml) + group(frames.length ? 'Weitere Titel' : 'Titel', 'chevR', titles.filter((it) => frameOf(it) < 0).length, rest)
      : framesHtml + rest;
    return { html, hasOpen };
  }
  const list = branch(root, 0, [], 0).html;
  const body = sheet.querySelector('.tree-body');
  body.innerHTML = `<button class="tree-start ${open.length === 1 ? 'on' : ''}" data-n="0">${ICON.home}<span>Startseite</span>${ICON.chevR}</button>
    ${list ? `<ul class="tree">${list}</ul>` : '<p class="muted tree-empty">Noch keine Notizen, Bereiche oder Titel. Oben rechts einen Bereich anlegen, oder etwas schreiben, mit der Auswahl umkreisen und „Als Titel“ wählen.</p>'}`;

  body.addEventListener('click', (e) => {
    const tog = e.target.closest('[data-tog]');
    if (tog) return tog.closest('li').classList.toggle('closed');
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
