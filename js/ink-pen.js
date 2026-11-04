// Handschrift: Fenster für Farbe und Stärke – für Stift (auch Formen und Bemaßung) und Textmarker;
// bei Text statt der Größe Schriftart, Schriftschnitt und kursiv
import { safeColor } from './core.js';
import { fontCss, FONTS, MARKER_ALPHA, WEIGHTS } from './ink-draw.js';

export const PALETTE = [
  '#0C3741', '#4E7569', '#7FA08A', '#A8BEA7', '#3E7CA8', '#7FB2D9', '#7A5AA6', '#B48FD1',
  '#C2575A', '#E58C9B', '#D9873E', '#C9A227', '#F2D33B', '#8A6A4A', '#6E8582', '#FFFFFF',
];

// je Art: Bezeichnung, kleinster/größter Wert, Vorschläge, Vorgabe
export const KINDS = {
  pen: { label: 'Strichstärke', range: [.6, 16], presets: [1, 2.2, 4, 7, 12], def: 2.2 },
  marker: { label: 'Breite', range: [4, 40], presets: [8, 12, 16, 24, 32], def: 16 },
};

// Schrift prüfen (gespeicherte Einstellung): bekannte Schriftart, ein Schnitt, den es dafür gibt
export function cleanText(t) {
  const ff = FONTS[t?.ff] ? t.ff : 'sans';
  const ws = FONTS[ff].weights;
  const fw = ws.reduce((a, b) => (Math.abs(b - (t?.fw || 400)) < Math.abs(a - (t?.fw || 400)) ? b : a));
  return { c: safeColor(t?.c, PALETTE[0]), ff, fw, i: !!t?.i };
}

export function clampSize(kind, v) {
  const k = KINDS[kind];
  return Math.min(k.range[1], Math.max(k.range[0], Number.isFinite(+v) && +v ? +v : k.def));
}

// kind: 'pen' | 'marker' | 'text'; val: { c, w } bzw. bei Text { c, ff, fw, i };
// onChange(neuer Wert) bei jeder Änderung, onClose() beim Schließen
export function openPenPanel(btn, kind, val, onChange, onClose) {
  document.querySelector('.ink-penpanel')?.remove();
  const isText = kind === 'text';
  const K = KINDS[kind];
  const p = isText ? cleanText(val) : { c: safeColor(val.c, PALETTE[0]), w: clampSize(kind, val.w) };
  const dot = (w) => Math.max(2, Math.min(26, w * (kind === 'marker' ? .7 : 1.4)));
  // Text: Schriftart, Schriftschnitte der gewählten Schrift, kursiv
  const textHtml = () => `
    <div class="pp-h">Schriftart</div>
    <div class="pp-chips">${Object.entries(FONTS).map(([k, f]) => `<button type="button" class="pp-chip ${p.ff === k ? 'on' : ''}" data-ff="${k}" style="font-family:${f.css}">${f.label}</button>`).join('')}</div>
    <div class="pp-h">Schriftschnitt</div>
    <div class="pp-chips">${FONTS[p.ff].weights.map((w) => `<button type="button" class="pp-chip ${p.fw === w ? 'on' : ''}" data-fw="${w}" style="font-family:${FONTS[p.ff].css};font-weight:${w}">${WEIGHTS[w]}</button>`).join('')}
      <button type="button" class="pp-chip ${p.i ? 'on' : ''}" data-it style="font-family:${FONTS[p.ff].css};font-style:italic">Kursiv</button></div>
    <div class="pp-prev pp-text">Abc 123</div>`;
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
    <div class="pp-more">${isText ? textHtml() : `
    <div class="pp-h">${K.label} <span class="pp-val"></span></div>
    <div class="pp-widths">${K.presets.map((w) => `<button type="button" class="pp-w" data-w="${w}" aria-label="${K.label} ${w}"><i style="--w:${dot(w)}px"></i></button>`).join('')}</div>
    <input class="pp-range" type="range" min="${K.range[0]}" max="${K.range[1]}" step="${kind === 'pen' ? .1 : 1}" aria-label="${K.label}">
    <svg class="pp-prev" viewBox="0 0 200 40" aria-hidden="true"><path d="M10 28 C 50 4, 80 4, 100 20 S 150 36, 190 12" fill="none" stroke-linecap="round" ${kind === 'marker' ? `opacity="${MARKER_ALPHA}"` : ''}/></svg>`}</div>`;
  document.body.appendChild(el);
  const own = el.querySelector('input[type=color]');

  function show() {
    el.querySelectorAll('.pp-c').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === p.c.toLowerCase()));
    if (/^#[0-9a-f]{6}$/i.test(p.c)) own.value = p.c;
    const prev = el.querySelector('.pp-prev');
    if (isText) { Object.assign(prev.style, { color: p.c, font: fontCss({ ...p, fs: 28 }) }); return; }
    el.querySelectorAll('.pp-w').forEach((b) => b.classList.toggle('on', +b.dataset.w === p.w));
    el.querySelector('.pp-range').value = p.w;
    el.querySelector('.pp-val').textContent = p.w.toLocaleString('de-AT', { maximumFractionDigits: 1 });
    prev.firstElementChild.setAttribute('stroke', p.c);
    prev.firstElementChild.setAttribute('stroke-width', Math.min(30, p.w * (kind === 'marker' ? .9 : 1.3)));
  }
  const set = (patch) => {
    Object.assign(p, isText ? cleanText({ ...p, ...patch }) : patch);
    if (isText && (patch.ff || patch.fw || 'i' in patch)) el.querySelector('.pp-more').innerHTML = textHtml();   // Schnitte der neuen Schrift
    show();
    onChange({ ...p });
  };
  show();

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.c) set({ c: safeColor(b.dataset.c, p.c) });
    else if (b.dataset.w) set({ w: clampSize(kind, b.dataset.w) });
    else if (b.dataset.ff) set({ ff: b.dataset.ff });
    else if (b.dataset.fw) set({ fw: +b.dataset.fw });
    else if ('it' in b.dataset) set({ i: !p.i });
  });
  own.addEventListener('input', () => set({ c: safeColor(own.value, p.c) }));
  el.querySelector('.pp-range')?.addEventListener('input', (e) => set({ w: clampSize(kind, e.target.value) }));

  // unter dem Knopf, sonst darüber; außerhalb tippen schließt
  const r = btn.getBoundingClientRect(), m = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left + r.width / 2 - m.width / 2, window.innerWidth - m.width - 8)) + 'px';
  el.style.top = (r.bottom + 8 + m.height < window.innerHeight - 8 ? r.bottom + 8 : Math.max(8, r.top - m.height - 8)) + 'px';
  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) close(); };
  const close = () => { el.remove(); document.removeEventListener('pointerdown', outside, true); onClose?.(); };
  document.addEventListener('pointerdown', outside, true);
  return close;
}
