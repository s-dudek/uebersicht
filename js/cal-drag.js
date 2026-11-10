// Kalender (Tag/Woche): Termine ziehen = verschieben (auch auf einen anderen Tag),
// am unteren Rand ziehen = länger/kürzer. Maus: sobald sie sich bewegt; Touch: erst nach langem Drücken
// (sonst scrollt die Ansicht). Ziehbar sind eigene App-Termine und Termine aus beschreibbaren Google-Kalendern.
import { $app, itemById, toast } from './core.js';
import { hm } from './calendar.js';
import { extOcc, reloadGoogle } from './cal-sources.js';
import { saveItem } from './data.js';
import { moveGoogle } from './google-cal.js';
import { render } from './render.js';

const STEP = 15;      // Raster beim Ziehen (Minuten)
const MIN_DUR = 15;   // kürzeste Dauer
const LAST = 1439;    // spätestes Ende (23:59)
const HOLD = 380;     // Touch: so lange drücken, dann ziehen (ms)
const SLOP = 6;       // so weit (Punkte) darf sich der Zeiger vorher bewegen

let g = null;         // laufendes Ziehen
let quietUntil = 0;   // kurz nach dem Ziehen: kein Klick, kein Wischen

export const calDragBusy = () => !!g?.active || Date.now() < quietUntil;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initCalDrag() {
  $app.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', () => finish(false));
  // Touch: nach dem langen Drücken darf die Ansicht nicht mehr scrollen
  document.addEventListener('touchmove', (e) => { if (g?.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('click', (e) => { if (Date.now() < quietUntil) { e.preventDefault(); e.stopPropagation(); } }, true);
  $app.addEventListener('contextmenu', (e) => { if (g?.touch) e.preventDefault(); });
}

function down(e) {
  const el = e.target.closest('.cblk[data-mv]');
  if (!el || e.button > 0) return;
  const col = el.closest('.tcol');
  const st = +el.dataset.st, en = +el.dataset.en;
  g = { el, col, day: col.dataset.slotday, mode: e.target.closest('.cblk-rs') ? 'size' : 'move', pid: e.pointerId,
    sx: e.clientX, sy: e.clientY, st0: st, en0: en, st, en, touch: e.pointerType !== 'mouse', active: false };
  g.day0 = g.day;
  if (g.touch) g.timer = setTimeout(activate, HOLD);
}

function activate() {
  if (!g) return;
  g.active = true;
  render.hold = true;   // während des Ziehens nicht neu zeichnen
  g.el.classList.add('moving');
  navigator.vibrate?.(10);
}

function move(e) {
  if (!g || e.pointerId !== g.pid) return;
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (!g.active) {
    if (Math.hypot(dx, dy) < SLOP) return;
    if (g.touch) return finish(false);   // vor dem langen Drücken bewegt: die Ansicht scrollt
    activate();
  }
  e.preventDefault();
  const perMin = g.col.getBoundingClientRect().height / 1440;
  const d = Math.round(dy / perMin / STEP) * STEP;
  if (g.mode === 'size') g.en = clamp(g.en0 + d, g.st0 + MIN_DUR, LAST);
  else {
    const dur = g.en0 - g.st0;
    g.st = clamp(g.st0 + d, 0, LAST - dur);
    g.en = g.st + dur;
    const col = colAt(e.clientX);
    if (col && col !== g.el.parentElement) col.appendChild(g.el);
    g.day = g.el.parentElement.dataset.slotday;
  }
  paint();
}

// Tagesspalte unter dem Zeiger (nur waagrecht, die Höhe ist egal)
function colAt(x) {
  return [...g.col.parentElement.querySelectorAll('.tcol')].find((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
}

function paint() {
  const s = g.el.style;
  s.top = `${(g.st / 1440) * 100}%`;
  s.height = `calc(${((g.en - g.st) / 1440) * 100}% - 2px)`;
  s.left = '1px';
  s.width = 'calc(100% - 3px)';
  const t = g.el.querySelector('small');
  if (t) t.textContent = `${hm(g.st)}–${hm(g.en)}`;
}

function up(e) {
  if (g && e.pointerId === g.pid) finish(g.active);
}

function finish(apply) {
  if (!g) return;
  const d = g; g = null;
  clearTimeout(d.timer);
  if (!d.active) return;
  quietUntil = Date.now() + 400;
  render.hold = false;
  render.pending = false;
  const changed = d.st !== d.st0 || d.en !== d.en0 || d.day !== d.day0;
  if (apply && changed) save(d.el.dataset.mv, d); else render();
}

async function save(ref, d) {
  const [kind, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  if (kind === 'ev') {
    const it = itemById(id);
    if (!it) return render();
    const meta = { ...it.meta, time: hm(d.st) };
    if (d.mode === 'size' || it.meta?.end) meta.end = hm(d.en);   // ohne eigenes Ende bleibt es bei 1 Stunde
    return saveItem(id, { due_date: d.day, meta });
  }
  const o = extOcc(id);
  if (!o?.gcal) return render();
  try {
    await moveGoogle(o, d.day, hm(d.st), hm(d.en));
    await reloadGoogle(o.gcal);
  } catch (err) {
    toast('Google: ' + err.message, 5000);
    render();
  }
}
