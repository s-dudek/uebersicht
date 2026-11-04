// Handschrift: Fenster für Farbe und Strichstärke des Stifts (auch für Formen und Bemaßung)
import { safeColor } from './core.js';

export const PALETTE = [
  '#0C3741', '#4E7569', '#7FA08A', '#A8BEA7', '#3E7CA8', '#7FB2D9', '#7A5AA6', '#B48FD1',
  '#C2575A', '#E58C9B', '#D9873E', '#C9A227', '#8A6A4A', '#6E8582', '#9AA5A3', '#FFFFFF',
];
export const WIDTH = [.6, 16];            // dünnste und dickste Strichstärke
const PRESETS = [1, 2.2, 4, 7, 12];

export const clampWidth = (w) => Math.min(WIDTH[1], Math.max(WIDTH[0], Number.isFinite(+w) ? +w : 2.2));

// pen: { c, w }; onChange({ c, w }) bei jeder Änderung, onClose() beim Schließen
export function openPenPanel(btn, pen, onChange, onClose) {
  document.querySelector('.ink-penpanel')?.remove();
  const p = { c: safeColor(pen.c, PALETTE[0]), w: clampWidth(pen.w) };
  const el = document.createElement('div');
  el.className = 'cmenu ink-penpanel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Stift einstellen');
  el.innerHTML = `
    <div class="pp-h">Farbe</div>
    <div class="pp-colors">
      ${PALETTE.map((c) => `<button type="button" class="pp-c" data-c="${c}" style="--c:${c}" aria-label="Farbe ${c}"></button>`).join('')}
      <label class="pp-own" title="Eigene Farbe"><input type="color" aria-label="Eigene Farbe"></label>
    </div>
    <div class="pp-h">Strichstärke <span class="pp-val"></span></div>
    <div class="pp-widths">${PRESETS.map((w) => `<button type="button" class="pp-w" data-w="${w}" aria-label="Stärke ${w}"><i style="--w:${Math.max(1.5, w * 1.4)}px"></i></button>`).join('')}</div>
    <input class="pp-range" type="range" min="${WIDTH[0]}" max="${WIDTH[1]}" step=".1" aria-label="Strichstärke">
    <svg class="pp-prev" viewBox="0 0 200 40" aria-hidden="true"><path d="M10 28 C 50 4, 80 4, 100 20 S 150 36, 190 12" fill="none" stroke-linecap="round"/></svg>`;
  document.body.appendChild(el);
  const own = el.querySelector('input[type=color]'), range = el.querySelector('.pp-range'), path = el.querySelector('.pp-prev path');

  function show() {
    el.querySelectorAll('.pp-c').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === p.c.toLowerCase()));
    el.querySelectorAll('.pp-w').forEach((b) => b.classList.toggle('on', +b.dataset.w === p.w));
    own.value = p.c;
    range.value = p.w;
    el.querySelector('.pp-val').textContent = p.w.toLocaleString('de-AT', { maximumFractionDigits: 1 });
    path.setAttribute('stroke', p.c);
    path.setAttribute('stroke-width', p.w * 1.3);
  }
  const set = (patch) => { Object.assign(p, patch); show(); onChange({ ...p }); };
  show();

  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]'), w = e.target.closest('[data-w]');
    if (c) set({ c: safeColor(c.dataset.c, p.c) });
    if (w) set({ w: clampWidth(w.dataset.w) });
  });
  own.addEventListener('input', () => set({ c: safeColor(own.value, p.c) }));
  range.addEventListener('input', () => set({ w: clampWidth(range.value) }));

  // unter dem Knopf, sonst darüber; außerhalb tippen schließt
  const r = btn.getBoundingClientRect(), m = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left + r.width / 2 - m.width / 2, window.innerWidth - m.width - 8)) + 'px';
  el.style.top = (r.bottom + 8 + m.height < window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - m.height - 8)) + 'px';
  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) close(); };
  const close = () => { el.remove(); document.removeEventListener('pointerdown', outside, true); onClose?.(); };
  document.addEventListener('pointerdown', outside, true);
  return close;
}
