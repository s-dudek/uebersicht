// Canvas: Fenster „Ebenen“ links neben der Zeichenfläche. Oben die eigenen Ebenen (aktive markiert; ein-/ausblenden,
// sperren, umbenennen, verschieben, löschen, Auswahl darauf legen), darunter die festen Ebenen der Seite:
// Vorlage, Muster (Art und Farbe) und Hintergrund (Farbe des Papiers) – für die aktuelle Seite oder alle Seiten.
import { askConfirm, esc, safeColor } from './core.js';
import { ICON } from './icons.js';
import { FRAME_BG, PAPER, PATTERN } from './ink-draw.js';
import { FRAME_LAYOUTS } from './ink-layout.js';
import { dropMenu } from './menu.js';

const PAPERS = [['#FFFFFF', 'Weiß'], ['#FBF7EE', 'Creme'], ['#EEF3EC', 'Salbei'], ['#EEF4F9', 'Hellblau'], ['#F3F1F6', 'Flieder'], ['#F2F2F0', 'Grau']];
const PATTERNS = [['#0C3741', 'Dunkel'], ['#6E8582', 'Grau'], ['#7FA08A', 'Salbei'], ['#3E7CA8', 'Blau'], ['#C2575A', 'Rot'], ['#D9873E', 'Orange']];
const FIXED = [['ly', 'Vorlage', 'frame'], ['pat', 'Muster', 'grid'], ['bg', 'Hintergrund', 'image']];   // von oben nach unten

const view = { open: '', all: false };   // aufgeklappte feste Ebene, „Für alle Seiten“

const ib = (id, icon, label, cls = '') => `<button class="ily-ic ${cls}" data-act="ink-ly" data-id="${id}" aria-label="${label}" title="${label}">${ICON[icon]}</button>`;
const swatches = (key, list, cur) => `<div class="ily-sw">${list.map(([c, l]) => `<button class="ily-c ${c === cur ? 'on' : ''}" data-act="ink-ly" data-id="look:${key}:${c}" style="--c:${c}" aria-label="${l}" title="${l}"></button>`).join('')}
  <label class="ily-c ily-own" title="Eigene Farbe"><input type="color" data-look="${key}" value="${esc(cur)}" aria-label="Eigene Farbe"></label></div>`;

// Inhalt des Fensters; board: Zeichenfläche, page: aktuelle Seite (aus board.frames())
export function layersHtml(board, page) {
  const { layers, active, fix } = board.layerInfo();
  const own = layers.map((l) => `<div class="ily-row ${l.id === active ? 'on' : ''} ${l.h ? 'off' : ''}">
      ${ib('h:' + l.id, l.h ? 'eyeOff' : 'eye', l.h ? 'Einblenden' : 'Ausblenden')}
      <button class="ily-n" data-act="ink-ly" data-id="act:${l.id}" data-lid="${l.id}"><span>${esc(l.n)}</span><small>${l.count || ''}</small></button>
      ${ib('k:' + l.id, 'lock', l.k ? 'Entsperren' : 'Sperren', l.k ? 'is-on' : 'dim')}
      ${ib('menu:' + l.id, 'dots', 'Mehr')}</div>`).join('');
  const value = { ly: (FRAME_LAYOUTS.find(([k]) => k === (page?.ly || '')) || FRAME_LAYOUTS[0])[1].replace('Dudek · ', ''),
    pat: (FRAME_BG.find(([k]) => k === (page?.bg === 'grid' ? '' : page?.bg || '')) || FRAME_BG[0])[1], bg: '' };
  const dot = { pat: safeColor(page?.mc, PATTERN), bg: safeColor(page?.pc, PAPER) };
  const fixed = FIXED.map(([k, name, icon]) => `<div class="ily-fix ${view.open === k ? 'open' : ''} ${fix[k] ? 'off' : ''}">
      <div class="ily-row">${ib('fix:' + k, fix[k] ? 'eyeOff' : 'eye', fix[k] ? 'Einblenden' : 'Ausblenden')}
        <button class="ily-n" data-act="ink-ly" data-id="open:${k}">${ICON[icon]}<span>${name}</span><small>${esc(value[k])}</small>${dot[k] ? `<i class="ily-dot" style="--c:${dot[k]}"></i>` : ''}${ICON.chevD}</button></div>
      ${view.open === k ? `<div class="ily-ed">${editor(k, page)}</div>` : ''}</div>`).join('');
  return `<div class="ily-head"><b>Ebenen</b>${ib('add', 'plus', 'Neue Ebene')}${ib('close', 'close', 'Ebenen schließen')}</div>
    <div class="ily-list">${own}</div>
    <div class="ily-h"><span>Seite</span><b>${esc(page?.name || '')}</b></div>
    ${fixed}
    <button class="ily-all ${view.all ? 'on' : ''}" data-act="ink-ly" data-id="all">${view.all ? ICON.check : ''}<span>Änderungen für alle Seiten</span></button>`;
}

