// Handschrift: Fenster für Farbe und Stärke – für Stift (auch Formen und Bemaßung), Textmarker und Text
import { safeColor } from './core.js';
import { MARKER_ALPHA } from './ink-draw.js';

export const PALETTE = [
  '#0C3741', '#4E7569', '#7FA08A', '#A8BEA7', '#3E7CA8', '#7FB2D9', '#7A5AA6', '#B48FD1',
  '#C2575A', '#E58C9B', '#D9873E', '#C9A227', '#F2D33B', '#8A6A4A', '#6E8582', '#FFFFFF',
];

// je Art: Bezeichnung, kleinster/größter Wert, Vorschläge, Vorgabe
export const KINDS = {
  pen: { label: 'Strichstärke', range: [.6, 16], presets: [1, 2.2, 4, 7, 12], def: 2.2 },
  marker: { label: 'Breite', range: [4, 40], presets: [8, 12, 16, 24, 32], def: 16 },
  text: { label: 'Schriftgröße', range: [10, 120], presets: [14, 22, 32, 48, 72], def: 22 },
};

export function clampSize(kind, v) {
  const k = KINDS[kind];
  return Math.min(k.range[1], Math.max(k.range[0], Number.isFinite(+v) && +v ? +v : k.def));
}

// kind: 'pen' | 'marker' | 'text'; val: { c, w }; onChange({ c, w }) bei jeder Änderung, onClose() beim Schließen
export function openPenPanel(btn, kind, val, onChange, onClose) {
  document.querySelector('.ink-penpanel')?.remove();
  const K = KINDS[kind];
  const p = { c: safeColor(val.c, PALETTE[0]), w: clampSize(kind, val.w) };
  const dot = (w) => Math.max(2, Math.min(26, kind === 'text' ? w / 3 : w * (kind === 'marker' ? .7 : 1.4)));
  const el = document.createElement('div');
  el.className = 'cmenu ink-penpanel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', kind === 'text' ? 'Text einstellen' : kind === 'marker' ? 'Textmarker einstellen' : 'Stift einstellen');
  el.innerHTML = `
    <div class="pp-h">Farbe</div>
    <div class="pp-colors">
      ${PALETTE.map((c) => `<button type="button" class="pp-c" data-c="${c}" style="--c:${c}" aria-label="Farbe ${c}"></button>`).join('')}
      <label class="pp-own" title="Eigene Farbe"><input type="color" aria-label="Eigene Farbe"></label>
    </div>
    <div class="pp-h">${K.label} <span class="pp-val"></span></div>
    <div class="pp-widths">${K.presets.map((w) => `<button type="button" class="pp-w" data-w="${w}" aria-label="${K.label} ${w}"><i style="--w:${dot(w)}px"></i></button>`).join('')}</div>
    <input class="pp-range" type="range" min="${K.range[0]}" max="${K.range[1]}" step="${kind === 'pen' ? .1 : 1}" aria-label="${K.label}">
    ${kind === 'text'
      ? '<div class="pp-prev pp-text">Abc 123</div>'
      : `<svg class="pp-prev" viewBox="0 0 200 40" aria-hidden="true"><path d="M10 28 C 50 4, 80 4, 100 20 S 150 36, 190 12" fill="none" stroke-linecap="round" ${kind === 'marker' ? `opacity="${MARKER_ALPHA}"` : ''}/></svg>`}`;
  document.body.appendChild(el);
  const own = el.querySelector('input[type=color]'), range = el.querySelector('.pp-range'), prev = el.querySelector('.pp-prev');

  function show() {
    el.querySelectorAll('.pp-c').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === p.c.toLowerCase()));
    el.querySelectorAll('.pp-w').forEach((b) => b.classList.toggle('on', +b.dataset.w === p.w));
    if (/^#[0-9a-f]{6}$/i.test(p.c)) own.value = p.c;
    range.value = p.w;
    el.querySelector('.pp-val').textContent = p.w.toLocaleString('de-AT', { maximumFractionDigits: 1 });
    if (kind === 'text') Object.assign(prev.style, { color: p.c, fontSize: Math.min(40, p.w) + 'px' });
    else { prev.firstElementChild.setAttribute('stroke', p.c); prev.firstElementChild.setAttribute('stroke-width', Math.min(30, p.w * (kind === 'marker' ? .9 : 1.3))); }
  }
  const set = (patch) => { Object.assign(p, patch); show(); onChange({ ...p }); };
  show();

  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]'), w = e.target.closest('[data-w]');
    if (c) set({ c: safeColor(c.dataset.c, p.c) });
    if (w) set({ w: clampSize(kind, w.dataset.w) });
  });
  own.addEventListener('input', () => set({ c: safeColor(own.value, p.c) }));
  range.addEventListener('input', () => set({ w: clampSize(kind, range.value) }));

  // unter dem Knopf, sonst darüber; außerhalb tippen schließt
  const r = btn.getBoundingClientRect(), m = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left + r.width / 2 - m.width / 2, window.innerWidth - m.width - 8)) + 'px';
  el.style.top = (r.bottom + 8 + m.height < window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - m.height - 8)) + 'px';
  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) close(); };
  const close = () => { el.remove(); document.removeEventListener('pointerdown', outside, true); onClose?.(); };
  document.addEventListener('pointerdown', outside, true);
  return close;
}
