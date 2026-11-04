// Handschrift: Bild zuschneiden – ganzes Bild blass, Ausschnitt hell, Griffe an den Ecken
import { cropOf, fullRect, imageSource } from './ink-draw.js';

const MIN = .04;   // kleinster Ausschnitt (Anteil des Bildes)

// layer: Ebene (Einheiten × scale); curScale(): aktueller Maßstab beim Ziehen; onDone(cr | null)
export function startCrop({ layer, item, bmp, scale, curScale, onDone }) {
  const [fx, fy, fw, fh] = fullRect(item);
  let r = [...cropOf(item)];
  const el = document.createElement('div');
  el.className = 'ink-crop';
  el.innerHTML = `<canvas class="ink-crop-dim"></canvas>
    <div class="ink-crop-box"><div class="ink-crop-win"><canvas></canvas></div>${['nw', 'ne', 'sw', 'se'].map((h) => `<i data-h="${h}"></i>`).join('')}
      <div class="ink-crop-bar">
        <button type="button" data-c="full">Ganzes Bild</button>
        <button type="button" data-c="cancel">Abbrechen</button>
        <button type="button" data-c="ok" class="on">Fertig</button>
      </div>
    </div>`;
  const box = el.querySelector('.ink-crop-box');
  const [dim, lit] = el.querySelectorAll('canvas');

  // ganzes Bild (mit radierten Stellen) zweimal: blass darunter, hell im Ausschnitt
  const src = imageSource(item, bmp);
  const k = Math.min(1, 2048 / Math.max(src.width, src.height));
  for (const cv of [dim, lit]) {
    cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  }

  // Größe im Maßstab der Ebene (ändert sich, wenn die Zeichenfläche nach dem Zoomen neu aufgebaut wird)
  function rescale(s) {
    scale = s;
    Object.assign(el.style, { left: fx * s + 'px', top: fy * s + 'px', width: fw * s + 'px', height: fh * s + 'px' });
    for (const cv of [dim, lit]) Object.assign(cv.style, { width: fw * s + 'px', height: fh * s + 'px' });
    place();
  }

  function place() {
    const [l, t, rr, b] = r.map((v, i) => v * (i % 2 ? fh : fw) * scale);
    Object.assign(box.style, { left: l + 'px', top: t + 'px', width: rr - l + 'px', height: b - t + 'px' });
    lit.style.translate = `${-l}px ${-t}px`;
  }
  rescale(scale);
  layer.appendChild(el);

  // Ziehen: Ecke verändert den Ausschnitt, Inneres verschiebt ihn
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target.closest('button')) return;
    const h = e.target.closest('[data-h]')?.dataset.h || (e.target.closest('.ink-crop-box') ? 'move' : null);
    if (!h) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
    drag = { id: e.pointerId, h, x: e.clientX, y: e.clientY, r0: [...r] };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = curScale(), du = (e.clientX - drag.x) / (fw * s), dv = (e.clientY - drag.y) / (fh * s);
    const [a, b, c, d] = drag.r0;
    if (drag.h === 'move') {
      const mu = Math.max(-a, Math.min(1 - c, du)), mv = Math.max(-b, Math.min(1 - d, dv));
      r = [a + mu, b + mv, c + mu, d + mv];
    } else {
      r = [...drag.r0];
      if (drag.h.includes('w')) r[0] = Math.max(0, Math.min(c - MIN, a + du));
      if (drag.h.includes('e')) r[2] = Math.min(1, Math.max(a + MIN, c + du));
      if (drag.h.includes('n')) r[1] = Math.max(0, Math.min(d - MIN, b + dv));
      if (drag.h.includes('s')) r[3] = Math.min(1, Math.max(b + MIN, d + dv));
    }
    place();
  });
  const up = (e) => { if (drag?.id === e.pointerId) drag = null; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

  let done = false;
  const finish = (result) => {
    if (done) return;
    done = true;
    el.remove();
    onDone(result);
  };
  el.querySelector('.ink-crop-bar').addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'full') { r = [0, 0, 1, 1]; place(); }
    else if (c === 'cancel') finish(null);
    else if (c === 'ok') finish(r);
  });
  return { apply: () => finish(r), cancel: () => finish(null), rescale };
}