function editor(k, page) {
  const chip = (id, label, on) => `<button class="pp-chip ${on ? 'on' : ''}" data-act="ink-ly" data-id="${id}">${esc(label)}</button>`;
  if (k === 'ly') return `<div class="pp-chips">${FRAME_LAYOUTS.map(([v, l]) => chip('look:ly:' + v, l.replace('Dudek · ', ''), (page?.ly || '') === v)).join('')}</div>
    ${page?.ly ? `<button class="ily-link" data-act="ink-ly" data-id="lf">${ICON.text}<span>Titel, Projekt, Kontakt …</span></button>` : ''}`;
  if (k === 'pat') {
    const bg = page?.bg === 'grid' ? '' : page?.bg || '';
    return `<div class="pp-chips">${FRAME_BG.map(([v, l]) => chip('look:bg:' + v, l, bg === v)).join('')}</div>${swatches('mc', PATTERNS, safeColor(page?.mc, PATTERN))}`;
  }
  return swatches('pc', PAPERS, safeColor(page?.pc, PAPER));
}

// Tipp im Fenster; ctx: { board, page (Index der aktuellen Seite), refresh(), editLayout(seite) }
export async function layersAction(id, btn, ctx) {
  const { board } = ctx;
  const [k, v, w] = id.split(':');
  if (k === 'add') board.addLayer();
  else if (k === 'act') board.setActive(v);
  else if (k === 'h' || k === 'k') board.toggleLayer(v, k);
  else if (k === 'fix') board.toggleFix(v);
  else if (k === 'open') { view.open = view.open === v ? '' : v; ctx.refresh(); }
  else if (k === 'all') { view.all = !view.all; ctx.refresh(); }
  else if (k === 'look') setLook(ctx, v, w);
  else if (k === 'lf') ctx.editLayout(ctx.page);
  else if (k === 'menu') layerMenu(btn, v, ctx);
}

// Hintergrund, Muster oder Vorlage ändern (Seite oder alle Seiten); Standardwerte werden nicht gespeichert
function setLook(ctx, key, val) {
  const def = { pc: PAPER, mc: PATTERN }[key];
  const c = def ? safeColor(val, def) : val;
  ctx.board.setPageLook(ctx.page, { [key]: c === def ? '' : c }, view.all);
}

function layerMenu(btn, id, ctx) {
  const { board } = ctx, { layers } = board.layerInfo(), i = layers.findIndex((l) => l.id === id), l = layers[i];
  if (!l) return;
  const item = (m, icon, label, cls = '') => `<button class="cm-i ${cls}" data-m="${m}">${ICON[icon]}<span>${label}</span></button>`;
  dropMenu(btn, `${item('ren', 'pen', 'Umbenennen …')}
    ${i > 0 ? item('up', 'chevU', 'Nach oben') : ''}${i < layers.length - 1 ? item('down', 'chevD', 'Nach unten') : ''}
    ${board.hasSelection ? item('sel', 'move', 'Auswahl hierher') : ''}
    ${layers.length > 1 ? item('del', 'trash', 'Ebene löschen', 'danger') : ''}`, async (b) => {
    const m = b.dataset.m;
    if (m === 'ren') rename(id, ctx);
    else if (m === 'up' || m === 'down') board.moveLayer(id, m === 'up' ? -1 : 1);
    else if (m === 'sel') board.selToLayer(id);
    else if (m === 'del' && (!l.count || await askConfirm(`Ebene „${l.n}“ löschen?`, 'Löschen', 'Alles, was auf dieser Ebene liegt, wird mitgelöscht.'))) board.deleteLayer(id);
  });
}

// Name direkt in der Zeile ändern (Eingabe bestätigt, Esc bricht ab)
function rename(id, ctx) {
  const n = document.querySelector(`.ink-layers [data-lid="${id}"]`);
  if (!n) return;
  const inp = document.createElement('input');
  inp.className = 'input ily-in';
  inp.maxLength = 40;
  inp.value = n.querySelector('span').textContent;
  inp.setAttribute('aria-label', 'Name der Ebene');
  n.replaceWith(inp);
  inp.focus();
  inp.select();
  let cancelled = false;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { cancelled = true; inp.blur(); } e.stopPropagation(); });
  inp.addEventListener('blur', () => { if (!cancelled && inp.value.trim()) ctx.board.renameLayer(id, inp.value); else ctx.refresh(); });
}

// eigene Farbe (Farbwähler): beim Loslassen übernehmen
export function bindLayers(root, ctx) {
  root.addEventListener('change', (e) => { const k = e.target.dataset?.look; if (k) setLook(ctx(), k, e.target.value); });
}
